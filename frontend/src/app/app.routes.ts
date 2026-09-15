import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent) },
  { path: 'pos', loadComponent: () => import('./components/pos/pos.component').then(m => m.PosComponent) },
  { path: 'hold-bills', loadComponent: () => import('./components/hold-bills/hold-bills.component').then(m => m.HoldBillsComponent) },
  { path: 'returns', loadComponent: () => import('./components/returns/returns.component').then(m => m.ReturnsComponent) },
  { path: 'reports', loadComponent: () => import('./components/reports/reports.component').then(m => m.ReportsComponent), canActivate: [adminGuard] },
  { path: 'items-stock', loadComponent: () => import('./components/items-stock/items-stock.component').then(m => m.ItemsStockComponent), canActivate: [adminGuard] },
  { path: 'stock-upload', loadComponent: () => import('./components/stock-upload/stock-upload.component').then(m => m.StockUploadComponent), canActivate: [adminGuard] },
  { path: 'store-settings', loadComponent: () => import('./components/store-settings/store-settings.component').then(m => m.StoreSettingsComponent), canActivate: [adminGuard] },
  { path: 'tax-settings', loadComponent: () => import('./components/tax-settings/tax-settings.component').then(m => m.TaxSettingsComponent), canActivate: [adminGuard] },
  { path: 'users', loadComponent: () => import('./components/users/users.component').then(m => m.UsersComponent), canActivate: [adminGuard] },
  { path: 'discounts', loadComponent: () => import('./components/discounts/discounts.component').then(m => m.DiscountsComponent), canActivate: [adminGuard] },
  { path: '**', redirectTo: 'login' }
];
