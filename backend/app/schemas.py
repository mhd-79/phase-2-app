from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    pin: str
    role: str = "cashier"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    full_name: str
    sub_text: str

class UserSchema(BaseModel):
    id: str
    username: str
    role: str
    full_name: str
    sub_text: str
    is_active: bool

class UserCreate(BaseModel):
    username: str
    pin: str
    role: str
    full_name: str
    sub_text: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None

class PinVerifyRequest(BaseModel):
    pin: str

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
