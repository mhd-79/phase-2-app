import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TenantSubscriptionService } from '../../services/tenant-subscription.service';
import { Plan } from '../../services/super-admin-api.service';

/** "Platform subscription" card in Store Settings: the business's trial / plan status and the plans it can move to. */
@Component({
  selector: 'app-platform-subscription-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="card" style="max-width:720px;margin-top:var(--space-6)">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:var(--space-3);flex-wrap:wrap">
          <div>
            <h3>Platform subscription</h3>
            <p class="text-sm text-muted" style="margin-bottom:var(--space-3)">Your OKUTO Billing &amp; POS plan.</p>
          </div>
          @if (status(); as s) {
            <span class="badge" [class.badge-success]="s.status === 'ACTIVE'" [class.badge-info]="s.status === 'TRIAL'" [class.badge-warning]="s.status === 'EXPIRED'">{{ s.status === 'ACTIVE' ? 'Active' : s.status === 'TRIAL' ? 'Trial' : 'Expired' }}</span>
          }
        </div>

        @if (status(); as s) {
          @if (s.status === 'TRIAL') {
            <p class="text-sm">Your trial ends on <strong>{{ s.trial_end_date | date:'mediumDate' }}</strong> ({{ s.days_left }} day{{ s.days_left === 1 ? '' : 's' }} left). Choose a plan any time to keep going without interruption.</p>
          } @else if (s.status === 'ACTIVE') {
            <p class="text-sm">You are on <strong>{{ s.current_plan }}</strong> until <strong>{{ s.subscription_end_date | date:'mediumDate' }}</strong>@if (s.days_left !== null) { ({{ s.days_left }} days left) }.</p>
          } @else {
            <p class="text-sm" style="color:var(--warning-700)"><strong>Your {{ s.subscription_end_date ? 'subscription' : 'trial' }} has expired.</strong>
              @if (s.expired_policy === 'readonly') { You can still view your data, but changes are paused until you choose a plan. }
              @else { Choose a plan to continue. }</p>
          }

          <div class="stack" style="gap:var(--space-2);margin-top:var(--space-4)">
            @for (p of plans(); track p.id) {
              <div class="row" style="justify-content:space-between;align-items:center;gap:var(--space-3);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3);flex-wrap:wrap"
                   [style.border-color]="p.name === s.current_plan && s.status === 'ACTIVE' ? 'var(--primary)' : ''">
                <div>
                  <strong>{{ p.name }}</strong> <span class="text-muted">· ₹{{ p.price }} / {{ p.duration_days }} days</span>
                  <div class="text-xs text-muted">{{ p.max_users ? 'Up to ' + p.max_users + ' users' : 'Unlimited users' }} · {{ p.ai_enabled ? 'AI assistant' : 'No AI assistant' }}{{ p.description ? ' · ' + p.description : '' }}</div>
                </div>
                <button class="btn btn-secondary btn-sm" type="button" [disabled]="busy()" (click)="choose(p)">{{ s.status === 'ACTIVE' && p.name === s.current_plan ? 'Renew' : 'Choose plan' }}</button>
              </div>
            }
          </div>
        } @else {
          <p class="text-sm text-muted">Loading…</p>
        }
        @if (message()) { <p class="text-sm" style="margin-top:var(--space-3);color:var(--success-700)" role="status">{{ message() }}</p> }
        @if (error()) { <p class="text-sm" style="margin-top:var(--space-3);color:var(--danger-700)" role="alert">{{ error() }}</p> }
      </div>
    }
  `
})
export class PlatformSubscriptionCardComponent implements OnInit {
  private svc = inject(TenantSubscriptionService);
  status = this.svc.status;
  plans = signal<Plan[]>([]);
  busy = signal(false);
  message = signal('');
  error = signal('');
  visible = computed(() => this.svc.appliesToUser());

  async ngOnInit() {
    if (!this.visible()) return;
    await this.svc.refresh();
    try { this.plans.set(await this.svc.plans()); } catch { this.error.set('Could not load the available plans.'); }
  }

  async choose(plan: Plan) {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(''); this.error.set('');
    try {
      const r = await this.svc.checkout(plan.code);
      this.message.set(r.message);
    } catch (e: any) { this.error.set(e.message); } finally { this.busy.set(false); }
  }
}
