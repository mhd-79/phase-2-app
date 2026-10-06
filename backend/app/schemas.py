import re
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Any, Dict, Literal
from datetime import datetime, date

# --- Auth ---
class LoginRequest(BaseModel):
    # store staff: username + PIN; business owners / Super Admin: email + password
    username: Optional[str] = None
    pin: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    full_name: str
    sub_text: str
    auto_lock: str = "2 min"
    phase_access: int = 2
    active_counter: Optional[str] = None
    modules: Optional[Dict[str, bool]] = None      # effective module access (what the user may open)
    # multi-tenant sign-ins only
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    tenant_status: Optional[str] = None
    subscription_end: Optional[datetime] = None

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
    active_counter: Optional[str] = None
    on_leave: bool = False
    leave_reason: Optional[str] = None
    leave_started_at: Optional[datetime] = None
    modules: Optional[Dict[str, bool]] = None      # effective module access

class UserAccessUpdate(BaseModel):
    modules: Dict[str, bool]

class LeaveRequest(BaseModel):
    on_leave: bool
    reason: Optional[str] = None

class SwitchCounterRequest(BaseModel):
    counter_id: str

class UserCreate(BaseModel):
    username: str
    pin: str
    role: str
    full_name: str
    sub_text: str
    auto_lock: Optional[str] = "2 min"
    schedule_json: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None
    auto_lock: Optional[str] = None
    schedule_json: Optional[str] = None

class TransferAdminRequest(BaseModel):
    current_pin: str

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
    mfg_date: Optional[date] = None
    exp_date: Optional[date] = None

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
    mfg_date: Optional[date] = None
    exp_date: Optional[date] = None

    @field_validator("mfg_date", "exp_date", mode="before")
    @classmethod
    def _blank_date_is_none(cls, v):
        return None if isinstance(v, str) and not v.strip() else v

    @model_validator(mode="after")
    def _expiry_not_before_mfg(self):
        if self.mfg_date and self.exp_date and self.exp_date < self.mfg_date:
            raise ValueError("Expiry Date cannot be earlier than Manufacturing Date")
        return self

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
    mfg_date: Optional[date] = None
    exp_date: Optional[date] = None

    @field_validator("mfg_date", "exp_date", mode="before")
    @classmethod
    def _blank_date_is_none(cls, v):
        return None if isinstance(v, str) and not v.strip() else v

    @model_validator(mode="after")
    def _expiry_not_before_mfg(self):
        if self.mfg_date and self.exp_date and self.exp_date < self.mfg_date:
            raise ValueError("Expiry Date cannot be earlier than Manufacturing Date")
        return self

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

# --- Customers (Phase 2) ---
class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mobile: str
    email: Optional[str] = None
    address: Optional[str] = None
    customerType: str = Field(default="Retail", pattern="^(Retail|Wholesale)$")

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v):
        v = (v or "").strip()
        if v and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Enter a valid email address")
        return v or None

class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    mobile: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    customerType: Optional[str] = Field(default=None, pattern="^(Retail|Wholesale)$")

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v):
        v = (v or "").strip()
        if v and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Enter a valid email address")
        return v or None

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
    customerId: Optional[str] = None   # Phase 2: optional customer on the bill (None = walk-in)

class SaleReturnCreate(BaseModel):
    invoice_no: str
    reason: Optional[str] = None    # optional overall note; the reason is normally given per item
    # [{"sku": "...", "qty": 1.0, "condition": "Good|Damaged|Warranty", "action": "Return|Exchange", "reason": "..."}]; all but sku / qty optional
    items: List[Dict[str, Any]]

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
    return_policy: str = "BOTH"          # RETURN | EXCHANGE | BOTH: what a cashier may do with a returned item

class StoreSettingsUpdate(BaseModel):
    store_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pricing_mode: Optional[str] = None
    idle_timeout_seconds: Optional[int] = None
    return_policy: Optional[Literal["RETURN", "EXCHANGE", "BOTH"]] = None

    @field_validator("return_policy", mode="before")
    @classmethod
    def _upper_policy(cls, v):
        return v.strip().upper() if isinstance(v, str) else v

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
    invoiceId: Optional[str] = None   # purchase invoice (GRN id / PO id) the return is made against

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

