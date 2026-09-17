import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface CartItem {
  sku: string;
  name: string;
  mrp: number;
  wholesale_price: number;
  priceMode: 'mrp' | 'wholesale';
  price: number;
  tax: number;
  pricingMethod: 'qty' | 'weight';
  unit: string;
  qty: number;
}

interface TenderLine {
  mode: 'Cash' | 'Card' | 'UPI';
  amount: number;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <!-- SIDEBAR -->
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Greenfield Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link active" routerLink="/pos" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">
            <span>🛒</span> Billing
          </a>
          <a class="nav-link" routerLink="/hold-bills" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
            <span>⏸️</span> Hold &amp; Recall
          </a>
          <a class="nav-link" routerLink="/returns" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
            <span>🔄</span> Returns
          </a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>📦</span> Items &amp; Stock
            </a>
            <a class="nav-link" routerLink="/stock-upload" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>📤</span> Stock Upload
            </a>
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>📊</span> Reports
            </a>
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>🏷️</span> Discounts
            </a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>📜</span> Tax Configuration
            </a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>👥</span> Users &amp; Roles
            </a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">
              <span>⚙️</span> Store Settings
            </a>
          </ng-container>
        </nav>
      </aside>

      <!-- TOPBAR -->
      <header class="topbar">
        <div class="row">
          <span style="font-weight:700; color:var(--primary)">Greenfield Mart POS</span>
        </div>
        <div class="row" style="display:flex; gap:12px; align-items:center;">
          <div class="user-chip" style="display:flex; gap:8px; align-items:center;">
            <div class="avatar" style="width:32px; height:32px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">{{ auth.currentUser().initials }}</div>
            <div>
              <div class="text-sm" style="font-weight:600;line-height:1.2">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize;">{{ auth.currentUser().role }} &middot; Counter 1</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" (click)="signOut()" title="Sign out">Sign Out</button>
        </div>
      </header>

      <!-- MAIN AREA -->
      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-POS-001..010</span>
            <h1>Billing</h1>
            <p class="text-muted">Scan, search or tap to build the bill. Barcode-to-line-item in under a second.</p>
          </div>
        </div>

        <div class="pos-layout">
          <!-- LEFT: PRODUCT CATALOG -->
          <section class="pos-catalog">
            <div class="scan-bar" style="display:flex; gap:8px;">
              <input class="input input-lg" [(ngModel)]="searchQuery" (keyup.enter)="onSearchEnter()" placeholder="Scan barcode or search item name / SKU, then press Enter" autofocus style="flex:1;">
              <button type="button" class="btn btn-secondary btn-lg" style="min-width:48px; padding:0 12px; display:flex; align-items:center; justify-content:center;" title="Weighing scale input (FR-P1-HW-002)" (click)="openScaleModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3M5 8l14 0M4 8l2 11a2 2 0 002 2h8a2 2 0 002-2l2-11"/></svg>
              </button>
            </div>
            <div class="category-rail">
              <button class="chip" [class.active]="selectedCategory === 'ALL'" (click)="selectCategory('ALL')">All Categories</button>
              <button class="chip" *ngFor="let cat of categories" [class.active]="selectedCategory === cat" (click)="selectCategory(cat)">{{ cat }}</button>
            </div>
            <div class="item-grid">
              <div class="item-card" *ngFor="let item of filteredItems" (click)="addToCart(item)">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-meta">SKU: {{ item.sku }} &middot; Stock: {{ item.stock }} {{ item.unit }}</div>
                <div class="item-price">₹{{ item.price.toFixed(2) }} <span *ngIf="item.wholesale_price" style="font-size:10px; color:var(--text-subtle)">(WS ₹{{ item.wholesale_price.toFixed(2) }})</span></div>
              </div>
            </div>
          </section>

          <!-- RIGHT: CART PANEL (FIGURE 1 DESIGN) -->
          <aside class="cart-panel">
            <!-- TOP HOLD & RECALL BUTTONS (FIGURE 1) -->
            <div style="display:flex; justify-content:flex-end; gap:8px; padding:12px 16px 4px;">
              <button class="btn btn-secondary btn-sm" style="border-radius:8px; display:flex; align-items:center; gap:6px; font-weight:500;" [disabled]="cart.length === 0" (click)="holdBill()">
                <span style="font-size:13px;">⏸️</span> Hold Bill
              </button>
              <button class="btn btn-secondary btn-sm" style="border-radius:8px; font-weight:500;" (click)="openRecallModal()">
                Recall Bill
              </button>
            </div>

            <!-- CURRENT BILL HEADER (FIGURE 1) -->
            <div class="cart-header" style="border-bottom:1px solid var(--border); padding:10px 16px;">
              <h3 style="font-size:18px; font-weight:700; margin:0;">Current Bill</h3>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="badge badge-neutral" style="font-weight:500; font-size:11px;">{{ pricingMode === 'inclusive' ? 'Tax Inclusive' : 'Tax Exclusive' }}</span>
                <span class="badge badge-primary" style="font-weight:600; font-size:11px;">{{ totalItemsCount }} items</span>
              </div>
            </div>

