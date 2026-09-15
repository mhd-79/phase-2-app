import { Injectable, signal, computed } from "@angular/core";
import { CatalogItem, Category } from "../models/item.model";
import { OfflineStorageService } from "./offline-storage.service";

@Injectable({ providedIn: "root" })
export class CatalogService {
  private readonly CATALOG_KEY = "pos_catalog_items_v2";
  private readonly CATEGORIES_KEY = "pos_categories_v2";

  private defaultCategories: Category[] = [
    { id: "all", name: "All" },
    { id: "bev", name: "Beverages" },
    { id: "snk", name: "Snacks" },
    { id: "dai", name: "Dairy" },
    { id: "bak", name: "Bakery" },
    { id: "gro", name: "Grocery" },
    { id: "pc", name: "Personal Care" }
  ];

  private defaultCatalog: CatalogItem[] = [
    { sku: "BEV-001", barcode: "8901030875021", name: "Cola 500ml", category: "Beverages", price: 45, wholesalePrice: 38, tax: 12, stock: 86, min: 20, pricingMethod: "qty", unit: "pcs" },
    { sku: "BEV-002", barcode: "8901030875038", name: "Orange Juice 1L", category: "Beverages", price: 110, wholesalePrice: 92, tax: 12, stock: 34, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "BEV-003", barcode: "8901030875045", name: "Mineral Water 1L", category: "Beverages", price: 20, wholesalePrice: 16, tax: 5, stock: 210, min: 40, pricingMethod: "qty", unit: "pcs" },
    { sku: "BEV-004", barcode: "8901030875052", name: "Green Tea 25 Bags", category: "Beverages", price: 165, wholesalePrice: 140, tax: 5, stock: 12, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "SNK-001", barcode: "8901030876141", name: "Potato Chips 90g", category: "Snacks", price: 35, wholesalePrice: 29, tax: 12, stock: 120, min: 30, pricingMethod: "qty", unit: "pcs" },
    { sku: "SNK-002", barcode: "8901030876158", name: "Choco Cookies 200g", category: "Snacks", price: 60, wholesalePrice: 50, tax: 18, stock: 8, min: 20, pricingMethod: "qty", unit: "pcs" },
    { sku: "SNK-003", barcode: "8901030876165", name: "Salted Peanuts 150g", category: "Snacks", price: 40, wholesalePrice: 33, tax: 12, stock: 55, min: 20, pricingMethod: "qty", unit: "pcs" },
    { sku: "SNK-004", barcode: "8901030876172", name: "Popcorn Butter 100g", category: "Snacks", price: 55, wholesalePrice: 46, tax: 12, stock: 42, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "DAI-001", barcode: "8901030877247", name: "Toned Milk 500ml", category: "Dairy", price: 28, wholesalePrice: 24, tax: 0, stock: 64, min: 25, pricingMethod: "qty", unit: "pcs" },
    { sku: "DAI-002", barcode: "8901030877254", name: "Curd Cup 200g", category: "Dairy", price: 25, wholesalePrice: 21, tax: 0, stock: 5, min: 20, pricingMethod: "qty", unit: "pcs" },
    { sku: "DAI-003", barcode: "8901030877261", name: "Paneer 200g", category: "Dairy", price: 90, wholesalePrice: 75, tax: 5, stock: 18, min: 10, pricingMethod: "weight", unit: "kg" },
    { sku: "DAI-004", barcode: "8901030877278", name: "Butter 100g", category: "Dairy", price: 58, wholesalePrice: 48, tax: 12, stock: 30, min: 12, pricingMethod: "qty", unit: "pcs" },
    { sku: "BAK-001", barcode: "8901030878350", name: "White Bread 400g", category: "Bakery", price: 42, wholesalePrice: 35, tax: 5, stock: 27, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "BAK-002", barcode: "8901030878367", name: "Brown Bread 400g", category: "Bakery", price: 48, wholesalePrice: 40, tax: 5, stock: 22, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "BAK-003", barcode: "8901030878374", name: "Croissant (pc)", category: "Bakery", price: 35, wholesalePrice: 29, tax: 5, stock: 16, min: 10, pricingMethod: "qty", unit: "pcs" },
    { sku: "GRO-001", barcode: "8901030879456", name: "Basmati Rice 1kg", category: "Grocery", price: 135, wholesalePrice: 112, tax: 5, stock: 48, min: 15, pricingMethod: "weight", unit: "kg" },
    { sku: "GRO-002", barcode: "8901030879463", name: "Toor Dal 1kg", category: "Grocery", price: 148, wholesalePrice: 124, tax: 5, stock: 33, min: 15, pricingMethod: "weight", unit: "kg" },
    { sku: "GRO-003", barcode: "8901030879470", name: "Sunflower Oil 1L", category: "Grocery", price: 175, wholesalePrice: 148, tax: 5, stock: 40, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "GRO-004", barcode: "8901030879487", name: "Sugar 1kg", category: "Grocery", price: 52, wholesalePrice: 43, tax: 5, stock: 60, min: 20, pricingMethod: "weight", unit: "kg" },
    { sku: "GRO-005", barcode: "8901030879494", name: "Wheat Atta 5kg", category: "Grocery", price: 245, wholesalePrice: 205, tax: 5, stock: 21, min: 10, pricingMethod: "weight", unit: "kg" },
    { sku: "PC-001", barcode: "8901030880568", name: "Toothpaste 100g", category: "Personal Care", price: 65, wholesalePrice: 54, tax: 18, stock: 44, min: 15, pricingMethod: "qty", unit: "pcs" },
    { sku: "PC-002", barcode: "8901030880575", name: "Shampoo 340ml", category: "Personal Care", price: 210, wholesalePrice: 178, tax: 18, stock: 19, min: 10, pricingMethod: "qty", unit: "pcs" },
    { sku: "PC-003", barcode: "8901030880582", name: "Hand Wash 250ml", category: "Personal Care", price: 95, wholesalePrice: 80, tax: 18, stock: 7, min: 12, pricingMethod: "qty", unit: "pcs" },
    { sku: "PC-004", barcode: "8901030880599", name: "Bath Soap (pc)", category: "Personal Care", price: 38, wholesalePrice: 31, tax: 18, stock: 96, min: 25, pricingMethod: "qty", unit: "pcs" }
  ];

