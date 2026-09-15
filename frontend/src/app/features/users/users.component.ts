import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AuthService } from "../../core/services/auth.service";
import { UserProfile, UserRole } from "../../core/models/user.model";

@Component({
  selector: "app-users",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1000px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <h2>Users &amp; Staff Permissions</h2>
          <p class="text-sm text-muted">Manage Cashier and Administrator access and PINs</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openAddModal()">+ Add New User</button>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Username</th>
              <th>Role</th>
              <th>PIN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let u of auth.users()">
              <td>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="avatar">{{ u.initials }}</div>
                  <div>
                    <div style="font-weight:600">{{ u.fullName }}</div>
                    <div class="text-xs text-muted">{{ u.subText }}</div>
                  </div>
                </div>
              </td>
              <td class="mono font-semibold">{{ u.username }}</td>
              <td><span class="badge" [class.badge-info]="u.role === 'cashier'" [class.badge-warning]="u.role === 'admin'">{{ u.role | uppercase }}</span></td>
              <td class="mono">••••</td>
              <td><span class="badge badge-success">{{ u.isActive ? 'Active' : 'Disabled' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ADD USER MODAL -->
      <div class="modal-overlay" [class.open]="showAddModal">
        <div class="modal" style="max-width:400px">
          <div class="modal-header">
            <h3>Add Staff User</h3>
            <button type="button" class="btn btn-ghost btn-sm" (click)="showAddModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" class="form-input" [(ngModel)]="newUser.fullName" placeholder="e.g. Anand R.">
            </div>
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" class="form-input mono" [(ngModel)]="newUser.username" placeholder="anand">
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <select class="form-select" [(ngModel)]="newUser.role">
                <option value="cashier">Cashier</option>
                <option value="admin">Administrator / Manager</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">4-Digit PIN</label>
              <input type="password" class="form-input mono" [(ngModel)]="newUser.pin" maxlength="4" placeholder="••••">
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="showAddModal = false">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="saveUser()">Save User</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class UsersComponent {
  auth = inject(AuthService);
  showAddModal = false;
  newUser: UserProfile = this.getEmptyUser();

  getEmptyUser(): UserProfile {
    return {
      id: "",
      username: "",
      fullName: "",
      role: "cashier",
      subText: "Cashier · Counter",
      initials: "XX",
      isActive: true,
      pin: "1234"
    };
  }

  openAddModal(): void {
    this.newUser = this.getEmptyUser();
    this.showAddModal = true;
  }

  saveUser(): void {
    if (!this.newUser.fullName || !this.newUser.username) {
      alert("Name and Username are required");
      return;
    }
    const words = this.newUser.fullName.split(" ");
    this.newUser.initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase();
    this.auth.saveUser(this.newUser);
    this.showAddModal = false;
  }
}
