import { Component, EventEmitter, Output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div class="row">
        <div class="brand-crumb" style="font-weight:600;color:var(--text-muted);font-size:var(--text-sm)">
          Okuto Mart &middot; <span style="color:var(--primary)">{{ auth.isAdmin() ? 'Store Manager (Admin)' : 'POS Checkout (Cashier)' }}</span>
        </div>
      </div>
      <div class="row">
        <button class="icon-btn" title="Lock screen" (click)="lockTrigger.emit()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
        </button>
        <div class="user-chip">
          <div class="avatar">{{ getUserInitials() }}</div>
          <div>
            <div class="text-sm user-chip-name" style="font-weight:600;line-height:1.2">{{ auth.currentUser().fullName }}</div>
            <div class="text-xs text-muted user-chip-sub" style="line-height:1.2">{{ auth.currentUser().subText }}</div>
          </div>
        </div>
        <a class="icon-btn" routerLink="/login" title="Sign out" (click)="auth.logout()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </a>
      </div>
    </header>
  `
})
export class TopbarComponent {
  auth = inject(AuthService);
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
