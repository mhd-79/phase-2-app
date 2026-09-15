/* ============================================================
   api.js — Centralized API Client connecting frontend to FastAPI backend
   ============================================================ */

(function () {
  "use strict";

  var API_BASE = "http://localhost:8000/api/v1";

  function getAuthHeader() {
    var token = localStorage.getItem("pos_token");
    return token ? { "Authorization": "Bearer " + token } : {};
  }

  window.API = {
    BASE_URL: API_BASE,

    request: async function (endpoint, options) {
      options = options || {};
      var url = API_BASE + endpoint;
      var headers = Object.assign({
        "Content-Type": "application/json"
      }, getAuthHeader(), options.headers || {});

      var config = {
        method: options.method || "GET",
        headers: headers
      };

      if (options.body) {
        if (options.body instanceof FormData) {
          delete headers["Content-Type"];
          config.body = options.body;
        } else {
          config.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        }
      }

      try {
        var response = await fetch(url, config);
        if (response.status === 401 && !endpoint.includes("/auth/login")) {
          // Token expired or unauthenticated
          localStorage.removeItem("pos_token");
          localStorage.removeItem("pos_logged_user");
          if (!window.location.pathname.endsWith("login.html")) {
            window.location.href = "login.html";
          }
        }
        var data;
        var contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          var errorMsg = (data && data.detail) ? data.detail : "API Error " + response.status;
          throw new Error(errorMsg);
        }
        return data;
      } catch (err) {
        console.error("API Request Error [" + endpoint + "]:", err);
        throw err;
      }
    },

    // Auth
    login: function (username, pin, role) {
      return this.request("/auth/login", {
        method: "POST",
        body: { username: username, pin: pin, role: role || "cashier" }
      });
    },

    getUsers: function () {
      return this.request("/users");
    },

    createUser: function (userData) {
      return this.request("/users", { method: "POST", body: userData });
    },

    updateUser: function (username, userData) {
      return this.request("/users/" + username, { method: "PUT", body: userData });
    },

    // Store Settings & Config
    getStoreSettings: function () {
      return this.request("/settings/store");
    },

    updateStoreSettings: function (settingsData) {
      return this.request("/settings/store", { method: "PUT", body: settingsData });
    },

    // Catalog & Categories
    getItems: function (category, search) {
      var params = new URLSearchParams();
      if (category && category !== "All") params.append("category", category);
      if (search) params.append("search", search);
      var query = params.toString() ? "?" + params.toString() : "";
      return this.request("/catalog/items" + query);
    },

    getItemBySku: function (sku) {
      return this.request("/catalog/items/" + sku);
    },

    createItem: function (itemData) {
      return this.request("/catalog/items", { method: "POST", body: itemData });
    },

    updateItem: function (sku, itemData) {
      return this.request("/catalog/items/" + sku, { method: "PUT", body: itemData });
    },

    getCategories: function () {
      return this.request("/catalog/categories");
    },

    createCategory: function (name) {
      return this.request("/catalog/categories", { method: "POST", body: { name: name } });
    },

    uploadPreview: function (file) {
      var formData = new FormData();
      formData.append("file", file);
      return this.request("/catalog/upload/preview", { method: "POST", body: formData });
    },

    uploadCommit: function (rows) {
      return this.request("/catalog/upload/commit", { method: "POST", body: rows });
    },

    // Billing & POS
    calculateTotals: function (payload) {
      return this.request("/billing/calculate-totals", { method: "POST", body: payload });
    },

    createSale: function (saleData) {
      return this.request("/billing/sales", { method: "POST", body: saleData });
    },

    getSaleByInvoice: function (invoiceNo) {
      return this.request("/billing/sales/" + encodeURIComponent(invoiceNo));
    },

    searchInvoices: function (query) {
      var q = query ? "?q=" + encodeURIComponent(query) : "";
      return this.request("/billing/invoices/search" + q);
    },

    processReturn: function (returnData) {
      return this.request("/billing/returns", { method: "POST", body: returnData });
    },

    getHeldBills: function () {
      return this.request("/billing/held-bills");
    },

    holdBill: function (heldData) {
      return this.request("/billing/held-bills", { method: "POST", body: heldData });
    },

    deleteHeldBill: function (heldId) {
      return this.request("/billing/held-bills/" + encodeURIComponent(heldId), { method: "DELETE" });
    },

    approveDiscountPin: function (pin) {
      return this.request("/billing/approve-discount", { method: "POST", body: { pin: pin } });
    },

    // Reports
    getZReport: function (startDate, endDate) {
      var params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      var q = params.toString() ? "?" + params.toString() : "";
      return this.request("/reports/z-report" + q);
    },

    getCompletedTransactions: function (startDate, endDate) {
      var params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      var q = params.toString() ? "?" + params.toString() : "";
      return this.request("/reports/completed-transactions" + q);
    },

    getItemSales: function (startDate, endDate, category) {
      var params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (category && category !== "All") params.append("category", category);
      var q = params.toString() ? "?" + params.toString() : "";
      return this.request("/reports/item-sales" + q);
    },

    getCashCounters: function () {
      return this.request("/reports/cash-counters");
    },

    createCashCounter: function (counterData) {
      return this.request("/reports/cash-counters", { method: "POST", body: counterData });
    },

    updateCashCounter: function (id, counterData) {
      return this.request("/reports/cash-counters/" + encodeURIComponent(id), { method: "PUT", body: counterData });
    },

    getAIInsights: function (period, startDate, endDate, sortBy) {
      var params = new URLSearchParams();
      if (period) params.append("period", period);
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (sortBy) params.append("sort_by", sortBy);
      return this.request("/reports/ai-insights?" + params.toString());
    },

    getStockOnHand: function () {
      return this.request("/reports/stock-on-hand");
    },

    getTaxSummary: function () {
      return this.request("/reports/tax-summary");
    }
  };
})();
