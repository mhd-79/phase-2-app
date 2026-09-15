from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

# --- Auth ---
class LoginRequest(BaseModel):
    username: str = Field(..., description="Unique user account handle (e.g. owner.arjun or priya.k)", example="priya.k")
    pin: str = Field(..., description="4-digit security PIN for staff authentication", example="1234")
    role: str = Field("cashier", description="Target access role ('admin' or 'cashier')", example="cashier")

class TokenResponse(BaseModel):
    access_token: str = Field(..., description="JWT Bearer access token")
    token_type: str = Field("bearer", description="Token type")
    username: str = Field(..., description="Logged-in username")
    role: str = Field(..., description="Assigned role ('admin' or 'cashier')")
    full_name: str = Field(..., description="Staff member full name")
    sub_text: str = Field(..., description="Department or counter description")
    auto_lock_minutes: int = Field(15, description="Configured auto-lock timeout in minutes")

class UserSchema(BaseModel):
    id: str = Field(..., description="User unique UUID")
    username: str = Field(..., description="Account username")
    role: str = Field(..., description="Role permissions ('admin' or 'cashier')")
    full_name: str = Field(..., description="Full display name")
    sub_text: str = Field(..., description="Counter / role subtitle")
    auto_lock_minutes: int = Field(15, description="Auto-lock idle timeout in minutes")
    is_active: bool = Field(True, description="Account active status")

class UserCreate(BaseModel):
    username: str = Field(..., description="Unique username", example="sana.r")
    pin: str = Field(..., description="4-digit security PIN", example="4321")
    role: str = Field(..., description="Role assignment ('admin' or 'cashier')", example="cashier")
    full_name: str = Field(..., description="Full name", example="Sana R.")
    sub_text: str = Field(..., description="Sub-text description", example="Cashier · Counter 3")
    auto_lock_minutes: int = Field(2, description="Auto-lock timeout in minutes", example=2)

class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, description="Updated full name")
    role: Optional[str] = Field(None, description="Updated role ('admin' or 'cashier')")
    pin: Optional[str] = Field(None, description="Updated 4-digit PIN")
    sub_text: Optional[str] = Field(None, description="Updated counter / role subtitle")
    auto_lock_minutes: Optional[int] = Field(None, description="Updated auto-lock timeout in minutes")
    is_active: Optional[bool] = Field(None, description="Updated active status")

class PinVerifyRequest(BaseModel):
    pin: str = Field(..., description="Admin authorization PIN", example="9999")

# --- User Shift & Leave ---
class ShiftDayConfig(BaseModel):
    day_of_week: str = Field(..., description="Day name (e.g. Monday, Tuesday)", example="Monday")
    is_working: bool = Field(True, description="Whether the staff member works on this day")
    start_time: str = Field("09:00 AM", description="Shift start time", example="09:00 AM")
    end_time: str = Field("05:00 PM", description="Shift end time", example="05:00 PM")

class ShiftScheduleUpdateRequest(BaseModel):
    shifts: List[ShiftDayConfig]

class UserLeaveRequest(BaseModel):
    reason: str = Field(..., description="Mandatory reason for taking leave", example="Medical leave / doctor appointment")
    leave_date: Optional[str] = Field(None, description="Leave date in YYYY-MM-DD format (defaults to current date)")

class UserDetailMetricsResponse(BaseModel):
    username: str
    full_name: str
    role: str
    sub_text: str
    initials: str
    is_active: bool
    auto_lock_minutes: int
    
    # Summary Metrics
    total_sales_amount: float
    completed_bills: int
    avg_bill_value: float
    working_hours: float
    returns_count: int
    returns_amount: float
    cancelled_bills: int
    
    # Shift & Work Hours
    today_shift_start: str
    today_shift_end: str
    total_logged_period_hours: float
    weekly_shifts: List[ShiftDayConfig]
    
    # Payment Mode Collection
    cash_collected: float
    card_payments: float
    upi_payments: float
    
    # Leave Status
    is_on_leave_today: bool
    today_leave_reason: Optional[str] = None
    today_leave_date: Optional[str] = None
    
    # Recent Activity Timeline
    recent_activities: List[Dict[str, Any]]


