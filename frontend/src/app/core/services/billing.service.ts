import { Injectable, signal, computed } from "@angular/core";
import { CartItem, SaleTransaction, HeldBill, TenderPayment } from "../models/cart.model";
import { CatalogItem } from "../models/item.model";
import { OfflineStorageService } from "./offline-storage.service";
import { CatalogService } from "./catalog.service";
import { AuthService } from "./auth.service";

@Injectable({ providedIn: "root" })
export class BillingService {
  private readonly HELD_BILLS_KEY = "pos_held_bills_v2";
  private readonly SALES_HISTORY_KEY = "pos_sales_history_v2";
  private readonly INVOICE_SEQ_KEY = "pos_invoice_seq";

  cart = signal<CartItem[]>([]);
  heldBills = signal<HeldBill[]>(this.loadHeldBills());
  salesHistory = signal<SaleTransaction[]>(this.loadSalesHistory());
  taxMode = signal<"exclusive" | "inclusive">("exclusive");
  billDiscount = signal<{ type: "flat" | "pct"; value: number }>({ type: "flat", value: 0 });

  cartCount = computed(() => this.cart().reduce((acc, i) => acc + (i.pricingMethod === "weight" ? 1 : i.qty), 0));

  subtotal = computed(() => this.cart().reduce((acc, i) => acc + (i.price * i.qty), 0));

  itemDiscountTotal = computed(() => {
    return this.cart().reduce((acc, i) => {
      if (i.discountType === "flat") return acc + (i.discountValue || 0);
      if (i.discountType === "pct") return acc + ((i.price * i.qty) * (i.discountValue || 0) / 100);
      return acc;
    }, 0);
  });

  billDiscountAmount = computed(() => {
    const disc = this.billDiscount();
    const base = Math.max(0, this.subtotal() - this.itemDiscountTotal());
    if (disc.type === "flat") return Math.min(base, disc.value);
    if (disc.type === "pct") return (base * disc.value) / 100;
    return 0;
  });

  totalDiscount = computed(() => this.itemDiscountTotal() + this.billDiscountAmount());

  taxTotal = computed(() => {
    return this.cart().reduce((acc, item) => {
      const taxable = Math.max(0, (item.price * item.qty) - (item.discountType === "flat" ? (item.discountValue || 0) : item.discountType === "pct" ? ((item.price * item.qty) * (item.discountValue || 0) / 100) : 0));
      if (this.taxMode() === "inclusive") {
        return acc + (taxable - (taxable / (1 + item.taxRate / 100)));
      } else {
        return acc + (taxable * (item.taxRate / 100));
      }
    }, 0);
  });

  grandTotal = computed(() => {
    if (this.taxMode() === "inclusive") {
      return Math.max(0, this.subtotal() - this.totalDiscount());
    } else {
      return Math.max(0, this.subtotal() - this.totalDiscount() + this.taxTotal());
    }
  });

  roundedTotal = computed(() => Math.round(this.grandTotal()));
  roundOff = computed(() => +(this.roundedTotal() - this.grandTotal()).toFixed(2));

  constructor(
    private storage: OfflineStorageService,
    private catalogService: CatalogService,
    private authService: AuthService
  ) {}

  private loadHeldBills(): HeldBill[] {
    return this.storage.getItem<HeldBill[]>(this.HELD_BILLS_KEY, []);
  }

  private loadSalesHistory(): SaleTransaction[] {
    return this.storage.getItem<SaleTransaction[]>(this.SALES_HISTORY_KEY, []);
  }

  generateInvoiceNumber(): string {
    const currentSeq = this.storage.getItem<number>(this.INVOICE_SEQ_KEY, 1001);
    this.storage.setItem(this.INVOICE_SEQ_KEY, currentSeq + 1);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `INV-${dateStr}-${currentSeq}`;
  }

