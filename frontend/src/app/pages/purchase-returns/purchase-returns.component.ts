import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-purchase-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-PUR-005</span>
        <h1>Purchase Returns</h1>
        <p>Return goods to a vendor and automatically generate a debit note against their payable balance.</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="field">
        <label>Vendor</label>
        <select class="select" [(ngModel)]="selectedVendorId" (ngModelChange)="onVendorChange()" style="max-width:360px">
          @for (v of vendors(); track v.id) {
            <option [value]="v.id">{{ v.name }}</option>
          }
        </select>
      </div>

      <div class="field" style="margin-top:var(--space-4)">
        <label>Purchase Invoice</label>
        <div class="row" style="gap:var(--space-2);flex-wrap:wrap">
          <select class="select" [ngModel]="selectedInvoice" (ngModelChange)="onInvoiceSelect($event)" style="max-width:360px">
            <option value="">— Not linked to an invoice —</option>
            @for (inv of invoices(); track inv.id) {
              <option [value]="inv.id">{{ inv.id }} &middot; {{ inv.date }} &middot; ₹{{ inv.total.toFixed(2) }}</option>
            }
            <option value="__manual__">Other — enter invoice number…</option>
          </select>
          @if (selectedInvoice === '__manual__') {
            <input class="input" [(ngModel)]="manualInvoice" (keydown.enter)="loadManualInvoice()" placeholder="e.g. GRN-1001" style="max-width:200px">
            <button type="button" class="btn btn-secondary" [disabled]="loadingInvoice" (click)="loadManualInvoice()">{{ loadingInvoice ? 'Loading...' : 'Load Items' }}</button>
          }
        </div>
        @if (invoiceError) {
          <span class="hint" style="color:var(--danger-700)">{{ invoiceError }}</span>
        } @else if (invoiceInfo()) {
          <span class="hint">Only the items bought on {{ invoiceInfo().id }} ({{ invoiceInfo().date }}) can be returned.</span>
        }
      </div>

      <div style="margin-top:var(--space-4)">
        <div class="row-between" style="margin-bottom:var(--space-2)">
          <label style="font-weight:600;font-size:var(--text-sm)">Items to Return</label>
          <button class="btn btn-ghost btn-sm" [disabled]="invoiceInfo() && !hasUnusedInvoiceItem()" (click)="addReturnLine()">+ Add Line</button>
        </div>
        @if (invoiceInfo() && returnLines.length > 0) {
          <div class="row text-xs text-muted" style="gap:var(--space-2);margin-bottom:var(--space-1)">
            <div style="flex:2">Item</div>
            <div style="width:90px">Purchased Qty</div>
            <div style="width:110px">Purchase Price</div>
            <div style="width:90px">Return Qty</div>
            <div style="width:34px"></div>
          </div>
        }
        <div class="stack" style="gap:var(--space-2)">
          @for (line of returnLines; track $index; let i = $index) {
            @if (invoiceInfo()) {
              <div class="row" style="gap:var(--space-2)">
                <div style="flex:2">
                  @if (line.picked) {
                    <select class="select" [(ngModel)]="line.sku" (change)="onSkuChange(line)">
                      @for (item of optionsFor(line); track item.sku) {
                        <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
                      }
                    </select>
                  } @else {
                    <input class="input" readonly [value]="line.name + ' (' + line.sku + ')'">
                  }
                </div>
                <input class="input mono" readonly [value]="purchasedQty(line)" style="width:90px" title="Purchased quantity">
                <input class="input mono" readonly [value]="line.cost" style="width:110px" title="Purchase price">
                <input class="input" type="number" min="1" [attr.max]="maxQty(line)" [ngModel]="line.qty" (ngModelChange)="onReturnQty(line, $event)" style="width:90px" [placeholder]="'Max ' + maxQty(line)">
                <button type="button" class="btn btn-ghost btn-sm" (click)="removeReturnLine(i)">✕</button>
              </div>
            } @else {
              <div class="row" style="gap:var(--space-2)">
                <div style="flex:2">
                  <select class="select" [(ngModel)]="line.sku" (change)="onSkuChange(line)">
                    @for (item of lineOptions(); track item.sku) {
                      <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
                    }
                  </select>
                </div>
                <input class="input" type="number" min="1" [(ngModel)]="line.qty" style="width:90px" placeholder="Qty">
                <input class="input" type="number" min="0" step="0.01" [(ngModel)]="line.cost" style="width:110px" placeholder="Unit Cost">
                <button type="button" class="btn btn-ghost btn-sm" (click)="removeReturnLine(i)">✕</button>
              </div>
            }
          }
        </div>
      </div>

      <div class="form-grid" style="margin-top:var(--space-4)">
        <div class="field">
          <label>Reason</label>
          <select class="select" [(ngModel)]="returnReason">
            <option>Damaged in transit</option>
            <option>Quality issue</option>
            <option>Wrong item supplied</option>
            <option>Excess supply</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label>Debit Note Amount</label>
          <input class="input mono" readonly [value]="'₹' + getDebitNoteTotal().toFixed(2)">
        </div>
      </div>

      <button class="btn btn-danger btn-lg" style="margin-top:var(--space-4)" [disabled]="isSubmitting || (selectedInvoice === '__manual__' && !invoiceInfo())" (click)="submitReturn()">
        {{ isSubmitting ? 'Processing Return...' : 'Process Return & Raise Debit Note' }}
      </button>
    </div>

    <div class="card card-flush">
      <div class="card-header">
        <h3>Purchase Return History</h3>
      </div>
      @if (returnsHistory().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Debit Note #</th>
                <th>Vendor</th>
                <th>Purchase Invoice</th>
                <th>Date</th>
                <th>Reason</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (r of returnsHistory(); track r.id) {
                <tr>
                  <td class="mono">{{ r.id }}</td>
                  <td>{{ r.vendorName || r.vendorId }}</td>
                  <td class="mono">{{ r.invoiceId || '—' }}</td>
                  <td>{{ r.date }}</td>
                  <td>{{ r.reason }}</td>
                  <td class="num mono">₹{{ r.total.toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state">
          <p class="text-sm">No purchase returns recorded yet.</p>
        </div>
      }
    </div>
  `
})
export class PurchaseReturnsComponent implements OnInit {
  private api = inject(ApiService);

  vendors = signal<any[]>([]);
  catalog = signal<any[]>([]);
  returnsHistory = signal<any[]>([]);

  // Purchase invoice the return is made against
  invoices = signal<any[]>([]);
  invoiceInfo = signal<any | null>(null);
  selectedInvoice = '';
  manualInvoice = '';
  invoiceError = '';
  loadingInvoice = false;

  selectedVendorId = '';
  returnReason = 'Damaged in transit';
  returnLines: any[] = [];
  isSubmitting = false;

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const vList = await this.api.getVendors();
    this.vendors.set(vList);
    if (vList.length > 0 && !this.selectedVendorId) {
      this.selectedVendorId = vList[0].id;
    }
    await this.loadInvoices();

    const cat = await this.api.getCatalog();
    this.catalog.set(cat);

    const returns = await this.api.getPurchaseReturns();
    this.returnsHistory.set(returns);

    if (this.returnLines.length === 0) {
      this.addReturnLine();
    }
  }

  /** Items the return lines can pick from: only what the chosen purchase invoice contains, otherwise the whole catalog. */
  lineOptions(): any[] {
    const inv = this.invoiceInfo();
    return inv ? inv.lines.filter((l: any) => l.availableQty > 0) : this.catalog();
  }

  /** Largest quantity that can still be returned for a line (invoice quantity minus earlier returns), or null without an invoice. */
  maxQty(line: any): number | null {
    const inv = this.invoiceInfo();
    const found = inv?.lines.find((l: any) => l.sku === line.sku);
    return found ? found.availableQty : null;
  }

  /** Quantity bought on the invoice for a line's item. */
  purchasedQty(line: any): number {
    return this.invoiceInfo()?.lines.find((l: any) => l.sku === line.sku)?.qty ?? 0;
  }

  /** Invoice items not already on another line (what "+ Add Line" may still offer). */
  private unusedInvoiceItems(except?: any): any[] {
    const used = new Set(this.returnLines.filter(l => l !== except).map(l => l.sku));
    return this.lineOptions().filter((l: any) => !used.has(l.sku));
  }

  hasUnusedInvoiceItem(): boolean {
    return this.unusedInvoiceItems().length > 0;
  }

  /** Choices for a line added with "+ Add Line": its own item plus the invoice items no other line uses. */
  optionsFor(line: any): any[] {
    return this.lineOptions().filter((l: any) => l.sku === line.sku || this.unusedInvoiceItems(line).some((u: any) => u.sku === l.sku));
  }

  /** Return quantity typed by the user: whole number, never above what can still be returned. */
  onReturnQty(line: any, value: any) {
    const max = this.maxQty(line);
    let qty = value === null || value === '' || value === undefined ? null : Math.floor(Number(value));
    if (qty !== null && (isNaN(qty) || qty < 1)) qty = null;
    if (qty !== null && max !== null && qty > max) qty = max;
    line.qty = qty;
  }

  addReturnLine() {
    const inv = this.invoiceInfo();
    if (inv) {
      // only for invoice items that do not have a line yet (e.g. one that was removed)
      const item = this.unusedInvoiceItems()[0];
      if (!item) return;
      this.returnLines.push({ sku: item.sku, name: item.name, qty: null, cost: item.cost, picked: true });
      return;
    }
    const item = this.catalog()[0];
    if (!item) return;
    this.returnLines.push({
      sku: item.sku,
      name: item.name,
      qty: 5,
      cost: Math.round(item.price * 0.65)
    });
  }

  onSkuChange(line: any) {
    const inv = this.invoiceInfo();
    if (inv) {
      const item = inv.lines.find((l: any) => l.sku === line.sku);
      if (item) {
        line.name = item.name;
        line.cost = item.cost;
        line.qty = null;
      }
      return;
    }
    const item = this.catalog().find(i => i.sku === line.sku);
    if (item) {
      line.name = item.name;
      line.cost = Math.round(item.price * 0.65);
    }
  }

  // --- Purchase invoice selection ---
  async loadInvoices() {
    this.invoices.set(this.selectedVendorId ? await this.api.getPurchaseInvoices(this.selectedVendorId) : []);
  }

  async onVendorChange() {
    this.selectedInvoice = '';
    this.manualInvoice = '';
    this.invoiceInfo.set(null);
    this.invoiceError = '';
    this.returnLines = [];
    await this.loadInvoices();
    this.addReturnLine();
  }

  async onInvoiceSelect(value: string) {
    this.selectedInvoice = value;
    this.invoiceError = '';
    this.invoiceInfo.set(null);
    this.returnLines = [];
    if (value && value !== '__manual__') {
      await this.openInvoice(value);
    } else {
      this.addReturnLine();   // no invoice: the usual full-catalog list
    }
  }

  async loadManualInvoice() {
    const ref = this.manualInvoice.trim();
    if (!ref) { this.invoiceError = 'Enter a purchase invoice number'; return; }
    await this.openInvoice(ref);
  }

  /** Loads the invoice from the database and replaces the return lines with its items. */
  private async openInvoice(ref: string) {
    this.loadingInvoice = true;
    this.invoiceError = '';
    try {
      const inv = await this.api.getPurchaseInvoice(this.selectedVendorId, ref);
      this.invoiceInfo.set(inv);
      this.returnLines = [];
      if (this.lineOptions().length === 0) {
        this.invoiceError = `Everything on ${inv.id} has already been returned.`;
      } else {
        // One line per item on the invoice; enter the quantity to send back on the lines you are returning
        this.returnLines = this.lineOptions().map((l: any) => ({ sku: l.sku, name: l.name, qty: null, cost: l.cost }));
      }
    } catch (err: any) {
      this.invoiceInfo.set(null);
      this.returnLines = [];
      this.invoiceError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not load the purchase invoice. Please try again.';
    } finally {
      this.loadingInvoice = false;
    }
  }

  removeReturnLine(idx: number) {
    this.returnLines.splice(idx, 1);
  }

  getDebitNoteTotal(): number {
    return this.returnLines.reduce((s, l) => s + (l.qty || 0) * (l.cost || 0), 0);
  }

  async submitReturn() {
    if (this.isSubmitting) return;
    const validLines = this.returnLines.filter(l => l.qty > 0).map(l => ({ sku: l.sku, name: l.name, qty: l.qty, cost: l.cost }));
    if (validLines.length === 0) {
      if (this.invoiceInfo()) this.invoiceError = 'Enter the quantity to return on at least one item.';
      return;
    }
    this.invoiceError = '';

    const inv = this.invoiceInfo();
    if (inv) {
      const over = validLines.find(l => l.qty > (this.maxQty(l) ?? Infinity));
      if (over) { this.invoiceError = `Only ${this.maxQty(over)} of ${over.sku} can still be returned against ${inv.id}.`; return; }
    }

    this.isSubmitting = true;
    try {
      await this.api.createPurchaseReturn(this.selectedVendorId, validLines, this.returnReason, inv?.id ?? null);
      this.returnLines = [];
      if (inv) {
        await this.openInvoice(inv.id);   // refresh what can still be returned
      } else {
        this.addReturnLine();
      }
      await this.loadData();
    } catch (err: any) {
      alert(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not process the return. Please try again.');
    } finally {
      this.isSubmitting = false;
    }
  }
}
