import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-shell">
      <div class="login-brand">
        <div>
          <div class="logo-mark">OM</div>
          <h1 style="margin-top:var(--space-6)">Billing that never runs dry — now with a full buy-side workflow.</h1>
          <ul class="feature-list">
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Purchase orders, GRN &amp; vendor payables — no spreadsheets</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Batch/expiry tracking with FEFO issue for perishables</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Reorder alerts and cycle-count variance built in</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Billing counter runs fast &amp; offline</li>
          </ul>
        </div>
        <p class="text-sm" style="color:var(--slate-400)">Phase 2 &middot; Vendor &amp; Stock Maintenance &middot; Single Store</p>
      </div>

      <div class="login-panel">
        <div class="login-card">
          @if (emailMode) {
            @if (!showResetView) {
              <h2 style="margin-bottom:var(--space-1)">Business sign-in</h2>
              <p class="text-muted text-sm" style="margin-bottom:var(--space-6)">Use the email and password you created from your invitation.</p>

              <div class="field">
                <label for="emailInput">Email</label>
                <input class="input" id="emailInput" type="email" autocomplete="username" [(ngModel)]="email" (keyup.enter)="attemptEmailLogin()" placeholder="you@business.com">
              </div>
              <div class="field" style="margin-top:var(--space-4)">
                <label for="passwordInput">Password</label>
                <input class="input" id="passwordInput" type="password" autocomplete="current-password" [(ngModel)]="password" (keyup.enter)="attemptEmailLogin()" placeholder="Password">
              </div>

              @if (errorMessage) {
                <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3);text-align:center;font-weight:500">{{ errorMessage }}</div>
              }

              <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:var(--space-5)" [disabled]="isSubmitting" (click)="attemptEmailLogin()">
                {{ isSubmitting ? 'Signing In...' : 'Sign In' }}
              </button>
              <div style="text-align:center;margin-top:var(--space-4)">
                <button type="button" class="btn btn-ghost btn-sm text-xs" style="color:var(--primary);text-decoration:underline" (click)="openReset()">Forgot password?</button>
              </div>
              <div style="text-align:center;margin-top:var(--space-2)">
                <button type="button" class="btn btn-ghost btn-sm text-xs" (click)="setEmailMode(false)">Staff sign-in with PIN</button>
              </div>
            } @else {
              <h2 style="margin-bottom:var(--space-1)">Reset your password</h2>
              <p class="text-muted text-sm" style="margin-bottom:var(--space-6)">We will email a link to choose a new password.</p>
              <div class="field">
                <label for="resetEmail">Email</label>
                <input class="input" id="resetEmail" type="email" [(ngModel)]="email" placeholder="you@business.com">
              </div>
              @if (forgotError) {
                <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3);text-align:center;font-weight:500">{{ forgotError }}</div>
              }
              @if (forgotSuccess) {
                <div class="card" style="background:var(--success-50, #f0fdf4);border:1px solid var(--success-200, #bbf7d0);color:var(--success-700, #15803d);padding:var(--space-3);margin-top:var(--space-4);border-radius:var(--radius-md);text-align:center;font-size:var(--text-sm)">{{ forgotSuccess }}</div>
              }
              <div class="row" style="gap:var(--space-3);margin-top:var(--space-6)">
                <button type="button" class="btn btn-secondary flex-1" (click)="showResetView = false">Back to Sign In</button>
                @if (!forgotSuccess) {
                  <button type="button" class="btn btn-primary flex-1" [disabled]="isSubmittingForgot" (click)="submitPasswordReset()">{{ isSubmittingForgot ? 'Sending...' : 'Send link' }}</button>
                }
              </div>
            }
          } @else if (!showForgotView) {
            <h2 style="margin-bottom:var(--space-1)">Welcome back</h2>
            <p class="text-muted text-sm" style="margin-bottom:var(--space-6)">Sign in to Okuto Mart POS</p>

            <div class="field">
              <label for="usernameInput">Username</label>
              <input class="input" id="usernameInput" [(ngModel)]="username" placeholder="Username">
            </div>

            <div style="margin-top:var(--space-4)">
              <div class="row-between" style="align-items:center;margin-bottom:var(--space-1)">
                <label class="text-sm" style="font-weight:600">Enter PIN</label>
              </div>
              <div class="pin-dots">
                <span [class.filled]="pin.length >= 1"></span>
                <span [class.filled]="pin.length >= 2"></span>
                <span [class.filled]="pin.length >= 3"></span>
                <span [class.filled]="pin.length >= 4"></span>
              </div>
              <div class="keypad">
                <button type="button" (click)="pressPin('1')">1</button>
                <button type="button" (click)="pressPin('2')">2</button>
                <button type="button" (click)="pressPin('3')">3</button>
                <button type="button" (click)="pressPin('4')">4</button>
                <button type="button" (click)="pressPin('5')">5</button>
                <button type="button" (click)="pressPin('6')">6</button>
                <button type="button" (click)="pressPin('7')">7</button>
                <button type="button" (click)="pressPin('8')">8</button>
                <button type="button" (click)="pressPin('9')">9</button>
                <button type="button" (click)="pressPin('clear')">Clear</button>
                <button type="button" (click)="pressPin('0')">0</button>
                <button type="button" (click)="pressPin('back')">⌫</button>
              </div>
            </div>

            @if (errorMessage) {
              <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3);text-align:center;font-weight:500">
                {{ errorMessage }}
              </div>
            }

            @if (infoMessage) {
              <div class="text-sm" style="color:var(--success-700);margin-top:var(--space-3);text-align:center;font-weight:500">
                {{ infoMessage }}
              </div>
            }

            <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:var(--space-5)" [disabled]="isSubmitting" (click)="attemptLogin()">
              {{ isSubmitting ? 'Signing In...' : 'Sign In' }}
            </button>

            <div style="text-align:center;margin-top:var(--space-4)">
              <button type="button" class="btn btn-ghost btn-sm text-xs" style="color:var(--primary);text-decoration:underline" (click)="openForgotPin()">
                Forgot PIN / Password?
              </button>
            </div>

            <div style="text-align:center;margin-top:var(--space-2)">
              <button type="button" class="btn btn-ghost btn-sm text-xs" (click)="setEmailMode(true)">Sign in with email &amp; password</button>
            </div>

            <p class="demo-note">Enter your registered username and 4-digit PIN.</p>
          } @else {
            <h2 style="margin-bottom:var(--space-1)">Forgot PIN / Password?</h2>
            <p class="text-muted text-sm" style="margin-bottom:var(--space-6)">Request a credential reset from the store administrator.</p>

            <div class="field">
              <label for="forgotUsername">Username</label>
              <input class="input" id="forgotUsername" [(ngModel)]="forgotUsername" placeholder="e.g. priya.k or ravi.s">
            </div>

            <div class="field" style="margin-top:var(--space-4)">
              <label for="forgotNotes">Reason / Notes (Optional)</label>
              <input class="input" id="forgotNotes" [(ngModel)]="forgotNotes" placeholder="e.g. Forgot PIN after shift change">
            </div>

            @if (forgotError) {
              <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-3);text-align:center;font-weight:500">
                {{ forgotError }}
              </div>
            }

            @if (forgotSuccess) {
              <div class="card" style="background:var(--success-50, #f0fdf4);border:1px solid var(--success-200, #bbf7d0);color:var(--success-700, #15803d);padding:var(--space-3);margin-top:var(--space-4);border-radius:var(--radius-md);text-align:center;font-size:var(--text-sm)">
                {{ forgotSuccess }}
              </div>
            }

            <div class="row" style="gap:var(--space-3);margin-top:var(--space-6)">
              <button type="button" class="btn btn-secondary flex-1" (click)="closeForgotPin()">
                Back to Sign In
              </button>
              @if (!forgotSuccess) {
                <button type="button" class="btn btn-primary flex-1" [disabled]="isSubmittingForgot" (click)="submitForgotPin()">
                  {{ isSubmittingForgot ? 'Sending...' : 'Request Reset' }}
                </button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-shell { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; background: var(--surface-dark); }
    @media (max-width: 860px) { .login-shell { grid-template-columns: 1fr; } .login-brand { display: none; } }
    .login-brand { background: linear-gradient(160deg, var(--indigo-700), var(--slate-900) 70%); color: #fff; padding: var(--space-16) var(--space-12); display: flex; flex-direction: column; justify-content: space-between; }
    .login-brand .logo-mark { width: 48px; height: 48px; border-radius: var(--radius-md); background: rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; font-weight:800; }
    .login-brand h1 { font-size: 34px; max-width: 420px; line-height: 1.2; }
    .login-brand .feature-list { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-6); }
    .login-brand .feature-list li { display: flex; gap: var(--space-3); align-items: flex-start; font-size: var(--text-sm); color: var(--slate-200); }
    .login-brand .feature-list svg { flex-shrink: 0; margin-top: 2px; color: var(--success-500); }
    .login-panel { background: var(--surface-alt); display: flex; align-items: center; justify-content: center; padding: var(--space-6); }
    .login-card { width: 100%; max-width: 380px; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: var(--space-8); }
    .pin-dots { display: flex; gap: var(--space-3); justify-content: center; margin: var(--space-5) 0; }
    .pin-dots span { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-strong); }
    .pin-dots span.filled { background: var(--primary); border-color: var(--primary); }
    .keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
    .keypad button { min-height: 52px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface-alt); font-size: var(--text-lg); font-weight: 600; cursor: pointer; }
    .keypad button:active { background: var(--slate-100); }
    .demo-note { font-size: var(--text-xs); color: var(--text-subtle); text-align: center; margin-top: var(--space-5); }
    .flex-1 { flex: 1; }
  `]
})
export class LoginComponent {
  auth = inject(AuthService);
  api = inject(ApiService);
  router = inject(Router);

  username = '';
  pin = '';
  errorMessage: string | null = null;
  infoMessage: string | null = null;
  isSubmitting = false;

  // Business accounts (multi-tenant): email + password, password reset
  emailMode = false;
  email = '';
  password = '';
  showResetView = false;

  // Forgot PIN state
  showForgotView = false;
  forgotUsername = '';
  forgotNotes = '';
  forgotError: string | null = null;
  forgotSuccess: string | null = null;
  isSubmittingForgot = false;

  pressPin(key: string) {
    if (this.isSubmitting) return;
    if (key === 'clear') this.pin = '';
    else if (key === 'back') this.pin = this.pin.slice(0, -1);
    else if (this.pin.length < 4) this.pin += key;

    if (this.pin.length === 4) {
      setTimeout(() => this.attemptLogin(), 150);
    }
  }

  async attemptLogin() {
    if (this.isSubmitting) return;

    this.errorMessage = null;
    this.infoMessage = null;

    if (!this.username.trim()) {
      this.errorMessage = 'Please enter your username';
      return;
    }
    if (this.pin.length < 4) {
      this.errorMessage = 'Enter your 4-digit PIN to continue';
      return;
    }

    this.isSubmitting = true;
    try {
      const res = await this.api.login(this.username.trim(), this.pin);
      if (res && res.access_token) {
        this.router.navigate(['/pos']);
      } else {
        this.errorMessage = 'Invalid username or PIN';
        this.pin = '';
      }
    } catch (err: any) {
      this.errorMessage = err?.status === 401
        ? (err?.error?.detail || 'Invalid username or PIN')
        : (err?.error?.detail || err?.message || 'Login failed. Please try again.');
      this.pin = '';
    } finally {
      this.isSubmitting = false;
    }
  }

  setEmailMode(on: boolean) {
    this.emailMode = on;
    this.errorMessage = null;
    this.infoMessage = null;
    this.showResetView = false;
    this.pin = '';
  }

  async attemptEmailLogin() {
    if (this.isSubmitting) return;
    this.errorMessage = null;
    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Enter your email and password';
      return;
    }
    this.isSubmitting = true;
    try {
      const res = await this.api.loginWithPassword(this.email.trim(), this.password);
      if (res && res.access_token) {
        this.router.navigate([res.role === 'super_admin' ? '/super-admin/dashboard' : '/pos']);
      }
    } catch (err: any) {
      this.errorMessage = err?.error?.detail || err?.message || 'Sign-in failed. Please try again.';
      this.password = '';
    } finally {
      this.isSubmitting = false;
    }
  }

  openReset() {
    this.showResetView = true;
    this.forgotError = null;
    this.forgotSuccess = null;
  }

  async submitPasswordReset() {
    if (this.isSubmittingForgot) return;
    this.forgotError = null;
    this.forgotSuccess = null;
    if (!this.email.trim()) {
      this.forgotError = 'Please enter your email';
      return;
    }
    this.isSubmittingForgot = true;
    try {
      this.forgotSuccess = await this.api.requestPasswordReset(this.email.trim());
    } catch (err: any) {
      this.forgotError = err?.error?.detail || 'Could not send the reset link. Please try again.';
    } finally {
      this.isSubmittingForgot = false;
    }
  }

  openForgotPin() {
    this.showForgotView = true;
    this.forgotUsername = this.username.trim();
    this.forgotNotes = '';
    this.forgotError = null;
    this.forgotSuccess = null;
  }

  closeForgotPin() {
    this.showForgotView = false;
    this.forgotError = null;
    this.forgotSuccess = null;
  }

  async submitForgotPin() {
    if (this.isSubmittingForgot) return;
    this.forgotError = null;
    this.forgotSuccess = null;

    if (!this.forgotUsername.trim()) {
      this.forgotError = 'Please enter your username';
      return;
    }

    this.isSubmittingForgot = true;
    try {
      const res = await this.api.requestForgotPin(this.forgotUsername.trim(), this.forgotNotes.trim());
      this.forgotSuccess = res?.message || 'PIN reset request submitted. Store administrator has been notified.';
    } catch (err: any) {
      this.forgotError = err?.error?.detail || err?.message || 'Failed to submit reset request. Please check username.';
    } finally {
      this.isSubmittingForgot = false;
    }
  }
}
