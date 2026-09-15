export interface CartItem {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  taxRate: number;
  taxType: "inclusive" | "exclusive";
  taxAmount: number;
  qty: number;
  discountType?: "none" | "flat" | "pct";
  discountValue?: number;
  lineTotal: number;
  pricingMethod?: "qty" | "weight";
  unit?: string;
}

export interface TenderPayment {
  mode: "CASH" | "CARD" | "UPI";
  amount: number;
  reference?: string;
}

export interface SaleTransaction {
  id?: string;
  invoiceNo: string;
  timestamp: string;
  cashierName: string;
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  roundedTotal: number;
  roundOff: number;
  tendered: TenderPayment[];
  changeDue: number;
  status: "COMPLETED" | "HELD" | "RETURNED";
  customerName?: string;
  customerPhone?: string;
}

export interface HeldBill {
  id: string;
  referenceName: string;
  savedAt: string;
  cashier: string;
  itemCount: number;
  total: number;
  cart: CartItem[];
}
