import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export type TenantStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'INVITED' | 'ACTIVATED' | 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REJECTED' | 'INVITATION_EXPIRED' | 'DEACTIVATED';

export interface SubscriptionInfo {
  current_plan: string | null; plan_id: string | null; trial_start_date: string | null; trial_end_date: string | null;
  trial_duration_days: number | null; subscription_start_date: string | null; subscription_end_date: string | null;
  payment_status: string | null; pending_plan_id: string | null;
}

export interface Tenant {
  id: string; code: string; name: string; legal_name: string; owner_name: string; email: string; phone: string; address: string; city: string;
  state: string; country: string; postal_code: string; gstin: string; business_type: string; initial_outlet_name: string | null;
  status: TenantStatus; effective_status: TenantStatus; schema_name: string; is_default: boolean; provision_status: string;
  provision_error: string | null; request_id: string | null; created_by: string | null; created_at: string; updated_at: string;
  subscription: SubscriptionInfo | null;
}

export interface TenantInput {
  tenant_name: string; legal_business_name: string; owner_name: string; email: string; phone: string; address: string; city: string;
  state: string; country: string; postal_code: string; gstin: string; business_type: string; initial_outlet_name?: string | null;
  trial_duration_days?: number | null; subscription_plan?: string | null; send_invitation?: boolean;
}

export interface InviteResult { delivery: 'smtp' | 'logged'; delivered: boolean; expires_at: string; invite_url: string | null; error: string | null; }

export interface Plan {
  id: string; code: string; name: string; description: string | null; price: number; currency: string; duration_days: number;
  max_users: number | null; storage_mb: number | null; ai_enabled: boolean; reports_enabled: boolean; is_active: boolean;
}

export interface AuditEntry {
  id: string; action: string; actor_id: string | null; actor_role: string; actor_email: string | null; tenant_id: string | null;
  ip_address: string | null; metadata: any; timestamp: string;
}

export interface PlatformNotification { id: string; type: string; title: string; message: string; link: string | null; tenant_id: string | null; is_read: boolean; created_at: string; }

/** API client for the Super Admin area. No offline/demo fallbacks: failures are shown to the user as they are. */
@Injectable({ providedIn: 'root' })
export class SuperAdminApiService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = `${environment.apiUrl}/super-admin`;

  private headers(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Turns any API failure into an Error with a readable message. */
  private async call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.request<T>(method, `${this.base}${path}`, { body, headers: this.headers() }));
    } catch (err: any) {
      throw new Error(this.message(err));
    }
  }

  message(err: any): string {
    const status: number = err?.status ?? 0;
    if (!status) return 'Cannot reach the server. Check your connection and that the backend is running.';
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {   // validation errors from the API
      return detail.map((d: any) => `${(d.loc || []).slice(1).join('.') || 'value'}: ${String(d.msg || '').replace(/^Value error, /, '')}`).join('; ');
    }
    if (detail && typeof detail.message === 'string') return detail.message;
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You do not have permission to do that.';
    return 'Something went wrong. Please try again.';
  }

  // dashboard
  dashboard() { return this.call<any>('GET', '/dashboard'); }

  // tenants
  tenants(status = '', q = '') {
    const params = [status ? `status=${encodeURIComponent(status)}` : '', q ? `q=${encodeURIComponent(q)}` : ''].filter(Boolean).join('&');
    return this.call<{ total: number; items: Tenant[] }>('GET', `/tenants${params ? '?' + params : ''}`);
  }
  createTenant(body: TenantInput) { return this.call<{ tenant: Tenant; invitation: InviteResult | null }>('POST', '/tenants', body); }
  tenant(id: string) { return this.call<any>('GET', `/tenants/${id}`); }
  updateTenant(id: string, body: Partial<TenantInput>) { return this.call<Tenant>('PUT', `/tenants/${id}`, body); }
  changeStatus(id: string, action: 'suspend' | 'reactivate' | 'activate', reason?: string, planCode?: string) {
    return this.call<Tenant>('PATCH', `/tenants/${id}/status`, { action, reason: reason || null, plan_code: planCode || null });
  }
  /** Edit a tenant's status and/or subscription plan. Takes effect on the tenant's next request. */
  updateTenantAdmin(id: string, body: { status?: string; plan_code?: string }) { return this.call<Tenant>('PATCH', `/tenants/${id}`, body); }
  invite(id: string) { return this.call<{ tenant: Tenant; invitation: InviteResult }>('POST', `/tenants/${id}/invite`); }
  resendInvitation(id: string) { return this.call<{ tenant: Tenant; invitation: InviteResult }>('POST', `/tenants/${id}/resend-invitation`); }
  retryProvisioning(id: string) { return this.call<Tenant>('POST', `/tenants/${id}/retry-provisioning`); }

  // tenant requests
  requests(status = '') { return this.call<{ total: number; items: any[] }>('GET', `/tenant-requests${status ? '?status=' + status : ''}`); }
  approveRequest(id: string, trialDays?: number | null, plan?: string | null) {
    return this.call<{ request: any; tenant: Tenant; invitation: InviteResult | null }>('POST', `/tenant-requests/${id}/approve`,
      { trial_duration_days: trialDays || null, subscription_plan: plan || null });
  }
  rejectRequest(id: string, reason?: string) { return this.call<any>('POST', `/tenant-requests/${id}/reject`, { reason: reason || null }); }

  // invitations, subscriptions, plans
  invitations(status = '') { return this.call<{ total: number; items: any[] }>('GET', `/invitations${status ? '?status=' + status : ''}`); }
  subscriptions() { return this.call<{ total: number; items: any[] }>('GET', '/subscriptions'); }
  markPaid(tenantId: string, planCode: string, reference?: string) {
    return this.call<Tenant>('POST', `/subscriptions/${tenantId}/mark-paid`, { plan_code: planCode, reference: reference || null });
  }
  plans() { return this.call<{ items: Plan[] }>('GET', '/plans'); }
  createPlan(body: Partial<Plan>) { return this.call<Plan>('POST', '/plans', body); }
  updatePlan(id: string, body: Partial<Plan>) { return this.call<Plan>('PUT', `/plans/${id}`, body); }

  // users, notifications, audit logs, settings
  notifications(unread = false) { return this.call<{ unread: number; items: PlatformNotification[] }>('GET', `/notifications${unread ? '?unread=true' : ''}`); }
  readNotification(id: string) { return this.call<any>('POST', `/notifications/${id}/read`); }
  readAllNotifications() { return this.call<any>('POST', '/notifications/read-all'); }
  auditLogs(opts: { action?: string; tenantId?: string; limit?: number; offset?: number } = {}) {
    const p = [opts.action ? `action=${encodeURIComponent(opts.action)}` : '', opts.tenantId ? `tenant_id=${opts.tenantId}` : '',
      `limit=${opts.limit ?? 50}`, `offset=${opts.offset ?? 0}`].filter(Boolean).join('&');
    return this.call<{ total: number; items: AuditEntry[] }>('GET', `/audit-logs?${p}`);
  }
  settings() { return this.call<any>('GET', '/settings'); }
  updateSettings(body: Record<string, unknown>) { return this.call<any>('PUT', '/settings', body); }
  sweep() { return this.call<any>('POST', '/sweep'); }
}