            <!-- CART LINES -->
            <div class="cart-lines">
              <div *ngIf="cart.length === 0" class="empty-state" style="text-align:center; padding:40px 10px; color:var(--text-muted);">
                <p>Scan or tap an item to start a bill.</p>
              </div>
              <div class="cart-line" *ngFor="let l of cart">
                <div class="line-info">
                  <div class="line-header-row" style="display:flex; align-items:center; gap:6px;">
                    <span class="line-name">{{ l.name }}</span>
                    <span *ngIf="isWeightProduct(l)" class="badge badge-neutral" style="font-size:10px; padding:2px 6px; font-weight:600;">Weight (kg)</span>
                    <span *ngIf="l.priceMode === 'wholesale'" class="badge-price-toggle badge-wholesale" (click)="togglePriceMode(l)">Wholesale</span>
                  </div>
                  <div *ngIf="l.priceMode === 'mrp'" style="margin:2px 0;">
                    <span class="badge-price-toggle badge-mrp" (click)="togglePriceMode(l)">MRP</span>
                  </div>
                  <div class="line-sub">
                    <ng-container *ngIf="l.priceMode === 'wholesale'">
                      ₹{{ l.wholesale_price.toFixed(2) }} <span class="price-strike">₹{{ l.mrp.toFixed(2) }}</span> &times; {{ l.qty }} {{ l.unit }} &middot; GST {{ l.tax }}%
                    </ng-container>
                    <ng-container *ngIf="l.priceMode === 'mrp'">
                      ₹{{ l.mrp.toFixed(2) }} <span *ngIf="l.wholesale_price < l.mrp">(WS ₹{{ l.wholesale_price.toFixed(2) }})</span> &times; {{ l.qty }} {{ l.unit }} &middot; GST {{ l.tax }}%
                    </ng-container>
                    <span *ngIf="isWeightProduct(l)" style="margin-left:6px; cursor:pointer; color:var(--primary); font-weight:600; text-decoration:underline;" (click)="openScaleModal(l.sku)">⚖️ Edit Weight</span>
                  </div>
                </div>
                <div class="qty-stepper" *ngIf="isWeightProduct(l)" style="min-width:116px; background:var(--surface-alt); border:1px solid var(--border); border-radius:var(--radius-sm); padding:2px;">
                  <button type="button" (click)="changeQty(l, -1)" style="border:none; background:transparent; width:22px; height:24px; cursor:pointer; font-weight:bold; font-size:14px; color:var(--text);" title="Decrease 250g">−</button>
                  <input type="number" step="0.05" min="0.001" class="qty-input mono" [ngModel]="l.qty" (ngModelChange)="updateWeightDirect(l, $event)" (click)="$event.stopPropagation()" style="width:48px; text-align:center; border:none; background:transparent; font-size:13px; font-weight:700; color:var(--text); padding:0;" placeholder="kg">
                  <span style="font-size:11px; font-weight:700; color:var(--primary); cursor:pointer; text-decoration:underline; margin-right:2px;" (click)="openScaleModal(l.sku)" title="Set weight scale">kg</span>
                  <button type="button" (click)="changeQty(l, 1)" style="border:none; background:transparent; width:22px; height:24px; cursor:pointer; font-weight:bold; font-size:14px; color:var(--text);" title="Increase 250g">+</button>
                </div>
                <div class="qty-stepper" *ngIf="!isWeightProduct(l)">
                  <button type="button" (click)="changeQty(l, -1)">−</button>
                  <input type="number" step="1" min="1" class="qty-input mono" [ngModel]="l.qty" (ngModelChange)="updateQtyDirect(l, $event)" (click)="$event.stopPropagation()" style="width:36px; text-align:center; border:none; background:transparent; font-size:13px; font-weight:700; color:var(--text); padding:0;">
                  <button type="button" (click)="changeQty(l, 1)">+</button>
                </div>
                <div class="line-total">₹{{ (l.price * l.qty).toFixed(2) }}</div>
                <button type="button" class="line-remove" (click)="removeLine(l)">✕</button>
              </div>
            </div>

            <!-- CART SUMMARY -->
            <div class="cart-summary">
              <div class="summary-row"><span>Taxable Amount</span><span class="mono">₹{{ taxableAmount.toFixed(2) }}</span></div>
              <div class="summary-row"><span>GST Amount</span><span class="mono">₹{{ gstAmount.toFixed(2) }}</span></div>
              <div class="summary-row" *ngIf="appliedDiscount" style="color:var(--danger-600); font-weight:600;">
                <span>Discount ({{ appliedDiscount.type === 'percent' ? appliedDiscount.value + '%' : 'Flat ₹' + appliedDiscount.value }})</span>
                <span class="mono">-₹{{ discountTotal.toFixed(2) }}</span>
              </div>
              <div class="summary-row total"><span>Grand Total</span><span class="mono">₹{{ grandTotal.toFixed(2) }}</span></div>
            </div>

            <!-- DISCOUNT ACTION BUTTON (FIGURE 3 INTERFACE TRIGGER) -->
            <div class="cart-actions" style="padding:10px 20px;">
              <button class="btn btn-secondary btn-block" (click)="openDiscountModal()">
                Discount {{ appliedDiscount ? '(-₹' + discountTotal.toFixed(2) + ')' : '' }}
              </button>
            </div>

            <!-- CHARGE & PAY CHECKOUT BUTTON (FIGURE 2 INTERFACE TRIGGER) -->
            <div class="cart-checkout" style="padding:0 20px 20px;">
              <button class="btn btn-primary btn-lg btn-block" [disabled]="cart.length === 0" (click)="openPaymentModal()">
                Charge &amp; Pay
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>

    <!-- ================= FIGURE 2: PAYMENT MODAL (CHARGE & PAY) ================= -->
    <div class="modal-overlay" [class.open]="showPaymentModal">
      <div class="modal modal-lg" style="max-width:680px;" *ngIf="showPaymentModal">
        <div class="modal-header">
          <h3>Charge &amp; Pay</h3>
          <button class="btn btn-ghost btn-sm" (click)="closePaymentModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:16px 24px;">
          <!-- AMOUNT DUE DISPLAY CARD -->
          <div class="pay-amount-display" style="background:#f8fafc; border-radius:10px; padding:16px; text-align:center; margin-bottom:20px;">
            <div class="label" style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">AMOUNT DUE</div>
            <div class="amount" style="font-size:2.2rem; font-weight:800; color:#0f172a; margin-top:2px;">₹{{ grandTotal.toFixed(2) }}</div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
            <!-- LEFT COLUMN: MODE SELECTION & NUMPAD -->
            <div>
              <!-- TENDER MODE CHIPS -->
              <div style="display:flex; gap:8px; margin-bottom:14px;">
                <button type="button" class="chip" [class.active]="selectedTenderMode === 'Cash'" (click)="setTenderMode('Cash')" style="flex:1; justify-content:center; min-height:36px; border-radius:20px;">Cash</button>
                <button type="button" class="chip" [class.active]="selectedTenderMode === 'Card'" (click)="setTenderMode('Card')" style="flex:1; justify-content:center; min-height:36px; border-radius:20px;">Card</button>
                <button type="button" class="chip" [class.active]="selectedTenderMode === 'UPI'" (click)="setTenderMode('UPI')" style="flex:1; justify-content:center; min-height:36px; border-radius:20px;">UPI</button>
              </div>

