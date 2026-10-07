import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InviteResult, Plan, SuperAdminApiService, Tenant } from '../../services/super-admin-api.service';
import { BUSINESS_TYPES, EDITABLE_TENANT_STATUSES, INDIAN_STATES, TENANT_STATUSES, badgeClass, copyText, emptyTenantForm, label } from './sa-util';

@Component({
  selector: 'app-sa-tenants',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">Super Admin</span>
          <h1>Tenants</h1>
          <p>Every business on the platform. Add a tenant to send its owner an invitation.</p>
        </div>
        <div class="page-actions"><button class="btn btn-primary" type="button" (click)="openAdd()">+ Add Tenant</button></div>
      </div>

      <div class="card card-flush">
        <div class="card-header" style="gap:var(--space-3);flex-wrap:wrap">
          <h3>{{ total() }} tenant{{ total() === 1 ? '' : 's' }}</h3>
          <div class="row" style="gap:var(--space-2);flex-wrap:wrap">
            <select class="select" [(ngModel)]="status" (ngModelChange)="load()" aria-label="Filter by status">
              <option value="">All statuses</option>
              @for (s of statuses; track s) { <option [value]="s">{{ pretty(s) }}</option> }
            </select>
            <input class="input" style="min-width:220px" placeholder="Search name, owner, email…" [(ngModel)]="query" (ngModelChange)="onSearch()" aria-label="Search tenants">
          </div>
        </div>
        @if (error()) { <div style="padding:var(--space-4);color:var(--danger-700)" role="alert">{{ error() }}</div> }
        @if (!loading() && !tenants().length && !error()) { <div class="empty-state" style="padding:var(--space-8)">No tenants match.</div> }
        @if (tenants().length) {
          <div class="table-scroll"><table class="table">
            <thead><tr><th>Business</th><th>Owner</th><th>Status</th><th>Plan</th><th>Trial / renewal</th><th>Created</th><th></th></tr></thead>
            <tbody>
              @for (t of tenants(); track t.id) {
                <tr>
                  <td><a [routerLink]="['/super-admin/tenants', t.id]" style="font-weight:600">{{ t.name }}</a>
                    <div class="text-xs text-muted">{{ t.city }}{{ t.state ? ', ' + t.state : '' }}@if (t.is_default) { · default store }</div></td>
                  <td>{{ t.owner_name }}<div class="text-xs text-muted">{{ t.email || '—' }}</div></td>
                  <td><span [class]="badge(t.effective_status)">{{ pretty(t.effective_status) }}</span>
                    @if (t.provision_status !== 'ready' && !t.is_default) { <div class="text-xs" style="color:var(--warning-700)">Workspace {{ t.provision_status }}</div> }</td>
                  <td>{{ t.subscription?.current_plan || '—' }}</td>
                  <td>{{ endOf(t) | date:'mediumDate' }}</td>
                  <td>{{ t.created_at | date:'mediumDate' }}</td>
                  <td><button class="btn btn-secondary btn-sm" type="button" (click)="openEdit(t)">Edit</button></td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>

      @if (showAdd()) {
        <div class="modal-overlay open">
          <div class="modal modal-lg" role="dialog" aria-label="Add tenant">
            <div class="modal-header"><h3>Add Tenant</h3><button class="icon-btn" type="button" aria-label="Close" (click)="closeAdd()">✕</button></div>
            <form (submit)="$event.preventDefault(); save()">
              <div class="modal-body stack" style="gap:var(--space-4)">
                <div class="form-grid">
                  <div class="field"><label>Tenant (business) name *</label><input class="input" name="tenant_name" [(ngModel)]="form.tenant_name"></div>
                  <div class="field"><label>Legal business name *</label><input class="input" name="legal" [(ngModel)]="form.legal_business_name"></div>
                  <div class="field"><label>Owner name *</label><input class="input" name="owner" [(ngModel)]="form.owner_name"></div>
                  <div class="field"><label>Owner email * <span class="text-xs text-muted">(sign-in name)</span></label><input class="input" type="email" name="email" [(ngModel)]="form.email"></div>
                  <div class="field"><label>Phone *</label><input class="input" name="phone" [(ngModel)]="form.phone" placeholder="+91 98765 43210"></div>
                  <div class="field"><label>GSTIN *</label><input class="input mono" name="gstin" [(ngModel)]="form.gstin" maxlength="15" placeholder="29ABCDE1234F1Z5"></div>
                </div>
                <div class="field"><label>Address *</label><input class="input" name="address" [(ngModel)]="form.address"></div>
                <div class="form-grid">
                  <div class="field"><label>City *</label><input class="input" name="city" [(ngModel)]="form.city"></div>
                  <div class="field"><label>State *</label><input class="input" name="state" [(ngModel)]="form.state" list="sa-states"></div>
                  <div class="field"><label>Country *</label><input class="input" name="country" [(ngModel)]="form.country"></div>
                  <div class="field"><label>Postal code *</label><input class="input" name="postal" [(ngModel)]="form.postal_code" maxlength="10"></div>
                  <div class="field"><label>Business type *</label>
                    <select class="select" name="btype" [(ngModel)]="form.business_type">@for (b of businessTypes; track b) { <option [value]="b">{{ b }}</option> }</select>
                    @if (form.business_type === 'Other') {
                      <input class="input" name="btypeOther" [(ngModel)]="otherType" maxlength="80" placeholder="Type the business type" aria-label="Business type (other)" style="margin-top:var(--space-2)">
                    }</div>
                  <div class="field"><label>Initial outlet name</label><input class="input" name="outlet" [(ngModel)]="form.initial_outlet_name" placeholder="Used as the store name"></div>
                </div>
                <datalist id="sa-states">@for (s of states; track s) { <option [value]="s"></option> }</datalist>
                <div class="form-grid">
                  <div class="field"><label>Trial duration (days)</label><input class="input" type="number" min="1" max="365" name="trial" [(ngModel)]="form.trial_duration_days" placeholder="Default"></div>
                  <div class="field"><label>Subscription plan</label>
                    <select class="select" name="plan" [(ngModel)]="form.subscription_plan"><option value="">Trial (no plan yet)</option>
                      @for (p of plans(); track p.id) { <option [value]="p.code">{{ p.name }}</option> }</select></div>
                </div>
                <label class="checkbox-row"><input type="checkbox" name="send" [(ngModel)]="form.send_invitation"> Send the invitation email now</label>
                @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" type="button" (click)="closeAdd()">Cancel</button>
                <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Creating…' : 'Create tenant' }}</button>
              </div>
            </form>
          </div>
        </div>
      }

      @if (editing(); as e) {
        <div class="modal-overlay open" (click)="editing.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Edit tenant">
            <div class="modal-header"><h3>Edit {{ e.name }}</h3><button class="icon-btn" type="button" aria-label="Close" (click)="editing.set(null)">✕</button></div>
            <form (submit)="$event.preventDefault(); saveEdit()">
              <div class="modal-body stack" style="gap:var(--space-3)">
                <div class="field"><label>Tenant status</label>
                  <select class="select" name="estatus" [(ngModel)]="editStatus" [disabled]="e.is_default">
                    @if (!editable.includes(e.effective_status)) { <option [value]="e.effective_status" disabled>{{ pretty(e.effective_status) }} (current)</option> }
                    @for (s of editable; track s) { <option [value]="s">{{ pretty(s) }}</option> }
                  </select>
                  @if (e.is_default) { <span class="hint">The default store's status cannot be changed.</span> }
                  @else { <span class="hint">Takes effect on the tenant's next request. Suspended, Deactivated and Invited block sign-in; Expired is read-only.</span> }
                </div>
                <div class="field"><label>Subscription plan</label>
                  <select class="select" name="eplan" [(ngModel)]="editPlan">
                    <option value="">{{ e.subscription?.plan_id ? 'Keep current plan' : 'No plan (trial)' }}</option>
                    @for (p of plans(); track p.id) { <option [value]="p.code">{{ p.name }}</option> }
                  </select>
                  <span class="hint">Current: {{ e.subscription?.current_plan || '—' }}</span>
                </div>
                @if (formError()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ formError() }}</div> }
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" type="button" (click)="editing.set(null)">Cancel</button>
                <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save changes' }}</button>
              </div>
            </form>
          </div>
        </div>
      }

      @if (created(); as c) {
        <div class="modal-overlay open" (click)="created.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Tenant created">
            <div class="modal-header"><h3>Tenant created</h3><button class="icon-btn" type="button" aria-label="Close" (click)="created.set(null)">✕</button></div>
            <div class="modal-body stack" style="gap:var(--space-3)">
              <p><strong>{{ c.tenant.name }}</strong> was added as <span [class]="badge(c.tenant.status)">{{ pretty(c.tenant.status) }}</span>.</p>
              @if (!c.invitation) { <p class="text-sm text-muted">No invitation was sent. Open the tenant to send one when you are ready.</p> }
              @else if (c.invitation.delivered) { <p class="text-sm" style="color:var(--success-700)">The invitation email was sent to {{ c.tenant.email }}.</p> }
              @else {
                <p class="text-sm" style="color:var(--warning-700)">
                  The email could not be delivered{{ c.invitation.error ? ' (' + c.invitation.error + ')' : ' because SMTP is not configured on the server' }}. Share this single-use link with the owner:
                </p>
                <input class="input mono" readonly [value]="c.invitation.invite_url" (focus)="$any($event.target).select()">
                <button class="btn btn-secondary btn-sm" type="button" (click)="copy(c.invitation.invite_url)">Copy link</button>
              }
            </div>
            <div class="modal-footer">
              <a class="btn btn-secondary" [routerLink]="['/super-admin/tenants', c.tenant.id]" (click)="created.set(null)">Open tenant</a>
              <button class="btn btn-primary" type="button" (click)="created.set(null)">Done</button>
            </div>
          </div>
        </div>
      }

      @if (toast()) { <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toast() }}</span></div></div> }
    </main>
  `
})
export class SaTenantsComponent implements OnInit {
  private api = inject(SuperAdminApiService);
  private route = inject(ActivatedRoute);

  tenants = signal<Tenant[]>([]);
  total = signal(0);
  loading = signal(true);
  error = signal('');
  status = '';
  query = '';
  plans = signal<Plan[]>([]);
  showAdd = signal(false);
  saving = signal(false);
  formError = signal('');
  created = signal<{ tenant: Tenant; invitation: InviteResult | null } | null>(null);
  toast = signal('');
  editing = signal<Tenant | null>(null);
  editStatus = '';
  editPlan = '';
  editable = EDITABLE_TENANT_STATUSES;
  form = emptyTenantForm();

  statuses = TENANT_STATUSES;
  businessTypes = BUSINESS_TYPES;
  otherType = '';                          // what is typed when "Other" is picked
  states = INDIAN_STATES;
  badge = badgeClass;
  pretty = label;
  private searchTimer: any;

  async ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    this.status = q.get('status') || '';
    this.api.plans().then(r => this.plans.set(r.items.filter(p => p.is_active))).catch(() => {});
    await this.load();
    if (q.get('add')) this.openAdd();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.api.tenants(this.status, this.query.trim());
      this.tenants.set(r.items);
      this.total.set(r.total);
    } catch (e: any) { this.error.set(e.message); } finally { this.loading.set(false); }
  }

  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  endOf(t: Tenant): string | null {
    const s = t.subscription;
    if (!s) return null;
    return t.effective_status === 'TRIAL' || t.effective_status === 'EXPIRED' && !s.subscription_end_date ? s.trial_end_date : s.subscription_end_date;
  }

  openEdit(t: Tenant) {
    this.editStatus = t.effective_status;
    this.editPlan = '';
    this.formError.set('');
    this.editing.set(t);
  }

  async saveEdit() {
    const t = this.editing();
    if (!t || this.saving()) return;
    const body: { status?: string; plan_code?: string } = {};
    if (!t.is_default && this.editStatus && this.editStatus !== t.effective_status) body.status = this.editStatus;
    if (this.editPlan) body.plan_code = this.editPlan;
    if (!body.status && !body.plan_code) { this.editing.set(null); return; }
    this.saving.set(true);
    this.formError.set('');
    try {
      await this.api.updateTenantAdmin(t.id, body);
      this.editing.set(null);
      this.toast.set('Tenant updated'); setTimeout(() => this.toast.set(''), 2500);
      await this.load();
    } catch (e: any) { this.formError.set(e.message); } finally { this.saving.set(false); }
  }

  openAdd() { this.form = emptyTenantForm(); this.otherType = ''; this.formError.set(''); this.showAdd.set(true); }
  closeAdd() { this.showAdd.set(false); }

  async save() {
    if (this.saving()) return;
    this.formError.set('');
    const f = this.form;
    const businessType = f.business_type === 'Other' ? this.otherType.trim() : f.business_type;
    if (f.business_type === 'Other' && businessType.length < 2) { this.formError.set('Type the business type (at least 2 characters).'); return; }
    this.saving.set(true);
    try {
      const res = await this.api.createTenant({
        ...f, business_type: businessType, initial_outlet_name: f.initial_outlet_name.trim() || null, subscription_plan: f.subscription_plan || null,
        trial_duration_days: f.trial_duration_days || null
      });
      this.showAdd.set(false);
      this.created.set(res);
      await this.load();
    } catch (e: any) { this.formError.set(e.message); } finally { this.saving.set(false); }
  }

  async copy(text: string | null) {
    if (text && await copyText(text)) { this.toast.set('Link copied'); setTimeout(() => this.toast.set(''), 2500); }
  }
}
