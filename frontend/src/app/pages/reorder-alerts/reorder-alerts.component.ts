import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-reorder-alerts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-STK-003</span>
        <h1>Reorder Alerts &amp; Purchase Suggestions</h1>
        <p>Items at or below their minimum stock level, with a suggested reorder quantity and preferred vendor.</p>
      </div>
    </div>

    <div class="card card-flush">
      <div class="card-header">
        <h3>Suggested Reorders</h3>
        <span class="badge badge-warning">{{ suggestions().length }} item{{ suggestions().length === 1 ? '' : 's' }}</span>
      </div>
      @if (suggestions().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th class="num">Current Stock</th>
                <th class="num">Min Level</th>
                <th class="num">Suggested Qty</th>
                <th>Preferred Vendor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (item of suggestions(); track item.sku) {
                <tr>
                  <td>
                    {{ item.name }}
                    <div class="text-xs text-muted mono">{{ item.sku }}</div>
                  </td>
                  <td>{{ item.category }}</td>
                  <td class="num">{{ item.stock }}</td>
                  <td class="num">{{ item.min }}</td>
                  <td class="num" style="font-weight:700">{{ item.suggestedQty }}</td>
                  <td>{{ item.vendorName }}</td>
                  <td>
                    <a class="btn btn-primary btn-sm"
                       [routerLink]="['/purchase-orders']"
                       [queryParams]="{
                         prefillVendor: item.vendorId,
                         prefillSku: item.sku,
                         prefillQty: item.suggestedQty,
                         prefillCost: Math.round(item.price * 0.65)
                       }">
                      Create PO
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5 12l4 4L19 6"/>
          </svg>
          <p>Every item is above its minimum stock level. Nothing needs reordering right now.</p>
        </div>
      }
    </div>
  `
})
export class ReorderAlertsComponent implements OnInit {
  private api = inject(ApiService);

  Math = Math;
  suggestions = signal<any[]>([]);

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const list = await this.api.getReorderSuggestions();
    this.suggestions.set(list);
  }
}
