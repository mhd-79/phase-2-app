import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SuperAdminApiService } from '../../services/super-admin-api.service';

interface NavItem { path: string; label: string; icon: string; badge?: () => number; }

/** Navigation of the Super Admin area (same markup/classes as the store sidebar, so layout and responsiveness are shared). */
@Component({
  selector: 'app-sa-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="logo-mark">OK</div>
        <div>
          <div class="brand-name">OKUTO Platform</div>
          <div class="brand-tag">Super Admin</div>
        </div>
      </div>
      <nav class="sidebar__nav">
        <div class="sidebar__section-label">Platform</div>
        @for (item of items; track item.path) {
          <a class="nav-link" [routerLink]="['/super-admin', item.path]" routerLinkActive="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [innerHTML]="icon(item)"></svg>
            {{ item.label }}
            @if (item.badge && item.badge() > 0) { <span class="badge badge-danger" style="margin-left:auto">{{ item.badge() }}</span> }
          </a>
        }
        <a class="nav-link nav-link--logout" routerLink="/login" (click)="auth.logout()" style="margin-top:auto">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Logout
        </a>
      </nav>
      <div class="sidebar__footer">Platform administration</div>
    </aside>
  `
})
export class SaSidebarComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(SuperAdminApiService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private sub?: Subscription;
  pending = signal(0);
  unread = signal(0);

  items: NavItem[] = [
    { path: 'dashboard', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
    { path: 'tenants', label: 'Tenants', icon: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2"/>' },
    { path: 'tenant-requests', label: 'Pending Requests', icon: '<path d="M4 4h16v12H5.2L4 17.2V4zM8 9h8M8 12h5"/>', badge: () => this.pending() },
    { path: 'invitations', label: 'Invitations', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' },
    { path: 'subscriptions', label: 'Subscriptions', icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>' },
    { path: 'plans', label: 'Plans', icon: '<path d="M12 3l9 4.5-9 4.5-9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5"/>' },
    { path: 'notifications', label: 'Notifications', icon: '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0"/>', badge: () => this.unread() },
    { path: 'audit-logs', label: 'Audit Logs', icon: '<path d="M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"/>' },
    { path: 'settings', label: 'System Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>' }
  ];

  /** The icon markup is a fixed constant in this file (never user input), so it is safe to trust. */
  icon(item: NavItem): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(item.icon); }

  ngOnInit() {
    this.refresh();
    this.sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.refresh());
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  private async refresh() {
    try {
      const [n, r] = await Promise.all([this.api.notifications(true), this.api.requests('PENDING_APPROVAL')]);
      this.unread.set(n.unread);
      this.pending.set(r.total);
    } catch { /* counts are a convenience; pages show their own errors */ }
  }
}
