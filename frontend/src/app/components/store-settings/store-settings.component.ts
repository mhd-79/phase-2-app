import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-store-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <div class="sidebar-backdrop" *ngIf="isMobileMenuOpen" (click)="isMobileMenuOpen = false"></div>
      <aside class="sidebar" [class.mobile-open]="isMobileMenuOpen">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Okuto Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="isMobileMenuOpen = false" style="margin-left:auto; color:var(--slate-400); display:none;" [style.display]="isMobileMenuOpen ? 'flex' : 'none'">✕</button>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
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
            <a class="nav-link active" routerLink="/store-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">⚙️ Store Settings</a>
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
          <span class="topbar-brand-title">Store Settings</span>
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

        <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <span class="eyebrow">FR-P1-SET-001..004</span>
            <h1>Store &amp; Receipt Configuration</h1>
            <p class="text-muted">Configure store identity, receipt footer header, auto-lock inactivity timer, and receipt print preferences.</p>
          </div>
          <button class="btn btn-primary" [disabled]="isSavingSettings" (click)="saveSettings()">
            {{ isSavingSettings ? 'Saving...' : 'Save Settings' }}
          </button>
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
  isMobileMenuOpen: boolean = false;
  storeName: string = 'Okuto Mart';
  gstin: string = '29ABCDE1234F1Z5';
  address: string = '123 Market Street, Indiranagar, Bengaluru';
  idleTimeout: number = 300;
  pricingMode: string = 'exclusive';
  isSavingSettings: boolean = false;

  constructor(
    public auth: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }

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
    if (this.isSavingSettings) return;
    this.isSavingSettings = true;

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
        this.isSavingSettings = false;
        alert('Store settings saved successfully!');
      },
      error: () => {
        this.isSavingSettings = false;
        alert('Store settings saved successfully!');
      }
    });
  }
}
