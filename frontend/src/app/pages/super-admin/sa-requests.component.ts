import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InviteResult, Plan, SuperAdminApiService } from '../../services/super-admin-api.service';
import { badgeClass, copyText, label } from './sa-util';

@Component({
  selector: 'app-sa-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">Super Admin</span>
          <h1>Tenant Requests</h1>
          <p>Businesses that asked to join (from the registration website). Approving creates the tenant and sends its invitation.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--space-5)">
        <div class="field">
          <label>Public registration link <span class="text-xs text-muted">(share it with a business: they fill in the Add Tenant details and the request appears below as Pending approval)</span></label>
          <div class="row" style="gap:var(--space-2);flex-wrap:wrap">
            <input class="input mono" style="flex:1;min-width:240px" readonly [value]="registerUrl" (focus)="$any($event.target).select()" aria-label="Public registration link">
            <button class="btn btn-secondary" type="button" (click)="copy(registerUrl)">Copy link</button>
            <a class="btn btn-secondary" [href]="registerUrl" target="_blank" rel="noopener">Open</a>
          </div>
        </div>
      </div>

      <div class="card card-flush">
        <div class="card-header">
          <h3>{{ total() }} request{{ total() === 1 ? '' : 's' }}</h3>
          <select class="select" [(ngModel)]="status" (ngModelChange)="load()" aria-label="Filter by status">
            <option value="">All</option><option value="PENDING_APPROVAL">Pending approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
          </select>
        </div>
        @if (error()) { <div style="padding:var(--space-4);color:var(--danger-700)" role="alert">{{ error() }}</div> }
        @if (!loading() && !items().length && !error()) { <div class="empty-state" style="padding:var(--space-8)">No requests.</div> }
        @if (items().length) {
          <div class="table-scroll"><table class="table">
            <thead><tr><th>Business</th><th>Owner</th><th>Location</th><th>Received</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (r of items(); track r.id) {
                <tr>
                  <td><strong>{{ r.tenant_name }}</strong><div class="text-xs text-muted">{{ r.business_type }} · GSTIN {{ r.gstin }}</div></td>
                  <td>{{ r.owner_name }}<div class="text-xs text-muted">{{ r.email }} · {{ r.phone }}</div></td>
                  <td>{{ r.city }}, {{ r.state }}</td>
                  <td>{{ r.created_at | date:'medium' }}</td>
                  <td><span [class]="badge(r.status)">{{ pretty(r.status) }}</span>
                    @if (r.reject_reason) { <div class="text-xs text-muted">{{ r.reject_reason }}</div> }</td>
                  <td style="white-space:nowrap">
                    @if (r.status === 'PENDING_APPROVAL') {
                      <button class="btn btn-primary btn-sm" type="button" (click)="openApprove(r)">Approve</button>
                      <button class="btn btn-secondary btn-sm" type="button" (click)="openReject(r)">Reject</button>
                    } @else if (r.tenant_id) { <a class="btn btn-secondary btn-sm" [routerLink]="['/super-admin/tenants', r.tenant_id]">View tenant</a> }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>

      @if (approving(); as r) {
        <div class="modal-overlay open" (click)="approving.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Approve request">
            <div class="modal-header"><h3>Approve {{ r.tenant_name }}</h3><button class="icon-btn" type="button" aria-label="Close" (click)="approving.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <p class="text-sm text-muted">A tenant is created and an invitation is sent to {{ r.email }}.</p>
              <div class="form-grid">
                <div class="field"><label>Trial duration (days) *</label><input class="input" type="number" min="1" max="365" [(ngModel)]="trialDays"></div>
                <div class="field"><label>Plan *</label><select class="select" [(ngModel)]="plan">
                  @for (p of plans(); track p.id) { <option [value]="p.code">{{ p.name }}</option> }</select></div>
              </div>
              @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="approving.set(null)">Cancel</button>
              <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="approve()">{{ busy() ? 'Approving…' : 'Approve & invite' }}</button></div>
          </div>
        </div>
      }

      @if (rejecting(); as r) {
        <div class="modal-overlay open" (click)="rejecting.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Reject request">
            <div class="modal-header"><h3>Reject {{ r.tenant_name }}?</h3><button class="icon-btn" type="button" aria-label="Close" (click)="rejecting.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <div class="field"><label>Reason (shared with the applicant)</label><input class="input" [(ngModel)]="reason" maxlength="300"></div>
              @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" type="button" (click)="rejecting.set(null)">Cancel</button>
              <button class="btn btn-danger" type="button" [disabled]="busy()" (click)="reject()">Reject request</button></div>
          </div>
        </div>
      }

      @if (invite(); as inv) {
        <div class="modal-overlay open" (click)="invite.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Invitation">
            <div class="modal-header"><h3>Request approved</h3><button class="icon-btn" type="button" aria-label="Close" (click)="invite.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              @if (inv.delivered) { <p class="text-sm" style="color:var(--success-700)">The invitation email was sent.</p> }
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
export class SaRequestsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  items = signal<any[]>([]);
  total = signal(0);
  loading = signal(true);
  error = signal('');
  status = 'PENDING_APPROVAL';
  plans = signal<Plan[]>([]);
  approving = signal<any>(null);
  rejecting = signal<any>(null);
  invite = signal<InviteResult | null>(null);
  busy = signal(false);
  formError = signal('');
  toast = signal('');
  trialDays: number | null = null;
  defaultTrialDays = 14;
  registerUrl = `${window.location.origin}/register`;
  plan = '';
  reason = '';
  badge = badgeClass;
  pretty = label;

  async ngOnInit() {
    this.api.plans().then(r => this.plans.set(r.items.filter(p => p.is_active))).catch(() => {});
    this.api.settings().then(s => { if (s?.default_trial_days) this.defaultTrialDays = s.default_trial_days; if (s?.frontend_base_url) this.registerUrl = `${String(s.frontend_base_url).replace(/\/+$/, '')}/register`; }).catch(() => {});
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try { const r = await this.api.requests(this.status); this.items.set(r.items); this.total.set(r.total); this.error.set(''); }
    catch (e: any) { this.error.set(e.message); } finally { this.loading.set(false); }
  }

  openApprove(r: any) { this.trialDays = this.defaultTrialDays; this.plan = this.plans()[0]?.code || ''; this.formError.set(''); this.approving.set(r); }
  openReject(r: any) { this.reason = ''; this.formError.set(''); this.rejecting.set(r); }

  async approve() {
    if (this.busy()) return;
    if (!this.trialDays || this.trialDays < 1 || !this.plan) { this.formError.set('Choose the trial duration and the plan for this business.'); return; }
    this.busy.set(true);
    try {
      const res = await this.api.approveRequest(this.approving().id, this.trialDays, this.plan || null);
      this.approving.set(null);
      this.invite.set(res.invitation);
      await this.load();
    } catch (e: any) { this.formError.set(e.message); } finally { this.busy.set(false); }
  }

  async reject() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.rejectRequest(this.rejecting().id, this.reason);
      this.rejecting.set(null);
      this.toast.set('Request rejected'); setTimeout(() => this.toast.set(''), 3000);
      await this.load();
    } catch (e: any) { this.formError.set(e.message); } finally { this.busy.set(false); }
  }

  async copy(text: string | null) { if (text && await copyText(text)) { this.toast.set('Link copied'); setTimeout(() => this.toast.set(''), 2500); } }
}
