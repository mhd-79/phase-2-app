import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { OkutoIqSubscriptionCardComponent } from '../../components/ai-chatbot/okuto-iq-subscription-card.component';
import { PlatformSubscriptionCardComponent } from '../../components/platform-subscription-card/platform-subscription-card.component';

@Component({
  selector: 'app-store-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, OkutoIqSubscriptionCardComponent, PlatformSubscriptionCardComponent],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-ADM-001..003</span>
          <h1>Store Settings</h1>
          <p>Configure store identity for receipts, hardware setups, and data backup.</p>
        </div>
      </div>

      @if (auth.can('store_settings')) {
      <div class="card" style="max-width:720px;margin-bottom:var(--space-6)">
        <form (submit)="saveSettings(); $event.preventDefault()">
          <h3 style="margin-bottom:var(--space-4)">Store Receipt Profile</h3>
          
          <div class="field">
            <label>Store Name</label>
            <input class="input" [(ngModel)]="store.name" name="storeName" required>
          </div>

          <div class="field" style="margin-top:var(--space-4)">
            <label>Address</label>
            <input class="input" [(ngModel)]="store.address" name="address" required>
          </div>

          <div class="form-grid" style="margin-top:var(--space-4)">
            <div class="field">
              <label>GSTIN</label>
              <input class="input mono" [(ngModel)]="store.gstin" name="gstin" required>
            </div>
            <div class="field">
              <label>Contact Phone</label>
              <input class="input" [(ngModel)]="store.phone" name="phone">
            </div>
          </div>

          <div class="field" style="margin-top:var(--space-4)">
            <label>Return &amp; Exchange Policy</label>
            <select class="select" [(ngModel)]="returnPolicy" name="returnPolicy">
              <option value="BOTH">Return and Exchange both allowed</option>
              <option value="RETURN">Return (refund) only</option>
              <option value="EXCHANGE">Exchange only</option>
            </select>
            <span class="hint">What a cashier may do with a returned item on the Returns screen.</span>
          </div>

          <div class="field" style="margin-top:var(--space-4)">
            <label>Idle Lock Timeout (seconds)</label>
            <input class="input mono" type="number" [(ngModel)]="store.idleTimeout" name="idleTimeout">
            <span class="hint">Screen will automatically lock after this duration of inactivity.</span>
          </div>

          <div class="row" style="margin-top:var(--space-6);justify-content:flex-end">
            <button type="submit" class="btn btn-primary">Save Settings</button>
          </div>
        </form>
      </div>
      }

      @if (auth.can('backup')) {
      <div class="card" style="max-width:720px">
        <h3>Database Backup &amp; Recovery</h3>
        <p class="text-sm text-muted" style="margin-bottom:var(--space-4)">Export full store database JSON file locally or sync to Azure Blob Storage.</p>

        <div class="row" style="gap:var(--space-3)">
          <button class="btn btn-secondary" (click)="backupData()">Export Database JSON Backup</button>
        </div>
        @if (backupMsg) {
          <p class="text-sm" style="color:var(--success-700);margin-top:var(--space-3)">{{ backupMsg }}</p>
        }
      </div>
      }

      <app-platform-subscription-card></app-platform-subscription-card>
      <app-okuto-iq-subscription-card></app-okuto-iq-subscription-card>
    </main>
  `
})
export class StoreSettingsComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);

  store = {
    name: 'Okuto Mart',
    address: '12, MG Road, Bengaluru',
    gstin: '29ABCDE1234F1Z5',
    phone: '+91 98765 43210',
    idleTimeout: 45
  };

  backupMsg: string | null = null;
  returnPolicy: 'RETURN' | 'EXCHANGE' | 'BOTH' = 'BOTH';

  async ngOnInit() {
    this.returnPolicy = await this.api.getReturnPolicy();
    const u = this.auth.currentUser();
    if (u.tenantId) {
      // a tenant never starts with the prototype store's identity
      this.store = { name: u.tenantName || '', address: '', gstin: '', phone: '', idleTimeout: 45 };
    }
    const saved = localStorage.getItem('pos_demo_store_settings');
    if (saved) {
      try { this.store = JSON.parse(saved); } catch {}
    }
  }

  async saveSettings() {
    localStorage.setItem('pos_demo_store_settings', JSON.stringify(this.store));
    try {
      await this.api.saveReturnPolicy(this.returnPolicy);
      alert('Store profile updated successfully');
    } catch (err: any) {
      alert(err?.error?.detail || 'Store profile saved, but the return policy could not be saved. Please try again.');
    }
  }

  backupData() {
    const catalog = this.api.getLocalCatalog();
    const sales = JSON.parse(localStorage.getItem('pos_demo_sales_log') || '[]');
    const backupObj = {
      store: this.store,
      catalog,
      sales,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OkutoMart_Backup_${Date.now()}.json`;
    a.click();
    this.backupMsg = 'JSON backup exported to downloads folder';
  }
}
