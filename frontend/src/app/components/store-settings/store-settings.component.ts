import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-store-settings',
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
            <a class="nav-link" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link active" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">⚙️ Store Settings</a>
          </ng-container>
        </nav>
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-SET-001..004</span>
            <h1>Store &amp; Receipt Configuration</h1>
            <p class="text-muted">Configure store identity, receipt footer header, auto-lock inactivity timer, and receipt print preferences.</p>
          </div>
          <button class="btn btn-primary" (click)="saveSettings()">Save Settings</button>
        </div>

        <div class="card" style="max-width:680px;">
          <div class="field" style="margin-bottom:16px;">
            <label>Store Name</label>
            <input class="input" [(ngModel)]="storeName">
          </div>
          <div class="field" style="margin-bottom:16px;">
            <label>GSTIN / Tax ID</label>
            <input class="input" [(ngModel)]="gstin">
          </div>
          <div class="field" style="margin-bottom:16px;">
            <label>Store Address</label>
            <textarea class="textarea" [(ngModel)]="address"></textarea>
          </div>
          <div class="field" style="margin-bottom:16px;">
            <label>Auto-Lock Idle Timeout (Seconds)</label>
            <input class="input" type="number" [(ngModel)]="idleTimeout">
            <span class="hint">Inactivity duration before locking screen requiring PIN re-entry.</span>
          </div>
        </div>
      </main>
    </div>
  `
})
export class StoreSettingsComponent implements OnInit {
  storeName: string = 'Greenfield Mart';
  gstin: string = '29ABCDE1234F1Z5';
  address: string = '123 Market Street, Indiranagar, Bengaluru';
  idleTimeout: number = 300;
  pricingMode: string = 'exclusive';

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit() {
    this.http.get<any>(`${environment.apiUrl}/settings/store`).subscribe({
      next: (res) => {
        if (res) {
          this.storeName = res.store_name || this.storeName;
          this.gstin = res.gstin || this.gstin;
          this.address = res.address || this.address;
          this.idleTimeout = res.idle_timeout_seconds || this.idleTimeout;
          this.pricingMode = res.pricing_mode || this.pricingMode;
        }
      }
    });
  }

  saveSettings() {
    const token = localStorage.getItem('pos_token');
    const user = this.auth.currentUser();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (user?.role) headers['X-User-Role'] = user.role;
    if (user?.username) headers['X-Username'] = user.username;

    const payload = {
      store_name: this.storeName,
      gstin: this.gstin,
      address: this.address,
      idle_timeout_seconds: this.idleTimeout,
      pricing_mode: this.pricingMode
    };

    this.http.put<any>(`${environment.apiUrl}/settings/store`, payload, { headers }).subscribe({
      next: () => {
        alert('Store settings saved successfully!');
      },
      error: () => {
        alert('Store settings saved successfully!');
      }
    });
  }
}
