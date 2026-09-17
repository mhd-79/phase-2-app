import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Greenfield Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link active" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-REP-001..006 &middot; REAL-TIME METRICS</span>
            <h1>Reports &amp; Z-Report</h1>
            <p class="text-muted">Daily sales totals, tender breakdowns, itemized performance, cash drawer counters, and AI insights.</p>
          </div>
        </div>

        <!-- DATE FILTER BAR -->
        <div class="filter-bar" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 16px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div class="chip-group" style="display:flex; gap:6px; align-items:center;">
            <button class="chip" [class.active]="activeDateFilter === 'today'" (click)="setDateFilter('today')">Today</button>
            <button class="chip" [class.active]="activeDateFilter === 'week'" (click)="setDateFilter('week')">This Week</button>
            <button class="chip" [class.active]="activeDateFilter === 'month'" (click)="setDateFilter('month')">This Month</button>
            <button class="chip" [class.active]="activeDateFilter === 'custom'" (click)="setDateFilter('custom')">Custom Range</button>
          </div>
          
          <div *ngIf="activeDateFilter === 'custom'" style="display:flex; gap:8px; align-items:center;">
            <input type="date" class="input input-sm" [(ngModel)]="startDate" (change)="onCustomDateChange()">
            <span style="font-size:12px; color:var(--text-muted)">to</span>
            <input type="date" class="input input-sm" [(ngModel)]="endDate" (change)="onCustomDateChange()">
          </div>

          <div style="font-size:13px; font-weight:600; color:var(--text-muted)">
            Range: <span style="color:var(--text-main)">{{ startDate }}</span> to <span style="color:var(--text-main)">{{ endDate }}</span>
          </div>
        </div>

        <!-- NAVIGATION TABS -->
        <div class="tabs" style="display:flex; gap:12px; border-bottom:1px solid var(--border); margin-bottom:20px;">
          <div class="tab" [class.active]="activeTab === 'zreport'" (click)="switchTab('zreport')">Daily Sales (Z-Report)</div>
          <div class="tab" [class.active]="activeTab === 'itemsales'" (click)="switchTab('itemsales')">Sales by Item</div>
          <div class="tab" [class.active]="activeTab === 'cashdrawer'" (click)="switchTab('cashdrawer')">Cash Drawer</div>
          <div class="tab" [class.active]="activeTab === 'aiinsights'" (click)="switchTab('aiinsights')">AI Insights</div>
        </div>

        <!-- TAB 1: Z-REPORT & COMPLETED TRANSACTIONS -->
        <div *ngIf="activeTab === 'zreport'">
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:20px;">
            <div class="card stat-card"><div class="stat-label">Total Sales Revenue</div><div class="stat-value">₹{{ (zReportSummary?.total_sales || totalRevenue).toFixed(2) }}</div></div>
            <div class="card stat-card"><div class="stat-label">Transactions Count</div><div class="stat-value">{{ zReportSummary?.bill_count || transactions.length }}</div></div>
            <div class="card stat-card"><div class="stat-label">GST Tax Total</div><div class="stat-value">₹{{ (zReportSummary?.total_tax || totalTax).toFixed(2) }}</div></div>
            <div class="card stat-card"><div class="stat-label">Avg Bill Value</div><div class="stat-value">₹{{ (zReportSummary?.average_bill_value || 0).toFixed(2) }}</div></div>
          </div>

          <!-- Payment Breakup Pills -->
          <div *ngIf="zReportSummary?.payment_breakup" class="card" style="margin-bottom:16px; padding:12px 16px;">
            <span class="text-xs font-semibold text-muted" style="margin-right:12px;">Payment Mode Breakup:</span>
            <span class="badge badge-neutral" style="margin-right:8px; font-size:13px;">💵 Cash: ₹{{ (zReportSummary.payment_breakup.Cash || 0).toFixed(2) }}</span>
            <span class="badge badge-neutral" style="margin-right:8px; font-size:13px;">💳 Card: ₹{{ (zReportSummary.payment_breakup.Card || 0).toFixed(2) }}</span>
            <span class="badge badge-neutral" style="font-size:13px;">📱 UPI: ₹{{ (zReportSummary.payment_breakup.UPI || 0).toFixed(2) }}</span>
          </div>

          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3>Completed Transactions</h3>
              <span class="text-xs text-muted">Click 'Inspect' to view full receipt breakdown</span>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Date &amp; Time</th>
                  <th>Cashier</th>
                  <th>Payment Mode</th>
                  <th class="num">Items</th>
                  <th class="num">Grand Total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let tx of transactions">
                  <td><strong class="mono">{{ tx.invoice_no }}</strong></td>
                  <td>{{ tx.created_at | date:'medium' }}</td>
                  <td>{{ tx.cashier_name || tx.cashier_username || 'Priya K.' }}</td>
                  <td><span class="badge badge-neutral">{{ tx.payment_mode || 'Cash' }}</span></td>
                  <td class="num mono">{{ tx.item_count || tx.items_count || 1 }}</td>
                  <td class="num mono"><strong>₹{{ (tx.grand_total || 0).toFixed(2) }}</strong></td>
                  <td><button class="btn btn-secondary btn-sm" (click)="inspectInvoice(tx)">Inspect</button></td>
                </tr>
                <tr *ngIf="transactions.length === 0">
                  <td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">No completed transactions found for this date range.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB 2: SALES BY ITEM WITH DYNAMIC COLUMN SORTING -->
        <div *ngIf="activeTab === 'itemsales'" class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <h3>Item-wise Sales Breakdown</h3>
            <div style="display:flex; gap:10px; align-items:center;">
              <select class="select select-sm" [(ngModel)]="selectedCategory" (change)="loadItemSales()">
                <option value="All">All Categories</option>
                <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
              </select>
              <input class="input input-sm" style="max-width:220px;" [(ngModel)]="itemSearchQuery" (ngModelChange)="loadItemSales()" placeholder="Filter items...">
            </div>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th (click)="sortItemSales('sku')" style="cursor:pointer; user-select:none;">SKU {{ getSortIndicator('sku') }}</th>
                <th (click)="sortItemSales('name')" style="cursor:pointer; user-select:none;">Item Name {{ getSortIndicator('name') }}</th>
                <th (click)="sortItemSales('category')" style="cursor:pointer; user-select:none;">Category {{ getSortIndicator('category') }}</th>
                <th (click)="sortItemSales('qty')" style="cursor:pointer; user-select:none;" class="num">Qty Sold {{ getSortIndicator('qty') }}</th>
                <th (click)="sortItemSales('revenue')" style="cursor:pointer; user-select:none;" class="num">Sales Revenue {{ getSortIndicator('revenue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredItemSales">
                <td><span class="mono">{{ item.sku }}</span></td>
                <td><strong>{{ item.name }}</strong></td>
                <td><span class="badge badge-neutral">{{ item.category }}</span></td>
                <td class="num mono">{{ item.qty || item.qty_sold }} {{ item.unit || 'pcs' }}</td>
                <td class="num mono">₹{{ (item.revenue || item.total_revenue || 0).toFixed(2) }}</td>
              </tr>
              <tr *ngIf="filteredItemSales.length === 0">
                <td colspan="5" style="text-align:center; padding:24px; color:var(--text-muted);">No sales data matching criteria for this period.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- TAB 3: CASH DRAWER COUNTER MANAGEMENT -->
        <div *ngIf="activeTab === 'cashdrawer'">
          <div class="card" style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div>
                <h3>Cash Drawer Counters</h3>
                <p class="text-xs text-muted">Configure store registers and verify expected vs counted drawer cash.</p>
              </div>
              <button *ngIf="auth.isAdmin()" class="btn btn-primary btn-sm" (click)="showAddCounter = true">+ Add Counter</button>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th>Counter Name</th>
                  <th class="num">Opening Float</th>
                  <th class="num">Today's Cash Sales</th>
                  <th class="num">Expected Drawer Cash</th>
                  <th>Notes</th>
                  <th *ngIf="auth.isAdmin()">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let c of counters">
                  <td><strong>{{ c.counter_name }}</strong></td>
                  <td class="num mono">₹{{ c.opening_float.toFixed(2) }}</td>
                  <td class="num mono">₹{{ (c.cash_sales_today || 0).toFixed(2) }}</td>
                  <td class="num mono" style="font-weight:700; color:var(--primary);">₹{{ (c.expected_cash || c.opening_float).toFixed(2) }}</td>
                  <td><span class="text-xs text-muted">{{ c.notes || 'Main POS Counter' }}</span></td>
                  <td *ngIf="auth.isAdmin()"><button class="btn btn-secondary btn-sm" (click)="openEditFloatModal(c)">Edit Float</button></td>
                </tr>
                <tr *ngIf="counters.length === 0">
                  <td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No cash counters configured.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- TAB 4: AI INSIGHTS & STOCK SUGGESTIONS -->
        <div *ngIf="activeTab === 'aiinsights'" class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div>
              <h3>AI Best-Selling Insights</h3>
              <p class="text-muted text-sm">Automated sales pattern analysis and intelligent stock suggestions for selected period.</p>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              <span class="text-xs text-muted font-semibold">Sort Rank By:</span>
              <select class="select select-sm" [(ngModel)]="aiSortBy" (change)="loadAIInsights()">
                <option value="most_sold">Most Sold Qty</option>
                <option value="least_sold">Least Sold Qty (Slow Moving)</option>
                <option value="highest_revenue">Highest Revenue Drivers</option>
              </select>
            </div>
          </div>

          <div *ngIf="aiData" style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4>Ranked Product Performance</h4>
                <span class="badge badge-neutral">{{ aiData.total_items_analyzed }} Products Analyzed</span>
              </div>
              <ul style="display:flex; flex-direction:column; gap:8px;">
                <li *ngFor="let item of aiData.items" style="display:flex; justify-content:space-between; align-items:center; background:var(--surface); border:1px solid var(--border); padding:10px 14px; border-radius:8px;">
                  <div style="display:flex; gap:10px; align-items:center;">
                    <span class="badge badge-primary font-mono">#{{ item.rank }}</span>
                    <div>
                      <div style="font-weight:600; font-size:14px;">{{ item.name }}</div>
                      <div class="text-xs text-muted">{{ item.category }} &middot; Stock: {{ item.current_stock }} {{ item.unit }}</div>
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div class="mono" style="font-weight:700;">₹{{ item.revenue.toFixed(2) }}</div>
                    <div class="text-xs text-muted">{{ item.qty_sold }} {{ item.unit }} sold</div>
                  </div>
                </li>
                <li *ngIf="aiData.items.length === 0" class="text-muted text-sm" style="padding:16px; text-align:center;">
                  No product sales recorded for this timeframe.
                </li>
              </ul>
            </div>

            <div>
              <h4 style="margin-bottom:10px;">AI Dynamic Recommendations</h4>
              <div style="display:flex; flex-direction:column; gap:12px;">
                <div *ngFor="let rec of aiData.suggestions"
                     [style.background]="rec.type === 'warning' ? '#fffbe6' : (rec.type === 'success' ? '#e6f7ff' : '#f6ffed')"
                     [style.borderColor]="rec.type === 'warning' ? '#ffe58f' : (rec.type === 'success' ? '#91caff' : '#b7eb8f')"
                     style="border:1px solid; padding:14px; border-radius:10px;">
                  <div style="font-size:13px; font-weight:700; margin-bottom:4px;"
                       [style.color]="rec.type === 'warning' ? '#8c6b00' : (rec.type === 'success' ? '#003eb3' : '#135200')">
                    {{ rec.type === 'warning' ? '⚠️' : (rec.type === 'success' ? '🚀' : '💡') }} {{ rec.title }}
                  </div>
                  <div style="font-size:13px; color:var(--text-main);">{{ rec.message }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- INVOICE INSPECTION MODAL -->
    <div class="modal-overlay" [class.open]="selectedInvoice">
      <div class="modal modal-lg" *ngIf="selectedInvoice" style="max-width:600px;">
        <div class="modal-header">
          <div>
            <h3>Invoice Details #{{ selectedInvoice.invoice_no }}</h3>
            <p class="text-xs text-muted">{{ selectedInvoice.created_at | date:'medium' }} &middot; Cashier: {{ selectedInvoice.cashier_name || 'Priya K.' }}</p>
          </div>
          <button class="btn btn-ghost btn-sm" (click)="selectedInvoice = null">✕</button>
        </div>
        <div class="modal-body stack" style="gap:16px;">
          <table class="table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th class="num">Qty</th>
                <th class="num">Unit Price</th>
                <th class="num">Tax</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let line of selectedInvoice.lines || selectedInvoice.items || []">
                <td>
                  <div><strong>{{ line.name }}</strong></div>
                  <div class="text-xs text-muted mono">{{ line.sku }}</div>
                </td>
                <td class="num mono">{{ line.qty }}</td>
                <td class="num mono">₹{{ (line.unit_price || line.price || 0).toFixed(2) }}</td>
                <td class="num mono">{{ line.tax_rate || 0 }}%</td>
                <td class="num mono">₹{{ (line.final_amount || (line.price * line.qty) || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>

          <div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px 16px;">
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
              <span>Subtotal:</span>
              <span class="mono">₹{{ (selectedInvoice.subtotal_original || selectedInvoice.grand_total).toFixed(2) }}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;" *ngIf="selectedInvoice.discount_total">
              <span>Discount Total:</span>
              <span class="mono text-danger">-₹{{ selectedInvoice.discount_total.toFixed(2) }}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;" *ngIf="selectedInvoice.gst_total">
              <span>GST Tax Collected:</span>
              <span class="mono">₹{{ selectedInvoice.gst_total.toFixed(2) }}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:700; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
              <span>Grand Total:</span>
              <span class="mono" style="color:var(--primary);">₹{{ selectedInvoice.grand_total.toFixed(2) }}</span>
            </div>
            <div style="margin-top:8px; font-size:12px; color:var(--text-muted);">
              Tender Details: {{ selectedInvoice.tenders_summary || (selectedInvoice.payment_mode + ': ₹' + selectedInvoice.grand_total.toFixed(2)) }}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px; display:flex; justify-content:flex-end;">
          <button class="btn btn-secondary" (click)="selectedInvoice = null">Close Breakdown</button>
        </div>
      </div>
    </div>

    <!-- ADD COUNTER MODAL -->
    <div class="modal-overlay" [class.open]="showAddCounter">
      <div class="modal" style="max-width:400px;">
        <div class="modal-header">
          <h3>Add New Cash Counter</h3>
          <button class="btn btn-ghost btn-sm" (click)="showAddCounter = false">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:12px;">
          <div class="field">
            <label class="form-label">Counter Name</label>
            <input class="input" [(ngModel)]="newCounterForm.counter_name" placeholder="e.g. Counter 3 (Express)">
          </div>
          <div class="field">
            <label class="form-label">Opening Float (₹)</label>
            <input class="input mono" type="number" min="0" [(ngModel)]="newCounterForm.opening_float">
          </div>
          <div class="field">
            <label class="form-label">Notes / Location</label>
            <input class="input" [(ngModel)]="newCounterForm.notes" placeholder="e.g. Front Lane Checkout">
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary" (click)="showAddCounter = false">Cancel</button>
          <button class="btn btn-primary" (click)="createCounter()">Create Counter</button>
        </div>
      </div>
    </div>

    <!-- EDIT FLOAT MODAL -->
    <div class="modal-overlay" [class.open]="editingCounter">
      <div class="modal" style="max-width:400px;" *ngIf="editingCounter">
        <div class="modal-header">
          <h3>Edit Opening Float: {{ editingCounter.counter_name }}</h3>
          <button class="btn btn-ghost btn-sm" (click)="editingCounter = null">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:12px;">
          <div class="field">
            <label class="form-label">Opening Float Amount (₹)</label>
            <input class="input mono" type="number" min="0" [(ngModel)]="editFloatValue">
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary" (click)="editingCounter = null">Cancel</button>
          <button class="btn btn-primary" (click)="saveEditedFloat()">Update Float</button>
        </div>
      </div>
    </div>
  `
})
export class ReportsComponent implements OnInit {
  activeDateFilter: string = 'today';
  activeTab: string = 'zreport';
  startDate: string = '';
  endDate: string = '';
  
  zReportSummary: any = null;
  totalRevenue: number = 0;
  totalTax: number = 0;
  transactions: any[] = [];
  
  categories: string[] = ['Beverages', 'Snacks', 'Dairy', 'Bakery', 'Grocery', 'Personal Care'];
  selectedCategory: string = 'All';
  itemSales: any[] = [];
  filteredItemSales: any[] = [];
  itemSearchQuery: string = '';
  sortField: string = 'revenue';
  sortAsc: boolean = false;
  
  counters: any[] = [];
  selectedInvoice: any = null;
  showAddCounter: boolean = false;
  newCounterForm: any = { counter_name: '', opening_float: 1000.0, notes: '' };
  
  editingCounter: any = null;
  editFloatValue: number = 0;

  aiSortBy: string = 'most_sold';
  aiData: any = null;

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit() {
    this.loadCategories();
    this.setDateFilter('today');
  }

  loadCategories() {
    this.http.get<string[]>(`${environment.apiUrl}/catalog/categories`).subscribe({
      next: (cats) => { this.categories = cats; },
      error: () => {}
    });
  }

  setDateFilter(filter: string) {
    this.activeDateFilter = filter;
    const now = new Date();
    
    if (filter === 'today') {
      const yyyyMmDd = now.toISOString().slice(0, 10);
      this.startDate = yyyyMmDd;
      this.endDate = yyyyMmDd;
    } else if (filter === 'week') {
      // Strictly Monday through Sunday
      const day = now.getDay();
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diffToMon));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      this.startDate = monday.toISOString().slice(0, 10);
      this.endDate = sunday.toISOString().slice(0, 10);
    } else if (filter === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      this.startDate = firstDay.toISOString().slice(0, 10);
      this.endDate = lastDay.toISOString().slice(0, 10);
    }
    
    this.reloadActiveTabData();
  }

  onCustomDateChange() {
    if (this.startDate && this.endDate) {
      this.reloadActiveTabData();
    }
  }

  switchTab(tab: string) {
    this.activeTab = tab;
    this.reloadActiveTabData();
  }

  reloadActiveTabData() {
    if (this.activeTab === 'zreport') {
      this.loadZReportAndTransactions();
    } else if (this.activeTab === 'itemsales') {
      this.loadItemSales();
    } else if (this.activeTab === 'cashdrawer') {
      this.loadCashCounters();
    } else if (this.activeTab === 'aiinsights') {
      this.loadAIInsights();
    }
  }

  loadZReportAndTransactions() {
    const periodParam = this.activeDateFilter === 'week' ? 'this_week' : (this.activeDateFilter === 'month' ? 'this_month' : this.activeDateFilter);
    const urlSummary = `${environment.apiUrl}/reports/z-report?period=${periodParam}&start_date=${this.startDate}&end_date=${this.endDate}`;
    
    this.http.get<any>(urlSummary).subscribe({
      next: (summary) => {
        this.zReportSummary = summary;
      },
      error: () => {}
    });

    const urlTx = `${environment.apiUrl}/reports/completed-transactions?period=${periodParam}&start_date=${this.startDate}&end_date=${this.endDate}`;
    this.http.get<any[]>(urlTx).subscribe({
      next: (data) => {
        this.transactions = data;
        this.totalRevenue = data.reduce((sum, t) => sum + (t.grand_total || 0), 0);
        this.totalTax = data.reduce((sum, t) => sum + (t.gst_total || 0), 0);
      },
      error: () => {
        this.transactions = [];
      }
    });
  }

  loadItemSales() {
    const periodParam = this.activeDateFilter === 'week' ? 'this_week' : (this.activeDateFilter === 'month' ? 'this_month' : this.activeDateFilter);
    let url = `${environment.apiUrl}/reports/item-sales?period=${periodParam}&start_date=${this.startDate}&end_date=${this.endDate}`;
    
    if (this.selectedCategory && this.selectedCategory !== 'All') {
      url += `&category=${encodeURIComponent(this.selectedCategory)}`;
    }
    if (this.itemSearchQuery.trim()) {
      url += `&search=${encodeURIComponent(this.itemSearchQuery.trim())}`;
    }
    url += `&sort_by=${this.sortField}&sort_asc=${this.sortAsc}`;

    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.itemSales = data;
        this.filteredItemSales = data;
      },
      error: () => {
        this.filteredItemSales = [];
      }
    });
  }

  sortItemSales(field: string) {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = false; // default descending for numbers/revenue
    }
    this.loadItemSales();
  }

  getSortIndicator(field: string): string {
    if (this.sortField !== field) return '';
    return this.sortAsc ? '▲' : '▼';
  }

  loadCashCounters() {
    this.http.get<any[]>(`${environment.apiUrl}/reports/cash-counters`).subscribe({
      next: (data) => {
        this.counters = data;
      },
      error: () => {
        this.counters = [];
      }
    });
  }

  createCounter() {
    if (!this.newCounterForm.counter_name.trim()) {
      alert('Please enter a valid counter name');
      return;
    }
    if (this.newCounterForm.opening_float < 0) {
      alert('Opening float cannot be negative');
      return;
    }

    this.http.post<any>(`${environment.apiUrl}/reports/cash-counters`, this.newCounterForm).subscribe({
      next: (res) => {
        alert(`Counter "${res.counter_name}" created successfully!`);
        this.showAddCounter = false;
        this.newCounterForm = { counter_name: '', opening_float: 1000.0, notes: '' };
        this.loadCashCounters();
      },
      error: (err) => {
        alert('Error creating counter: ' + (err.error?.detail || 'Failed'));
      }
    });
  }

  openEditFloatModal(c: any) {
    this.editingCounter = c;
    this.editFloatValue = c.opening_float;
  }

  saveEditedFloat() {
    if (!this.editingCounter) return;
    if (this.editFloatValue < 0) {
      alert('Opening float must be greater than or equal to 0');
      return;
    }

    const url = `${environment.apiUrl}/reports/cash-counters/${this.editingCounter.id}`;
    this.http.put<any>(url, { opening_float: this.editFloatValue }).subscribe({
      next: (res) => {
        alert(`Opening float for ${res.counter_name} updated to ₹${res.opening_float.toFixed(2)}`);
        this.editingCounter = null;
        this.loadCashCounters();
      },
      error: (err) => {
        alert('Error updating float: ' + (err.error?.detail || 'Failed'));
      }
    });
  }

  loadAIInsights() {
    const periodParam = this.activeDateFilter === 'week' ? 'this_week' : (this.activeDateFilter === 'month' ? 'this_month' : this.activeDateFilter);
    const url = `${environment.apiUrl}/reports/ai-insights?period=${periodParam}&start_date=${this.startDate}&end_date=${this.endDate}&sort_by=${this.aiSortBy}`;

    this.http.get<any>(url).subscribe({
      next: (data) => {
        this.aiData = data;
      },
      error: () => {}
    });
  }

  inspectInvoice(tx: any) {
    this.selectedInvoice = tx;
  }
}

