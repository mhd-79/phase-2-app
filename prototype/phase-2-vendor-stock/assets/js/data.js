/* ============================================================
   data.js — shared mock catalog + stock model (Phase 1 demo data)
   Backed by localStorage so stock deducted at POS is reflected
   on Items & Stock / Reports pages within the same browser.
   ============================================================ */

window.POS_CATALOG = [
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

window.POS_CATEGORIES = ["All", "Beverages", "Snacks", "Dairy", "Bakery", "Grocery", "Personal Care"];

(function () {
  "use strict";
  var OVERRIDES_KEY = "pos_demo_item_overrides_v2";
  var CUSTOM_KEY = "pos_demo_custom_items";
  var CATEGORY_KEY = "pos_demo_custom_categories";
  var DISCOUNTS_KEY = "pos_demo_discounts";

  function loadOverrides() {
    try {
      var raw = localStorage.getItem(OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveOverrides(overrides) {
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides)); } catch (e) {}
  }

  function loadCustomItems() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"); } catch (e) { return []; }
  }

  window.getLiveCatalog = function () {
    var overrides = loadOverrides();
    var base = window.POS_CATALOG.concat(loadCustomItems());
    return base.map(function (item) {
      return Object.assign({}, item, overrides[item.sku] || {});
    });
  };

  window.upsertCustomItem = function (item) {
    var items = loadCustomItems();
    var idx = items.findIndex(function (i) { return i.sku === item.sku; });
    if (idx > -1) items[idx] = item; else items.push(item);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(items)); } catch (e) {}
  };

  window.upsertItemFields = function (sku, fields) {
    var overrides = loadOverrides();
    overrides[sku] = Object.assign({}, overrides[sku], fields);
    saveOverrides(overrides);
  };

  window.findItemBySku = function (sku) {
    return window.getLiveCatalog().find(function (i) { return i.sku === sku; });
  };

  window.setStockAbsolute = function (sku, qty) {
    window.upsertItemFields(sku, { stock: Math.max(0, qty) });
  };

  window.adjustStock = function (sku, delta) {
    var live = window.findItemBySku(sku);
    var current = live ? live.stock : 0;
    var next = Math.max(0, round2(current + delta));
    window.upsertItemFields(sku, { stock: next });
    return next;
  };

  window.resetDemoStock = function () {
    try { localStorage.removeItem(OVERRIDES_KEY); } catch (e) {}
  };

  function round2(n) { return Math.round(n * 1000) / 1000; }

  /* ---------------- Categories ---------------- */
  function loadCustomCategories() {
    try { return JSON.parse(localStorage.getItem(CATEGORY_KEY) || "[]"); } catch (e) { return []; }
  }
  window.getLiveCategories = function () {
    var base = window.POS_CATEGORIES.filter(function (c) { return c !== "All"; });
    var custom = loadCustomCategories();
    var all = base.concat(custom.filter(function (c) { return base.indexOf(c) === -1; }));
    return all;
  };
  window.addCategory = function (name) {
    name = (name || "").trim();
    if (!name) return false;
    var existing = window.getLiveCategories();
    if (existing.some(function (c) { return c.toLowerCase() === name.toLowerCase(); })) return false;
    var custom = loadCustomCategories();
    custom.push(name);
    try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(custom)); } catch (e) {}
    return true;
  };

  /* ---------------- Discounts (Admin-managed) ---------------- */
  window.getDiscounts = function () {
    try { return JSON.parse(localStorage.getItem(DISCOUNTS_KEY) || "[]"); } catch (e) { return []; }
  };
  function saveDiscounts(list) {
    try { localStorage.setItem(DISCOUNTS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  window.upsertDiscount = function (discount) {
    var list = window.getDiscounts();
    var idx = list.findIndex(function (d) { return d.id === discount.id; });
    if (idx > -1) list[idx] = discount; else list.push(discount);
    saveDiscounts(list);
    return discount;
  };
  window.deleteDiscount = function (id) {
    saveDiscounts(window.getDiscounts().filter(function (d) { return d.id !== id; }));
  };
  window.setDiscountStatus = function (id, status) {
    var list = window.getDiscounts();
    var d = list.find(function (d) { return d.id === id; });
    if (d) { d.status = status; saveDiscounts(list); }
  };

  function isDiscountLive(d, onDate) {
    if (d.status !== "active") return false;
    var day = onDate || new Date().toISOString().slice(0, 10);
    if (d.startDate && day < d.startDate) return false;
    if (d.endDate && day > d.endDate) return false;
    return true;
  }
  window.isDiscountLive = isDiscountLive;

  window.getActiveDiscountForItem = function (sku, onDate) {
    var live = window.getDiscounts().filter(function (d) { return isDiscountLive(d, onDate); });
    var specific = live.find(function (d) { return d.appliesTo === "selected" && (d.productSkus || []).indexOf(sku) > -1; });
    if (specific) return specific;
    return live.find(function (d) { return d.appliesTo === "all"; }) || null;
  };
})();

/* ============================================================
   Phase 2 additions — Vendor & Purchase Management, Stock Maintenance
   FR-P2-PUR-*, FR-P2-STK-*
   ============================================================ */

window.REFERENCE_DATE = "2026-09-07";

window.VENDORS_SEED = [
  { id: "V-001", name: "Sunrise Distributors", category: "Grocery & Staples", contact: "Ramesh Gupta", phone: "+91 98200 11223", email: "ramesh@sunrisedist.in", terms: "Net 30", status: "Active", payable: 84500 },
  { id: "V-002", name: "Coastal Beverages Co.", category: "Beverages", contact: "Anita Fernandes", phone: "+91 90040 55211", email: "anita@coastalbev.in", terms: "Net 15", status: "Active", payable: 32100 },
  { id: "V-003", name: "Dairy Fresh Farms", category: "Dairy", contact: "Suresh Nair", phone: "+91 89393 40021", email: "suresh@dairyfresh.in", terms: "Net 7", status: "Active", payable: 18450 },
  { id: "V-004", name: "GoldenCrust Bakers", category: "Bakery", contact: "Imran Sheikh", phone: "+91 91234 87765", email: "imran@goldencrust.in", terms: "Net 15", status: "Active", payable: 9800 },
  { id: "V-005", name: "SnackTime Foods", category: "Snacks", contact: "Kavita Rao", phone: "+91 97865 22110", email: "kavita@snacktime.in", terms: "Net 30", status: "Active", payable: 46200 },
  { id: "V-006", name: "CarePlus Toiletries", category: "Personal Care", contact: "Deepak Malhotra", phone: "+91 99887 65432", email: "deepak@careplus.in", terms: "Net 45", status: "Active", payable: 61250 },
  { id: "V-007", name: "QuickPack Wholesale", category: "General / Mixed", contact: "Sana Iyer", phone: "+91 96543 21098", email: "sana@quickpack.in", terms: "Net 30", status: "Active", payable: 0 },
  { id: "V-008", name: "Metro Cash & Carry", category: "Ad-hoc Supply", contact: "Walk-in Counter", phone: "+91 98111 22334", email: "—", terms: "Due on Delivery", status: "Active", payable: 5400 }
];

window.VENDOR_BY_CATEGORY = {
  "Beverages": "V-002", "Snacks": "V-005", "Dairy": "V-003", "Bakery": "V-004",
  "Grocery": "V-001", "Personal Care": "V-006"
};

window.PURCHASE_ORDERS_SEED = [
  {
    id: "PO-2026-0139", vendorId: "V-004", date: "2026-08-20", expected: "2026-08-24", status: "Closed", approvedBy: "Arjun M.",
    lines: [
      { sku: "BAK-001", name: "White Bread 400g", orderedQty: 60, receivedQty: 60, cost: 28 },
      { sku: "BAK-002", name: "Brown Bread 400g", orderedQty: 60, receivedQty: 60, cost: 32 },
      { sku: "BAK-003", name: "Croissant (pc)", orderedQty: 100, receivedQty: 100, cost: 22 }
    ]
  },
  {
    id: "PO-2026-0142", vendorId: "V-001", date: "2026-08-28", expected: "2026-09-02", status: "Closed", approvedBy: "Arjun M.",
    lines: [
      { sku: "GRO-001", name: "Basmati Rice 1kg", orderedQty: 100, receivedQty: 100, cost: 95 },
      { sku: "GRO-002", name: "Toor Dal 1kg", orderedQty: 80, receivedQty: 80, cost: 105 },
      { sku: "GRO-004", name: "Sugar 1kg", orderedQty: 120, receivedQty: 120, cost: 38 }
    ]
  },
  {
    id: "PO-2026-0145", vendorId: "V-002", date: "2026-09-02", expected: "2026-09-06", status: "Partially Received", approvedBy: "Arjun M.",
    lines: [
      { sku: "BEV-001", name: "Cola 500ml", orderedQty: 200, receivedQty: 160, cost: 30 },
      { sku: "BEV-002", name: "Orange Juice 1L", orderedQty: 100, receivedQty: 100, cost: 78 },
      { sku: "BEV-003", name: "Mineral Water 1L", orderedQty: 300, receivedQty: 0, cost: 12 }
    ]
  },
  {
    id: "PO-2026-0148", vendorId: "V-003", date: "2026-09-05", expected: "2026-09-08", status: "Approved", approvedBy: "Arjun M.",
    lines: [
      { sku: "DAI-001", name: "Toned Milk 500ml", orderedQty: 150, receivedQty: 0, cost: 20 },
      { sku: "DAI-002", name: "Curd Cup 200g", orderedQty: 100, receivedQty: 0, cost: 16 },
      { sku: "DAI-003", name: "Paneer 200g", orderedQty: 40, receivedQty: 0, cost: 65 }
    ]
  },
  {
    id: "PO-2026-0150", vendorId: "V-005", date: "2026-09-06", expected: "2026-09-10", status: "Pending Approval", approvedBy: null,
    lines: [
      { sku: "SNK-002", name: "Choco Cookies 200g", orderedQty: 80, receivedQty: 0, cost: 42 },
      { sku: "SNK-004", name: "Popcorn Butter 100g", orderedQty: 60, receivedQty: 0, cost: 38 }
    ]
  },
  {
    id: "PO-2026-0151", vendorId: "V-006", date: "2026-09-07", expected: "2026-09-12", status: "Draft", approvedBy: null,
    lines: [
      { sku: "PC-002", name: "Shampoo 340ml", orderedQty: 50, receivedQty: 0, cost: 150 },
      { sku: "PC-003", name: "Hand Wash 250ml", orderedQty: 70, receivedQty: 0, cost: 62 }
    ]
  }
];

window.BATCHES_SEED = [
  { sku: "DAI-002", name: "Curd Cup 200g", batch: "B-CUR-2409A", mfgDate: "2026-09-01", expiryDate: "2026-09-09", qty: 5 },
  { sku: "DAI-003", name: "Paneer 200g", batch: "B-PNR-2408C", mfgDate: "2026-08-30", expiryDate: "2026-09-13", qty: 18 },
  { sku: "DAI-001", name: "Toned Milk 500ml", batch: "B-MLK-2409D", mfgDate: "2026-09-06", expiryDate: "2026-09-10", qty: 64 },
  { sku: "DAI-004", name: "Butter 100g", batch: "B-BTR-2408A", mfgDate: "2026-08-15", expiryDate: "2026-11-15", qty: 30 },
  { sku: "BAK-001", name: "White Bread 400g", batch: "B-WBR-2409G", mfgDate: "2026-09-06", expiryDate: "2026-09-11", qty: 27 },
  { sku: "BAK-003", name: "Croissant (pc)", batch: "B-CRS-2409H", mfgDate: "2026-09-06", expiryDate: "2026-09-09", qty: 16 },
  { sku: "GRO-001", name: "Basmati Rice 1kg", batch: "B-RIC-2408X", mfgDate: "2026-06-01", expiryDate: "2027-06-01", qty: 48 },
  { sku: "SNK-001", name: "Potato Chips 90g", batch: "B-CHP-2408Y", mfgDate: "2026-07-10", expiryDate: "2026-10-10", qty: 120 }
];

(function () {
  "use strict";
  var VENDOR_KEY = "pos_p2_vendors_v1";
  var PO_KEY = "pos_p2_pos_v1";
  var PO_SEQ_KEY = "pos_p2_po_seq";
  var GRN_LOG_KEY = "pos_p2_grn_log_v1";
  var RETURN_LOG_KEY = "pos_p2_purchase_returns_v1";
  var ADJ_LOG_KEY = "pos_p2_adjustments_v1";
  var BATCH_KEY = "pos_p2_batches_v1";

  function load(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---------------- Vendors ---------------- */
  window.getVendors = function () {
    var overrides = load(VENDOR_KEY, { payableDelta: {}, created: [], statusOverride: {} });
    var all = window.VENDORS_SEED.concat(overrides.created || []);
    return all.map(function (v) {
      var copy = Object.assign({}, v);
      if (overrides.payableDelta && overrides.payableDelta[v.id] !== undefined) copy.payable = Math.max(0, v.payable + overrides.payableDelta[v.id]);
      if (overrides.statusOverride && overrides.statusOverride[v.id]) copy.status = overrides.statusOverride[v.id];
      return copy;
    });
  };
  window.getVendorById = function (id) { return window.getVendors().find(function (v) { return v.id === id; }); };
  window.adjustVendorPayable = function (vendorId, delta) {
    var overrides = load(VENDOR_KEY, { payableDelta: {}, created: [], statusOverride: {} });
    overrides.payableDelta = overrides.payableDelta || {};
    overrides.payableDelta[vendorId] = (overrides.payableDelta[vendorId] || 0) + delta;
    save(VENDOR_KEY, overrides);
  };
  window.createVendor = function (vendor) {
    var overrides = load(VENDOR_KEY, { payableDelta: {}, created: [], statusOverride: {} });
    overrides.created = overrides.created || [];
    vendor.id = vendor.id || ("V-" + Date.now().toString().slice(-6));
    vendor.payable = vendor.payable || 0;
    vendor.status = vendor.status || "Active";
    overrides.created.push(vendor);
    save(VENDOR_KEY, overrides);
    return vendor;
  };

  /* ---------------- Purchase Orders ---------------- */
  function loadPoState() { return load(PO_KEY, { created: [], lineOverrides: {}, statusOverride: {}, approvedByOverride: {} }); }
  function savePoState(s) { save(PO_KEY, s); }

  window.getPurchaseOrders = function () {
    var state = loadPoState();
    var all = window.PURCHASE_ORDERS_SEED.concat(state.created || []);
    return all.map(function (po) {
      var copy = JSON.parse(JSON.stringify(po));
      if (state.statusOverride[po.id]) copy.status = state.statusOverride[po.id];
      if (state.approvedByOverride[po.id]) copy.approvedBy = state.approvedByOverride[po.id];
      if (state.lineOverrides[po.id]) {
        copy.lines = copy.lines.map(function (l) {
          var recv = state.lineOverrides[po.id][l.sku];
          return recv !== undefined ? Object.assign({}, l, { receivedQty: recv }) : l;
        });
      }
      return copy;
    });
  };
  window.getPurchaseOrderById = function (id) { return window.getPurchaseOrders().find(function (p) { return p.id === id; }); };

  window.createPurchaseOrder = function (data) {
    var state = loadPoState();
    var seq = parseInt(localStorage.getItem(PO_SEQ_KEY) || "151", 10) + 1;
    localStorage.setItem(PO_SEQ_KEY, String(seq));
    var po = {
      id: "PO-2026-0" + seq, vendorId: data.vendorId, date: window.REFERENCE_DATE, expected: data.expected || window.REFERENCE_DATE,
      status: "Pending Approval", approvedBy: null,
      lines: data.lines.map(function (l) { return { sku: l.sku, name: l.name, orderedQty: l.qty, receivedQty: 0, cost: l.cost }; })
    };
    state.created = state.created || [];
    state.created.push(po);
    savePoState(state);
    return po;
  };

  window.approvePurchaseOrder = function (poId, approver) {
    var state = loadPoState();
    state.statusOverride[poId] = "Approved";
    state.approvedByOverride[poId] = approver || "Arjun M.";
    savePoState(state);
  };

  window.recordGoodsReceipt = function (poId, receiptLines, vendorId) {
    var state = loadPoState();
    var po = window.getPurchaseOrderById(poId);
    state.lineOverrides[poId] = state.lineOverrides[poId] || {};
    var variances = [];
    receiptLines.forEach(function (rl) {
      var line = po.lines.find(function (l) { return l.sku === rl.sku; });
      if (!line) return;
      var newReceived = (line.receivedQty || 0) + rl.qty;
      state.lineOverrides[poId][rl.sku] = newReceived;
      window.adjustStock(rl.sku, rl.qty);
      var remaining = line.orderedQty - newReceived;
      if (remaining !== 0) variances.push({ sku: rl.sku, name: line.name, remaining: remaining });
    });
    var updatedPo = Object.assign({}, po);
    updatedPo.lines = po.lines.map(function (l) {
      var recv = state.lineOverrides[poId][l.sku];
      return recv !== undefined ? Object.assign({}, l, { receivedQty: recv }) : l;
    });
    var allDone = updatedPo.lines.every(function (l) { return l.receivedQty >= l.orderedQty; });
    var anyDone = updatedPo.lines.some(function (l) { return l.receivedQty > 0; });
    state.statusOverride[poId] = allDone ? "Received" : (anyDone ? "Partially Received" : po.status);
    savePoState(state);

    var grnId = "GRN-2026-" + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
    var total = receiptLines.reduce(function (s, rl) {
      var line = po.lines.find(function (l) { return l.sku === rl.sku; });
      return s + (line ? line.cost * rl.qty : 0);
    }, 0);
    var log = load(GRN_LOG_KEY, []);
    log.push({ id: grnId, poId: poId, vendorId: vendorId || po.vendorId, date: window.REFERENCE_DATE, lines: receiptLines, total: total, variances: variances });
    save(GRN_LOG_KEY, log);
    window.adjustVendorPayable(vendorId || po.vendorId, total);
    return { grnId: grnId, variances: variances, status: state.statusOverride[poId] };
  };

  window.recordDirectReceipt = function (vendorId, lines) {
    var total = 0;
    lines.forEach(function (l) { window.adjustStock(l.sku, l.qty); total += l.qty * l.cost; });
    var grnId = "GRN-DIRECT-" + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
    var log = load(GRN_LOG_KEY, []);
    log.push({ id: grnId, poId: null, vendorId: vendorId, date: window.REFERENCE_DATE, lines: lines, total: total, variances: [] });
    save(GRN_LOG_KEY, log);
    window.adjustVendorPayable(vendorId, total);
    return grnId;
  };

  window.getGrnLog = function () { return load(GRN_LOG_KEY, []); };

  /* ---------------- Purchase Returns ---------------- */
  window.createPurchaseReturn = function (vendorId, lines, reason) {
    var total = 0;
    lines.forEach(function (l) { window.adjustStock(l.sku, -l.qty); total += l.qty * l.cost; });
    var dnId = "DN-" + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
    var log = load(RETURN_LOG_KEY, []);
    log.push({ id: dnId, vendorId: vendorId, date: window.REFERENCE_DATE, lines: lines, total: total, reason: reason });
    save(RETURN_LOG_KEY, log);
    window.adjustVendorPayable(vendorId, -total);
    return dnId;
  };
  window.getPurchaseReturns = function () { return load(RETURN_LOG_KEY, []); };

  /* ---------------- Stock Adjustments ---------------- */
  window.recordStockAdjustment = function (sku, name, delta, reason, approvedBy) {
    window.adjustStock(sku, delta);
    var log = load(ADJ_LOG_KEY, []);
    var id = "ADJ-" + String(90 + log.length + 1).padStart(4, "0");
    log.push({ id: id, sku: sku, name: name, delta: delta, reason: reason, approvedBy: approvedBy || "Arjun M.", date: window.REFERENCE_DATE });
    save(ADJ_LOG_KEY, log);
    return id;
  };
  window.getStockAdjustments = function () { return load(ADJ_LOG_KEY, []); };

  /* ---------------- Batch & Expiry ---------------- */
  window.getBatches = function () {
    var created = load(BATCH_KEY, []);
    return window.BATCHES_SEED.concat(created).map(function (b) {
      var copy = Object.assign({}, b);
      var days = Math.round((new Date(b.expiryDate) - new Date(window.REFERENCE_DATE)) / 86400000);
      copy.daysToExpiry = days;
      return copy;
    });
  };
  window.addBatch = function (batch) {
    var created = load(BATCH_KEY, []);
    created.push(batch);
    save(BATCH_KEY, created);
  };

  /* ---------------- Vendor Payments ---------------- */
  var PAYMENT_KEY = "pos_p2_vendor_payments_v1";
  window.recordVendorPayment = function (vendorId, amount, mode) {
    window.adjustVendorPayable(vendorId, -amount);
    var log = load(PAYMENT_KEY, []);
    var id = "PMT-" + String(1000 + log.length + 1).slice(-4);
    log.push({ id: id, vendorId: vendorId, amount: amount, mode: mode || "Bank Transfer", date: window.REFERENCE_DATE });
    save(PAYMENT_KEY, log);
    return id;
  };
  window.getVendorPayments = function () { return load(PAYMENT_KEY, []); };

  /* ---------------- Reorder suggestions ---------------- */
  window.getReorderSuggestions = function () {
    return window.getLiveCatalog().filter(function (i) { return i.stock <= i.min; }).map(function (i) {
      var suggestedQty = Math.max(i.min * 3 - i.stock, i.min);
      var vendorId = window.VENDOR_BY_CATEGORY[i.category] || "V-007";
      var vendor = window.getVendorById(vendorId);
      return Object.assign({}, i, { suggestedQty: suggestedQty, vendorId: vendorId, vendorName: vendor ? vendor.name : "—" });
    });
  };

  /* ---------------- Tax / Pricing Mode Settings ---------------- */
  var TAX_SETTINGS_KEY = "pos_demo_tax_settings";
  window.getTaxSettings = function () {
    var defaults = { pricingMode: "exclusive" };
    try {
      var raw = JSON.parse(localStorage.getItem(TAX_SETTINGS_KEY) || "null");
      return raw ? Object.assign(defaults, raw) : defaults;
    } catch (e) { return defaults; }
  };
  window.setPricingMode = function (mode) {
    if (mode !== "inclusive" && mode !== "exclusive") return;
    var settings = window.getTaxSettings();
    settings.pricingMode = mode;
    try { localStorage.setItem(TAX_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  };
})();