  addItemToCart(item: CatalogItem, qty: number = 1): void {
    const existing = this.cart().find(c => c.sku === item.sku);
    if (existing && item.pricingMethod !== "weight") {
      this.updateQty(item.sku, existing.qty + qty);
    } else {
      const taxable = item.price * qty;
      const taxAmt = this.taxMode() === "inclusive" 
        ? taxable - (taxable / (1 + item.tax / 100))
        : taxable * (item.tax / 100);

      const cartItem: CartItem = {
        sku: item.sku,
        barcode: item.barcode,
        name: item.name,
        category: item.category,
        price: item.price,
        taxRate: item.tax,
        taxType: this.taxMode(),
        taxAmount: +taxAmt.toFixed(2),
        qty: qty,
        lineTotal: +(taxable + (this.taxMode() === "exclusive" ? taxAmt : 0)).toFixed(2),
        pricingMethod: item.pricingMethod,
        unit: item.unit
      };
      this.cart.set([...this.cart(), cartItem]);
    }
  }

  updateQty(sku: string, newQty: number): void {
    if (newQty <= 0) {
      this.removeItem(sku);
      return;
    }
    const updated = this.cart().map(item => {
      if (item.sku === sku) {
        const taxable = item.price * newQty;
        const taxAmt = this.taxMode() === "inclusive" 
          ? taxable - (taxable / (1 + item.taxRate / 100))
          : taxable * (item.taxRate / 100);
        return {
          ...item,
          qty: newQty,
          taxAmount: +taxAmt.toFixed(2),
          lineTotal: +(taxable + (this.taxMode() === "exclusive" ? taxAmt : 0)).toFixed(2)
        };
      }
      return item;
    });
    this.cart.set(updated);
  }

  removeItem(sku: string): void {
    this.cart.set(this.cart().filter(i => i.sku !== sku));
  }

  clearCart(): void {
    this.cart.set([]);
    this.billDiscount.set({ type: "flat", value: 0 });
  }

  holdCurrentBill(refName: string = "Customer"): void {
    if (this.cart().length === 0) return;
    const newHeld: HeldBill = {
      id: `hold-${Date.now()}`,
      referenceName: refName,
      savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      cashier: this.authService.currentUser().fullName,
      itemCount: this.cartCount(),
      total: this.roundedTotal(),
      cart: [...this.cart()]
    };
    const updated = [newHeld, ...this.heldBills()];
    this.heldBills.set(updated);
    this.storage.setItem(this.HELD_BILLS_KEY, updated);
    this.clearCart();
  }

  recallHeldBill(id: string): void {
    const held = this.heldBills().find(h => h.id === id);
    if (held) {
      this.cart.set(held.cart);
      const remaining = this.heldBills().filter(h => h.id !== id);
      this.heldBills.set(remaining);
      this.storage.setItem(this.HELD_BILLS_KEY, remaining);
    }
  }

  completeCheckout(tenders: TenderPayment[], changeDue: number = 0): SaleTransaction {
    const invoiceNo = this.generateInvoiceNumber();
    const transaction: SaleTransaction = {
      id: `sale-${Date.now()}`,
      invoiceNo,
      timestamp: new Date().toISOString(),
      cashierName: this.authService.currentUser().fullName,
      items: [...this.cart()],
      subtotal: this.subtotal(),
      discountTotal: this.totalDiscount(),
      taxTotal: this.taxTotal(),
      grandTotal: this.grandTotal(),
      roundedTotal: this.roundedTotal(),
      roundOff: this.roundOff(),
      tendered: tenders,
      changeDue,
      status: "COMPLETED"
    };

    // Deduct stock for each cart item
    this.cart().forEach(c => {
      this.catalogService.deductStock(c.sku, c.qty);
    });

    const updated = [transaction, ...this.salesHistory()];
    this.salesHistory.set(updated);
    this.storage.setItem(this.SALES_HISTORY_KEY, updated);
    this.clearCart();
    return transaction;
  }
}
