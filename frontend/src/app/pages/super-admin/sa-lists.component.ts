import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InviteResult, Plan, PlatformNotification, SuperAdminApiService } from '../../services/super-admin-api.service';
import { badgeClass, copyText, label } from './sa-util';

/** Invitations: every invitation / password-reset link that was issued (the tokens themselves are never shown again). */
@Component({
  selector: 'app-sa-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header"><div><span class="eyebrow">Super Admin</span><h1>Invitations</h1>
        <p>Links are single-use and expire. Resending replaces the previous link.</p></div></div>
      <div class="card card-flush">
        <div class="card-header"><h3>{{ total() }} invitation{{ total() === 1 ? '' : 's' }}</h3>
          <select class="select" [(ngModel)]="status" (ngModelChange)="load()" aria-label="Filter by status">
            <option value="">All</option><option value="PENDING">Pending</option><option value="ACCEPTED">Accepted</option><option value="EXPIRED">Expired</option><option value="REVOKED">Replaced</option>
          </select></div>
        @if (error()) { <div style="padding:var(--space-4);color:var(--danger-700)" role="alert">{{ error() }}</div> }
        @if (!loading() && !items().length && !error()) { <div class="empty-state" style="padding:var(--space-8)">No invitations.</div> }
        @if (items().length) {
          <div class="table-scroll"><table class="table">
            <thead><tr><th>Business</th><th>Email</th><th>Type</th><th>Status</th><th>Sent</th><th>Expires</th><th></th></tr></thead>
            <tbody>@for (i of items(); track i.id) {
              <tr><td><a [routerLink]="['/super-admin/tenants', i.tenant_id]">{{ i.tenant_name }}</a></td><td>{{ i.email }}</td>
                <td>{{ i.purpose === 'invite' ? 'Invitation' : 'Password reset' }}</td><td><span [class]="badge(i.status)">{{ pretty(i.status) }}</span></td>
                <td>{{ i.created_at | date:'medium' }}</td><td>{{ i.expires_at | date:'medium' }}</td>
                <td>@if (i.purpose === 'invite' && (i.status === 'PENDING' || i.status === 'EXPIRED')) {
                  <button class="btn btn-secondary btn-sm" type="button" [disabled]="busy()" (click)="resend(i.tenant_id)">Resend</button> }</td></tr>
            }</tbody>
          </table></div>
        }
      </div>
      @if (invite(); as inv) {
        <div class="modal-overlay open" (click)="invite.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Invitation">
            <div class="modal-header"><h3>Invitation {{ inv.delivered ? 'sent' : 'ready' }}</h3><button class="icon-btn" type="button" aria-label="Close" (click)="invite.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              @if (inv.delivered) { <p class="text-sm" style="color:var(--success-700)">The email was sent. Earlier links no longer work.</p> }
              @else {
                <p class="text-sm" style="color:var(--warning-700)">The email could not be delivered{{ inv.error ? ' (' + inv.error + ')' : ' because SMTP is not configured' }}. Share this single-use link:</p>
                <input class="input mono" readonly [value]="inv.invite_url" (focus)="$any($event.target).select()">
                <button class="btn btn-secondary btn-sm" type="button" (click)="copy(inv.invite_url)">Copy link</button>
              }
            </div>
            <div class="modal-footer"><button class="btn btn-primary" type="button" (click)="invite.set(null)">Done</button></div>
          </div>
        </div>
      }
      @if (toast()) { <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toast() }}</span></div></div> }
    </main>
  `
})
export class SaInvitationsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  items = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal(''); busy = signal(false);
  invite = signal<InviteResult | null>(null); toast = signal(''); status = '';
  badge = badgeClass; pretty = label;

  async ngOnInit() { await this.load(); }
  async load() {
    this.loading.set(true);
    try { const r = await this.api.invitations(this.status); this.items.set(r.items); this.total.set(r.total); this.error.set(''); }
    catch (e: any) { this.error.set(e.message); } finally { this.loading.set(false); }
  }
  async resend(tenantId: string) {
    if (this.busy()) return;
    this.busy.set(true);
    try { this.invite.set((await this.api.resendInvitation(tenantId)).invitation); await this.load(); }
    catch (e: any) { this.error.set(e.message); } finally { this.busy.set(false); }
  }
  async copy(text: string | null) { if (text && await copyText(text)) { this.toast.set('Link copied'); setTimeout(() => this.toast.set(''), 2500); } }
}

/** Subscriptions: trial / plan / payment state of every tenant, with a way to record a payment received outside the app. */
@Component({
  selector: 'app-sa-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header"><div><span class="eyebrow">Super Admin</span><h1>Subscriptions</h1>
        <p>Trial and subscription status of every tenant. A subscription becomes ACTIVE only after payment is confirmed.</p></div></div>
      <div class="card card-flush">
        @if (error()) { <div style="padding:var(--space-4);color:var(--danger-700)" role="alert">{{ error() }}</div> }
        @if (!loading() && !items().length && !error()) { <div class="empty-state" style="padding:var(--space-8)">No tenants yet.</div> }
        @if (items().length) {
          <div class="table-scroll"><table class="table">
            <thead><tr><th>Business</th><th>Status</th><th>Plan</th><th>Payment</th><th>Trial ends</th><th>Subscription ends</th><th></th></tr></thead>
            <tbody>@for (s of items(); track s.tenant_id) {
              <tr><td><a [routerLink]="['/super-admin/tenants', s.tenant_id]" style="font-weight:600">{{ s.tenant_name }}</a></td>
                <td><span [class]="badge(s.status)">{{ pretty(s.status) }}</span></td><td>{{ s.current_plan || '—' }}</td>
                <td><span [class]="badge(s.payment_status)">{{ pretty(s.payment_status) }}</span></td>
                <td>{{ (s.trial_end_date | date:'mediumDate') || '—' }}</td><td>{{ (s.subscription_end_date | date:'mediumDate') || '—' }}</td>
                <td>@if (['TRIAL','ACTIVE','EXPIRED'].includes(s.status)) { <button class="btn btn-secondary btn-sm" type="button" (click)="open(s)">Record payment</button> }</td></tr>
            }</tbody>
          </table></div>
        }
      </div>
      @if (paying(); as s) {
        <div class="modal-overlay open" (click)="paying.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Record payment">
            <div class="modal-header"><h3>Record payment · {{ s.tenant_name }}</h3><button class="icon-btn" type="button" aria-label="Close" (click)="paying.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <div class="field"><label>Plan</label><select class="select" [(ngModel)]="plan">@for (p of plans(); track p.id) { <option [value]="p.code">{{ p.name }} · ₹{{ p.price }} / {{ p.duration_days }} days</option> }</select></div>
              <div class="field"><label>Payment reference (optional)</label><input class="input" [(ngModel)]="reference" maxlength="120"></div>
              @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="paying.set(null)">Cancel</button>
              <button class="btn btn-primary" type="button" [disabled]="busy() || !plan" (click)="save()">Activate subscription</button></div>
          </div>
        </div>
      }
      @if (toast()) { <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toast() }}</span></div></div> }
    </main>
  `
})
export class SaSubscriptionsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  items = signal<any[]>([]); loading = signal(true); error = signal(''); busy = signal(false); formError = signal(''); toast = signal('');
  plans = signal<Plan[]>([]); paying = signal<any>(null); plan = ''; reference = '';
  badge = badgeClass; pretty = label;

  async ngOnInit() {
    this.api.plans().then(r => { this.plans.set(r.items.filter(p => p.is_active)); this.plan = this.plans()[0]?.code || ''; }).catch(() => {});
    await this.load();
  }
  async load() {
    this.loading.set(true);
    try { this.items.set((await this.api.subscriptions()).items); this.error.set(''); } catch (e: any) { this.error.set(e.message); } finally { this.loading.set(false); }
  }
  open(s: any) { this.reference = ''; this.formError.set(''); this.paying.set(s); }
  async save() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.markPaid(this.paying().tenant_id, this.plan, this.reference);
      this.paying.set(null); this.toast.set('Subscription activated'); setTimeout(() => this.toast.set(''), 3000);
      await this.load();
    } catch (e: any) { this.formError.set(e.message); } finally { this.busy.set(false); }
  }
}

