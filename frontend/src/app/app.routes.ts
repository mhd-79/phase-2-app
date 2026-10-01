import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard, phase2Guard } from './guards/role.guard';

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

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  
  // Cashier & Admin Shared Billing Routes
  { path: 'pos', component: PosComponent, canActivate: [authGuard] },
  { path: 'hold-bills', component: HoldBillsComponent, canActivate: [authGuard] },
  { path: 'returns', component: ReturnsComponent, canActivate: [authGuard] },
  { path: 'receipt-preview', component: ReceiptPreviewComponent, canActivate: [authGuard] },
  
  // Admin Only Management & Procurement Routes (Phase 2 routes additionally require Phase 2 access)
  { path: 'items-stock', component: ItemsStockComponent, canActivate: [authGuard, adminGuard] },
  { path: 'item-edit', component: ItemEditComponent, canActivate: [authGuard, adminGuard] },
  { path: 'stock-upload', component: StockUploadComponent, canActivate: [authGuard, adminGuard] },
  { path: 'vendors', component: VendorsComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'vendor-detail', component: VendorDetailComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'purchase-orders', component: PurchaseOrdersComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'po-detail', component: PoDetailComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'purchase-returns', component: PurchaseReturnsComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'stock-adjustment', component: StockAdjustmentComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'batch-expiry', component: BatchExpiryComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'reorder-alerts', component: ReorderAlertsComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'stock-audit', component: StockAuditComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  { path: 'discounts', component: DiscountsComponent, canActivate: [authGuard, adminGuard] },
  { path: 'tax-settings', component: TaxSettingsComponent, canActivate: [authGuard, adminGuard] },
  { path: 'users', component: UsersComponent, canActivate: [authGuard, adminGuard] },
  { path: 'store-settings', component: StoreSettingsComponent, canActivate: [authGuard, adminGuard] },
  { path: 'reports', component: ReportsComponent, canActivate: [authGuard, adminGuard] },
  { path: 'ai-insights', component: AiInsightsComponent, canActivate: [authGuard, adminGuard, phase2Guard] },
  
  { path: '', redirectTo: 'pos', pathMatch: 'full' },
  { path: '**', redirectTo: 'pos' }
];