  items = signal<CatalogItem[]>(this.loadInitialCatalog());
  categories = signal<Category[]>(this.loadCategories());

  lowStockCount = computed(() => this.items().filter(i => i.stock <= i.min).length);

  constructor(private storage: OfflineStorageService) {}

  private loadInitialCatalog(): CatalogItem[] {
    const list = this.storage.getItem<CatalogItem[]>(this.CATALOG_KEY, []);
    return list.length > 0 ? list : this.defaultCatalog;
  }

  private loadCategories(): Category[] {
    const list = this.storage.getItem<Category[]>(this.CATEGORIES_KEY, []);
    return list.length > 0 ? list : this.defaultCategories;
  }

  findByQueryOrBarcode(query: string): CatalogItem | undefined {
    const q = query.trim().toLowerCase();
    return this.items().find(i => 
      i.barcode === query || 
      i.sku.toLowerCase() === q || 
      i.name.toLowerCase().includes(q)
    );
  }

  deductStock(sku: string, qty: number): void {
    const updated = this.items().map(item => {
      if (item.sku === sku) {
        return { ...item, stock: Math.max(0, item.stock - qty) };
      }
      return item;
    });
    this.items.set(updated);
    this.storage.setItem(this.CATALOG_KEY, updated);
  }

  upsertItem(item: CatalogItem): void {
    const list = this.items();
    const idx = list.findIndex(i => i.sku === item.sku);
    let updated: CatalogItem[];
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = item;
    } else {
      updated = [item, ...list];
    }
    this.items.set(updated);
    this.storage.setItem(this.CATALOG_KEY, updated);
  }
}
