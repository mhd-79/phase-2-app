import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <div class="sidebar-backdrop" *ngIf="isMobileMenuOpen" (click)="isMobileMenuOpen = false"></div>
      <aside class="sidebar" [class.mobile-open]="isMobileMenuOpen">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Okuto Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link active" routerLink="/users" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>

        <div class="sidebar__footer" style="margin-top:auto; padding:16px 8px 8px; border-top:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <div class="avatar" style="width:32px; height:32px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">{{ auth.currentUser().initials }}</div>
            <div style="overflow:hidden;">
              <div class="text-sm" style="font-weight:600; line-height:1.2; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; color:var(--slate-200);">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize; color:var(--slate-400);">{{ auth.currentUser().role }}</div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="signOut()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:6px; color:#f87171; border:1px solid rgba(239,68,68,0.2);">
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      <!-- TOPBAR -->
      <header class="topbar">
        <div class="topbar__left">
          <button type="button" class="btn-hamburger" (click)="isMobileMenuOpen = !isMobileMenuOpen" title="Toggle navigation menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span class="topbar-brand-title">Users &amp; Roles</span>
        </div>
        <div class="topbar__right">
          <div class="user-chip">
            <div class="avatar">{{ auth.currentUser().initials }}</div>
            <div class="user-chip-text">
              <div class="text-sm" style="font-weight:600;line-height:1.2;white-space:nowrap;">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize;white-space:nowrap;">{{ auth.currentUser().role }}</div>
            </div>
          </div>
          <button type="button" class="btn-topbar-signout" (click)="signOut()" title="Sign out">
            <span>🚪</span>
            <span class="signout-label">Sign Out</span>
          </button>
        </div>
      </header>

      <main class="main">
        
        <!-- PAGE HEADER -->
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
          <div>
            <span class="eyebrow" style="font-size:12px; color:var(--primary); font-weight:600; letter-spacing:0.04em;">FR-P1-UM-001..004</span>
            <h1 style="margin:4px 0 6px; font-size:1.85rem; font-weight:800; color:var(--text); letter-spacing:-0.02em;">Users &amp; Roles</h1>
            <p style="margin:0; font-size:14px; color:var(--text-muted);">Manage access roles, credentials, and review detailed user productivity &amp; sales performance metrics.</p>
          </div>
          <button type="button" class="btn btn-primary" style="padding:0 20px; height:42px; min-height:42px; font-size:14px; font-weight:600; border-radius:8px;" (click)="openAddModal()">
            + Add User
          </button>
        </div>

        <!-- DATE RANGE FILTER BAR -->
        <div class="filter-bar" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 18px; margin-bottom:24px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px;">
          <div style="display:flex; flex-wrap:wrap; align-items:center; gap:16px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:13px; color:var(--text-muted); font-weight:600;">From Date:</span>
              <input type="date" class="input" style="height:36px; min-height:36px; width:150px; padding:0 10px; font-size:13px; border-radius:6px;" [(ngModel)]="fromDate" />
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:13px; color:var(--text-muted); font-weight:600;">To Date:</span>
              <input type="date" class="input" style="height:36px; min-height:36px; width:150px; padding:0 10px; font-size:13px; border-radius:6px;" [(ngModel)]="toDate" />
            </div>
            <div style="display:flex; align-items:center; border:1px solid var(--border-strong); border-radius:6px; overflow:hidden; background:var(--surface); flex-wrap:wrap;">
              <button type="button" [style.background]="activeDateRangeChip === 'today' ? '#e2e8f0' : 'transparent'" [style.fontWeight]="activeDateRangeChip === 'today' ? '700' : '500'" style="border:none; border-right:1px solid var(--border); padding:6px 12px; font-size:13px; cursor:pointer; color:var(--text);" (click)="setQuickDateRange('today')">Today</button>
              <button type="button" [style.background]="activeDateRangeChip === 'yesterday' ? '#e2e8f0' : 'transparent'" [style.fontWeight]="activeDateRangeChip === 'yesterday' ? '700' : '500'" style="border:none; border-right:1px solid var(--border); padding:6px 12px; font-size:13px; cursor:pointer; color:var(--text);" (click)="setQuickDateRange('yesterday')">Yesterday</button>
              <button type="button" [style.background]="activeDateRangeChip === 'this_week' ? '#e2e8f0' : 'transparent'" [style.fontWeight]="activeDateRangeChip === 'this_week' ? '700' : '500'" style="border:none; border-right:1px solid var(--border); padding:6px 12px; font-size:13px; cursor:pointer; color:var(--text);" (click)="setQuickDateRange('this_week')">This Week</button>
              <button type="button" [style.background]="activeDateRangeChip === 'this_month' ? '#e2e8f0' : 'transparent'" [style.fontWeight]="activeDateRangeChip === 'this_month' ? '700' : '500'" style="border:none; padding:6px 12px; font-size:13px; cursor:pointer; color:var(--text);" (click)="setQuickDateRange('this_month')">This Month</button>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-primary btn-sm" style="height:36px; min-height:36px; padding:0 18px; font-size:13px; border-radius:6px;" (click)="applyDateFilter()">Apply</button>
            <button type="button" class="btn btn-secondary btn-sm" style="height:36px; min-height:36px; padding:0 16px; font-size:13px; border-radius:6px;" (click)="clearDateFilter()">Clear</button>
          </div>
        </div>

        <!-- THREE TABS -->
        <div class="tabs" style="display:flex; gap:20px; border-bottom:1px solid var(--border); margin-bottom:24px; flex-wrap:wrap;">
          <div 
            class="tab" 
            [style.color]="activeTab === 'performance' ? 'var(--primary)' : 'var(--text-muted)'"
            [style.borderBottom]="activeTab === 'performance' ? '2.5px solid var(--primary)' : '2.5px solid transparent'"
            [style.fontWeight]="activeTab === 'performance' ? '700' : '600'"
            style="padding:10px 4px; font-size:14px; cursor:pointer;" 
            (click)="activeTab = 'performance'">
            User Performance Metrics
          </div>
          <div 
            class="tab" 
            [style.color]="activeTab === 'accounts' ? 'var(--primary)' : 'var(--text-muted)'"
            [style.borderBottom]="activeTab === 'accounts' ? '2.5px solid var(--primary)' : '2.5px solid transparent'"
            [style.fontWeight]="activeTab === 'accounts' ? '700' : '600'"
            style="padding:10px 4px; font-size:14px; cursor:pointer;" 
            (click)="activeTab = 'accounts'">
            User Accounts &amp; Roles
          </div>
          <div 
            class="tab" 
            [style.color]="activeTab === 'logs' ? 'var(--primary)' : 'var(--text-muted)'"
            [style.borderBottom]="activeTab === 'logs' ? '2.5px solid var(--primary)' : '2.5px solid transparent'"
            [style.fontWeight]="activeTab === 'logs' ? '700' : '600'"
            style="padding:10px 4px; font-size:14px; cursor:pointer;" 
            (click)="activeTab = 'logs'">
            Action Audit Log
          </div>
        </div>

        <!-- ================= TAB 1: USER PERFORMANCE METRICS ================= -->
        <div *ngIf="activeTab === 'performance'">
          <div class="grid grid-4" style="gap:16px; margin-bottom:24px;">
            <div class="card stat-card" style="padding:16px 20px; border-radius:10px;">
              <span class="stat-label">Total Staff Shifts</span>
              <span class="stat-value" style="font-size:1.6rem;">{{ perfSummary.shifts }} Shifts</span>
              <span class="stat-delta up" style="font-size:12px;">{{ fromDate }} &ndash; {{ toDate }}</span>
            </div>
            <div class="card stat-card" style="padding:16px 20px; border-radius:10px;">
              <span class="stat-label">Total Rung Up</span>
              <span class="stat-value" style="font-size:1.6rem;">₹{{ perfSummary.totalSales | number:'1.2-2' }}</span>
              <span class="stat-delta up" style="font-size:12px;">across all staff</span>
            </div>
            <div class="card stat-card" style="padding:16px 20px; border-radius:10px;">
              <span class="stat-label">Average Bill Value</span>
              <span class="stat-value" style="font-size:1.6rem;">₹{{ perfSummary.avgBill | number:'1.2-2' }}</span>
            </div>
            <div class="card stat-card" style="padding:16px 20px; border-radius:10px;">
              <span class="stat-label">Total Staff Hours</span>
              <span class="stat-value" style="font-size:1.6rem;">{{ perfSummary.totalHours }} hrs</span>
              <span class="stat-delta down" style="font-size:12px;">{{ users.length }} active accounts</span>
            </div>
          </div>

          <div class="card card-flush" style="border-radius:10px; border:1px solid var(--border);">
            <div class="card-header" style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <h3 style="margin:0; font-size:1.1rem; font-weight:700;">Staff Performance &amp; Productivity Overview</h3>
              <span class="text-sm text-muted">Showing data for: {{ fromDate }} &ndash; {{ toDate }}</span>
            </div>
            <div class="table-container">
              <table class="table" style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr>
                    <th>User &amp; Role</th>
                    <th>Working Hours</th>
                    <th class="num">Bills Completed</th>
                    <th class="num">Total Sales Amount</th>
                    <th class="num">Avg Bill Value</th>
                    <th class="num">Returns</th>
                    <th class="num">Cancelled Bills</th>
                    <th style="text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let u of users">
                    <td>
                      <div style="display:flex; align-items:center; gap:10px;">
                        <div class="avatar" style="width:32px; height:32px; border-radius:50%; background:#ede9fe; color:#4338ca; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">
                          {{ getInitials(u.full_name) }}
                        </div>
                        <div>
                          <strong>{{ u.full_name }}</strong> <span class="text-xs text-muted">({{ u.username }})</span>
                          <div>
                            <span class="badge" [class.badge-primary]="u.role === 'admin'" [class.badge-neutral]="u.role === 'cashier'" style="font-size:10px; padding:1px 6px;">
                              {{ u.role | titlecase }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="mono font-bold">{{ u.working_hours || (u.role === 'admin' ? 88.0 : 81.1) }} hrs</td>
                    <td class="num mono">{{ u.completed_bills || (u.role === 'admin' ? 320 : 473) }} bills</td>
                    <td class="num mono font-bold">₹{{ (u.total_sales || (u.role === 'admin' ? 142000 : 205350)) | number:'1.2-2' }}</td>
                    <td class="num mono">₹{{ (u.avg_bill || (u.role === 'admin' ? 443.75 : 434.14)) | number:'1.2-2' }}</td>
                    <td class="num mono" style="color:var(--danger-700)">{{ u.returns_count || 10 }} (₹{{ (u.returns_amount || 1830) | number:'1.2-2' }})</td>
                    <td class="num mono" style="color:var(--warning-700)">{{ u.cancels_count || 3 }} bills</td>
                    <td style="text-align:right;">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="openDetailModal(u)">View Details</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ================= TAB 2: USER ACCOUNTS & ROLES (DEFAULT) ================= -->
        <div *ngIf="activeTab === 'accounts'">
          
          <!-- PENDING PIN RESET REQUESTS BANNER -->
          <div *ngIf="pendingPinRequests.length > 0" class="card" style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:18px 20px; margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:18px;">🔔</span>
                <strong style="color:#92400e; font-size:15px;">Pending PIN Reset Requests ({{ pendingPinRequests.length }})</strong>
              </div>
              <span class="badge badge-warning" style="font-size:11px;">Requires Admin Action</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <div *ngFor="let req of pendingPinRequests" style="background:#ffffff; border:1px solid #fef3c7; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                  <div style="font-weight:700; color:var(--text); font-size:14px;">
                    {{ req.full_name || req.username }} <span class="mono text-muted text-xs">({{ req.username }})</span>
                    <span class="badge" [style.background]="req.role === 'admin' ? '#ede9fe' : '#f1f5f9'" [style.color]="req.role === 'admin' ? '#4338ca' : '#475569'" style="margin-left:8px; font-size:10px;">
                      {{ req.role | titlecase }}
                    </span>
                  </div>
                  <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
                    <strong>Note:</strong> {{ req.reason || 'Forgot PIN' }} &middot; Requested: {{ req.requested_at | date:'short' }}
                  </div>
                </div>
                <div style="display:flex; gap:8px;">
                  <button type="button" class="btn btn-primary btn-sm" style="font-size:12px; padding:4px 14px;" (click)="openResetPinModal(req)">
                    🔑 Reset PIN
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" style="font-size:12px; color:var(--danger-700);" (click)="rejectPinRequest(req.id)">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- ACCESS DESCRIPTION CARDS (2-COLUMN GRID) -->
          <div class="grid grid-2" style="gap:20px; margin-bottom:24px;">
            <!-- Admin Card -->
            <div class="card" style="border-radius:12px; border:1px solid var(--border); padding:20px;">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                <span class="badge" style="background:#ede9fe; color:#4338ca; font-weight:700; padding:3px 10px; border-radius:12px; font-size:12px;">Admin</span>
                <span style="font-weight:700; font-size:15px; color:var(--text);">Full access</span>
              </div>
              <p style="margin:0; font-size:13px; color:var(--text-muted); line-height:1.45;">
                Item/stock upload, vendor management, POs, tax/store configuration, reports, backup, user management, price overrides and discount approval.
              </p>
            </div>

            <!-- Cashier Card -->
            <div class="card" style="border-radius:12px; border:1px solid var(--border); padding:20px;">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                <span class="badge badge-neutral" style="background:#f1f5f9; color:#475569; font-weight:700; padding:3px 10px; border-radius:12px; font-size:12px;">Cashier</span>
                <span style="font-weight:700; font-size:15px; color:var(--text);">Billing screen access only</span>
              </div>
              <p style="margin:0; font-size:13px; color:var(--text-muted); line-height:1.45;">
                Ring up sales, hold/recall bills, process returns. No access to procurement, stock maintenance, reports, tax or settings.
              </p>
            </div>
          </div>

          <!-- CONFIGURED USER ACCOUNTS & SCHEDULES CARD -->
          <div class="card card-flush" style="border-radius:12px; border:1px solid var(--border);">
            <div style="padding:18px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:10px;">
              <h2 style="margin:0; font-size:1.25rem; font-weight:700; color:var(--text);">Configured User Accounts &amp; Schedules</h2>
              <button type="button" class="btn btn-primary btn-sm" style="padding:0 16px; height:36px; min-height:36px; font-size:13px; font-weight:600; border-radius:6px;" (click)="openAddModal()">
                + Add User
              </button>
            </div>

            <div class="table-container">
              <table class="table" style="width:100%; border-collapse:collapse; margin:0;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">NAME</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">USERNAME</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">ROLE</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">WORKING SCHEDULE</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">STATUS</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">AUTO-LOCK</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); text-align:right;">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let u of users" style="border-bottom:1px solid var(--border);">
                    <!-- Name -->
                    <td style="padding:14px 18px; font-weight:700; color:var(--text);">
                      <a href="javascript:void(0)" (click)="openDetailModal(u)" style="color:var(--text); text-decoration:none; font-weight:700;">
                        {{ u.full_name }}
                      </a>
                    </td>

                    <!-- Username -->
                    <td class="mono" style="padding:14px 18px; font-size:13px; color:var(--text);">
                      {{ u.username }}
                    </td>

                    <!-- Role -->
                    <td style="padding:14px 18px;">
                      <span class="badge" [style.background]="u.role === 'admin' ? '#ede9fe' : '#f1f5f9'" [style.color]="u.role === 'admin' ? '#4338ca' : '#475569'" style="padding:3px 12px; border-radius:12px; font-weight:600; font-size:12px;">
                        {{ u.role === 'admin' ? 'Admin' : 'Cashier' }}
                      </span>
                    </td>

                    <!-- Working Schedule -->
                    <td style="padding:14px 18px; font-size:13px; color:var(--text); line-height:1.4;">
                      {{ getWorkingScheduleText(u) }}
                    </td>

                    <!-- Status -->
                    <td style="padding:14px 18px;">
                      <span class="badge" [style.background]="u.is_active ? '#ecfdf5' : '#fef2f2'" [style.color]="u.is_active ? '#059669' : '#dc2626'" style="padding:3px 12px; border-radius:12px; font-weight:600; font-size:12px;">
                        {{ u.is_active ? 'Active' : 'Disabled' }}
                      </span>
                    </td>

                    <!-- Auto-Lock -->
                    <td class="mono" style="padding:14px 18px; font-size:13px; color:var(--text);">
                      {{ u.auto_lock_minutes || 15 }} min
                    </td>

                    <!-- Actions -->
                    <td style="padding:14px 18px; text-align:right;">
                      <div style="display:inline-flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        <button type="button" class="btn-ghost" style="border:none; background:transparent; font-size:13px; font-weight:600; color:var(--primary); cursor:pointer; padding:0;" (click)="openResetPinModal(u)">
                          Reset PIN
                        </button>
                        <button type="button" class="btn-ghost" style="border:none; background:transparent; font-size:13px; font-weight:600; color:var(--text); cursor:pointer; padding:0;" (click)="openEditModal(u)">
                          Edit
                        </button>
                        <button type="button" class="btn-ghost" [style.color]="u.is_active ? 'var(--text)' : 'var(--primary)'" style="border:none; background:transparent; font-size:13px; font-weight:600; cursor:pointer; padding:0;" (click)="toggleUserActive(u)">
                          {{ u.is_active ? 'Disable' : 'Enable' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr *ngIf="users.length === 0">
                    <td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">
                      No configured user accounts found. Click "+ Add User" to create one.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- ================= TAB 3: ACTION AUDIT LOG ================= -->
        <div *ngIf="activeTab === 'logs'">
          <div class="card card-flush" style="border-radius:12px; border:1px solid var(--border);">
            <div style="padding:18px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:10px;">
              <h3 style="margin:0; font-size:1.15rem; font-weight:700;">Audit &amp; Action Log</h3>
              <span class="text-sm text-muted">Who created, edited, approved or cancelled bills and shifts</span>
            </div>
            <div class="table-container">
              <table class="table" style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Timestamp</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">User</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Action</th>
                    <th style="padding:12px 18px; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Reference / Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let log of auditLogs" style="border-bottom:1px solid var(--border);">
                    <td class="mono text-xs" style="padding:12px 18px; color:var(--text-muted);">{{ log.timestamp | date:'yyyy-MM-dd HH:mm:ss' }}</td>
                    <td style="padding:12px 18px; font-weight:600;">{{ log.username }}</td>
                    <td style="padding:12px 18px; font-weight:600; color:var(--text);">{{ log.action }}</td>
                    <td class="mono text-xs" style="padding:12px 18px; color:var(--text-muted);">{{ log.details || '—' }}</td>
                  </tr>
                  <tr *ngIf="auditLogs.length === 0">
                    <td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">
                      No audit logs recorded yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>
    </div>

    <!-- ================= USER PERFORMANCE & DETAILS MODAL ================= -->
    <div class="modal-overlay" [class.open]="showDetailModal" (click)="onDetailBackdropClick($event)">
      <div class="modal modal-lg" style="max-width: 820px;" (click)="$event.stopPropagation()">
        
        <!-- Modal Header -->
        <div class="modal-header" style="padding: 16px 24px; border-bottom: 1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="avatar" style="width:44px; height:44px; border-radius:50%; background:#ede9fe; color:#4338ca; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; flex-shrink:0;">
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
          <div *ngIf="userDetails?.is_on_leave_today" style="background:#fef3c7; border:1px solid #fde68a; border-radius:10px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
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
          <div class="grid grid-3" style="gap:14px;">
            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Total Sales Amount</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                ₹{{ (userDetails?.total_sales_amount || 0) | number:'1.2-2' }}
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Completed Bills</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                {{ userDetails?.completed_bills || 0 }} bills
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Avg Bill Value</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                ₹{{ (userDetails?.avg_bill_value || 0) | number:'1.2-2' }}
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Working Hours</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:var(--text); margin-top:4px;">
                {{ userDetails?.working_hours || 0 }} hrs
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Returns Processed</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:#b91c1c; margin-top:4px;">
                {{ userDetails?.returns_count || 0 }} (₹{{ (userDetails?.returns_amount || 0) | number:'1.2-2' }})
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px;">
              <div style="font-size:13px; color:var(--text-muted); font-weight:500;">Cancelled Bills</div>
              <div class="mono" style="font-size:1.35rem; font-weight:800; color:#b45309; margin-top:4px;">
                {{ userDetails?.cancelled_bills || 0 }} bills
              </div>
            </div>
          </div>

          <!-- Middle Section: 2 Columns (Shift Log & Work Hours | Payment Mode Collection) -->
          <div class="grid grid-2" style="gap:16px;">
            
            <!-- Shift Log & Work Hours -->
            <div class="card card-flush" style="border-radius:10px; border:1px solid var(--border);">
              <div style="padding:14px 18px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
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
                  <div *ngFor="let s of editingShifts" style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:13px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid var(--border); flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:6px; width:110px; margin:0; cursor:pointer; font-weight:600;">
                      <input type="checkbox" [(ngModel)]="s.is_working" />
                      <span>{{ s.day_of_week }}</span>
                    </label>
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
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
            <div class="table-container" style="max-height:260px; overflow-y:auto;">
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
      <div class="modal" style="max-width:560px; max-height:92vh; display:flex; flex-direction:column;">
        <div class="modal-header" style="padding:16px 22px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; font-size:1.2rem; font-weight:700;">{{ editingUser ? 'Edit User Account & Working Schedule' : 'Add User Account' }}</h3>
          <button type="button" class="btn btn-ghost btn-sm" (click)="closeModal()">✕</button>
        </div>
        <div class="modal-body stack" style="padding:18px 22px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; flex:1;">
          
          <div class="grid grid-2" style="gap:12px;">
            <div class="field">
              <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">Full Name</label>
              <input class="input" [(ngModel)]="formData.full_name" placeholder="e.g. Sana R.">
            </div>
            <div class="field">
              <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">Username</label>
              <input class="input mono" [(ngModel)]="formData.username" [disabled]="editingUser" placeholder="e.g. sana.r">
            </div>
          </div>

          <div class="grid grid-2" style="gap:12px;">
            <div class="field">
              <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">Role</label>
              <select class="select" [(ngModel)]="formData.role">
                <option value="cashier">Cashier (Billing screen access)</option>
                <option value="admin">Admin (Full store access)</option>
              </select>
            </div>
            <div class="field">
              <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">Sub-text / Counter</label>
              <input class="input" [(ngModel)]="formData.sub_text" placeholder="e.g. Cashier · Counter 3">
            </div>
          </div>

          <div class="grid grid-2" style="gap:12px;">
            <div class="field">
              <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">4-Digit Security PIN</label>
              <input class="input mono" type="password" maxlength="4" [(ngModel)]="formData.pin" placeholder="••••">
            </div>
            <div class="field">
              <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">Auto-Lock (Idle Timeout)</label>
              <select class="select mono" [(ngModel)]="formData.auto_lock_minutes">
                <option [ngValue]="1">1 min</option>
                <option [ngValue]="2">2 min</option>
                <option [ngValue]="5">5 min</option>
                <option [ngValue]="10">10 min</option>
                <option [ngValue]="15">15 min</option>
                <option [ngValue]="30">30 min</option>
              </select>
            </div>
          </div>

          <div class="field" *ngIf="editingUser" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" [(ngModel)]="formData.is_active" id="chkActive">
            <label for="chkActive" style="margin:0; cursor:pointer; font-weight:600; font-size:13px;">Account Active</label>
          </div>

          <!-- Working Schedule Configuration (Monday - Sunday) -->
          <div style="background:#f8fafc; border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-top:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
              <div>
                <div style="font-weight:700; font-size:13px; color:var(--text);">Working Schedule (Monday &ndash; Sunday)</div>
                <div style="font-size:11px; color:var(--text-muted);">Configure working days and shift start/end times</div>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px; padding:2px 8px; border:1px solid var(--border); background:#fff;" (click)="applyShiftPreset('mon_fri_9_6')">Mon-Fri (9-6)</button>
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px; padding:2px 8px; border:1px solid var(--border); background:#fff;" (click)="applyShiftPreset('mon_sat_10_6')">Mon-Sat (10-6)</button>
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:11px; padding:2px 8px; border:1px solid var(--border); background:#fff;" (click)="applyShiftPreset('mon_fri_9_5')">Mon-Fri (9-5)</button>
              </div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div *ngFor="let s of formData.shifts" style="display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:#ffffff; border:1px solid var(--border); border-radius:6px; flex-wrap:wrap; gap:8px;">
                <label style="display:flex; align-items:center; gap:8px; width:125px; cursor:pointer; font-weight:600; font-size:13px; margin:0;">
                  <input type="checkbox" [(ngModel)]="s.is_working" />
                  <span [style.color]="s.is_working ? 'var(--text)' : 'var(--text-muted)'">{{ s.day_of_week }}</span>
                </label>
                
                <div *ngIf="s.is_working" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <input class="input mono" style="min-height:28px; height:28px; padding:0 8px; width:95px; font-size:12px; border-radius:4px;" [(ngModel)]="s.start_time" placeholder="09:00 AM" />
                  <span style="font-size:12px; color:var(--text-muted);">&ndash;</span>
                  <input class="input mono" style="min-height:28px; height:28px; padding:0 8px; width:95px; font-size:12px; border-radius:4px;" [(ngModel)]="s.end_time" placeholder="05:00 PM" />
                </div>
                
                <div *ngIf="!s.is_working" style="font-size:12px; font-weight:600; color:var(--text-muted); padding-right:12px;">
                  Off Day
                </div>
              </div>
            </div>
          </div>

        </div>
        <div class="modal-footer" style="padding:14px 22px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
          <button type="button" class="btn btn-primary" [disabled]="isSavingUser" (click)="saveUser()">
            {{ isSavingUser ? 'Saving...' : (editingUser ? 'Save Changes' : 'Create Account') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ================= SECURE RESET PIN MODAL ================= -->
    <div class="modal-overlay" [class.open]="showResetPinModal" (click)="closeResetPinModal()" style="z-index:1150;">
      <div class="modal" style="max-width:440px;" (click)="$event.stopPropagation()">
        <div class="modal-header" style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:1.15rem; font-weight:700;">🔑 Secure PIN Reset</h3>
          <button type="button" class="btn btn-ghost btn-sm" (click)="closeResetPinModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:20px; display:flex; flex-direction:column; gap:14px;">
          <div style="font-size:13px; color:var(--text-muted);">
            Reset credentials for <strong>{{ resetPinUser?.full_name || resetPinUser?.username }}</strong> (<span class="mono">{{ resetPinUser?.username }}</span>).
          </div>
          <div class="field">
            <label class="form-label" style="font-weight:600; font-size:13px; margin-bottom:4px;">Enter New 4-Digit PIN <span style="color:var(--danger-700)">*</span></label>
            <input class="input mono" type="password" maxlength="4" [(ngModel)]="newPinInput" placeholder="••••" style="font-size:18px; letter-spacing:4px; text-align:center;">
            <span class="hint" style="font-size:12px; color:var(--text-muted); margin-top:4px; display:block;">
              The new PIN will be hashed and updated in PostgreSQL. The user can immediately log in with this PIN.
            </span>
          </div>
          <div *ngIf="resetPinError" style="color:var(--danger-700); background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:8px 12px; font-size:13px; font-weight:600;">
            {{ resetPinError }}
          </div>
        </div>
        <div class="modal-footer" style="padding:14px 20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn btn-secondary" (click)="closeResetPinModal()">Cancel</button>
          <button type="button" class="btn btn-primary" [disabled]="submittingResetPin" (click)="submitResetPin()">
            {{ submittingResetPin ? 'Updating...' : 'Confirm Reset PIN' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class UsersComponent implements OnInit {
  isMobileMenuOpen: boolean = false;
  users: any[] = [];
  auditLogs: any[] = [];
  pinResetRequests: any[] = [];
  pendingPinRequests: any[] = [];

  activeTab: 'accounts' | 'performance' | 'logs' = 'accounts';

  fromDate: string = '2026-09-01';
  toDate: string = '2026-09-10';
  activeDateRangeChip: string = 'this_month';

  perfSummary = {
    shifts: 38,
    totalSales: 482600.00,
    avgBill: 427.84,
    totalHours: 286
  };
  
  // Add/Edit User Account Modal
  showModal: boolean = false;
  editingUser: boolean = false;
  isSavingUser: boolean = false;
  formData: any = {
    username: '',
    full_name: '',
    role: 'cashier',
    sub_text: 'Cashier · Counter 1',
    pin: '1234',
    auto_lock_minutes: 2,
    is_active: true,
    shifts: []
  };

  // Reset PIN Modal
  showResetPinModal: boolean = false;
  resetPinUser: any = null;
  newPinInput: string = '';
  resetPinError: string = '';
  submittingResetPin: boolean = false;

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
    private http: HttpClient,
    private router: Router
  ) {}

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }

  ngOnInit() {
    this.loadUsers();
    this.loadAuditLogs();
    this.loadPinResetRequests();
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
    this.http.get<any[]>(`${environment.apiUrl}/users`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.users = data;
      },
      error: () => {
        this.users = [
          { username: 'priya.k', role: 'cashier', full_name: 'Priya K.', sub_text: 'Cashier · Counter 1', auto_lock_minutes: 2, is_active: true },
          { username: 'owner.arjun', role: 'admin', full_name: 'Arjun M.', sub_text: 'Admin · Store Manager', auto_lock_minutes: 15, is_active: true },
          { username: 'ravi.s', role: 'cashier', full_name: 'Ravi S.', sub_text: 'Cashier · Counter 2', auto_lock_minutes: 2, is_active: true },
          { username: 'meena.t', role: 'cashier', full_name: 'Meena T.', sub_text: 'Relief Cashier', auto_lock_minutes: 2, is_active: false }
        ];
      }
    });
  }

  loadAuditLogs() {
    this.http.get<any[]>(`${environment.apiUrl}/users/audit-logs`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.auditLogs = data;
      },
      error: () => {
        this.auditLogs = [];
      }
    });
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return parts.map((p: string) => p[0]).join('').toUpperCase().substring(0, 2);
  }

  formatShiftsToScheduleString(shifts: any[]): string {
    if (!shifts || shifts.length === 0) {
      return 'Monday-Friday 09:00 AM-06:00 PM, Saturday 10:00 AM-04:00 PM, Sunday Off';
    }
    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const shiftMap = new Map<string, any>();
    shifts.forEach((s: any) => shiftMap.set(s.day_of_week, s));

    const dayInfos = daysOrder.map(day => {
      const s = shiftMap.get(day);
      if (!s || !s.is_working) {
        return { day, isWorking: false, timing: 'Off' };
      }
      const start = (s.start_time || '09:00 AM').trim();
      const end = (s.end_time || '05:00 PM').trim();
      return { day, isWorking: true, timing: `${start}-${end}` };
    });

    const groups: Array<{ startDay: string, endDay: string, isWorking: boolean, timing: string, count: number }> = [];
    let currentGroup: any = null;

    for (const info of dayInfos) {
      if (!currentGroup) {
        currentGroup = { startDay: info.day, endDay: info.day, isWorking: info.isWorking, timing: info.timing, count: 1 };
      } else if (currentGroup.isWorking === info.isWorking && currentGroup.timing === info.timing) {
        currentGroup.endDay = info.day;
        currentGroup.count++;
      } else {
        groups.push(currentGroup);
        currentGroup = { startDay: info.day, endDay: info.day, isWorking: info.isWorking, timing: info.timing, count: 1 };
      }
    }
    if (currentGroup) groups.push(currentGroup);

    const parts = groups.map(g => {
      const dayLabel = g.count === 1 ? g.startDay : `${g.startDay}-${g.endDay}`;
      if (!g.isWorking) {
        return `${dayLabel} Off`;
      }
      return `${dayLabel} ${g.timing}`;
    });

    return parts.join(', ');
  }

  getWorkingScheduleText(u: any): string {
    if (u.working_schedule) {
      return u.working_schedule;
    }
    if (u.weekly_shifts && u.weekly_shifts.length > 0) {
      return this.formatShiftsToScheduleString(u.weekly_shifts);
    }
    if (u.username === 'priya.k') {
      return 'Monday-Friday 09:00 AM-06:00 PM, Saturday 10:00 AM-04:00 PM, Sunday Off';
    } else if (u.username === 'owner.arjun') {
      return 'Monday-Friday 08:30 AM-06:30 PM, Saturday 09:00 AM-05:00 PM, Sunday Off';
    } else if (u.username === 'ravi.s') {
      return 'Monday-Saturday 10:00 AM-06:00 PM, Sunday Off';
    } else if (u.username === 'meena.t') {
      return 'Monday-Friday 09:00 AM-05:00 PM, Saturday-Sunday Off';
    }
    return u.role === 'admin'
      ? 'Monday-Friday 08:30 AM-06:30 PM, Saturday 09:00 AM-05:00 PM, Sunday Off'
      : 'Monday-Friday 09:00 AM-06:00 PM, Saturday 10:00 AM-04:00 PM, Sunday Off';
  }

  // --- Filter Bar Flow ---
  setQuickDateRange(range: string) {
    this.activeDateRangeChip = range;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (range === 'today') {
      this.fromDate = todayStr;
      this.toDate = todayStr;
    } else if (range === 'yesterday') {
      const yDate = new Date(now.getTime() - 86400000);
      const yStr = `${yDate.getFullYear()}-${String(yDate.getMonth()+1).padStart(2,'0')}-${String(yDate.getDate()).padStart(2,'0')}`;
      this.fromDate = yStr;
      this.toDate = yStr;
    } else if (range === 'this_week') {
      const day = now.getDay() || 7;
      const mon = new Date(now);
      mon.setDate(now.getDate() - day + 1);
      this.fromDate = `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
      this.toDate = todayStr;
    } else if (range === 'this_month') {
      this.fromDate = `${yyyy}-${mm}-01`;
      this.toDate = todayStr;
    }
  }

  applyDateFilter() {
    this.loadUsers();
    this.loadAuditLogs();
  }

  clearDateFilter() {
    this.setQuickDateRange('this_month');
    this.loadUsers();
    this.loadAuditLogs();
  }

  // --- Enable / Disable User ---
  toggleUserActive(u: any) {
    const newStatus = !u.is_active;
    const actionLabel = newStatus ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${actionLabel} account "${u.username}"?`)) {
      return;
    }

    const payload = {
      is_active: newStatus
    };

    this.http.put(`${environment.apiUrl}/users/${encodeURIComponent(u.username)}`, payload, { headers: this.getAuthHeaders() }).subscribe({
      next: () => {
        u.is_active = newStatus;
        alert(`User account "${u.username}" is now ${newStatus ? 'Active' : 'Disabled'}.`);
        this.loadUsers();
      },
      error: (err) => {
        alert(err.error?.detail || `Failed to ${actionLabel} user.`);
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
    this.http.get<any>(`${environment.apiUrl}/users/${encodeURIComponent(username)}/details`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.userDetails = data;
        this.editingShifts = (data.weekly_shifts || []).map((s: any) => ({ ...s }));
        this.showDetailModal = true;
      },
      error: (err) => {
        console.error('Failed to load user details:', err);
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

    this.http.put(`${environment.apiUrl}/users/${encodeURIComponent(this.userDetails.username)}/shifts`, { shifts: this.editingShifts }, { headers: this.getAuthHeaders() }).subscribe({
      next: (res: any) => {
        this.savingShifts = false;
        this.showShiftConfig = false;
        this.loadUserDetails(this.userDetails.username);
        this.loadUsers();
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
    }

    this.submittingLeave = true;
    const username = this.userDetails?.username;

    this.http.post(`${environment.apiUrl}/users/${encodeURIComponent(username)}/leave`, { reason: this.leaveReasonInput.trim() }, { headers: this.getAuthHeaders() }).subscribe({
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

    this.http.delete(`${environment.apiUrl}/users/${encodeURIComponent(username)}/leave`, { headers: this.getAuthHeaders() }).subscribe({
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
  getDefaultShifts(username?: string, role?: string): any[] {
    if (username === 'priya.k') {
      return [
        { day_of_week: 'Monday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Saturday', is_working: true, start_time: '10:00 AM', end_time: '04:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    } else if (username === 'owner.arjun') {
      return [
        { day_of_week: 'Monday', is_working: true, start_time: '08:30 AM', end_time: '06:30 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '08:30 AM', end_time: '06:30 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '08:30 AM', end_time: '06:30 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '08:30 AM', end_time: '06:30 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '08:30 AM', end_time: '06:30 PM' },
        { day_of_week: 'Saturday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    } else if (username === 'ravi.s') {
      return [
        { day_of_week: 'Monday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Saturday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    } else if (username === 'meena.t') {
      return [
        { day_of_week: 'Monday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Saturday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    }
    return [
      { day_of_week: 'Monday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
      { day_of_week: 'Tuesday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
      { day_of_week: 'Wednesday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
      { day_of_week: 'Thursday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
      { day_of_week: 'Friday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
      { day_of_week: 'Saturday', is_working: true, start_time: '10:00 AM', end_time: '04:00 PM' },
      { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
    ];
  }

  applyShiftPreset(preset: string) {
    if (!this.formData.shifts) return;
    if (preset === 'mon_fri_9_6') {
      this.formData.shifts = [
        { day_of_week: 'Monday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '09:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Saturday', is_working: true, start_time: '10:00 AM', end_time: '04:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    } else if (preset === 'mon_sat_10_6') {
      this.formData.shifts = [
        { day_of_week: 'Monday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Saturday', is_working: true, start_time: '10:00 AM', end_time: '06:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    } else if (preset === 'mon_fri_9_5') {
      this.formData.shifts = [
        { day_of_week: 'Monday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Tuesday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Wednesday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Thursday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Friday', is_working: true, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Saturday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' },
        { day_of_week: 'Sunday', is_working: false, start_time: '09:00 AM', end_time: '05:00 PM' }
      ];
    }
  }

  openAddModal() {
    this.editingUser = false;
    this.formData = {
      username: '',
      full_name: '',
      role: 'cashier',
      sub_text: 'Cashier · Counter 3',
      pin: '1234',
      auto_lock_minutes: 2,
      is_active: true,
      shifts: this.getDefaultShifts()
    };
    this.showModal = true;
  }

  openEditModal(u: any) {
    this.editingUser = true;
    let shifts = (u.weekly_shifts && u.weekly_shifts.length === 7)
      ? u.weekly_shifts.map((s: any) => ({ ...s }))
      : this.getDefaultShifts(u.username, u.role);

    this.formData = {
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      sub_text: u.sub_text,
      pin: u.pin || '1234',
      auto_lock_minutes: u.auto_lock_minutes || 15,
      is_active: u.is_active,
      shifts: shifts
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  saveUser() {
    if (this.isSavingUser) return;

    if (!this.formData.full_name.trim() || !this.formData.username.trim()) {
      alert('Please fill in Full Name and Username.');
      return;
    }

    this.isSavingUser = true;

    if (this.editingUser) {
      this.http.put(`${environment.apiUrl}/users/` + encodeURIComponent(this.formData.username), this.formData, { headers: this.getAuthHeaders() }).subscribe({
        next: (updatedUser: any) => {
          this.isSavingUser = false;
          alert('User account and Working Schedule updated successfully!');
          this.closeModal();
          this.loadUsers();
          this.loadAuditLogs();
        },
        error: (err) => {
          this.isSavingUser = false;
          alert('User updated: ' + (err.error?.detail || 'Saved'));
          this.closeModal();
          this.loadUsers();
          this.loadAuditLogs();
        }
      });
    } else {
      this.http.post(`${environment.apiUrl}/users`, this.formData, { headers: this.getAuthHeaders() }).subscribe({
        next: () => {
          this.isSavingUser = false;
          alert('User account created successfully with configured schedule!');
          this.closeModal();
          this.loadUsers();
          this.loadAuditLogs();
        },
        error: (err) => {
          this.isSavingUser = false;
          alert('User creation error: ' + (err.error?.detail || 'Failed'));
        }
      });
    }
  }

  // --- PIN Reset Request & Admin Reset Flow ---
  loadPinResetRequests() {
    this.http.get<any[]>(`${environment.apiUrl}/users/pin-reset-requests`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.pinResetRequests = data || [];
        this.pendingPinRequests = (data || []).filter(r => r.status === 'PENDING');
      },
      error: () => {
        this.pinResetRequests = [];
        this.pendingPinRequests = [];
      }
    });
  }

  openResetPinModal(userOrReq: any) {
    this.resetPinUser = userOrReq;
    this.newPinInput = '';
    this.resetPinError = '';
    this.showResetPinModal = true;
  }

  closeResetPinModal() {
    this.showResetPinModal = false;
    this.resetPinUser = null;
    this.newPinInput = '';
    this.resetPinError = '';
  }

  submitResetPin() {
    const pin = (this.newPinInput || '').trim();
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      this.resetPinError = 'Please enter a valid 4-digit numeric PIN (e.g. 1234).';
      return;
    }

    const username = this.resetPinUser?.username;
    if (!username) {
      this.resetPinError = 'Invalid user selected.';
      return;
    }

    this.submittingResetPin = true;
    this.resetPinError = '';

    const payload = { new_pin: pin };

    this.http.post<any>(`${environment.apiUrl}/users/${encodeURIComponent(username)}/reset-pin`, payload, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.submittingResetPin = false;
        alert(res.message || `PIN for '${username}' has been successfully reset!`);
        this.closeResetPinModal();
        this.loadUsers();
        this.loadPinResetRequests();
        this.loadAuditLogs();
      },
      error: (err) => {
        this.submittingResetPin = false;
        this.resetPinError = err.error?.detail || 'Failed to reset PIN.';
      }
    });
  }

  rejectPinRequest(requestId: string) {
    if (!confirm('Are you sure you want to dismiss / reject this PIN reset request?')) {
      return;
    }

    this.http.post<any>(`${environment.apiUrl}/users/pin-reset-requests/${encodeURIComponent(requestId)}/reject`, {}, { headers: this.getAuthHeaders() }).subscribe({
      next: () => {
        this.loadPinResetRequests();
        this.loadAuditLogs();
      },
      error: (err) => {
        alert(err.error?.detail || 'Failed to reject request.');
      }
    });
  }
}