/** Plans: what tenants can subscribe to, with the limits that apply to each. */
@Component({
  selector: 'app-sa-plans',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header"><div><span class="eyebrow">Super Admin</span><h1>Plans</h1>
        <p>Subscription plans and their limits (users, storage, AI assistant, reports, duration).</p></div>
        <div class="page-actions"><button class="btn btn-primary" type="button" (click)="open(null)">+ Add Plan</button></div></div>
      <div class="card card-flush">
        @if (error()) { <div style="padding:var(--space-4);color:var(--danger-700)" role="alert">{{ error() }}</div> }
        @if (items().length) {
          <div class="table-scroll"><table class="table">
            <thead><tr><th>Plan</th><th class="num">Price</th><th class="num">Duration</th><th class="num">Users</th><th class="num">Storage</th><th>AI</th><th>Reports</th><th>Status</th><th></th></tr></thead>
            <tbody>@for (p of items(); track p.id) {
              <tr><td><strong>{{ p.name }}</strong><div class="text-xs text-muted">{{ p.code }}@if (p.description) { · {{ p.description }} }</div></td>
                <td class="num">₹{{ p.price }}</td><td class="num">{{ p.duration_days }} days</td><td class="num">{{ p.max_users ?? 'Unlimited' }}</td>
                <td class="num">{{ p.storage_mb ? (p.storage_mb / 1024 | number:'1.0-1') + ' GB' : 'Unlimited' }}</td>
                <td>{{ p.ai_enabled ? 'Yes' : 'No' }}</td><td>{{ p.reports_enabled ? 'Yes' : 'No' }}</td>
                <td><span class="badge" [class.badge-success]="p.is_active" [class.badge-neutral]="!p.is_active">{{ p.is_active ? 'Active' : 'Hidden' }}</span></td>
                <td><button class="btn btn-secondary btn-sm" type="button" (click)="open(p)">Edit</button></td></tr>
            }</tbody>
          </table></div>
        }
      </div>
      @if (editing()) {
        <div class="modal-overlay open" (click)="editing.set(false)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Plan">
            <div class="modal-header"><h3>{{ editId ? 'Edit plan' : 'Add plan' }}</h3><button class="icon-btn" type="button" aria-label="Close" (click)="editing.set(false)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <div class="form-grid">
                <div class="field"><label>Code *</label><input class="input mono" [(ngModel)]="f.code" [disabled]="!!editId" placeholder="e.g. pro"></div>
                <div class="field"><label>Name *</label><input class="input" [(ngModel)]="f.name"></div>
                <div class="field"><label>Price (₹) *</label><input class="input" type="number" min="0" [(ngModel)]="f.price"></div>
                <div class="field"><label>Duration (days) *</label><input class="input" type="number" min="1" [(ngModel)]="f.duration_days"></div>
                <div class="field"><label>Max users</label><input class="input" type="number" min="1" [(ngModel)]="f.max_users" placeholder="Unlimited"></div>
                <div class="field"><label>Storage (MB)</label><input class="input" type="number" min="1" [(ngModel)]="f.storage_mb" placeholder="Unlimited"></div>
              </div>
              <div class="field"><label>Description</label><input class="input" [(ngModel)]="f.description" maxlength="300"></div>
              <label class="checkbox-row"><input type="checkbox" [(ngModel)]="f.ai_enabled"> AI assistant included</label>
              <label class="checkbox-row"><input type="checkbox" [(ngModel)]="f.reports_enabled"> Reports included</label>
              <label class="checkbox-row"><input type="checkbox" [(ngModel)]="f.is_active"> Available to tenants</label>
              @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="editing.set(false)">Cancel</button>
              <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="save()">Save plan</button></div>
          </div>
        </div>
      }
    </main>
  `
})
export class SaPlansComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  items = signal<Plan[]>([]); error = signal(''); busy = signal(false); formError = signal(''); editing = signal(false);
  editId = ''; f: any = {};

  async ngOnInit() { await this.load(); }
  async load() { try { this.items.set((await this.api.plans()).items); this.error.set(''); } catch (e: any) { this.error.set(e.message); } }

  open(p: Plan | null) {
    this.editId = p?.id || '';
    this.f = p ? { ...p } : { code: '', name: '', description: '', price: 0, duration_days: 30, max_users: null, storage_mb: null, ai_enabled: false, reports_enabled: true, is_active: true };
    this.formError.set('');
    this.editing.set(true);
  }

  async save() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const body = { ...this.f, max_users: this.f.max_users || null, storage_mb: this.f.storage_mb || null, description: this.f.description || null };
      if (this.editId) { delete body.code; await this.api.updatePlan(this.editId, body); } else { await this.api.createPlan(body); }
      this.editing.set(false);
      await this.load();
    } catch (e: any) { this.formError.set(e.message); } finally { this.busy.set(false); }
  }
}

/** Notifications for the Super Admin (new requests, accepted invitations, trials ending, expiries, payments). */
@Component({
  selector: 'app-sa-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header"><div><span class="eyebrow">Super Admin</span><h1>Notifications</h1><p>{{ unread() }} unread.</p></div>
        <div class="page-actions"><button class="btn btn-secondary" type="button" [disabled]="!unread()" (click)="readAll()">Mark all as read</button></div></div>
      @if (error()) { <div class="card" style="color:var(--danger-700)" role="alert">{{ error() }}</div> }
      <div class="card card-flush">
        @if (!loading() && !items().length) { <div class="empty-state" style="padding:var(--space-8)">Nothing here yet.</div> }
        @for (n of items(); track n.id) {
          <div class="row" style="padding:var(--space-4);border-bottom:1px solid var(--border);gap:var(--space-3);align-items:flex-start" [style.background]="n.is_read ? '' : 'var(--primary-subtle)'">
            <span class="dot" [class.dot-neutral]="n.is_read" [class.dot-warning]="!n.is_read" style="margin-top:6px"></span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600">{{ n.title }}</div>
              <div class="text-sm text-muted">{{ n.message }}</div>
              <div class="text-xs text-muted">{{ n.created_at | date:'medium' }}</div>
            </div>
            @if (n.link) { <a class="btn btn-secondary btn-sm" [routerLink]="n.link" (click)="read(n)">Open</a> }
            @if (!n.is_read) { <button class="btn btn-ghost btn-sm" type="button" (click)="read(n)">Mark read</button> }
          </div>
        }
      </div>
    </main>
  `
})
export class SaNotificationsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  items = signal<PlatformNotification[]>([]); unread = signal(0); loading = signal(true); error = signal('');
  async ngOnInit() { await this.load(); }
  async load() {
    try { const r = await this.api.notifications(); this.items.set(r.items); this.unread.set(r.unread); this.error.set(''); }
    catch (e: any) { this.error.set(e.message); } finally { this.loading.set(false); }
  }
  async read(n: PlatformNotification) { if (!n.is_read) { try { await this.api.readNotification(n.id); await this.load(); } catch (e: any) { this.error.set(e.message); } } }
  async readAll() { try { await this.api.readAllNotifications(); await this.load(); } catch (e: any) { this.error.set(e.message); } }
}

