import { Injectable, signal } from '@angular/core';

export type UserRole = 'admin' | 'cashier';

export interface UserProfile {
  username: string;
  role: UserRole;
  fullName: string;
  subText: string;
  autoLock?: string;
  /** Admin access level: 1 = Phase 1 features only, 2 = Phase 1 + Phase 2. Missing means 2 (existing admins keep full access). */
  phase?: 1 | 2;
  /** Billing counter the user is currently working on (CashCounter.counter_name). Saved on the server. */
  activeCounter?: string | null;
}

const DEFAULT_ADMIN: UserProfile = {
  username: 'owner.arjun',
  role: 'admin',
  fullName: 'Arjun M.',
  subText: 'Admin · Store Manager',
  autoLock: '15 min'
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  token = signal<string | null>(localStorage.getItem('pos_token'));
  currentUser = signal<UserProfile>(this.loadStoredUser());
  currentRole = signal<UserRole>(this.currentUser().role);

  private loadStoredUser(): UserProfile {
    try {
      const stored = localStorage.getItem('pos_user_profile');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return DEFAULT_ADMIN;
  }

  setSession(token: string, username: string, role: string, fullName: string, subText: string, autoLock: string = '2 min', phase: number = 2, activeCounter: string | null = null) {
    const userRole = (role.toLowerCase() === 'admin' ? 'admin' : 'cashier') as UserRole;
    const profile: UserProfile = {
      username,
      role: userRole,
      fullName,
      subText,
      autoLock,
      phase: phase === 1 ? 1 : 2,
      activeCounter
    };

    this.token.set(token);
    this.currentUser.set(profile);
    this.currentRole.set(userRole);

    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user_profile', JSON.stringify(profile));
  }

  setActiveCounter(counterName: string | null) {
    const profile: UserProfile = { ...this.currentUser(), activeCounter: counterName };
    this.currentUser.set(profile);
    localStorage.setItem('pos_user_profile', JSON.stringify(profile));
  }

  logout() {
    this.token.set(null);
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user_profile');
  }

  isAuthenticated(): boolean {
    return !!this.token() || !!localStorage.getItem('pos_token') || !!localStorage.getItem('pos_user_profile');
  }

  isAdmin(): boolean {
    return this.currentRole() === 'admin';
  }

  /** True unless the signed-in user is limited to Phase 1 features. */
  hasPhase2(): boolean {
    return this.currentUser().phase !== 1;
  }

  getAutoLockTimeoutSeconds(): number {
    const lock = this.currentUser().autoLock || '2 min';
    if (lock.includes('1 min')) return 60;
    if (lock.includes('2 min')) return 120;
    if (lock.includes('5 min')) return 300;
    if (lock.includes('15 min')) return 900;
    if (lock.includes('30 min')) return 1800;
    const num = parseInt(lock, 10);
    return isNaN(num) ? 120 : num * 60;
  }
}
