import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { OfflineDbService } from '../../services/offline-db.service';

export interface CartLine {
  sku: string;
  name: string;
  price: number;
  mrp?: number;
  wholesalePrice?: number;
  priceType?: 'mrp' | 'wholesale';
  tax: number;
  qty: number;
  unit: string;
  pricingMethod: 'qty' | 'weight';
}

export interface Tender {
  mode: 'Cash' | 'Card' | 'UPI';
  amount: number;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pos.component.html'
})
export class PosComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);
  offlineDb = inject(OfflineDbService);
  route = inject(ActivatedRoute);

  catalog = signal<CatalogItem[]>([]);
  categories = signal<string[]>([]);
  activeCategory = signal<string>('All');
  scanInput = '';
  pricingMode: 'exclusive' | 'inclusive' = 'exclusive';

  cart = signal<CartLine[]>([]);
  manualDiscount = signal<{ type: 'percent' | 'flat'; value: number; approved: boolean }>({
    type: 'percent',
    value: 0,
    approved: true
  });

  // Price List state
  priceListMode: 'mrp' | 'wholesale' = 'mrp';
  tempPriceListMode: 'mrp' | 'wholesale' = 'mrp';

  // Modal States
  showDiscountModal = false;
  showApprovalModal = false;
  showPriceListModal = false;
  showScaleModal = false;
  showPaymentModal = false;
  showReceiptModal = false;

  // Discount form
  discType: 'percent' | 'flat' = 'percent';
  discValue = 0;
  approvalPin = '';

  // Scale modal form
  pendingScaleSku: string | null = null;
  manualWeightInput: number | null = null;
  scaleConnected = false;
  scaleReadingText = '— kg';

  // Payment form
  tenders: Tender[] = [{ mode: 'Cash', amount: 0 }];
  activeTenderIndex = 0;

  // Last Sale / Receipt
  lastSale: any = null;
  toastMessage: string | null = null;
  isCompletingSale = false;
  isHoldingBill = false;

  async ngOnInit() {
    await this.loadData();

    // Check query params for recalled bill
    this.route.queryParams.subscribe(async (params) => {
      if (params['recall']) {
        const heldId = params['recall'];
        const heldList = await this.offlineDb.getHeldBills();
        const found = heldList.find((h) => h.id === heldId);
        if (found) {
          this.cart.set(found.lines || []);
          if (found.discount) this.manualDiscount.set(found.discount);
          await this.offlineDb.removeHeldBill(heldId);
          this.triggerToast('Recalled parked bill');
        }
      }
    });
  }

  async loadData() {
    const items = await this.api.getCatalog();
    this.catalog.set(items);
    const cats = await this.api.getCategories();
    this.categories.set(['All', ...cats]);
  }

  filteredCatalog(): CatalogItem[] {
    const cat = this.activeCategory();
    const term = this.scanInput.trim().toLowerCase();
    return this.catalog().filter((item) => {
      const matchCat = cat === 'All' || item.category === cat;
      const matchTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        item.barcode.includes(term);
      return matchCat && matchTerm;
    });
  }

  onScanKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const term = this.scanInput.trim();
    if (!term) return;
    const item = this.catalog().find(
      (i) => i.barcode === term || i.sku.toLowerCase() === term.toLowerCase()
    );
    if (item) {
      this.addToCart(item.sku);
      this.scanInput = '';
      if (item.pricingMethod !== 'weight') {
        this.triggerToast(`${item.name} added`);
      }
    } else {
      this.triggerToast(`No item matches "${term}"`);
    }
  }

  getItemPrice(item: CatalogItem): number {
    return this.priceListMode === 'wholesale' ? (item.wholesalePrice ?? item.price) : item.price;
  }

  setLinePriceType(line: CartLine, type: 'mrp' | 'wholesale') {
    line.priceType = type;
    line.price = type === 'wholesale' ? (line.wholesalePrice ?? line.mrp ?? line.price) : (line.mrp ?? line.price);
    this.cart.set([...this.cart()]);
    this.triggerToast(`${line.name} switched to ${type === 'wholesale' ? 'Wholesale' : 'MRP'}`);
  }

  toggleLinePriceType(line: CartLine) {
    const nextType: 'mrp' | 'wholesale' = line.priceType === 'wholesale' ? 'mrp' : 'wholesale';
    this.setLinePriceType(line, nextType);
  }

  openPriceListModal() {
    this.tempPriceListMode = this.priceListMode;
    this.showPriceListModal = true;
  }

  applyPriceList() {
    this.priceListMode = this.tempPriceListMode;
    const currentCart = this.cart().map((line) => {
      const item = this.catalog().find((i) => i.sku === line.sku);
      const mrp = item ? item.price : (line.mrp ?? line.price);
      const wholesale = item ? (item.wholesalePrice ?? item.price) : (line.wholesalePrice ?? line.price);
      const p = this.priceListMode === 'wholesale' ? wholesale : mrp;
      return { ...line, price: p, mrp, wholesalePrice: wholesale, priceType: this.priceListMode };
    });
    this.cart.set(currentCart);
    this.showPriceListModal = false;
    this.triggerToast(`Price list switched to ${this.priceListMode === 'wholesale' ? 'Wholesale' : 'MRP'}`);
  }

  addToCart(sku: string) {
    const item = this.catalog().find((i) => i.sku === sku);
    if (!item || item.stock <= 0) {
      this.triggerToast('Item unavailable');
      return;
    }
    if (item.pricingMethod === 'weight') {
      this.openScaleModal(sku);
      return;
    }
    const currentCart = [...this.cart()];
    const line = currentCart.find((l) => l.sku === sku);
    if (line) {
      if (line.qty + 1 > item.stock) {
        this.triggerToast(`Only ${item.stock} in stock`);
        return;
      }
      line.qty += 1;
    } else {
      const mrp = item.price;
      const wholesale = item.wholesalePrice ?? item.price;
      const pType: 'mrp' | 'wholesale' = this.priceListMode === 'wholesale' ? 'wholesale' : 'mrp';
      const activePrice = pType === 'wholesale' ? wholesale : mrp;
      currentCart.push({
        sku: item.sku,
        name: item.name,
        price: activePrice,
        mrp,
        wholesalePrice: wholesale,
        priceType: pType,
        tax: item.tax,
        qty: 1,
        unit: item.unit || 'pcs',
        pricingMethod: 'qty'
      });
    }
    this.cart.set(currentCart);
  }

  changeQty(sku: string, delta: number) {
    const currentCart = [...this.cart()];
    const line = currentCart.find((l) => l.sku === sku);
    if (!line) return;
    const item = this.catalog().find((i) => i.sku === sku);
    const next = line.qty + delta;
    if (next <= 0) {
      this.cart.set(currentCart.filter((l) => l.sku !== sku));
    } else if (item && next > item.stock) {
      this.triggerToast(`Only ${item.stock} in stock`);
    } else {
      line.qty = next;
      this.cart.set(currentCart);
    }
  }

  removeLine(sku: string) {
    this.cart.set(this.cart().filter((l) => l.sku !== sku));
  }

  // --- Calculations ---
  calcSubtotal(): number {
    return this.cart().reduce((sum, l) => sum + l.price * l.qty, 0);
  }

  calcDiscountAmount(): number {
    const sub = this.calcSubtotal();
    const disc = this.manualDiscount();
    if (!disc.approved || !disc.value) return 0;
    if (disc.type === 'percent') return (sub * disc.value) / 100;
    return Math.min(disc.value, sub);
  }

  calcTaxable(): number {
    const net = this.calcSubtotal() - this.calcDiscountAmount();
    if (this.pricingMode === 'inclusive') {
      return this.cart().reduce((sum, l) => {
        const rate = l.tax || 0;
        const lineNet = l.price * l.qty;
        return sum + (rate > 0 ? lineNet / (1 + rate / 100) : lineNet);
      }, 0);
    }
    return net;
  }

  calcGstTotal(): number {
    if (this.pricingMode === 'inclusive') {
      return this.calcSubtotal() - this.calcTaxable();
    }
    return this.cart().reduce((sum, l) => {
      const lineNet = l.price * l.qty;
      return sum + lineNet * ((l.tax || 0) / 100);
    }, 0);
  }

  calcGrandTotal(): number {
    if (this.pricingMode === 'inclusive') {
      return this.calcSubtotal() - this.calcDiscountAmount();
    }
    return this.calcTaxable() + this.calcGstTotal();
  }

  // --- Discount Modals ---
  stageDiscount() {
    const needsApproval =
      (this.discType === 'percent' && this.discValue > 10) ||
      (this.discType === 'flat' && this.discValue > 200);

    if (needsApproval && !this.auth.isAdmin()) {
      this.showDiscountModal = false;
      this.showApprovalModal = true;
    } else {
      this.manualDiscount.set({
        type: this.discType,
        value: this.discValue,
        approved: true
      });
      this.showDiscountModal = false;
      this.triggerToast('Discount applied');
    }
  }

  approveDiscount() {
    if (this.approvalPin.length < 4) {
      this.triggerToast('Enter Admin PIN');
      return;
    }
    this.manualDiscount.set({
      type: this.discType,
      value: this.discValue,
      approved: true
    });
    this.approvalPin = '';
    this.showApprovalModal = false;
    this.triggerToast('Discount approved & applied');
  }

  clearDiscount() {
    this.manualDiscount.set({ type: 'percent', value: 0, approved: true });
    this.showDiscountModal = false;
    this.triggerToast('Discount removed');
  }

  // --- Scale Modal (FR-P1-HW-002) ---
  openScaleModal(sku: string) {
    this.pendingScaleSku = sku;
    const existing = this.cart().find((l) => l.sku === sku);
    this.manualWeightInput = existing ? existing.qty : null;
    this.scaleReadingText = existing ? `${existing.qty.toFixed(3)} kg` : '— kg';
    this.showScaleModal = true;
  }

  async connectScale() {
    if (!('serial' in navigator)) {
      this.triggerToast('Web Serial API not supported in this browser. Use manual weight entry.');
      return;
    }
    try {
      const port: any = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      this.scaleConnected = true;
      this.triggerToast('Weighing scale connected');
    } catch {
      this.triggerToast('Scale connection cancelled');
    }
  }

  confirmScaleWeight() {
    const sku = this.pendingScaleSku;
    const weight = this.manualWeightInput;
    if (!sku || !weight || weight < 0.001 || weight > 200) {
      this.triggerToast('Enter a valid weight between 1 g and 200 kg');
      return;
    }
    const item = this.catalog().find((i) => i.sku === sku);
    if (!item) return;

    const currentCart = [...this.cart()];
    const line = currentCart.find((l) => l.sku === sku);
    if (line) {
      line.qty = weight;
    } else {
      const mrp = item.price;
      const wholesale = item.wholesalePrice ?? item.price;
      const pType: 'mrp' | 'wholesale' = this.priceListMode === 'wholesale' ? 'wholesale' : 'mrp';
      const activePrice = pType === 'wholesale' ? wholesale : mrp;
      currentCart.push({
        sku: item.sku,
        name: item.name,
        price: activePrice,
        mrp,
        wholesalePrice: wholesale,
        priceType: pType,
        tax: item.tax,
        qty: weight,
        unit: item.unit || 'kg',
        pricingMethod: 'weight'
      });
    }
    this.cart.set(currentCart);
    this.showScaleModal = false;
    this.triggerToast('Weight added to bill');
  }

  // --- Payment Modal ---
  openPayment() {
    if (this.cart().length === 0) {
      this.triggerToast('Add at least one item first');
      return;
    }
    this.tenders = [{ mode: 'Cash', amount: 0 }];
    this.activeTenderIndex = 0;
    this.showPaymentModal = true;
  }

  tenderedSum(): number {
    return this.tenders.reduce((s, t) => s + t.amount, 0);
  }

  remainingDue(): number {
    return Math.max(0, this.calcGrandTotal() - this.tenderedSum());
  }

  changeDue(): number {
    const diff = this.tenderedSum() - this.calcGrandTotal();
    return diff > 0 ? diff : 0;
  }

  setTenderMode(mode: 'Cash' | 'Card' | 'UPI') {
    this.tenders[this.activeTenderIndex].mode = mode;
  }

  numpadPress(key: string) {
    const t = this.tenders[this.activeTenderIndex];
    if (!t) return;
    let cur = t.amount === 0 ? '' : String(t.amount);
    if (key === 'C') t.amount = 0;
    else if (key === 'back') {
      cur = cur.slice(0, -1);
      t.amount = parseFloat(cur || '0');
    } else if (key === 'exact') {
      t.amount = Math.max(0, this.calcGrandTotal() - (this.tenderedSum() - t.amount));
    } else {
      cur += key;
      t.amount = parseFloat(cur);
    }
  }

  addSplitTender() {
    if (this.tenders.length >= 2) {
      this.triggerToast('Maximum of two payment modes per bill');
      return;
    }
    this.tenders.push({ mode: 'Card', amount: this.remainingDue() });
    this.activeTenderIndex = this.tenders.length - 1;
  }

  async completeSale() {
    if (this.isCompletingSale) return;
    if (this.tenderedSum() < this.calcGrandTotal()) {
      this.triggerToast('Amount tendered is short');
      return;
    }

    this.isCompletingSale = true;
    try {
      const subtotal = this.calcSubtotal();
      const discount = this.calcDiscountAmount();
      const taxable = this.calcTaxable();
      const gstTotal = this.calcGstTotal();
      const grandTotal = this.calcGrandTotal();
      const change = this.changeDue();
      const cartCopy = [...this.cart()];
      const tendersCopy = JSON.parse(JSON.stringify(this.tenders));

      const payload = {
        lines: cartCopy,
        pricing_mode: this.pricingMode,
        manual_discount: this.manualDiscount(),
        tenders: tendersCopy,
        grand_total: grandTotal
      };

      const res = await this.api.createSale(payload);

      this.lastSale = {
        invoiceNo: res?.invoiceNo || res?.invoice_no || `INV-FY26-${Math.floor(10000 + Math.random() * 90000)}`,
        timeLabel: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
        pricingMode: this.pricingMode,
        lines: cartCopy,
        subtotal,
        discountTotal: discount,
        taxable,
        gstTotal,
        grandTotal,
        tenders: tendersCopy,
        changeDue: change
      };

      this.cart.set([]);
      this.manualDiscount.set({ type: 'percent', value: 0, approved: true });
      this.showPaymentModal = false;
      this.showReceiptModal = true;
      await this.loadData();
    } catch (err: any) {
      this.triggerToast(err?.error?.detail || err?.message || 'Sale transaction failed');
    } finally {
      this.isCompletingSale = false;
    }
  }

  printReceipt() {
    window.print();
  }

  // --- Hold & Recall ---
  async holdBill() {
    if (this.isHoldingBill) return;
    if (this.cart().length === 0) {
      this.triggerToast('Nothing to hold');
      return;
    }
    this.isHoldingBill = true;
    try {
      const bill = {
        id: `HOLD-${Date.now()}`,
        lines: this.cart(),
        discount: this.manualDiscount(),
        itemCount: this.cart().length,
        total: this.calcGrandTotal(),
        time: new Date().toISOString()
      };
      await this.offlineDb.saveHeldBill(bill);
      try {
        await this.api.holdBill({
          id: bill.id,
          lines: bill.lines,
          discount: bill.discount,
          item_count: bill.itemCount,
          total: bill.total
        });
      } catch {}
      this.cart.set([]);
      this.triggerToast('Bill parked. Recall it from Hold & Recall.');
    } finally {
      this.isHoldingBill = false;
    }
  }

  triggerToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => {
      if (this.toastMessage === msg) this.toastMessage = null;
    }, 3000);
  }
}
