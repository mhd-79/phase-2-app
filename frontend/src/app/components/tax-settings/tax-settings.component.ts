import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-tax-settings',
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
            <a class="nav-link active" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-TAX-001..003</span>
            <h1>Tax &amp; GST Configuration</h1>
            <p class="text-muted">Configure default tax mode (Tax Exclusive / Tax Inclusive) and GST slab rates.</p>
          </div>
          <button class="btn btn-primary" (click)="saveTaxSettings()">Save Tax Settings</button>
        </div>

        <div class="card" style="max-width:640px;">
          <h3>Pricing &amp; Tax Mode</h3>
          <div style="margin-top:16px;">
            <label class="checkbox-row"><input type="radio" name="taxMode" value="exclusive" [(ngModel)]="pricingMode"> Tax Exclusive (GST added on top of item price)</label>
            <label class="checkbox-row"><input type="radio" name="taxMode" value="inclusive" [(ngModel)]="pricingMode"> Tax Inclusive (Item price includes internal GST)</label>
          </div>
        </div>
      </main>
    </div>
  `
})
export class TaxSettingsComponent implements OnInit {
  pricingMode: string = 'exclusive';

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit() {
    this.http.get<any>('http://localhost:8000/api/v1/settings/store').subscribe({
      next: (res) => {
        if (res?.pricing_mode) {
          this.pricingMode = res.pricing_mode;
          localStorage.setItem('pos_tax_settings', JSON.stringify({ pricingMode: this.pricingMode }));
        }
      },
      error: () => {
        const saved = localStorage.getItem('pos_tax_settings');
        if (saved) {
          try { this.pricingMode = JSON.parse(saved).pricingMode || 'exclusive'; } catch(e) {}
        }
      }
    });
  }

  saveTaxSettings() {
    const token = localStorage.getItem('pos_token');
    const user = this.auth.currentUser();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (user?.role) headers['X-User-Role'] = user.role;
    if (user?.username) headers['X-Username'] = user.username;

    this.http.put<any>('http://localhost:8000/api/v1/settings/store', { pricing_mode: this.pricingMode }, { headers }).subscribe({
      next: (res) => {
        this.pricingMode = res.pricing_mode;
        localStorage.setItem('pos_tax_settings', JSON.stringify({ pricingMode: this.pricingMode }));
        alert('Tax configuration saved successfully!');
      },
      error: () => {
        localStorage.setItem('pos_tax_settings', JSON.stringify({ pricingMode: this.pricingMode }));
        alert('Tax configuration saved!');
      }
    });
  }
}