# --- Catalog ---
class ItemSchema(BaseModel):
    sku: str = Field(..., description="Stock Keeping Unit identifier", example="BEV-001")
    barcode: str = Field(..., description="Scannable barcode string", example="8901030875021")
    name: str = Field(..., description="Product name", example="Cola 500ml")
    category_name: str = Field(..., description="Category label", example="Beverages")
    price: float = Field(..., description="Retail selling price (INR)", example=45.0)
    wholesale_price: Optional[float] = Field(None, description="Wholesale price tier (INR)", example=38.0)
    cost_price: float = Field(0.0, description="Purchase cost price (INR)", example=31.5)
    tax_rate: float = Field(..., description="Applicable GST percentage rate", example=12.0)
    stock: float = Field(..., description="Current stock quantity on hand", example=86.0)
    min_stock: float = Field(10.0, description="Minimum stock alert threshold", example=20.0)
    pricing_method: str = Field("qty", description="Pricing method ('qty' or 'weight')", example="qty")
    unit: str = Field("pcs", description="Unit of measure ('pcs' or 'kg')", example="pcs")
    is_active: bool = Field(True, description="Item active status")

class ItemCreate(BaseModel):
    sku: str = Field(..., description="Unique SKU", example="BEV-005")
    barcode: str = Field(..., description="Barcode string", example="8901030875069")
    name: str = Field(..., description="Item title", example="Lemon Iced Tea 500ml")
    category_name: str = Field(..., description="Associated category", example="Beverages")
    price: float = Field(..., description="Retail selling price", example=55.0)
    wholesale_price: Optional[float] = Field(None, description="Wholesale price", example=46.0)
    cost_price: float = Field(0.0, description="Cost price", example=32.0)
    tax_rate: float = Field(..., description="GST tax rate percentage", example=12.0)
    stock: float = Field(..., description="Opening inventory stock", example=60.0)
    min_stock: float = Field(10.0, description="Low stock warning limit", example=15.0)
    pricing_method: str = Field("qty", description="Pricing strategy ('qty' or 'weight')", example="qty")
    unit: str = Field("pcs", description="Unit label ('pcs' or 'kg')", example="pcs")

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
    id: str = Field(..., description="Category UUID", example="cat-101")
    name: str = Field(..., description="Unique category name", example="Beverages")

class CategoryCreate(BaseModel):
    name: str = Field(..., description="New category name to create", example="Frozen Foods")

class StockUploadRow(BaseModel):
    sku: str
    barcode: Optional[str] = ""
    name: str
    category: Optional[str] = "Grocery"
    selling_price: float
    cost_price: Optional[float] = 0.0
    tax_rate: Optional[float] = 0.0
    opening_qty: float
    min_stock: Optional[float] = 10.0
    pricing_method: Optional[str] = "qty"
    unit: Optional[str] = "pcs"

class UploadPreviewResult(BaseModel):
    total_rows: int = Field(..., description="Total rows in CSV file")
    new_count: int = Field(..., description="Count of new SKUs to insert")
    update_count: int = Field(..., description="Count of existing SKUs to update")
    error_count: int = Field(..., description="Count of invalid/skipped rows")
    rows: List[Dict[str, Any]] = Field(..., description="Detailed row preview status")

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
    sku: str = Field(..., description="Item SKU", example="BEV-001")
    name: str = Field(..., description="Item Name", example="Cola 500ml")
    price: float = Field(..., description="Unit selling price", example=45.0)
    tax: float = Field(0.0, description="Tax rate percentage", example=12.0)
    qty: float = Field(..., description="Line quantity", example=2.0)
    unit: str = Field("pcs", description="Unit of measure", example="pcs")
    pricing_method: str = Field("qty", description="Pricing method ('qty' or 'weight')", example="qty")

class ManualDiscountInput(BaseModel):
    type: str = Field("percent", description="Discount type ('percent' or 'flat')", example="percent")
    value: float = Field(0.0, description="Discount magnitude", example=10.0)
    approved: bool = Field(True, description="Admin override approval flag", example=True)

class TenderInput(BaseModel):
    mode: str = Field(..., description="Payment mode ('Cash', 'Card', 'UPI')", example="Cash")
    amount: float = Field(..., description="Tendered amount in INR", example=200.0)

class SaleCreate(BaseModel):
    lines: List[CartLineInput] = Field(..., description="Cart items list")
    pricing_mode: str = Field("exclusive", description="Tax computation mode ('exclusive' or 'inclusive')", example="exclusive")
    manual_discount: Optional[ManualDiscountInput] = Field(None, description="Bill-level manual discount")
    tenders: List[TenderInput] = Field(..., description="Payment tender breakup list")

