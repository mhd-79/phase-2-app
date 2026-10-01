import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OfflineDbService } from '../../services/offline-db.service';

@Component({
  selector: 'app-hold-bills',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-POS-009</span>
          <h1>Hold &amp; Recall</h1>
          <p>Parked transactions awaiting payment or cashier resumption.</p>
        </div>
      </div>

      <div class="card card-flush">
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Held ID</th>
                <th>Time</th>
                <th>Items</th>
                <th class="num">Grand Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @if (heldBills.length === 0) {
                <tr><td colspan="5" class="empty-state">No held bills found.</td></tr>
              }
              @for (b of heldBills; track b.id) {
                <tr>
                  <td class="mono">{{ b.id }}</td>
                  <td>{{ b.time | date:'short' }}</td>
                  <td>{{ b.itemCount }} item(s)</td>
                  <td class="num mono">₹{{ b.total.toFixed(2) }}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" (click)="recallBill(b.id)">Recall to POS</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger-700);margin-left:8px" (click)="deleteBill(b.id)">Discard</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </main>
  `
})
export class HoldBillsComponent implements OnInit {
  offlineDb = inject(OfflineDbService);
  router = inject(Router);
  heldBills: any[] = [];

  async ngOnInit() {
    await this.loadBills();
  }

  async loadBills() {
    this.heldBills = await this.offlineDb.getHeldBills();
  }

  recallBill(id: string) {
    this.router.navigate(['/pos'], { queryParams: { recall: id } });
  }

  async deleteBill(id: string) {
    await this.offlineDb.removeHeldBill(id);
    await this.loadBills();
  }
}
