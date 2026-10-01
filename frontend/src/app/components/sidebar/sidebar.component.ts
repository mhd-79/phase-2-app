import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="logo-mark">OM</div>
        <div>
          <div class="brand-name">Okuto Mart</div>
          <div class="brand-tag">Phase 2 &middot; Vendor &amp; Stock</div>
        </div>
      </div>
      <nav class="sidebar__nav">
        <div class="sidebar__section-label">Billing</div>
        <a class="nav-link" routerLink="/pos" routerLinkActive="active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h2l2.4 12.4a2 2 0 002 1.6h8.6a2 2 0 002-1.6L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
          Billing
        </a>
        <a class="nav-link" routerLink="/hold-bills" routerLinkActive="active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>
          Hold &amp; Recall
        </a>
        <a class="nav-link" routerLink="/returns" routerLinkActive="active">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/></svg>
          Returns
        </a>

        @if (auth.isAdmin()) {
          <div class="sidebar__section-label">Inventory</div>
          <a class="nav-link" routerLink="/items-stock" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7l2-4h14l2 4M9 12h6"/></svg>
            Items &amp; Stock
          </a>
          <a class="nav-link" routerLink="/stock-upload" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
            Stock Upload
          </a>

          @if (auth.hasPhase2()) {
            <div class="sidebar__section-label">Procurement</div>
            <a class="nav-link" routerLink="/vendors" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V8l9-5 9 5v13M3 21h18M9 21v-6h6v6"/></svg>
              Vendors
            </a>
            <a class="nav-link" routerLink="/purchase-orders" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3M8 11h8M8 15h5"/></svg>
              Purchase Orders
            </a>
            <a class="nav-link" routerLink="/purchase-returns" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/></svg>
              Purchase Returns
            </a>

            <div class="sidebar__section-label">Stock Maintenance</div>
            <a class="nav-link" routerLink="/stock-adjustment" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>
              Stock Adjustment
            </a>
            <a class="nav-link" routerLink="/batch-expiry" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
              Batch &amp; Expiry
            </a>
            <a class="nav-link" routerLink="/reorder-alerts" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
              Reorder Alerts
            </a>
            <a class="nav-link" routerLink="/stock-audit" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Physical Audit
            </a>
          }

          <div class="sidebar__section-label">Insights</div>
          <a class="nav-link" routerLink="/reports" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>
            Reports
          </a>
          @if (auth.hasPhase2()) {
            <a class="nav-link" routerLink="/ai-insights" routerLinkActive="active">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
              AI Insights
            </a>
          }

          <div class="sidebar__section-label">Administration</div>
          <a class="nav-link" routerLink="/discounts" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 8-9 9-8-8V3a1 1 0 011-1h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
            Discounts
          </a>
          <a class="nav-link" routerLink="/tax-settings" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
            Tax Configuration
          </a>
          <a class="nav-link" routerLink="/users" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><circle cx="17" cy="8" r="2.5"/><path d="M16 14c2.8.3 5 2.6 5 6"/></svg>
            Users &amp; Roles
          </a>
          <a class="nav-link" routerLink="/store-settings" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 01-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 010-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.6V3a2 2 0 014 0v.2a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9c.2.6.7 1 1.6 1H21a2 2 0 010 4h-.2a1.7 1.7 0 00-1.6 1z"/></svg>
            Store Settings
          </a>
        }
      </nav>
      <div class="sidebar__footer">v2.0 &middot; Phase 2 Production</div>
    </aside>
  `
})
export class SidebarComponent {
  auth = inject(AuthService);
}

