import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { TopbarComponent } from './components/topbar/topbar.component';
import { LockOverlayComponent } from './components/lock-overlay/lock-overlay.component';
import { SaSidebarComponent } from './components/sa-sidebar/sa-sidebar.component';
import { AuthService } from './services/auth.service';
import { ApiService } from './services/api.service';
import { AiChatbotComponent } from './components/ai-chatbot/ai-chatbot.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, SaSidebarComponent, TopbarComponent, LockOverlayComponent, AiChatbotComponent],
  template: `
    @if (isPublicRoute()) {
      <router-outlet></router-outlet>
    } @else {
      <div class="app-shell">
        @if (auth.isSuperAdmin()) { <app-sa-sidebar></app-sa-sidebar> } @else { <app-sidebar></app-sidebar> }
        <app-topbar (lockTrigger)="lockScreen()"></app-topbar>
        <router-outlet></router-outlet>
      </div>
      @if (!auth.isSuperAdmin()) {
        <app-ai-chatbot></app-ai-chatbot>
        <app-lock-overlay [isOpen]="isLocked" (unlocked)="unlockScreen()"></app-lock-overlay>
      }
    }
  `
})
export class AppComponent implements OnInit, OnDestroy {
  router = inject(Router);
  auth = inject(AuthService);
  private api = inject(ApiService);
  isLocked = false;
  private idleTimer: any = null;

  /** Pages that are shown without the application shell (sign-in and the emailed invitation / reset links). */
  isPublicRoute(): boolean {
    const url = this.router.url;
    return url.includes('/login') || url.startsWith('/register') || url.includes('/accept-invitation') || url.includes('/reset-password');
  }

  ngOnInit() {
    this.resetIdleTimer();
    this.refreshAccess();
    // an Admin may change this user's access while they are signed in: re-read it as they move around (at most every 30 seconds)
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.refreshAccess());
  }

  private lastAccessCheck = 0;

  private refreshAccess() {
    if (!this.auth.isAuthenticated() || this.auth.isSuperAdmin() || this.isPublicRoute()) return;
    if (Date.now() - this.lastAccessCheck < 30000) return;
    this.lastAccessCheck = Date.now();
    void this.api.refreshAccess();
  }

  ngOnDestroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  @HostListener('window:mousemove')
  @HostListener('window:keydown')
  @HostListener('window:click')
  @HostListener('window:touchstart')
  onUserActivity() {
    if (!this.isLocked && !this.isPublicRoute() && !this.auth.isSuperAdmin()) {
      this.resetIdleTimer();
    }
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.isPublicRoute() || this.isLocked || this.auth.isSuperAdmin()) return;

    const timeoutSeconds = this.auth.getAutoLockTimeoutSeconds();
    this.idleTimer = setTimeout(() => {
      this.lockScreen();
    }, timeoutSeconds * 1000);
  }

  lockScreen() {
    this.isLocked = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  unlockScreen() {
    this.isLocked = false;
    this.resetIdleTimer();
  }
}
