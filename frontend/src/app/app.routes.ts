import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard, moduleGuard, phase2Guard, superAdminGuard } from './guards/role.guard';

import { LoginComponent } from './pages/login/login.component';
import { PosComponent } from './pages/pos/pos.component';
import { HoldBillsComponent } from './pages/hold-bills/hold-bills.component';
import { ReturnsComponent } from './pages/returns/returns.component';
import { ItemsStockComponent } from './pages/items-stock/items-stock.component';
import { ItemEditComponent } from './pages/item-edit/item-edit.component';
import { StockUploadComponent } from './pages/stock-upload/stock-upload.component';
import { DiscountsComponent } from './pages/discounts/discounts.component';
import { TaxSettingsComponent } from './pages/tax-settings/tax-settings.component';
import { UsersComponent } from './pages/users/users.component';
import { StoreSettingsComponent } from './pages/store-settings/store-settings.component';
import { ReceiptPreviewComponent } from './pages/receipt-preview/receipt-preview.component';
import { ReportsComponent } from './pages/reports/reports.component';

// Phase 2 components
import { VendorsComponent } from './pages/vendors/vendors.component';
import { VendorDetailComponent } from './pages/vendor-detail/vendor-detail.component';
import { PurchaseOrdersComponent } from './pages/purchase-orders/purchase-orders.component';
import { PoDetailComponent } from './pages/po-detail/po-detail.component';
import { PurchaseReturnsComponent } from './pages/purchase-returns/purchase-returns.component';
import { StockAdjustmentComponent } from './pages/stock-adjustment/stock-adjustment.component';
import { BatchExpiryComponent } from './pages/batch-expiry/batch-expiry.component';
import { ReorderAlertsComponent } from './pages/reorder-alerts/reorder-alerts.component';
import { StockAuditComponent } from './pages/stock-audit/stock-audit.component';
import { AiInsightsComponent } from './pages/ai-insights/ai-insights.component';

// Super Admin / multi-tenant platform
import { AcceptInvitationComponent } from './pages/accept-invitation/accept-invitation.component';
import { RegisterComponent } from './pages/register/register.component';
import { SaDashboardComponent } from './pages/super-admin/sa-dashboard.component';
import { SaTenantsComponent } from './pages/super-admin/sa-tenants.component';
import { SaTenantDetailComponent } from './pages/super-admin/sa-tenant-detail.component';
import { SaRequestsComponent } from './pages/super-admin/sa-requests.component';
import { SaInvitationsComponent, SaSubscriptionsComponent, SaPlansComponent, SaNotificationsComponent, SaAuditLogsComponent, SaSettingsComponent } from './pages/super-admin/sa-lists.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },

  // Public links from emails (no sign-in, no application shell)
  { path: 'register', component: RegisterComponent },
  { path: 'accept-invitation/:token', component: AcceptInvitationComponent },
  { path: 'reset-password/:token', component: AcceptInvitationComponent },

  // Super Admin (platform) area
  { path: 'super-admin', redirectTo: 'super-admin/dashboard', pathMatch: 'full' },
  { path: 'super-admin/dashboard', component: SaDashboardComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/tenants', component: SaTenantsComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/tenants/:id', component: SaTenantDetailComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/tenant-requests', component: SaRequestsComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/invitations', component: SaInvitationsComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/subscriptions', component: SaSubscriptionsComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/plans', component: SaPlansComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/notifications', component: SaNotificationsComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/audit-logs', component: SaAuditLogsComponent, canActivate: [superAdminGuard] },
  { path: 'super-admin/settings', component: SaSettingsComponent, canActivate: [superAdminGuard] },
  
  // Cashier & Admin Shared Billing Routes
  { path: 'pos', component: PosComponent, canActivate: [authGuard, moduleGuard('billing')] },
  { path: 'hold-bills', component: HoldBillsComponent, canActivate: [authGuard, moduleGuard('hold_recall')] },
  { path: 'returns', component: ReturnsComponent, canActivate: [authGuard, moduleGuard('returns')] },
  { path: 'receipt-preview', component: ReceiptPreviewComponent, canActivate: [authGuard] },
  
  // Admin Only Management & Procurement Routes (Phase 2 routes additionally require Phase 2 access)
  { path: 'items-stock', component: ItemsStockComponent, canActivate: [authGuard, moduleGuard('inventory')] },
  { path: 'item-edit', component: ItemEditComponent, canActivate: [authGuard, moduleGuard('inventory')] },
  { path: 'stock-upload', component: StockUploadComponent, canActivate: [authGuard, moduleGuard('stock_upload')] },
  { path: 'vendors', component: VendorsComponent, canActivate: [authGuard, moduleGuard('vendors'), phase2Guard] },
  { path: 'vendor-detail', component: VendorDetailComponent, canActivate: [authGuard, moduleGuard('vendors'), phase2Guard] },
  { path: 'purchase-orders', component: PurchaseOrdersComponent, canActivate: [authGuard, moduleGuard('purchase_orders'), phase2Guard] },
  { path: 'po-detail', component: PoDetailComponent, canActivate: [authGuard, moduleGuard('purchase_orders'), phase2Guard] },
  { path: 'purchase-returns', component: PurchaseReturnsComponent, canActivate: [authGuard, moduleGuard('purchase_orders'), phase2Guard] },
  { path: 'stock-adjustment', component: StockAdjustmentComponent, canActivate: [authGuard, moduleGuard('inventory'), phase2Guard] },
  { path: 'batch-expiry', component: BatchExpiryComponent, canActivate: [authGuard, moduleGuard('inventory'), phase2Guard] },
  { path: 'reorder-alerts', component: ReorderAlertsComponent, canActivate: [authGuard, moduleGuard('inventory'), phase2Guard] },
  { path: 'stock-audit', component: StockAuditComponent, canActivate: [authGuard, moduleGuard('inventory'), phase2Guard] },
  { path: 'discounts', component: DiscountsComponent, canActivate: [authGuard, adminGuard] },
  { path: 'tax-settings', component: TaxSettingsComponent, canActivate: [authGuard, moduleGuard('tax_config')] },
  { path: 'users', component: UsersComponent, canActivate: [authGuard, moduleGuard('users')] },
  { path: 'store-settings', component: StoreSettingsComponent, canActivate: [authGuard, moduleGuard('store_settings', 'backup')] },
  { path: 'reports', component: ReportsComponent, canActivate: [authGuard, moduleGuard('reports')] },
  { path: 'ai-insights', component: AiInsightsComponent, canActivate: [authGuard, moduleGuard('ai_insights'), phase2Guard] },
  
  { path: '', redirectTo: 'pos', pathMatch: 'full' },
  { path: '**', redirectTo: 'pos' }
];
