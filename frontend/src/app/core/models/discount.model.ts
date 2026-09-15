export interface DiscountRule {
  id: string;
  name: string;
  type: "BOGO" | "FLAT" | "PERCENT" | "CATEGORY";
  code?: string;
  value: number;
  minSpend?: number;
  targetCategory?: string;
  targetSku?: string;
  isActive: boolean;
}
