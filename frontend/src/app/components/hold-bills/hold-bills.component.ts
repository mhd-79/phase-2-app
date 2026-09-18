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
      <!-- SIDEBAR BACKDROP FOR MOBILE -->
      <div class="sidebar-backdrop" *ngIf="isMobileMenuOpen" [class.open]="isMobileMenuOpen" (click)="isMobileMenuOpen = false"></div>

      <!-- SIDEBAR -->
      <aside class="sidebar" [class.mobile-open]="isMobileMenuOpen">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Okuto Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="isMobileMenuOpen = false" style="margin-left:auto; color:var(--slate-400); display:none;" [style.display]="isMobileMenuOpen ? 'flex' : 'none'">✕</button>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link active" routerLink="/hold-bills" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
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

      <!-- TOPBAR -->
      <header class="topbar">
        <div class="topbar__left">
          <button type="button" class="btn-hamburger" (click)="isMobileMenuOpen = !isMobileMenuOpen" title="Toggle navigation menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span class="topbar-brand-title">Hold &amp; Recall Bills</span>
        </div>
        <div class="topbar__right">
          <div class="user-chip">
            <div class="avatar">{{ auth.currentUser().initials }}</div>
            <div class="user-chip-text">
              <div class="text-sm" style="font-weight:600;line-height:1.2;white-space:nowrap;">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize;white-space:nowrap;">{{ auth.currentUser().role }}</div>
            </div>
          </div>
          <button type="button" class="btn-topbar-signout" (click)="signOut()" title="Sign out">
            <span>🚪</span>
            <span class="signout-label">Sign Out</span>
          </button>
        </div>
      </header>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-POS-009</span>
            <h1>Hold &amp; Recall</h1>
            <p class="text-muted">Bills held mid-sale. Resume any of them exactly where the cashier left off.</p>
          </div>
        </div>

        <div class="card card-flush">
          <div class="card-header" style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
            <h3>Held Bills</h3>
            <span class="badge badge-neutral">{{ heldBills.length }} held</span>
          </div>

          <div *ngIf="heldBills.length > 0" class="table-container">
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
                      <button class="btn btn-primary btn-sm" [disabled]="processingId === h.id" (click)="resumeBill(h.id)">
                        {{ processingId === h.id ? 'Loading...' : 'Resume' }}
                      </button>
                      <button class="btn btn-ghost btn-sm text-danger" [disabled]="processingId === h.id" (click)="discardBill(h.id)">
                        Discard
                      </button>
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
  isMobileMenuOpen: boolean = false;
  heldBills: any[] = [];
  processingId: string | null = null;

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
    this.processingId = heldId;
    this.router.navigate(['/pos'], { queryParams: { recall: heldId } });
  }

  discardBill(heldId: string) {
    if (!confirm('Discard this held bill?')) return;
    this.processingId = heldId;
    this.http.delete<any>(`${environment.apiUrl}/billing/held-bills/${heldId}`).subscribe({
      next: () => {
        this.processingId = null;
        this.loadHeldBills();
      },
      error: () => {
        this.processingId = null;
        this.heldBills = this.heldBills.filter(h => h.id !== heldId);
      }
    });
  }

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}