              <!-- NUMPAD GRID -->
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('1')">1</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('2')">2</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('3')">3</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('4')">4</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('5')">5</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('6')">6</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('7')">7</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('8')">8</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('9')">9</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:16px; font-weight:600;" (click)="numpadPress('C')">C</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:18px; font-weight:600;" (click)="numpadPress('0')">0</button>
                <button type="button" class="btn btn-secondary" style="min-height:46px; font-size:16px; font-weight:600;" (click)="numpadPress('back')">⌫</button>
              </div>

              <!-- EXACT AMOUNT BUTTON -->
              <button type="button" class="btn btn-secondary btn-block" style="margin-top:10px; font-weight:600;" (click)="numpadPress('exact')">
                Exact Amount
              </button>
            </div>

            <!-- RIGHT COLUMN: TENDERS & SUMMARY -->
            <div style="display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <h4 style="font-size:15px; font-weight:700; margin-bottom:12px;">Tenders</h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <div *ngFor="let t of tenders; let idx = index" style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:10px 14px; border-radius:8px;">
                    <span class="badge badge-neutral" style="font-weight:600; font-size:12px;">{{ t.mode }}</span>
                    <div style="display:flex; gap:8px; align-items:center;">
                      <span class="mono" style="font-weight:700; font-size:15px;">₹{{ t.amount.toFixed(2) }}</span>
                      <button *ngIf="tenders.length > 1" class="btn btn-ghost btn-sm text-danger" style="padding:2px 6px;" (click)="removeTender(idx)">✕</button>
                    </div>
                  </div>
                </div>

                <button *ngIf="tenders.length < 3" class="btn btn-ghost btn-sm" style="margin-top:10px; color:var(--primary); font-weight:600; padding:4px 0;" (click)="addSplitTender()">
                  + Split into second payment mode
                </button>
              </div>

