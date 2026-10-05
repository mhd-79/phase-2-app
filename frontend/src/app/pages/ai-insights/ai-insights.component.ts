import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

interface InsightTab { key: string; label: string; endpoint: string; }

const PALETTE = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#64748b'];

@Component({
  selector: 'app-ai-insights',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [`
    /* The router drops this host straight into the app-shell grid: without min-width:0 it grows to its widest
       child (the 12-tab row) and pushes the page off-screen. */
    :host { display:block; grid-area:main; min-width:0; max-width:100%; }
    .main { min-width:0; max-width:100%; overflow-x:clip; }
    .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .card, .stat-card, .card-flush { min-width:0; }
    .stat-value { overflow-wrap:anywhere; }
    .tab-scroll {
      max-width:100%; min-width:0; display:flex; gap:0; overflow-x:auto; border-bottom:1px solid var(--border); margin-bottom:var(--space-5); }
    .tab-scroll .tab { white-space:nowrap; cursor:pointer; }
    .meta-strip { display:flex; flex-wrap:wrap; gap:var(--space-3); align-items:center; justify-content:space-between;
      background:var(--slate-50); border:1px solid var(--border); border-radius:var(--radius-md);
      padding:var(--space-3) var(--space-4); margin-bottom:var(--space-4); }
    .bar-row { display:grid; grid-template-columns: minmax(90px, 190px) 1fr auto; gap:var(--space-3); align-items:center; padding:5px 0; }
    .bar-track { background:var(--slate-100); border-radius:999px; height:10px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:999px; background:var(--primary); }
    .chart-svg { width:100%; height:auto; display:block; }
    .chart-svg text { font-size:7px; fill:var(--slate-500); }
    .legend { display:flex; flex-wrap:wrap; gap:var(--space-3); font-size:var(--text-xs); color:var(--text-muted); margin-top:var(--space-2); }
    .legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:middle; }
    .insight-card { border-left:4px solid var(--slate-300); }
    .insight-card.good { border-left-color:var(--success-500); }
    .insight-card.watch { border-left-color:var(--warning-500); }
    .insight-card.risk { border-left-color:var(--danger-500); }
    .score-track { background:var(--slate-100); height:8px; border-radius:999px; overflow:hidden; }
    .score-fill { height:100%; border-radius:999px; }
    .factor-list { margin:var(--space-2) 0 0; padding-left:18px; color:var(--text-muted); font-size:var(--text-xs); }
    .factor-list li { margin:2px 0; }
    .chip { border:1px solid var(--border); background:var(--surface); color:var(--text); border-radius:999px;
      padding:4px 12px; font-size:var(--text-xs); font-weight:600; cursor:pointer; font-family:inherit; }
    .chip:hover { background:var(--slate-50); }
    .chip.active { background:var(--primary); border-color:var(--primary); color:#fff; }
    .chip-row { display:flex; flex-wrap:wrap; gap:var(--space-1); align-items:center; }
    .donut-wrap { display:flex; gap:var(--space-5); align-items:center; flex-wrap:wrap; }
    .demo-banner { background:var(--warning-50); border:1px solid var(--warning-500); border-left:4px solid var(--warning-500);
      border-radius:var(--radius-md); padding:var(--space-3) var(--space-4); margin-bottom:var(--space-4);
      display:flex; flex-wrap:wrap; gap:var(--space-3); align-items:center; justify-content:space-between; }
    .demo-toggle { display:inline-flex; align-items:center; gap:8px; }
    .demo-toggle.on { border-color:var(--warning-500); background:var(--warning-50); color:var(--warning-700); }
    .wide { grid-column: 1 / -1; }
    @media (max-width: 900px) { .grid-4, .grid-3, .grid-2 { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 600px) { .grid-4, .grid-3, .grid-2 { grid-template-columns: 1fr; } }
  `],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P2-AI-001..012</span>
          <h1>AI Insights</h1>
          <p>Vendor intelligence, demand forecasting, restocking and pricing guidance — computed live from your PostgreSQL sales, inventory, vendor, purchase and order data.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-secondary demo-toggle" [class.on]="demo()" (click)="toggleDemo()"
                  title="Preview every AI Insights screen with generated sample data. Nothing is read from or written to your real records.">
            <span [style.background]="demo() ? 'var(--warning-500)' : 'var(--slate-300)'" style="width:8px;height:8px;border-radius:50%;display:inline-block"></span>
            Sample data: {{ demo() ? 'On' : 'Off' }}
          </button>
          <button type="button" class="btn btn-secondary" (click)="exportCsv()" [disabled]="!csvAvailable()">Export CSV</button>
          <button type="button" class="btn btn-primary" (click)="reload()" [disabled]="loading()">{{ loading() ? 'Analysing…' : 'Refresh' }}</button>
        </div>
      </div>

      @if (demo()) {
        <div class="demo-banner" role="status">
          <div class="text-sm">
            <strong style="color:var(--warning-700)">SAMPLE DATA</strong> — you are previewing generated demo data for a store with about 3 months of trading history.
            It is created in memory for this view only: nothing is read from or written to your real sales, stock, vendor or purchase records, and no purchase orders can be created from it.
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="toggleDemo()">Switch to live data</button>
        </div>
      }

      <div class="tab-scroll">
        @for (t of tabs; track t.key) {
          <div class="tab" [class.active]="tab() === t.key" (click)="select(t.key)">{{ t.label }}</div>
        }
      </div>

      <!-- tab-specific controls -->
      @if (tab() === 'summary' || tab() === 'sales') {
        <div class="chip-row" style="margin-bottom:var(--space-4)">
          <span class="text-xs text-muted" style="font-weight:600">Period:</span>
          @for (d of [7, 30, 90]; track d) {
            <button type="button" class="chip" [class.active]="days === d" (click)="setDays(d)">Last {{ d }} days</button>
          }
        </div>
      }
      @if (tab() === 'forecast') {
        <div class="chip-row" style="margin-bottom:var(--space-4)">
          <span class="text-xs text-muted" style="font-weight:600">Horizon:</span>
          @for (d of [7, 14, 28]; track d) {
            <button type="button" class="chip" [class.active]="horizon === d" (click)="setHorizon(d)">Next {{ d }} days</button>
          }
        </div>
      }
      @if (tab() === 'trending') {
        <div class="chip-row" style="margin-bottom:var(--space-4)">
          <span class="text-xs text-muted" style="font-weight:600">Compare last:</span>
          @for (d of [7, 14, 30]; track d) {
            <button type="button" class="chip" [class.active]="trendDays === d" (click)="setTrendDays(d)">{{ d }} days vs previous {{ d }}</button>
          }
        </div>
      }
      @if (tab() === 'customers') {
        <div class="chip-row" style="margin-bottom:var(--space-4)">
          <span class="text-xs text-muted" style="font-weight:600">Period:</span>
          @for (d of [30, 90, 180, 0]; track d) {
            <button type="button" class="chip" [class.active]="custDays === d" (click)="setCustDays(d)">{{ d === 0 ? 'All time' : 'Last ' + d + ' days' }}</button>
          }
        </div>
      }
      @if (tab() === 'newproduct') {
        <div class="chip-row" style="margin-bottom:var(--space-4)">
          <span class="text-xs text-muted" style="font-weight:600">Products added in the last:</span>
          @for (d of [30, 60, 90]; track d) {
            <button type="button" class="chip" [class.active]="newDays === d" (click)="setNewDays(d)">{{ d }} days</button>
          }
        </div>
      }

      @if (current(); as d) {

        @if (d.status === 'error') {
          <div class="card insight-card risk">
            <div class="row-between">
              <strong>Insights unavailable</strong>
              <button type="button" class="btn btn-secondary btn-sm" (click)="reload()" [disabled]="loading()">Retry</button>
            </div>
            <p class="text-sm text-muted" style="margin-top:var(--space-1)">{{ d.message }}</p>
          </div>
        } @else {
          <div class="meta-strip">
            <div class="text-sm">
              <span class="text-muted">Analysed:&nbsp;</span>
              <strong>{{ d.meta?.bills_analysed }} bills</strong> over <strong>{{ d.meta?.data_days }} day(s)</strong>
              · {{ d.meta?.items_analysed }} items · as of {{ d.meta?.as_of }}
            </div>
            <span>
              @if (d.meta?.is_demo) { <span class="badge badge-warning" style="margin-right:6px">SAMPLE DATA</span> }
              <span class="badge" [ngClass]="confClass(d.meta?.confidence)">Data confidence: {{ d.meta?.confidence }}</span>
            </span>
          </div>

          @if (d.status === 'insufficient_data') {
            <div class="card">
              <div class="empty-state">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>
                <p>{{ d.message }}</p>
                <p class="text-xs text-muted">Nothing is estimated or made up — this insight unlocks as real sales and purchase history accumulates.</p>
              </div>
            </div>
          } @else {

            <!-- ============================ CUSTOMER BEHAVIOUR ============================ -->
            @if (tab() === 'customers') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Customers who purchased</span><span class="stat-value">{{ d.kpis.customers_purchased }}</span>
                  <span class="stat-delta text-muted">of {{ d.kpis.customers_registered }} registered</span></div>
                <div class="card stat-card"><span class="stat-label">Customer sales</span><span class="stat-value">{{ inr(d.kpis.total_revenue) }}</span>
                  <span class="stat-delta text-muted">{{ d.kpis.invoices }} invoices · avg bill {{ inr(d.kpis.avg_bill_value) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Average spend per customer</span><span class="stat-value">{{ inr(d.kpis.avg_spend_per_customer) }}</span>
                  <span class="stat-delta text-muted">median {{ inr(d.spending.median_per_customer) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Repeat customers</span><span class="stat-value">{{ pctOrDash(d.kpis.repeat_rate) }}</span>
                  <span class="stat-delta text-muted">{{ d.repeat.repeat_customers }} bought more than once</span></div>
              </div>

              @if (d.highlights.length) {
                <div class="card" style="margin-bottom:var(--space-5)">
                  <div class="row-between" style="margin-bottom:var(--space-2)"><h3>What the data says</h3><span class="badge badge-primary">{{ d.highlights.length }}</span></div>
                  <div class="stack" style="gap:var(--space-2)">
                    @for (h of d.highlights; track h.text) {
                      <div class="insight-card" [ngClass]="h.status" style="padding:var(--space-2) var(--space-3);background:var(--slate-50);border-radius:var(--radius-md)"><span class="text-sm">{{ h.text }}</span></div>
                    }
                  </div>
                </div>
              }

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card">
                  <h3>Frequently purchased products</h3>
                  <p class="text-xs text-muted" style="margin-bottom:var(--space-3)">Most units bought by customers, with how many customers bought them and how many came back for more.</p>
                  @for (p of d.products; track p.sku) {
                    <div class="bar-row" [title]="p.customers + ' customer(s), ' + p.repeat_buyers + ' repeat buyer(s)'">
                      <span class="text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</span>
                      <div class="bar-track"><div class="bar-fill" [style.width.%]="barPct(p.qty, d.products[0].qty)"></div></div>
                      <span class="text-xs mono">{{ num(p.qty, 1) }} · {{ p.customers }} cust</span>
                    </div>
                  }
                </div>
                <div class="stack">
                  <div class="card">
                    <h3>Most purchased categories</h3>
                    @for (c of d.categories.most; track c.category) {
                      <div class="bar-row">
                        <span class="text-sm">{{ c.category }}</span>
                        <div class="bar-track"><div class="bar-fill" style="background:var(--success-500)" [style.width.%]="barPct(c.revenue, d.categories.most[0].revenue)"></div></div>
                        <span class="text-xs mono">{{ inr(c.revenue) }} · {{ c.share }}%</span>
                      </div>
                    }
                  </div>
                  <div class="card">
                    <h3>Least purchased categories</h3>
                    @for (c of d.categories.least; track c.category) {
                      <div class="bar-row">
                        <span class="text-sm">{{ c.category }}</span>
                        <div class="bar-track"><div class="bar-fill" style="background:var(--warning-500)" [style.width.%]="barPct(c.revenue, d.categories.most[0].revenue || 1)"></div></div>
                        <span class="text-xs mono">{{ inr(c.revenue) }} · {{ c.customers }} cust</span>
                      </div>
                    }
                  </div>
                </div>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card">
                  <h3>Purchase frequency</h3>
                  <p class="text-xs text-muted" style="margin-bottom:var(--space-3)">{{ num(d.frequency.avg_purchases_per_customer, 2) }} purchases per customer
                    ({{ num(d.frequency.purchases_per_customer_per_month, 2) }} a month)@if (d.frequency.avg_days_between_purchases !== null) { · repeat customers return every {{ d.frequency.avg_days_between_purchases }} days (median {{ d.frequency.median_days_between_purchases }}) }</p>
                  @for (b of d.frequency.distribution; track b.label) {
                    <div class="bar-row">
                      <span class="text-sm">{{ b.label }}</span>
                      <div class="bar-track"><div class="bar-fill" [style.width.%]="b.customers ? barPct(b.customers, d.kpis.customers_purchased) : 0"></div></div>
                      <span class="text-xs mono">{{ b.customers }} · {{ pctOrDash(b.share) }}</span>
                    </div>
                  }
                </div>
                <div class="card">
                  <h3>Average spending per customer</h3>
                  <p class="text-xs text-muted" style="margin-bottom:var(--space-3)">Average {{ inr(d.spending.avg_per_customer) }} · median {{ inr(d.spending.median_per_customer) }} · average bill {{ inr(d.spending.avg_bill_value) }}</p>
                  @for (b of d.spending.bands; track b.label) {
                    <div class="bar-row">
                      <span class="text-sm">{{ b.label }}</span>
                      <div class="bar-track"><div class="bar-fill" style="background:var(--indigo-400)" [style.width.%]="b.customers ? barPct(b.customers, d.kpis.customers_purchased) : 0"></div></div>
                      <span class="text-xs mono">{{ b.customers }} cust</span>
                    </div>
                  }
                  <div class="table-scroll" style="margin-top:var(--space-3)">
                    <table class="table">
                      <thead><tr><th>Top spenders</th><th class="num">Invoices</th><th class="num">Spent</th><th class="num">Share</th></tr></thead>
                      <tbody>
                        @for (c of d.spending.top_spenders; track c.id) {
                          <tr><td>{{ c.name }}</td><td class="num">{{ c.invoices }}</td><td class="num mono">{{ inr(c.total) }}</td><td class="num">{{ pctOrDash(c.share) }}</td></tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card card-flush">
                  <div class="card-header"><h3>Repeat customer patterns</h3>
                    <span class="badge badge-neutral">{{ d.repeat.repeat_customers }} repeat · {{ d.repeat.one_time_customers }} one-time</span></div>
                  <p class="text-xs text-muted" style="padding:0 var(--space-4)">Repeat customers bring {{ pctOrDash(d.repeat.repeat_revenue_share) }} of customer sales.</p>
                  <div class="table-scroll">
                    <table class="table">
                      <thead><tr><th>Customer</th><th class="num">Invoices</th><th class="num">Every</th><th>Favourite</th><th>Last bought</th></tr></thead>
                      <tbody>
                        @for (c of d.repeat.customers; track c.id) {
                          <tr><td>{{ c.name }}</td><td class="num">{{ c.invoices }}</td><td class="num">{{ c.avg_days_between !== null ? c.avg_days_between + ' d' : '—' }}</td><td>{{ c.favourite_product || '—' }}</td><td>{{ c.last_purchase }}</td></tr>
                        }
                        @if (!d.repeat.customers.length) { <tr><td colspan="5" class="text-center text-muted" style="padding:var(--space-3)">No repeat customers in this period yet.</td></tr> }
                      </tbody>
                    </table>
                  </div>
                </div>
                <div class="card">
                  <h3>When customers buy</h3>
                  <p class="text-xs text-muted" style="margin-bottom:var(--space-3)">Customer invoices by day of the week.</p>
                  @for (w of d.repeat.by_weekday; track w.day) {
                    <div class="bar-row">
                      <span class="text-sm">{{ w.day }}</span>
                      <div class="bar-track"><div class="bar-fill" style="background:var(--violet-500, #8b5cf6)" [style.width.%]="w.invoices ? barPct(w.invoices, weekdayMax(d.repeat.by_weekday)) : 0"></div></div>
                      <span class="text-xs mono">{{ w.invoices }} · {{ inr(w.revenue) }}</span>
                    </div>
                  }
                </div>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card">
                  <h3>Frequently bought together</h3>
                  <p class="text-xs text-muted" style="margin-bottom:var(--space-3)">Product pairs that appear on the same customer invoice (at least twice).</p>
                  @for (c of d.combinations; track c.a + c.b) {
                    <div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
                      <span class="text-sm">{{ c.a }} <span class="text-muted">+</span> {{ c.b }}</span>
                      <span class="badge badge-neutral">{{ c.bills }} bills · {{ pctOrDash(c.share) }}</span>
                    </div>
                  }
                  @if (!d.combinations.length) { <p class="text-sm text-muted">No product pair has been bought together more than once yet.</p> }
                </div>
                <div class="card">
                  <h3>Payment preference</h3>
                  <p class="text-xs text-muted" style="margin-bottom:var(--space-3)">How customers pay.</p>
                  @for (m of d.payment_mix; track m.mode) {
                    <div class="bar-row">
                      <span class="text-sm">{{ m.mode }}</span>
                      <div class="bar-track"><div class="bar-fill" style="background:var(--success-500)" [style.width.%]="m.share"></div></div>
                      <span class="text-xs mono">{{ inr(m.amount) }} · {{ m.share }}%</span>
                    </div>
                  }
                </div>
              </div>

              <div class="card" style="margin-bottom:var(--space-5)">
                <div class="row-between">
                  <div><h3>Recent purchasing trend</h3><p class="text-xs text-muted">Customer sales per week, last 8 weeks.</p></div>
                  <div class="text-sm">
                    <span class="badge" [ngClass]="d.trend.revenue_change_pct === null ? 'badge-neutral' : d.trend.revenue_change_pct >= 0 ? 'badge-success' : 'badge-warning'">Sales {{ d.trend.revenue_change_pct === null ? '—' : (d.trend.revenue_change_pct >= 0 ? '▲ ' : '▼ ') + Math.abs(d.trend.revenue_change_pct) + '%' }}</span>
                    <span class="badge badge-neutral">Active customers {{ d.trend.customers_change_pct === null ? '—' : (d.trend.customers_change_pct >= 0 ? '▲ ' : '▼ ') + Math.abs(d.trend.customers_change_pct) + '%' }}</span>
                    <span class="badge badge-info">{{ d.trend.new_customers_last4 }} new customers (4 wks)</span>
                  </div>
                </div>
                <div style="display:flex;align-items:flex-end;gap:var(--space-2);height:150px;margin-top:var(--space-3)">
                  @for (w of d.trend.weeks; track w.week_start) {
                    <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%" [title]="w.invoices + ' invoices · ' + w.customers + ' customers · ' + w.new_customers + ' new'">
                      <span class="text-xs mono" style="margin-bottom:2px">{{ w.revenue ? inr(w.revenue) : '' }}</span>
                      <div [style.height.%]="w.revenue ? barPct(w.revenue, weekMax(d.trend.weeks)) * 0.8 : 1" style="width:100%;background:var(--primary);border-radius:4px 4px 0 0;min-height:2px"></div>
                      <span class="text-xs text-muted" style="margin-top:4px">{{ w.week_start.slice(5) }}</span>
                    </div>
                  }
                </div>
              </div>

              <div class="card card-flush" style="margin-bottom:var(--space-5)">
                <div class="card-header"><h3>Customer buying preferences</h3><span class="text-xs text-muted">Top 10 customers by spend</span></div>
                <div class="table-scroll">
                  <table class="table">
                    <thead><tr><th>Customer</th><th class="num">Invoices</th><th class="num">Spent</th><th class="num">Avg bill</th><th>Favourite category</th><th>Favourite product</th><th>Pays by</th></tr></thead>
                    <tbody>
                      @for (c of d.preferences; track c.id) {
                        <tr><td><strong>{{ c.name }}</strong></td><td class="num">{{ c.invoices }}</td><td class="num mono">{{ inr(c.total) }}</td><td class="num mono">{{ inr(c.avg_bill) }}</td>
                          <td>{{ c.favourite_category || '—' }}</td><td>{{ c.favourite_product || '—' }}</td><td>{{ c.preferred_payment || '—' }}</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="card card-flush">
                <div class="card-header"><h3>Inactive &amp; less-active customers</h3>
                  <span class="text-xs text-muted">Active: bought within {{ d.activity.active_days }} days · Less active: up to {{ d.activity.inactive_days }} days · Inactive: longer</span></div>
                <div class="grid grid-4" style="padding:0 var(--space-4) var(--space-3)">
                  <div class="card stat-card"><span class="stat-label">Active</span><span class="stat-value" style="color:var(--success-700)">{{ d.activity.active }}</span></div>
                  <div class="card stat-card"><span class="stat-label">Less active</span><span class="stat-value" style="color:var(--warning-700)">{{ d.activity.less_active }}</span></div>
                  <div class="card stat-card"><span class="stat-label">Inactive</span><span class="stat-value" style="color:var(--danger-700)">{{ d.activity.inactive }}</span></div>
                  <div class="card stat-card"><span class="stat-label">Never purchased</span><span class="stat-value">{{ d.activity.never_purchased }}</span></div>
                </div>
                <div class="table-scroll">
                  <table class="table">
                    <thead><tr><th>Customer</th><th>Status</th><th>Last purchase</th><th class="num">Days ago</th><th class="num">Invoices</th><th class="num">Lifetime spend</th></tr></thead>
                    <tbody>
                      @for (c of d.activity.customers; track c.id) {
                        <tr><td>{{ c.name }}</td><td><span class="badge" [ngClass]="c.status === 'Inactive' ? 'badge-danger' : 'badge-warning'">{{ c.status }}</span></td>
                          <td>{{ c.last_purchase }}</td><td class="num">{{ c.days_since }}</td><td class="num">{{ c.invoices }}</td><td class="num mono">{{ inr(c.lifetime_spend) }}</td></tr>
                      }
                      @if (!d.activity.customers.length) { <tr><td colspan="6" class="text-center text-muted" style="padding:var(--space-3)">Every purchasing customer is active.</td></tr> }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- ============================ BUSINESS SUMMARY ============================ -->
            @if (tab() === 'summary') {
              <div class="card insight-card" [ngClass]="d.overall" style="margin-bottom:var(--space-5)">
                <div class="row-between">
                  <div>
                    <span class="text-xs text-muted" style="font-weight:600;text-transform:uppercase;letter-spacing:.06em">AI Business Summary · last {{ d.window_days }} days</span>
                    <h2 style="margin-top:4px">{{ d.headline }}</h2>
                  </div>
                  <span class="badge" [ngClass]="statusBadge(d.overall)">{{ d.overall === 'good' ? 'Healthy' : d.overall === 'watch' ? 'Needs attention' : 'Action required' }}</span>
                </div>
              </div>

              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                @if (d.kpis.revenue !== undefined) {
                  <div class="card stat-card"><span class="stat-label">Sales</span><span class="stat-value">{{ inr(d.kpis.revenue) }}</span>
                    @if (d.kpis.revenue_change_pct !== null && d.kpis.revenue_change_pct !== undefined) {
                      <span class="stat-delta" [class.up]="d.kpis.revenue_change_pct >= 0" [class.down]="d.kpis.revenue_change_pct < 0">{{ d.kpis.revenue_change_pct >= 0 ? '▲' : '▼' }} {{ Math.abs(d.kpis.revenue_change_pct) }}% vs previous period</span>
                    } @else {
                      <span class="stat-delta text-muted">No complete previous period yet</span>
                    }</div>
                  <div class="card stat-card"><span class="stat-label">Bills · Avg bill</span><span class="stat-value">{{ d.kpis.bills }} · {{ inr(d.kpis.avg_bill_value) }}</span></div>
                }
                @if (d.kpis.blended_margin_pct !== undefined) {
                  <div class="card stat-card"><span class="stat-label">Blended gross margin</span><span class="stat-value">{{ d.kpis.blended_margin_pct }}%</span></div>
                }
                <div class="card stat-card"><span class="stat-label">Items to reorder</span><span class="stat-value" [style.color]="d.kpis.low_stock_items ? 'var(--warning-700)' : ''">{{ d.kpis.low_stock_items }}</span>
                  <span class="stat-delta">{{ d.kpis.out_of_stock }} out of stock · {{ inr(d.kpis.reorder_value) }} to restock</span></div>
                <div class="card stat-card"><span class="stat-label">Vendor payables</span><span class="stat-value">{{ inr(d.kpis.total_payable) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Stock value at risk</span><span class="stat-value">{{ inr(d.kpis.capital_at_risk) }}</span></div>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="stack">
                  @for (s of d.sections; track s.title) {
                    <div class="card insight-card" [ngClass]="s.status">
                      <div class="row-between"><h3>{{ s.title }}</h3><span class="badge" [ngClass]="statusBadge(s.status)">{{ s.status }}</span></div>
                      <p class="text-sm" style="margin-top:var(--space-2)">{{ s.text }}</p>
                    </div>
                  }
                </div>
                <div class="card card-flush">
                  <div class="card-header"><h3>Top priorities</h3><span class="badge badge-primary">{{ d.priorities.length }}</span></div>
                  @if (d.priorities.length) {
                    <div class="card-body stack">
                      @for (p of d.priorities; track p.title) {
                        <div style="padding-bottom:var(--space-3);border-bottom:1px solid var(--border)">
                          <div class="row-between">
                            <div><span class="badge badge-neutral">{{ p.area }}</span> <strong>{{ p.title }}</strong></div>
                            <button type="button" class="btn btn-secondary btn-sm" (click)="select(linkTab(p.link))">Open</button>
                          </div>
                          <p class="text-xs text-muted" style="margin-top:4px">{{ p.detail }}</p>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="empty-state"><p>No urgent actions right now.</p></div>
                  }
                </div>
              </div>
              <p class="text-xs text-muted">{{ d.note }}</p>
            }

            <!-- ============================ SALES & REVENUE ============================ -->
            @if (tab() === 'sales') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Sales (incl. GST)</span><span class="stat-value">{{ inr(d.kpis.revenue) }}</span>
                  @if (d.kpis.revenue_change_pct !== null) {
                    <span class="stat-delta" [class.up]="d.kpis.revenue_change_pct >= 0" [class.down]="d.kpis.revenue_change_pct < 0">{{ d.kpis.revenue_change_pct >= 0 ? '▲' : '▼' }} {{ Math.abs(d.kpis.revenue_change_pct) }}% vs previous {{ d.days }} days</span>
                  } @else {
                    <span class="stat-delta text-muted">No complete previous {{ d.days }}-day period yet</span>
                  }</div>
                <div class="card stat-card"><span class="stat-label">Units sold</span><span class="stat-value">{{ num(d.kpis.units, 0) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Bills</span><span class="stat-value">{{ d.kpis.bills }}</span></div>
                <div class="card stat-card"><span class="stat-label">Average bill value</span><span class="stat-value">{{ inr(d.kpis.avg_bill_value) }}</span></div>
              </div>

              <div class="card" style="margin-bottom:var(--space-5)">
                <div class="row-between"><h3>Daily sales trend</h3><span class="text-xs text-muted">Net of returns · IST days</span></div>
                @let sc = salesChart(d.daily);
                <svg class="chart-svg" viewBox="0 0 640 210" role="img" aria-label="Daily sales line chart">
                  @for (t of sc.yTicks; track t.y) {
                    <line x1="44" [attr.x2]="628" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--slate-100)"/>
                    <text x="40" [attr.y]="t.y + 3" text-anchor="end">{{ t.label }}</text>
                  }
                  <path [attr.d]="sc.area" fill="var(--primary)" opacity="0.10"/>
                  <path [attr.d]="sc.line" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>
                  @for (x of sc.xLabels; track x.x) { <text [attr.x]="x.x" y="204" text-anchor="middle">{{ x.label }}</text> }
                </svg>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card">
                  <h3>Revenue by category</h3>
                  <div class="donut-wrap" style="margin-top:var(--space-3)">
                    <svg viewBox="0 0 42 42" width="170" height="170" role="img" aria-label="Category revenue share">
                      <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--slate-100)" stroke-width="6"/>
                      @for (s of donut(d.categories, 'revenue', 'category'); track s.label) {
                        <circle cx="21" cy="21" r="15.9155" fill="none" [attr.stroke]="s.color" stroke-width="6"
                                [attr.stroke-dasharray]="s.pct + ' ' + (100 - s.pct)" [attr.stroke-dashoffset]="s.offset" transform="rotate(-90 21 21)"/>
                      }
                    </svg>
                    <div style="flex:1;min-width:200px">
                      @for (s of donut(d.categories, 'revenue', 'category'); track s.label) {
                        <div class="row-between text-sm" style="padding:3px 0"><span><i [style.background]="s.color" style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px"></i>{{ s.label }}</span><span class="mono">{{ s.pct }}% · {{ inr(s.value) }}</span></div>
                      }
                    </div>
                  </div>
                </div>
                <div class="card">
                  <h3>Payment mix</h3>
                  <div style="margin-top:var(--space-3)">
                    @for (p of d.payment_mix; track p.mode) {
                      <div class="bar-row"><span class="text-sm">{{ p.mode }}</span>
                        <div class="bar-track"><div class="bar-fill" [style.width.%]="p.share_pct"></div></div>
                        <span class="mono text-sm">{{ p.share_pct }}% · {{ inr(p.amount) }}</span></div>
                    } @empty { <p class="text-sm text-muted">No tender data in this period.</p> }
                  </div>
                </div>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card">
                  <h3>Top products by revenue</h3>
                  <div style="margin-top:var(--space-3)">
                    @for (p of d.top_by_revenue; track p.sku) {
                      <div class="bar-row"><span class="text-sm" [title]="p.name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</span>
                        <div class="bar-track"><div class="bar-fill" [style.width.%]="barPct(p.revenue, d.top_by_revenue[0].revenue)"></div></div>
                        <span class="mono text-sm">{{ inr(p.revenue) }}</span></div>
                    }
                  </div>
                </div>
                <div class="card">
                  <h3>Top products by units</h3>
                  <div style="margin-top:var(--space-3)">
                    @for (p of d.top_by_units; track p.sku) {
                      <div class="bar-row"><span class="text-sm" [title]="p.name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</span>
                        <div class="bar-track"><div class="bar-fill" style="background:var(--success-500)" [style.width.%]="barPct(p.units, d.top_by_units[0].units)"></div></div>
                        <span class="mono text-sm">{{ num(p.units, 0) }}</span></div>
                    }
                  </div>
                </div>
              </div>

              <div class="grid grid-2" style="margin-bottom:var(--space-5);align-items:start">
                <div class="card">
                  <h3>Sales by hour of day</h3>
                  @let hc = columns(d.hourly, 'hour', 'revenue');
                  <svg class="chart-svg" viewBox="0 0 320 156" role="img" aria-label="Hourly sales chart: sales in rupees by hour of day">
                    @for (t of hc.yTicks; track t.y) {
                      <line x1="38" x2="316" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--slate-100)"/>
                      <text x="34" [attr.y]="t.y + 3" text-anchor="end">{{ t.label }}</text>
                    }
                    @for (c of hc.bars; track c.label) {
                      <rect [attr.x]="c.x" [attr.y]="c.y" [attr.width]="c.w" [attr.height]="c.h" rx="2" fill="var(--primary)"><title>{{ c.label }}:00 — {{ inr(c.value) }}</title></rect>
                      <text [attr.x]="c.x + c.w / 2" y="127" text-anchor="middle">{{ c.label }}</text>
                    }
                    <text x="177" y="151" text-anchor="middle" class="axis-title">Hour of day (24-hour clock, IST)</text>
                    <text x="9" y="66" text-anchor="middle" class="axis-title" transform="rotate(-90 9 66)">Sales (₹)</text>
                  </svg>
                </div>
                <div class="card">
                  <h3>Sales by weekday</h3>
                  @let wc = columns(d.weekday, 'day', 'revenue');
                  <svg class="chart-svg" viewBox="0 0 320 156" role="img" aria-label="Weekday sales chart: sales in rupees by day of week">
                    @for (t of wc.yTicks; track t.y) {
                      <line x1="38" x2="316" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--slate-100)"/>
                      <text x="34" [attr.y]="t.y + 3" text-anchor="end">{{ t.label }}</text>
                    }
                    @for (c of wc.bars; track c.label) {
                      <rect [attr.x]="c.x" [attr.y]="c.y" [attr.width]="c.w" [attr.height]="c.h" rx="2" fill="var(--success-500)"><title>{{ c.label }} — {{ inr(c.value) }}</title></rect>
                      <text [attr.x]="c.x + c.w / 2" y="127" text-anchor="middle">{{ c.label }}</text>
                    }
                    <text x="177" y="151" text-anchor="middle" class="axis-title">Day of week</text>
                    <text x="9" y="66" text-anchor="middle" class="axis-title" transform="rotate(-90 9 66)">Sales (₹)</text>
                  </svg>
                </div>
              </div>

              <div class="card card-flush">
                <div class="card-header"><h3>Category performance</h3></div>
                <div class="table-scroll"><table class="table">
                  <thead><tr><th>Category</th><th class="num">Revenue</th><th class="num">Share</th><th class="num">Units</th><th class="num">Margin</th></tr></thead>
                  <tbody>@for (c of d.categories; track c.category) {
                    <tr><td><strong>{{ c.category }}</strong></td><td class="num mono">{{ inr(c.revenue) }}</td><td class="num">{{ c.share_pct }}%</td><td class="num">{{ num(c.units, 0) }}</td><td class="num">{{ c.margin_pct === null ? '—' : c.margin_pct + '%' }}</td></tr>
                  }</tbody></table></div>
              </div>
            }

            <!-- ============================ DEMAND FORECAST ============================ -->
            @if (tab() === 'forecast') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Forecast sales · next 7 days</span><span class="stat-value">{{ inr(d.summary.next_7d_revenue) }}</span>
                  @if (d.summary.change_pct !== null) { <span class="stat-delta" [class.up]="d.summary.change_pct >= 0" [class.down]="d.summary.change_pct < 0">{{ d.summary.change_pct >= 0 ? '▲' : '▼' }} {{ Math.abs(d.summary.change_pct) }}% vs last 7 days ({{ inr(d.summary.last_7d_revenue) }})</span> }</div>
                <div class="card stat-card"><span class="stat-label">Forecast sales · next 14 days</span><span class="stat-value">{{ inr(d.summary.next_14d_revenue) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Forecast units · next 7 days</span><span class="stat-value">{{ num(d.summary.next_7d_units, 0) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Model confidence</span><span class="stat-value" style="text-transform:capitalize">{{ d.model.confidence }}</span>
                  <span class="stat-delta">{{ d.model.backtest_wape_pct === null ? 'Back-test needs 21+ days' : 'Back-test error ' + d.model.backtest_wape_pct + '%' }} · {{ d.model.seasonal ? 'weekday pattern on' : 'no weekday pattern yet' }}</span></div>
              </div>

              <div class="card" style="margin-bottom:var(--space-5)">
                <div class="row-between"><h3>Sales history &amp; forecast</h3><span class="text-xs text-muted">Shaded band = ~80% range</span></div>
                @let fc = forecastChart(d);
                <svg class="chart-svg" viewBox="0 0 640 220" role="img" aria-label="Sales forecast chart">
                  @for (t of fc.yTicks; track t.y) {
                    <line x1="44" x2="628" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--slate-100)"/>
                    <text x="40" [attr.y]="t.y + 3" text-anchor="end">{{ t.label }}</text>
                  }
                  <path [attr.d]="fc.band" fill="var(--warning-500)" opacity="0.18"/>
                  <path [attr.d]="fc.history" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>
                  <path [attr.d]="fc.forecast" fill="none" stroke="var(--warning-700)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>
                  <line [attr.x1]="fc.splitX" [attr.x2]="fc.splitX" y1="10" y2="190" stroke="var(--slate-300)" stroke-dasharray="2 3"/>
                  @for (x of fc.xLabels; track x.x) { <text [attr.x]="x.x" y="212" text-anchor="middle">{{ x.label }}</text> }
                </svg>
                <div class="legend"><span><i style="background:var(--primary)"></i>Actual</span><span><i style="background:var(--warning-700)"></i>Forecast</span><span><i style="background:var(--warning-500);opacity:.4"></i>Likely range</span></div>
              </div>

              <div class="grid grid-2" style="align-items:start">
                <div class="card card-flush">
                  <div class="card-header"><h3>Daily forecast</h3></div>
                  <div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th class="num">Sales</th><th class="num">Range</th><th class="num">Units</th></tr></thead>
                    <tbody>@for (f of d.forecast; track f.date) {
                      <tr><td>{{ f.date }}</td><td class="num mono">{{ inr(f.revenue) }}</td><td class="num text-xs text-muted">{{ inr(f.revenue_low) }} – {{ inr(f.revenue_high) }}</td><td class="num">{{ num(f.units, 0) }}</td></tr>
                    }</tbody></table></div>
                </div>
                <div class="card card-flush">
                  <div class="card-header"><h3>Top-item demand vs stock</h3></div>
                  <div class="table-scroll"><table class="table"><thead><tr><th>Item</th><th class="num">Next 7d</th><th class="num">Stock + on order</th><th class="num">7d shortfall</th></tr></thead>
                    <tbody>@for (i of d.items; track i.sku) {
                      <tr><td><strong>{{ i.name }}</strong><div class="text-xs text-muted mono">{{ i.sku }}</div></td><td class="num">{{ num(i.forecast_7d, 0) }}</td><td class="num">{{ num(i.stock + i.on_order, 0) }}</td>
                        <td class="num" [style.color]="i.shortfall_7d > 0 ? 'var(--danger-700)' : ''" style="font-weight:700">{{ i.shortfall_7d > 0 ? num(i.shortfall_7d, 0) : '—' }}</td></tr>
                    } @empty { <tr><td colspan="4" class="text-muted">No item-level demand yet.</td></tr> }</tbody></table></div>
                </div>
              </div>
              <p class="text-xs text-muted" style="margin-top:var(--space-3)">{{ d.method }}</p>
            }

            <!-- ============================ TRENDING ============================ -->
            @if (tab() === 'trending') {
              <div class="grid grid-3" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Rising products</span><span class="stat-value" style="color:var(--success-700)">{{ d.summary.rising }}</span></div>
                <div class="card stat-card"><span class="stat-label">Cooling products</span><span class="stat-value" style="color:var(--danger-700)">{{ d.summary.cooling }}</span></div>
                <div class="card stat-card"><span class="stat-label">New entrants</span><span class="stat-value">{{ d.summary.new_entrants }}</span></div>
              </div>
              <div class="card card-flush" style="margin-bottom:var(--space-5)">
                <div class="card-header"><h3>Trending up</h3><span class="text-sm text-muted">Last {{ d.window_days }} days vs the {{ d.window_days }} before</span></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Product</th><th>Trend</th><th class="num">Units (now / before)</th><th class="num">Stock cover</th><th>Recommendation</th></tr></thead>
                  <tbody>@for (r of d.rising; track r.sku) {
                    <tr><td><strong>{{ r.name }}</strong><div class="text-xs text-muted mono">{{ r.sku }} · {{ r.category }}</div></td>
                      <td><span class="badge badge-success">{{ r.label }} +{{ r.growth_pct }}%</span></td>
                      <td class="num">{{ num(r.recent_units, 0) }} / {{ num(r.previous_units, 0) }}</td>
                      <td class="num">{{ r.days_of_cover === null ? '—' : num(r.days_of_cover, 0) + ' d' }}</td>
                      <td class="text-sm">{{ r.recommendation }}</td></tr>
                  } @empty { <tr><td colspan="5" class="text-muted">No products are accelerating in this period.</td></tr> }</tbody></table></div>
              </div>
              <div class="grid grid-2" style="align-items:start;margin-bottom:var(--space-5)">
                <div class="card card-flush">
                  <div class="card-header"><h3>Cooling down</h3></div>
                  <div class="table-scroll"><table class="table"><thead><tr><th>Product</th><th>Change</th><th>Advice</th></tr></thead>
                    <tbody>@for (r of d.cooling; track r.sku) {
                      <tr><td><strong>{{ r.name }}</strong><div class="text-xs text-muted mono">{{ r.sku }}</div></td><td><span class="badge badge-danger">{{ r.growth_pct }}%</span></td><td class="text-sm">{{ r.recommendation }}</td></tr>
                    } @empty { <tr><td colspan="3" class="text-muted">Nothing is cooling.</td></tr> }</tbody></table></div>
                </div>
                <div class="card card-flush">
                  <div class="card-header"><h3>New entrants</h3></div>
                  <div class="table-scroll"><table class="table"><thead><tr><th>Product</th><th class="num">Units</th><th>Advice</th></tr></thead>
                    <tbody>@for (r of d.new_entrants; track r.sku) {
                      <tr><td><strong>{{ r.name }}</strong><div class="text-xs text-muted mono">{{ r.sku }}</div></td><td class="num">{{ num(r.recent_units, 0) }}</td><td class="text-sm">{{ r.recommendation }}</td></tr>
                    } @empty { <tr><td colspan="3" class="text-muted">No new sellers this period.</td></tr> }</tbody></table></div>
                </div>
              </div>
              <div class="card">
                <h3>Category momentum</h3>
                <div style="margin-top:var(--space-3)">
                  @for (c of d.categories; track c.category) {
                    <div class="row-between text-sm" style="padding:4px 0"><span>{{ c.category }}</span>
                      <span class="mono">{{ inr(c.recent_daily_revenue) }}/day
                        <span class="badge" [ngClass]="c.growth_pct === null ? 'badge-neutral' : c.growth_pct >= 0 ? 'badge-success' : 'badge-danger'">{{ c.growth_pct === null ? 'new' : (c.growth_pct >= 0 ? '+' : '') + c.growth_pct + '%' }}</span></span></div>
                  }
                </div>
              </div>
            }

            <!-- ============================ LOW-STOCK REORDER LIST ============================ -->
            @if (tab() === 'lowstock') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Items to reorder</span><span class="stat-value">{{ d.summary.items }}</span></div>
                <div class="card stat-card"><span class="stat-label">Critical</span><span class="stat-value" style="color:var(--danger-700)">{{ d.summary.critical }}</span><span class="stat-delta">{{ d.summary.out_of_stock }} out of stock</span></div>
                <div class="card stat-card"><span class="stat-label">Estimated cost</span><span class="stat-value">{{ inr(d.summary.est_total_cost) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Vendors involved</span><span class="stat-value">{{ d.summary.vendors }}</span></div>
              </div>
              @if (d.vendor_groups.length) {
                <div class="grid grid-3" style="margin-bottom:var(--space-5)">
                  @for (g of d.vendor_groups; track g.vendor_name) {
                    <div class="card">
                      <div class="row-between"><strong>{{ g.vendor_name }}</strong><span class="badge badge-neutral">{{ g.item_count }} item{{ g.item_count === 1 ? '' : 's' }}</span></div>
                      <div class="stat-value" style="font-size:var(--text-lg);margin:var(--space-2) 0">{{ inr(g.est_cost) }}</div>
                      <div class="text-xs text-muted">{{ lineSummary(g.lines) }}</div>
                    </div>
                  }
                </div>
              }
              <div class="card card-flush">
                <div class="card-header"><h3>Automatic low-stock reorder list</h3><span class="badge badge-warning">{{ d.items.length }} item(s)</span></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Item</th><th>Urgency</th><th class="num">Stock</th><th class="num">Min</th><th class="num">Cover</th><th class="num">Suggested qty</th><th class="num">Est. cost</th><th>Vendor</th><th></th></tr></thead>
                  <tbody>@for (i of d.items; track i.sku) {
                    <tr><td><strong>{{ i.name }}</strong><div class="text-xs text-muted mono">{{ i.sku }}</div>
                        @for (r of i.reasons; track r) { <div class="text-xs text-muted">• {{ r }}</div> }</td>
                      <td><span class="badge" [ngClass]="urgencyBadge(i.urgency)">{{ i.urgency }}</span></td>
                      <td class="num">{{ i.stock }}</td><td class="num">{{ i.min_stock }}</td>
                      <td class="num">{{ i.days_of_cover === null ? '—' : num(i.days_of_cover, 1) + ' d' }}</td>
                      <td class="num" style="font-weight:700">{{ i.suggested_qty }}</td><td class="num mono">{{ inr(i.est_cost) }}</td>
                      <td>{{ i.vendor_name || '—' }}</td>
                      <td>@if (i.vendor_id && !demo()) { <a class="btn btn-primary btn-sm" routerLink="/purchase-orders" [queryParams]="poParams(i.vendor_id, i.sku, i.suggested_qty, i.unit_cost)">Create PO</a> } @else if (demo()) { <span class="badge badge-warning">Sample</span> }</td></tr>
                  } @empty { <tr><td colspan="9"><div class="empty-state"><p>Every item is above its reorder point.</p></div></td></tr> }</tbody></table></div>
              </div>
            }

            <!-- ============================ RESTOCK QUANTITIES ============================ -->
            @if (tab() === 'restock') {
              <div class="grid grid-3" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Items to restock</span><span class="stat-value">{{ d.summary.items }}</span></div>
                <div class="card stat-card"><span class="stat-label">Total units</span><span class="stat-value">{{ num(d.summary.total_units, 0) }}</span></div>
                <div class="card stat-card"><span class="stat-label">Estimated spend</span><span class="stat-value">{{ inr(d.summary.est_total_cost) }}</span></div>
              </div>
              <div class="card card-flush">
                <div class="card-header"><h3>AI restock quantity recommendations</h3><span class="text-xs text-muted">{{ d.method.formula }}</span></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Item</th><th class="num">Stock</th><th class="num">Demand / day</th><th class="num">Lead</th><th class="num">Safety</th><th class="num">Target level</th><th class="num">Order qty</th><th class="num">Est. cost</th><th></th></tr></thead>
                  <tbody>@for (i of d.items; track i.sku) {
                    <tr><td><strong>{{ i.name }}</strong> <span class="badge" [ngClass]="urgencyBadge(i.urgency)">{{ i.urgency }}</span>
                        <div class="text-xs text-muted">{{ i.explanation }}</div>
                        <div class="text-xs text-muted">{{ i.vendor_name || 'No preferred vendor' }} · confidence {{ i.confidence }}</div></td>
                      <td class="num">{{ i.stock }}<div class="text-xs text-muted">{{ i.on_order ? '+' + i.on_order + ' on order' : '' }}</div>
                        @if (i.overdue_on_order) { <div class="text-xs" style="color:var(--danger-700)">{{ i.overdue_on_order }} overdue</div> }</td>
                      <td class="num">{{ i.daily_demand }}</td><td class="num">{{ i.lead_time_days }}d<div class="text-xs text-muted">{{ i.lead_time_source }}</div></td>
                      <td class="num">{{ i.safety_stock }}</td><td class="num">{{ i.target_level }}</td>
                      <td class="num" style="font-weight:700">{{ i.recommended_qty }}</td><td class="num mono">{{ inr(i.est_cost) }}</td>
                      <td>@if (i.vendor_id && !demo()) { <a class="btn btn-primary btn-sm" routerLink="/purchase-orders" [queryParams]="poParams(i.vendor_id, i.sku, i.recommended_qty, i.unit_cost)">Create PO</a> } @else if (demo()) { <span class="badge badge-warning">Sample</span> }</td></tr>
                  } @empty { <tr><td colspan="9"><div class="empty-state"><p>No restocking is needed right now.</p></div></td></tr> }</tbody></table></div>
              </div>
            }

            <!-- ============================ REORDER TIMING ============================ -->
            @if (tab() === 'timing') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                @for (w of windowKeys; track w) {
                  <div class="card stat-card"><span class="stat-label">{{ w }}</span><span class="stat-value" [style.color]="w === 'Order now' && d.summary[w] ? 'var(--danger-700)' : ''">{{ d.summary[w] }}</span></div>
                }
              </div>
              <div class="card card-flush">
                <div class="card-header"><h3>AI reorder timing</h3><span class="text-xs text-muted">Order date = when stock + open orders hit the reorder point</span></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Item</th><th>When to order</th><th>Order by</th><th>Arrives (approx.)</th><th class="num">Cover</th><th class="num">Lead</th><th>Projected stock-out</th><th>Vendor</th></tr></thead>
                  <tbody>@for (i of d.items; track i.sku) {
                    <tr><td><strong>{{ i.name }}</strong><div class="text-xs text-muted mono">{{ i.sku }} · {{ i.daily_demand }}/day</div>
                        @if (i.stockout_risk) { <div class="text-xs" style="color:var(--danger-700)">⚠ {{ i.stockout_risk }}</div> }</td>
                      <td><span class="badge" [ngClass]="windowBadge(i.window)">{{ i.window }}</span></td>
                      <td>{{ i.order_by || '—' }}</td><td>{{ i.expected_arrival || '—' }}</td>
                      <td class="num">{{ i.days_of_cover === null ? '—' : num(i.days_of_cover, 1) + ' d' }}</td><td class="num">{{ i.lead_time_days }}d</td>
                      <td>{{ i.projected_stockout || '—' }}</td><td>{{ i.vendor_name || '—' }}</td></tr>
                  } @empty { <tr><td colspan="8"><div class="empty-state"><p>No sales or low-stock items to time yet.</p></div></td></tr> }</tbody></table></div>
              </div>
            }

            <!-- ============================ VENDOR INTELLIGENCE ============================ -->
            @if (tab() === 'vendors') {
              <div class="grid grid-2" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Vendors</span><span class="stat-value">{{ d.summary.vendors }}</span><span class="stat-delta">{{ d.summary.scored }} scored</span></div>
                <div class="card stat-card"><span class="stat-label">Average score</span><span class="stat-value">{{ d.summary.avg_score === null ? '—' : d.summary.avg_score + '/100' }}</span></div>
              </div>
              <div class="card card-flush">
                <div class="card-header"><h3>Vendor scorecard</h3>
                  <span class="text-xs text-muted">Score = fill rate {{ d.score_weights.fill_rate }}% · on-time {{ d.score_weights.on_time_delivery }}% · quality {{ d.score_weights.quality_returns }}% · price {{ d.score_weights.price_index }}%</span></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Vendor</th><th>Score</th><th class="num">Fill rate</th><th class="num">On time</th><th class="num">Returns</th><th class="num">Lead</th><th class="num">Spend share</th></tr></thead>
                  <tbody>@for (v of d.vendors; track v.vendor_id) {
                    <tr><td><strong>{{ v.name }}</strong><div class="text-xs text-muted">{{ v.category }} · {{ v.terms }} · {{ v.po_count }} PO(s)</div>
                        @for (n of v.notes; track n) { @if (!isPayableNote(n)) { <div class="text-xs text-muted">• {{ n }}</div> } }</td>
                      <td>@if (v.score !== null) { <span class="badge" [ngClass]="gradeBadge(v.grade)">{{ v.grade }} · {{ v.score }}</span> } @else { <span class="badge badge-neutral">Not enough data</span> }</td>
                      <td class="num">{{ pctOrDash(v.fill_rate_pct) }}</td><td class="num">{{ pctOrDash(v.on_time_rate_pct) }}</td><td class="num">{{ pctOrDash(v.return_rate_pct) }}</td>
                      <td class="num">{{ v.avg_lead_days }}d<div class="text-xs text-muted">{{ v.lead_time_source }}</div></td>
                      <td class="num">{{ pctOrDash(v.spend_share_pct) }}</td></tr>
                  }</tbody></table></div>
              </div>
            }

            <!-- ============================ VENDOR RECOMMENDATIONS ============================ -->
            @if (tab() === 'vendorrecs') {
              <div class="card card-flush" style="margin-bottom:var(--space-5)">
                <div class="card-header"><h3>Recommended vendor actions</h3><span class="badge badge-primary">{{ d.vendor_actions.length }}</span></div>
                @if (d.vendor_actions.length) {
                  <div class="card-body stack">
                    @for (a of d.vendor_actions; track a.title) {
                      <div style="padding-bottom:var(--space-3);border-bottom:1px solid var(--border)">
                        <div class="row-between"><div><span class="badge" [ngClass]="priorityBadge(a.priority)">{{ a.priority }}</span> <strong>{{ a.title }}</strong></div></div>
                        <p class="text-sm text-muted" style="margin-top:4px">{{ a.detail }}</p>
                        @if (a.evidence?.length) { <div class="text-xs text-muted">{{ a.evidence.join(' · ') }}</div> }
                      </div>
                    }
                  </div>
                } @else { <div class="empty-state"><p>No vendor actions needed right now.</p></div> }
              </div>
              <div class="card card-flush">
                <div class="card-header"><h3>Item sourcing recommendations</h3><span class="text-xs text-muted">Only items bought from 2+ vendors can be compared</span></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Item</th><th>Recommendation</th><th>Current vendor</th><th>Suggested vendor</th><th>Why</th></tr></thead>
                  <tbody>@for (r of d.item_recommendations; track r.sku) {
                    <tr><td><strong>{{ r.name }}</strong><div class="text-xs text-muted mono">{{ r.sku }}</div></td>
                      <td><span class="badge" [ngClass]="r.action === 'switch' ? 'badge-warning' : 'badge-success'">{{ r.action === 'switch' ? 'Switch vendor' : 'Keep' }}</span></td>
                      <td>{{ r.current_vendor }} <span class="text-xs text-muted">({{ inr(r.current_cost) }})</span></td>
                      <td>{{ r.recommended_vendor }} <span class="text-xs text-muted">({{ inr(r.recommended_cost) }})</span></td>
                      <td class="text-sm">{{ r.reason }}</td></tr>
                  } @empty { <tr><td colspan="5"><div class="empty-state"><p>No item has purchase history with more than one vendor yet.</p></div></td></tr> }</tbody></table></div>
              </div>
            }

            <!-- ============================ PRICE COMPARISON ============================ -->
            @if (tab() === 'prices') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Items with quotes</span><span class="stat-value">{{ d.summary.items_with_quotes }}</span></div>
                <div class="card stat-card"><span class="stat-label">Comparable (2+ vendors)</span><span class="stat-value">{{ d.summary.comparable_items }}</span></div>
                <div class="card stat-card"><span class="stat-label">Items with a cheaper option</span><span class="stat-value" style="color:var(--success-700)">{{ d.summary.items_with_saving }}</span></div>
                <div class="card stat-card"><span class="stat-label">Est. monthly saving</span><span class="stat-value">{{ inr(d.summary.est_monthly_saving) }}</span></div>
              </div>
              <div class="grid grid-2" style="align-items:start">
                @for (r of d.items; track r.sku) {
                  <div class="card card-flush">
                    <div class="card-header">
                      <div><strong>{{ r.name }}</strong><div class="text-xs text-muted mono">{{ r.sku }} · {{ r.category }}</div></div>
                      @if (r.saving_pct) { <span class="badge badge-success">Save {{ r.saving_pct }}% with {{ r.cheapest_vendor }}</span> }
                      @else if (!r.comparable) { <span class="badge badge-neutral">Single vendor</span> }
                      @else { <span class="badge badge-info">Preferred is cheapest</span> }
                    </div>
                    <div class="table-scroll"><table class="table" style="min-width:0"><thead><tr><th>Vendor</th><th class="num">Latest</th><th class="num">Avg</th><th class="num">Change</th><th>Source</th></tr></thead>
                      <tbody>@for (v of r.vendors; track v.vendor_id) {
                        <tr><td>{{ v.vendor_name }} @if (v.is_preferred) { <span class="badge badge-primary">preferred</span> }</td>
                          <td class="num mono" [style.fontWeight]="v.vendor_name === r.cheapest_vendor ? 700 : 400">{{ inr(v.latest_cost) }}</td>
                          <td class="num mono">{{ inr(v.avg_cost) }}</td>
                          <td class="num">{{ v.price_change_pct === null ? '—' : (v.price_change_pct > 0 ? '+' : '') + v.price_change_pct + '%' }}</td>
                          <td class="text-xs text-muted">{{ v.source }} · {{ v.latest_date || 'catalog' }}</td></tr>
                      }</tbody></table></div>
                    @if (r.est_monthly_saving) { <div class="text-xs text-muted" style="padding:var(--space-2) var(--space-4)">At current demand, switching saves ≈ {{ inr(r.est_monthly_saving) }}/month ({{ inr(r.saving_per_unit) }} per unit).</div> }
                  </div>
                } @empty { <div class="card wide"><div class="empty-state"><p>No purchase-order or GRN costs recorded yet.</p></div></div> }
              </div>
              <p class="text-xs text-muted" style="margin-top:var(--space-3)">{{ d.note }}</p>
            }

            <!-- ============================ DISCOUNTS ============================ -->
            @if (tab() === 'discounts') {
              <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                <div class="card stat-card"><span class="stat-label">Recommendations</span><span class="stat-value">{{ d.summary.recommendations }}</span></div>
                <div class="card stat-card"><span class="stat-label">Expiring stock</span><span class="stat-value" style="color:var(--warning-700)">{{ d.summary.expiring }}</span></div>
                <div class="card stat-card"><span class="stat-label">Slow / excess stock</span><span class="stat-value">{{ d.summary.excess }}</span></div>
                <div class="card stat-card"><span class="stat-label">Stock value involved</span><span class="stat-value">{{ inr(d.summary.capital_tied) }}</span>
                  @if (d.summary.write_offs) { <span class="stat-delta down">{{ d.summary.write_offs }} expired batch(es) to write off</span> }</div>
              </div>
              <div class="card card-flush">
                <div class="card-header"><h3>AI discount recommendations</h3><a class="btn btn-secondary btn-sm" routerLink="/discounts">Open Discounts</a></div>
                <div class="table-scroll"><table class="table"><thead><tr><th>Item</th><th>Why</th><th class="num">Stock</th><th class="num">Price</th><th class="num">Suggested</th><th class="num">Break-even uplift</th><th class="num">Stock value</th></tr></thead>
                  <tbody>@for (r of d.items; track r.sku + (r.batch_no || r.reason)) {
                    <tr><td><strong>{{ r.name }}</strong><div class="text-xs text-muted mono">{{ r.sku }}</div>
                        @if (r.active_discounts?.length) { <div class="text-xs text-muted">Already in: {{ r.active_discounts.join(', ') }}</div> }</td>
                      <td><span class="badge" [ngClass]="r.type === 'write_off' ? 'badge-danger' : r.type === 'expiry' ? 'badge-warning' : 'badge-info'">{{ r.reason }}</span>
                        <div class="text-xs text-muted">{{ r.detail }}</div></td>
                      <td class="num">{{ r.stock }}</td><td class="num mono">{{ inr(r.price) }}</td>
                      <td class="num">@if (r.type === 'write_off') { <span class="badge badge-danger">Write off</span> } @else { <strong>{{ r.suggested_discount_pct }}% off</strong><div class="text-xs text-muted mono">→ {{ inr(r.suggested_price) }}</div><div class="text-xs text-muted">{{ r.margin_note }}</div> }</td>
                      <td class="num">{{ r.break_even_unit_uplift_pct === null ? '—' : '+' + r.break_even_unit_uplift_pct + '% units' }}</td>
                      <td class="num mono">{{ inr(r.capital_tied) }}</td></tr>
                  } @empty { <tr><td colspan="7"><div class="empty-state"><p>No slow-moving or expiring stock needs a discount.</p></div></td></tr> }</tbody></table></div>
              </div>
              <p class="text-xs text-muted" style="margin-top:var(--space-3)">{{ d.method }}</p>
            }

            <!-- ============================ NEW PRODUCT PREDICTION ============================ -->
            @if (tab() === 'newproduct') {
              @if (!d.items.length) {
                <div class="card"><div class="empty-state"><p>{{ d.message }}</p></div></div>
              } @else {
                <div class="grid grid-4" style="margin-bottom:var(--space-5)">
                  <div class="card stat-card"><span class="stat-label">Likely success</span><span class="stat-value" style="color:var(--success-700)">{{ d.summary['Likely success'] }}</span></div>
                  <div class="card stat-card"><span class="stat-label">Watch</span><span class="stat-value" style="color:var(--warning-700)">{{ d.summary['Watch'] }}</span></div>
                  <div class="card stat-card"><span class="stat-label">At risk</span><span class="stat-value" style="color:var(--danger-700)">{{ d.summary['At risk'] }}</span></div>
                  <div class="card stat-card"><span class="stat-label">Too early to call</span><span class="stat-value">{{ d.summary['Too early to call'] }}</span></div>
                </div>
                <div class="grid grid-2" style="align-items:start">
                  @for (p of d.items; track p.sku) {
                    <div class="card insight-card" [ngClass]="p.verdict === 'Likely success' ? 'good' : p.verdict === 'At risk' ? 'risk' : 'watch'">
                      <div class="row-between">
                        <div><strong>{{ p.name }}</strong><div class="text-xs text-muted mono">{{ p.sku }} · {{ p.category }} · added {{ p.added_on }}</div></div>
                        <span class="badge" [ngClass]="p.verdict === 'Likely success' ? 'badge-success' : p.verdict === 'At risk' ? 'badge-danger' : p.verdict === 'Watch' ? 'badge-warning' : 'badge-neutral'">{{ p.verdict }}</span>
                      </div>
                      @if (p.success_score !== null) {
                        <div class="row-between text-xs" style="margin-top:var(--space-3)"><span class="text-muted">Success score</span><strong>{{ p.success_score }}/100</strong></div>
                        <div class="score-track"><div class="score-fill" [style.width.%]="p.success_score" [style.background]="p.success_score >= 70 ? 'var(--success-500)' : p.success_score >= 45 ? 'var(--warning-500)' : 'var(--danger-500)'"></div></div>
                      }
                      <div class="grid grid-3" style="gap:var(--space-2);margin-top:var(--space-3)">
                        <div><div class="text-xs text-muted">Sold</div><strong>{{ num(p.units_sold, 0) }}</strong></div>
                        <div><div class="text-xs text-muted">Days on shelf</div><strong>{{ p.days_on_shelf }}</strong></div>
                        <div><div class="text-xs text-muted">Sell-through</div><strong>{{ pctOrDash(p.sell_through_pct) }}</strong></div>
                      </div>
                      <ul class="factor-list">@for (f of p.factors; track f) { <li>{{ f }}</li> }</ul>
                      <p class="text-sm" style="margin-top:var(--space-3)"><strong>Recommendation:</strong> {{ p.recommendation }}</p>
                      <div class="text-xs text-muted">Confidence: {{ p.confidence }}</div>
                    </div>
                  }
                </div>
                <p class="text-xs text-muted" style="margin-top:var(--space-3)">{{ d.method }}</p>
              }
            }
          }
        }
      } @else if (loading()) {
        <div class="card"><div class="empty-state"><p>Analysing live data…</p></div></div>
      } @else {
        <div class="card"><div class="empty-state"><p>Select an insight above.</p></div></div>
      }
    </main>
  `
})
export class AiInsightsComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  Math = Math;

  tabs: InsightTab[] = [
    { key: 'summary', label: 'Business Summary', endpoint: 'business-summary' },
    { key: 'sales', label: 'Sales & Revenue', endpoint: 'sales-visualizations' },
    { key: 'forecast', label: 'Demand Forecast', endpoint: 'demand-forecast' },
    { key: 'trending', label: 'Trending Products', endpoint: 'trending-products' },
    { key: 'lowstock', label: 'Low-Stock Reorder List', endpoint: 'low-stock-reorder-list' },
    { key: 'restock', label: 'Restock Quantities', endpoint: 'restock-recommendations' },
    { key: 'timing', label: 'Reorder Timing', endpoint: 'reorder-timing' },
    { key: 'vendors', label: 'Vendor Intelligence', endpoint: 'vendor-intelligence' },
    { key: 'vendorrecs', label: 'Vendor Recommendations', endpoint: 'vendor-recommendations' },
    { key: 'prices', label: 'Price Comparison', endpoint: 'vendor-price-comparison' },
    { key: 'discounts', label: 'Discount Recommendations', endpoint: 'discount-recommendations' },
    { key: 'newproduct', label: 'New Product Prediction', endpoint: 'new-product-prediction' },
    { key: 'customers', label: 'Customer Behaviour', endpoint: 'customer-behavior' },
  ];
  windowKeys = ['Order now', 'Within 3 days', 'This week', 'Next 2 weeks'];

  tab = signal('summary');
  loading = signal(false);
  demo = signal(this.readDemoPref());
  private cache = signal<Record<string, any>>({});

  days = 30;
  horizon = 14;
  trendDays = 14;
  newDays = 60;
  custDays = 90;

  current = () => this.cache()[this.cacheKey()] ?? null;

  async ngOnInit() {
    // /ai-insights?tab=<key> opens that tab (used by the OKUTO IQ chatbot's "Based on" links); it also follows later changes
    this.route.queryParamMap.subscribe(q => {
      const key = q.get('tab');
      if (key && this.tabs.some(t => t.key === key) && key !== this.tab()) { this.tab.set(key); void this.load(); }
    });
    const initial = this.route.snapshot.queryParamMap.get('tab');
    if (initial && this.tabs.some(t => t.key === initial)) this.tab.set(initial);
    await this.load();
  }

  // ---- loading -------------------------------------------------------------------------
  private params(): Record<string, string | number> {
    let p: Record<string, string | number>;
    switch (this.tab()) {
      case 'summary': case 'sales': p = { days: this.days }; break;
      case 'forecast': p = { horizon: this.horizon }; break;
      case 'trending': p = { days: this.trendDays }; break;
      case 'newproduct': p = { new_days: this.newDays }; break;
      case 'customers': p = { days: this.custDays }; break;
      default: p = {};
    }
    return this.demo() ? { ...p, demo: 'true' } : p;
  }

  private readDemoPref(): boolean {
    try { return localStorage.getItem('ai_insights_sample_data') === '1'; } catch { return false; }
  }
  async toggleDemo() {
    const next = !this.demo();
    this.demo.set(next);
    try { localStorage.setItem('ai_insights_sample_data', next ? '1' : '0'); } catch {}
    await this.load();
  }
  private cacheKey(): string { return this.tab() + JSON.stringify(this.params()); }

  async load(force = false) {
    const key = this.cacheKey();
    if (!force && this.cache()[key]) return;
    const t = this.tabs.find(x => x.key === this.tab())!;
    this.loading.set(true);
    const res = await this.api.getAiModule(t.endpoint, this.params());
    this.cache.update(c => ({ ...c, [key]: res }));
    this.loading.set(false);
  }
  /** Vendor scorecard notes about money owed / overdue purchase orders are not shown on this tab. */
  isPayableNote(note: string): boolean { return /payable|past their expected date/i.test(note); }
  async select(key: string) { this.tab.set(key); await this.load(); }
  async reload() { await this.load(true); }
  async setDays(d: number) { this.days = d; await this.load(); }
  async setHorizon(d: number) { this.horizon = d; await this.load(); }
  async setTrendDays(d: number) { this.trendDays = d; await this.load(); }
  async setNewDays(d: number) { this.newDays = d; await this.load(); }
  async setCustDays(d: number) { this.custDays = d; await this.load(); }
  weekdayMax(rows: any[]): number { return Math.max(...rows.map(r => r.invoices), 1); }
  weekMax(rows: any[]): number { return Math.max(...rows.map(r => r.revenue), 1); }

  linkTab(link: string): string {
    return ({ 'low-stock': 'lowstock', discounts: 'discounts', vendors: 'vendors', trending: 'trending' } as Record<string, string>)[link] || 'summary';
  }

  // ---- formatting ----------------------------------------------------------------------
  inr(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  num(n: number | null | undefined, d = 1): string {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  pctOrDash(n: number | null | undefined): string { return n === null || n === undefined ? '—' : n + '%'; }
  barPct(v: number, max: number): number { return max > 0 ? Math.max(2, (v / max) * 100) : 0; }
  confClass(c: string): string { return c === 'high' ? 'badge-success' : c === 'medium' ? 'badge-info' : c === 'low' ? 'badge-warning' : 'badge-neutral'; }
  statusBadge(s: string): string { return s === 'good' ? 'badge-success' : s === 'watch' ? 'badge-warning' : 'badge-danger'; }
  urgencyBadge(u: string): string { return u === 'critical' ? 'badge-danger' : u === 'high' ? 'badge-warning' : u === 'medium' ? 'badge-info' : 'badge-neutral'; }
  priorityBadge(p: string): string { return p === 'high' ? 'badge-danger' : p === 'medium' ? 'badge-warning' : 'badge-neutral'; }
  gradeBadge(g: string): string { return g === 'A' ? 'badge-success' : g === 'B' ? 'badge-info' : g === 'C' ? 'badge-warning' : 'badge-danger'; }
  windowBadge(w: string): string { return w === 'Order now' ? 'badge-danger' : w === 'Within 3 days' ? 'badge-warning' : w === 'This week' ? 'badge-info' : 'badge-neutral'; }
  lineSummary(lines: any[]): string { return lines.slice(0, 4).map(l => `${l.name} × ${l.qty}`).join(', ') + (lines.length > 4 ? ` +${lines.length - 4} more` : ''); }
  poParams(vendorId: string, sku: string, qty: number, cost: number) {
    return { prefillVendor: vendorId, prefillSku: sku, prefillQty: qty, prefillCost: Math.round(cost) };
  }

  // ---- chart geometry ------------------------------------------------------------------
  private niceMax(m: number): number {
    if (m <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  private short(n: number): string { return n >= 100000 ? (n / 100000).toFixed(1) + 'L' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)); }
  private shortDate(iso: string): string { const d = new Date(iso + 'T00:00:00'); return d.getDate() + '/' + (d.getMonth() + 1); }
  private yTicks(max: number, top: number, bottom: number) {
    return [0, 0.5, 1].map(f => ({ y: bottom - f * (bottom - top), label: this.short(max * f) }));
  }

  salesChart(daily: any[]) {
    const L = 44, R = 628, T = 12, B = 190;
    const vals = daily.map(d => d.revenue as number);
    const max = this.niceMax(Math.max(...vals, 1));
    const x = (i: number) => L + (vals.length > 1 ? (i / (vals.length - 1)) * (R - L) : (R - L) / 2);
    const y = (v: number) => B - (v / max) * (B - T);
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = vals.length ? `${line} L${x(vals.length - 1).toFixed(1)},${B} L${x(0).toFixed(1)},${B} Z` : '';
    const step = Math.max(1, Math.ceil(daily.length / 7));
    const xLabels = daily.map((d, i) => ({ x: x(i), label: this.shortDate(d.date), i })).filter(o => o.i % step === 0 || o.i === daily.length - 1);
    return { line, area, yTicks: this.yTicks(max, T, B), xLabels };
  }

  forecastChart(d: any) {
    const L = 44, R = 628, T = 12, B = 190;
    const hist: number[] = d.history.map((h: any) => h.revenue);
    const fc: any[] = d.forecast;
    const n = hist.length + fc.length;
    const max = this.niceMax(Math.max(...hist, ...fc.map(f => f.revenue_high), 1));
    const x = (i: number) => L + (i / Math.max(1, n - 1)) * (R - L);
    const y = (v: number) => B - (v / max) * (B - T);
    const history = hist.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const off = hist.length;
    const last = hist.length - 1;
    const forecast = `M${x(last).toFixed(1)},${y(hist[last]).toFixed(1)} ` + fc.map((f, i) => `L${x(off + i).toFixed(1)},${y(f.revenue).toFixed(1)}`).join(' ');
    const upper = fc.map((f, i) => `${i ? 'L' : 'M'}${x(off + i).toFixed(1)},${y(f.revenue_high).toFixed(1)}`).join(' ');
    const lower = fc.map((f, i) => `L${x(off + fc.length - 1 - i).toFixed(1)},${y(fc[fc.length - 1 - i].revenue_low).toFixed(1)}`).join(' ');
    const all = [...d.history.map((h: any) => h.date), ...fc.map(f => f.date)];
    const step = Math.max(1, Math.ceil(n / 8));
    const xLabels = all.map((dt: string, i: number) => ({ x: x(i), label: this.shortDate(dt), i })).filter((o: any) => o.i % step === 0 || o.i === n - 1);
    return { history, forecast, band: `${upper} ${lower} Z`, splitX: x(last), yTicks: this.yTicks(max, T, B), xLabels };
  }

  columns(rows: any[], labelKey: string, valueKey: string) {
    const L = 42, R = 316, T = 8, B = 112;                 // plot area inside a 320-wide viewBox (left gutter holds the Y axis)
    const max = this.niceMax(Math.max(...rows.map(r => r[valueKey] as number), 1));
    const slot = (R - L) / Math.max(rows.length, 1);
    const w = Math.min(22, slot * 0.7);
    const bars = rows.map((r, i) => {
      const h = Math.max(1, (r[valueKey] / max) * (B - T));
      return { label: String(r[labelKey]), value: r[valueKey] as number, x: L + i * slot + (slot - w) / 2, w, y: B - h, h };
    });
    return { bars, yTicks: this.yTicks(max, T, B) };
  }

  donut(rows: any[], valueKey: string, labelKey: string) {
    const total = rows.reduce((s, r) => s + (r[valueKey] as number), 0) || 1;
    let acc = 0;
    return rows.map((r, i) => {
      const pct = (r[valueKey] / total) * 100;
      const seg = { label: r[labelKey] as string, value: r[valueKey] as number, pct: Math.round(pct * 10) / 10, offset: -acc, color: PALETTE[i % PALETTE.length] };
      acc += pct;
      return seg;
    });
  }

  // ---- CSV export ----------------------------------------------------------------------
  private csvSource(): { name: string; rows: Record<string, any>[] } | null {
    const d = this.current();
    if (!d || d.status !== 'ok') return null;
    switch (this.tab()) {
      case 'summary': return { name: 'business-summary', rows: d.sections.map((s: any) => ({ section: s.title, status: s.status, summary: s.text })) };
      case 'sales': return { name: 'sales-by-product', rows: d.top_by_revenue };
      case 'forecast': return { name: 'demand-forecast', rows: d.forecast };
      case 'trending': return { name: 'trending-products', rows: [...d.rising, ...d.cooling, ...d.new_entrants] };
      case 'lowstock': return { name: 'low-stock-reorder-list', rows: d.items.map((i: any) => ({ ...i, reasons: i.reasons.join(' | ') })) };
      case 'restock': return { name: 'restock-recommendations', rows: d.items };
      case 'timing': return { name: 'reorder-timing', rows: d.items };
      case 'vendors': return { name: 'vendor-intelligence', rows: d.vendors.map((v: any) => ({ ...v, notes: v.notes.join(' | ') })) };
      case 'vendorrecs': return { name: 'vendor-recommendations', rows: d.item_recommendations };
      case 'prices': return { name: 'vendor-price-comparison', rows: d.items.flatMap((r: any) => r.vendors.map((v: any) => ({ sku: r.sku, item: r.name, ...v }))) };
      case 'discounts': return { name: 'discount-recommendations', rows: d.items.map((r: any) => ({ ...r, active_discounts: (r.active_discounts || []).join(' | ') })) };
      case 'newproduct': return { name: 'new-product-prediction', rows: d.items.map((p: any) => ({ ...p, factors: p.factors.join(' | ') })) };
    }
    return null;
  }
  csvAvailable(): boolean { const s = this.csvSource(); return !!s && s.rows.length > 0; }
  exportCsv() {
    const src = this.csvSource();
    if (!src || !src.rows.length) return;
    const cols = Object.keys(src.rows[0]).filter(k => typeof src.rows[0][k] !== 'object' || src.rows[0][k] === null);
    const esc = (v: any) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [cols.join(','), ...src.rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.demo() ? 'SAMPLE-' : ''}ai-insights-${src.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
