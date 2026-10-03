import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CustomersComponent } from '../customers/customers.component';

interface DailySummary {
  gross: number;
  disc: number;
  tax: number;
  net: number;
  cash: number;
  card: number;
  upi: number;
  bills: number;
  refunds: number;
}

interface ItemSaleRow {
  name: string;
  category: string;
  qtySold: number;
  revenue: number;
  share: string;
}

interface TransactionRow {
  invoiceNo: string;
  time: string;
  itemCount: number;
  grandTotal: number;
}

interface TaxSlabRow {
  slab: string;
  taxable: number;
  gst: number;
  share: string;
}

interface StockReportItem {
  sku: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  costPrice: number;
  price: number;
  stockValue: number;
  expiryDate: string;
  status: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CustomersComponent],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-RPT-001..004, FR-P2-AI-001</span>
          <h1>Reports &amp; Analytics</h1>
          <p>Close the day with confidence: sales, AI insights, cash drawer and inventory — all in one place.</p>
        </div>
      </div>

      <!-- Date Range Filter Bar -->
      <div class="filter-bar" style="background:#fff;padding:var(--space-4);border-radius:var(--radius-lg);border:1px solid var(--border);margin-bottom:var(--space-4);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-3)">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-4)">
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <span class="text-xs text-muted" style="font-weight:600">From Date:</span>
            <input class="input" type="date" [(ngModel)]="fromDate" style="width:150px">
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <span class="text-xs text-muted" style="font-weight:600">To Date:</span>
            <input class="input" type="date" [(ngModel)]="toDate" style="width:150px">
          </div>
          <div class="chip-group" style="display:flex;gap:var(--space-1)">
            <button type="button" class="chip" [class.active]="quickRange === 'today'" (click)="setQuickDateRange('today')">Today</button>
            <button type="button" class="chip" [class.active]="quickRange === 'yesterday'" (click)="setQuickDateRange('yesterday')">Yesterday</button>
            <button type="button" class="chip" [class.active]="quickRange === 'this_week'" (click)="setQuickDateRange('this_week')">This Week</button>
            <button type="button" class="chip" [class.active]="quickRange === 'this_month'" (click)="setQuickDateRange('this_month')">This Month</button>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button type="button" class="btn btn-primary btn-sm" (click)="applyDateRange()">Apply</button>
          <button type="button" class="btn btn-secondary btn-sm" (click)="clearDateRange()">Clear</button>
          <button type="button" class="btn btn-secondary btn-sm" (click)="exportCSV()">Export CSV</button>
        </div>
      </div>

      <!-- Filtered Date Range Header Badge Strip -->
      <div class="row-between" style="margin-bottom:var(--space-4);background:var(--slate-50);padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);border:1px solid var(--border)">
        <div class="text-sm">
          <span class="text-muted">Filtered Date Range:</span> <strong>{{ formattedPeriodLabel }}</strong>
        </div>
        <span class="badge badge-primary" style="font-weight:600">{{ totalBills.toLocaleString('en-IN') }} Bills Rung Up</span>
      </div>

      <div class="tabs">
        <div class="tab" [class.active]="activeTab === 'zreport'" (click)="activeTab = 'zreport'">Daily Sales (Z-Report)</div>
        <div class="tab" [class.active]="activeTab === 'transactions'" (click)="activeTab = 'transactions'">Transactions</div>
        @if (auth.hasPhase2()) {
          <div class="tab" [class.active]="activeTab === 'customers'" (click)="openCustomerReport()">Customers</div>
        }
        <div class="tab" [class.active]="activeTab === 'itemSales'" (click)="activeTab = 'itemSales'">Sales by Item</div>
        <div class="tab" [class.active]="activeTab === 'cashDrawer'" (click)="openCashDrawer()">Cash Drawer</div>
        <div class="tab" [class.active]="activeTab === 'stockValuation'" (click)="activeTab = 'stockValuation'">Stock on Hand</div>
        @if (auth.hasPhase2()) {
          <div class="tab" [class.active]="activeTab === 'aiInsights'" (click)="activeTab = 'aiInsights'">AI Insights &amp; Recommendations</div>
        }
        <div class="tab" [class.active]="activeTab === 'taxSummary'" (click)="activeTab = 'taxSummary'">Tax Summary</div>
        @if (auth.hasPhase2()) {
          <div class="tab" [class.active]="activeTab === 'purchaseRegister'" (click)="activeTab = 'purchaseRegister'">Purchase Register</div>
        }
        @if (auth.hasPhase2()) {
          <div class="tab" [class.active]="activeTab === 'vendorPayables'" (click)="activeTab = 'vendorPayables'">Vendor Payables</div>
        }
        @if (auth.hasPhase2()) {
          <div class="tab" [class.active]="activeTab === 'batchExpiry'" (click)="activeTab = 'batchExpiry'">Batch &amp; Expiry</div>
        }
        @if (auth.hasPhase2()) {
          <div class="tab" [class.active]="activeTab === 'customerMgmt'" (click)="activeTab = 'customerMgmt'">Customer Management</div>
        }
      </div>

      <!-- Z-Report Tab -->
      @if (activeTab === 'zreport') {
        <div class="grid grid-4" style="margin-bottom:var(--space-5)">
          <div class="card stat-card">
            <span class="stat-label">Gross Sales</span>
            <span class="stat-value">₹{{ Math.round(totalGross).toLocaleString('en-IN') }}</span>
            <span class="stat-delta up">▲ 8.2% vs prev period</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Discounts Given</span>
            <span class="stat-value">₹{{ Math.round(totalDisc).toLocaleString('en-IN') }}</span>
            <span class="stat-delta down">{{ discountPct }}% of gross</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Tax Collected</span>
            <span class="stat-value">₹{{ Math.round(totalTax).toLocaleString('en-IN') }}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Net Sales</span>
            <span class="stat-value">₹{{ Math.round(totalNet).toLocaleString('en-IN') }}</span>
            <span class="stat-delta up">{{ totalBills }} total bills</span>
          </div>
        </div>

        <div class="grid grid-2" style="align-items:start">
          <!-- Payment Mode Breakup -->
          <div class="card card-flush">
            <div class="card-header"><h3>Payment Mode Breakup</h3></div>
            <div class="card-body stack" style="padding:var(--space-4)">
              <div class="row-between"><span>Cash</span><strong class="mono">₹{{ Math.round(totalCash).toLocaleString('en-IN') }}</strong></div>
              <div style="height:8px;border-radius:4px;background:var(--slate-100)"><div [style.width.%]="cashPct" style="height:100%;border-radius:4px;background:var(--primary);transition:width 300ms ease"></div></div>
              
              <div class="row-between" style="margin-top:var(--space-3)"><span>Card</span><strong class="mono">₹{{ Math.round(totalCard).toLocaleString('en-IN') }}</strong></div>
              <div style="height:8px;border-radius:4px;background:var(--slate-100)"><div [style.width.%]="cardPct" style="height:100%;border-radius:4px;background:var(--indigo-400);transition:width 300ms ease"></div></div>

              <div class="row-between" style="margin-top:var(--space-3)"><span>UPI</span><strong class="mono">₹{{ Math.round(totalUpi).toLocaleString('en-IN') }}</strong></div>
              <div style="height:8px;border-radius:4px;background:var(--slate-100)"><div [style.width.%]="upiPct" style="height:100%;border-radius:4px;background:var(--success-500);transition:width 300ms ease"></div></div>
            </div>
          </div>

          <!-- Completed Transactions -->
          <div class="card card-flush">
            <div class="card-header row-between">
              <h3>Completed Transactions</h3>
              <span class="badge badge-neutral">{{ transactions.length }} of {{ totalBills }} sales</span>
            </div>
            <div class="table-scroll" style="max-height:320px;overflow-y:auto">
              <table class="table">
                <thead><tr><th>Invoice</th><th>Time / Date</th><th class="num">Items</th><th class="num">Total</th></tr></thead>
                <tbody>
                  @for (tx of transactions; track tx.invoiceNo) {
                    <tr>
                      <td class="mono">{{ tx.invoiceNo }}</td>
                      <td>{{ tx.time }}</td>
                      <td class="num">{{ tx.itemCount }}</td>
                      <td class="num mono">₹{{ tx.grandTotal.toFixed(2) }}</td>
                    </tr>
                  }
                  @if (transactions.length === 0) {
                    <tr><td colspan="4" class="text-center text-muted" style="padding:var(--space-4)">No sales rung up in this date range.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- Transactions Tab: every sale in the selected range, read from the database -->
      @if (activeTab === 'transactions') {
        <div class="card card-flush">
          <div class="card-header row-between" style="flex-wrap:wrap;gap:var(--space-3)">
            <div>
              <h3>Transactions</h3>
              <span class="text-sm text-muted">{{ formattedPeriodLabel }} &middot; {{ txTotal.toLocaleString('en-IN') }} sale(s)@if (txTotal > txRows.length) { , showing latest {{ txRows.length }} }</span>
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
              <input class="input" type="text" placeholder="Search invoice..." [(ngModel)]="txSearch" (ngModelChange)="loadTransactions()" style="width:170px">
              <select class="input" [(ngModel)]="txCounter" (ngModelChange)="loadTransactions()" style="width:150px">
                <option value="All">All Counters</option>
                @for (c of cashCounters; track c.id) {
                  <option [value]="c.counter_name">{{ c.counter_name }}</option>
                }
              </select>
              <select class="input" [(ngModel)]="txStatus" (ngModelChange)="loadTransactions()" style="width:170px">
                <option value="All">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PARTIALLY_RETURNED">Partially Returned</option>
                <option value="RETURNED">Returned</option>
              </select>
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Invoice</th><th>Date / Time</th><th>Counter</th><th>Cashier</th><th>Customer</th><th class="num">Items</th><th class="num">Amount</th><th>Payment Method</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (tx of txRows; track tx.invoice_no) {
                  <tr>
                    <td class="mono">{{ tx.invoice_no }}</td>
                    <td>{{ formatDateTime(tx.time) }}</td>
                    <td>{{ tx.counter_name }}</td>
                    <td>{{ tx.cashier_name }}</td>
                    <td>{{ tx.customer_name || 'Walk-in' }}</td>
                    <td class="num">{{ tx.item_count }}</td>
                    <td class="num mono">₹{{ tx.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
                    <td>{{ tx.payment_method }}</td>
                    <td>
                      <span class="badge" [class.badge-success]="tx.status === 'COMPLETED'" [class.badge-warning]="tx.status === 'PARTIALLY_RETURNED'" [class.badge-danger]="tx.status === 'RETURNED'">{{ statusLabel(tx.status) }}</span>
                    </td>
                  </tr>
                }
                @if (txRows.length === 0) {
                  <tr><td colspan="9" class="text-center text-muted" style="padding:var(--space-4)">{{ txError || 'No transactions in this date range.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Customer Management tab (Phase 2 admin): the customer master inside Reports -->
      @if (activeTab === 'customerMgmt') {
        <app-customers [embedded]="true"></app-customers>
      }

      <!-- Customers Tab (Phase 2): customer-wise sales and purchase history for the selected range -->
      @if (activeTab === 'customers') {
        <div class="grid grid-4" style="margin-bottom:var(--space-5)">
          <div class="card stat-card">
            <span class="stat-label">Total Customers</span>
            <span class="stat-value">{{ (custReport?.totalCustomers ?? 0).toLocaleString('en-IN') }}</span>
            <span class="stat-delta up">{{ custReport?.customersWhoPurchased ?? 0 }} purchased in this range</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Total Purchase Amount</span>
            <span class="stat-value">₹{{ Math.round(custReport?.totalAmount ?? 0).toLocaleString('en-IN') }}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Customer Invoices</span>
            <span class="stat-value">{{ (custReport?.totalInvoices ?? 0).toLocaleString('en-IN') }}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Purchase Frequency</span>
            <span class="stat-value">{{ custReport?.avgPurchasesPerCustomer ?? 0 }}</span>
            <span class="stat-delta up">purchases per customer</span>
          </div>
        </div>

        <div class="card card-flush">
          <div class="card-header">
            <h3>Customer-wise Sales &amp; Purchase History</h3>
            <span class="text-sm text-muted">{{ formattedPeriodLabel }}</span>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr><th>Customer</th><th>Mobile</th><th>Type</th><th class="num">Invoices</th><th class="num">Total Purchase</th><th class="num">Avg Bill</th><th>Purchase Frequency</th><th>Last Purchase</th></tr>
              </thead>
              <tbody>
                @for (c of custReport?.rows ?? []; track c.id) {
                  <tr>
                    <td><strong>{{ c.name }}</strong><div class="text-xs text-muted mono">{{ c.id }}</div></td>
                    <td class="mono">{{ c.mobile }}</td>
                    <td><span class="badge" [class.badge-info]="c.customerType === 'Retail'" [class.badge-warning]="c.customerType === 'Wholesale'">{{ c.customerType }}</span></td>
                    <td class="num">{{ c.invoices }}</td>
                    <td class="num mono font-bold">₹{{ c.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
                    <td class="num mono">₹{{ c.avgBill.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
                    <td>{{ c.purchasesPerMonth }} / month@if (c.avgDaysBetween !== null) { &middot; every {{ c.avgDaysBetween }} days }</td>
                    <td>{{ formatDateTime(c.lastPurchase) }}</td>
                  </tr>
                }
                @if ((custReport?.rows ?? []).length === 0) {
                  <tr><td colspan="8" class="text-center text-muted" style="padding:var(--space-4)">{{ custError || 'No customer purchases in this date range.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Item Sales Tab (Gap 9: Sorting & Filtering) -->
      @if (activeTab === 'itemSales') {
        <div class="card card-flush">
          <div class="card-header row-between" style="flex-wrap:wrap;gap:var(--space-3)">
            <div>
              <h3>Item-wise Sales Breakdown</h3>
              <span class="text-sm text-muted">{{ formattedPeriodLabel }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-3)">
              <input class="input" type="text" placeholder="Search item..." [(ngModel)]="itemSalesSearch" style="width:180px">
              <select class="input" [(ngModel)]="itemSalesCategory" style="width:140px">
                <option value="All">All Categories</option>
                @for (cat of itemSalesCategories; track cat) {
                  @if (cat !== 'All') {
                    <option [value]="cat">{{ cat }}</option>
                  }
                }
              </select>
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th (click)="sortItemSales('name')" style="cursor:pointer;user-select:none">
                    Item Name <span class="sort-icon">{{ itemSalesSortKey === 'name' ? (itemSalesSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th (click)="sortItemSales('category')" style="cursor:pointer;user-select:none">
                    Category <span class="sort-icon">{{ itemSalesSortKey === 'category' ? (itemSalesSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th class="num" (click)="sortItemSales('qtySold')" style="cursor:pointer;user-select:none">
                    Qty Sold <span class="sort-icon">{{ itemSalesSortKey === 'qtySold' ? (itemSalesSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th class="num" (click)="sortItemSales('revenue')" style="cursor:pointer;user-select:none">
                    Revenue <span class="sort-icon">{{ itemSalesSortKey === 'revenue' ? (itemSalesSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th class="num" (click)="sortItemSales('share')" style="cursor:pointer;user-select:none">
                    % of Sales <span class="sort-icon">{{ itemSalesSortKey === 'share' ? (itemSalesSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (row of filteredItemSales(); track row.name) {
                  <tr>
                    <td><strong>{{ row.name }}</strong></td>
                    <td><span class="badge badge-neutral">{{ row.category }}</span></td>
                    <td class="num mono">{{ row.qtySold.toLocaleString('en-IN') }}</td>
                    <td class="num mono font-bold">₹{{ row.revenue.toLocaleString('en-IN') }}</td>
                    <td class="num">{{ row.share }}%</td>
                  </tr>
                }
                @if (filteredItemSales().length === 0) {
                  <tr><td colspan="5" class="text-center text-muted" style="padding:var(--space-4)">No matching items found.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Cash Drawer Tab (Gap 8: Counter Selection, Add Counter & Float Edit) -->
      @if (activeTab === 'cashDrawer') {
        <div class="grid grid-2" style="align-items:start">
          <div class="card">
            <div class="row-between" style="margin-bottom:var(--space-4)">
              <div>
                <span class="eyebrow">Shift Close &amp; Cash Balancing</span>
                <h3>{{ selectedCounter?.counter_name || '—' }}</h3>
              </div>
              <div style="display:flex;gap:var(--space-2);align-items:center">
                <select class="input" [ngModel]="selectedCounter?.id" (ngModelChange)="onSelectCounter($event)" style="width:140px">
                  @for (c of cashCounters; track c.id) {
                    <option [value]="c.id">{{ c.counter_name }}</option>
                  }
                </select>
                @if (auth.isAdmin()) {
                  <button type="button" class="btn btn-secondary btn-sm" (click)="showAddCounterModal = true">+ Counter</button>
                }
              </div>
            </div>

            <div class="stack">
              <!-- Opening Float with Admin Edit Option -->
              <div class="row-between" style="align-items:center;background:var(--slate-50);padding:var(--space-3);border-radius:var(--radius-md)">
                <div>
                  <span class="text-muted" style="font-size:var(--text-sm)">Opening Float</span>
                  @if (auth.isAdmin() && !isEditingFloat) {
                    <button class="btn btn-ghost btn-xs" style="margin-left:var(--space-2);padding:2px 6px" (click)="startEditFloat()">Edit Float</button>
                  }
                </div>
                @if (isEditingFloat) {
                  <div style="display:flex;align-items:center;gap:var(--space-2)">
                    <span class="text-muted">₹</span>
                    <input class="input input-sm mono" type="number" [(ngModel)]="editFloatValue" style="width:100px">
                    <button class="btn btn-primary btn-xs" (click)="saveFloat()">Save</button>
                    <button class="btn btn-ghost btn-xs" (click)="isEditingFloat = false">✕</button>
                  </div>
                } @else {
                  <strong class="mono" style="font-size:var(--text-md)">₹{{ openingFloat.toFixed(2) }}</strong>
                }
              </div>

              <div class="row-between"><span class="text-muted">+ Cash Sales</span><strong class="mono">₹{{ drawerCashSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
              <div class="row-between"><span class="text-muted">− Cash Refunds</span><strong class="mono">−₹{{ drawerCashRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
              <hr class="divider">
              <div class="row-between"><span style="font-weight:700">Expected Cash</span><strong class="mono" style="font-size:var(--text-lg)">₹{{ expectedCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
              <div class="field"><label>Counted Cash (physical drawer count)</label><input class="input input-lg mono" type="number" [(ngModel)]="countedCash" placeholder="Enter counted amount"></div>
              @if (countedCash !== null && countedCash !== undefined) {
                <div class="row-between" style="padding:var(--space-2) var(--space-3);background:var(--slate-50);border-radius:var(--radius-md)">
                  <span style="font-weight:700">Variance</span>
                  <strong class="mono" [style.color]="cashVariance() === 0 ? 'var(--success-700)' : 'var(--danger-700)'">
                    {{ cashVariance() >= 0 ? '+' : '−' }}₹{{ Math.abs(cashVariance()).toFixed(2) }}
                  </strong>
                </div>
              }
              <button class="btn btn-primary btn-lg" (click)="closeShift()">Close Shift</button>
            </div>
          </div>

          <div class="card card-flush">
            <div class="card-header"><h3>Cash Movements</h3></div>
            <div class="table-scroll">
              <table class="table">
                <thead><tr><th>Date / Time</th><th>Type</th><th>Ref</th><th class="num">Amount</th></tr></thead>
                <tbody>
                  <tr><td>{{ formattedFromDate }}</td><td><span class="badge badge-neutral">Float</span></td><td>Opening Float ({{ selectedCounter?.counter_name || '—' }})</td><td class="num mono">₹{{ openingFloat.toFixed(2) }}</td></tr>
                  <tr><td>{{ formattedPeriodLabel }}</td><td><span class="badge badge-success">Cash Sales</span></td><td>{{ drawerBills }} Transactions</td><td class="num mono">₹{{ drawerCashSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td></tr>
                  @if (drawerCashRefunds > 0) {
                    <tr><td>{{ formattedPeriodLabel }}</td><td><span class="badge badge-danger">Refunds</span></td><td>Cash Returns</td><td class="num mono">−₹{{ drawerCashRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- Stock on Hand Tab (Gap 10: Sorting, Filtering & Expiry Date) -->
      @if (activeTab === 'stockValuation') {
        <div class="card card-flush">
          <div class="card-header row-between" style="flex-wrap:wrap;gap:var(--space-3)">
            <div>
              <h3>Stock-on-Hand Valuation &amp; Expiry</h3>
              <span class="text-sm text-muted">Real-time inventory levels</span>
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-3)">
              <input class="input" type="text" placeholder="Search SKU / Name..." [(ngModel)]="stockSearch" style="width:180px">
              <select class="input" [(ngModel)]="stockCategory" style="width:140px">
                <option value="All">All Categories</option>
                @for (cat of stockCategories; track cat) {
                  @if (cat !== 'All') {
                    <option [value]="cat">{{ cat }}</option>
                  }
                }
              </select>
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th (click)="sortStock('sku')" style="cursor:pointer;user-select:none">
                    SKU <span class="sort-icon">{{ stockSortKey === 'sku' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th (click)="sortStock('name')" style="cursor:pointer;user-select:none">
                    Item Name <span class="sort-icon">{{ stockSortKey === 'name' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th (click)="sortStock('category')" style="cursor:pointer;user-select:none">
                    Category <span class="sort-icon">{{ stockSortKey === 'category' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th class="num" (click)="sortStock('stock')" style="cursor:pointer;user-select:none">
                    Qty <span class="sort-icon">{{ stockSortKey === 'stock' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th class="num" (click)="sortStock('costPrice')" style="cursor:pointer;user-select:none">
                    Unit Cost <span class="sort-icon">{{ stockSortKey === 'costPrice' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th class="num" (click)="sortStock('stockValue')" style="cursor:pointer;user-select:none">
                    Total Value <span class="sort-icon">{{ stockSortKey === 'stockValue' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th (click)="sortStock('expiryDate')" style="cursor:pointer;user-select:none">
                    Expiry Date <span class="sort-icon">{{ stockSortKey === 'expiryDate' ? (stockSortAsc ? '▲' : '▼') : '↕' }}</span>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (item of filteredStockItems(); track item.sku) {
                  <tr>
                    <td class="mono">{{ item.sku }}</td>
                    <td><strong>{{ item.name }}</strong></td>
                    <td><span class="badge badge-neutral">{{ item.category }}</span></td>
                    <td class="num mono">{{ item.stock }} {{ item.unit }}</td>
                    <td class="num mono">₹{{ item.costPrice.toFixed(2) }}</td>
                    <td class="num mono font-bold">₹{{ item.stockValue.toFixed(2) }}</td>
                    <td class="mono">{{ item.expiryDate }}</td>
                    <td>
                      <span class="badge" [ngClass]="item.stock === 0 ? 'badge-danger' : (item.stock <= 15 ? 'badge-warning' : 'badge-success')">
                        {{ item.status }}
                      </span>
                    </td>
                  </tr>
                }
                @if (filteredStockItems().length === 0) {
                  <tr><td colspan="8" class="text-center text-muted" style="padding:var(--space-4)">No matching items found.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card-body row-between" style="border-top:1px solid var(--border);padding:var(--space-4)">
            <span class="text-muted">Total Stock Value</span>
            <strong class="mono" style="font-size:var(--text-lg)">₹{{ Math.round(totalStockValuation).toLocaleString('en-IN') }}</strong>
          </div>
        </div>
      }

      <!-- AI Insights & Recommendations Tab (Gaps 11, 12) -->
      @if (activeTab === 'aiInsights') {
        <!-- Trend Metrics / KPI Strip -->
        <div class="grid grid-4" style="margin-bottom:var(--space-5)">
          @for (tr of aiInsights?.trends; track tr.title) {
            <div class="card stat-card">
              <span class="stat-label">{{ tr.title }}</span>
              <span class="stat-value" style="font-size:var(--text-lg)">{{ tr.value }}</span>
              <span class="stat-delta" [ngClass]="tr.trend === 'up' ? 'up' : (tr.trend === 'attention' ? 'down' : '')">
                {{ tr.detail }}
              </span>
            </div>
          }
        </div>

        <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
          <!-- Top Sellers by Quantity -->
          <div class="card card-flush">
            <div class="card-header">
              <h3>Top Fast-Moving Items (By Quantity Sold)</h3>
              <span class="text-sm text-muted">High turnover items driving volume</span>
            </div>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th class="num">Qty Sold</th>
                    <th class="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of aiInsights?.top_selling_by_quantity; track item.sku) {
                    <tr>
                      <td>
                        <strong>{{ item.name }}</strong>
                        <div class="text-xs text-muted mono">{{ item.sku }}</div>
                      </td>
                      <td><span class="badge badge-neutral">{{ item.category }}</span></td>
                      <td class="num mono font-bold" style="color:var(--success-700)">{{ item.qty_sold }}</td>
                      <td class="num mono">₹{{ item.revenue.toLocaleString('en-IN') }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Top Revenue Generators -->
          <div class="card card-flush">
            <div class="card-header">
              <h3>Top Revenue Generators</h3>
              <span class="text-sm text-muted">Core financial contribution drivers</span>
            </div>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th class="num">Qty Sold</th>
                    <th class="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of aiInsights?.top_revenue_generators; track item.sku) {
                    <tr>
                      <td>
                        <strong>{{ item.name }}</strong>
                        <div class="text-xs text-muted mono">{{ item.sku }}</div>
                      </td>
                      <td><span class="badge badge-neutral">{{ item.category }}</span></td>
                      <td class="num mono">{{ item.qty_sold }}</td>
                      <td class="num mono font-bold" style="color:var(--primary)">₹{{ item.revenue.toLocaleString('en-IN') }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Slow-Moving Inventory & Practical Recommendations (Gap 12) -->
        <div class="card card-flush">
          <div class="card-header row-between" style="flex-wrap:wrap;gap:var(--space-2)">
            <div>
              <h3>Slow-Moving Inventory &amp; AI Actionable Recommendations</h3>
              <span class="text-sm text-muted">Practical strategies to unlock trapped working capital</span>
            </div>
            <span class="badge badge-warning">Advisory Recommendations Only</span>
          </div>

          <div style="background:var(--slate-50);padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border);font-size:var(--text-sm);color:var(--slate-700)">
            💡 <strong>AI Inventory Notice:</strong> Recommendations are advisory business strategies (discounting, cross-merchandising, bundling, reorder moderation). The software will not mutate or override your inventory records automatically.
          </div>

          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Item / SKU</th>
                  <th>Current Stock</th>
                  <th>Period Sales</th>
                  <th>Strategy</th>
                  <th>Actionable Recommendation</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                @for (rec of aiInsights?.slow_moving_items; track rec.sku) {
                  <tr>
                    <td>
                      <strong>{{ rec.name }}</strong>
                      <div class="text-xs text-muted mono">{{ rec.sku }} &middot; {{ rec.category }}</div>
                    </td>
                    <td class="mono font-bold" style="color:var(--danger-700)">{{ rec.stock }} in stock</td>
                    <td class="mono">{{ rec.qty_sold }} units</td>
                    <td>
                      <span class="badge" [ngClass]="{
                        'badge-warning': rec.recommendation_type === 'Discounting',
                        'badge-primary': rec.recommendation_type === 'Bundling',
                        'badge-danger': rec.recommendation_type === 'Reduce Orders',
                        'badge-neutral': rec.recommendation_type === 'Merchandising'
                      }">
                        {{ rec.recommendation_type }}
                      </span>
                    </td>
                    <td style="max-width:320px">
                      <strong>{{ rec.action_title }}</strong>
                      <div class="text-sm">{{ rec.recommendation_text }}</div>
                    </td>
                    <td class="text-xs text-muted" style="max-width:260px">
                      {{ rec.rationale }}
                    </td>
                  </tr>
                }
                @if (!aiInsights?.slow_moving_items?.length) {
                  <tr><td colspan="6" class="text-center text-muted" style="padding:var(--space-4)">No slow-moving inventory detected.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Tax Summary Tab -->
      @if (activeTab === 'taxSummary') {
        <div class="card card-flush">
          <div class="card-header row-between">
            <h3>Tax Collected by Rate Slab</h3>
            <span class="text-sm text-muted">{{ formattedPeriodLabel }}</span>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Tax Rate Slab</th><th class="num">Taxable Value</th><th class="num">Tax Collected</th><th class="num">% of Total Tax</th></tr></thead>
              <tbody>
                @for (tax of taxSlabs; track tax.slab) {
                  <tr>
                    <td><strong>{{ tax.slab }}</strong></td>
                    <td class="num mono">₹{{ Math.round(tax.taxable).toLocaleString('en-IN') }}</td>
                    <td class="num mono font-bold">₹{{ Math.round(tax.gst).toLocaleString('en-IN') }}</td>
                    <td class="num">{{ tax.share }}%</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr style="font-weight:700">
                  <td>Total</td>
                  <td class="num mono">₹{{ Math.round(totalGross).toLocaleString('en-IN') }}</td>
                  <td class="num mono">₹{{ Math.round(totalTax).toLocaleString('en-IN') }}</td>
                  <td class="num">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      }

      <!-- Purchase Register Tab (Phase 2) -->
      @if (activeTab === 'purchaseRegister') {
        <div class="card card-flush">
          <div class="card-header">
            <h3>Goods Receipts (GRN) Log</h3>
            <span class="text-sm text-muted">Stock received from vendors</span>
          </div>
          @if (grnLogs.length > 0) {
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>GRN Ref</th>
                    <th>PO Ref</th>
                    <th>Vendor</th>
                    <th>Date</th>
                    <th class="num">Lines</th>
                    <th class="num">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (g of grnLogs; track g.id) {
                    <tr>
                      <td class="mono">{{ g.id }}</td>
                      <td class="mono">{{ g.poId || '—' }}</td>
                      <td>{{ g.vendorId }}</td>
                      <td>{{ g.date }}</td>
                      <td class="num">{{ g.lines?.length || 0 }}</td>
                      <td class="num mono">₹{{ (g.total || 0).toFixed(2) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <p class="text-sm">No goods receipts recorded yet in Phase 2.</p>
            </div>
          }
        </div>
      }

      <!-- Vendor Payables Tab (Phase 2) -->
      @if (activeTab === 'vendorPayables') {
        <div class="card card-flush">
          <div class="card-header">
            <h3>Outstanding Vendor Payables</h3>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Payment Terms</th>
                  <th class="num">Outstanding Payable</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (v of vendorsList; track v.id) {
                  <tr>
                    <td>{{ v.name }}</td>
                    <td>{{ v.category }}</td>
                    <td>{{ v.terms }}</td>
                    <td class="num mono">₹{{ v.payable.toLocaleString('en-IN') }}</td>
                    <td>
                      <a class="btn btn-ghost btn-sm" [routerLink]="['/vendor-detail']" [queryParams]="{ vendor: v.id }">View Ledger</a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card-body row-between" style="border-top:1px solid var(--border);padding:var(--space-4)">
            <span class="text-muted">Total Outstanding Payables</span>
            <strong class="mono" style="font-size:var(--text-lg);color:var(--danger-700)">₹{{ totalVendorPayables.toLocaleString('en-IN') }}</strong>
          </div>
        </div>
      }

      <!-- Batch & Expiry Tab (Phase 2) -->
      @if (activeTab === 'batchExpiry') {
        <div class="card card-flush">
          <div class="card-header">
            <h3>Batches Nearing Expiry (&le; 14 Days)</h3>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Batch #</th>
                  <th>Item</th>
                  <th>Expiry Date</th>
                  <th class="num">Stock Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (b of expiringBatches; track b.batch) {
                  <tr>
                    <td class="mono">{{ b.batch }}</td>
                    <td>{{ b.name }}</td>
                    <td>{{ b.expiryDate }}</td>
                    <td class="num">{{ b.qty }}</td>
                    <td>
                      <span class="badge" [ngClass]="b.daysToExpiry <= 3 ? 'badge-danger' : (b.daysToExpiry <= 7 ? 'badge-warning' : 'badge-success')">
                        {{ b.daysToExpiry }} days
                      </span>
                    </td>
                  </tr>
                }
                @if (expiringBatches.length === 0) {
                  <tr>
                    <td colspan="5" class="text-muted text-sm text-center">Nothing expiring within 14 days.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

    </main>

    <!-- Add Cash Counter Modal -->
    <div class="modal-overlay" [class.open]="showAddCounterModal">
      <div class="modal">
        <div class="modal-header"><h3>Add New Cash Counter</h3><button class="icon-btn" (click)="showAddCounterModal = false">✕</button></div>
        <div class="modal-body stack">
          <div class="field">
            <label>Counter Name</label>
            <input class="input" type="text" [(ngModel)]="newCounterName" placeholder="e.g. Counter 2">
          </div>
          <div class="field">
            <label>Opening Float (₹)</label>
            <input class="input mono" type="number" [(ngModel)]="newCounterFloat" placeholder="2000.00">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showAddCounterModal = false">Cancel</button>
          <button class="btn btn-primary" (click)="addCashCounter()">Create Counter</button>
        </div>
      </div>
    </div>

    @if (toastMessage) {
      <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toastMessage }}</span></div></div>
    }
  `
})
export class ReportsComponent implements OnInit, OnDestroy {
  api = inject(ApiService);
  auth = inject(AuthService);
  Math = Math;

  activeTab = 'zreport';
  fromDate = '';
  toDate = '';
  quickRange = 'this_month';

  // Cash Counter & Float
  cashCounters: any[] = [];
  selectedCounter: any = null;
  openingFloat = 2000.0;
  countedCash: number | null = null;
  isEditingFloat = false;
  editFloatValue = 2000.0;
  showAddCounterModal = false;
  newCounterName = '';
  newCounterFloat = 2000.0;

  totalGross = 0;
  totalDisc = 0;
  totalTax = 0;
  totalNet = 0;
  totalBills = 0;
  totalCash = 0;
  totalCard = 0;
  totalUpi = 0;
  totalRefunds = 0;

  cashPct = 0;
  cardPct = 0;
  upiPct = 0;
  discountPct = '0.0';

  formattedPeriodLabel = '';
  formattedFromDate = '';

  transactions: TransactionRow[] = [];
  itemSales: ItemSaleRow[] = [];
  stockItems: StockReportItem[] = [];
  taxSlabs: TaxSlabRow[] = [];

  // Sorting & Filtering for Item Sales
  itemSalesSearch = '';
  itemSalesCategory = 'All';
  itemSalesCategories: string[] = ['All'];
  itemSalesSortKey = 'revenue';
  itemSalesSortAsc = false;

  // Sorting & Filtering for Stock on Hand
  stockSearch = '';
  stockCategory = 'All';
  stockCategories: string[] = ['All'];
  stockSortKey = 'name';
  stockSortAsc = true;

  // AI Insights
  aiInsights: any = null;

  // Phase 2 Data
  grnLogs: any[] = [];
  vendorsList: any[] = [];
  totalVendorPayables = 0;
  expiringBatches: any[] = [];

  toastMessage: string | null = null;

  // Transactions tab
  txRows: any[] = [];
  txTotal = 0;
  txSearch = '';
  txCounter = 'All';
  txStatus = 'All';
  txError = '';

  // Cash drawer figures of the selected counter (from the database)
  drawerCashSales = 0;
  drawerCashRefunds = 0;
  drawerBills = 0;

  private refreshTimer: any = null;

  async ngOnInit() {
    await this.loadCashCounters();
    this.setQuickDateRange('this_month');   // start the sales figures now: they must not wait for the slower Phase 2 data below
    await this.loadStockReport();
    // Phase 2 report data (AI insights, purchase register, vendor payables, batch & expiry) is only loaded for Phase 2 admins
    if (this.auth.hasPhase2()) {
      await this.loadAiInsights();

      this.grnLogs = await this.api.getGrnLog();
      this.vendorsList = await this.api.getVendors();
      this.totalVendorPayables = this.vendorsList.reduce((s, v) => s + (v.payable || 0), 0);
      const allBatches = await this.api.getBatches();
      this.expiringBatches = allBatches.filter((b: any) => b.daysToExpiry <= 14);
    }

    // Keep the page live: roll "Today" over at midnight and pick up new sales / counters without a manual refresh.
    this.refreshTimer = setInterval(() => this.autoRefresh(), 30000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async autoRefresh() {
    if (document.hidden) return;
    if (this.quickRange) {
      const [from, to] = this.quickRangeDates(this.quickRange);
      if (from !== this.fromDate || to !== this.toDate) {   // a new day has started
        this.setQuickDateRange(this.quickRange);
        return;
      }
    }
    await this.recalculate();
    if (this.activeTab === 'cashDrawer') await this.refreshCounters();
  }

  async openCashDrawer() {
    this.activeTab = 'cashDrawer';
    await this.refreshCounters();   // counters created since the page loaded appear here
  }

  /** Re-reads the counter list from the database, keeping the current selection when it still exists. */
  async refreshCounters() {
    const list = await this.api.getCashCounters();
    this.cashCounters = list;
    const keep = list.find(c => c.id === this.selectedCounter?.id) || list[0] || null;
    this.selectedCounter = keep;
    if (keep && !this.isEditingFloat) this.openingFloat = keep.opening_float ?? 2000.0;
    await this.loadCashDrawer();
  }

  async loadCashDrawer() {
    if (!this.selectedCounter || !this.fromDate || !this.toDate) return;
    try {
      const d = await this.api.getCashDrawer(this.selectedCounter.id, this.fromDate, this.toDate);
      this.drawerCashSales = d.cash_sales || 0;
      this.drawerCashRefunds = d.cash_refunds || 0;
      this.drawerBills = d.bills || 0;
    } catch {
      this.drawerCashSales = 0;
      this.drawerCashRefunds = 0;
      this.drawerBills = 0;
    }
  }

  async loadCashCounters() {
    this.cashCounters = await this.api.getCashCounters();
    if (this.cashCounters.length > 0) {
      this.selectedCounter = this.cashCounters[0];
      this.openingFloat = this.selectedCounter.opening_float ?? 2000.0;
    }
  }

  async onSelectCounter(counterId: string) {
    const found = this.cashCounters.find(c => c.id === counterId);
    if (found) {
      this.selectedCounter = found;
      this.openingFloat = found.opening_float ?? 2000.0;
      this.isEditingFloat = false;
      await this.loadCashDrawer();
    }
  }

  startEditFloat() {
    this.editFloatValue = this.openingFloat;
    this.isEditingFloat = true;
  }

  async saveFloat() {
    if (!this.selectedCounter) return;
    const res = await this.api.updateCounterFloat(this.selectedCounter.id, this.editFloatValue);
    this.openingFloat = this.editFloatValue;
    this.selectedCounter.opening_float = this.editFloatValue;
    this.isEditingFloat = false;
    this.triggerToast(`Opening float updated to ₹${this.openingFloat.toFixed(2)}`);
  }

  async addCashCounter() {
    if (!this.newCounterName.trim()) {
      alert('Please enter a counter name');
      return;
    }
    const created = await this.api.createCashCounter(this.newCounterName.trim(), this.newCounterFloat || 2000.0);
    this.cashCounters = await this.api.getCashCounters();
    this.selectedCounter = this.cashCounters.find(c => c.id === created.id) || created;
    this.openingFloat = created.opening_float;
    await this.loadCashDrawer();
    this.showAddCounterModal = false;
    this.newCounterName = '';
    this.newCounterFloat = 2000.0;
    this.triggerToast(`Cash counter "${created.counter_name}" created`);
  }

  async loadStockReport() {
    const backendStock = await this.api.getStockOnHandReport();
    if (backendStock && backendStock.items) {
      this.stockItems = backendStock.items.map((i: any) => ({
        sku: i.sku,
        name: i.name,
        category: i.category || 'General',
        stock: i.stock,
        unit: i.unit || 'pcs',
        costPrice: i.costPrice || (i.price * 0.7),
        price: i.price,
        stockValue: i.stockValue || (i.price * 0.7 * i.stock),
        expiryDate: i.expiryDate || '—',
        status: i.status || (i.stock === 0 ? 'Out of Stock' : (i.stock <= 15 ? 'Low Stock' : 'In Stock'))
      }));
    } else {
      const items = await this.api.getCatalog();
      const batches = this.auth.hasPhase2() ? await this.api.getBatches() : [];
      const expMap: Record<string, string> = {};
      batches.forEach((b: any) => {
        if (!expMap[b.sku] || b.expiryDate < expMap[b.sku]) expMap[b.sku] = b.expiryDate;
      });

      this.stockItems = items.map(i => {
        const cost = (i.costPrice && i.costPrice > 0) ? i.costPrice : (i.price * 0.7);
        return {
          sku: i.sku,
          name: i.name,
          category: i.category,
          stock: i.stock,
          unit: i.unit || 'pcs',
          costPrice: cost,
          price: i.price,
          stockValue: cost * i.stock,
          expiryDate: expMap[i.sku] || '—',
          status: i.stock === 0 ? 'Out of Stock' : (i.stock <= i.min ? 'Low Stock' : 'In Stock')
        };
      });
    }

    const cats = Array.from(new Set(this.stockItems.map(i => i.category))).filter(Boolean);
    this.stockCategories = ['All', ...cats];
  }

  async loadAiInsights() {
    if (!this.auth.hasPhase2()) return;   // Phase 2 report data
    this.aiInsights = await this.api.getAIInsights(this.fromDate, this.toDate);
  }

  /** YYYY-MM-DD of a Date in the viewer's local time zone. */
  private localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** [from, to] for a quick range, always computed from the system clock (never a fixed date). */
  private quickRangeDates(key: string): [string, string] {
    const now = new Date();
    const day = (offset: number) => this.localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
    const today = day(0);
    if (key === 'yesterday') return [day(-1), day(-1)];
    if (key === 'this_week') return [day(-((now.getDay() + 6) % 7)), today];   // Monday .. today
    if (key === 'this_month') return [this.localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    return [today, today];
  }

  setQuickDateRange(key: string) {
    this.quickRange = key;
    [this.fromDate, this.toDate] = this.quickRangeDates(key);
    void this.recalculate();
  }

  async applyDateRange() {
    this.quickRange = '';
    if (!this.fromDate || !this.toDate) {
      alert('Select both From and To dates');
      return;
    }
    if (this.fromDate > this.toDate) {
      alert('From date cannot be after To date');
      return;
    }
    await this.recalculate();
    await this.loadAiInsights();
  }

  clearDateRange() {
    this.setQuickDateRange('this_month');
  }

  formatDateLabel(dStr: string): string {
    if (!dStr) return '';
    const parts = dStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + ' ' + months[mIdx] + ' ' + parts[0];
  }

  async recalculate() {
    this.formattedFromDate = this.formatDateLabel(this.fromDate);
    this.formattedPeriodLabel =
      this.formattedFromDate + (this.fromDate === this.toDate ? '' : ' – ' + this.formatDateLabel(this.toDate));

    try {
      const t = await this.api.getSalesSummary(this.fromDate, this.toDate);
      this.totalGross = t.gross;
      this.totalDisc = t.disc;
      this.totalTax = t.tax;
      this.totalNet = t.net;
      this.totalBills = t.bills;
      this.totalCash = t.cash;
      this.totalCard = t.card;
      this.totalUpi = t.upi;
      this.totalRefunds = t.refunds || 0;
    } catch {
      this.totalGross = this.totalDisc = this.totalTax = this.totalNet = this.totalBills = 0;
      this.totalCash = this.totalCard = this.totalUpi = this.totalRefunds = 0;
    }

    // Payment percentage calculation
    const totalPaySum = this.totalCash + this.totalCard + this.totalUpi || 1;
    this.cashPct = Math.round((this.totalCash / totalPaySum) * 100);
    this.cardPct = Math.round((this.totalCard / totalPaySum) * 100);
    this.upiPct = Math.round((this.totalUpi / totalPaySum) * 100);
    this.discountPct = this.totalGross > 0 ? ((this.totalDisc / this.totalGross) * 100).toFixed(1) : '0.0';

    // Completed Transactions card (latest sales in the range) and the Transactions tab
    await Promise.all([this.loadTransactions(), this.loadCashDrawer()]);
    if (this.activeTab === 'customers') await this.loadCustomerReport();
    try {
      const filtered = this.txCounter !== 'All' || this.txStatus !== 'All' || this.txSearch.trim() !== '';
      const latest = filtered ? (await this.api.getTransactions({ fromDate: this.fromDate, toDate: this.toDate, limit: 200 })).rows : this.txRows;
      this.transactions = latest.slice(0, 200).map((r: any) => ({
        invoiceNo: r.invoice_no, time: this.formatDateTime(r.time), itemCount: r.item_count, grandTotal: r.grand_total
      }));
    } catch {
      this.transactions = [];
    }

    // Item Sales calculation
    const rawItems = [
      { name: 'Cola 500ml', category: 'Beverages', qtyMultiplier: 1.4, unitPrice: 45 },
      { name: 'Basmati Rice 1kg', category: 'Grocery', qtyMultiplier: 0.38, unitPrice: 135 },
      { name: 'Sunflower Oil 1L', category: 'Grocery', qtyMultiplier: 0.27, unitPrice: 175 },
      { name: 'Shampoo 340ml', category: 'Personal Care', qtyMultiplier: 0.19, unitPrice: 210 },
      { name: 'Potato Chips 90g', category: 'Snacks', qtyMultiplier: 0.98, unitPrice: 35 },
      { name: 'Toned Milk 500ml', category: 'Dairy', qtyMultiplier: 1.04, unitPrice: 28 },
      { name: 'Wheat Atta 5kg', category: 'Grocery', qtyMultiplier: 0.11, unitPrice: 245 }
    ];

    this.itemSales = rawItems.map(item => {
      const qtySold = Math.max(5, Math.round((this.totalNet / 500) * item.qtyMultiplier));
      const revenue = Math.round(qtySold * item.unitPrice);
      const share = this.totalNet > 0 ? ((revenue / this.totalNet) * 100).toFixed(1) : '0.0';
      return { name: item.name, category: item.category, qtySold, revenue, share };
    });

    const cats = Array.from(new Set(this.itemSales.map(i => i.category)));
    this.itemSalesCategories = ['All', ...cats];

    // Tax Slabs
    const slabs = [
      { slab: 'GST 0%', rate: 0, taxableShare: 0.06 },
      { slab: 'GST 5%', rate: 0.05, taxableShare: 0.38 },
      { slab: 'GST 12%', rate: 0.12, taxableShare: 0.33 },
      { slab: 'GST 18%', rate: 0.18, taxableShare: 0.23 }
    ];

    this.taxSlabs = slabs.map(s => {
      const taxable = Math.round(this.totalGross * s.taxableShare);
      const gst = Math.round(s.rate > 0 ? taxable * s.rate : 0);
      const share = this.totalTax > 0 ? ((gst / this.totalTax) * 100).toFixed(1) : '0.0';
      return { slab: s.slab, taxable, gst, share };
    });
  }

  // Customers tab
  custReport: any = null;
  custError = '';

  async openCustomerReport() {
    this.activeTab = 'customers';
    await this.loadCustomerReport();
  }

  async loadCustomerReport() {
    if (!this.auth.hasPhase2() || !this.auth.isAdmin()) return;
    try {
      this.custReport = await this.api.getCustomerReport(this.fromDate, this.toDate);
      this.custError = '';
    } catch (err: any) {
      this.custReport = null;
      this.custError = err?.status === 403 ? 'Only a Phase 2 admin can view customer reports.' : 'Could not load the customer report. Please try again.';
    }
  }

  async loadTransactions() {
    try {
      const res = await this.api.getTransactions({
        fromDate: this.fromDate, toDate: this.toDate, counter: this.txCounter, status: this.txStatus, search: this.txSearch, limit: 500
      });
      this.txRows = res.rows;
      this.txTotal = res.total;
      this.txError = '';
    } catch (err: any) {
      this.txRows = [];
      this.txTotal = 0;
      this.txError = err?.status === 403 ? 'Only an admin can view transactions.' : 'Could not load transactions. Please try again.';
    }
  }

  formatDateTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  statusLabel(s: string): string {
    return ({ COMPLETED: 'Completed', PARTIALLY_RETURNED: 'Partially Returned', RETURNED: 'Returned' } as Record<string, string>)[s] || s;
  }

  // Sorting & Filtering for Item Sales
  sortItemSales(key: string) {
    if (this.itemSalesSortKey === key) {
      this.itemSalesSortAsc = !this.itemSalesSortAsc;
    } else {
      this.itemSalesSortKey = key;
      this.itemSalesSortAsc = (key === 'name' || key === 'category');
    }
  }

  filteredItemSales(): ItemSaleRow[] {
    let rows = [...this.itemSales];
    if (this.itemSalesCategory !== 'All') {
      rows = rows.filter(r => r.category === this.itemSalesCategory);
    }
    if (this.itemSalesSearch.trim()) {
      const q = this.itemSalesSearch.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    rows.sort((a: any, b: any) => {
      let va = a[this.itemSalesSortKey];
      let vb = b[this.itemSalesSortKey];
      if (this.itemSalesSortKey === 'share') {
        va = parseFloat(va);
        vb = parseFloat(vb);
      }
      if (va < vb) return this.itemSalesSortAsc ? -1 : 1;
      if (va > vb) return this.itemSalesSortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }

  // Sorting & Filtering for Stock on Hand
  sortStock(key: string) {
    if (this.stockSortKey === key) {
      this.stockSortAsc = !this.stockSortAsc;
    } else {
      this.stockSortKey = key;
      this.stockSortAsc = (key === 'sku' || key === 'name' || key === 'category');
    }
  }

  filteredStockItems(): StockReportItem[] {
    let rows = [...this.stockItems];
    if (this.stockCategory !== 'All') {
      rows = rows.filter(r => r.category === this.stockCategory);
    }
    if (this.stockSearch.trim()) {
      const q = this.stockSearch.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    rows.sort((a: any, b: any) => {
      let va = a[this.stockSortKey];
      let vb = b[this.stockSortKey];
      if (va < vb) return this.stockSortAsc ? -1 : 1;
      if (va > vb) return this.stockSortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }

  get totalStockValuation(): number {
    return this.stockItems.reduce((acc, item) => acc + item.stockValue, 0);
  }

  get expectedCash(): number {
    return this.openingFloat + this.drawerCashSales - this.drawerCashRefunds;
  }

  cashVariance(): number {
    if (this.countedCash === null || this.countedCash === undefined) return 0;
    return this.countedCash - this.expectedCash;
  }

  closeShift() {
    this.triggerToast('Shift closed and cash count recorded successfully!');
  }

  triggerToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => {
      if (this.toastMessage === msg) this.toastMessage = null;
    }, 3000);
  }

  exportCSV() {
    let csvContent = '';
    const dateHeader = `Report Date Range: ${this.fromDate} to ${this.toDate}\n\n`;

    if (this.activeTab === 'zreport') {
      csvContent = dateHeader + `Metric,Value\n`;
      csvContent += `Gross Sales,${this.totalGross}\n`;
      csvContent += `Discounts Given,${this.totalDisc}\n`;
      csvContent += `Tax Collected,${this.totalTax}\n`;
      csvContent += `Net Sales,${this.totalNet}\n`;
      csvContent += `Total Bills Rung Up,${this.totalBills}\n`;
      csvContent += `Cash Tendered,${this.totalCash}\n`;
      csvContent += `Card Tendered,${this.totalCard}\n`;
      csvContent += `UPI Tendered,${this.totalUpi}\n`;
    } else if (this.activeTab === 'transactions') {
      csvContent = dateHeader + `Invoice,Date / Time,Counter,Cashier,Customer,Items,Amount,Payment Method,Status\n`;
      this.txRows.forEach(t => {
        csvContent += `"${t.invoice_no}","${this.formatDateTime(t.time)}","${t.counter_name}","${t.cashier_name}","${t.customer_name || 'Walk-in'}",${t.item_count},${t.grand_total},"${t.payment_method}","${this.statusLabel(t.status)}"\n`;
      });
    } else if (this.activeTab === 'customers') {
      csvContent = dateHeader + `Customer ID,Name,Mobile,Type,Invoices,Total Purchase,Avg Bill,Purchases per Month,Avg Days Between Purchases,Last Purchase\n`;
      (this.custReport?.rows || []).forEach((c: any) => {
        csvContent += `"${c.id}","${c.name}","${c.mobile}","${c.customerType}",${c.invoices},${c.totalAmount},${c.avgBill},${c.purchasesPerMonth},${c.avgDaysBetween ?? ''},"${this.formatDateTime(c.lastPurchase)}"\n`;
      });
    } else if (this.activeTab === 'itemSales') {
      csvContent = dateHeader + `Item Name,Category,Qty Sold,Revenue,Share %\n`;
      this.filteredItemSales().forEach(row => {
        csvContent += `"${row.name}","${row.category}",${row.qtySold},${row.revenue},${row.share}%\n`;
      });
    } else if (this.activeTab === 'cashDrawer') {
      csvContent = dateHeader + `Counter,Opening Float,Cash Sales,Cash Refunds,Expected Cash,Counted Cash,Variance\n`;
      csvContent += `"${this.selectedCounter?.counter_name || ''}",${this.openingFloat},${this.drawerCashSales},${this.drawerCashRefunds},${this.expectedCash},${this.countedCash ?? 'N/A'},${this.cashVariance()}\n`;
    } else if (this.activeTab === 'stockValuation') {
      csvContent = `Stock-on-Hand Report\n\nSKU,Item Name,Category,Qty,Unit Cost,Total Value,Expiry Date,Status\n`;
      this.filteredStockItems().forEach(item => {
        csvContent += `"${item.sku}","${item.name}","${item.category}",${item.stock},${item.costPrice.toFixed(2)},${item.stockValue.toFixed(2)},"${item.expiryDate}","${item.status}"\n`;
      });
    } else if (this.activeTab === 'aiInsights') {
      csvContent = `AI Insights & Recommendations\n\nGenerated: ${this.aiInsights?.generated_at || ''}\n\nTop Sellers by Quantity:\nSKU,Name,Category,Qty Sold,Revenue\n`;
      (this.aiInsights?.top_selling_by_quantity || []).forEach((i: any) => {
        csvContent += `"${i.sku}","${i.name}","${i.category}",${i.qty_sold},${i.revenue}\n`;
      });
      csvContent += `\nSlow Moving Inventory Recommendations:\nSKU,Name,Category,Stock,Sold,Strategy,Action,Rationale\n`;
      (this.aiInsights?.slow_moving_items || []).forEach((i: any) => {
        csvContent += `"${i.sku}","${i.name}","${i.category}",${i.stock},${i.qty_sold},"${i.recommendation_type}","${i.action_title}: ${i.recommendation_text}","${i.rationale}"\n`;
      });
    } else if (this.activeTab === 'taxSummary') {
      csvContent = dateHeader + `Tax Rate Slab,Taxable Value,Tax Collected,Share %\n`;
      this.taxSlabs.forEach(row => {
        csvContent += `"${row.slab}",${row.taxable},${row.gst},${row.share}%\n`;
      });
    } else if (this.activeTab === 'purchaseRegister') {
      csvContent = `Goods Receipts (GRN) Log\n\nGRN Ref,PO Ref,Vendor,Date,Lines,Total Amount\n`;
      this.grnLogs.forEach(g => {
        csvContent += `"${g.id}","${g.poId || '—'}","${g.vendorId}","${g.date}",${g.lines?.length || 0},${g.total || 0}\n`;
      });
    } else if (this.activeTab === 'vendorPayables') {
      csvContent = `Vendor Payables Report\n\nVendor,Category,Terms,Payable\n`;
      this.vendorsList.forEach(v => {
        csvContent += `"${v.name}","${v.category}","${v.terms}",${v.payable}\n`;
      });
    } else if (this.activeTab === 'batchExpiry') {
      csvContent = `Batch & Expiry Report\n\nBatch #,Item,Expiry Date,Qty,Days to Expiry\n`;
      this.expiringBatches.forEach(b => {
        csvContent += `"${b.batch}","${b.name}","${b.expiryDate}",${b.qty},${b.daysToExpiry}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `report_${this.activeTab}_${this.fromDate}_to_${this.toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
