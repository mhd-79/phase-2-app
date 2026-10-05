import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AiChatbotService, ChatAuthError } from './ai-chatbot.service';
import { environment } from '../../../environments/environment';

/** "OKUTO IQ" add-on card for Store Settings: status, activate / renew and remove. Phase 2 Admins only. */
@Component({
  selector: 'app-okuto-iq-subscription-card',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="card" style="max-width:720px;margin-top:var(--space-6)">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:var(--space-3);flex-wrap:wrap">
          <div>
            <h3>OKUTO IQ Subscription</h3>
            <p class="text-sm text-muted" style="margin-bottom:var(--space-4)">AI business assistant add-on. It answers questions from your live sales, stock and vendor data using a local AI model.</p>
          </div>
          @if (sub(); as s) {
            <span class="badge" [class.badge-success]="s.state === 'active'" [class.badge-warning]="s.state === 'expired'" [class.badge-neutral]="s.state === 'none'">
              {{ s.state === 'active' ? 'Active' : s.state === 'expired' ? 'Expired' : 'Not subscribed' }}
            </span>
          }
        </div>

        @let s = sub();
        @if (loadError()) {
          <p class="text-sm" style="color:var(--danger-700)" role="alert">{{ loadError() }}</p>
        } @else if (s) {
          @if (s.state === 'active') {
            <p class="text-sm">Active until <strong>{{ fmt(s.expires_at) }}</strong> ({{ s.days_left }} day{{ s.days_left === 1 ? '' : 's' }} left).</p>
          } @else if (s.state === 'expired') {
            <p class="text-sm">Your subscription expired on <strong>{{ fmt(s.expires_at) }}</strong>. Renew to use OKUTO IQ again.</p>
          } @else {
            <p class="text-sm">OKUTO IQ is not active. Activate it to unlock the assistant for {{ s.period_days }} days. Online payment is not available yet.</p>
          }

          <div class="row" style="margin-top:var(--space-4);gap:var(--space-3);flex-wrap:wrap">
            <button class="btn btn-primary" type="button" (click)="activate()" [disabled]="busy()">
              {{ s.state === 'none' ? 'Activate OKUTO IQ' : (s.state === 'expired' ? 'Renew OKUTO IQ' : 'Extend by ' + s.period_days + ' days') }}
            </button>
            @if (s.state !== 'none') {
              @if (!confirming()) {
                <button class="btn btn-secondary" type="button" (click)="confirming.set(true)" [disabled]="busy()">Remove subscription</button>
              } @else {
                <button class="btn btn-danger" type="button" (click)="remove()" [disabled]="busy()">Yes, remove OKUTO IQ</button>
                <button class="btn btn-ghost" type="button" (click)="confirming.set(false)" [disabled]="busy()">Cancel</button>
              }
            }
          </div>
          @if (confirming()) {
            <p class="text-sm text-muted" style="margin-top:var(--space-3)">Removing only switches the OKUTO IQ assistant off. Your sales, stock, vendors, purchase orders and every other feature stay exactly as they are.</p>
          }
        } @else {
          <p class="text-sm text-muted">Loading…</p>
        }
        @if (error()) { <p class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3)" role="alert">{{ error() }}</p> }
      </div>
    }
  `
})
export class OkutoIqSubscriptionCardComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(AiChatbotService);

  sub = this.api.subscription;
  busy = signal(false);
  confirming = signal(false);
  error = signal('');
  loadError = signal('');
  private moduleOn = signal(true);

  visible = computed(() => environment.aiChatbotEnabled && this.auth.isAdmin() && this.auth.hasPhase2() && this.moduleOn());

  async ngOnInit() {
    if (!this.visible()) return;
    try {
      const s = await this.api.refresh();
      this.moduleOn.set(s.enabled);
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 403) this.moduleOn.set(false);
      else if (err?.status && typeof err?.error?.detail === 'string') this.loadError.set(err.error.detail);   // e.g. 503: run prisma generate / db push
      else this.loadError.set('Could not reach the server. Check that the backend is running.');
    }
  }

  fmt(iso?: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  }

  async activate() { await this.run(() => this.api.activate()); }

  async remove() {
    await this.run(() => this.api.removeSubscription());
    this.confirming.set(false);
  }

  private async run(action: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (err: any) {
      this.error.set(err instanceof ChatAuthError ? err.message : (err?.message || 'The change could not be saved.'));
    } finally {
      this.busy.set(false);
    }
  }
}
