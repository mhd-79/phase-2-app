import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OfflineDbService } from './offline-db.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface CatalogItem {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  wholesalePrice?: number;
  costPrice?: number;
  tax: number;
  stock: number;
  min: number;
  pricingMethod: 'qty' | 'weight';
  unit: string;
  isActive?: boolean;
}

const DEFAULT_DEMO_ITEMS: CatalogItem[] = [
  { sku: "BEV-001", barcode: "8901030875021", name: "Cola 500ml", category: "Beverages", price: 45, wholesalePrice: 38, tax: 12, stock: 86, min: 20, pricingMethod: "qty", unit: "pcs" },
  { sku: "BEV-002", barcode: "8901030875038", name: "Orange Juice 1L", category: "Beverages", price: 110, wholesalePrice: 92, tax: 12, stock: 34, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "BEV-003", barcode: "8901030875045", name: "Mineral Water 1L", category: "Beverages", price: 20, wholesalePrice: 16, tax: 5, stock: 210, min: 40, pricingMethod: "qty", unit: "pcs" },
  { sku: "BEV-004", barcode: "8901030875052", name: "Green Tea 25 Bags", category: "Beverages", price: 165, wholesalePrice: 140, tax: 5, stock: 12, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "BEV-005", barcode: "8901030875069", name: "Lemon Iced Tea 500ml", category: "Beverages", price: 55, wholesalePrice: 32, tax: 12, stock: 60, min: 20, pricingMethod: "qty", unit: "pcs" },
  { sku: "SNK-001", barcode: "8901030876141", name: "Potato Chips 90g", category: "Snacks", price: 35, wholesalePrice: 29, tax: 12, stock: 120, min: 30, pricingMethod: "qty", unit: "pcs" },
  { sku: "SNK-002", barcode: "8901030876158", name: "Choco Cookies 200g", category: "Snacks", price: 60, wholesalePrice: 50, tax: 18, stock: 8, min: 20, pricingMethod: "qty", unit: "pcs" },
  { sku: "SNK-003", barcode: "8901030876165", name: "Salted Peanuts 150g", category: "Snacks", price: 40, wholesalePrice: 33, tax: 12, stock: 55, min: 20, pricingMethod: "qty", unit: "pcs" },
  { sku: "SNK-004", barcode: "8901030876172", name: "Popcorn Butter 100g", category: "Snacks", price: 55, wholesalePrice: 46, tax: 12, stock: 42, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "SNK-005", barcode: "8901030876189", name: "Trail Mix 120g", category: "Snacks", price: 70, wholesalePrice: 38, tax: 12, stock: 45, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "DAI-001", barcode: "8901030877247", name: "Toned Milk 500ml", category: "Dairy", price: 28, wholesalePrice: 24, tax: 0, stock: 64, min: 25, pricingMethod: "qty", unit: "pcs" },
  { sku: "DAI-002", barcode: "8901030877254", name: "Curd Cup 200g", category: "Dairy", price: 25, wholesalePrice: 21, tax: 0, stock: 5, min: 20, pricingMethod: "qty", unit: "pcs" },
  { sku: "DAI-003", barcode: "8901030877261", name: "Paneer 200g", category: "Dairy", price: 90, wholesalePrice: 75, tax: 5, stock: 18, min: 10, pricingMethod: "weight", unit: "kg" },
  { sku: "DAI-004", barcode: "8901030877278", name: "Butter 100g", category: "Dairy", price: 58, wholesalePrice: 48, tax: 12, stock: 30, min: 12, pricingMethod: "qty", unit: "pcs" },
  { sku: "DAI-005", barcode: "8901030877285", name: "Greek Yogurt 100g", category: "Dairy", price: 39, wholesalePrice: 22, tax: 0, stock: 80, min: 20, pricingMethod: "qty", unit: "pcs" },
  { sku: "BAK-001", barcode: "8901030878350", name: "White Bread 400g", category: "Bakery", price: 42, wholesalePrice: 35, tax: 5, stock: 27, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "BAK-002", barcode: "8901030878367", name: "Brown Bread 400g", category: "Bakery", price: 48, wholesalePrice: 40, tax: 5, stock: 22, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "BAK-003", barcode: "8901030878374", name: "Croissant (pc)", category: "Bakery", price: 35, wholesalePrice: 29, tax: 5, stock: 16, min: 10, pricingMethod: "qty", unit: "pcs" },
  { sku: "GRO-001", barcode: "8901030879456", name: "Basmati Rice 1kg", category: "Grocery", price: 135, wholesalePrice: 112, tax: 5, stock: 48, min: 15, pricingMethod: "weight", unit: "kg" },
  { sku: "GRO-002", barcode: "8901030879463", name: "Toor Dal 1kg", category: "Grocery", price: 148, wholesalePrice: 124, tax: 5, stock: 33, min: 15, pricingMethod: "weight", unit: "kg" },
  { sku: "GRO-003", barcode: "8901030879470", name: "Sunflower Oil 1L", category: "Grocery", price: 175, wholesalePrice: 148, tax: 5, stock: 40, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "GRO-004", barcode: "8901030879487", name: "Sugar 1kg", category: "Grocery", price: 52, wholesalePrice: 43, tax: 5, stock: 60, min: 20, pricingMethod: "weight", unit: "kg" },
  { sku: "GRO-005", barcode: "8901030879494", name: "Wheat Atta 5kg", category: "Grocery", price: 245, wholesalePrice: 205, tax: 5, stock: 21, min: 10, pricingMethod: "weight", unit: "kg" },
  { sku: "GRO-006", barcode: "8901030879500", name: "Red Kidney Beans 500g", category: "Grocery", price: 89, wholesalePrice: 48, tax: 5, stock: 36, min: 12, pricingMethod: "weight", unit: "kg" },
  { sku: "PC-001", barcode: "8901030880568", name: "Toothpaste 100g", category: "Personal Care", price: 65, wholesalePrice: 54, tax: 18, stock: 44, min: 15, pricingMethod: "qty", unit: "pcs" },
  { sku: "PC-002", barcode: "8901030880575", name: "Shampoo 340ml", category: "Personal Care", price: 210, wholesalePrice: 178, tax: 18, stock: 19, min: 10, pricingMethod: "qty", unit: "pcs" },
  { sku: "PC-003", barcode: "8901030880582", name: "Hand Wash 250ml", category: "Personal Care", price: 95, wholesalePrice: 80, tax: 18, stock: 7, min: 12, pricingMethod: "qty", unit: "pcs" },
  { sku: "PC-004", barcode: "8901030880599", name: "Bath Soap (pc)", category: "Personal Care", price: 38, wholesalePrice: 31, tax: 18, stock: 96, min: 25, pricingMethod: "qty", unit: "pcs" },
  { sku: "PC-005", barcode: "8901030880605", name: "Face Wash 100ml", category: "Personal Care", price: 149, wholesalePrice: 72, tax: 18, stock: 25, min: 10, pricingMethod: "qty", unit: "pcs" }
];

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private offlineDb = inject(OfflineDbService);
  private auth = inject(AuthService);
  private baseUrl = environment.apiUrl;

  private getHeaders(idempotencyKey?: string): HttpHeaders {
    let headers = new HttpHeaders();
    const token = this.auth.token();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    if (idempotencyKey) {
      headers = headers.set('Idempotency-Key', idempotencyKey);
    } else {
      headers = headers.set('Idempotency-Key', 'req-' + Math.random().toString(36).slice(2) + '-' + Date.now());
    }
    return headers;
  }

  // --- Auth & Access ---
  async login(username: string, pin: string): Promise<any> {
    try {
      const res = await firstValueFrom(this.http.post<any>(`${this.baseUrl}/auth/login`, { username, pin }));
      if (res && res.access_token) {
        this.auth.setSession(res.access_token, res.username, res.role, res.full_name, res.sub_text, res.auto_lock || '2 min', res.phase_access ?? 2);
      }
      return res;
    } catch (err: any) {
      // Strictly reject invalid credentials returned by backend
      if (err?.status === 401 || err?.status === 400 || err?.status === 403 || err?.status === 404) {
        throw err;
      }
      // Offline fallback only when valid credentials are supplied and server is unreachable
      const validPins: Record<string, string> = { 'owner.arjun': '9999', 'priya.k': '1234', 'ravi.s': '1234' };
      if (validPins[username] && validPins[username] === pin) {
        const role = username === 'owner.arjun' ? 'admin' : 'cashier';
        const fullName = username === 'owner.arjun' ? 'Arjun M.' : (username === 'ravi.s' ? 'Ravi S.' : 'Priya K.');
        const subText = role === 'admin' ? 'Admin · Store Manager' : 'Cashier · Counter 1';
        const autoLock = role === 'admin' ? '15 min' : '2 min';
        const fallbackToken = 'offline-token-' + Date.now();
        this.auth.setSession(fallbackToken, username, role, fullName, subText, autoLock);
        return { access_token: fallbackToken, username, role, full_name: fullName, sub_text: subText, auto_lock: autoLock };
      }
      throw new Error(err?.error?.detail || 'Unable to reach the server. Please check your connection and try again.');
    }
  }

  async verifyPin(pin: string): Promise<boolean> {
    try {
      const res = await firstValueFrom(this.http.post<any>(`${this.baseUrl}/auth/verify-pin`, { pin }, { headers: this.getHeaders() }));
      return !!res?.valid;
    } catch {
      return false;
    }
  }

  // --- Forgot PIN & Reset PIN ---
  async requestForgotPin(username: string, notes?: string): Promise<any> {
    const headers = this.getHeaders();
    return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/auth/forgot-pin`, { username, notes }, { headers }));
  }

  async getPinResetRequests(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/auth/pin-reset-requests`, { headers: this.getHeaders() }));
    } catch {
      return [];
    }
  }

  async resetUserPin(username: string, newPin: string): Promise<any> {
    const headers = this.getHeaders();
    return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/auth/reset-pin`, { username, new_pin: newPin }, { headers }));
  }

  // --- Users & Roles Management ---
  async getUsers(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/users`, { headers: this.getHeaders() }));
    } catch {
      return [];
    }
  }

  async createUser(user: any): Promise<any> {
    const headers = this.getHeaders();
    return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/users`, user, { headers }));
  }

  async updateUser(username: string, data: any): Promise<any> {
    const headers = this.getHeaders();
    return await firstValueFrom(this.http.put<any>(`${this.baseUrl}/users/${username}`, data, { headers }));
  }

  async getAuditLogs(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/users/audit-logs`, { headers: this.getHeaders() }));
    } catch {
      return [];
    }
  }

  // --- Cash Counters & Float (Gap 8) ---
  async getCashCounters(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/reports/cash-drawer/counters`, { headers: this.getHeaders() }));
    } catch {
      return [
        { id: 'cnt-1', counter_name: 'Counter 1', opening_float: 2000.0, is_active: true }
      ];
    }
  }

  async createCashCounter(counterName: string, openingFloat: number = 2000.0): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/reports/cash-drawer/counters`, { counter_name: counterName, opening_float: openingFloat }, { headers: this.getHeaders() }));
    } catch {
      return { id: `cnt-${Date.now()}`, counter_name: counterName, opening_float: openingFloat, is_active: true };
    }
  }

  async updateCounterFloat(counterId: string, openingFloat: number): Promise<any> {
    try {
      return await firstValueFrom(this.http.put<any>(`${this.baseUrl}/reports/cash-drawer/counters/${counterId}/float`, { opening_float: openingFloat }, { headers: this.getHeaders() }));
    } catch {
      return { id: counterId, opening_float: openingFloat };
    }
  }

  // --- AI Insights (Gaps 11, 12) ---
  async getAIInsights(fromDate?: string, toDate?: string): Promise<any> {
    try {
      let url = `${this.baseUrl}/reports/ai-insights`;
      const params = [];
      if (fromDate) params.push(`from_date=${encodeURIComponent(fromDate)}`);
      if (toDate) params.push(`to_date=${encodeURIComponent(toDate)}`);
      if (params.length) url += `?${params.join('&')}`;
      return await firstValueFrom(this.http.get<any>(url, { headers: this.getHeaders() }));
    } catch {
      return null;
    }
  }

  // --- AI Insights module (dedicated page; live PostgreSQL analytics, no offline fallback) ---
  async getAiModule(name: string, params: Record<string, string | number> = {}): Promise<any> {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    try {
      return await firstValueFrom(this.http.get<any>(`${this.baseUrl}/ai-insights/${name}${qs ? '?' + qs : ''}`, { headers: this.getHeaders() }));
    } catch (err: any) {
      // Say *why* it failed: unreachable API vs. rejected session vs. a server-side error with its own explanation.
      const status: number = err?.status ?? 0;
      const detail: string | null = err?.error && typeof err.error === 'object' ? (err.error.detail ?? null) : null;
      let message: string;
      if (!status) {
        message = `Cannot reach the API at ${this.baseUrl}. Make sure the FastAPI backend is running and its database connection is healthy (check ${this.baseUrl.replace('/api/v1', '')}/health).`;
      } else if (status === 401 || status === 403) {
        message = `${detail || 'Not authorised'} — sign out and sign in again (with the backend running) to get a valid admin session.`;
      } else {
        message = detail || `The server returned an error (HTTP ${status}) while loading this insight.`;
      }
      return { status: 'error', message, httpStatus: status };
    }
  }

  async getStockOnHandReport(): Promise<any> {
    try {
      return await firstValueFrom(this.http.get<any>(`${this.baseUrl}/reports/stock-on-hand`, { headers: this.getHeaders() }));
    } catch {
      return null;
    }
  }

  async saveBatch(batchData: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/batches`, batchData, { headers: this.getHeaders() }));
    } catch {
      return batchData;
    }
  }

  // --- Catalog ---
  async getCatalog(): Promise<CatalogItem[]> {
    try {
      const items: any[] = await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/catalog/items`, { headers: this.getHeaders() }));
      if (items && items.length > 0) {
        const mapped: CatalogItem[] = items.map(i => ({
          sku: i.sku,
          barcode: i.barcode,
          name: i.name,
          category: i.category_name || i.category,
          price: i.price,
          wholesalePrice: i.wholesale_price,
          costPrice: i.cost_price,
          tax: i.tax_rate || i.tax,
          stock: i.stock,
          min: i.min_stock || i.min || 10,
          pricingMethod: i.pricing_method || i.pricingMethod || 'qty',
          unit: i.unit || 'pcs'
        }));
        await this.offlineDb.saveCatalog(mapped);
        return mapped;
      }
      return this.getLocalCatalog();
    } catch {
      const cached = await this.offlineDb.getCatalog();
      if (cached && cached.length > 0) return cached;
      return this.getLocalCatalog();
    }
  }

  getLocalCatalog(): CatalogItem[] {
    try {
      const overrides = JSON.parse(localStorage.getItem('pos_demo_item_overrides_v2') || '{}');
      const custom = JSON.parse(localStorage.getItem('pos_demo_custom_items') || '[]');
      const base = DEFAULT_DEMO_ITEMS.concat(custom);
      return base.map(item => Object.assign({}, item, overrides[item.sku] || {}));
    } catch {
      return DEFAULT_DEMO_ITEMS;
    }
  }

  async updateLocalStock(sku: string, delta: number): Promise<number> {
    const catalog = this.getLocalCatalog();
    const item = catalog.find(i => i.sku === sku);
    const current = item ? item.stock : 0;
    const next = Math.max(0, Math.round((current + delta) * 1000) / 1000);
    const overrides = JSON.parse(localStorage.getItem('pos_demo_item_overrides_v2') || '{}');
    overrides[sku] = Object.assign({}, overrides[sku], { stock: next });
    localStorage.setItem('pos_demo_item_overrides_v2', JSON.stringify(overrides));
    return next;
  }

  async getCategories(): Promise<string[]> {
    let cats: string[] = [];
    try {
      const dbCats = await firstValueFrom(this.http.get<string[]>(`${this.baseUrl}/catalog/categories`, { headers: this.getHeaders() }));
      if (dbCats && dbCats.length > 0) cats = dbCats;
    } catch {
      // offline mode
    }
    const local = this.getLocalCategories();
    return listUnique([...cats, ...local]);
  }

  getLocalCategories(): string[] {
    const custom = JSON.parse(localStorage.getItem('pos_demo_custom_categories') || '[]');
    const items = this.getLocalCatalog();
    const itemCats = items.map(i => i.category).filter(Boolean);
    const base = ["Beverages", "Snacks", "Dairy", "Bakery", "Grocery", "Personal Care"];
    return listUnique([...base, ...custom, ...itemCats]);
  }

  async addCategory(name: string): Promise<boolean> {
    const custom = JSON.parse(localStorage.getItem('pos_demo_custom_categories') || '[]');
    if (!custom.includes(name)) {
      custom.push(name);
      localStorage.setItem('pos_demo_custom_categories', JSON.stringify(custom));
    }
    try {
      await firstValueFrom(this.http.post(`${this.baseUrl}/catalog/categories`, { name }, { headers: this.getHeaders() }));
    } catch {
      // offline mode
    }
    return true;
  }

  async saveItem(item: CatalogItem): Promise<void> {
    try {
      const body = {
        sku: item.sku,
        barcode: item.barcode,
        name: item.name,
        category_name: item.category,
        price: item.price,
        wholesale_price: item.wholesalePrice,
        tax_rate: item.tax,
        stock: item.stock,
        min_stock: item.min,
        pricing_method: item.pricingMethod,
        unit: item.unit
      };
      await firstValueFrom(this.http.post(`${this.baseUrl}/catalog/items`, body, { headers: this.getHeaders() }));
    } catch {
      const custom = JSON.parse(localStorage.getItem('pos_demo_custom_items') || '[]');
      const idx = custom.findIndex((i: any) => i.sku === item.sku);
      if (idx > -1) custom[idx] = item; else custom.push(item);
      localStorage.setItem('pos_demo_custom_items', JSON.stringify(custom));
    }
  }

  // --- Sales & Billing ---
  async createSale(saleData: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post(`${this.baseUrl}/billing/sales`, saleData, { headers: this.getHeaders() }));
    } catch {
      const seq = parseInt(localStorage.getItem('pos_demo_invoice_seq') || '1024', 10) + 1;
      localStorage.setItem('pos_demo_invoice_seq', String(seq));
      const invoiceNo = `INV-FY26-${String(seq).padStart(5, '0')}`;

      for (const line of saleData.lines) {
        await this.updateLocalStock(line.sku, -line.qty);
      }

      const record = {
        invoiceNo,
        time: new Date().toISOString(),
        tenders: saleData.tenders,
        pricingMode: saleData.pricing_mode,
        lines: saleData.lines,
        grandTotal: saleData.grand_total || 0
      };

      const log = JSON.parse(localStorage.getItem('pos_demo_sales_log') || '[]');
      log.push(record);
      localStorage.setItem('pos_demo_sales_log', JSON.stringify(log));

      await this.offlineDb.queueOfflineSale(record);
      return record;
    }
  }

  async getSaleByInvoice(invoiceNo: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.get(`${this.baseUrl}/billing/sales/${invoiceNo}`, { headers: this.getHeaders() }));
    } catch {
      const log = JSON.parse(localStorage.getItem('pos_demo_sales_log') || '[]');
      return log.find((s: any) => s.invoiceNo === invoiceNo) || null;
    }
  }

  async processReturn(returnData: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post(`${this.baseUrl}/billing/returns`, returnData, { headers: this.getHeaders() }));
    } catch {
      for (const item of returnData.items) {
        await this.updateLocalStock(item.sku, item.qty);
      }
      return {
        return_no: `RET-FY26-${Date.now().toString().slice(-5)}`,
        invoice_no: returnData.invoice_no,
        message: 'Return processed offline'
      };
    }
  }

  // --- Hold & Recall ---
  async holdBill(billData: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/billing/held-bills`, billData, { headers: this.getHeaders() }));
    } catch {
      return { held_id: billData.id || `HOLD-${Date.now()}`, message: 'Bill parked locally' };
    }
  }

  async getHeldBills(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/billing/held-bills`, { headers: this.getHeaders() }));
    } catch {
      return [];
    }
  }

  // --- Phase 2: Vendors & Procurement ---
  async getVendors(search?: string): Promise<any[]> {
    try {
      const url = search ? `${this.baseUrl}/vendors?search=${encodeURIComponent(search)}` : `${this.baseUrl}/vendors`;
      return await firstValueFrom(this.http.get<any[]>(url, { headers: this.getHeaders() }));
    } catch {
      const seed = [
        { id: "V-001", name: "Sunrise Distributors", category: "Grocery & Staples", contact: "Ramesh Gupta", phone: "+91 98200 11223", email: "ramesh@sunrisedist.in", terms: "Net 30", status: "Active", payable: 84500 },
        { id: "V-002", name: "Coastal Beverages Co.", category: "Beverages", contact: "Anita Fernandes", phone: "+91 90040 55211", email: "anita@coastalbev.in", terms: "Net 15", status: "Active", payable: 32100 },
        { id: "V-003", name: "Dairy Fresh Farms", category: "Dairy", contact: "Suresh Nair", phone: "+91 89393 40021", email: "suresh@dairyfresh.in", terms: "Net 7", status: "Active", payable: 18450 },
        { id: "V-004", name: "GoldenCrust Bakers", category: "Bakery", contact: "Imran Sheikh", phone: "+91 91234 87765", email: "imran@goldencrust.in", terms: "Net 15", status: "Active", payable: 9800 },
        { id: "V-005", name: "SnackTime Foods", category: "Snacks", contact: "Kavita Rao", phone: "+91 97865 22110", email: "kavita@snacktime.in", terms: "Net 30", status: "Active", payable: 46200 },
        { id: "V-006", name: "CarePlus Toiletries", category: "Personal Care", contact: "Deepak Malhotra", phone: "+91 99887 65432", email: "deepak@careplus.in", terms: "Net 45", status: "Active", payable: 61250 },
        { id: "V-007", name: "QuickPack Wholesale", category: "General / Mixed", contact: "Sana Iyer", phone: "+91 96543 21098", email: "sana@quickpack.in", terms: "Net 30", status: "Active", payable: 0 },
        { id: "V-008", name: "Metro Cash & Carry", category: "Ad-hoc Supply", contact: "Walk-in Counter", phone: "+91 98111 22334", email: "—", terms: "Due on Delivery", status: "Active", payable: 5400 }
      ];
      const overrides = JSON.parse(localStorage.getItem('pos_p2_vendors_v1') || '{"payableDelta":{}, "created":[]}');
      const all = seed.concat(overrides.created || []);
      let list = all.map(v => {
        const copy = Object.assign({}, v);
        if (overrides.payableDelta && overrides.payableDelta[v.id] !== undefined) copy.payable = Math.max(0, v.payable + overrides.payableDelta[v.id]);
        return copy;
      });
      if (search) {
        const term = search.toLowerCase();
        list = list.filter(v => v.name.toLowerCase().includes(term) || v.category.toLowerCase().includes(term));
      }
      return list;
    }
  }

  async getVendorById(id: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.get<any>(`${this.baseUrl}/vendors/${id}`, { headers: this.getHeaders() }));
    } catch {
      const vendors = await this.getVendors();
      return vendors.find(v => v.id === id) || null;
    }
  }

  async createVendor(vendor: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/vendors`, vendor, { headers: this.getHeaders() }));
    } catch {
      const overrides = JSON.parse(localStorage.getItem('pos_p2_vendors_v1') || '{"payableDelta":{}, "created":[]}');
      overrides.created = overrides.created || [];
      vendor.id = vendor.id || ("V-" + Date.now().toString().slice(-6));
      vendor.payable = vendor.payable || 0;
      vendor.status = vendor.status || "Active";
      overrides.created.push(vendor);
      localStorage.setItem('pos_p2_vendors_v1', JSON.stringify(overrides));
      return vendor;
    }
  }

  async getVendorLedger(vendorId: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.get<any>(`${this.baseUrl}/vendors/${vendorId}/ledger`, { headers: this.getHeaders() }));
    } catch {
      const vendor = await this.getVendorById(vendorId);
      const grnLog = JSON.parse(localStorage.getItem('pos_p2_grn_log_v1') || '[]').filter((g: any) => g.vendorId === vendorId);
      const returns = JSON.parse(localStorage.getItem('pos_p2_purchase_returns_v1') || '[]').filter((r: any) => r.vendorId === vendorId);
      const payments = JSON.parse(localStorage.getItem('pos_p2_vendor_payments_v1') || '[]').filter((p: any) => p.vendorId === vendorId);

      const entries: any[] = [];
      grnLog.forEach((g: any) => entries.push({ date: g.date, type: 'Purchase', ref: `${g.id} ${g.poId ? '(' + g.poId + ')' : '(direct)'}`, amount: g.total }));
      returns.forEach((r: any) => entries.push({ date: r.date, type: 'Return', ref: r.id, amount: -r.total }));
      payments.forEach((p: any) => entries.push({ date: p.date, type: 'Payment', ref: `${p.id} (${p.mode})`, amount: -p.amount }));

      return {
        vendor,
        payable: vendor ? vendor.payable : 0,
        open_pos: 0,
        ledger: entries.reverse()
      };
    }
  }

  async recordVendorPayment(vendorId: string, amount: number, mode: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/vendors/${vendorId}/payments`, { amount, mode }, { headers: this.getHeaders() }));
    } catch {
      const overrides = JSON.parse(localStorage.getItem('pos_p2_vendors_v1') || '{"payableDelta":{}, "created":[]}');
      overrides.payableDelta = overrides.payableDelta || {};
      overrides.payableDelta[vendorId] = (overrides.payableDelta[vendorId] || 0) - amount;
      localStorage.setItem('pos_p2_vendors_v1', JSON.stringify(overrides));

      const log = JSON.parse(localStorage.getItem('pos_p2_vendor_payments_v1') || '[]');
      const id = "PMT-" + String(1000 + log.length + 1).slice(-4);
      log.push({ id, vendorId, amount, mode: mode || "Bank Transfer", date: "2026-09-07" });
      localStorage.setItem('pos_p2_vendor_payments_v1', JSON.stringify(log));

      return { id, message: `${id} recorded — payable balance updated` };
    }
  }

  // --- Purchase Orders & GRN ---
  async getPurchaseOrders(status?: string, search?: string): Promise<any[]> {
    try {
      let url = `${this.baseUrl}/purchase-orders`;
      const params = [];
      if (status) params.push(`status=${encodeURIComponent(status)}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (params.length) url += `?${params.join('&')}`;
      return await firstValueFrom(this.http.get<any[]>(url, { headers: this.getHeaders() }));
    } catch {
      const seed = [
        { id: "PO-2026-0139", vendorId: "V-004", date: "2026-08-20", expected: "2026-08-24", status: "Closed", approvedBy: "Arjun M.", lines: [{ sku: "BAK-001", name: "White Bread 400g", orderedQty: 60, receivedQty: 60, cost: 28 }] },
        { id: "PO-2026-0142", vendorId: "V-001", date: "2026-08-28", expected: "2026-09-02", status: "Closed", approvedBy: "Arjun M.", lines: [{ sku: "GRO-001", name: "Basmati Rice 1kg", orderedQty: 100, receivedQty: 100, cost: 95 }] },
        { id: "PO-2026-0145", vendorId: "V-002", date: "2026-09-02", expected: "2026-09-06", status: "Partially Received", approvedBy: "Arjun M.", lines: [{ sku: "BEV-001", name: "Cola 500ml", orderedQty: 200, receivedQty: 160, cost: 30 }, { sku: "BEV-002", name: "Orange Juice 1L", orderedQty: 100, receivedQty: 100, cost: 78 }, { sku: "BEV-003", name: "Mineral Water 1L", orderedQty: 300, receivedQty: 0, cost: 12 }] },
        { id: "PO-2026-0148", vendorId: "V-003", date: "2026-09-05", expected: "2026-09-08", status: "Approved", approvedBy: "Arjun M.", lines: [{ sku: "DAI-001", name: "Toned Milk 500ml", orderedQty: 150, receivedQty: 0, cost: 20 }, { sku: "DAI-002", name: "Curd Cup 200g", orderedQty: 100, receivedQty: 0, cost: 16 }, { sku: "DAI-003", name: "Paneer 200g", orderedQty: 40, receivedQty: 0, cost: 65 }] },
        { id: "PO-2026-0150", vendorId: "V-005", date: "2026-09-06", expected: "2026-09-10", status: "Pending Approval", approvedBy: null, lines: [{ sku: "SNK-002", name: "Choco Cookies 200g", orderedQty: 80, receivedQty: 0, cost: 42 }] },
        { id: "PO-2026-0151", vendorId: "V-006", date: "2026-09-07", expected: "2026-09-12", status: "Draft", approvedBy: null, lines: [{ sku: "PC-002", name: "Shampoo 340ml", orderedQty: 50, receivedQty: 0, cost: 150 }] }
      ];
      const state = JSON.parse(localStorage.getItem('pos_p2_pos_v1') || '{"created":[], "lineOverrides":{}, "statusOverride":{}, "approvedByOverride":{}}');
      const all = seed.concat(state.created || []);
      let list = all.map(po => {
        const copy = JSON.parse(JSON.stringify(po));
        if (state.statusOverride[po.id]) copy.status = state.statusOverride[po.id];
        if (state.approvedByOverride[po.id]) copy.approvedBy = state.approvedByOverride[po.id];
        if (state.lineOverrides[po.id]) {
          copy.lines = copy.lines.map((l: any) => {
            const recv = state.lineOverrides[po.id][l.sku];
            return recv !== undefined ? Object.assign({}, l, { receivedQty: recv }) : l;
          });
        }
        return copy;
      });
      if (status) list = list.filter(p => p.status === status);
      if (search) {
        const term = search.toLowerCase();
        list = list.filter(p => p.id.toLowerCase().includes(term) || p.vendorId.toLowerCase().includes(term));
      }
      return list;
    }
  }

  async getPurchaseOrderById(id: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.get<any>(`${this.baseUrl}/purchase-orders/${id}`, { headers: this.getHeaders() }));
    } catch {
      const pos = await this.getPurchaseOrders();
      return pos.find(p => p.id === id) || null;
    }
  }

  async createPurchaseOrder(data: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/purchase-orders`, data, { headers: this.getHeaders() }));
    } catch {
      const state = JSON.parse(localStorage.getItem('pos_p2_pos_v1') || '{"created":[], "lineOverrides":{}, "statusOverride":{}, "approvedByOverride":{}}');
      const seq = parseInt(localStorage.getItem('pos_p2_po_seq') || '151', 10) + 1;
      localStorage.setItem('pos_p2_po_seq', String(seq));
      const po = {
        id: `PO-2026-0${seq}`, vendorId: data.vendorId, date: data.date || new Date().toISOString().slice(0, 10), expected: data.expected || new Date().toISOString().slice(0, 10),
        status: 'Pending Approval', approvedBy: null,
        lines: data.lines.map((l: any) => ({ sku: l.sku, name: l.name, orderedQty: l.qty, receivedQty: 0, cost: l.cost }))
      };
      state.created = state.created || [];
      state.created.push(po);
      localStorage.setItem('pos_p2_pos_v1', JSON.stringify(state));
      return po;
    }
  }

  async approvePurchaseOrder(poId: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/purchase-orders/${poId}/approve`, {}, { headers: this.getHeaders() }));
    } catch {
      const state = JSON.parse(localStorage.getItem('pos_p2_pos_v1') || '{"created":[], "lineOverrides":{}, "statusOverride":{}, "approvedByOverride":{}}');
      state.statusOverride[poId] = 'Approved';
      state.approvedByOverride[poId] = 'Arjun M.';
      localStorage.setItem('pos_p2_pos_v1', JSON.stringify(state));
      return { id: poId, status: 'Approved', approvedBy: 'Arjun M.' };
    }
  }

  async recordGoodsReceipt(poId: string, lines: any[], vendorId: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/grn/receipt`, { poId, lines, vendorId }, { headers: this.getHeaders() }));
    } catch {
      const state = JSON.parse(localStorage.getItem('pos_p2_pos_v1') || '{"created":[], "lineOverrides":{}, "statusOverride":{}, "approvedByOverride":{}}');
      const po = await this.getPurchaseOrderById(poId);
      state.lineOverrides[poId] = state.lineOverrides[poId] || {};
      const variances: any[] = [];
      lines.forEach((rl: any) => {
        const line = po.lines.find((l: any) => l.sku === rl.sku);
        if (!line) return;
        const newReceived = (line.receivedQty || 0) + rl.qty;
        state.lineOverrides[poId][rl.sku] = newReceived;
        this.updateLocalStock(rl.sku, rl.qty);
        const remaining = line.orderedQty - newReceived;
        if (remaining !== 0) variances.push({ sku: rl.sku, name: line.name, remaining });
      });

      const updatedPo = Object.assign({}, po);
      updatedPo.lines = po.lines.map((l: any) => {
        const recv = state.lineOverrides[poId][l.sku];
        return recv !== undefined ? Object.assign({}, l, { receivedQty: recv }) : l;
      });
      const allDone = updatedPo.lines.every((l: any) => l.receivedQty >= l.orderedQty);
      const anyDone = updatedPo.lines.some((l: any) => l.receivedQty > 0);
      state.statusOverride[poId] = allDone ? 'Received' : (anyDone ? 'Partially Received' : po.status);
      localStorage.setItem('pos_p2_pos_v1', JSON.stringify(state));

      const grnId = "GRN-2026-" + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
      const total = lines.reduce((s: number, rl: any) => {
        const line = po.lines.find((l: any) => l.sku === rl.sku);
        return s + (line ? line.cost * rl.qty : 0);
      }, 0);
      const log = JSON.parse(localStorage.getItem('pos_p2_grn_log_v1') || '[]');
      log.push({ id: grnId, poId, vendorId: vendorId || po.vendorId, date: '2026-09-07', lines, total, variances });
      localStorage.setItem('pos_p2_grn_log_v1', JSON.stringify(log));

      return { grnId, variances, status: state.statusOverride[poId] };
    }
  }

  async recordDirectReceipt(vendorId: string, lines: any[]): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/grn/direct`, { vendorId, lines }, { headers: this.getHeaders() }));
    } catch {
      let total = 0;
      lines.forEach((l: any) => { this.updateLocalStock(l.sku, l.qty); total += l.qty * l.cost; });
      const grnId = "GRN-DIRECT-" + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
      const log = JSON.parse(localStorage.getItem('pos_p2_grn_log_v1') || '[]');
      log.push({ id: grnId, poId: null, vendorId, date: '2026-09-07', lines, total, variances: [] });
      localStorage.setItem('pos_p2_grn_log_v1', JSON.stringify(log));
      return { grnId, total };
    }
  }

  async getGrnLog(vendorId?: string): Promise<any[]> {
    try {
      const url = vendorId ? `${this.baseUrl}/grn?vendor_id=${encodeURIComponent(vendorId)}` : `${this.baseUrl}/grn`;
      return await firstValueFrom(this.http.get<any[]>(url, { headers: this.getHeaders() }));
    } catch {
      const log = JSON.parse(localStorage.getItem('pos_p2_grn_log_v1') || '[]');
      if (vendorId) return log.filter((g: any) => g.vendorId === vendorId);
      return log;
    }
  }

  // --- Purchase Returns ---
  async createPurchaseReturn(vendorId: string, lines: any[], reason: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/purchase-returns`, { vendorId, lines, reason }, { headers: this.getHeaders() }));
    } catch {
      let total = 0;
      lines.forEach((l: any) => { this.updateLocalStock(l.sku, -l.qty); total += l.qty * l.cost; });
      const dnId = "DN-" + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
      const log = JSON.parse(localStorage.getItem('pos_p2_purchase_returns_v1') || '[]');
      log.push({ id: dnId, vendorId, date: '2026-09-07', lines, total, reason });
      localStorage.setItem('pos_p2_purchase_returns_v1', JSON.stringify(log));
      return { id: dnId, total };
    }
  }

  async getPurchaseReturns(vendorId?: string): Promise<any[]> {
    try {
      const url = vendorId ? `${this.baseUrl}/purchase-returns?vendor_id=${encodeURIComponent(vendorId)}` : `${this.baseUrl}/purchase-returns`;
      return await firstValueFrom(this.http.get<any[]>(url, { headers: this.getHeaders() }));
    } catch {
      const log = JSON.parse(localStorage.getItem('pos_p2_purchase_returns_v1') || '[]');
      if (vendorId) return log.filter((r: any) => r.vendorId === vendorId);
      return log;
    }
  }

  // --- Stock Adjustments ---
  async createStockAdjustment(data: { sku: string; name?: string; delta: number; reason: string; notes?: string; approvedBy?: string }): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/stock-adjustments`, data, { headers: this.getHeaders() }));
    } catch {
      this.updateLocalStock(data.sku, data.delta);
      const log = JSON.parse(localStorage.getItem('pos_p2_adjustments_v1') || '[]');
      const id = "ADJ-" + String(90 + log.length + 1).padStart(4, "0");
      log.push({
        id,
        sku: data.sku,
        name: data.name || data.sku,
        delta: data.delta,
        reason: data.reason,
        notes: data.notes || '',
        approvedBy: data.approvedBy || "Arjun M.",
        date: new Date().toISOString().slice(0, 10)
      });
      localStorage.setItem('pos_p2_adjustments_v1', JSON.stringify(log));
      return { id };
    }
  }

  async recordStockAdjustment(sku: string, name: string, delta: number, reason: string, approvedBy?: string): Promise<any> {
    return this.createStockAdjustment({ sku, name, delta, reason, approvedBy });
  }

  async getStockAdjustments(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/stock-adjustments`, { headers: this.getHeaders() }));
    } catch {
      return JSON.parse(localStorage.getItem('pos_p2_adjustments_v1') || '[]');
    }
  }

  // --- Batch & Expiry ---
  async getBatches(status?: string, sku?: string): Promise<any[]> {
    try {
      let url = `${this.baseUrl}/batches`;
      const params = [];
      if (status) params.push(`status=${encodeURIComponent(status)}`);
      if (sku) params.push(`sku=${encodeURIComponent(sku)}`);
      if (params.length) url += `?${params.join('&')}`;
      return await firstValueFrom(this.http.get<any[]>(url, { headers: this.getHeaders() }));
    } catch {
      const seed = [
        { sku: "DAI-002", name: "Curd Cup 200g", batch: "B-CUR-2409A", mfgDate: "2026-09-01", expiryDate: "2026-09-09", qty: 5 },
        { sku: "DAI-003", name: "Paneer 200g", batch: "B-PNR-2408C", mfgDate: "2026-08-30", expiryDate: "2026-09-13", qty: 18 },
        { sku: "DAI-001", name: "Toned Milk 500ml", batch: "B-MLK-2409D", mfgDate: "2026-09-06", expiryDate: "2026-09-10", qty: 64 },
        { sku: "DAI-004", name: "Butter 100g", batch: "B-BTR-2408A", mfgDate: "2026-08-15", expiryDate: "2026-11-15", qty: 30 },
        { sku: "BAK-001", name: "White Bread 400g", batch: "B-WBR-2409G", mfgDate: "2026-09-06", expiryDate: "2026-09-11", qty: 27 },
        { sku: "BAK-003", name: "Croissant (pc)", batch: "B-CRS-2409H", mfgDate: "2026-09-06", expiryDate: "2026-09-09", qty: 16 },
        { sku: "GRO-001", name: "Basmati Rice 1kg", batch: "B-RIC-2408X", mfgDate: "2026-06-01", expiryDate: "2027-06-01", qty: 48 },
        { sku: "SNK-001", name: "Potato Chips 90g", batch: "B-CHP-2408Y", mfgDate: "2026-07-10", expiryDate: "2026-10-10", qty: 120 }
      ];
      const created = JSON.parse(localStorage.getItem('pos_p2_batches_v1') || '[]');
      const refDate = new Date("2026-09-07").getTime();
      return seed.concat(created).map((b: any) => {
        const copy = Object.assign({}, b);
        copy.daysToExpiry = Math.round((new Date(b.expiryDate).getTime() - refDate) / 86400000);
        return copy;
      }).sort((a: any, b: any) => a.daysToExpiry - b.daysToExpiry);
    }
  }

  async addBatch(batch: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/batches`, batch, { headers: this.getHeaders() }));
    } catch {
      const created = JSON.parse(localStorage.getItem('pos_p2_batches_v1') || '[]');
      created.push(batch);
      localStorage.setItem('pos_p2_batches_v1', JSON.stringify(created));
      return batch;
    }
  }

  // --- Reorder Alerts ---
  async getReorderSuggestions(): Promise<any[]> {
    try {
      return await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/reorder-alerts`, { headers: this.getHeaders() }));
    } catch {
      const catalog = this.getLocalCatalog();
      const vendorByCategory: any = { Beverages: "V-002", Snacks: "V-005", Dairy: "V-003", Bakery: "V-004", Grocery: "V-001", "Personal Care": "V-006" };
      const vendors = await this.getVendors();

      return catalog.filter(i => i.stock <= i.min).map(i => {
        const suggestedQty = Math.max(i.min * 3 - i.stock, i.min);
        const vendorId = vendorByCategory[i.category] || "V-007";
        const vendor = vendors.find(v => v.id === vendorId);
        return Object.assign({}, i, { suggestedQty, vendorId, vendorName: vendor ? vendor.name : "—" });
      });
    }
  }

  // --- Stock Audit ---
  async postAuditVariances(counts: any[]): Promise<any> {
    try {
      return await firstValueFrom(this.http.post<any>(`${this.baseUrl}/stock-audit/post-variances`, { counts }, { headers: this.getHeaders() }));
    } catch {
      const catalog = this.getLocalCatalog();
      let posted = 0;
      counts.forEach((c: any) => {
        const item = catalog.find(i => i.sku === c.sku);
        if (!item) return;
        const variance = c.countedQty - item.stock;
        if (variance !== 0) {
          this.recordStockAdjustment(c.sku, item.name, variance, 'Cycle count variance', 'Arjun M.');
          posted++;
        }
      });
      return { postedCount: posted };
    }
  }
}

function listUnique(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

