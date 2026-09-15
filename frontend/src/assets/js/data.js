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
  var TAX_SETTINGS_KEY = "pos_demo_tax_settings";

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

  /* Merge partial field changes (name/price/wholesalePrice/tax/pricingMethod/unit/min/stock/...)
     onto a base catalog item without mutating the shipped POS_CATALOG array. */
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

  /* ---------------- Tax / pricing mode ---------------- */
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

  /* Returns the single applicable discount for a SKU, preferring a discount that
     specifically names the product over one that applies to "All Products"
     (Phase 1 explicitly has no stacking — only one discount applies per line). */
  window.getActiveDiscountForItem = function (sku, onDate) {
    var live = window.getDiscounts().filter(function (d) { return isDiscountLive(d, onDate); });
    var specific = live.find(function (d) { return d.appliesTo === "selected" && (d.productSkus || []).indexOf(sku) > -1; });
    if (specific) return specific;
    return live.find(function (d) { return d.appliesTo === "all"; }) || null;
  };
})();
