from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    pin: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    full_name: str
    sub_text: str
    auto_lock: str = "2 min"
    phase_access: int = 2

class UserSchema(BaseModel):
    id: str
    username: str
    role: str
    full_name: str
    sub_text: str
    is_active: bool
    auto_lock: str = "2 min"
    schedule_json: Optional[str] = None
    phase_access: int = 2

class UserCreate(BaseModel):
    username: str
    pin: str
    role: str
    full_name: str
    sub_text: str
    auto_lock: Optional[str] = "2 min"
    schedule_json: Optional[str] = None
    phase_access: Optional[int] = Field(default=None, ge=1, le=2)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None
    auto_lock: Optional[str] = None
    schedule_json: Optional[str] = None
    phase_access: Optional[int] = Field(default=None, ge=1, le=2)

class PinVerifyRequest(BaseModel):
    pin: str

class ForgotPinRequest(BaseModel):
    username: str
    notes: Optional[str] = None

class ResetPinRequest(BaseModel):
    username: str
    new_pin: str

class CashCounterSchema(BaseModel):
    id: str
    counter_name: str
    opening_float: float
    is_active: bool

class CashCounterCreate(BaseModel):
    counter_name: str
    opening_float: float = 2000.0

class CashCounterUpdateFloat(BaseModel):
    opening_float: float

# --- Catalog ---
class ItemSchema(BaseModel):
    sku: str
    barcode: str
    name: str
    category_name: str
    price: float
    wholesale_price: Optional[float] = None
    cost_price: float = 0.0
    tax_rate: float
    stock: float
    min_stock: float = 10.0
    pricing_method: str = "qty" # "qty" | "weight"
    unit: str = "pcs"
    is_active: bool = True

class ItemCreate(BaseModel):
    sku: str
    barcode: str
    name: str
    category_name: str
    price: float
    wholesale_price: Optional[float] = None
    cost_price: float = 0.0
    tax_rate: float
    stock: float
    min_stock: float = 10.0
    pricing_method: str = "qty"
    unit: str = "pcs"

class ItemUpdate(BaseModel):
    barcode: Optional[str] = None
    name: Optional[str] = None
    category_name: Optional[str] = None
    price: Optional[float] = None
    wholesale_price: Optional[float] = None
    cost_price: Optional[float] = None
    tax_rate: Optional[float] = None
    stock: Optional[float] = None
    min_stock: Optional[float] = None
    pricing_method: Optional[str] = None
    unit: Optional[str] = None
    is_active: Optional[bool] = None

class CategorySchema(BaseModel):
    id: str
    name: str

class CategoryCreate(BaseModel):
    name: str

class StockUploadRow(BaseModel):
    sku: str
    barcode: Optional[str] = ""
    name: str
    category: Optional[str] = "Grocery"
    selling_price: float
    tax_rate: Optional[float] = 0.0
    opening_qty: float

class UploadPreviewResult(BaseModel):
    total_rows: int
    new_count: int
    update_count: int
    error_count: int
    rows: List[Dict[str, Any]]

# --- Discounts ---
class DiscountSchema(BaseModel):
    id: str
    name: str
    type: str # "percent" | "flat"
    value: float
    applies_to: str # "all" | "selected"
    product_skus: List[str] = []
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "active"

class DiscountCreate(BaseModel):
    name: str
    type: str
    value: float
    applies_to: str = "all"
    product_skus: List[str] = []
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "active"

# --- Billing ---
class CartLineInput(BaseModel):
    sku: str
    name: str
    price: float
    mrp: Optional[float] = None
    wholesale_price: Optional[float] = None
    price_type: Optional[str] = "mrp"
    tax: float = 0.0
    qty: float
    unit: str = "pcs"
    pricing_method: str = "qty"

class ManualDiscountInput(BaseModel):
    type: str = "percent" # "percent" | "flat"
    value: float = 0.0
    approved: bool = True

class TenderInput(BaseModel):
    mode: str # "Cash" | "Card" | "UPI"
    amount: float

class SaleCreate(BaseModel):
    lines: List[CartLineInput]
    pricing_mode: str = "exclusive"
    manual_discount: Optional[ManualDiscountInput] = None
    tenders: List[TenderInput]

class SaleReturnCreate(BaseModel):
    invoice_no: str
    reason: Optional[str] = "Customer return"
    items: List[Dict[str, Any]] # [{"sku": "...", "qty": 1.0}]

class HeldBillCreate(BaseModel):
    id: Optional[str] = None
    lines: List[Dict[str, Any]]
    discount: Optional[Dict[str, Any]] = None
    item_count: float
    total: float

# --- Store Settings ---
class StoreSettingsSchema(BaseModel):
    store_name: str
    address: str
    phone: str
    gstin: str
    pricing_mode: str
    idle_timeout_seconds: int

class StoreSettingsUpdate(BaseModel):
    store_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pricing_mode: Optional[str] = None
    idle_timeout_seconds: Optional[int] = None

# --- Phase 2: Vendors & Procurement ---
class VendorCreate(BaseModel):
    id: Optional[str] = None
    name: str
    category: str = "General"
    contact: str = "—"
    phone: str = "—"
    email: str = "—"
    terms: str = "Net 30"
    status: str = "Active"
    payable: float = 0.0

class VendorUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    terms: Optional[str] = None
    status: Optional[str] = None

class VendorSchema(BaseModel):
    id: str
    name: str
    category: str
    contact: str
    phone: str
    email: str
    terms: str
    status: str
    payable: float

class VendorPaymentCreate(BaseModel):
    amount: float
    mode: str = "Bank Transfer" # "Bank Transfer" | "Cheque" | "UPI" | "Cash"

class POLineInput(BaseModel):
    sku: str
    name: str
    qty: float
    cost: float

class PurchaseOrderCreate(BaseModel):
    vendorId: str
    expected: str
    lines: List[POLineInput]

class GRNLineInput(BaseModel):
    sku: str
    qty: float

class GRNCreate(BaseModel):
    poId: str
    lines: List[GRNLineInput]
    vendorId: Optional[str] = None

class DirectGRNLineInput(BaseModel):
    sku: str
    qty: float
    cost: float

class DirectGRNCreate(BaseModel):
    vendorId: str
    lines: List[DirectGRNLineInput]

class LandedCostAllocationInput(BaseModel):
    amount: float
    allocation_method: str = "cost_ratio" # "cost_ratio" | "equal"

class PurchaseReturnLineInput(BaseModel):
    sku: str
    name: str
    qty: float
    cost: float

class PurchaseReturnCreate(BaseModel):
    vendorId: str
    lines: List[PurchaseReturnLineInput]
    reason: str = "Damaged in transit"

class StockAdjustmentCreate(BaseModel):
    sku: str
    name: Optional[str] = None
    delta: float
    reason: str
    notes: Optional[str] = None
    approvedBy: Optional[str] = "Arjun M."

class BatchCreate(BaseModel):
    sku: str
    name: str
    batch: str
    mfgDate: str
    expiryDate: str
    qty: float

class CycleCountItemInput(BaseModel):
    sku: str
    countedQty: float

class StockAuditPostInput(BaseModel):
    counts: List[CycleCountItemInput]
    approvedBy: Optional[str] = "Arjun M."

