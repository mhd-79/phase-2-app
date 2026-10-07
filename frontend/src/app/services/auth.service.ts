import { Injectable, signal } from '@angular/core';
import { isTokenExpired } from './session';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
export const PERMISSION_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];
export type ModulePermissions = Record<PermissionAction, boolean>;

export type UserRole = 'admin' | 'cashier' | 'super_admin';

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
  /** Multi-tenant sign-ins only (a business created by the Super Admin). Empty for the original store. */
  tenantId?: string | null;
  tenantName?: string | null;
  /** TRIAL | ACTIVE | EXPIRED ... as of sign-in; the banner re-reads the live value from the server. */
  tenantStatus?: string | null;
  subscriptionEnd?: string | null;
  /** Module access the Admin allowed / denied for this user (Users & Roles -> User Access). Missing = the role's defaults. */
  modules?: Record<string, boolean>;
  /** What the user may do in each module: view / create / edit / delete. Missing = the role's defaults. */
  permissions?: Record<string, ModulePermissions>;
}

/** Feature areas a user can be allowed or denied. Keys match the API. */
export const ACCESS_MODULES: { key: string; label: string; group: string; route: string }[] = [
  { key: 'billing', label: 'Billing', group: 'Billing', route: '/pos' },
  { key: 'hold_recall', label: 'Hold & Recall', group: 'Billing', route: '/hold-bills' },
  { key: 'returns', label: 'Returns', group: 'Billing', route: '/returns' },
  { key: 'items_stock', label: 'Items & Stock', group: 'Inventory', route: '/items-stock' },
  { key: 'stock_upload', label: 'Stock Upload', group: 'Inventory', route: '/stock-upload' },
  { key: 'vendors', label: 'Vendors', group: 'Procurement', route: '/vendors' },
  { key: 'purchase_orders', label: 'Purchase Orders', group: 'Procurement', route: '/purchase-orders' },
  { key: 'purchase_returns', label: 'Purchase Returns', group: 'Procurement', route: '/purchase-returns' },
  { key: 'stock_adjustment', label: 'Stock Adjustment', group: 'Stock Maintenance', route: '/stock-adjustment' },
  { key: 'batch_expiry', label: 'Batch & Expiry', group: 'Stock Maintenance', route: '/batch-expiry' },
  { key: 'reorder_alerts', label: 'Reorder Alerts', group: 'Stock Maintenance', route: '/reorder-alerts' },
  { key: 'physical_audit', label: 'Physical Audit', group: 'Stock Maintenance', route: '/stock-audit' },
  { key: 'reports', label: 'Reports', group: 'Insights', route: '/reports' },
  { key: 'ai_insights', label: 'AI Insights', group: 'Insights', route: '/ai-insights' },
  { key: 'discounts', label: 'Discounts', group: 'Administration', route: '/discounts' },
  { key: 'tax_config', label: 'Tax Configuration', group: 'Administration', route: '/tax-settings' },
  { key: 'users', label: 'Users & Roles', group: 'Administration', route: '/users' },
  { key: 'store_settings', label: 'Store Settings', group: 'Administration', route: '/store-settings' }
];
const CASHIER_MODULES = ['billing', 'hold_recall', 'returns'];

export interface TenantSession {
  tenantId?: string | null;
  tenantName?: string | null;
  tenantStatus?: string | null;
  subscriptionEnd?: string | null;
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