class SaleReturnCreate(BaseModel):
    invoice_no: str = Field(..., description="Target invoice number to return", example="INV-FY26-01025")
    reason: Optional[str] = Field("Customer return", description="Return reason code or text", example="Defective packaging")
    items: List[Dict[str, Any]] = Field(..., description="Returned items list with SKUs and return quantities", example=[{"sku": "BEV-001", "qty": 1.0}])

class HeldBillCreate(BaseModel):
    id: Optional[str] = Field(None, description="Held bill reference ID", example="HOLD-3341")
    lines: List[Dict[str, Any]] = Field(..., description="Serialized cart lines JSON")
    discount: Optional[Dict[str, Any]] = Field(None, description="Serialized bill discount JSON")
    item_count: Optional[float] = Field(None, description="Total line items count", example=3.0)
    itemCount: Optional[float] = Field(None, description="CamelCase alias for item_count", example=3.0)
    total: float = Field(..., description="Held total amount", example=140.0)

    @property
    def computed_item_count(self) -> float:
        if self.item_count is not None:
            return float(self.item_count)
        if self.itemCount is not None:
            return float(self.itemCount)
        return float(len(self.lines))

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

# --- Cash Counters ---
class CashCounterSchema(BaseModel):
    id: str = Field(..., description="Cash counter UUID")
    counter_name: str = Field(..., description="Counter name", example="Counter 1 - Main Express")
    opening_float: float = Field(..., description="Opening cash float amount (INR)", example=2000.0)
    cash_sales_today: Optional[float] = Field(0.0, description="Calculated cash sales today")
    expected_cash: Optional[float] = Field(2000.0, description="Expected cash in drawer")
    counted_cash: Optional[float] = Field(None, description="Physical cash counted by cashier")
    variance: Optional[float] = Field(0.0, description="Counted vs Expected variance")
    notes: Optional[str] = Field(None, description="Counter remarks")
    is_active: bool = Field(True, description="Counter active status")

class CashCounterCreate(BaseModel):
    counter_name: str = Field(..., description="Unique counter name", example="Counter 3 - Express")
    opening_float: float = Field(2000.0, description="Opening float amount (INR)", example=2000.0)
    notes: Optional[str] = Field(None, description="Counter notes", example="Front desk express billing counter")

class CashCounterUpdate(BaseModel):
    counter_name: Optional[str] = Field(None, description="Updated counter name")
    opening_float: Optional[float] = Field(None, description="Updated opening float amount")
    counted_cash: Optional[float] = Field(None, description="Recorded physical cash count")
    notes: Optional[str] = Field(None, description="Updated notes")
    is_active: Optional[bool] = Field(None, description="Updated active status")

# --- AI Insights ---
class AIInsightItem(BaseModel):
    rank: int = Field(..., description="Sales velocity rank position", example=1)
    sku: str = Field(..., description="Item SKU", example="BEV-001")
    name: str = Field(..., description="Item product name", example="Cola 500ml")
    category: str = Field(..., description="Category label", example="Beverages")
    unit: str = Field("pcs", description="Unit of measure", example="pcs")
    qty_sold: float = Field(..., description="Total quantity sold in selected period", example=42.0)
    revenue: float = Field(..., description="Gross revenue generated (INR)", example=1890.0)
    current_stock: float = Field(..., description="Current stock remaining", example=86.0)
    min_stock: float = Field(..., description="Configured reorder threshold", example=20.0)
    is_low_stock: bool = Field(..., description="Low stock alert indicator", example=False)

class AIRecommendation(BaseModel):
    type: str = Field(..., description="Alert severity level ('warning', 'success', 'info')", example="warning")
    title: str = Field(..., description="Recommendation header title", example="High Demand Stock Alert")
    message: str = Field(..., description="Actionable AI recommendation text", example="Top selling items are running low on stock.")

class AIInsightsResponse(BaseModel):
    period: str = Field(..., description="Date filter period ('today', 'week', 'month', 'custom')", example="month")
    start_date: str = Field(..., description="Period start date YYYY-MM-DD", example="2026-09-01")
    end_date: str = Field(..., description="Period end date YYYY-MM-DD", example="2026-09-14")
    sort_by: str = Field(..., description="Applied sorting parameter ('most_sold', 'least_sold', 'highest_revenue')", example="most_sold")
    total_items_analyzed: int = Field(..., description="Total unique items sold count", example=12)
    total_period_revenue: float = Field(..., description="Total aggregated sales revenue (INR)", example=48260.0)
    items: List[AIInsightItem] = Field(..., description="Ranked list of product sales data")
    suggestions: List[AIRecommendation] = Field(..., description="Actionable AI stock and sales suggestions")
