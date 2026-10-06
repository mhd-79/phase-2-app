import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InviteResult, Plan, SuperAdminApiService } from '../../services/super-admin-api.service';
import { badgeClass, copyText, label } from './sa-util';

type Tab = 'overview' | 'subscription' | 'users' | 'invitations' | 'audit';

@Component({
  selector: 'app-sa-tenant-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">Tenant</span>
          <h1>{{ d()?.tenant.name || 'Tenant' }}</h1>
          @if (d(); as x) { <p><span [class]="badge(x.tenant.effective_status)">{{ pretty(x.tenant.effective_status) }}</span>
            <span class="text-muted" style="margin-left:var(--space-2)">Code {{ x.tenant.code }}</span></p> }
        </div>
        <div class="page-actions"><a class="btn btn-secondary" routerLink="/super-admin/tenants">← All tenants</a></div>
      </div>

      @if (error()) { <div class="card" style="color:var(--danger-700)" role="alert">{{ error() }}</div> }
      @if (d(); as x) {
        @if (x.tenant.provision_status !== 'ready' && !x.tenant.is_default) {
          <div class="card" style="border-left:4px solid var(--warning-500);margin-bottom:var(--space-4)">
            <strong>Workspace {{ x.tenant.provision_status }}.</strong>
            <span class="text-sm text-muted"> {{ x.tenant.provision_status === 'failed' ? (x.tenant.provision_error || 'Setup failed.') : 'The business database is still being prepared.' }}</span>
            <button class="btn btn-secondary btn-sm" style="margin-left:var(--space-3)" type="button" [disabled]="busy()" (click)="retry()">Retry setup</button>
          </div>
        }

        <div class="row" style="gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-4)">
          <button class="btn btn-secondary" type="button" (click)="openEdit()">Edit</button>
          @if (x.tenant.status === 'INVITED' || x.tenant.status === 'INVITATION_EXPIRED') {
            <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="resend()">{{ x.invitations.length ? 'Resend invitation' : 'Send invitation' }}</button>
          }
          @if (x.tenant.status === 'SUSPENDED') {
            <button class="btn btn-success" type="button" [disabled]="busy()" (click)="reactivate()">Reactivate</button>
          } @else if (!x.tenant.is_default && ['TRIAL','ACTIVE','EXPIRED','ACTIVATED'].includes(x.tenant.status)) {
            <button class="btn btn-danger" type="button" (click)="showSuspend.set(true)">Suspend</button>
          }
          @if (!x.tenant.is_default && ['TRIAL','ACTIVE','EXPIRED'].includes(x.tenant.status)) {
            <button class="btn btn-secondary" type="button" (click)="openPaid()">Record payment / activate plan</button>
          }
        </div>

        <div class="tabs" role="tablist">
          @for (t of tabs; track t.key) {
            <button class="tab" type="button" role="tab" [class.active]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
          }
        </div>

        @switch (tab()) {
          @case ('overview') {
            <div class="grid grid-2">
              <div class="card"><h3>Business information</h3>
                <dl class="sa-dl">
                  <dt>Business name</dt><dd>{{ x.business.name }}</dd>
                  <dt>Legal name</dt><dd>{{ x.business.legal_name }}</dd>
                  <dt>Type</dt><dd>{{ x.business.business_type }}</dd>
                  <dt>GSTIN</dt><dd class="mono">{{ x.business.gstin }}</dd>
                  <dt>Address</dt><dd>{{ x.business.address }}, {{ x.business.city }}, {{ x.business.state }} {{ x.business.postal_code }}, {{ x.business.country }}</dd>
                  <dt>Store name</dt><dd>{{ x.business.initial_outlet_name || x.business.name }}</dd>
                </dl></div>
              <div class="card"><h3>Owner &amp; HO Admin</h3>
                <dl class="sa-dl">
                  <dt>Owner</dt><dd>{{ x.owner.owner_name }}</dd>
                  <dt>Email</dt><dd>{{ x.owner.email || '—' }}</dd>
                  <dt>Phone</dt><dd>{{ x.owner.phone }}</dd>
                  <dt>HO Admin account</dt><dd>@if (x.ho_admin) { {{ x.ho_admin.username }} <span class="badge badge-success">Active</span> } @else { <span class="text-muted">Not created yet (invitation not accepted)</span> }</dd>
                </dl></div>
              <div class="card"><h3>Activity</h3>
                <dl class="sa-dl">
                  <dt>Users</dt><dd>{{ x.counts.users ?? '—' }}</dd>
                  <dt>Items</dt><dd>{{ x.counts.items ?? '—' }}</dd>
                  <dt>Sales (bills)</dt><dd>{{ x.counts.sales ?? '—' }}</dd>
                  <dt>Created</dt><dd>{{ x.tenant.created_at | date:'medium' }} @if (x.tenant.created_by) { <span class="text-muted">by {{ x.tenant.created_by }}</span> }</dd>
                </dl>
                @if (x.tenant.activity_error) { <p class="text-xs" style="color:var(--warning-700)">{{ x.tenant.activity_error }}</p> }
                <p class="text-xs text-muted">Only counts are shown here. Business data stays private to the tenant.</p></div>
            </div>
          }
          @case ('subscription') {
            <div class="grid grid-2">
              <div class="card"><h3>Subscription</h3>
                <dl class="sa-dl">
                  <dt>Status</dt><dd><span [class]="badge(x.subscription.status)">{{ pretty(x.subscription.status) }}</span></dd>
                  <dt>Plan</dt><dd>{{ x.subscription.current_plan || '—' }}</dd>
                  <dt>Payment</dt><dd><span [class]="badge(x.subscription.payment_status)">{{ pretty(x.subscription.payment_status) }}</span></dd>
                  <dt>Subscription start</dt><dd>{{ (x.subscription.subscription_start_date | date:'mediumDate') || '—' }}</dd>
                  <dt>Subscription end</dt><dd>{{ (x.subscription.subscription_end_date | date:'mediumDate') || '—' }}</dd>
                </dl></div>
              <div class="card"><h3>Trial</h3>
                <dl class="sa-dl">
                  <dt>Duration</dt><dd>{{ x.trial.trial_duration_days }} days</dd>
                  <dt>Start</dt><dd>{{ (x.trial.trial_start_date | date:'mediumDate') || 'Starts when the invitation is accepted' }}</dd>
                  <dt>End</dt><dd>{{ (x.trial.trial_end_date | date:'mediumDate') || '—' }}</dd>
                  <dt>Days left</dt><dd>{{ x.trial.days_left ?? '—' }}</dd>
                </dl></div>
            </div>
          }
          @case ('users') {
            <div class="card card-flush">
              @if (!x.users.length) { <div class="empty-state" style="padding:var(--space-8)">No users yet.</div> }
              @else { <div class="table-scroll"><table class="table">
                <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>@for (u of x.users; track u.username) {
                  <tr><td>{{ u.full_name }}</td><td>{{ u.username }}</td><td>{{ pretty(u.role) }}</td>
                    <td><span class="badge" [class.badge-success]="u.is_active" [class.badge-neutral]="!u.is_active">{{ u.is_active ? 'Active' : 'Disabled' }}</span></td></tr>
                }</tbody></table></div> }
            </div>
          }
          @case ('invitations') {
            <div class="card card-flush">
              @if (!x.invitations.length) { <div class="empty-state" style="padding:var(--space-8)">No invitations sent.</div> }
              @else { <div class="table-scroll"><table class="table">
                <thead><tr><th>Sent</th><th>Email</th><th>Type</th><th>Status</th><th>Expires</th><th>Accepted</th></tr></thead>
                <tbody>@for (i of x.invitations; track i.id) {
                  <tr><td>{{ i.created_at | date:'medium' }}</td><td>{{ i.email }}</td><td>{{ i.purpose === 'invite' ? 'Invitation' : 'Password reset' }}</td>
                    <td><span [class]="badge(i.status)">{{ pretty(i.status) }}</span></td><td>{{ i.expires_at | date:'medium' }}</td><td>{{ (i.accepted_at | date:'medium') || '—' }}</td></tr>
                }</tbody></table></div> }
            </div>
          }
          @case ('audit') {
            <div class="card card-flush">
              @if (!x.audit_history.length) { <div class="empty-state" style="padding:var(--space-8)">No history yet.</div> }
              @else { <div class="table-scroll"><table class="table">
                <thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
                <tbody>@for (a of x.audit_history; track a.id) {
                  <tr><td>{{ a.timestamp | date:'medium' }}</td><td>{{ pretty(a.action) }}</td><td>{{ a.actor_email || a.actor_role }}</td>
                    <td class="text-xs mono">{{ a.metadata ? (a.metadata | json) : '' }}</td></tr>
                }</tbody></table></div> }
            </div>
          }
        }
      }

      @if (showEdit()) {
        <div class="modal-overlay open" (click)="showEdit.set(false)">
          <div class="modal modal-lg" (click)="$event.stopPropagation()" role="dialog" aria-label="Edit tenant">
            <div class="modal-header"><h3>Edit tenant</h3><button class="icon-btn" type="button" aria-label="Close" (click)="showEdit.set(false)">✕</button></div>
            <form (submit)="$event.preventDefault(); saveEdit()">
              <div class="modal-body stack" style="gap:var(--space-4)">
                <div class="form-grid">
                  <div class="field"><label>Business name</label><input class="input" name="n" [(ngModel)]="edit.tenant_name"></div>
                  <div class="field"><label>Legal name</label><input class="input" name="l" [(ngModel)]="edit.legal_business_name"></div>
                  <div class="field"><label>Owner name</label><input class="input" name="o" [(ngModel)]="edit.owner_name"></div>
                  <div class="field"><label>Owner email</label><input class="input" type="email" name="e" [(ngModel)]="edit.email" [disabled]="d()!.tenant.status !== 'INVITED' && d()!.tenant.status !== 'INVITATION_EXPIRED'"></div>
                  <div class="field"><label>Phone</label><input class="input" name="p" [(ngModel)]="edit.phone"></div>
                  <div class="field"><label>GSTIN</label><input class="input mono" name="g" [(ngModel)]="edit.gstin" maxlength="15"></div>
                </div>
                <div class="field"><label>Address</label><input class="input" name="a" [(ngModel)]="edit.address"></div>
                <div class="form-grid">
                  <div class="field"><label>City</label><input class="input" name="c" [(ngModel)]="edit.city"></div>
                  <div class="field"><label>State</label><input class="input" name="s" [(ngModel)]="edit.state"></div>
                  <div class="field"><label>Postal code</label><input class="input" name="z" [(ngModel)]="edit.postal_code"></div>
                  <div class="field"><label>Business type</label><input class="input" name="b" [(ngModel)]="edit.business_type"></div>
                  <div class="field"><label>Initial outlet name</label><input class="input" name="io" [(ngModel)]="edit.initial_outlet_name"></div>
                  <div class="field"><label>Trial duration (days)</label><input class="input" type="number" min="1" max="365" name="t" [(ngModel)]="edit.trial_duration_days"></div>
                </div>
                @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
              </div>
              <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="showEdit.set(false)">Cancel</button>
                <button class="btn btn-primary" type="submit" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save changes' }}</button></div>
            </form>
          </div>
        </div>
      }

      @if (showSuspend()) {
        <div class="modal-overlay open" (click)="showSuspend.set(false)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Suspend tenant">
            <div class="modal-header"><h3>Suspend {{ d()?.tenant.name }}?</h3><button class="icon-btn" type="button" aria-label="Close" (click)="showSuspend.set(false)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <p class="text-sm">Everyone in this business is signed out of the app and cannot sign in until you reactivate it. Their data is kept.</p>
              <div class="field"><label>Reason (optional)</label><input class="input" [(ngModel)]="reason" maxlength="300"></div>
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="showSuspend.set(false)">Cancel</button>
              <button class="btn btn-danger" type="button" [disabled]="busy()" (click)="suspend()">Suspend</button></div>
          </div>
        </div>
      }

      @if (showPaid()) {
        <div class="modal-overlay open" (click)="showPaid.set(false)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Record payment">
            <div class="modal-header"><h3>Record payment</h3><button class="icon-btn" type="button" aria-label="Close" (click)="showPaid.set(false)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <p class="text-sm text-muted">Use this when a payment was received outside the app. The subscription becomes ACTIVE for the plan's duration.</p>
              <div class="field"><label>Plan</label><select class="select" [(ngModel)]="paidPlan">@for (p of plans(); track p.id) { <option [value]="p.code">{{ p.name }} · ₹{{ p.price }} / {{ p.duration_days }} days</option> }</select></div>
              <div class="field"><label>Payment reference (optional)</label><input class="input" [(ngModel)]="reason" maxlength="120" placeholder="UPI / bank reference"></div>
              @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="showPaid.set(false)">Cancel</button>
              <button class="btn btn-primary" type="button" [disabled]="busy() || !paidPlan" (click)="markPaid()">Activate subscription</button></div>
          </div>
        </div>
      }

      @if (invite(); as inv) {
        <div class="modal-overlay open" (click)="invite.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Invitation">
            <div class="modal-header"><h3>Invitation {{ inv.delivered ? 'sent' : 'ready' }}</h3><button class="icon-btn" type="button" aria-label="Close" (click)="invite.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              @if (inv.delivered) { <p class="text-sm" style="color:var(--success-700)">The email was sent. Any earlier link no longer works.</p> }
              @else {
                <p class="text-sm" style="color:var(--warning-700)">The email could not be delivered{{ inv.error ? ' (' + inv.error + ')' : ' because SMTP is not configured' }}. Share this single-use link with the owner (earlier links no longer work):</p>
                <input class="input mono" readonly [value]="inv.invite_url" (focus)="$any($event.target).select()">
                <button class="btn btn-secondary btn-sm" type="button" (click)="copy(inv.invite_url)">Copy link</button>
              }
              <p class="text-xs text-muted">Expires {{ inv.expires_at | date:'medium' }}.</p>
            </div>
            <div class="modal-footer"><button class="btn btn-primary" type="button" (click)="invite.set(null)">Done</button></div>
          </div>
        </div>
      }

      @if (toast()) { <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toast() }}</span></div></div> }
    </main>
  `,
  styles: [`
    .sa-dl { display: grid; grid-template-columns: 150px 1fr; gap: var(--space-2) var(--space-4); margin: var(--space-3) 0 0; font-size: var(--text-sm); }
    .sa-dl dt { color: var(--text-muted); } .sa-dl dd { margin: 0; overflow-wrap: anywhere; }
    @media (max-width: 560px) { .sa-dl { grid-template-columns: 1fr; gap: 0; } .sa-dl dd { margin-bottom: var(--space-2); } }
  `]
})
export class SaTenantDetailComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  private route = inject(ActivatedRoute);

  d = signal<any>(null);
  error = signal('');
  tab = signal<Tab>('overview');
  busy = signal(false);
  toast = signal('');
  invite = signal<InviteResult | null>(null);
  plans = signal<Plan[]>([]);
  showEdit = signal(false);
  showSuspend = signal(false);
  showPaid = signal(false);
  formError = signal('');
  edit: any = {};
  reason = '';
  paidPlan = '';
  id = '';

  tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'subscription', label: 'Subscription & trial' }, { key: 'users', label: 'Users' },
    { key: 'invitations', label: 'Invitations' }, { key: 'audit', label: 'Audit history' }
  ];
  badge = badgeClass;
  pretty = label;

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.api.plans().then(r => { this.plans.set(r.items.filter(p => p.is_active)); this.paidPlan = this.plans()[0]?.code || ''; }).catch(() => {});
    await this.load();
  }

  async load() {
    try { this.d.set(await this.api.tenant(this.id)); this.error.set(''); } catch (e: any) { this.error.set(e.message); }
  }

  private flash(msg: string) { this.toast.set(msg); setTimeout(() => this.toast.set(''), 3000); }

  private async run(action: () => Promise<void>, ok: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.formError.set('');
    try { await action(); await this.load(); this.flash(ok); } catch (e: any) { this.formError.set(e.message); this.flash(e.message); } finally { this.busy.set(false); }
  }

  openEdit() {
    const t = this.d().tenant;
    this.edit = { tenant_name: t.name, legal_business_name: t.legal_name, owner_name: t.owner_name, email: t.email, phone: t.phone, address: t.address, city: t.city,
      state: t.state, postal_code: t.postal_code, gstin: t.gstin, business_type: t.business_type, initial_outlet_name: t.initial_outlet_name || '',
      trial_duration_days: t.subscription?.trial_duration_days };
    this.formError.set('');
    this.showEdit.set(true);
  }

  async saveEdit() {
    await this.run(async () => {
      const t = this.d().tenant;
      const body: any = { ...this.edit, initial_outlet_name: (this.edit.initial_outlet_name || '').trim() || null };
      if (body.email === t.email) delete body.email;
      await this.api.updateTenant(this.id, body);
      this.showEdit.set(false);
    }, 'Tenant updated');
  }

  async suspend() { await this.run(async () => { await this.api.changeStatus(this.id, 'suspend', this.reason); this.showSuspend.set(false); this.reason = ''; }, 'Tenant suspended'); }
  async reactivate() { await this.run(async () => { await this.api.changeStatus(this.id, 'reactivate'); }, 'Tenant reactivated'); }
  async retry() { await this.run(async () => { await this.api.retryProvisioning(this.id); }, 'Setup retried'); }

  openPaid() { this.reason = ''; this.formError.set(''); this.showPaid.set(true); }
  async markPaid() { await this.run(async () => { await this.api.markPaid(this.id, this.paidPlan, this.reason); this.showPaid.set(false); }, 'Subscription activated'); }

  async resend() {
    await this.run(async () => {
      const r = this.d().invitations.length ? await this.api.resendInvitation(this.id) : await this.api.invite(this.id);
      this.invite.set(r.invitation);
    }, 'Invitation created');
  }

  async copy(text: string | null) { if (text && await copyText(text)) this.flash('Link copied'); }
}
