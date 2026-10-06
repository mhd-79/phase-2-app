import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { BUSINESS_TYPES, INDIAN_STATES } from '../super-admin/sa-util';

/** Public page (no sign-in): a business owner registers their business. The request waits for Super Admin approval. */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule],
  styles: [`
    .rg-wrap { min-height: 100vh; display:flex; align-items:flex-start; justify-content:center; padding: var(--space-6) var(--space-4); background: linear-gradient(160deg, var(--indigo-700), var(--slate-900) 70%); }
    .rg-card { width:100%; max-width:760px; background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: var(--space-8); margin: auto 0; }
    .rg-logo { width:44px; height:44px; border-radius: var(--radius-md); background: var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; margin-bottom: var(--space-4); }
    @media (max-width: 600px) { .rg-card { padding: var(--space-5); } }
  `],
  template: `
    <div class="rg-wrap">
      <div class="rg-card">
        <div class="rg-logo">OK</div>
        @if (done()) {
          <h2 style="margin-bottom:var(--space-2)">Request received</h2>
          <p class="text-sm text-muted">Thank you. Your registration is waiting for approval. Once it is approved, we will email a secure link to <strong>{{ form.email }}</strong> so you can create your password and start your free trial.</p>
          <button type="button" class="btn btn-secondary btn-block" style="margin-top:var(--space-5)" (click)="goToLogin()">Back to sign in</button>
        } @else {
          <h2 style="margin-bottom:var(--space-1)">Register your business</h2>
          <p class="text-muted text-sm" style="margin-bottom:var(--space-5)">Tell us about your business to start a free trial. Your request is reviewed before your account is created.</p>
          <form (submit)="$event.preventDefault(); submit()" class="stack" style="gap:var(--space-4)">
            <div class="form-grid">
              <div class="field"><label for="rgName">Business name *</label><input class="input" id="rgName" name="tenant_name" [(ngModel)]="form.tenant_name" maxlength="120"></div>
              <div class="field"><label for="rgLegal">Legal business name *</label><input class="input" id="rgLegal" name="legal" [(ngModel)]="form.legal_business_name" maxlength="160"></div>
              <div class="field"><label for="rgOwner">Owner name *</label><input class="input" id="rgOwner" name="owner" [(ngModel)]="form.owner_name" maxlength="120"></div>
              <div class="field"><label for="rgEmail">Owner email * <span class="text-xs text-muted">(your sign-in name)</span></label><input class="input" id="rgEmail" type="email" name="email" autocomplete="email" [(ngModel)]="form.email"></div>
              <div class="field"><label for="rgPhone">Phone *</label><input class="input" id="rgPhone" name="phone" autocomplete="tel" [(ngModel)]="form.phone" placeholder="+91 98765 43210"></div>
              <div class="field"><label for="rgGstin">GSTIN *</label><input class="input mono" id="rgGstin" name="gstin" [(ngModel)]="form.gstin" maxlength="15" placeholder="29ABCDE1234F1Z5"></div>
            </div>
            <div class="field"><label for="rgAddress">Address *</label><input class="input" id="rgAddress" name="address" [(ngModel)]="form.address" maxlength="240"></div>
            <div class="form-grid">
              <div class="field"><label for="rgCity">City *</label><input class="input" id="rgCity" name="city" [(ngModel)]="form.city"></div>
              <div class="field"><label for="rgState">State *</label><input class="input" id="rgState" name="state" [(ngModel)]="form.state" list="rg-states"></div>
              <div class="field"><label for="rgCountry">Country *</label><input class="input" id="rgCountry" name="country" [(ngModel)]="form.country"></div>
              <div class="field"><label for="rgPostal">Postal code *</label><input class="input" id="rgPostal" name="postal" [(ngModel)]="form.postal_code" maxlength="10"></div>
              <div class="field"><label for="rgType">Business type *</label>
                <select class="select" id="rgType" name="btype" [(ngModel)]="form.business_type">@for (b of businessTypes; track b) { <option [value]="b">{{ b }}</option> }</select></div>
              <div class="field"><label for="rgOutlet">Initial outlet name</label><input class="input" id="rgOutlet" name="outlet" [(ngModel)]="form.initial_outlet_name" placeholder="Used as the store name"></div>
            </div>
            <datalist id="rg-states">@for (s of states; track s) { <option [value]="s"></option> }</datalist>
            @if (error()) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ error() }}</div> }
            <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy()">{{ busy() ? 'Submitting…' : 'Submit registration request' }}</button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="goToLogin()">Already registered? Sign in</button>
          </form>
        }
      </div>
    </div>
  `
})
export class RegisterComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  businessTypes = BUSINESS_TYPES;
  states = INDIAN_STATES;
  busy = signal(false);
  error = signal('');
  done = signal(false);
  form = {
    tenant_name: '', legal_business_name: '', owner_name: '', email: '', phone: '', address: '', city: '', state: '', country: 'India',
    postal_code: '', gstin: '', business_type: BUSINESS_TYPES[0], initial_outlet_name: ''
  };

  async submit() {
    if (this.busy()) return;
    this.error.set('');
    const f = this.form;
    const missing = [['business name', f.tenant_name], ['legal business name', f.legal_business_name], ['owner name', f.owner_name], ['owner email', f.email], ['phone', f.phone],
      ['GSTIN', f.gstin], ['address', f.address], ['city', f.city], ['state', f.state], ['country', f.country], ['postal code', f.postal_code]]
      .filter(([, v]) => !String(v).trim()).map(([n]) => n);
    if (missing.length) { this.error.set(`Please fill in: ${missing.join(', ')}.`); return; }
    this.busy.set(true);
    try {
      await this.api.submitTenantRequest({
        ...f, tenant_name: f.tenant_name.trim(), legal_business_name: f.legal_business_name.trim(), owner_name: f.owner_name.trim(), email: f.email.trim(),
        initial_outlet_name: f.initial_outlet_name.trim() || null, source: 'website'
      });
      this.done.set(true);
    } catch (err: any) {
      this.error.set(err?.message || 'Could not submit your request. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  goToLogin() { this.router.navigate(['/login']); }
}
