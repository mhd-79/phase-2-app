import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-hold-bills',
  standalone: true,
  imports: [CommonModule, RouterLink],
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
          <a class="nav-link active" routerLink="/hold-bills" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

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
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-POS-009</span>
            <h1>Hold &amp; Recall</h1>
            <p class="text-muted">Bills held mid-sale. Resume any of them exactly where the cashier left off.</p>
          </div>
        </div>

        <div class="card card-flush">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3>Held Bills</h3>
            <span class="badge badge-neutral">{{ heldBills.length }} held</span>
          </div>

          <div *ngIf="heldBills.length > 0">
            <table class="table">
              <thead>
                <tr>
                  <th>Bill Ref</th>
                  <th>Held At</th>
                  <th class="num">Items</th>
                  <th class="num">Total</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let h of heldBills">
                  <td><strong class="mono">{{ formatRef(h.id) }}</strong></td>
                  <td>{{ h.time | date:'medium' }}</td>
                  <td class="num mono">{{ h.itemCount || (h.lines ? h.lines.length : 0) }}</td>
                  <td class="num mono"><strong>₹{{ (h.total || 0).toFixed(2) }}</strong></td>
                  <td>
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                      <button class="btn btn-primary btn-sm" (click)="resumeBill(h.id)">Resume</button>
                      <button class="btn btn-ghost btn-sm text-danger" (click)="discardBill(h.id)">Discard</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div *ngIf="heldBills.length === 0" style="text-align:center; padding:48px 16px; color:var(--text-muted);">
            <div style="font-size:36px; margin-bottom:12px;">⏸️</div>
            <p style="font-weight:600; font-size:16px;">No bills are currently on hold.</p>
            <p class="text-xs" style="margin-top:4px;">Hold a bill at POS checkout to save it for later.</p>
            <a class="btn btn-primary" style="margin-top:16px; display:inline-block;" routerLink="/pos">Go to Billing</a>
          </div>
        </div>
      </main>
    </div>
  `
})
export class HoldBillsComponent implements OnInit {
  heldBills: any[] = [];

  constructor(public auth: AuthService, private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.loadHeldBills();
  }

  loadHeldBills() {
    this.http.get<any[]>(`${environment.apiUrl}/billing/held-bills`).subscribe({
      next: (data) => {
        this.heldBills = data;
      },
      error: () => {
        this.heldBills = [];
      }
    });
  }

  formatRef(id: string): string {
    if (!id) return 'HOLD-#100';
    return id.includes('HOLD-') ? id.replace('HOLD-', 'HOLD-#') : 'HOLD-#' + id;
  }

  resumeBill(heldId: string) {
    this.router.navigate(['/pos'], { queryParams: { recall: heldId } });
  }

  discardBill(heldId: string) {
    if (!confirm('Discard this held bill?')) return;
    this.http.delete<any>(`${environment.apiUrl}/billing/held-bills/${heldId}`).subscribe({
      next: () => {
        this.loadHeldBills();
      },
      error: () => {
        this.heldBills = this.heldBills.filter(h => h.id !== heldId);
      }
    });
  }
}
