import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-store-settings",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:800px;margin:0 auto">
      <div style="margin-bottom:24px">
        <h2>Store &amp; Receipt Settings</h2>
        <p class="text-sm text-muted">Configure store profile, GSTIN, and receipt footer message</p>
      </div>

      <div class="card" style="padding:24px">
        <div class="form-group">
          <label class="form-label">Store Brand Name</label>
          <input type="text" class="form-input" [(ngModel)]="storeName">
        </div>
        <div class="form-group">
          <label class="form-label">Store Address</label>
          <input type="text" class="form-input" [(ngModel)]="storeAddress">
        </div>
        <div class="form-group">
          <label class="form-label">GSTIN / Tax ID</label>
          <input type="text" class="form-input mono" [(ngModel)]="gstin">
        </div>
        <div class="form-group">
          <label class="form-label">Receipt Footer Note</label>
          <input type="text" class="form-input" [(ngModel)]="receiptFooter">
        </div>
        <button type="button" class="btn btn-primary" (click)="saveSettings()">Save Store Settings</button>
      </div>
    </div>
  `
})
export class StoreSettingsComponent {
  storeName = "Greenfield Mart";
  storeAddress = "Store #01 · MG Road Branch, Bangalore";
  gstin = "29AAAAA0000A1Z5";
  receiptFooter = "Thank You! Visit Again";

  saveSettings(): void {
    alert("Store Settings saved successfully!");
  }
}
