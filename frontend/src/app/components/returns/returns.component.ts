import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Okuto Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link active" routerLink="/returns" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">🔄 Returns &amp; Refunds</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>

        <div class="sidebar__footer" style="margin-top:auto; padding:16px 8px 8px; border-top:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <div class="avatar" style="width:32px; height:32px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">{{ auth.currentUser().initials }}</div>
            <div style="overflow:hidden;">
              <div class="text-sm" style="font-weight:600; line-height:1.2; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; color:var(--slate-200);">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize; color:var(--slate-400);">{{ auth.currentUser().role }}</div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="signOut()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:6px; color:#f87171; border:1px solid rgba(239,68,68,0.2);">
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-POS-008, FR-P1-STK-003</span>
            <h1>Returns &amp; Refunds</h1>
            <p class="text-muted">Search invoice number, specify returned items, restore inventory stock in database, and issue refund.</p>
          </div>
        </div>

        <div class="card" style="margin-bottom:24px;">
          <div class="form-grid">
            <div class="field">
              <label>Search Invoice Number or Cashier</label>
              <div class="input-group" style="display:flex; gap:8px;">
                <input class="input" [(ngModel)]="searchInvoiceNo" (keyup.enter)="searchInvoice()" placeholder="e.g. INV-FY26-01025 or 1025" style="flex:1;">
                <button class="btn btn-primary" (click)="searchInvoice()">Search Invoice</button>
              </div>
              <p *ngIf="searchError" class="text-xs" style="color:var(--danger-600); margin-top:6px;">{{ searchError }}</p>
            </div>
          </div>
        </div>

        <!-- SEARCH RESULTS IF MULTIPLE -->
        <div *ngIf="searchResults.length > 1" class="card" style="margin-bottom:24px;">
          <h3>Matching Invoices ({{ searchResults.length }})</h3>
          <table class="table" style="margin-top:12px;">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date &amp; Time</th>
                <th>Cashier</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let inv of searchResults">
                <td><strong class="mono">{{ inv.invoice_no }}</strong></td>
                <td>{{ inv.time_formatted || (inv.time | date:'short') }}</td>
                <td>{{ inv.cashier_name || inv.cashier_username }}</td>
                <td class="mono">₹{{ inv.grand_total.toFixed(2) }}</td>
                <td><span class="badge" [class.badge-success]="inv.status === 'COMPLETED'" [class.badge-warning]="inv.status === 'RETURNED'">{{ inv.status }}</span></td>
                <td><button class="btn btn-secondary btn-sm" (click)="selectInvoice(inv)">Select</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- INVOICE DETAILS & RETURN FORM -->
        <div *ngIf="foundInvoice" class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div>
              <h3>Invoice #{{ foundInvoice.invoice_no }}</h3>
              <p class="text-sm text-muted">
                Cashier: <strong>{{ foundInvoice.cashier_name || foundInvoice.cashier_username || 'Priya K.' }}</strong> &middot; 
                Date: {{ foundInvoice.time | date:'medium' }} &middot; 
                Status: <span class="badge" [class.badge-success]="foundInvoice.status === 'COMPLETED'" [class.badge-warning]="foundInvoice.status === 'RETURNED'">{{ foundInvoice.status }}</span>
              </p>
            </div>
            <div class="mono" style="font-size:18px; font-weight:700;">
              Total Paid: ₹{{ (foundInvoice.grand_total || 0).toFixed(2) }}
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <label class="form-label" style="font-size:12px; font-weight:600; color:var(--text-muted);">Return Reason</label>
            <input class="input" [(ngModel)]="returnReason" placeholder="e.g. Customer change of mind / Defective product" style="max-width:400px;">
          </div>
          
          <table class="table" style="margin-top:12px;">
            <thead>
              <tr>
                <th>Item SKU &amp; Name</th>
                <th class="num">Qty Purchased</th>
                <th class="num">Unit Price</th>
                <th class="num">Line Total</th>
                <th>Return Qty</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of foundInvoice.lines">
                <td>
                  <strong>{{ item.name }}</strong>
                  <div class="text-xs text-subtle mono">{{ item.sku }}</div>
                </td>
                <td class="num mono">{{ item.qty }} {{ item.unit || 'pcs' }}</td>
                <td class="num mono">₹{{ item.price.toFixed(2) }}</td>
                <td class="num mono">₹{{ (item.final_amount || (item.price * item.qty)).toFixed(2) }}</td>
                <td>
                  <input type="number" class="input input-sm mono" style="width:90px;" [(ngModel)]="item.returnQty" min="1" [max]="item.qty">
                </td>
                <td>
                  <button class="btn btn-danger btn-sm" [disabled]="processingReturnSku === item.sku" (click)="processReturn(item)">
                    {{ processingReturnSku === item.sku ? 'Refunding...' : 'Process Refund' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  `
})
export class ReturnsComponent implements OnInit {
  searchInvoiceNo: string = '';
  searchResults: any[] = [];
  foundInvoice: any = null;
  searchError: string = '';
  returnReason: string = 'Customer return';
  processingReturnSku: string | null = null;

  constructor(
    public auth: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {}

  searchInvoice() {
    this.searchError = '';
    this.foundInvoice = null;
    this.searchResults = [];
    const query = this.searchInvoiceNo.trim();
    if (!query) {
      this.searchError = 'Please enter an invoice number to search.';
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/billing/sales/` + encodeURIComponent(query)).subscribe({
      next: (data) => {
        if (data.lines) {
          data.lines = data.lines.map((l: any) => ({ ...l, returnQty: l.qty }));
        }
        this.foundInvoice = data;
      },
      error: () => {
        // Try searching invoices list
        this.http.get<any[]>(`${environment.apiUrl}/billing/invoices/search?q=` + encodeURIComponent(query)).subscribe({
          next: (list) => {
            if (list.length === 1) {
              this.selectInvoice(list[0]);
            } else if (list.length > 1) {
              this.searchResults = list;
            } else {
              this.searchError = 'No matching invoice found in database for "' + query + '".';
            }
          },
          error: () => {
            this.searchError = 'No matching invoice found in database for "' + query + '".';
          }
        });
      }
    });
  }

  selectInvoice(inv: any) {
    this.http.get<any>(`${environment.apiUrl}/billing/sales/` + encodeURIComponent(inv.invoice_no)).subscribe({
      next: (data) => {
        if (data.lines) {
          data.lines = data.lines.map((l: any) => ({ ...l, returnQty: l.qty }));
        }
        this.foundInvoice = data;
        this.searchResults = [];
      }
    });
  }

  processReturn(item: any) {
    if (!item.returnQty || item.returnQty <= 0) {
      alert('Return quantity must be greater than 0');
      return;
    }
    if (item.returnQty > item.qty) {
      alert('Return quantity cannot exceed quantity purchased (' + item.qty + ')');
      return;
    }
    if (this.processingReturnSku === item.sku) return;
    this.processingReturnSku = item.sku;

    const returnTxId = 'ret_' + this.foundInvoice.invoice_no + '_' + item.sku + '_' + Date.now();
    const returnPayload = {
      invoice_no: this.foundInvoice.invoice_no,
      reason: this.returnReason,
      items: [{ sku: item.sku, qty: item.returnQty }],
      idempotency_key: returnTxId
    };

    const token = localStorage.getItem('pos_token');
    const user = this.auth.currentUser();
    const headers: Record<string, string> = {
      'Idempotency-Key': returnTxId
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (user?.role) headers['X-User-Role'] = user.role;
    if (user?.username) headers['X-Username'] = user.username;

    this.http.post<any>(`${environment.apiUrl}/billing/returns`, returnPayload, { headers }).subscribe({
      next: (res) => {
        this.processingReturnSku = null;
        alert(res.message || ('Return processed successfully! Refund issued for ' + item.name));
        this.searchInvoice();
      },
      error: (err) => {
        this.processingReturnSku = null;
        alert('Return error: ' + (err.error?.detail || 'Failed to process return.'));
      }
    });
  }

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
