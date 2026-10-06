import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { Plan } from './super-admin-api.service';

export interface TenantSubscriptionStatus {
  tenant_id: string; tenant_name: string; status: string; stored_status: string; current_plan: string | null; payment_status: string | null;
  trial_start_date: string | null; trial_end_date: string | null; subscription_start_date: string | null; subscription_end_date: string | null;
  days_left: number | null; reminder: boolean; expired_policy: string;
  limits: { max_users: number | null; storage_mb: number | null; ai_enabled: boolean; reports_enabled: boolean } | null;
}

/** The signed-in business's own trial / subscription state (used by the top bar badge and the Store Settings card). */
@Injectable({ providedIn: 'root' })
export class TenantSubscriptionService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = environment.apiUrl;

  readonly status = signal<TenantSubscriptionStatus | null>(null);

  private headers(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Only businesses created by the Super Admin have a platform subscription; the original store and Super Admin do not. */
  appliesToUser(): boolean {
    return this.auth.isAdmin() && !!this.auth.currentUser().tenantId;
  }

  async refresh(): Promise<TenantSubscriptionStatus | null> {
    if (!this.appliesToUser()) { this.status.set(null); return null; }
    try {
      const s = await firstValueFrom(this.http.get<TenantSubscriptionStatus>(`${this.base}/subscriptions/status`, { headers: this.headers() }));
      this.status.set(s);
      return s;
    } catch { return this.status(); }
  }

  async plans(): Promise<Plan[]> {
    const r = await firstValueFrom(this.http.get<{ items: Plan[] }>(`${this.base}/subscriptions/plans`, { headers: this.headers() }));
    return r.items;
  }

  async checkout(planCode: string): Promise<{ message: string; amount: number; currency: string; plan: Plan }> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.base}/subscriptions/checkout`, { plan_code: planCode }, { headers: this.headers() }));
    } catch (err: any) {
      throw new Error(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not start checkout. Please try again.');
    }
  }
}