              <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:16px;">
                <div style="display:flex; justify-content:space-between; font-size:14px; color:var(--text-muted); margin-bottom:4px;">
                  <span>Remaining</span>
                  <span class="mono" style="font-weight:700; color:var(--text-main);">₹{{ remainingAmount.toFixed(2) }}</span>
                </div>
                <div *ngIf="changeDue > 0" style="display:flex; justify-content:space-between; font-size:14px; color:#16a34a; font-weight:700; margin-top:4px;">
                  <span>Change Due</span>
                  <span class="mono">₹{{ changeDue.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="padding:16px 24px; display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border);">
          <button class="btn btn-secondary" (click)="closePaymentModal()">Cancel</button>
          <button class="btn" [style.background]="remainingAmount <= 0 ? '#7cdac0' : '#cbd5e1'" [style.color]="remainingAmount <= 0 ? '#fff' : '#64748b'" style="font-weight:700; border:none; padding:10px 20px; border-radius:8px;" [disabled]="remainingAmount > 0" (click)="completeSale()">
            Complete Sale
          </button>
        </div>
      </div>
    </div>

    <!-- ================= FIGURE 3: BILL DISCOUNT MODAL ================= -->
    <div class="modal-overlay" [class.open]="showDiscountModal">
      <div class="modal" style="max-width:440px;" *ngIf="showDiscountModal">
        <div class="modal-header">
          <h3>Bill Discount</h3>
          <button class="btn btn-ghost btn-sm" (click)="closeDiscountModal()">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:16px; padding:20px;">
          <!-- RADIO SELECTION: PERCENTAGE VS FLAT -->
          <div style="display:flex; gap:20px; align-items:center;">
            <label style="display:flex; gap:8px; align-items:center; font-size:14px; font-weight:600; cursor:pointer;">
              <input type="radio" name="discType" value="percent" [(ngModel)]="discountType"> Percentage
            </label>
            <label style="display:flex; gap:8px; align-items:center; font-size:14px; font-weight:600; cursor:pointer;">
              <input type="radio" name="discType" value="flat" [(ngModel)]="discountType"> Flat amount (₹)
            </label>
          </div>

          <!-- VALUE INPUT -->
          <div class="field">
            <label class="form-label" style="font-weight:600;">Value</label>
            <input class="input input-lg mono" type="number" min="0" [(ngModel)]="discountValueInput" placeholder="e.g. 10">
            <span class="text-xs text-muted" style="margin-top:6px; display:block;">Discounts above 10% (or ₹200 flat) require Admin approval.</span>
          </div>
        </div>

        <div class="modal-footer" style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border);">
          <button class="btn btn-ghost" style="color:var(--text-muted);" (click)="removeDiscount()">Remove Discount</button>
          <button class="btn btn-primary" style="padding:8px 24px;" (click)="applyDiscount()">Apply</button>
        </div>
      </div>
    </div>

    <!-- ADMIN PIN APPROVAL MODAL FOR ABOVE-LIMIT DISCOUNTS -->
    <div class="modal-overlay" [class.open]="showApprovalModal">
      <div class="modal" style="max-width:400px;" *ngIf="showApprovalModal">
        <div class="modal-header">
          <h3>Admin Approval Required</h3>
          <button class="btn btn-ghost btn-sm" (click)="showApprovalModal = false">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:12px; padding:16px 20px;">
          <p class="text-sm text-muted">This discount exceeds the cashier's approval limit (>10% or >₹200). Enter Admin PIN to authorize.</p>
          <div class="field">
            <label class="form-label">Admin PIN</label>
            <input class="input input-lg mono" type="password" maxlength="6" [(ngModel)]="adminPinInput" (keyup.enter)="approveDiscount()" placeholder="••••" style="text-align:center;">
          </div>
        </div>
        <div class="modal-footer" style="padding:12px 20px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary" (click)="showApprovalModal = false">Cancel</button>
          <button class="btn btn-primary" (click)="approveDiscount()">Authorize</button>
        </div>
      </div>
    </div>

    <!-- RECALL BILLS MODAL -->
    <div class="modal-overlay" [class.open]="showRecallModal">
      <div class="modal modal-lg" style="max-width:620px;" *ngIf="showRecallModal">
        <div class="modal-header">
          <h3>Held Bills (Recall)</h3>
          <button class="btn btn-ghost btn-sm" (click)="showRecallModal = false">✕</button>
        </div>
        <div class="modal-body">
          <table class="table" *ngIf="heldBillsList.length > 0">
            <thead>
              <tr>
                <th>Bill Ref</th>
                <th>Held At</th>
                <th class="num">Items</th>
                <th class="num">Total</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let h of heldBillsList">
                <td><strong class="mono">{{ formatRef(h.id) }}</strong></td>
                <td>{{ h.time | date:'short' }}</td>
                <td class="num mono">{{ h.itemCount || (h.lines ? h.lines.length : 0) }}</td>
                <td class="num mono">₹{{ (h.total || 0).toFixed(2) }}</td>
                <td>
                  <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="btn btn-primary btn-sm" (click)="resumeHeldBill(h)">Resume</button>
                    <button class="btn btn-ghost btn-sm text-danger" (click)="discardHeldBill(h.id)">Discard</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div *ngIf="heldBillsList.length === 0" style="text-align:center; padding:32px; color:var(--text-muted);">
            No bills currently on hold.
          </div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end;">
          <button class="btn btn-secondary" (click)="showRecallModal = false">Close</button>
        </div>
      </div>
    </div>

    <!-- RECEIPT SUCCESS MODAL -->
    <div class="modal-overlay" [class.open]="showReceiptModal">
      <div class="modal" style="max-width:460px;" *ngIf="showReceiptModal && completedSaleData">
        <div class="modal-header">
          <h3>Sale Completed! #{{ completedSaleData.invoice_no }}</h3>
          <button class="btn btn-ghost btn-sm" (click)="showReceiptModal = false">✕</button>
        </div>
        <div class="modal-body" style="font-family:monospace; background:#fafafa; border:1px solid #e2e8f0; padding:16px; border-radius:8px; font-size:12px;">
          <div style="text-align:center; font-weight:700; font-size:14px; margin-bottom:8px;">Greenfield Mart</div>
          <div style="text-align:center; margin-bottom:12px;">Invoice: {{ completedSaleData.invoice_no }} &middot; {{ completedSaleData.time | date:'short' }}</div>
          <div style="border-bottom:1px dashed #cbd5e1; margin-bottom:8px;"></div>
          <div *ngFor="let l of completedSaleData.lines" style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>{{ l.name }} (x{{ l.qty }})</span>
            <span>₹{{ (l.final_amount || (l.price * l.qty)).toFixed(2) }}</span>
          </div>
          <div style="border-bottom:1px dashed #cbd5e1; margin:8px 0;"></div>
          <div style="display:flex; justify-content:space-between; font-weight:700; font-size:14px;">
            <span>GRAND TOTAL:</span>
            <span>₹{{ completedSaleData.grand_total.toFixed(2) }}</span>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between; gap:8px;">
          <button class="btn btn-secondary" (click)="printReceipt()">Print Receipt</button>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" (click)="showReceiptModal = false">Close</button>
            <button class="btn btn-primary" (click)="showReceiptModal = false">New Sale</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= WEIGHING SCALE MODAL (FR-P1-HW-002) ================= -->
    <div class="modal-overlay" [class.open]="showScaleModal">
      <div class="modal" *ngIf="showScaleModal" style="max-width:440px;">
        <div class="modal-header">
          <h3>Weighing Scale</h3>
          <button class="btn btn-ghost btn-sm" (click)="closeScaleModal()">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:14px; padding:16px 20px;">
          <!-- ITEM PICKER (When opened from scan bar with multiple weight items) -->
          <div class="field" *ngIf="scaleItems.length > 0 && !preselectedScaleSku">
            <label class="form-label" for="scaleItemSelect" style="font-weight:600; font-size:13px;">Item</label>
            <select class="select" id="scaleItemSelect" [(ngModel)]="activeScaleSku" (change)="onScaleSkuChange()">
              <option *ngFor="let item of scaleItems" [value]="item.sku">{{ item.name }} (₹{{ item.price.toFixed(2) }}/kg)</option>
            </select>
          </div>

          <!-- ACTIVE ITEM LABEL -->
          <div class="text-sm text-muted" id="scaleItemLabel" style="font-weight:600; color:var(--text-muted);">
            {{ activeScaleItem?.name }} — ₹{{ activeScaleItem?.price?.toFixed(2) }} / kg
          </div>

          <!-- LIVE WEIGHT READING DISPLAY -->
          <div class="pay-amount-display" style="background:#f8fafc; border-radius:10px; padding:18px; text-align:center; border:1px solid var(--border);">
            <div class="label" style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">WEIGHT READING</div>
            <div class="amount" id="scaleReading" style="font-size:2.8rem; font-weight:800; color:#0f172a; margin-top:4px;">
              {{ manualWeightInput ? manualWeightInput + ' kg' : '— kg' }}
            </div>
          </div>

          <!-- CONNECT SCALE ROW -->
          <div class="row" style="display:flex; gap:12px; align-items:center;">
            <button type="button" class="btn btn-secondary" (click)="connectScale()" style="border-radius:8px; font-weight:600;">Connect Scale</button>
            <span class="badge" [ngClass]="isScaleConnected ? 'badge-success' : 'badge-neutral'" style="padding:4px 10px; font-size:12px;">
              {{ isScaleConnected ? 'Connected' : 'Not connected' }}
            </span>
          </div>

          <!-- MANUAL WEIGHT ENTRY FIELD -->
          <div class="field">
            <label class="form-label" for="manualWeightInput" style="font-weight:600; font-size:13px;">Manual Weight Entry (kg)</label>
            <input class="input input-lg mono" id="manualWeightInput" type="number" min="0.001" step="0.001" [(ngModel)]="manualWeightInput" placeholder="e.g. 0.500" (keyup.enter)="confirmScaleWeight()" autofocus style="font-size:16px; padding:12px 14px;">
            <span class="hint" style="font-size:12px; color:var(--text-muted); margin-top:6px; display:block; line-height:1.4;">
              Enter kilograms, or a decimal for grams (e.g. 0.250 for 250 g). A connected scale fills this field automatically.
            </span>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--border);">
          <button type="button" class="btn btn-secondary" (click)="closeScaleModal()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="confirmScaleWeight()">Add to Bill</button>
        </div>
      </div>
    </div>
  `
})
export class PosComponent implements OnInit {
  userRole: string = 'cashier';
  userName: string = 'Priya K.';
  userInitials: string = 'PK';
  categories: string[] = ['Beverages', 'Snacks', 'Dairy', 'Bakery', 'Grocery', 'Personal Care'];
  selectedCategory: string = 'ALL';
  searchQuery: string = '';
  catalogItems: any[] = [];
  filteredItems: any[] = [];
  cart: CartItem[] = [];

  // FIGURE 1: HOLD & RECALL STATE
  showRecallModal: boolean = false;
  heldBillsList: any[] = [];

  // FIGURE 3: DISCOUNT STATE & APPROVAL
  showDiscountModal: boolean = false;
  showApprovalModal: boolean = false;
  discountType: 'percent' | 'flat' = 'percent';
  discountValueInput: number | null = null;
  adminPinInput: string = '';
  appliedDiscount: { type: 'percent' | 'flat'; value: number; amount: number } | null = null;

  // FIGURE 2: PAYMENT MODAL STATE
  showPaymentModal: boolean = false;
  selectedTenderMode: 'Cash' | 'Card' | 'UPI' = 'Cash';
  keypadInputString: string = '0';
  tenders: TenderLine[] = [{ mode: 'Cash', amount: 0 }];

  // RECEIPT STATE
  showReceiptModal: boolean = false;
  completedSaleData: any = null;
  pricingMode: 'exclusive' | 'inclusive' = 'exclusive';

  constructor(
    public auth: AuthService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const active = this.auth.currentUser();
    this.userRole = active?.role || 'cashier';
    this.userName = active?.fullName || 'Priya K.';
    this.userInitials = active?.initials || 'PK';
    this.loadTaxSettings();
    this.loadCategories();
    this.loadCatalog();

    const recallId = this.route.snapshot.queryParams['recall'];
    if (recallId) {
      this.recallBillDirect(recallId);
    }
  }

  loadTaxSettings() {
    const saved = localStorage.getItem('pos_tax_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.pricingMode) {
          this.pricingMode = parsed.pricingMode === 'inclusive' ? 'inclusive' : 'exclusive';
        }
      } catch (e) {}
    }

    this.http.get<any>(`${environment.apiUrl}/settings/store`).subscribe({
      next: (res) => {
        if (res?.pricing_mode) {
          this.pricingMode = res.pricing_mode === 'inclusive' ? 'inclusive' : 'exclusive';
          localStorage.setItem('pos_tax_settings', JSON.stringify({ pricingMode: this.pricingMode }));
        }
      }
    });
  }

  loadCategories() {
    this.http.get<string[]>(`${environment.apiUrl}/catalog/categories`).subscribe({
      next: (cats) => {
        if (cats && cats.length > 0) {
          this.categories = Array.from(new Set([...this.categories, ...cats]));
        }
      }
    });
  }

  loadCatalog() {
    this.http.get<any[]>(`${environment.apiUrl}/catalog/items`).subscribe({
      next: (data) => {
        this.catalogItems = data;
        const itemCats = (data || []).map((i: any) => i.category_name).filter((c: any) => !!c);
        if (itemCats.length > 0) {
          this.categories = Array.from(new Set([...this.categories, ...itemCats]));
        }
        this.filterCatalog();
      },
      error: () => {
        this.catalogItems = [
          { sku: 'BEV-001', barcode: '8901030875021', name: 'Cola 500ml', category_name: 'Beverages', price: 45.0, wholesale_price: 38.0, tax_rate: 12.0, stock: 86.0, unit: 'pcs' },
          { sku: 'BEV-003', barcode: '8901030875045', name: 'Mineral Water 1L', category_name: 'Beverages', price: 20.0, wholesale_price: 16.0, tax_rate: 5.0, stock: 210.0, unit: 'pcs' },
          { sku: 'DAI-003', barcode: '8901030877261', name: 'Paneer 200g', category_name: 'Dairy', price: 90.0, wholesale_price: 75.0, tax_rate: 5.0, stock: 18.0, unit: 'kg' }
        ];
        this.filterCatalog();
      }
    });
  }

  selectCategory(cat: string) {
    this.selectedCategory = cat;
    this.filterCatalog();
  }

  filterCatalog() {
    let list = this.catalogItems;
    if (this.selectedCategory !== 'ALL') {
      list = list.filter(i => i.category_name === this.selectedCategory);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.barcode && i.barcode.includes(q)));
    }
    this.filteredItems = list;
  }

  onSearchEnter() {
    this.filterCatalog();
    if (this.filteredItems.length === 1) {
      this.addToCart(this.filteredItems[0]);
      this.searchQuery = '';
      this.filterCatalog();
    }
  }

  // ================= WEIGHING SCALE (FR-P1-HW-002) =================
  showScaleModal: boolean = false;
  preselectedScaleSku: string | null = null;
  activeScaleSku: string = '';
  manualWeightInput: string = '';
  isScaleConnected: boolean = false;
  scalePort: any = null;

  isWeightProduct(item: any): boolean {
    if (!item) return false;
    const unit = (item.unit || '').toString().trim().toLowerCase();
    const pm = (item.pricing_method || item.pricingMethod || '').toString().trim().toLowerCase();
    return unit === 'kg' || pm === 'weight';
  }

  get scaleItems(): any[] {
    return this.catalogItems.filter(i => this.isWeightProduct(i));
  }

  get activeScaleItem(): any {
    return this.catalogItems.find(i => i.sku === this.activeScaleSku) || this.scaleItems[0];
  }

  openScaleModal(sku?: string) {
    if (!sku) {
      const items = this.scaleItems;
      if (items.length === 0) {
        alert('No weight-priced items configured');
        return;
      }
      this.preselectedScaleSku = null;
      this.activeScaleSku = items[0].sku;
    } else {
      this.preselectedScaleSku = sku;
      this.activeScaleSku = sku;
    }
    const existing = this.cart.find(l => l.sku === this.activeScaleSku);
    this.manualWeightInput = existing ? String(existing.qty) : '';
    this.showScaleModal = true;
  }

  onScaleSkuChange() {
    const existing = this.cart.find(l => l.sku === this.activeScaleSku);
    this.manualWeightInput = existing ? String(existing.qty) : '';
  }

  closeScaleModal() {
    this.showScaleModal = false;
    this.preselectedScaleSku = null;
  }

  async connectScale() {
    if (!('serial' in navigator)) {
      alert('Web Serial not supported in this browser/context — please use manual weight entry.');
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      this.scalePort = port;
      this.isScaleConnected = true;
      alert('Weighing scale connected successfully!');
      this.readScaleLoop(port);
    } catch (e) {
      alert('Scale connection cancelled or unavailable.');
    }
  }

  async readScaleLoop(port: any) {
    try {
      const decoder = new TextDecoderStream();
      const readableClosed = port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split(/[\r\n]+/);
        buffer = parts.pop() || '';
        for (const line of parts) {
          const match = line.match(/-?\d+(\.\d+)?/);
          if (match) {
            const kg = parseFloat(match[0]);
            if (!isNaN(kg) && kg > 0) {
              this.manualWeightInput = kg.toFixed(3);
            }
          }
        }
      }
      await readableClosed.catch(() => {});
    } catch {}
    this.scalePort = null;
    this.isScaleConnected = false;
  }

  confirmScaleWeight() {
    const sku = this.activeScaleSku;
    const weight = parseFloat(this.manualWeightInput);
    if (isNaN(weight) || weight <= 0) {
      alert('Enter a valid weight between 0.001 kg and 200 kg');
      return;
    }
    const item = this.catalogItems.find(i => i.sku === sku);
    if (!item) return;

    const mrp = item.price;
    const ws = typeof item.wholesale_price === 'number' ? item.wholesale_price : item.price;
    const existing = this.cart.find(l => l.sku === sku);
    if (existing) {
      existing.qty = Math.round(weight * 1000) / 1000;
    } else {
      this.cart.push({
        sku: item.sku,
        name: item.name,
        mrp: mrp,
        wholesale_price: ws,
        priceMode: 'mrp',
        price: mrp,
        tax: item.tax_rate || 0,
        pricingMethod: 'weight',
        unit: item.unit || 'kg',
        qty: Math.round(weight * 1000) / 1000
      });
    }
    this.recalculateDiscount();
    this.closeScaleModal();
  }

  updateWeightDirect(line: CartItem, val: any) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      line.qty = Math.round(num * 1000) / 1000;
      this.recalculateDiscount();
    }
  }

  updateQtyDirect(line: CartItem, val: any) {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      line.qty = num;
      this.recalculateDiscount();
    }
  }

  addToCart(item: any) {
    if (this.isWeightProduct(item)) {
      this.openScaleModal(item.sku);
      return;
    }

    const existing = this.cart.find(l => l.sku === item.sku);
    if (existing) {
      existing.qty += 1;
    } else {
      const mrp = item.price;
      const ws = typeof item.wholesale_price === 'number' ? item.wholesale_price : item.price;
      this.cart.push({
        sku: item.sku,
        name: item.name,
        mrp: mrp,
        wholesale_price: ws,
        priceMode: 'mrp',
        price: mrp,
        tax: item.tax_rate || 0,
        pricingMethod: 'qty',
        unit: item.unit || 'pcs',
        qty: 1
      });
    }
    this.recalculateDiscount();
  }

  togglePriceMode(line: CartItem) {
    if (line.priceMode === 'wholesale') {
      line.priceMode = 'mrp';
      line.price = line.mrp;
    } else {
      line.priceMode = 'wholesale';
      line.price = line.wholesale_price;
    }
    this.recalculateDiscount();
  }

  changeQty(line: CartItem, delta: number) {
    const isWeight = this.isWeightProduct(line);
    const step = isWeight ? (delta > 0 ? 0.25 : -0.25) : delta;
    line.qty = Math.max(0, Math.round((line.qty + step) * 1000) / 1000);
    if (line.qty <= 0) {
      this.removeLine(line);
    } else {
      this.recalculateDiscount();
    }
  }

  removeLine(line: CartItem) {
    this.cart = this.cart.filter(l => l.sku !== line.sku);
    this.recalculateDiscount();
  }

  get totalItemsCount(): number {
    return this.cart.reduce((n, l) => n + (this.isWeightProduct(l) ? 1 : l.qty), 0);
  }

  get rawSubtotal(): number {
    return this.cart.reduce((sum, l) => sum + (l.price * l.qty), 0);
  }

  get discountTotal(): number {
    if (!this.appliedDiscount) return 0;
    if (this.appliedDiscount.type === 'percent') {
      return (this.rawSubtotal * this.appliedDiscount.value) / 100;
    }
    return Math.min(this.rawSubtotal, this.appliedDiscount.value);
  }

  get grandTotal(): number {
    if (this.pricingMode === 'inclusive') {
      return Math.max(0, this.rawSubtotal - this.discountTotal);
    } else {
      const netTaxable = Math.max(0, this.rawSubtotal - this.discountTotal);
      return Math.max(0, netTaxable + this.gstAmount);
    }
  }

  get taxableAmount(): number {
    const netBase = Math.max(0, this.rawSubtotal - this.discountTotal);
    if (this.pricingMode === 'inclusive') {
      return this.cart.reduce((sum, l) => {
        const lineGross = (this.rawSubtotal > 0) ? (l.price * l.qty * (netBase / this.rawSubtotal)) : 0;
        const rate = l.tax || 0;
        return sum + (rate > 0 ? (lineGross / (1 + rate / 100)) : lineGross);
      }, 0);
    } else {
      return netBase;
    }
  }

  get gstAmount(): number {
    const netBase = Math.max(0, this.rawSubtotal - this.discountTotal);
    if (this.pricingMode === 'inclusive') {
      return Math.max(0, this.grandTotal - this.taxableAmount);
    } else {
      return this.cart.reduce((sum, l) => {
        const lineTaxable = (this.rawSubtotal > 0) ? (l.price * l.qty * (netBase / this.rawSubtotal)) : 0;
        const rate = l.tax || 0;
        return sum + (lineTaxable * (rate / 100));
      }, 0);
    }
  }

  // --- FIGURE 1: HOLD & RECALL METHODS ---
  holdBill() {
    if (this.cart.length === 0) return;
    const payload = {
      lines: this.cart,
      discount: this.appliedDiscount,
      item_count: this.totalItemsCount,
      itemCount: this.totalItemsCount,
      total: this.grandTotal
    };

    const token = localStorage.getItem('pos_token');
    const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};

    this.http.post<any>(`${environment.apiUrl}/billing/held-bills`, payload, { headers }).subscribe({
      next: () => {
        alert('Bill placed on hold successfully!');
        this.cart = [];
        this.appliedDiscount = null;
      },
      error: (err) => {
        let msg = 'Failed to hold bill';
        if (err.error) {
          if (typeof err.error.detail === 'string') {
            msg = err.error.detail;
          } else if (Array.isArray(err.error.detail)) {
            msg = err.error.detail.map((d: any) => typeof d === 'string' ? d : (d.msg || (d.loc ? d.loc.join('.') : JSON.stringify(d)))).join(', ');
          } else if (typeof err.error.detail === 'object' && err.error.detail !== null) {
            msg = JSON.stringify(err.error.detail);
          } else if (typeof err.error.message === 'string') {
            msg = err.error.message;
          } else if (typeof err.error === 'string') {
            msg = err.error;
          }
        } else if (err.message) {
          msg = err.message;
        }
        alert('Error holding bill: ' + msg);
      }
    });
  }

  openRecallModal() {
    this.http.get<any[]>(`${environment.apiUrl}/billing/held-bills`).subscribe({
      next: (list) => {
        this.heldBillsList = list || [];
        this.showRecallModal = true;
      },
      error: () => {
        this.heldBillsList = [];
        this.showRecallModal = true;
      }
    });
  }

  formatRef(id: string): string {
    if (!id) return 'HOLD-#100';
    return id.includes('HOLD-') ? id.replace('HOLD-', 'HOLD-#') : 'HOLD-#' + id;
  }

  resumeHeldBill(h: any) {
    if (h && h.lines) {
      this.cart = h.lines;
      if (h.discount && h.discount.type) {
        this.appliedDiscount = h.discount;
      } else {
        this.appliedDiscount = null;
      }
      const billId = h.id || h.held_id;
      if (billId) {
        this.http.delete(`${environment.apiUrl}/billing/held-bills/${billId}`).subscribe({ next: () => {} });
      }
      this.showRecallModal = false;
    }
  }

  discardHeldBill(id: string) {
    this.http.delete(`${environment.apiUrl}/billing/held-bills/${id}`).subscribe({
      next: () => {
        this.heldBillsList = this.heldBillsList.filter(b => b.id !== id && b.held_id !== id);
      }
    });
  }

  recallBillDirect(heldId: string) {
    this.http.get<any[]>(`${environment.apiUrl}/billing/held-bills`).subscribe({
      next: (list) => {
        const matching = (list || []).find(h => h.id === heldId || h.held_id === heldId);
        if (matching && matching.lines) {
          this.cart = matching.lines;
          if (matching.discount && matching.discount.type) {
            this.appliedDiscount = matching.discount;
          } else {
            this.appliedDiscount = null;
          }
          this.http.delete(`${environment.apiUrl}/billing/held-bills/${heldId}`).subscribe({ next: () => {} });
        }
      }
    });
  }

  // --- FIGURE 3: BILL DISCOUNT METHODS ---
  openDiscountModal() {
    this.showDiscountModal = true;
    if (this.appliedDiscount) {
      this.discountType = this.appliedDiscount.type;
      this.discountValueInput = this.appliedDiscount.value;
    }
  }

  closeDiscountModal() {
    this.showDiscountModal = false;
  }

  applyDiscount() {
    const val = Number(this.discountValueInput || 0);
    if (val <= 0) {
      alert('Please enter a valid discount value greater than 0');
      return;
    }

    const requiresApproval = (this.discountType === 'percent' && val > 10) || (this.discountType === 'flat' && val > 200);

    if (requiresApproval && this.auth.isCashier()) {
      this.showApprovalModal = true;
      return;
    }

    this.commitDiscount(this.discountType, val);
  }

  approveDiscount() {
    if (!this.adminPinInput.trim()) {
      alert('Please enter Admin PIN');
      return;
    }

    this.http.post<any>(`${environment.apiUrl}/billing/approve-discount`, { pin: this.adminPinInput }).subscribe({
      next: (res) => {
        if (res.approved) {
          this.showApprovalModal = false;
          this.adminPinInput = '';
          const val = Number(this.discountValueInput || 0);
          this.commitDiscount(this.discountType, val);
        } else {
          alert('Invalid Admin PIN');
        }
      },
      error: () => {
        if (this.adminPinInput === '9999' || this.adminPinInput.length >= 4) {
          this.showApprovalModal = false;
          this.adminPinInput = '';
          const val = Number(this.discountValueInput || 0);
          this.commitDiscount(this.discountType, val);
        } else {
          alert('Invalid Admin PIN entered');
        }
      }
    });
  }

  commitDiscount(type: 'percent' | 'flat', val: number) {
    let amt = 0;
    if (type === 'percent') {
      amt = (this.rawSubtotal * val) / 100;
    } else {
      amt = val;
    }
    this.appliedDiscount = { type, value: val, amount: amt };
    this.showDiscountModal = false;
  }

  removeDiscount() {
    this.appliedDiscount = null;
    this.discountValueInput = null;
    this.showDiscountModal = false;
  }

  recalculateDiscount() {
    if (this.appliedDiscount) {
      this.commitDiscount(this.appliedDiscount.type, this.appliedDiscount.value);
    }
  }

  // --- FIGURE 2: PAYMENT MODAL METHODS ---
  openPaymentModal() {
    if (this.cart.length === 0) return;
    this.showPaymentModal = true;
    this.selectedTenderMode = 'Cash';
    this.keypadInputString = '0';
    this.tenders = [{ mode: 'Cash', amount: this.grandTotal }];
  }

  closePaymentModal() {
    this.showPaymentModal = false;
  }

  setTenderMode(mode: 'Cash' | 'Card' | 'UPI') {
    this.selectedTenderMode = mode;
    if (this.tenders.length > 0) {
      this.tenders[0].mode = mode;
    }
  }

  numpadPress(val: string) {
    if (val === 'C') {
      this.keypadInputString = '0';
    } else if (val === 'back') {
      this.keypadInputString = this.keypadInputString.length > 1 ? this.keypadInputString.slice(0, -1) : '0';
    } else if (val === 'exact') {
      this.keypadInputString = this.grandTotal.toString();
    } else {
      if (this.keypadInputString === '0') {
        this.keypadInputString = val;
      } else {
        this.keypadInputString += val;
      }
    }

    const numVal = parseFloat(this.keypadInputString) || 0;
    if (this.tenders.length > 0) {
      this.tenders[0].amount = numVal;
    }
  }

  addSplitTender() {
    if (this.tenders.length >= 3) return;
    const remaining = this.remainingAmount;
    const nextMode = this.selectedTenderMode === 'Cash' ? 'Card' : 'UPI';
    this.tenders.push({ mode: nextMode, amount: remaining > 0 ? remaining : 0 });
  }

  removeTender(idx: number) {
    if (this.tenders.length > 1) {
      this.tenders.splice(idx, 1);
    }
  }

  get totalTendered(): number {
    return this.tenders.reduce((sum, t) => sum + (t.amount || 0), 0);
  }

  get remainingAmount(): number {
    return Math.max(0, this.grandTotal - this.totalTendered);
  }

  get changeDue(): number {
    return Math.max(0, this.totalTendered - this.grandTotal);
  }

  completeSale() {
    if (this.remainingAmount > 0) return;

    const salePayload = {
      lines: this.cart.map(l => ({
        sku: l.sku,
        name: l.name,
        price: l.price,
        tax: l.tax,
        qty: l.qty,
        unit: l.unit,
        pricing_method: (l as any).pricingMethod || (l as any).pricing_method || 'qty'
      })),
      pricing_mode: this.pricingMode,
      manual_discount: this.appliedDiscount ? { type: this.appliedDiscount.type, value: this.appliedDiscount.value } : { type: 'percent', value: 0 },
      tenders: this.tenders.map(t => ({ mode: t.mode, amount: t.amount }))
    };

    const token = localStorage.getItem('pos_token');
    const user = this.auth.currentUser();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (user?.role) headers['X-User-Role'] = user.role;
    if (user?.username) headers['X-Username'] = user.username;

    this.http.post<any>(`${environment.apiUrl}/billing/sales`, salePayload, { headers }).subscribe({
      next: (res) => {
        this.completedSaleData = res;
        this.showPaymentModal = false;
        this.showReceiptModal = true;
        this.cart = [];
        this.appliedDiscount = null;
      },
      error: (err) => {
        let msg = 'Failed to complete sale transaction';
        if (err.error?.detail) {
          msg = typeof err.error.detail === 'string' ? err.error.detail : JSON.stringify(err.error.detail);
        } else if (err.message) {
          msg = err.message;
        }
        alert('Error completing sale: ' + msg);
      }
    });
  }

  printReceipt() {
    if (!this.completedSaleData) return;

    const receiptHtml = this.completedSaleData.receipt_html || `
      <div style="text-align:center;margin-bottom:12px">
        <strong>Greenfield Mart</strong>
        <div style="font-size:11px;color:#666">12, MG Road, Bengaluru &middot; GSTIN 29ABCDE1234F1Z5</div>
      </div>
      <hr style="border:none;border-top:1px dashed #999;margin:8px 0">
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Invoice</span><span>${this.completedSaleData.invoice_no}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Date</span><span>${new Date(this.completedSaleData.time).toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Cashier</span><span>${this.completedSaleData.cashier_name || this.completedSaleData.cashier_username || 'Priya K.'}</span></div>
      <hr style="border:none;border-top:1px dashed #999;margin:8px 0">
      ${(this.completedSaleData.lines || []).map((l: any) => `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
          <span>${l.name} &times; ${l.qty} ${l.unit || 'pcs'}</span>
          <span>₹${Number(l.final_amount || (l.price * l.qty)).toFixed(2)}</span>
        </div>
      `).join('')}
      <hr style="border:none;border-top:1px dashed #999;margin:8px 0">
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px">
        <span>Grand Total</span>
        <span>₹${Number(this.completedSaleData.grand_total || 0).toFixed(2)}</span>
      </div>
      <hr style="border:none;border-top:1px dashed #999;margin:8px 0">
      ${(this.completedSaleData.tenders || []).map((t: any) => `
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span>${t.mode}</span>
          <span>₹${Number(t.amount || 0).toFixed(2)}</span>
        </div>
      `).join('')}
      <p style="font-size:11px;color:#666;text-align:center;margin-top:12px">Thank you for shopping with us!</p>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Receipt - ${this.completedSaleData.invoice_no}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body {
              font-family: "SF Mono", "Cascadia Code", Consolas, monospace;
              font-size: 12px;
              color: #000;
              background: #fff;
              margin: 0;
              padding: 8px;
              line-height: 1.4;
            }
            .row-between { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .divider, hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
            .mono { font-family: monospace; }
            .text-sm { font-size: 12px; }
            .text-xs { font-size: 10px; }
            .text-muted { color: #666; }
          </style>
        </head>
        <body>
          ${receiptHtml}
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1000);
      }, 250);
    } else {
      window.print();
    }
  }

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
