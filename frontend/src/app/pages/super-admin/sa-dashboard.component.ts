import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuditEntry, SuperAdminApiService } from '../../services/super-admin-api.service';
import { label } from './sa-util';

@Component({
  selector: 'app-sa-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">Super Admin</span>
          <h1>Dashboard</h1>
          <p>Platform overview across all tenants.</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-primary" routerLink="/super-admin/tenants" [queryParams]="{ add: 1 }">+ Add Tenant</a>
        </div>
      </div>

      @let d = data();
      @if (error()) { <div class="card" style="color:var(--danger-700)" role="alert">{{ error() }}</div> }
      @else if (d) {
        <div class="grid grid-4" style="margin-bottom:var(--space-6)">
          @for (c of cards; track c.key) {
            <a class="card stat-card" [routerLink]="c.link" [queryParams]="c.query || {}" style="text-decoration:none;color:inherit">
              <span class="stat-label">{{ c.label }}</span>
              <span class="stat-value">{{ d.cards[c.key] }}</span>
              @if (c.hint) { <span class="stat-delta">{{ c.hint }}</span> }
            </a>
          }
        </div>

        <div class="card card-flush">
          <div class="card-header"><h3>Recent activity</h3><a class="btn btn-secondary btn-sm" routerLink="/super-admin/audit-logs">All audit logs</a></div>
          @if (!d.recent_activity.length) { <div class="empty-state" style="padding:var(--space-8)">No activity yet.</div> }
          @else {
            <div class="table-scroll"><table class="table">
              <thead><tr><th>When</th><th>Action</th><th>By</th></tr></thead>
              <tbody>@for (a of d.recent_activity; track a.id) {
                <tr><td>{{ a.timestamp | date:'medium' }}</td><td>{{ pretty(a.action) }}</td><td>{{ a.actor_email || a.actor_role }}</td></tr>
              }</tbody>
            </table></div>
          }
        </div>
      } @else { <p class="text-muted">Loading…</p> }
    </main>
  `
})
export class SaDashboardComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  data = signal<{ cards: Record<string, number>; recent_activity: AuditEntry[] } | null>(null);
  error = signal('');
  pretty = label;

  cards = [
    { key: 'total_tenants', label: 'Total Tenants', link: '/super-admin/tenants' },
    { key: 'active_tenants', label: 'Active Tenants', link: '/super-admin/tenants', query: { status: 'ACTIVE' }, hint: 'Paid subscription' },
    { key: 'trial_tenants', label: 'Trial Tenants', link: '/super-admin/tenants', query: { status: 'TRIAL' } },
    { key: 'pending_requests', label: 'Pending Requests', link: '/super-admin/tenant-requests' },
    { key: 'expired_tenants', label: 'Expired Tenants', link: '/super-admin/tenants', query: { status: 'EXPIRED' } },
    { key: 'suspended_tenants', label: 'Suspended Tenants', link: '/super-admin/tenants', query: { status: 'SUSPENDED' } },
    { key: 'total_users', label: 'Total Users', link: '/super-admin/tenants', hint: 'Across all businesses' }
  ];

  async ngOnInit() {
    try { this.data.set(await this.api.dashboard()); } catch (e: any) { this.error.set(e.message); }
  }
}
