import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ACCESS_MODULES, AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';

export interface DaySchedule {
  active: boolean;
  start: string;
  end: string;
}

export type ScheduleMap = Record<string, DaySchedule>;

export interface UserPerformanceDaily {
  login: string;
  logout: string;
  hrs: number;
  bills: number;
  sales: number;
  returns: number;
  returnAmt: number;
  cancels: number;
  cash: number;
  card: number;
  upi: number;
}

export interface UserAccountData {
  key: string;
  name: string;
  username: string;
  role: 'Admin' | 'Cashier';
  avatar: string;
  sub: string;
  status: 'Active' | 'Disabled';
  /** Admin marked the user as on leave (they cannot sign in until marked as returned). */
  onLeave?: boolean;
  leaveReason?: string | null;
  autoLock: string;
  pin: string;
  schedule: ScheduleMap;
  daily: Record<string, UserPerformanceDaily>;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-UM-001..004</span>
          <h1>Users &amp; Roles</h1>
          <p>Manage access roles, credentials, and review detailed user productivity &amp; sales performance metrics.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openAddUserModal()">+ Add User</button>
        </div>
      </div>

      <!-- Date Range Filter Bar for User Performance -->
      <div class="filter-bar" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-3)">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3)">
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <span class="text-xs text-muted" style="font-weight:600">From Date:</span>
            <input class="input" type="date" [(ngModel)]="perfFromDate" style="width:145px;min-height:36px">
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <span class="text-xs text-muted" style="font-weight:600">To Date:</span>
            <input class="input" type="date" [(ngModel)]="perfToDate" style="width:145px;min-height:36px">
          </div>
          <div class="chip-group" style="display:flex;gap:var(--space-1);border:1px solid var(--border);padding:2px;border-radius:var(--radius-md);background:var(--slate-50)">
            <button type="button" class="btn btn-ghost btn-xs" [style.background]="quickRange === 'today' ? 'var(--surface)' : 'transparent'" [style.fontWeight]="quickRange === 'today' ? '700' : '500'" (click)="setQuickDateRange('today')" style="min-height:28px;padding:0 10px;font-size:12px;border-radius:4px">Today</button>
            <button type="button" class="btn btn-ghost btn-xs" [style.background]="quickRange === 'yesterday' ? 'var(--surface)' : 'transparent'" [style.fontWeight]="quickRange === 'yesterday' ? '700' : '500'" (click)="setQuickDateRange('yesterday')" style="min-height:28px;padding:0 10px;font-size:12px;border-radius:4px">Yesterday</button>
            <button type="button" class="btn btn-ghost btn-xs" [style.background]="quickRange === 'this_week' ? 'var(--surface)' : 'transparent'" [style.fontWeight]="quickRange === 'this_week' ? '700' : '500'" (click)="setQuickDateRange('this_week')" style="min-height:28px;padding:0 10px;font-size:12px;border-radius:4px">This Week</button>
            <button type="button" class="btn btn-ghost btn-xs" [style.background]="quickRange === 'this_month' ? 'var(--surface)' : 'transparent'" [style.fontWeight]="quickRange === 'this_month' ? '700' : '500'" (click)="setQuickDateRange('this_month')" style="min-height:28px;padding:0 10px;font-size:12px;border-radius:4px">This Month</button>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button type="button" class="btn btn-primary btn-sm" (click)="applyDateRange()">Apply</button>
          <button type="button" class="btn btn-secondary btn-sm" (click)="clearDateRange()">Clear</button>
        </div>
      </div>

      <div class="tabs">
        <div class="tab" [class.active]="activeTab === 'performance'" (click)="activeTab = 'performance'">User Performance Metrics</div>
        <div class="tab" [class.active]="activeTab === 'accounts'" (click)="activeTab = 'accounts'">User Accounts &amp; Roles</div>
        <div class="tab" [class.active]="activeTab === 'audit'" (click)="activeTab = 'audit'">Action Audit Log</div>
      </div>

      <!-- ================= TAB 1: USER PERFORMANCE METRICS ================= -->
      @if (activeTab === 'performance') {
        <div class="grid grid-4" style="margin-bottom:var(--space-5)">
          <div class="card stat-card">
            <span class="stat-label">Total Staff Shifts</span>
            <span class="stat-value">{{ perfStats.totalShifts }} Shifts</span>
            <span class="stat-delta up">{{ formattedPeriodLabel }}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Total Rung Up</span>
            <span class="stat-value">₹{{ Math.round(perfStats.totalSales).toLocaleString('en-IN') }}</span>
            <span class="stat-delta up">across all staff</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Average Bill Value</span>
            <span class="stat-value">₹{{ perfStats.avgBill.toFixed(2) }}</span>
          </div>
          <div class="card stat-card">
            <span class="stat-label">Total Staff Hours</span>
            <span class="stat-value">{{ perfStats.totalHours.toFixed(0) }} hrs</span>
            <span class="stat-delta down">{{ activeAccountCount }} active accounts</span>
          </div>
        </div>

        <div class="card card-flush">
          <div class="card-header row-between">
            <h3>Staff Performance &amp; Productivity Overview</h3>
            <span class="text-sm text-muted">Showing data for: {{ formattedPeriodLabel }}</span>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>User &amp; Role</th>
                  <th>Shift Login / Logout</th>
                  <th class="num">Working Hours</th>
                  <th class="num">Bills Completed</th>
                  <th class="num">Total Sales Amount</th>
                  <th class="num">Avg Bill Value</th>
                  <th class="num">Returns</th>
                  <th class="num">Cancelled Bills</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (row of staffPerformanceRows; track row.key) {
                  <tr>
                    <td>
                      <div class="row" style="gap:var(--space-2);align-items:center">
                        <div class="avatar" style="width:28px;height:28px;font-size:11px">{{ row.avatar }}</div>
                        <div>
                          <strong>{{ row.name }}</strong>
                          <div class="text-xs text-muted">{{ row.role }} &middot; {{ row.username }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="mono text-xs">{{ row.loginTime }} – {{ row.logoutTime }}</span>
                    </td>
                    <td class="num mono">{{ row.workHours.toFixed(1) }} hrs</td>
                    <td class="num mono font-bold">{{ row.bills }}</td>
                    <td class="num mono font-bold">₹{{ row.sales.toLocaleString('en-IN') }}</td>
                    <td class="num mono">₹{{ row.avgBill.toFixed(2) }}</td>
                    <td class="num mono" [style.color]="row.returns > 0 ? 'var(--danger-700)' : 'inherit'">{{ row.returns }}</td>
                    <td class="num mono" [style.color]="row.cancels > 0 ? 'var(--warning-700)' : 'inherit'">{{ row.cancels }}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm" (click)="openDetailModal(row.key)">View Details</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- ================= TAB 2: ACCOUNTS & ROLES (Matches Reference Image) ================= -->
      @if (activeTab === 'accounts') {
        @if (pendingResetRequests.length > 0) {
          <div class="card" style="background:#fffbeb;border:1px solid #fef3c7;margin-bottom:var(--space-4);padding:var(--space-4);border-radius:var(--radius-md)">
            <div class="row-between" style="align-items:center">
              <div>
                <h4 style="margin:0;color:#92400e;display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-base);font-weight:700">
                  <span>⚠️</span> Pending PIN Reset Requests ({{ pendingResetRequests.length }})
                </h4>
                <p class="text-xs text-muted" style="margin:var(--space-1) 0 0 0">
                  Cashiers have requested credential resets. Review and reset their PINs below.
                </p>
              </div>
            </div>
            <div style="margin-top:var(--space-3);display:flex;flex-direction:column;gap:var(--space-2)">
              @for (req of pendingResetRequests; track req.id) {
                <div class="row-between" style="background:#fff;padding:var(--space-2) var(--space-3);border:1px solid var(--border);border-radius:var(--radius-sm);align-items:center">
                  <div>
                    <strong class="mono text-xs">{{ req.username }}</strong>
                    <span class="text-xs text-muted" style="margin-left:var(--space-2)">{{ req.details?.notes || 'Forgot PIN requested' }} ({{ req.timestamp | slice:0:19 }})</span>
                  </div>
                  <button class="btn btn-primary btn-xs" (click)="openResetPinModal(req.username)">Reset PIN</button>
                </div>
              }
            </div>
          </div>
        }

        <div class="grid grid-2" style="margin-bottom:var(--space-5)">
          <div class="card">
            <div class="row" style="gap:var(--space-3);margin-bottom:var(--space-3);align-items:center">
              <span class="badge badge-primary">Admin</span>
              <h4 style="margin:0;font-size:var(--text-base);font-weight:700">Full access</h4>
            </div>
            <p class="text-sm text-muted" style="margin:0;line-height:1.5">Item/stock upload, vendor management, POs, tax/store configuration, reports, backup, user management, price overrides and discount approval.</p>
          </div>
          <div class="card">
            <div class="row" style="gap:var(--space-3);margin-bottom:var(--space-3);align-items:center">
              <span class="badge badge-neutral">Cashier</span>
              <h4 style="margin:0;font-size:var(--text-base);font-weight:700">Billing screen access only</h4>
            </div>
            <p class="text-sm text-muted" style="margin:0;line-height:1.5">Ring up sales, hold/recall bills, process returns. No access to procurement, stock maintenance, reports, tax or settings.</p>
          </div>
        </div>

        <div class="card card-flush">
          <div class="card-header row-between" style="padding:var(--space-4) var(--space-5)">
            <h3 style="margin:0;font-size:var(--text-lg);font-weight:700">Configured User Accounts &amp; Schedules</h3>
            <button class="btn btn-primary btn-sm" (click)="openAddUserModal()">+ Add User</button>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th style="font-size:11px;letter-spacing:0.04em">NAME</th>
                  <th style="font-size:11px;letter-spacing:0.04em">USERNAME</th>
                  <th style="font-size:11px;letter-spacing:0.04em">ROLE</th>
                  <th style="font-size:11px;letter-spacing:0.04em">WORKING SCHEDULE</th>
                  <th style="font-size:11px;letter-spacing:0.04em">STATUS</th>
                  <th style="font-size:11px;letter-spacing:0.04em">AUTO-LOCK</th>
                  <th style="font-size:11px;letter-spacing:0.04em">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                @for (u of userList; track u.key) {
                  <tr>
                    <td><strong>{{ u.name }}</strong></td>
                    <td class="mono text-xs">{{ u.username }}</td>
                    <td>
                      <span class="badge" [class.badge-primary]="u.role === 'Admin'" [class.badge-neutral]="u.role !== 'Admin'">
                        {{ u.role }}
                      </span>
                    </td>
                    <td>
                      <span class="mono text-xs" style="max-width:320px;display:inline-block;white-space:normal;line-height:1.4">
                        {{ formatWorkingSchedule(u.schedule) }}
                      </span>
                    </td>
                    <td>
                      @if (u.status === 'Active' && u.onLeave) {
                        <span class="badge badge-warning">On Leave</span>
                        @if (u.leaveReason) { <div class="text-xs text-muted" style="max-width:220px;white-space:normal;margin-top:2px">Reason: {{ u.leaveReason }}</div> }
                      } @else {
                        <span class="badge" [class.badge-success]="u.status === 'Active'" [class.badge-danger]="u.status !== 'Active'">
                          {{ u.status }}
                        </span>
                      }
                    </td>
                    <td class="text-xs">{{ u.autoLock || '2 min' }}</td>
                    <td>
                      <div class="row" style="gap:var(--space-2);align-items:center">
                        <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--text)" (click)="openEditUserModal(u.key)">Edit</button>
                        <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--primary)" (click)="openResetPinModal(u.username)">Reset PIN</button>
                        @if (auth.isAdmin() && !isSelf(u.username)) {
                          <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--primary)" (click)="openAccessModal(u)">User Access</button>
                        }
                        <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--text)" (click)="toggleUserStatus(u.key)">
                          {{ u.status === 'Active' ? 'Disable' : 'Enable' }}
                        </button>
                        @if (isSelf(u.username) && u.role === 'Admin') {
                          <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--primary)" (click)="openTransferModal()">Transfer Admin Role</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- ================= TAB 3: ACTION AUDIT LOG ================= -->
      @if (activeTab === 'audit') {
        <div class="card card-flush">
          <div class="card-header">
            <h3>Audit &amp; Action Log</h3>
            <span class="text-sm text-muted">Who created, edited, approved or cancelled a bill or PO</span>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                @for (log of auditLogs; track log.ref + log.time) {
                  <tr>
                    <td class="mono text-xs">{{ log.time }}</td>
                    <td><strong>{{ log.user }}</strong></td>
                    <td><span class="badge badge-neutral">{{ log.action }}</span></td>
                    <td class="mono text-sm">{{ log.ref }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

    </main>

    <!-- ================= USER PERFORMANCE DETAIL MODAL ================= -->
    <div class="modal-overlay" [class.open]="showDetailModal">
      <div class="modal modal-lg">
        <div class="modal-header">
          <div class="row" style="gap:var(--space-3);align-items:center">
            <div class="avatar">{{ selectedUserDetail?.avatar }}</div>
            <div>
              <h3>{{ selectedUserDetail?.name }}</h3>
              <div class="text-xs text-muted">{{ selectedUserDetail?.sub }}</div>
            </div>
          </div>
          <div class="row" style="gap:var(--space-2);align-items:center">
            @if (detailUser(); as du) {
              @if (du.status === 'Active' && du.onLeave) { <span class="badge badge-warning">On Leave</span> }
              @if (du.status === 'Active' && du.username !== auth.currentUser().username) {
                @if (du.onLeave) {
                  <button class="btn btn-secondary btn-sm" style="color:var(--success-700)" (click)="returnFromLeave(du.key)">Return from Leave</button>
                } @else {
                  <button class="btn btn-secondary btn-sm" style="color:var(--warning-700)" (click)="openLeaveModal(du.key)">Mark on Leave</button>
                }
              }
            }
            <button class="icon-btn" (click)="showDetailModal = false">✕</button>
          </div>
        </div>
        <div class="modal-body stack">
          <div class="grid grid-3" style="gap:var(--space-3)">
            <div class="card" style="background:var(--slate-50);padding:var(--space-3)">
              <div class="text-xs text-muted">Total Sales Amount</div>
              <strong class="mono" style="font-size:var(--text-lg)">₹{{ Math.round(selectedUserDetail?.totalSales || 0).toLocaleString('en-IN') }}.00</strong>
            </div>
            <div class="card" style="background:var(--slate-50);padding:var(--space-3)">
              <div class="text-xs text-muted">Completed Bills</div>
              <strong class="mono" style="font-size:var(--text-lg)">{{ selectedUserDetail?.totalBills }} bills</strong>
            </div>
            <div class="card" style="background:var(--slate-50);padding:var(--space-3)">
              <div class="text-xs text-muted">Avg Bill Value</div>
              <strong class="mono" style="font-size:var(--text-lg)">₹{{ selectedUserDetail?.avgBill?.toFixed(2) }}</strong>
            </div>
            <div class="card" style="background:var(--slate-50);padding:var(--space-3)">
              <div class="text-xs text-muted">Working Hours</div>
              <strong class="mono" style="font-size:var(--text-lg)">{{ selectedUserDetail?.workHours?.toFixed(1) }} hrs</strong>
            </div>
            <div class="card" style="background:var(--slate-50);padding:var(--space-3)">
              <div class="text-xs text-muted">Returns Processed</div>
              <strong class="mono" style="font-size:var(--text-lg);color:var(--danger-700)">{{ selectedUserDetail?.returns }} (₹{{ selectedUserDetail?.returnAmt?.toFixed(2) }})</strong>
            </div>
            <div class="card" style="background:var(--slate-50);padding:var(--space-3)">
              <div class="text-xs text-muted">Cancelled Bills</div>
              <strong class="mono" style="font-size:var(--text-lg);color:var(--warning-700)">{{ selectedUserDetail?.cancels }} bills</strong>
            </div>
          </div>

          <div class="grid grid-2" style="align-items:start">
            <div class="card card-flush">
              <div class="card-header"><h3>Shift Log &amp; Work Hours</h3></div>
              <div class="card-body stack" style="padding:var(--space-4)">
                <div class="row-between text-sm"><span>Shift Start Time:</span><strong class="mono">{{ selectedUserDetail?.latestLogin }}</strong></div>
                <div class="row-between text-sm"><span>Shift End Time:</span><strong class="mono">{{ selectedUserDetail?.latestLogout }}</strong></div>
                <div class="row-between text-sm"><span>Shift Duration:</span><span class="badge badge-success">{{ selectedUserDetail?.shiftDuration }}</span></div>
                <div class="row-between text-sm" style="border-top:1px solid var(--border);padding-top:var(--space-2);margin-top:var(--space-2)">
                  <span>Configured Schedule:</span>
                  <strong class="mono text-xs" style="text-align:right;max-width:240px;color:var(--primary)">
                    {{ formatWorkingSchedule(selectedUserDetail?.schedule) }}
                  </strong>
                </div>
              </div>
            </div>
            <div class="card card-flush">
              <div class="card-header"><h3>Payment Mode Collection</h3></div>
              <div class="card-body stack" style="padding:var(--space-4)">
                <div class="row-between text-sm"><span>Cash Collected</span><strong class="mono">₹{{ Math.round(selectedUserDetail?.cash || 0).toLocaleString('en-IN') }}.00</strong></div>
                <div class="row-between text-sm"><span>Card Payments</span><strong class="mono">₹{{ Math.round(selectedUserDetail?.card || 0).toLocaleString('en-IN') }}.00</strong></div>
                <div class="row-between text-sm"><span>UPI Payments</span><strong class="mono">₹{{ Math.round(selectedUserDetail?.upi || 0).toLocaleString('en-IN') }}.00</strong></div>
              </div>
            </div>
          </div>

          <div class="card card-flush">
            <div class="card-header"><h3>Recent Activity Timeline</h3></div>
            <div class="table-scroll" style="max-height:220px;overflow-y:auto">
              <table class="table text-sm">
                <thead><tr><th>Time</th><th>Action</th><th>Reference</th><th class="num">Amount</th></tr></thead>
                <tbody>
                  @for (act of selectedUserDetail?.activities; track act.ref + act.time) {
                    <tr>
                      <td class="mono text-xs">{{ act.time }}</td>
                      <td>{{ act.action }}</td>
                      <td class="mono text-xs">{{ act.ref }}</td>
                      <td class="num mono">₹{{ act.amount.toFixed(2) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showDetailModal = false">Close</button>
        </div>
      </div>
    </div>

    <!-- ================= ADD / EDIT USER MODAL ================= -->
    <div class="modal-overlay" [class.open]="showLeaveModal">
      <div class="modal">
        <div class="modal-header">
          <h3>Mark on Leave — {{ leaveUserName }}</h3>
          <button class="icon-btn" (click)="showLeaveModal = false">✕</button>
        </div>
        <div class="modal-body stack">
          <p class="text-sm text-muted" style="margin:0">While on leave this user cannot sign in. Use "Return from Leave" to restore access.</p>
          <div class="field">
            <label for="leaveReason">Reason for leave</label>
            <textarea class="input" id="leaveReason" rows="3" [(ngModel)]="leaveReason" placeholder="e.g. Medical leave until 8 Oct" maxlength="200"></textarea>
          </div>
          @if (leaveError) { <span class="hint" style="color:var(--danger-700)">{{ leaveError }}</span> }
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showLeaveModal = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSavingLeave" (click)="confirmLeave()">{{ isSavingLeave ? 'Saving...' : 'Mark on Leave' }}</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" [class.open]="showAddEditModal">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>{{ editKey ? 'Edit User Account — ' + formName : 'Add User Account' }}</h3>
          <button class="icon-btn" (click)="showAddEditModal = false">✕</button>
        </div>
        <div class="modal-body stack">
          <div class="form-grid">
            <div class="field">
              <label>Full Name</label>
              <input class="input" [(ngModel)]="formName" placeholder="e.g. Sana R.">
            </div>
            <div class="field">
              <label>Username</label>
              <input class="input" [(ngModel)]="formUsername" placeholder="e.g. sana.r">
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Role</label>
              <select class="select" [(ngModel)]="formRole" [disabled]="isSelf(formUsername)">
                <option value="Cashier">Cashier</option>
                <option value="Admin">Admin</option>
              </select>
              @if (isSelf(formUsername)) { <span class="hint">Your admin role is fixed. Use “Transfer Admin Role” to hand it to someone else.</span> }
            </div>
            <div class="field">
              <label>Set 4-digit PIN</label>
              <input class="input mono" type="password" maxlength="4" [(ngModel)]="formPin" placeholder="••••">
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Account Status</label>
              <select class="select" [(ngModel)]="formStatus">
                <option value="Active">Active</option>
                <option value="Disabled">Disabled</option>
              </select>
            </div>
            <div class="field">
              <label>Auto-Lock After</label>
              <select class="select" [(ngModel)]="formAutoLock">
                <option value="1 min">1 min</option>
                <option value="2 min">2 min</option>
                <option value="5 min">5 min</option>
                <option value="15 min">15 min</option>
                <option value="30 min">30 min</option>
              </select>
            </div>
          </div>

          <!-- Working Schedule Section -->
          <div class="field" style="border-top:1px solid var(--border);padding-top:var(--space-4);margin-top:var(--space-2)">
            <label style="font-weight:700;font-size:var(--text-base)">Working Schedule Configuration</label>
            <span class="hint">Select working days and set shift Start Time and End Time for each active day. Unchecked days are set to Off.</span>
            
            <div class="table-scroll" style="margin-top:var(--space-3)">
              <table class="table text-sm" style="background:var(--slate-50);border:1px solid var(--border);border-radius:var(--radius-md)">
                <thead>
                  <tr>
                    <th style="width:140px">Working Day</th>
                    <th style="width:100px">Status</th>
                    <th>Shift Start Time</th>
                    <th>Shift End Time</th>
                  </tr>
                </thead>
                <tbody>
                  @for (day of daysList; track day) {
                    <tr>
                      <td>
                        <label class="checkbox-row" style="font-weight:600">
                          <input type="checkbox" [(ngModel)]="formSchedule[day].active"> {{ day }}
                        </label>
                      </td>
                      <td>
                        <span class="badge" [class.badge-success]="formSchedule[day].active" [class.badge-neutral]="!formSchedule[day].active">
                          {{ formSchedule[day].active ? 'Working' : 'Off' }}
                        </span>
                      </td>
                      <td>
                        <input class="input input-sm mono" type="time" [(ngModel)]="formSchedule[day].start" [disabled]="!formSchedule[day].active" style="width:130px">
                      </td>
                      <td>
                        <input class="input input-sm mono" type="time" [(ngModel)]="formSchedule[day].end" [disabled]="!formSchedule[day].active" style="width:130px">
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showAddEditModal = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSavingUser" (click)="saveUserAccount()">
            {{ isSavingUser ? 'Saving...' : 'Save User Account' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ================= RESET PIN MODAL ================= -->
    <div class="modal-overlay" [class.open]="showResetPinModal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Reset PIN for {{ resetPinUsername }}</h3>
          <button class="icon-btn" (click)="showResetPinModal = false">✕</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label>New 4-Digit PIN</label>
            <input class="input mono" type="password" maxlength="4" [(ngModel)]="resetPinValue" placeholder="••••">
            <span class="hint">Enter new 4-digit PIN for user {{ resetPinUsername }}.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showResetPinModal = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isResettingPin" (click)="confirmResetPin()">
            {{ isResettingPin ? 'Resetting...' : 'Save New PIN' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ================= USER ACCESS MODAL ================= -->
    <div class="modal-overlay" [class.open]="showAccessModal">
      <div class="modal">
        <div class="modal-header">
          <h3>User Access &middot; {{ accessUser?.name }}</h3>
          <button class="icon-btn" (click)="showAccessModal = false">✕</button>
        </div>
        <div class="modal-body stack">
          <p class="text-sm text-muted">Allow or deny each module for this user only. Changes apply to this user straight away and are checked on the server, not just in the menu.</p>
          @if (accessLoading) { <p class="text-sm text-muted">Loading…</p> }
          @else {
            @for (m of accessModules; track m.key) {
              <label class="checkbox-row"><input type="checkbox" [checked]="!!accessChoices[m.key]" (change)="accessChoices[m.key] = $any($event.target).checked"> {{ m.label }}</label>
            }
          }
          @if (accessError) { <div class="text-sm" style="color:var(--danger-700)" role="alert">{{ accessError }}</div> }
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="resetAccessToRoleDefaults()" [disabled]="accessLoading">Role defaults</button>
          <button class="btn btn-secondary" (click)="showAccessModal = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSavingAccess || accessLoading" (click)="saveAccess()">{{ isSavingAccess ? 'Saving...' : 'Save access' }}</button>
        </div>
      </div>
    </div>

    <!-- ================= TRANSFER ADMIN ROLE MODAL ================= -->
    <div class="modal-overlay" [class.open]="showTransferModal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h3>Transfer Admin Role</h3>
          <button class="icon-btn" (click)="showTransferModal = false">✕</button>
        </div>
        <div class="modal-body stack">
          <span class="hint">The selected user becomes the Admin and your account becomes a Cashier. You will be signed out.</span>
          <div class="field">
            <label>Transfer to</label>
            <select class="select" [(ngModel)]="transferTo">
              <option value="">Select a user</option>
              @for (c of transferCandidates(); track c.key) {
                <option [value]="c.username">{{ c.name }} ({{ c.username }})</option>
              }
            </select>
          </div>
          <div class="field">
            <label>Confirm with your PIN / password</label>
            <input class="input mono" type="password" [(ngModel)]="transferPin" placeholder="••••">
          </div>
          @if (transferError) { <span class="hint" style="color:var(--danger-700)">{{ transferError }}</span> }
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showTransferModal = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isTransferring" (click)="confirmTransfer()">{{ isTransferring ? 'Transferring...' : 'Transfer Admin Role' }}</button>
        </div>
      </div>
    </div>

    @if (toastMessage) {
      <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toastMessage }}</span></div></div>
    }
  `
})
export class UsersComponent implements OnInit {
  auth = inject(AuthService);
  api = inject(ApiService);
  router = inject(Router);
  Math = Math;

  activeTab = 'accounts';
  perfFromDate = '2026-09-01';
  perfToDate = '2026-09-10';
  quickRange = 'this_month';
  formattedPeriodLabel = '';

  daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  perfStats = {
    totalShifts: 0,
    totalSales: 0,
    avgBill: 0,
    totalHours: 0
  };

  staffPerformanceRows: any[] = [];
  selectedUserDetail: any = null;
  showDetailModal = false;

  // Add / Edit Modal state
  showAddEditModal = false;
  editKey: string | null = null;
  formName = '';
  formUsername = '';
  formRole: 'Admin' | 'Cashier' = 'Cashier';
  formPin = '';
  formStatus: 'Active' | 'Disabled' = 'Active';

  // Leave
  showLeaveModal = false;
  leaveKey = '';
  leaveUserName = '';
  leaveReason = '';
  leaveError = '';
  isSavingLeave = false;
  formAutoLock = '2 min';
  /** Starts with the default working week so the schedule rows of the (always rendered) Add / Edit dialog never read a missing day. */
  formSchedule: ScheduleMap = Object.fromEntries(this.daysList.map(d => [d, { active: d !== 'Sunday', start: d === 'Saturday' ? '10:00' : '09:00', end: d === 'Saturday' ? '16:00' : '18:00' }]));
  isSavingUser = false;

  // Transfer admin role state
  showTransferModal = false;
  transferTo = '';
  transferPin = '';
  transferError = '';
  isTransferring = false;

  // Reset PIN state
  showResetPinModal = false;
  resetPinUsername = '';
  resetPinValue = '';
  isResettingPin = false;
  pendingResetRequests: any[] = [];

  toastMessage: string | null = null;

  DEFAULT_SCHEDULES: Record<string, ScheduleMap> = {
    priya: {
      Monday: { active: true, start: '09:00', end: '18:00' },
      Tuesday: { active: true, start: '09:00', end: '18:00' },
      Wednesday: { active: true, start: '09:00', end: '18:00' },
      Thursday: { active: true, start: '09:00', end: '18:00' },
      Friday: { active: true, start: '09:00', end: '18:00' },
      Saturday: { active: true, start: '10:00', end: '16:00' },
      Sunday: { active: false, start: '', end: '' }
    },
    arjun: {
      Monday: { active: true, start: '08:30', end: '18:30' },
      Tuesday: { active: true, start: '08:30', end: '18:30' },
      Wednesday: { active: true, start: '08:30', end: '18:30' },
      Thursday: { active: true, start: '08:30', end: '18:30' },
      Friday: { active: true, start: '08:30', end: '18:30' },
      Saturday: { active: true, start: '09:00', end: '17:00' },
      Sunday: { active: false, start: '', end: '' }
    },
    ravi: {
      Monday: { active: true, start: '10:00', end: '18:00' },
      Tuesday: { active: true, start: '10:00', end: '18:00' },
      Wednesday: { active: true, start: '10:00', end: '18:00' },
      Thursday: { active: true, start: '10:00', end: '18:00' },
      Friday: { active: true, start: '10:00', end: '18:00' },
      Saturday: { active: true, start: '10:00', end: '18:00' },
      Sunday: { active: false, start: '', end: '' }
    },
    meena: {
      Monday: { active: true, start: '09:00', end: '17:00' },
      Tuesday: { active: true, start: '09:00', end: '17:00' },
      Wednesday: { active: true, start: '09:00', end: '17:00' },
      Thursday: { active: true, start: '09:00', end: '17:00' },
      Friday: { active: true, start: '09:00', end: '17:00' },
      Saturday: { active: false, start: '', end: '' },
      Sunday: { active: false, start: '', end: '' }
    }
  };

  userAccounts: Record<string, UserAccountData> = {
    priya: {
      key: 'priya', name: 'Priya K.', username: 'priya.k', role: 'Cashier', avatar: 'PK', sub: 'Cashier · Counter 1',
      status: 'Active', autoLock: '2 min', pin: '1234', schedule: this.DEFAULT_SCHEDULES['priya'],
      daily: {
        '2026-09-10': { login: '09:00 AM', logout: '05:15 PM', hrs: 8.25, bills: 52, sales: 22450, returns: 1, returnAmt: 240, cancels: 0, cash: 12300, card: 6800, upi: 3350 },
        '2026-09-09': { login: '08:55 AM', logout: '05:00 PM', hrs: 8.08, bills: 48, sales: 20800, returns: 2, returnAmt: 350, cancels: 1, cash: 11400, card: 6200, upi: 3200 },
        '2026-09-08': { login: '09:05 AM', logout: '05:10 PM', hrs: 8.08, bills: 45, sales: 19500, returns: 0, returnAmt: 0, cancels: 0, cash: 10200, card: 5900, upi: 3400 },
        '2026-09-07': { login: '09:00 AM', logout: '05:00 PM', hrs: 8.00, bills: 42, sales: 18200, returns: 1, returnAmt: 180, cancels: 0, cash: 9800, card: 5400, upi: 3000 },
        '2026-09-06': { login: '09:00 AM', logout: '05:30 PM', hrs: 8.50, bills: 60, sales: 26500, returns: 2, returnAmt: 420, cancels: 1, cash: 14500, card: 8200, upi: 3800 },
        '2026-09-05': { login: '08:50 AM', logout: '05:00 PM', hrs: 8.16, bills: 55, sales: 23900, returns: 1, returnAmt: 210, cancels: 0, cash: 12900, card: 7100, upi: 3900 },
        '2026-09-04': { login: '09:00 AM', logout: '05:00 PM', hrs: 8.00, bills: 46, sales: 19800, returns: 0, returnAmt: 0, cancels: 0, cash: 10800, card: 5900, upi: 3100 },
        '2026-09-03': { login: '09:00 AM', logout: '05:00 PM', hrs: 8.00, bills: 41, sales: 17900, returns: 1, returnAmt: 150, cancels: 0, cash: 9400, card: 5600, upi: 2900 },
        '2026-09-02': { login: '09:10 AM', logout: '05:15 PM', hrs: 8.08, bills: 44, sales: 19100, returns: 2, returnAmt: 280, cancels: 1, cash: 10100, card: 5800, upi: 3200 },
        '2026-09-01': { login: '09:00 AM', logout: '05:00 PM', hrs: 8.00, bills: 40, sales: 17200, returns: 0, returnAmt: 0, cancels: 0, cash: 9100, card: 5200, upi: 2900 }
      }
    },
    arjun: {
      key: 'arjun', name: 'Arjun M.', username: 'owner.arjun', role: 'Admin', avatar: 'AM', sub: 'Admin · Store Manager',
      status: 'Active', autoLock: '15 min', pin: '1234', schedule: this.DEFAULT_SCHEDULES['arjun'],
      daily: {
        '2026-09-10': { login: '08:30 AM', logout: '06:30 PM', hrs: 10.00, bills: 34, sales: 15800, returns: 0, returnAmt: 0, cancels: 0, cash: 8200, card: 4900, upi: 2700 },
        '2026-09-09': { login: '08:30 AM', logout: '06:15 PM', hrs: 9.75, bills: 30, sales: 14200, returns: 1, returnAmt: 190, cancels: 0, cash: 7300, card: 4500, upi: 2400 },
        '2026-09-08': { login: '08:30 AM', logout: '06:00 PM', hrs: 9.50, bills: 28, sales: 13100, returns: 0, returnAmt: 0, cancels: 0, cash: 6800, card: 4100, upi: 2200 },
        '2026-09-07': { login: '08:45 AM', logout: '06:00 PM', hrs: 9.25, bills: 26, sales: 12400, returns: 1, returnAmt: 150, cancels: 0, cash: 6300, card: 3900, upi: 2200 },
        '2026-09-06': { login: '08:30 AM', logout: '07:00 PM', hrs: 10.50, bills: 40, sales: 18900, returns: 0, returnAmt: 0, cancels: 0, cash: 9600, card: 6100, upi: 3200 },
        '2026-09-05': { login: '08:30 AM', logout: '06:30 PM', hrs: 10.00, bills: 36, sales: 16500, returns: 1, returnAmt: 140, cancels: 0, cash: 8400, card: 5200, upi: 2900 },
        '2026-09-04': { login: '08:30 AM', logout: '06:00 PM', hrs: 9.50, bills: 29, sales: 13500, returns: 0, returnAmt: 0, cancels: 0, cash: 6900, card: 4300, upi: 2300 },
        '2026-09-03': { login: '08:30 AM', logout: '06:00 PM', hrs: 9.50, bills: 27, sales: 12600, returns: 0, returnAmt: 0, cancels: 0, cash: 6400, card: 4000, upi: 2200 },
        '2026-09-02': { login: '08:30 AM', logout: '06:15 PM', hrs: 9.75, bills: 28, sales: 13200, returns: 1, returnAmt: 120, cancels: 0, cash: 6700, card: 4200, upi: 2300 },
        '2026-09-01': { login: '08:30 AM', logout: '06:00 PM', hrs: 9.50, bills: 25, sales: 11900, returns: 0, returnAmt: 0, cancels: 0, cash: 6100, card: 3800, upi: 2000 }
      }
    },
    ravi: {
      key: 'ravi', name: 'Ravi S.', username: 'ravi.s', role: 'Cashier', avatar: 'RS', sub: 'Cashier · Counter 2',
      status: 'Active', autoLock: '2 min', pin: '1234', schedule: this.DEFAULT_SCHEDULES['ravi'],
      daily: {
        '2026-09-10': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 40, sales: 13810, returns: 0, returnAmt: 0, cancels: 0, cash: 6010, card: 4190, upi: 3610 },
        '2026-09-09': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 36, sales: 13140, returns: 1, returnAmt: 180, cancels: 0, cash: 5700, card: 4200, upi: 3240 },
        '2026-09-08': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 35, sales: 12930, returns: 1, returnAmt: 150, cancels: 0, cash: 5600, card: 4100, upi: 3230 },
        '2026-09-07': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 34, sales: 12420, returns: 0, returnAmt: 0, cancels: 0, cash: 5400, card: 3900, upi: 3120 },
        '2026-09-06': { login: '10:00 AM', logout: '06:30 PM', hrs: 8.50, bills: 38, sales: 15690, returns: 1, returnAmt: 220, cancels: 0, cash: 6900, card: 4900, upi: 3890 },
        '2026-09-05': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 31, sales: 11210, returns: 0, returnAmt: 0, cancels: 0, cash: 4900, card: 3600, upi: 2710 },
        '2026-09-04': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 30, sales: 11490, returns: 0, returnAmt: 0, cancels: 0, cash: 5000, card: 3700, upi: 2790 },
        '2026-09-03': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 30, sales: 11040, returns: 0, returnAmt: 0, cancels: 0, cash: 4800, card: 3500, upi: 2740 },
        '2026-09-02': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 29, sales: 11030, returns: 1, returnAmt: 140, cancels: 0, cash: 4800, card: 3500, upi: 2730 },
        '2026-09-01': { login: '10:00 AM', logout: '06:00 PM', hrs: 8.00, bills: 29, sales: 10830, returns: 0, returnAmt: 0, cancels: 0, cash: 4700, card: 3400, upi: 2730 }
      }
    },
    meena: {
      key: 'meena', name: 'Meena T.', username: 'meena.t', role: 'Cashier', avatar: 'MT', sub: 'Relief Cashier',
      status: 'Disabled', autoLock: '2 min', pin: '1234', schedule: this.DEFAULT_SCHEDULES['meena'],
      daily: {}
    }
  };

  auditLogs = [
    { time: '2026-09-10 09:14:02', user: 'Priya K.', action: 'Bill created', ref: 'INV-FY26-01031' },
    { time: '2026-09-10 10:02:47', user: 'Priya K.', action: 'Bill completed', ref: 'INV-FY26-01031' },
    { time: '2026-09-10 11:47:11', user: 'Arjun M.', action: 'Discount approved (15%)', ref: 'INV-FY26-00988' },
    { time: '2026-09-10 11:47:38', user: 'Arjun M.', action: 'Return processed', ref: 'INV-FY26-00988' },
    { time: '2026-09-10 13:20:05', user: 'Ravi S.', action: 'Bill parked (hold)', ref: 'HOLD-3341' },
    { time: '2026-09-10 13:26:52', user: 'Ravi S.', action: 'Bill recalled & completed', ref: 'INV-FY26-01032' },
    { time: '2026-09-09 16:10:15', user: 'Priya K.', action: 'Bill cancelled', ref: 'INV-FY26-00962' },
    { time: '2026-09-08 14:05:30', user: 'Ravi S.', action: 'Return processed', ref: 'INV-FY26-00910' }
  ];

  get userList(): UserAccountData[] {
    return Object.values(this.userAccounts);
  }

  get activeAccountCount(): number {
    return this.userList.filter(u => u.status === 'Active').length;
  }

  async ngOnInit() {
    // The prototype's sample staff and audit trail belong to the original store only; a tenant lists just its own users.
    const owner = localStorage.getItem('pos_cache_owner');
    if (owner && owner !== 'default') {
      this.userAccounts = {};
      this.auditLogs = [];
    }
    const saved = localStorage.getItem('pos_p2_user_accounts_v2');
    if (saved) {
      try { this.userAccounts = JSON.parse(saved); } catch {}
    }
    this.setQuickDateRange('this_month');
    await this.loadDataFromBackend();
  }

  async loadDataFromBackend() {
    try {
      const users = await this.api.getUsers();
      if (users && users.length > 0) {
        users.forEach((u: any) => {
          const key = u.username.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!this.userAccounts[key]) {
            this.userAccounts[key] = {
              key,
              name: u.full_name,
              username: u.username,
              role: u.role.toLowerCase() === 'admin' ? 'Admin' : 'Cashier',
              avatar: u.full_name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2),
              sub: u.sub_text || `${u.role} · Counter Staff`,
              status: u.is_active ? 'Active' : 'Disabled',
              onLeave: !!u.on_leave,
              leaveReason: u.leave_reason || null,
              autoLock: u.auto_lock || '2 min',
              pin: '••••',
              schedule: this.DEFAULT_SCHEDULES[key] || this.DEFAULT_SCHEDULES['priya'],
              daily: {}
            };
          } else {
            this.userAccounts[key].name = u.full_name;
            this.userAccounts[key].status = u.is_active ? 'Active' : 'Disabled';
            this.userAccounts[key].onLeave = !!u.on_leave;
            this.userAccounts[key].leaveReason = u.leave_reason || null;
            this.userAccounts[key].role = u.role.toLowerCase() === 'admin' ? 'Admin' : 'Cashier';
          }
        });
        this.saveAccountsToStorage();
      }
    } catch {}

    await this.loadPendingResetRequests();
    await this.loadAuditLogs();
  }

  async loadPendingResetRequests() {
    try {
      const requests = await this.api.getPinResetRequests();
      this.pendingResetRequests = (requests || []).filter((r: any) => r.action === 'FORGOT_PIN_REQUESTED' && (!r.details?.status || r.details.status === 'PENDING'));
    } catch {
      this.pendingResetRequests = [];
    }
  }

  async loadAuditLogs() {
    try {
      const logs = await this.api.getAuditLogs();
      if (logs && logs.length > 0) {
        this.auditLogs = logs.map((l: any) => ({
          time: l.timestamp ? l.timestamp.replace('T', ' ').slice(0, 19) : new Date().toISOString().slice(0, 19),
          user: l.username,
          action: l.action.replace(/_/g, ' '),
          ref: l.details ? (typeof l.details === 'string' ? l.details : JSON.stringify(l.details)) : 'N/A'
        }));
      }
    } catch {}
  }

  saveAccountsToStorage() {
    localStorage.setItem('pos_p2_user_accounts_v2', JSON.stringify(this.userAccounts));
  }

  formatTime12(tStr: string): string {
    if (!tStr) return '';
    const parts = tStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return (h < 10 ? '0' + h : h) + ':' + m + ' ' + ampm;
  }

  formatWorkingSchedule(schedule: ScheduleMap): string {
    if (!schedule) return 'Schedule Not Set';
    const activeGroups: string[] = [];
    const offDays: string[] = [];

    let i = 0;
    while (i < this.daysList.length) {
      const d = this.daysList[i];
      const info = schedule[d];
      if (!info || !info.active) {
        offDays.push(d);
        i++;
        continue;
      }

      const start = info.start;
      const end = info.end;
      const timeKey = `${this.formatTime12(start)}–${this.formatTime12(end)}`;
      const startDay = d;
      let endDay = d;

      while (i + 1 < this.daysList.length) {
        const nextDay = this.daysList[i + 1];
        const nextInfo = schedule[nextDay];
        if (nextInfo && nextInfo.active && nextInfo.start === start && nextInfo.end === end) {
          endDay = nextDay;
          i++;
        } else {
          break;
        }
      }

      const dayRange = startDay === endDay ? startDay : `${startDay}–${endDay}`;
      activeGroups.push(`${dayRange} ${timeKey}`);
      i++;
    }

    if (offDays.length > 0) {
      const offRanges: string[] = [];
      let j = 0;
      while (j < offDays.length) {
        const sOff = offDays[j];
        let eOff = sOff;
        while (j + 1 < offDays.length && this.daysList.indexOf(offDays[j + 1]) === this.daysList.indexOf(eOff) + 1) {
          eOff = offDays[j + 1];
          j++;
        }
        offRanges.push(sOff === eOff ? sOff : `${sOff}–${eOff}`);
        j++;
      }
      if (activeGroups.length === 0) return 'All days Off';
      activeGroups.push(`${offRanges.join(', ')} Off`);
    }

    return activeGroups.join(', ');
  }

  setQuickDateRange(key: string) {
    this.quickRange = key;
    const todayStr = '2026-09-10';
    let fromStr = todayStr;
    let toStr = todayStr;

    if (key === 'today') { fromStr = '2026-09-10'; toStr = '2026-09-10'; }
    else if (key === 'yesterday') { fromStr = '2026-09-09'; toStr = '2026-09-09'; }
    else if (key === 'this_week') { fromStr = '2026-09-07'; toStr = '2026-09-10'; }
    else if (key === 'this_month') { fromStr = '2026-09-01'; toStr = '2026-09-10'; }

    this.perfFromDate = fromStr;
    this.perfToDate = toStr;
    this.updateUserPerformance();
  }

  applyDateRange() {
    this.quickRange = '';
    if (!this.perfFromDate || !this.perfToDate) {
      alert('Select both From and To dates');
      return;
    }
    if (this.perfFromDate > this.perfToDate) {
      alert('From date cannot be after To date');
      return;
    }
    this.updateUserPerformance();
  }

  clearDateRange() {
    this.setQuickDateRange('this_month');
  }

  formatDateLabel(dStr: string): string {
    if (!dStr) return '';
    const parts = dStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + ' ' + months[mIdx] + ' ' + parts[0];
  }

  updateUserPerformance() {
    this.formattedPeriodLabel =
      this.formatDateLabel(this.perfFromDate) + (this.perfFromDate === this.perfToDate ? '' : ' – ' + this.formatDateLabel(this.perfToDate));

    let totalShifts = 0;
    let totalSales = 0;
    let totalBills = 0;
    let totalHours = 0;

    const rows: any[] = [];

    Object.keys(this.userAccounts).forEach(k => {
      const u = this.userAccounts[k];
      let userShifts = 0;
      let userSales = 0;
      let userBills = 0;
      let userHours = 0;
      let userReturns = 0;
      let userCancels = 0;
      let userReturnAmt = 0;
      let latestLogin = '—';
      let latestLogout = '—';

      if (u.daily) {
        Object.keys(u.daily).forEach(day => {
          if (day >= this.perfFromDate && day <= this.perfToDate) {
            const d = u.daily[day];
            if (d.hrs > 0 || d.bills > 0) {
              userShifts++;
              userSales += d.sales;
              userBills += d.bills;
              userHours += d.hrs;
              userReturns += d.returns || 0;
              userReturnAmt += d.returnAmt || 0;
              userCancels += d.cancels || 0;
              latestLogin = d.login;
              latestLogout = d.logout;
            }
          }
        });
      }

      totalShifts += userShifts;
      totalSales += userSales;
      totalBills += userBills;
      totalHours += userHours;

      const avg = userBills > 0 ? (userSales / userBills) : 0;

      rows.push({
        key: k,
        name: u.name,
        username: u.username,
        role: u.role,
        avatar: u.avatar,
        loginTime: latestLogin,
        logoutTime: latestLogout,
        workHours: userHours,
        bills: userBills,
        sales: userSales,
        avgBill: avg,
        returns: userReturns,
        returnAmt: userReturnAmt,
        cancels: userCancels
      });
    });

    this.perfStats = {
      totalShifts,
      totalSales,
      avgBill: totalBills > 0 ? totalSales / totalBills : 0,
      totalHours
    };

    this.staffPerformanceRows = rows;
  }

  openDetailModal(key: string) {
    const u = this.userAccounts[key];
    if (!u) return;

    let userSales = 0;
    let userBills = 0;
    let userHours = 0;
    let userReturns = 0;
    let userReturnAmt = 0;
    let userCancels = 0;
    let cash = 0;
    let card = 0;
    let upi = 0;
    let latestLogin = '09:00 AM (10 Sep 2026)';
    let latestLogout = '05:15 PM (10 Sep 2026)';

    if (u.daily) {
      Object.keys(u.daily).forEach(day => {
        if (day >= this.perfFromDate && day <= this.perfToDate) {
          const d = u.daily[day];
          userSales += d.sales;
          userBills += d.bills;
          userHours += d.hrs;
          userReturns += d.returns || 0;
          userReturnAmt += d.returnAmt || 0;
          userCancels += d.cancels || 0;
          cash += d.cash || 0;
          card += d.card || 0;
          upi += d.upi || 0;
          if (d.login && d.login !== '—') {
            latestLogin = `${d.login} (${this.formatDateLabel(day)})`;
            latestLogout = `${d.logout} (${this.formatDateLabel(day)})`;
          }
        }
      });
    }

    const avg = userBills > 0 ? userSales / userBills : 0;

    const activities = [
      { time: '14:25:10', action: 'Bill Completed', ref: 'INV-FY26-01031', amount: 480.0 },
      { time: '14:12:05', action: 'Bill Completed', ref: 'INV-FY26-01030', amount: 210.0 },
      { time: '13:50:40', action: 'Return Processed', ref: 'INV-FY26-00988', amount: -240.0 },
      { time: '13:34:15', action: 'Bill Completed', ref: 'INV-FY26-01029', amount: 650.0 },
      { time: '12:45:00', action: 'Bill Parked (Hold)', ref: 'HOLD-3341', amount: 320.0 }
    ];

    this.selectedUserDetail = {
      key: u.key,
      name: u.name,
      avatar: u.avatar,
      sub: u.sub,
      role: u.role,
      schedule: u.schedule,
      totalSales: userSales,
      totalBills: userBills,
      avgBill: avg,
      workHours: userHours,
      returns: userReturns,
      returnAmt: userReturnAmt,
      cancels: userCancels,
      latestLogin,
      latestLogout,
      shiftDuration: `${userHours.toFixed(1)} hrs total`,
      cash,
      card,
      upi,
      activities
    };

    this.showDetailModal = true;
  }

  openAddUserModal() {
    this.editKey = null;
    this.formName = '';
    this.formUsername = '';
    this.formRole = 'Cashier';
    this.formPin = '';
    this.formStatus = 'Active';
    this.formAutoLock = '2 min';

    const s: ScheduleMap = {};
    this.daysList.forEach(d => {
      s[d] = {
        active: d !== 'Sunday',
        start: d === 'Saturday' ? '10:00' : '09:00',
        end: d === 'Saturday' ? '16:00' : '18:00'
      };
    });
    this.formSchedule = s;
    this.showAddEditModal = true;
  }

  openEditUserModal(key: string) {
    const u = this.userAccounts[key];
    if (!u) return;

    this.editKey = key;
    this.formName = u.name;
    this.formUsername = u.username;
    this.formRole = u.role;
    this.formPin = u.pin || '1234';
    this.formStatus = u.status;
    this.formAutoLock = u.autoLock || '2 min';

    const s: ScheduleMap = {};
    this.daysList.forEach(d => {
      const existing = u.schedule ? u.schedule[d] : null;
      s[d] = existing ? { ...existing } : {
        active: d !== 'Sunday',
        start: '09:00',
        end: '18:00'
      };
    });
    this.formSchedule = s;
    this.showAddEditModal = true;
  }

  async toggleUserStatus(key: string) {
    const u = this.userAccounts[key];
    if (!u) return;
    const nextStatus = u.status === 'Active' ? 'Disabled' : 'Active';
    u.status = nextStatus;
    this.saveAccountsToStorage();
    try {
      await this.api.updateUser(u.username, { is_active: nextStatus === 'Active' });
    } catch {}
    await this.loadAuditLogs();
    this.triggerToast(`${u.name} status set to ${u.status}`);
  }

  /** The account record behind the open performance-details modal (for its leave status / actions). */
  detailUser(): any {
    return this.selectedUserDetail ? this.userAccounts[this.selectedUserDetail.key] : null;
  }

  openLeaveModal(key: string) {
    const u = this.userAccounts[key];
    if (!u) return;
    this.leaveKey = key;
    this.leaveUserName = u.name;
    this.leaveReason = '';
    this.leaveError = '';
    this.showLeaveModal = true;
  }

  async confirmLeave() {
    if (this.isSavingLeave) return;
    const u = this.userAccounts[this.leaveKey];
    if (!u) return;
    const reason = this.leaveReason.trim();
    if (!reason) {
      this.leaveError = 'Please give a reason for the leave';
      return;
    }
    this.isSavingLeave = true;
    this.leaveError = '';
    try {
      const res = await this.api.setUserLeave(u.username, true, reason);
      u.onLeave = !!res.on_leave;
      u.leaveReason = res.leave_reason || reason;
      this.saveAccountsToStorage();
      this.showLeaveModal = false;
      await this.loadAuditLogs();
      this.triggerToast(`${u.name} marked on leave`);
    } catch (err: any) {
      this.leaveError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not save. Please try again.';
    } finally {
      this.isSavingLeave = false;
    }
  }

  async returnFromLeave(key: string) {
    const u = this.userAccounts[key];
    if (!u) return;
    if (!confirm(`Mark ${u.name} as returned from leave? They will be able to sign in again.`)) return;
    try {
      await this.api.setUserLeave(u.username, false);
      u.onLeave = false;
      u.leaveReason = null;
      this.saveAccountsToStorage();
      await this.loadAuditLogs();
      this.triggerToast(`${u.name} is back from leave`);
    } catch (err: any) {
      alert(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not update the leave status. Please try again.');
    }
  }

  /** True when the username belongs to the signed-in user. */
  isSelf(username: string): boolean {
    return !!username && username.trim().toLowerCase() === (this.auth.currentUser().username || '').toLowerCase();
  }

  /** Active users who are not on leave and can take over the admin role. */
  transferCandidates(): UserAccountData[] {
    return Object.values(this.userAccounts).filter(u => !this.isSelf(u.username) && u.status === 'Active' && !u.onLeave);
  }

  openTransferModal() {
    this.transferTo = '';
    this.transferPin = '';
    this.transferError = '';
    this.showTransferModal = true;
  }

  async confirmTransfer() {
    if (this.isTransferring) return;
    if (!this.transferTo) { this.transferError = 'Select the user who will become the Admin'; return; }
    if (!this.transferPin) { this.transferError = 'Enter your PIN or password to confirm'; return; }
    this.isTransferring = true;
    this.transferError = '';
    try {
      await this.api.transferAdminRole(this.transferTo, this.transferPin);
      this.showTransferModal = false;
      this.triggerToast(`Admin role transferred to ${this.transferTo}. Please sign in again.`);
      setTimeout(() => { this.auth.logout(); this.router.navigate(['/login']); }, 1500);
    } catch (err: any) {
      this.transferError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not transfer the admin role. Please try again.';
    } finally {
      this.isTransferring = false;
    }
  }

  // --- User Access (module permissions) ---
  showAccessModal = false;
  accessUser: UserAccountData | null = null;
  accessModules: { key: string; label: string }[] = ACCESS_MODULES;
  accessChoices: Record<string, boolean> = {};
  accessLoading = false;
  accessError = '';
  isSavingAccess = false;

  async openAccessModal(u: UserAccountData) {
    this.accessUser = u;
    this.accessError = '';
    this.accessLoading = true;
    this.showAccessModal = true;
    try {
      const res = await this.api.getUserAccess(u.username);
      this.accessModules = (res.available as { key: string; label: string }[])?.length ? res.available : ACCESS_MODULES;
      this.accessChoices = { ...res.modules };
    } catch (err: any) {
      this.accessError = err?.error?.detail || 'Could not load the access for this user.';
      this.accessChoices = {};
    } finally {
      this.accessLoading = false;
    }
  }

  resetAccessToRoleDefaults() {
    const admin = this.accessUser?.role === 'Admin';
    const cashierDefaults = ['billing', 'hold_recall', 'returns'];
    this.accessChoices = Object.fromEntries(this.accessModules.map(m => [m.key, admin || cashierDefaults.includes(m.key)]));
  }

  async saveAccess() {
    if (!this.accessUser || this.isSavingAccess) return;
    this.isSavingAccess = true;
    this.accessError = '';
    try {
      await this.api.saveUserAccess(this.accessUser.username, this.accessChoices);
      this.showAccessModal = false;
      this.triggerToast(`Access updated for ${this.accessUser.name}`);
      await this.loadAuditLogs();
    } catch (err: any) {
      this.accessError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not save the access. Please try again.';
    } finally {
      this.isSavingAccess = false;
    }
  }

  openResetPinModal(username: string) {
    this.resetPinUsername = username;
    this.resetPinValue = '';
    this.showResetPinModal = true;
  }

  async confirmResetPin() {
    if (this.isResettingPin) return;
    if (!this.resetPinValue || this.resetPinValue.length < 4) {
      alert('Enter a valid 4-digit PIN');
      return;
    }

    this.isResettingPin = true;
    try {
      await this.api.resetUserPin(this.resetPinUsername, this.resetPinValue);
      this.showResetPinModal = false;
      this.triggerToast(`PIN reset successfully for ${this.resetPinUsername}`);
      await this.loadPendingResetRequests();
      await this.loadAuditLogs();
    } catch (err: any) {
      alert(err?.error?.detail || err?.message || 'Failed to reset PIN');
    } finally {
      this.isResettingPin = false;
    }
  }

  async saveUserAccount() {
    if (this.isSavingUser) return;
    if (!this.formName.trim() || !this.formUsername.trim()) {
      alert('Enter Full Name and Username');
      return;
    }
    if (!this.formPin || this.formPin.length < 4) {
      alert('Set a 4-digit PIN');
      return;
    }

    this.isSavingUser = true;
    const key = this.editKey || (this.formUsername.toLowerCase().replace(/[^a-z0-9]/g, '') || `usr_${Date.now().toString().slice(-4)}`);
    const avatar = this.formName.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);

    const existing = this.userAccounts[key] || {
      key,
      avatar,
      sub: `${this.formRole} · Counter Staff`,
      daily: {}
    };

    existing.name = this.formName.trim();
    existing.username = this.formUsername.trim().toLowerCase();
    existing.role = this.formRole;
    existing.pin = this.formPin;
    existing.status = this.formStatus;
    existing.autoLock = this.formAutoLock;
    existing.schedule = JSON.parse(JSON.stringify(this.formSchedule));

    this.userAccounts[key] = existing;
    this.saveAccountsToStorage();

    let rejected: string | null = null;
    try {
      if (this.editKey) {
        await this.api.updateUser(existing.username, {
          full_name: existing.name,
          role: existing.role.toLowerCase(),
          pin: existing.pin,
          is_active: existing.status === 'Active',
          auto_lock: existing.autoLock
        });
      } else {
        await this.api.createUser({
          username: existing.username,
          pin: existing.pin,
          role: existing.role.toLowerCase(),
          full_name: existing.name,
          sub_text: existing.sub,
          auto_lock: existing.autoLock
        });
      }
    } catch (err: any) {
      // e.g. 400 when an admin tries to change their own role: show the server's reason
      if (err?.status === 403 || err?.status === 400) rejected = err?.error?.detail || 'Not allowed';
    }

    this.showAddEditModal = false;
    this.updateUserPerformance();
    this.isSavingUser = false;
    await this.loadAuditLogs();
    this.triggerToast(rejected ?? `User ${existing.name} saved successfully`);
  }

  triggerToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => {
      if (this.toastMessage === msg) this.toastMessage = null;
    }, 3000);
  }
}
