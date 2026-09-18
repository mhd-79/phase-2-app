import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../../core/services/auth.service";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--color-bg)">
      <div class="card" style="width:100%;max-width:400px;padding:32px;box-shadow:var(--shadow-lg)">
        <div style="text-align:center;margin-bottom:24px">
          <div class="logo-mark" style="margin:0 auto 12px auto;width:48px;height:48px;font-size:20px">GM</div>
          <h2>Okuto Mart POS</h2>
          <p class="text-sm text-muted">Phase 1 &middot; Cashier &amp; Manager Login</p>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:20px">
          <div *ngFor="let u of auth.users()" 
               (click)="selectedUser = u"
               [style.border-color]="selectedUser.id === u.id ? 'var(--color-primary)' : 'var(--color-border)'"
               style="flex:1;padding:12px 8px;border:2px solid;border-radius:var(--radius-md);text-align:center;cursor:pointer;background:var(--color-surface)">
            <div class="avatar" style="margin:0 auto 6px auto">{{ u.initials }}</div>
            <div style="font-weight:600;font-size:13px">{{ u.fullName }}</div>
            <div class="text-xs text-muted">{{ u.role | uppercase }}</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Enter 4-Digit Security PIN</label>
          <input type="password" class="form-input mono" [(ngModel)]="pin" maxlength="6" placeholder="••••" style="text-align:center;font-size:24px;letter-spacing:8px" (keyup.enter)="login()">
        </div>

        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:20px">
          <button *ngFor="let digit of [1,2,3,4,5,6,7,8,9]" type="button" class="btn btn-secondary" (click)="pressDigit(digit.toString())" style="font-size:18px;padding:12px">{{ digit }}</button>
          <button type="button" class="btn btn-ghost" (click)="clearPin()" style="font-size:13px">Clear</button>
          <button type="button" class="btn btn-secondary" (click)="pressDigit('0')" style="font-size:18px;padding:12px">0</button>
          <button type="button" class="btn btn-ghost" (click)="backspace()" style="font-size:16px">⌫</button>
        </div>

        <button type="button" class="btn btn-primary" (click)="login()" style="width:100%;padding:12px;font-size:16px">Open Counter / Login</button>
        
        <div class="text-xs text-muted" style="text-align:center;margin-top:16px">
          Default Cashier PIN: <span class="mono">1234</span> &middot; Admin: <span class="mono">9999</span>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  auth = inject(AuthService);
  router = inject(Router);

  selectedUser = this.auth.users()[0];
  pin = "";

  pressDigit(d: string): void {
    if (this.pin.length < 6) this.pin += d;
  }

  clearPin(): void {
    this.pin = "";
  }

  backspace(): void {
    this.pin = this.pin.slice(0, -1);
  }

  login(): void {
    const res = this.auth.loginWithPin(this.pin);
    if (res.success) {
      this.router.navigate(["/pos"]);
    } else {
      alert(res.message || "Invalid PIN");
      this.pin = "";
    }
  }
}