/** Audit logs of Super Admin and onboarding actions. */
@Component({
  selector: 'app-sa-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header"><div><span class="eyebrow">Super Admin</span><h1>Audit Logs</h1><p>Who did what, and when.</p></div></div>
      <div class="card card-flush">
        <div class="card-header" style="gap:var(--space-3);flex-wrap:wrap"><h3>{{ total() }} entr{{ total() === 1 ? 'y' : 'ies' }}</h3>
          <select class="select" [(ngModel)]="action" (ngModelChange)="reset()" aria-label="Filter by event">
            <option value="">All events</option>@for (a of actions; track a) { <option [value]="a">{{ pretty(a) }}</option> }
          </select></div>
        @if (error()) { <div style="padding:var(--space-4);color:var(--danger-700)" role="alert">{{ error() }}</div> }
        @if (!loading() && !items().length && !error()) { <div class="empty-state" style="padding:var(--space-8)">No entries.</div> }
        @if (items().length) {
          <div class="table-scroll"><table class="table">
            <thead><tr><th>When</th><th>Event</th><th>By</th><th>Role</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>@for (a of items(); track a.id) {
              <tr><td style="white-space:nowrap">{{ a.timestamp | date:'medium' }}</td><td>{{ pretty(a.action) }}</td><td>{{ a.actor_email || '—' }}</td><td>{{ a.actor_role }}</td>
                <td class="mono text-xs">{{ a.ip_address || '—' }}</td><td class="text-xs mono">{{ a.metadata ? (a.metadata | json) : '' }}</td></tr>
            }</tbody>
          </table></div>
          <div class="row" style="padding:var(--space-3);gap:var(--space-2);justify-content:flex-end">
            <button class="btn btn-secondary btn-sm" type="button" [disabled]="offset === 0" (click)="page(-1)">Previous</button>
            <button class="btn btn-secondary btn-sm" type="button" [disabled]="offset + pageSize >= total()" (click)="page(1)">Next</button>
          </div>
        }
      </div>
    </main>
  `
})
export class SaAuditLogsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  items = signal<any[]>([]); total = signal(0); loading = signal(true); error = signal('');
  action = ''; offset = 0; pageSize = 50; pretty = label;
  actions = ['TENANT_REQUEST_CREATED', 'TENANT_REQUEST_APPROVED', 'TENANT_REQUEST_REJECTED', 'TENANT_CREATED', 'TENANT_UPDATED', 'INVITATION_GENERATED', 'INVITATION_RESENT',
    'INVITATION_ACCEPTED', 'PASSWORD_SETUP_COMPLETED', 'PASSWORD_RESET_COMPLETED', 'TENANT_ACTIVATED', 'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_EXPIRED',
    'SUBSCRIPTION_CHANGED', 'PAYMENT_STATUS_CHANGED', 'PLAN_CHANGED', 'SETTINGS_CHANGED'];

  async ngOnInit() { await this.load(); }
  reset() { this.offset = 0; this.load(); }
  page(dir: number) { this.offset = Math.max(0, this.offset + dir * this.pageSize); this.load(); }
  async load() {
    this.loading.set(true);
    try { const r = await this.api.auditLogs({ action: this.action, limit: this.pageSize, offset: this.offset }); this.items.set(r.items); this.total.set(r.total); this.error.set(''); }
    catch (e: any) { this.error.set(e.message); } finally { this.loading.set(false); }
  }
}

/** System settings: platform-wide onboarding and access policy. */
@Component({
  selector: 'app-sa-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header"><div><span class="eyebrow">Super Admin</span><h1>System Settings</h1><p>Onboarding defaults and what happens when a trial or subscription ends.</p></div></div>
      @if (error()) { <div class="card" style="color:var(--danger-700);margin-bottom:var(--space-4)" role="alert">{{ error() }}</div> }
      @if (s(); as cfg) {
        <div class="card" style="max-width:720px;margin-bottom:var(--space-5)">
          <h3 style="margin-bottom:var(--space-4)">Onboarding &amp; access</h3>
          <form (submit)="$event.preventDefault(); save()">
            <div class="form-grid">
              <div class="field"><label>Default trial length (days)</label><input class="input" type="number" min="1" max="365" name="trial" [(ngModel)]="f.default_trial_days"></div>
              <div class="field"><label>Invitation link validity (hours)</label><input class="input" type="number" min="1" max="720" name="inv" [(ngModel)]="f.invitation_expiry_hours"></div>
              <div class="field"><label>Trial reminder (days before the end)</label><input class="input" type="number" min="1" max="60" name="rem" [(ngModel)]="f.trial_reminder_days"></div>
              <div class="field"><label>When a trial or subscription expires</label>
                <select class="select" name="pol" [(ngModel)]="f.expired_access_policy"><option value="readonly">Read-only (can view, cannot change data)</option><option value="block">Block access</option></select></div>
            </div>
            @if (formError()) { <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3)" role="alert">{{ formError() }}</div> }
            <div class="row" style="justify-content:flex-end;margin-top:var(--space-5)"><button class="btn btn-primary" type="submit" [disabled]="busy()">Save settings</button></div>
          </form>
        </div>
        <div class="card" style="max-width:720px;margin-bottom:var(--space-5)">
          <h3 style="margin-bottom:var(--space-3)">Server configuration</h3>
          <p class="text-sm">Invitation email: <span class="badge" [class.badge-success]="cfg.smtp_configured" [class.badge-warning]="!cfg.smtp_configured">{{ cfg.smtp_configured ? 'SMTP configured' : 'SMTP not configured (links are shown to copy)' }}</span></p>
          <p class="text-sm">Payment provider: <strong>{{ cfg.payment_provider }}</strong> @if (cfg.payment_provider === 'none') { <span class="text-muted">(payments are confirmed by the Super Admin)</span> }</p>
          <p class="text-sm">Invitation links open at <span class="mono">{{ cfg.frontend_base_url }}</span></p>
          <p class="text-xs text-muted">These come from the server's environment variables and cannot be changed here.</p>
        </div>
        <div class="card" style="max-width:720px">
          <h3 style="margin-bottom:var(--space-2)">Maintenance</h3>
          <p class="text-sm text-muted" style="margin-bottom:var(--space-3)">Expiries, trial reminders and stale invitations are processed automatically every hour. Run it now to see the result immediately.</p>
          <button class="btn btn-secondary" type="button" [disabled]="busy()" (click)="sweep()">Run now</button>
          @if (sweepMsg()) { <span class="text-sm" style="margin-left:var(--space-3)">{{ sweepMsg() }}</span> }
        </div>
      } @else if (!error()) { <p class="text-muted">Loading…</p> }
      @if (toast()) { <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toast() }}</span></div></div> }
    </main>
  `
})
export class SaSettingsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  s = signal<any>(null); error = signal(''); formError = signal(''); busy = signal(false); toast = signal(''); sweepMsg = signal('');
  f: any = {};

  async ngOnInit() { try { const r = await this.api.settings(); this.s.set(r); this.f = { ...r }; } catch (e: any) { this.error.set(e.message); } }

  async save() {
    if (this.busy()) return;
    this.busy.set(true); this.formError.set('');
    try {
      const { default_trial_days, invitation_expiry_hours, trial_reminder_days, expired_access_policy } = this.f;
      const r = await this.api.updateSettings({ default_trial_days, invitation_expiry_hours, trial_reminder_days, expired_access_policy });
      this.s.set(r); this.f = { ...r };
      this.toast.set('Settings saved'); setTimeout(() => this.toast.set(''), 3000);
    } catch (e: any) { this.formError.set(e.message); } finally { this.busy.set(false); }
  }

  async sweep() {
    this.busy.set(true);
    try { const r = await this.api.sweep(); this.sweepMsg.set(`${r.expired} expired, ${r.reminders} reminders, ${r.invitations_expired} invitations expired.`); }
    catch (e: any) { this.sweepMsg.set(e.message); } finally { this.busy.set(false); }
  }
}
