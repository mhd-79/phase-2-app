import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-tax-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-TAX-001 &middot; FR-P1-TAX-002</span>
          <h1>Tax Configuration</h1>
          <p>Configure tax rate slabs and toggle between Tax Inclusive or Exclusive pricing.</p>
        </div>
      </div>

      <div class="card" style="max-width:640px;margin-bottom:var(--space-6)">
        <h3>Global Pricing Tax Mode</h3>
        <p class="text-sm text-muted" style="margin-bottom:var(--space-4)">Choose whether product selling prices include GST or add GST on top at checkout.</p>
        
        <div class="stack">
          <label class="checkbox-row">
            <input type="radio" name="taxMode" value="exclusive" [(ngModel)]="pricingMode" (change)="saveMode()">
            <div>
              <strong>Tax Exclusive Pricing (Default)</strong>
              <div class="text-xs text-muted">Bill calculates taxable amount, then adds GST on top (e.g. ₹100 + 5% = ₹105).</div>
            </div>
          </label>

          <label class="checkbox-row">
            <input type="radio" name="taxMode" value="inclusive" [(ngModel)]="pricingMode" (change)="saveMode()">
            <div>
              <strong>Tax Inclusive Pricing</strong>
              <div class="text-xs text-muted">Tag prices already include GST. Internal tax breakup is extracted (e.g. ₹105 total contains ₹5 GST).</div>
            </div>
          </label>
        </div>
      </div>

      <div class="card card-flush" style="max-width:640px">
        <div class="card-header">
          <h3>Configured Tax Slabs (GST)</h3>
        </div>
        <table class="table">
          <thead>
            <tr><th>Slab Name</th><th>Rate (%)</th><th>CGST</th><th>SGST</th></tr>
          </thead>
          <tbody>
            <tr><td>GST 0% (Exempt)</td><td class="mono">0%</td><td class="mono">0%</td><td class="mono">0%</td></tr>
            <tr><td>GST 5% (Essential Retail)</td><td class="mono">5%</td><td class="mono">2.5%</td><td class="mono">2.5%</td></tr>
            <tr><td>GST 12% (Standard Packaged)</td><td class="mono">12%</td><td class="mono">6.0%</td><td class="mono">6.0%</td></tr>
            <tr><td>GST 18% (Personal Care &amp; Snacks)</td><td class="mono">18%</td><td class="mono">9.0%</td><td class="mono">9.0%</td></tr>
            <tr><td>GST 28% (Luxury / Deferral)</td><td class="mono">28%</td><td class="mono">14.0%</td><td class="mono">14.0%</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  `
})
export class TaxSettingsComponent implements OnInit {
  pricingMode: 'exclusive' | 'inclusive' = 'exclusive';

  ngOnInit() {
    try {
      const raw = JSON.parse(localStorage.getItem('pos_demo_tax_settings') || '{}');
      if (raw.pricingMode) this.pricingMode = raw.pricingMode;
    } catch {}
  }

  saveMode() {
    localStorage.setItem('pos_demo_tax_settings', JSON.stringify({ pricingMode: this.pricingMode }));
  }
}
