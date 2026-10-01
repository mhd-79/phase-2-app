import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

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
  imports: [CommonModule, FormsModule, RouterLink],
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
        <div class="tab" [class.active]="activeTab === 'itemSales'" (click)="activeTab = 'itemSales'">Sales by Item</div>
        <div class="tab" [class.active]="activeTab === 'cashDrawer'" (click)="activeTab = 'cashDrawer'">Cash Drawer</div>
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
              <span class="badge badge-neutral">{{ transactions.length }} session sales</span>
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
                <h3>{{ selectedCounter?.counter_name || 'Counter 1' }}</h3>
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

              <div class="row-between"><span class="text-muted">+ Cash Sales</span><strong class="mono">₹{{ Math.round(totalCash).toLocaleString('en-IN') }}.00</strong></div>
              <div class="row-between"><span class="text-muted">− Cash Refunds</span><strong class="mono">−₹{{ Math.round(totalRefunds).toLocaleString('en-IN') }}.00</strong></div>
              <hr class="divider">
              <div class="row-between"><span style="font-weight:700">Expected Cash</span><strong class="mono" style="font-size:var(--text-lg)">₹{{ Math.round(expectedCash).toLocaleString('en-IN') }}.00</strong></div>
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
                  <tr><td>{{ formattedFromDate }} 09:00</td><td><span class="badge badge-neutral">Float</span></td><td>Opening Float ({{ selectedCounter?.counter_name || 'Counter 1' }})</td><td class="num mono">₹{{ openingFloat.toFixed(2) }}</td></tr>
                  <tr><td>{{ formattedPeriodLabel }}</td><td><span class="badge badge-success">Cash Sales</span></td><td>{{ totalBills }} Transactions</td><td class="num mono">₹{{ Math.round(totalCash).toLocaleString('en-IN') }}.00</td></tr>
                  @if (totalRefunds > 0) {
                    <tr><td>{{ formattedPeriodLabel }}</td><td><span class="badge badge-danger">Refunds</span></td><td>Cash Returns</td><td class="num mono">−₹{{ Math.round(totalRefunds).toLocaleString('en-IN') }}.00</td></tr>
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
export class ReportsComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);
  Math = Math;

  activeTab = 'zreport';
  fromDate = '2026-09-01';
  toDate = '2026-09-10';
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

  DAILY_MOCK_REPORTS: Record<string, DailySummary> = {
    '2026-09-10': { gross: 48260, disc: 1140, tax: 4972, net: 52092, cash: 26510, card: 15890, upi: 9692, bills: 126, refunds: 420 },
    '2026-09-09': { gross: 44600, disc: 980, tax: 4520, net: 48140, cash: 23100, card: 16200, upi: 8840, bills: 114, refunds: 300 },
    '2026-09-08': { gross: 42100, disc: 850, tax: 4280, net: 45530, cash: 21000, card: 15400, upi: 9130, bills: 108, refunds: 150 },
    '2026-09-07': { gross: 39800, disc: 790, tax: 4010, net: 43020, cash: 20500, card: 14200, upi: 8320, bills: 102, refunds: 200 },
    '2026-09-06': { gross: 51200, disc: 1420, tax: 5310, net: 55090, cash: 28400, card: 17800, upi: 8890, bills: 138, refunds: 600 },
    '2026-09-05': { gross: 47900, disc: 1200, tax: 4910, net: 51610, cash: 25200, card: 16900, upi: 9510, bills: 122, refunds: 250 },
    '2026-09-04': { gross: 41500, disc: 920, tax: 4210, net: 44790, cash: 22100, card: 14100, upi: 8590, bills: 105, refunds: 0 },
    '2026-09-03': { gross: 38400, disc: 750, tax: 3890, net: 41540, cash: 19800, card: 13500, upi: 8240, bills: 98, refunds: 180 },
    '2026-09-02': { gross: 40100, disc: 820, tax: 4050, net: 43330, cash: 20900, card: 14000, upi: 8430, bills: 101, refunds: 350 },
    '2026-09-01': { gross: 36900, disc: 680, tax: 3710, net: 39930, cash: 18900, card: 12800, upi: 8230, bills: 94, refunds: 100 }
  };

  async ngOnInit() {
    await this.loadCashCounters();
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

    this.setQuickDateRange('this_month');
  }

  async loadCashCounters() {
    this.cashCounters = await this.api.getCashCounters();
    if (this.cashCounters.length > 0) {
      this.selectedCounter = this.cashCounters[0];
      this.openingFloat = this.selectedCounter.opening_float ?? 2000.0;
    }
  }

  onSelectCounter(counterId: string) {
    const found = this.cashCounters.find(c => c.id === counterId);
    if (found) {
      this.selectedCounter = found;
      this.openingFloat = found.opening_float ?? 2000.0;
      this.isEditingFloat = false;
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
    this.cashCounters.push(created);
    this.selectedCounter = created;
    this.openingFloat = created.opening_float;
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

  setQuickDateRange(key: string) {
    this.quickRange = key;
    const todayStr = '2026-09-10';
    let fromStr = todayStr;
    let toStr = todayStr;

    if (key === 'today') {
      fromStr = '2026-09-10';
      toStr = '2026-09-10';
    } else if (key === 'yesterday') {
      fromStr = '2026-09-09';
      toStr = '2026-09-09';
    } else if (key === 'this_week') {
      fromStr = '2026-09-07';
      toStr = '2026-09-10';
    } else if (key === 'this_month') {
      fromStr = '2026-09-01';
      toStr = '2026-09-10';
    }

    this.fromDate = fromStr;
    this.toDate = toStr;
    this.recalculate();
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
    this.recalculate();
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

  recalculate() {
    this.formattedFromDate = this.formatDateLabel(this.fromDate);
    this.formattedPeriodLabel =
      this.formattedFromDate + (this.fromDate === this.toDate ? '' : ' – ' + this.formatDateLabel(this.toDate));

    this.totalGross = 0;
    this.totalDisc = 0;
    this.totalTax = 0;
    this.totalNet = 0;
    this.totalBills = 0;
    this.totalCash = 0;
    this.totalCard = 0;
    this.totalUpi = 0;
    this.totalRefunds = 0;

    Object.keys(this.DAILY_MOCK_REPORTS).forEach(day => {
      if (day >= this.fromDate && day <= this.toDate) {
        const d = this.DAILY_MOCK_REPORTS[day];
        this.totalGross += d.gross;
        this.totalDisc += d.disc;
        this.totalTax += d.tax;
        this.totalNet += d.net;
        this.totalBills += d.bills;
        this.totalCash += d.cash;
        this.totalCard += d.card;
        this.totalUpi += d.upi;
        this.totalRefunds += d.refunds || 0;
      }
    });

    // Payment percentage calculation
    const totalPaySum = this.totalCash + this.totalCard + this.totalUpi || 1;
    this.cashPct = Math.round((this.totalCash / totalPaySum) * 100);
    this.cardPct = Math.round((this.totalCard / totalPaySum) * 100);
    this.upiPct = Math.round((this.totalUpi / totalPaySum) * 100);
    this.discountPct = this.totalGross > 0 ? ((this.totalDisc / this.totalGross) * 100).toFixed(1) : '0.0';

    // Transactions list
    this.transactions = [
      { invoiceNo: 'INV-2026-0984', time: '14:25', itemCount: 4, grandTotal: 685.0 },
      { invoiceNo: 'INV-2026-0983', time: '14:12', itemCount: 2, grandTotal: 210.0 },
      { invoiceNo: 'INV-2026-0982', time: '13:50', itemCount: 6, grandTotal: 1450.0 },
      { invoiceNo: 'INV-2026-0981', time: '13:34', itemCount: 1, grandTotal: 135.0 },
      { invoiceNo: 'INV-2026-0980', time: '13:05', itemCount: 3, grandTotal: 520.0 }
    ];

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
    return this.openingFloat + this.totalCash - this.totalRefunds;
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
    } else if (this.activeTab === 'itemSales') {
      csvContent = dateHeader + `Item Name,Category,Qty Sold,Revenue,Share %\n`;
      this.filteredItemSales().forEach(row => {
        csvContent += `"${row.name}","${row.category}",${row.qtySold},${row.revenue},${row.share}%\n`;
      });
    } else if (this.activeTab === 'cashDrawer') {
      csvContent = dateHeader + `Counter,Opening Float,Cash Sales,Cash Refunds,Expected Cash,Counted Cash,Variance\n`;
      csvContent += `"${this.selectedCounter?.counter_name || 'Counter 1'}",${this.openingFloat},${this.totalCash},${this.totalRefunds},${this.expectedCash},${this.countedCash ?? 'N/A'},${this.cashVariance()}\n`;
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
