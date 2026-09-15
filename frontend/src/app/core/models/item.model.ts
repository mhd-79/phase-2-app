export interface CatalogItem {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  wholesalePrice?: number;
  tax: number;
  stock: number;
  min: number;
  pricingMethod?: "qty" | "weight";
  unit?: string;
}

export interface Category {
  id?: string;
  name: string;
}
