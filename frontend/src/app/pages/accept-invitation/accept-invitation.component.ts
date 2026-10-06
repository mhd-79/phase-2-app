import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

/** Public page opened from the invitation email (and from the password-reset email): verify the link, choose a password. */
@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [FormsModule],
  styles: [`
    .ai-wrap { min-height: 100vh; display:flex; align-items:center; justify-content:center; padding: var(--space-6); background: linear-gradient(160deg, var(--indigo-700), var(--slate-900) 70%); }
    .ai-card { width:100%; max-width:420px; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: var(--space-8); }
    .ai-logo { width:44px; height:44px; border-radius: var(--radius-md); background: var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; margin-bottom: var(--space-4); }
    .ai-rules { margin: var(--space-2) 0 0; padding-left: 18px; font-size: var(--text-xs); color: var(--text-muted); }
  `],
  template: `
    <div class="ai-wrap">
      <div class="ai-card">
        <div class="ai-logo">OK</div>
        @switch (state()) {
          @case ('loading') { <p class="text-muted">Checking your link…</p> }
          @case ('invalid') {
            <h2 style="margin-bottom:var(--space-2)">This link can't be used</h2>
            <p class="text-sm" style="color:var(--danger-700)" role="alert">{{ message() }}</p>
            <button type="button" class="btn btn-secondary btn-block" style="margin-top:var(--space-5)" (click)="goToLogin()">Go to sign in</button>
          }
          @case ('form') {
            <h2 style="margin-bottom:var(--space-1)">{{ isReset() ? 'Choose a new password' : 'Activate your business account' }}</h2>
            <p class="text-muted text-sm" style="margin-bottom:var(--space-5)">
              @if (isReset()) { Set a new password for <strong>{{ info()?.email }}</strong>. }
              @else { Welcome, {{ info()?.owner_name }}. Create a password for <strong>{{ info()?.business_name }}</strong>. }
            </p>
            <div class="field">
              <label>Email</label>
              <input class="input" [value]="info()?.email" disabled>
            </div>
            <div class="field" style="margin-top:var(--space-4)">
              <label for="newPassword">Password</label>
              <input class="input" id="newPassword" type="password" autocomplete="new-password" [(ngModel)]="password" maxlength="128">
              <ul class="ai-rules"><li>At least 8 characters</li><li>At least one letter and one number</li></ul>
            </div>
            <div class="field" style="margin-top:var(--space-4)">
              <label for="confirmPassword">Confirm password</label>
              <input class="input" id="confirmPassword" type="password" autocomplete="new-password" [(ngModel)]="confirm" maxlength="128" (keyup.enter)="submit()">
            </div>
            @if (message()) { <p class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3)" role="alert">{{ message() }}</p> }
            <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:var(--space-5)" [disabled]="busy()" (click)="submit()">
              {{ busy() ? 'Please wait…' : (isReset() ? 'Save password' : 'Activate account') }}
            </button>
          }
          @case ('done') {
            <h2 style="margin-bottom:var(--space-2)">{{ isReset() ? 'Password updated' : 'Your account is ready' }}</h2>
            <p class="text-sm text-muted">{{ isReset() ? 'You can now sign in with your new password.' : 'Your free trial has started. Sign in with your email and the password you just created.' }}</p>
            <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:var(--space-5)" (click)="goToLogin()">Go to sign in</button>
          }
        }
      </div>
    </div>
  `
})
export class AcceptInvitationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);

  state = signal<'loading' | 'invalid' | 'form' | 'done'>('loading');
  info = signal<{ email: string; owner_name: string; business_name: string; purpose: string } | null>(null);
  message = signal('');
  busy = signal(false);
  password = '';
  confirm = '';
  private token = '';

  isReset = () => this.info()?.purpose === 'password_reset';

  async ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    try {
      this.info.set(await this.api.getInvitation(this.token));
      this.state.set('form');
    } catch (err: any) {
      this.message.set(err?.message || 'This link is not valid.');
      this.state.set('invalid');
    }
  }

  async submit() {
    if (this.busy()) return;
    this.message.set('');
    if (this.password !== this.confirm) { this.message.set('The two passwords do not match.'); return; }
    this.busy.set(true);
    try {
      await this.api.acceptInvitation(this.token, this.password, this.confirm);
      this.password = this.confirm = '';
      this.state.set('done');
    } catch (err: any) {
      this.message.set(err?.message || 'Could not save your password. Please try again.');
      if (err?.code && err.code !== 'preparing') this.state.set('invalid');      // used / expired / revoked: the form can no longer work
    } finally {
      this.busy.set(false);
    }
  }

  goToLogin() { this.router.navigate(['/login']); }
}
