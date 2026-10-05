import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { TopbarComponent } from './components/topbar/topbar.component';
import { LockOverlayComponent } from './components/lock-overlay/lock-overlay.component';
import { AuthService } from './services/auth.service';
import { AiChatbotComponent } from './components/ai-chatbot/ai-chatbot.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, LockOverlayComponent, AiChatbotComponent],
  template: `
    @if (router.url.includes('/login')) {
      <router-outlet></router-outlet>
    } @else {
      <div class="app-shell">
        <app-sidebar></app-sidebar>
        <app-topbar (lockTrigger)="lockScreen()"></app-topbar>
        <router-outlet></router-outlet>
      </div>
      <app-ai-chatbot></app-ai-chatbot>
      <app-lock-overlay [isOpen]="isLocked" (unlocked)="unlockScreen()"></app-lock-overlay>
    }
  `
})
export class AppComponent implements OnInit, OnDestroy {
  router = inject(Router);
  auth = inject(AuthService);
  isLocked = false;
  private idleTimer: any = null;

  ngOnInit() {
    this.resetIdleTimer();
  }

  ngOnDestroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  @HostListener('window:mousemove')
  @HostListener('window:keydown')
  @HostListener('window:click')
  @HostListener('window:touchstart')
  onUserActivity() {
    if (!this.isLocked && !this.router.url.includes('/login')) {
      this.resetIdleTimer();
    }
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.router.url.includes('/login') || this.isLocked) return;

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
