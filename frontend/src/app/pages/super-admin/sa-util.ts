/** Shared helpers for the Super Admin pages. */

const BADGE: Record<string, string> = {
  ACTIVE: 'badge-success', ACTIVATED: 'badge-success', APPROVED: 'badge-success', PAID: 'badge-success', ACCEPTED: 'badge-success', ready: 'badge-success',
  TRIAL: 'badge-info', INVITED: 'badge-primary', PENDING: 'badge-primary', pending: 'badge-primary',
  PENDING_APPROVAL: 'badge-warning', EXPIRED: 'badge-warning', INVITATION_EXPIRED: 'badge-warning', REVOKED: 'badge-neutral', NOT_PAID: 'badge-neutral',
  SUSPENDED: 'badge-danger', DEACTIVATED: 'badge-danger', REJECTED: 'badge-danger', FAILED: 'badge-danger', failed: 'badge-danger'
};

export function badgeClass(status: string | null | undefined): string {
  return 'badge ' + (BADGE[status || ''] || 'badge-neutral');
}

export function label(status: string | null | undefined): string {
  return (status || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

export const TENANT_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'INVITED', 'ACTIVATED', 'TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REJECTED', 'INVITATION_EXPIRED', 'DEACTIVATED'];

/** Statuses the Super Admin can set by hand on a tenant / business owner. */
export const EDITABLE_TENANT_STATUSES = ['INVITED', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'DEACTIVATED'];

export const BUSINESS_TYPES = ['Supermarket', 'Grocery / Provision store', 'Convenience store', 'Pharmacy', 'Bakery', 'Fruits & vegetables', 'General retail', 'Other'];

export const INDIAN_STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

export function emptyTenantForm() {
  return {
    tenant_name: '', legal_business_name: '', owner_name: '', email: '', phone: '', address: '', city: '', state: '', country: 'India',
    postal_code: '', gstin: '', business_type: BUSINESS_TYPES[0], initial_outlet_name: '', trial_duration_days: null as number | null,
    subscription_plan: '', send_invitation: true
  };
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
