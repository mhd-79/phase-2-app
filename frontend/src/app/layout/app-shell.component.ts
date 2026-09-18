import { Component, inject, OnInit, OnDestroy, HostListener } from "@angular/core";
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from "@angular/router";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AuthService } from "../core/services/auth.service";
import { BillingService } from "../core/services/billing.service";

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <div class="app-shell" [attr.data-role]="auth.currentUser().role">
      <!-- SIDEBAR -->
      <div class="sidebar-backdrop" *ngIf="isMobileMenuOpen" (click)="isMobileMenuOpen = false"></div>
      <aside class="sidebar" [class.mobile-open]="isMobileMenuOpen">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div>
            <div class="brand-name">Okuto Mart</div>
            <div class="brand-tag">Phase 1 &middot; Core Billing</div>
          </div>
        </div>
        <nav class="sidebar__nav">
          <div class="sidebar__section-label">Billing</div>
          <a class="nav-link" routerLink="/pos" routerLinkActive="active" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h2l2.4 12.4a2 2 0 002 1.6h8.6a2 2 0 002-1.6L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
            Billing
          </a>
          <a class="nav-link" routerLink="/hold-bills" routerLinkActive="active" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>
            Hold &amp; Recall
            <span class="badge badge-warning" *ngIf="billing.heldBills().length > 0">{{ billing.heldBills().length }}</span>
          </a>
          <a class="nav-link" routerLink="/returns" routerLinkActive="active" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 015.5 5.5v.5a5.5 5.5 0 01-5.5 5.5H11"/></svg>
            Returns &amp; Refunds
          </a>

          <div class="sidebar__section-label" *ngIf="auth.isAdmin()">Inventory &amp; Pricing</div>
          <a class="nav-link" routerLink="/stock" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            Items &amp; Stock
          </a>
          <a class="nav-link" routerLink="/stock-upload" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Stock Upload (CSV)
          </a>
          <a class="nav-link" routerLink="/discounts" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="2"/><circle cx="15" cy="15" r="2"/><line x1="16" y1="8" x2="8" y2="16"/></svg>
            Discounts &amp; Rules
          </a>

          <div class="sidebar__section-label" *ngIf="auth.isAdmin()">Management</div>
          <a class="nav-link" routerLink="/reports" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            Reports &amp; Z-Report
          </a>
          <a class="nav-link" routerLink="/users" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            Users &amp; Roles
          </a>
          <a class="nav-link" routerLink="/store-settings" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Store Settings
          </a>
          <a class="nav-link" routerLink="/tax-settings" routerLinkActive="active" *ngIf="auth.isAdmin()" (click)="isMobileMenuOpen = false">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Tax Configuration
          </a>
        </nav>

        <div class="sidebar__footer">
          <div class="user-chip" style="margin-top:8px">
            <div class="avatar">{{ auth.currentUser().initials }}</div>
            <div>
              <div class="user-chip-name">{{ auth.currentUser().fullName }}</div>
              <div class="user-chip-sub">{{ auth.currentUser().subText }}</div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" (click)="auth.lockScreen()" title="Lock Screen" style="margin-left:auto;padding:4px 8px">
              🔒
            </button>
          </div>
        </div>
      </aside>

      <!-- MAIN CONTENT -->
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      <!-- LOCK SCREEN OVERLAY -->
      <div class="modal-overlay" [class.open]="auth.isLocked()" id="lockOverlay">
        <div class="modal" style="max-width:340px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🔒</div>
          <h3 style="margin-bottom:4px">Terminal Locked</h3>
          <p class="text-sm text-muted" style="margin-bottom:4px">{{ auth.currentUser().fullName }} ({{ auth.currentUser().role | uppercase }})</p>
          <p class="text-xs text-subtle" style="margin-bottom:16px">Auto-lock active ({{ auth.currentUser().autoLockMinutes || 15 }} min idle timeout)</p>
          <div class="form-group" style="text-align:left">
            <label class="form-label">Enter PIN to Unlock</label>
            <input type="password" class="form-input mono" [(ngModel)]="lockPin" (keyup.enter)="unlock()" placeholder="••••" style="text-align:center;font-size:20px;letter-spacing:6px">
          </div>
          <div class="modal-actions" style="justify-content:center;margin-top:16px">
            <button type="button" class="btn btn-primary" (click)="unlock()" style="width:100%">Unlock Terminal</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AppShellComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  billing = inject(BillingService);
  router = inject(Router);
  isMobileMenuOpen = false;
  lockPin = "";
  private idleTimer: any = null;

  ngOnInit(): void {
    this.resetIdleTimer();
  }

  ngOnDestroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  @HostListener('document:mousemove')
  @HostListener('document:keydown')
  @HostListener('document:click')
  @HostListener('document:touchstart')
  @HostListener('document:scroll')
  onUserActivity(): void {
    if (!this.auth.isLocked()) {
      this.resetIdleTimer();
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const lockMins = this.auth.currentUser()?.autoLockMinutes || 15;
    const timeoutMs = lockMins * 60 * 1000;
    this.idleTimer = setTimeout(() => {
      this.auth.lockScreen();
    }, timeoutMs);
  }

  unlock(): void {
    if (this.auth.unlockScreen(this.lockPin)) {
      this.lockPin = "";
      this.resetIdleTimer();
    } else {
      alert("Invalid PIN entered");
    }
  }
}
