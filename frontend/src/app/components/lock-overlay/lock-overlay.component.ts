import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-lock-overlay',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="lock-overlay" [class.open]="isOpen">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
      <h2>Screen Locked</h2>
      <p class="text-sm" style="color:var(--slate-400)">Idle timeout reached. Re-enter your {{ usesPassword() ? 'password' : 'PIN' }} to continue as {{ auth.currentUser().fullName }}.</p>
      <input class="input input-lg" type="password" [attr.maxlength]="usesPassword() ? 128 : 6" [placeholder]="usesPassword() ? 'Password' : '••••'" [(ngModel)]="pin" (keyup.enter)="unlock()" style="max-width:220px;text-align:center;background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.2);color:#fff">
      @if (errorMsg) {
        <div class="text-xs" style="color:var(--danger-500);margin-top:var(--space-2)">{{ errorMsg }}</div>
      }
      <button class="btn btn-primary btn-lg" style="margin-top:var(--space-4)" (click)="unlock()">Unlock</button>
    </div>
  `
})
export class LockOverlayComponent {
  @Input() isOpen = false;
  @Output() unlocked = new EventEmitter<void>();
  auth = inject(AuthService);
  api = inject(ApiService);
  pin = '';
  errorMsg: string | null = null;

  /** Business owners (email + password sign-in) have no PIN. */
  usesPassword(): boolean {
    return this.auth.currentUser().username.includes('@');
  }

  async unlock() {
    this.errorMsg = null;
    if (this.usesPassword() ? this.pin.length < 1 : this.pin.length < 4) {
      this.errorMsg = this.usesPassword() ? 'Enter your password to unlock' : 'Enter your 4-digit PIN to unlock';
      return;
    }

    const isValid = await this.api.verifyPin(this.pin);
    if (isValid) {
      this.pin = '';
      this.errorMsg = null;
      this.unlocked.emit();
    } else {
      this.errorMsg = this.usesPassword() ? 'Incorrect password. Please try again.' : 'Incorrect PIN. Please try again.';
    }
  }
}
