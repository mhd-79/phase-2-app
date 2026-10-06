import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OfflineDbService {
  /** One IndexedDB per business so offline catalog / held bills / queued sales never cross tenants on a shared browser. */
  private get dbName(): string {
    const owner = localStorage.getItem('pos_cache_owner');
    return !owner || owner === 'default' ? 'OkutoMartPOS_DB' : `OkutoMartPOS_DB_${owner}`;
  }
  private openName: string | null = null;
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db && this.openName === this.dbName) return;
    if (this.db) { this.db.close(); this.db = null; }
    this.openName = this.dbName;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('catalog')) {
          db.createObjectStore('catalog', { keyPath: 'sku' });
        }
        if (!db.objectStoreNames.contains('held_bills')) {
          db.createObjectStore('held_bills', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline_sales')) {
          db.createObjectStore('offline_sales', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e: any) => {
        this.db = e.target.result;
        resolve();
      };
      req.onerror = (err) => reject(err);
    });
  }

  async saveCatalog(items: any[]): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction('catalog', 'readwrite');
    const store = tx.objectStore('catalog');
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  }

  async getCatalog(): Promise<any[]> {
    await this.init();
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('catalog', 'readonly');
      const store = tx.objectStore('catalog');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async saveHeldBill(bill: any): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction('held_bills', 'readwrite');
    tx.objectStore('held_bills').put(bill);
  }

  async getHeldBills(): Promise<any[]> {
    await this.init();
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('held_bills', 'readonly');
      const req = tx.objectStore('held_bills').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async removeHeldBill(id: string): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction('held_bills', 'readwrite');
    tx.objectStore('held_bills').delete(id);
  }

  async queueOfflineSale(sale: any): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction('offline_sales', 'readwrite');
    tx.objectStore('offline_sales').add({ ...sale, queued_at: new Date().toISOString() });
  }

  async getQueuedSales(): Promise<any[]> {
    await this.init();
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction('offline_sales', 'readonly');
      const req = tx.objectStore('offline_sales').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async clearQueuedSales(): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction('offline_sales', 'readwrite');
    tx.objectStore('offline_sales').clear();
  }
}
