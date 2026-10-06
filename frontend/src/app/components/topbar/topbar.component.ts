import { Component, EventEmitter, OnInit, Output, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TenantSubscriptionService } from '../../services/tenant-subscription.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div class="row">
        <div class="brand-crumb" style="font-weight:600;color:var(--text-muted);font-size:var(--text-sm)">
          {{ auth.currentUser().tenantName || (auth.isSuperAdmin() ? 'OKUTO Platform' : 'Okuto Mart') }} &middot; <span style="color:var(--primary)">{{ auth.isSuperAdmin() ? 'Super Admin' : (auth.isAdmin() ? 'Store Manager (Admin)' : 'POS Checkout (Cashier)') }}</span>
        </div>
        @if (planBadge(); as b) {
          <a class="badge" [class.badge-warning]="b.tone === 'warning'" [class.badge-danger]="b.tone === 'danger'" [class.badge-info]="b.tone === 'info'"
             routerLink="/store-settings" title="View plans" style="margin-left:var(--space-3);text-decoration:none">{{ b.text }}</a>
        }
      </div>
      <div class="row">
        @if (!auth.isSuperAdmin()) {
        <button class="icon-btn" title="Lock screen" (click)="lockTrigger.emit()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
        </button>
        }
        <div class="user-chip">
          <div class="avatar">{{ getUserInitials() }}</div>
          <div>
            <div class="text-sm user-chip-name" style="font-weight:600;line-height:1.2">{{ auth.currentUser().fullName }}</div>
            <div class="text-xs text-muted user-chip-sub" style="line-height:1.2">{{ auth.currentUser().subText }}</div>
          </div>
        </div>
      </div>
    </header>
  `
})
export class TopbarComponent implements OnInit {
  auth = inject(AuthService);
  private subscription = inject(TenantSubscriptionService);

  /** Trial / expiry reminder for businesses created by the Super Admin (nothing for the original store). */
  planBadge = computed(() => {
    const s = this.subscription.status();
    if (!s) return null;
    if (s.status === 'EXPIRED') return { text: 'Subscription expired · choose a plan', tone: 'danger' };
    if (s.status === 'TRIAL') {
      const left = s.days_left ?? 0;
      return { text: `Trial · ${left} day${left === 1 ? '' : 's'} left`, tone: s.reminder ? 'warning' : 'info' };
    }
    return null;
  });

  ngOnInit() { this.subscription.refresh(); }
  @Output() lockTrigger = new EventEmitter<void>();

  getUserInitials(): string {
    const name = this.auth.currentUser().fullName || '';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || (this.auth.isAdmin() ? 'AM' : 'PK');
  }
}
