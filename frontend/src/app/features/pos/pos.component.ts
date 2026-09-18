import { Component, inject, OnInit, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { CatalogService } from "../../core/services/catalog.service";
import { BillingService } from "../../core/services/billing.service";
import { AuthService } from "../../core/services/auth.service";
import { CatalogItem } from "../../core/models/item.model";
import { CartItem, TenderPayment, SaleTransaction } from "../../core/models/cart.model";

@Component({
  selector: "app-pos",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pos-screen" style="display:flex;flex-direction:column;height:100vh;overflow:hidden">
      <!-- TOP BAR -->
      <div class="top-bar" style="background:var(--color-surface);border-bottom:1px solid var(--color-border);padding:10px 20px;display:flex;align-items:center;gap:16px">
        <div style="font-weight:700;font-size:18px;color:var(--color-text)">POS Billing Counter</div>
        <div class="badge badge-info">{{ auth.currentUser().role | uppercase }} MODE</div>
        
        <div style="margin-left:auto;display:flex;gap:12px;align-items:center">
          <div class="tax-mode-toggle" style="display:flex;background:var(--color-bg);padding:2px;border-radius:var(--radius-sm);border:1px solid var(--color-border)">
            <button type="button" class="btn btn-sm" [class.btn-primary]="billing.taxMode() === 'exclusive'" [class.btn-ghost]="billing.taxMode() !== 'exclusive'" (click)="billing.taxMode.set('exclusive')">GST Exclusive</button>
            <button type="button" class="btn btn-sm" [class.btn-primary]="billing.taxMode() === 'inclusive'" [class.btn-ghost]="billing.taxMode() !== 'inclusive'" (click)="billing.taxMode.set('inclusive')">GST Inclusive</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="openHoldModal()">
            Hold Bill (F6)
          </button>
          <button type="button" class="btn btn-ghost btn-sm" (click)="billing.clearCart()">
            Clear (Esc)
          </button>
        </div>
      </div>

      <!-- MAIN POS WORKSPACE -->
      <div style="display:flex;flex:1;overflow:hidden">
        <!-- LEFT: CART & BILLING TABLE -->
        <div style="flex:1.4;display:flex;flex-direction:column;border-right:1px solid var(--color-border);background:var(--color-surface)">
          <!-- SCANNER & SEARCH INPUT -->
          <div style="padding:16px;border-bottom:1px solid var(--color-border);display:flex;gap:10px">
            <input type="text" class="form-input" [(ngModel)]="searchQuery" (keyup.enter)="onSearchEnter()" placeholder="Scan Barcode or Search Item / SKU (F2)..." style="font-size:16px;padding:12px" autofocus id="posSearchInput">
            <button type="button" class="btn btn-primary" (click)="onSearchEnter()">Add Item</button>
          </div>

          <!-- CART TABLE -->
          <div style="flex:1;overflow-y:auto;padding:8px">
            <table class="table" *ngIf="billing.cart().length > 0; else emptyCart">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="num">Price (₹)</th>
                  <th class="num">Tax %</th>
                  <th class="num" style="width:120px">Qty</th>
                  <th class="num">Total (₹)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of billing.cart()">
                  <td>
                    <div style="font-weight:600">{{ item.name }}</div>
                    <div class="text-xs text-muted mono">{{ item.sku }} &middot; {{ item.category }}</div>
                  </td>
                  <td class="num mono">₹{{ item.price.toFixed(2) }}</td>
                  <td class="num mono">{{ item.taxRate }}%</td>
                  <td class="num">
                    <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">
                      <button type="button" class="btn btn-ghost btn-sm" (click)="billing.updateQty(item.sku, item.qty - 1)">-</button>
                      <span class="mono font-bold" style="min-width:24px;text-align:center">{{ item.qty }}</span>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="billing.updateQty(item.sku, item.qty + 1)">+</button>
                    </div>
                  </td>
                  <td class="num mono font-bold">₹{{ item.lineTotal.toFixed(2) }}</td>
                  <td style="text-align:right">
                    <button type="button" class="btn btn-ghost btn-sm text-danger" (click)="billing.removeItem(item.sku)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>

            <ng-template #emptyCart>
              <div style="text-align:center;padding:60px 20px;color:var(--color-text-muted)">
                <div style="font-size:48px;margin-bottom:12px">🛒</div>
                <h3>Cart is empty</h3>
                <p class="text-sm">Scan barcode or click items from the quick grid on the right</p>
              </div>
            </ng-template>
          </div>

          <!-- BILL SUMMARY FOOTER -->
          <div style="background:var(--color-bg);border-top:1px solid var(--color-border);padding:16px 20px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px" class="text-sm">
              <span class="text-muted">Subtotal ({{ billing.cartCount() }} items):</span>
              <span class="mono font-semibold">₹{{ billing.subtotal().toFixed(2) }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px" class="text-sm" *ngIf="billing.totalDiscount() > 0">
              <span class="text-muted">Discount Applied:</span>
              <span class="mono text-success">-₹{{ billing.totalDiscount().toFixed(2) }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px" class="text-sm">
              <span class="text-muted">GST Tax Amount:</span>
              <span class="mono">₹{{ billing.taxTotal().toFixed(2) }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px" class="text-sm" *ngIf="billing.roundOff() !== 0">
              <span class="text-muted">Round Off:</span>
              <span class="mono">{{ billing.roundOff() > 0 ? '+' : '' }}₹{{ billing.roundOff().toFixed(2) }}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:8px;border-top:2px dashed var(--color-border);margin-bottom:16px">
              <span style="font-size:18px;font-weight:700">Grand Total:</span>
              <span class="mono font-bold" style="font-size:28px;color:var(--color-primary)">₹{{ billing.roundedTotal().toLocaleString() }}</span>
            </div>

            <div style="display:flex;gap:12px">
              <button type="button" class="btn btn-secondary" (click)="openDiscountModal()" [disabled]="billing.cart().length === 0" style="flex:1">Discount (F4)</button>
              <button type="button" class="btn btn-primary" (click)="openTenderModal()" [disabled]="billing.cart().length === 0" style="flex:2;font-size:16px;font-weight:700;padding:14px">Pay &amp; Checkout (F12 / Space)</button>
            </div>
          </div>
        </div>

        <!-- RIGHT: QUICK ITEM CATALOG GRID -->
        <div style="flex:1.1;display:flex;flex-direction:column;background:var(--color-bg);padding:16px;overflow-y:auto">
          <!-- CATEGORY CHIPS -->
          <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:8px">
            <button *ngFor="let cat of catalog.categories()" 
                    type="button" 
                    class="badge" 
                    [class.badge-info]="selectedCategory === cat.name" 
                    [style.background]="selectedCategory === cat.name ? 'var(--color-primary)' : 'var(--color-surface)'"
                    [style.color]="selectedCategory === cat.name ? '#fff' : 'var(--color-text)'"
                    (click)="selectedCategory = cat.name" 
                    style="cursor:pointer;padding:8px 14px;border:1px solid var(--color-border);border-radius:20px;font-size:13px">
              {{ cat.name }}
            </button>
          </div>

          <!-- PRODUCTS GRID -->
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(135px, 1fr));gap:10px">
            <div *ngFor="let item of filteredItems" 
                 (click)="billing.addItemToCart(item)"
                 class="card" 
                 style="padding:12px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:transform 0.1s"
                 onmouseover="this.style.transform='scale(1.02)'" 
                 onmouseout="this.style.transform='scale(1)'">
              <div>
                <div class="text-xs text-muted mono">{{ item.sku }}</div>
                <div style="font-weight:600;font-size:13px;margin:4px 0">{{ item.name }}</div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:8px">
                <span class="mono font-bold text-primary">₹{{ item.price }}</span>
                <span class="text-xs" [class.text-danger]="item.stock <= item.min" [class.text-muted]="item.stock > item.min">{{ item.stock }} {{ item.unit || 'pcs' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TENDER / PAYMENT MODAL -->
      <div class="modal-overlay" [class.open]="showTenderModal">
        <div class="modal" style="max-width:480px">
          <div class="modal-header">
            <h3>Tender &amp; Settlement</h3>
            <button type="button" class="btn btn-ghost btn-sm" (click)="showTenderModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div style="background:var(--color-bg);padding:16px;border-radius:var(--radius-md);margin-bottom:16px;text-align:center">
              <div class="text-sm text-muted">Total Payable Amount</div>
              <div class="mono font-bold" style="font-size:32px;color:var(--color-primary);margin-top:4px">₹{{ billing.roundedTotal().toLocaleString() }}</div>
            </div>

            <div class="form-group">
              <label class="form-label">Payment Mode</label>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn" [class.btn-primary]="paymentMode === 'CASH'" [class.btn-secondary]="paymentMode !== 'CASH'" (click)="paymentMode = 'CASH'" style="flex:1">💵 Cash</button>
                <button type="button" class="btn" [class.btn-primary]="paymentMode === 'UPI'" [class.btn-secondary]="paymentMode !== 'UPI'" (click)="paymentMode = 'UPI'" style="flex:1">📱 UPI / QR</button>
                <button type="button" class="btn" [class.btn-primary]="paymentMode === 'CARD'" [class.btn-secondary]="paymentMode !== 'CARD'" (click)="paymentMode = 'CARD'" style="flex:1">💳 Card</button>
              </div>
            </div>

            <div class="form-group" *ngIf="paymentMode === 'CASH'">
              <label class="form-label">Cash Received (₹)</label>
              <input type="number" class="form-input mono" [(ngModel)]="cashReceived" (input)="calcChange()" style="font-size:20px;font-weight:700">
              <div style="display:flex;gap:6px;margin-top:8px">
                <button *ngFor="let amt of [billing.roundedTotal(), 100, 200, 500, 2000]" type="button" class="btn btn-ghost btn-sm mono" (click)="setCash(amt)">₹{{ amt }}</button>
              </div>
            </div>

            <div style="background:var(--color-surface);padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-sm);margin-top:16px;display:flex;justify-content:space-between;align-items:center" *ngIf="paymentMode === 'CASH'">
              <span style="font-weight:600">Change Due to Customer:</span>
              <span class="mono font-bold" style="font-size:20px" [class.text-success]="changeDue >= 0" [class.text-danger]="changeDue < 0">₹{{ changeDue >= 0 ? changeDue.toFixed(2) : '0.00' }}</span>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:20px">
            <button type="button" class="btn btn-secondary" (click)="showTenderModal = false">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="confirmCheckout()" [disabled]="paymentMode === 'CASH' && cashReceived < billing.roundedTotal()">Confirm &amp; Print Receipt</button>
          </div>
        </div>
      </div>

      <!-- RECEIPT MODAL -->
      <div class="modal-overlay" [class.open]="showReceiptModal">
        <div class="modal" style="max-width:380px">
          <div class="modal-header">
            <h3>Thermal Receipt (58/80mm)</h3>
            <button type="button" class="btn btn-ghost btn-sm" (click)="showReceiptModal = false">✕</button>
          </div>
          <div class="modal-body mono" style="font-size:12px;background:#fff;color:#000;padding:16px;border-radius:var(--radius-sm)">
            <div style="text-align:center;margin-bottom:10px">
              <div style="font-weight:bold;font-size:16px">OKUTO MART</div>
              <div>Store #01 · MG Road Branch</div>
              <div>GSTIN: 29AAAAA0000A1Z5</div>
              <div>--------------------------------</div>
              <div style="text-align:left">
                <div>Invoice: {{ lastTransaction?.invoiceNo }}</div>
                <div>Date: {{ lastTransaction?.timestamp | date:'short' }}</div>
                <div>Cashier: {{ lastTransaction?.cashierName }}</div>
              </div>
              <div>--------------------------------</div>
            </div>
            <table style="width:100%;font-size:11px;margin-bottom:8px">
              <tr *ngFor="let i of lastTransaction?.items">
                <td style="text-align:left">{{ i.name }} (x{{ i.qty }})</td>
                <td style="text-align:right">₹{{ i.lineTotal.toFixed(2) }}</td>
              </tr>
            </table>
            <div style="border-top:1px dashed #000;padding-top:6px">
              <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>₹{{ lastTransaction?.subtotal?.toFixed(2) }}</span></div>
              <div style="display:flex;justify-content:space-between" *ngIf="lastTransaction?.taxTotal"><span>GST Tax:</span><span>₹{{ lastTransaction?.taxTotal?.toFixed(2) }}</span></div>
              <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:4px"><span>TOTAL:</span><span>₹{{ lastTransaction?.roundedTotal }}</span></div>
            </div>
            <div style="text-align:center;margin-top:14px">
              <div>Thank You! Visit Again</div>
              <div style="font-size:10px">Powered by OKUTO POS</div>
            </div>
          </div>
          <div class="modal-actions" style="margin-top:16px">
            <button type="button" class="btn btn-primary" (click)="showReceiptModal = false" style="width:100%">Close &amp; Next Customer</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PosComponent implements OnInit {
  catalog = inject(CatalogService);
  billing = inject(BillingService);
  auth = inject(AuthService);
  router = inject(Router);

  searchQuery = "";
  selectedCategory = "All";
  showTenderModal = false;
  showReceiptModal = false;
  paymentMode: "CASH" | "CARD" | "UPI" = "CASH";
  cashReceived = 0;
  changeDue = 0;
  lastTransaction: SaleTransaction | null = null;

  get filteredItems(): CatalogItem[] {
    if (this.selectedCategory === "All") return this.catalog.items();
    return this.catalog.items().filter(i => i.category === this.selectedCategory);
  }

  ngOnInit(): void {
    this.cashReceived = this.billing.roundedTotal();
  }

  @HostListener("window:keydown", ["$event"])
  handleHotkeys(event: KeyboardEvent): void {
    if (event.key === "F2") {
      event.preventDefault();
      document.getElementById("posSearchInput")?.focus();
    } else if (event.key === "F6") {
      event.preventDefault();
      this.openHoldModal();
    } else if (event.key === "F12") {
      event.preventDefault();
      if (this.billing.cart().length > 0) this.openTenderModal();
    } else if (event.key === "Escape") {
      if (this.showTenderModal) this.showTenderModal = false;
      else if (this.showReceiptModal) this.showReceiptModal = false;
    }
  }

  onSearchEnter(): void {
    if (!this.searchQuery.trim()) return;
    const found = this.catalog.findByQueryOrBarcode(this.searchQuery);
    if (found) {
      this.billing.addItemToCart(found);
      this.searchQuery = "";
    } else {
      alert(`Item not found for '${this.searchQuery}'`);
    }
  }

  openHoldModal(): void {
    if (this.billing.cart().length === 0) return;
    const ref = prompt("Enter customer name / reference for Held Bill:", "Customer");
    if (ref !== null) {
      this.billing.holdCurrentBill(ref || "Customer");
    }
  }

  openDiscountModal(): void {
    const flat = prompt("Enter flat discount amount (₹):", "0");
    if (flat) {
      const val = parseFloat(flat);
      if (!isNaN(val) && val >= 0) {
        this.billing.billDiscount.set({ type: "flat", value: val });
      }
    }
  }

  openTenderModal(): void {
    this.cashReceived = this.billing.roundedTotal();
    this.changeDue = 0;
    this.paymentMode = "CASH";
    this.showTenderModal = true;
  }

  setCash(amt: number): void {
    this.cashReceived = amt;
    this.calcChange();
  }

  calcChange(): void {
    this.changeDue = +(this.cashReceived - this.billing.roundedTotal()).toFixed(2);
  }

  confirmCheckout(): void {
    const tenders: TenderPayment[] = [
      { mode: this.paymentMode, amount: this.billing.roundedTotal() }
    ];
    this.lastTransaction = this.billing.completeCheckout(tenders, Math.max(0, this.changeDue));
    this.showTenderModal = false;
    this.showReceiptModal = true;
  }
}