  setSession(token: string, username: string, role: string, fullName: string, subText: string, autoLock: string = '2 min', phase: number = 2, activeCounter: string | null = null, tenant: TenantSession = {}, modules?: Record<string, boolean>, permissions?: Record<string, ModulePermissions>) {
    const roleKey = role.toLowerCase();
    const userRole = (roleKey === 'admin' || roleKey === 'super_admin' ? roleKey : 'cashier') as UserRole;
    const profile: UserProfile = {
      username,
      role: userRole,
      fullName,
      subText,
      autoLock,
      phase: phase === 1 ? 1 : 2,
      activeCounter,
      tenantId: tenant.tenantId ?? null,
      tenantName: tenant.tenantName ?? null,
      tenantStatus: tenant.tenantStatus ?? null,
      subscriptionEnd: tenant.subscriptionEnd ?? null,
      modules: modules ?? undefined,
      permissions: permissions ?? undefined
    };

    this.switchCacheOwner(userRole === 'super_admin' ? 'platform' : (tenant.tenantId ?? 'default'));

    this.token.set(token);
    this.currentUser.set(profile);
    this.currentRole.set(userRole);

    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user_profile', JSON.stringify(profile));
  }

  /**
   * Browser-side business caches (catalog, vendors, POs, sales log, user list ... in localStorage) are not tenant-aware.
   * When a different business signs in on the same browser, the previous business's cache is stashed under its own key
   * and the new business's stash (if any) is restored, so one tenant never sees another tenant's cached records.
   */
  private switchCacheOwner(owner: string) {
    try {
      const isCacheKey = (k: string) => k.startsWith('pos_demo_') || k.startsWith('pos_p2_') || k === 'ai_insights_sample_data';
      const previous = localStorage.getItem('pos_cache_owner') ?? 'default';
      if (previous === owner) { localStorage.setItem('pos_cache_owner', owner); return; }

      const current: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && isCacheKey(k)) current[k] = localStorage.getItem(k) ?? '';
      }
      Object.keys(current).forEach(k => localStorage.removeItem(k));
      if (Object.keys(current).length) localStorage.setItem(`pos_cache_stash::${previous}`, JSON.stringify(current));

      const restored = localStorage.getItem(`pos_cache_stash::${owner}`);
      if (restored) {
        const data = JSON.parse(restored) as Record<string, string>;
        Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
        localStorage.removeItem(`pos_cache_stash::${owner}`);
      }
      localStorage.setItem('pos_cache_owner', owner);
    } catch {}
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

  /** A valid session: a sign-in token that has not expired. A leftover profile without a token, or an expired token, is not a session (and is cleared). */
  isAuthenticated(): boolean {
    const token = this.token() || localStorage.getItem('pos_token');
    if (!token) return false;
    if (isTokenExpired(token)) {
      this.logout();
      return false;
    }
    return true;
  }

  /** Whether the signed-in user may open a module (action 'view'), or create / edit / delete in it. The server enforces the same rules on every
   *  API call; this only drives what is shown. */
  can(module: string, action: PermissionAction = 'view'): boolean {
    const u = this.currentUser();
    if (u.role === 'super_admin') return false;
    const perms = u.permissions?.[module];
    if (perms) return !!perms[action];
    // a session saved before per-action permissions: a module that may be opened allows every action
    const explicit = u.modules?.[module];
    if (explicit !== undefined) return !!explicit;
    return u.role === 'admin' || CASHIER_MODULES.includes(module);
  }

  /** First screen the user is allowed to open (where a blocked page sends them). */
  homeRoute(): string {
    return ACCESS_MODULES.find(m => this.can(m.key))?.route ?? '/login';
  }

  /** Applies module access re-read from the server (an Admin may have changed it since sign-in). */
  setModules(modules: Record<string, boolean> | null | undefined, permissions?: Record<string, ModulePermissions> | null) {
    if (!modules && !permissions) return;
    const profile: UserProfile = { ...this.currentUser(), ...(modules ? { modules } : {}), ...(permissions ? { permissions } : {}) };
    this.currentUser.set(profile);
    localStorage.setItem('pos_user_profile', JSON.stringify(profile));
  }

  isAdmin(): boolean {
    return this.currentRole() === 'admin';
  }

  /** Platform administrator (manages tenants). Not an admin of any store. */
  isSuperAdmin(): boolean {
    return this.currentRole() === 'super_admin';
  }

  /** Always true: the separate Phase 1 admin level is retired (a profile saved earlier with phase 1 still gets full access). */
  hasPhase2(): boolean {
    return true;
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
