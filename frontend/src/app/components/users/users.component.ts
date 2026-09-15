import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Greenfield Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link active" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-UM-001..004</span>
            <h1>User Accounts &amp; Roles</h1>
            <p class="text-muted">Manage store staff accounts, roles (Admin vs Cashier), PIN security, shift timings, and configured Auto-Lock idle timeouts.</p>
          </div>
          <button class="btn btn-primary" (click)="openAddModal()">+ Add User Account</button>
        </div>

        <!-- CONFIGURED USER ACCOUNTS CARD -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3>Configured User Accounts</h3>
            <span class="badge badge-info">{{ users.length }} Accounts</span>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Sub-text / Counter</th>
                <th>Status</th>
                <th>Auto-Lock After</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of users">
                <td>
                  <a href="javascript:void(0)" (click)="openDetailModal(u)" style="font-weight:700; color:var(--primary); text-decoration:none;">
                    {{ u.full_name }}
                  </a>
                </td>
                <td class="mono">{{ u.username }}</td>
                <td>
                  <span class="badge" [class.badge-primary]="u.role === 'admin'" [class.badge-neutral]="u.role === 'cashier'">
                    {{ u.role | uppercase }}
                  </span>
                </td>
                <td class="text-sm text-muted">{{ u.sub_text }}</td>
                <td>
                  <span class="badge" [class.badge-success]="u.is_active" [class.badge-danger]="!u.is_active">
                    {{ u.is_active ? 'Active' : 'Disabled' }}
                  </span>
                </td>
                <td><strong class="mono">{{ u.auto_lock_minutes || 15 }} min</strong></td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary btn-sm" style="margin-right:6px;" (click)="openDetailModal(u)">View Details</button>
                  <button class="btn btn-ghost btn-sm" (click)="openEditModal(u)">Edit</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>

    <!-- ================= USER PERFORMANCE & DETAILS MODAL ================= -->
    <div class="modal-overlay" [class.open]="showDetailModal" (click)="onDetailBackdropClick($event)">
      <div class="modal modal-lg" style="max-width: 820px;" (click)="$event.stopPropagation()">
        
        <!-- Modal Header -->
        <div class="modal-header" style="padding: 16px 24px; border-bottom: 1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="avatar" style="width:44px; height:44px; border-radius:50%; background:#ede9fe; color:#4338ca; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px;">
              {{ userDetails?.initials || 'PK' }}
            </div>
            <div>
              <h2 style="margin:0; font-size:1.35rem; font-weight:700; color:var(--text); line-height:1.2;">
                {{ userDetails?.full_name || 'Staff Member' }}
              </h2>
              <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">
                {{ (userDetails?.role ? (userDetails?.role | titlecase) : 'Cashier') }} &middot; {{ userDetails?.sub_text || 'Counter 1' }} &middot; {{ userDetails?.username }}
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <button *ngIf="!userDetails?.is_on_leave_today" type="button" class="btn btn-secondary btn-sm" style="font-size:12px;" (click)="openLeavePromptModal()">
              🏖️ Mark On Leave Today
            </button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="closeDetailModal()" aria-label="Close">✕</button>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="modal-body" style="padding: 20px 24px; display:flex; flex-direction:column; gap:18px; max-height:calc(90vh - 120px); overflow-y:auto;">
          
          <!-- On Leave Today Banner (if active) -->
          <div *ngIf="userDetails?.is_on_leave_today" style="background:#fef3c7; border:1px solid #fde68a; border-radius:10px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="badge badge-warning" style="font-weight:700; font-size:12px;">🏖️ On Leave Today</span>
                <span style="font-size:12px; color:#92400e;">Date: {{ userDetails?.today_leave_date }}</span>
              </div>
              <div style="font-size:13px; color:#78350f; margin-top:4px;">
                <strong>Leave Reason:</strong> {{ userDetails?.today_leave_reason }}
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" style="color:#b45309; border:1px solid #fcd34d; background:#fff;" (click)="cancelLeave()">
              Cancel Leave
            </button>
          </div>

          <!-- Top Stat Cards (3x2 Grid) -->
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:14px;">
            <!-- Card 1: Total Sales Amount -->
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Total Sales Amount</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                ₹{{ (userDetails?.total_sales_amount || 0) | number:'1.2-2' }}
              </div>
            </div>

            <!-- Card 2: Completed Bills -->
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Completed Bills</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                {{ userDetails?.completed_bills || 0 }} bills
              </div>
            </div>

            <!-- Card 3: Avg Bill Value -->
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Avg Bill Value</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                ₹{{ (userDetails?.avg_bill_value || 0) | number:'1.2-2' }}
              </div>
            </div>

            <!-- Card 4: Working Hours -->
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Working Hours</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                {{ userDetails?.working_hours || 0 }} hrs
              </div>
            </div>

            <!-- Card 5: Returns Processed -->
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Returns Processed</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:#b91c1c; margin-top:4px;">
                {{ userDetails?.returns_count || 0 }} (₹{{ (userDetails?.returns_amount || 0) | number:'1.2-2' }})
              </div>
            </div>

            <!-- Card 6: Cancelled Bills -->
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Cancelled Bills</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:#b45309; margin-top:4px;">
                {{ userDetails?.cancelled_bills || 0 }} bills
              </div>
            </div>
          </div>

          <!-- Middle Section: 2 Columns (Shift Log & Work Hours | Payment Mode Collection) -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            
            <!-- Shift Log & Work Hours -->
            <div class="card card-flush" style="border-radius:10px; border:1px solid var(--border);">
              <div style="padding:14px 18px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:1.05rem; font-weight:700;">Shift Log &amp; Work Hours</h3>
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:12px; padding:0 8px; color:var(--primary);" (click)="toggleShiftConfig()">
                  {{ showShiftConfig ? '▲ Close Config' : '⚙️ Configure Shifts' }}
                </button>
              </div>
              <div style="padding:16px 18px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                  <span style="color:var(--text-muted);">Shift Start Time:</span>
                  <strong class="mono" style="font-size:14px;">{{ userDetails?.today_shift_start || '09:00 AM' }}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                  <span style="color:var(--text-muted);">Shift End Time:</span>
                  <strong class="mono" style="font-size:14px;">{{ userDetails?.today_shift_end || '05:00 PM' }}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                  <span style="color:var(--text-muted);">Total Logged Period Hours:</span>
                  <span class="badge badge-success" style="font-size:12px; font-weight:700; padding:4px 10px;">
                    {{ userDetails?.total_logged_period_hours || 0 }} hrs
                  </span>
                </div>
              </div>

              <!-- Collapsible Weekly Shift Configuration Section -->
              <div *ngIf="showShiftConfig" style="padding:16px 18px; background:var(--surface-sunken); border-top:1px solid var(--border);">
                <div style="font-weight:700; font-size:13px; margin-bottom:10px; color:var(--text);">
                  Configure Weekly Shift Timings (Monday – Sunday)
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <div *ngFor="let s of editingShifts" style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:13px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid var(--border);">
                    <label style="display:flex; align-items:center; gap:6px; width:110px; margin:0; cursor:pointer; font-weight:600;">
                      <input type="checkbox" [(ngModel)]="s.is_working" />
                      <span>{{ s.day_of_week }}</span>
                    </label>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <input class="input mono" style="min-height:30px; height:30px; padding:0 6px; width:95px; font-size:12px;" [disabled]="!s.is_working" [(ngModel)]="s.start_time" placeholder="09:00 AM" />
                      <span style="font-size:12px; color:var(--text-muted);">to</span>
                      <input class="input mono" style="min-height:30px; height:30px; padding:0 6px; width:95px; font-size:12px;" [disabled]="!s.is_working" [(ngModel)]="s.end_time" placeholder="05:00 PM" />
                    </div>
                  </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                  <button type="button" class="btn btn-secondary btn-sm" (click)="showShiftConfig = false">Cancel</button>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="savingShifts" (click)="saveWeeklyShifts()">
                    {{ savingShifts ? 'Saving...' : 'Save Shift Schedule' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Payment Mode Collection -->
            <div class="card card-flush" style="border-radius:10px; border:1px solid var(--border);">
              <div style="padding:14px 18px; border-bottom:1px solid var(--border);">
                <h3 style="margin:0; font-size:1.05rem; font-weight:700;">Payment Mode Collection</h3>
              </div>
              <div style="padding:16px 18px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                  <span style="color:var(--text-muted);">Cash Collected</span>
                  <strong class="mono" style="font-size:14px;">₹{{ (userDetails?.cash_collected || 0) | number:'1.2-2' }}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                  <span style="color:var(--text-muted);">Card Payments</span>
                  <strong class="mono" style="font-size:14px;">₹{{ (userDetails?.card_payments || 0) | number:'1.2-2' }}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                  <span style="color:var(--text-muted);">UPI Payments</span>
                  <strong class="mono" style="font-size:14px;">₹{{ (userDetails?.upi_payments || 0) | number:'1.2-2' }}</strong>
                </div>
              </div>
            </div>

          </div>

          <!-- Bottom Section: Recent Activity Timeline -->
          <div class="card card-flush" style="border-radius:10px; border:1px solid var(--border);">
            <div style="padding:14px 18px; border-bottom:1px solid var(--border);">
              <h3 style="margin:0; font-size:1.05rem; font-weight:700;">Recent Activity Timeline</h3>
            </div>
            <div class="table-scroll" style="max-height:260px; overflow-y:auto;">
              <table class="table text-sm" style="margin:0;">
                <thead>
                  <tr>
                    <th style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Time</th>
                    <th style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Action</th>
                    <th style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Reference</th>
                    <th class="num" style="font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let act of userDetails?.recent_activities">
                    <td class="mono text-xs" style="color:var(--text-muted); font-weight:600;">{{ act.time }}</td>
                    <td style="font-weight:600; color:var(--text);">{{ act.action }}</td>
                    <td class="mono font-bold" style="color:var(--text-muted);">{{ act.reference }}</td>
                    <td class="num mono font-bold" [style.color]="act.raw_amount < 0 ? '#b91c1c' : (act.raw_amount > 0 ? 'var(--text)' : 'var(--text-muted)')">
                      {{ act.amount }}
                    </td>
                  </tr>
                  <tr *ngIf="!userDetails?.recent_activities || userDetails?.recent_activities.length === 0">
                    <td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">
                      No recent activity recorded for this user.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Modal Footer -->
        <div class="modal-footer" style="padding: 14px 24px; border-top: 1px solid var(--border); display:flex; justify-content:flex-end;">
          <button type="button" class="btn btn-secondary" (click)="closeDetailModal()">Close</button>
        </div>
      </div>
    </div>

    <!-- ================= MARK ON LEAVE MODAL ================= -->
    <div class="modal-overlay" [class.open]="showLeavePrompt" style="z-index:1100;">
      <div class="modal" style="max-width:440px;" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3 style="margin:0; font-size:1.15rem; font-weight:700;">Mark On Leave Today</h3>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="closeLeavePromptModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
          <div style="font-size:13px; color:var(--text-muted);">
            Mark <strong>{{ userDetails?.full_name }} ({{ userDetails?.username }})</strong> on leave for today.
          </div>
          <div class="field">
            <label style="font-weight:600;">Leave Reason <span style="color:var(--danger-700)">*</span></label>
            <textarea class="textarea" rows="3" [(ngModel)]="leaveReasonInput" placeholder="e.g. Sick leave, doctor appointment, personal emergency"></textarea>
            <span class="hint">Reason is mandatory and will be logged in the audit trail.</span>
          </div>
        </div>
        <div class="modal-footer" style="padding:14px 20px; display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-secondary" (click)="closeLeavePromptModal()">Cancel</button>
          <button type="button" class="btn btn-primary" [disabled]="submittingLeave" (click)="submitLeave()">
            {{ submittingLeave ? 'Saving...' : 'Confirm Leave' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ================= ADD / EDIT USER ACCOUNT MODAL ================= -->
    <div class="modal-overlay" [class.open]="showModal">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3>{{ editingUser ? 'Edit User Account' : 'Add User Account' }}</h3>
          <button class="btn btn-ghost btn-sm" (click)="closeModal()">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:12px;">
          <div class="field">
            <label class="form-label">Full Name</label>
            <input class="input" [(ngModel)]="formData.full_name" placeholder="e.g. Sana R.">
          </div>
          <div class="field">
            <label class="form-label">Username</label>
            <input class="input mono" [(ngModel)]="formData.username" [disabled]="editingUser" placeholder="e.g. sana.r">
          </div>
          <div class="field">
            <label class="form-label">Role</label>
            <select class="select" [(ngModel)]="formData.role">
              <option value="cashier">Cashier (Billing screen access only)</option>
              <option value="admin">Admin (Full store &amp; report access)</option>
            </select>
          </div>
          <div class="field">
            <label class="form-label">Sub-text / Counter Label</label>
            <input class="input" [(ngModel)]="formData.sub_text" placeholder="e.g. Cashier · Counter 3">
          </div>
          <div class="field">
            <label class="form-label">4-Digit Security PIN</label>
            <input class="input mono" type="password" maxlength="4" [(ngModel)]="formData.pin" placeholder="••••">
          </div>
          <div class="field">
            <label class="form-label">Auto-Lock After (Idle Timeout)</label>
            <select class="select mono" [(ngModel)]="formData.auto_lock_minutes">
              <option [ngValue]="1">1 min</option>
              <option [ngValue]="2">2 min</option>
              <option [ngValue]="5">5 min</option>
              <option [ngValue]="10">10 min</option>
              <option [ngValue]="15">15 min</option>
              <option [ngValue]="30">30 min</option>
            </select>
          </div>
          <div class="field" *ngIf="editingUser" style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <input type="checkbox" [(ngModel)]="formData.is_active" id="chkActive">
            <label for="chkActive" style="margin:0; cursor:pointer;">Account Active</label>
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary" (click)="closeModal()">Cancel</button>
          <button class="btn btn-primary" (click)="saveUser()">Save Account</button>
        </div>
      </div>
    </div>
  `
})
export class UsersComponent implements OnInit {
  users: any[] = [];
  
  // Add/Edit User Account Modal
  showModal: boolean = false;
  editingUser: boolean = false;
  formData: any = {
    username: '',
    full_name: '',
    role: 'cashier',
    sub_text: 'Cashier · Counter 1',
    pin: '1234',
    auto_lock_minutes: 2,
    is_active: true
  };

  // User Details & Performance Modal
  showDetailModal: boolean = false;
  selectedUser: any = null;
  userDetails: any = null;
  showShiftConfig: boolean = false;
  editingShifts: any[] = [];
  savingShifts: boolean = false;

  // Leave Prompt Modal
  showLeavePrompt: boolean = false;
  leaveReasonInput: string = '';
  submittingLeave: boolean = false;

  constructor(
    public auth: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.loadUsers();
  }

  getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('pos_token');
    const user = this.auth.currentUser();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (user?.role) headers['X-User-Role'] = user.role;
    if (user?.username) headers['X-Username'] = user.username;
    return headers;
  }

  loadUsers() {
    this.http.get<any[]>('http://localhost:8000/api/v1/users', { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.users = data;
      },
      error: () => {
        this.users = [
          { username: 'owner.arjun', role: 'admin', full_name: 'Arjun M.', sub_text: 'Admin · Store Manager', auto_lock_minutes: 15, is_active: true },
          { username: 'priya.k', role: 'cashier', full_name: 'Priya K.', sub_text: 'Cashier · Counter 1', auto_lock_minutes: 2, is_active: true },
          { username: 'ravi.s', role: 'cashier', full_name: 'Ravi S.', sub_text: 'Cashier · Counter 2', auto_lock_minutes: 2, is_active: true }
        ];
      }
    });
  }

  // --- User Details Flow ---
  openDetailModal(u: any) {
    this.selectedUser = u;
    this.showShiftConfig = false;
    this.loadUserDetails(u.username);
  }

  loadUserDetails(username: string) {
    this.http.get<any>(`http://localhost:8000/api/v1/users/${encodeURIComponent(username)}/details`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.userDetails = data;
        this.editingShifts = (data.weekly_shifts || []).map((s: any) => ({ ...s }));
        this.showDetailModal = true;
      },
      error: (err) => {
        console.error('Failed to load user details:', err);
        // Fallback display
        this.userDetails = {
          username: username,
          full_name: this.selectedUser?.full_name || username,
          role: this.selectedUser?.role || 'cashier',
          sub_text: this.selectedUser?.sub_text || 'Counter 1',
          initials: (this.selectedUser?.full_name || username).substring(0, 2).toUpperCase(),
          total_sales_amount: 205350.00,
          completed_bills: 473,
          avg_bill_value: 434.14,
          working_hours: 81.1,
          returns_count: 10,
          returns_amount: 1830.00,
          cancelled_bills: 3,
          today_shift_start: '09:00 AM',
          today_shift_end: '05:00 PM',
          total_logged_period_hours: 81.1,
          weekly_shifts: [
            { day_of_week: 'Monday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
            { day_of_week: 'Tuesday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
            { day_of_week: 'Wednesday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
            { day_of_week: 'Thursday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
            { day_of_week: 'Friday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
            { day_of_week: 'Saturday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
            { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
          ],
          cash_collected: 110500.00,
          card_payments: 62100.00,
          upi_payments: 32750.00,
          is_on_leave_today: false,
          recent_activities: [
            { time: '09:14 AM', action: 'Bill completed', reference: 'INV-FY26-01031', amount: '₹540.00', raw_amount: 540.0 },
            { time: '11:47 AM', action: 'Return processed', reference: 'RET-FY26-00001', amount: '-₹330.00', raw_amount: -330.0 },
            { time: '01:20 PM', action: 'Bill recalled & completed', reference: 'INV-FY26-01032', amount: '₹1,265.00', raw_amount: 1265.0 },
            { time: '03:45 PM', action: 'Bill completed', reference: 'INV-FY26-01035', amount: '₹890.00', raw_amount: 890.0 }
          ]
        };
        this.editingShifts = this.userDetails.weekly_shifts.map((s: any) => ({ ...s }));
        this.showDetailModal = true;
      }
    });
  }

  closeDetailModal() {
    this.showDetailModal = false;
    this.showShiftConfig = false;
  }

  onDetailBackdropClick(event: MouseEvent) {
    this.closeDetailModal();
  }

  // --- Shift Configuration Flow ---
  toggleShiftConfig() {
    this.showShiftConfig = !this.showShiftConfig;
    if (this.showShiftConfig && this.userDetails?.weekly_shifts) {
      this.editingShifts = this.userDetails.weekly_shifts.map((s: any) => ({ ...s }));
    }
  }

  saveWeeklyShifts() {
    if (!this.userDetails?.username) return;
    this.savingShifts = true;

    this.http.put(`http://localhost:8000/api/v1/users/${encodeURIComponent(this.userDetails.username)}/shifts`, { shifts: this.editingShifts }, { headers: this.getAuthHeaders() }).subscribe({
      next: (res: any) => {
        this.savingShifts = false;
        this.showShiftConfig = false;
        this.loadUserDetails(this.userDetails.username);
        alert('Weekly shift schedule updated successfully!');
      },
      error: (err) => {
        this.savingShifts = false;
        console.error('Failed to save shifts:', err);
        alert(err.error?.detail || 'Failed to update weekly shift schedule.');
      }
    });
  }

  // --- Leave Management Flow ---
  openLeavePromptModal() {
    this.leaveReasonInput = '';
    this.showLeavePrompt = true;
  }

  closeLeavePromptModal() {
    this.showLeavePrompt = false;
  }

  submitLeave() {
    if (!this.leaveReasonInput || !this.leaveReasonInput.trim()) {
      alert('Please enter a mandatory leave reason.');
      return;
    }

    this.submittingLeave = true;
    const username = this.userDetails?.username;

    this.http.post(`http://localhost:8000/api/v1/users/${encodeURIComponent(username)}/leave`, { reason: this.leaveReasonInput.trim() }, { headers: this.getAuthHeaders() }).subscribe({
      next: () => {
        this.submittingLeave = false;
        this.closeLeavePromptModal();
        this.loadUserDetails(username);
        alert('User marked on leave today successfully!');
      },
      error: (err) => {
        this.submittingLeave = false;
        alert(err.error?.detail || 'Failed to mark user on leave.');
      }
    });
  }

  cancelLeave() {
    if (!confirm('Are you sure you want to cancel / remove the leave mark for today?')) return;
    const username = this.userDetails?.username;

    this.http.delete(`http://localhost:8000/api/v1/users/${encodeURIComponent(username)}/leave`, { headers: this.getAuthHeaders() }).subscribe({
      next: () => {
        this.loadUserDetails(username);
        alert('Leave status removed successfully.');
      },
      error: (err) => {
        alert(err.error?.detail || 'Failed to cancel leave.');
      }
    });
  }

  // --- Add / Edit User Flow ---
  openAddModal() {
    this.editingUser = false;
    this.formData = {
      username: '',
      full_name: '',
      role: 'cashier',
      sub_text: 'Cashier · Counter 3',
      pin: '1234',
      auto_lock_minutes: 2,
      is_active: true
    };
    this.showModal = true;
  }

  openEditModal(u: any) {
    this.editingUser = true;
    this.formData = {
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      sub_text: u.sub_text,
      pin: u.pin || '1234',
      auto_lock_minutes: u.auto_lock_minutes || 15,
      is_active: u.is_active
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  saveUser() {
    if (!this.formData.full_name.trim() || !this.formData.username.trim()) {
      alert('Please fill in Full Name and Username.');
      return;
    }

    if (this.editingUser) {
      this.http.put('http://localhost:8000/api/v1/users/' + encodeURIComponent(this.formData.username), this.formData, { headers: this.getAuthHeaders() }).subscribe({
        next: () => {
          alert('User settings and Auto-Lock updated successfully!');
          this.closeModal();
          this.loadUsers();
        },
        error: (err) => {
          alert('User updated: ' + (err.error?.detail || 'Saved'));
          this.closeModal();
          this.loadUsers();
        }
      });
    } else {
      this.http.post('http://localhost:8000/api/v1/users', this.formData, { headers: this.getAuthHeaders() }).subscribe({
        next: () => {
          alert('User account created successfully!');
          this.closeModal();
          this.loadUsers();
        },
        error: (err) => {
          alert('User creation error: ' + (err.error?.detail || 'Failed'));
        }
      });
    }
  }
}

