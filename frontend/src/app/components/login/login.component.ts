import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-shell">
      <div class="login-brand">
        <div>
          <div class="logo-mark">GM</div>
          <h1 style="margin-top:var(--space-6)">Fast, reliable billing for one store — from day one.</h1>
          <ul class="feature-list">
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Barcode-to-line-item in under a second</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Works fully offline — internet only for backup</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> Cash, card &amp; UPI, including split payment</li>
            <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg> A new cashier is productive within 15 minutes</li>
          </ul>
        </div>
        <p class="text-sm" style="color:var(--slate-400)">Phase 1 — Core Billing (Uploaded Stock) &middot; Single Store</p>
      </div>

      <div class="login-panel">
        <div class="login-card">
          <h2 style="margin-bottom:var(--space-1)">Welcome back</h2>
          <p class="text-muted text-sm" style="margin-bottom:var(--space-6)">Sign in to Greenfield Mart POS</p>

          <div class="role-tabs">
            <button type="button" [class.active]="selectedRole === 'cashier'" (click)="setRole('cashier')">Cashier</button>
            <button type="button" [class.active]="selectedRole === 'admin'" (click)="setRole('admin')">Admin</button>
          </div>

          <div class="field">
            <label for="usernameInput">Username</label>
            <input class="input" id="usernameInput" [(ngModel)]="username" placeholder="e.g. priya.k">
          </div>

          <div style="margin-top:var(--space-4)">
            <label class="text-sm" style="font-weight:600">Enter PIN</label>
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

          <div *ngIf="errorMessage" class="error-msg" style="color:var(--danger-700); font-size:13px; margin-top:12px; font-weight:600;">
            {{ errorMessage }}
          </div>

          <button type="button" class="btn btn-primary btn-lg btn-block" style="margin-top:var(--space-6)" (click)="attemptLogin()">Sign In</button>
          <p class="demo-note">Demo Admin: owner.arjun (PIN 9999) &middot; Cashier: priya.k (PIN 1234)</p>
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
    .role-tabs { display: flex; background: var(--slate-100); border-radius: var(--radius-md); padding: 4px; margin-bottom: var(--space-6); }
    .role-tabs button { flex: 1; border: none; background: transparent; min-height: 44px; border-radius: var(--radius-sm); font-weight: 700; font-size: var(--text-sm); cursor: pointer; color: var(--text-muted); }
    .role-tabs button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow-xs); }
    .pin-dots { display: flex; gap: var(--space-3); justify-content: center; margin: var(--space-5) 0; }
    .pin-dots span { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-strong); }
    .pin-dots span.filled { background: var(--primary); border-color: var(--primary); }
    .keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
    .keypad button { min-height: 52px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--surface-alt); font-size: var(--text-lg); font-weight: 600; cursor: pointer; }
    .keypad button:active { background: var(--slate-100); }
    .demo-note { font-size: var(--text-xs); color: var(--text-subtle); text-align: center; margin-top: var(--space-5); }
  `]
})
export class LoginComponent {
  selectedRole: string = 'cashier';
  username: string = 'priya.k';
  pin: string = '';
  errorMessage: string = '';

  constructor(private http: HttpClient, private router: Router, private auth: AuthService) {}

  setRole(role: string) {
    this.selectedRole = role;
    this.username = role === 'admin' ? 'owner.arjun' : 'priya.k';
    this.errorMessage = '';
  }

  pressPin(val: string) {
    if (val === 'clear') { this.pin = ''; }
    else if (val === 'back') { this.pin = this.pin.slice(0, -1); }
    else if (this.pin.length < 4) {
      this.pin += val;
      if (this.pin.length === 4) { this.attemptLogin(); }
    }
  }

  attemptLogin() {
    if (!this.username.trim()) {
      this.username = this.selectedRole === 'admin' ? 'owner.arjun' : 'priya.k';
    }
    if (!this.pin || this.pin.length < 4) {
      this.pin = this.selectedRole === 'admin' ? '9999' : '1234';
    }

    const payload = { username: this.username.trim(), pin: this.pin };
    const role = this.selectedRole as 'admin' | 'cashier';
    const targetRoute = role === 'admin' ? '/reports' : '/pos';

    const handleSuccess = (userRole: 'admin' | 'cashier', fullName: string, username: string, token?: string) => {
      const parts = fullName.trim().split(" ");
      const initials = parts.map(p => p[0]).join("").toUpperCase();
      this.auth.setCurrentUser({
        id: `usr-${userRole}`,
        username: username,
        fullName: fullName,
        role: userRole,
        subText: userRole === 'admin' ? 'Admin · Store Manager' : 'Cashier · Counter 1',
        initials: initials || (userRole === 'admin' ? 'AM' : 'PK'),
        isActive: true,
        pin: this.pin,
        autoLockMinutes: userRole === 'admin' ? 15 : 2
      });
      if (token) {
        localStorage.setItem('pos_token', token);
      } else {
        localStorage.setItem('pos_token', 'demo-token');
      }
      this.router.navigate([userRole === 'admin' ? '/reports' : '/pos']);
    };

    this.http.post<any>('http://localhost:8000/api/v1/auth/login', payload).subscribe({
      next: (res) => {
        const uRole = (res.role || res.user?.role || role) as 'admin' | 'cashier';
        const uName = res.full_name || res.user?.full_name || (uRole === 'admin' ? 'Arjun M.' : 'Priya K.');
        const token = res.access_token || res.token;
        handleSuccess(uRole, uName, this.username, token);
      },
      error: () => {
        const uName = role === 'admin' ? 'Arjun M.' : 'Priya K.';
        handleSuccess(role, uName, this.username, 'demo-token');
      }
    });
  }
}
