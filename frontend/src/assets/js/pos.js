/* ============================================================
   pos.js — Point-of-Sale billing screen logic with Database API
   FR-P1-POS-001..010
   ============================================================ */

(function () {
  "use strict";
  if (!document.querySelector(".pos-layout")) return;

  var cart = [];              // [{sku,name,price,tax,pricingMethod,unit,qty}]
  var discount = { type: "percent", value: 0, approved: true };
  var tenders = [];           // [{mode:'Cash'|'Card'|'UPI', amount:number}]
  var activeTenderIndex = 0;
  var pendingDiscount = null;
  var liveCatalogItems = [];
  var liveCategories = ["All"];

  var els = {
    grid: document.getElementById("itemGrid"),
    categoryRail: document.getElementById("categoryRail"),
    scanInput: document.getElementById("scanInput"),
    cartLines: document.getElementById("cartLines"),
    cartCount: document.getElementById("cartCount"),
    pricingModeBadge: document.getElementById("pricingModeBadge"),
    subtotal: document.getElementById("sumSubtotal"),
    taxTotal: document.getElementById("sumTax"),
    discountRow: document.getElementById("sumDiscountRow"),
    discountVal: document.getElementById("sumDiscount"),
    grandTotal: document.getElementById("sumTotal"),
    payAmount: document.getElementById("payAmountDisplay"),
    tenderList: document.getElementById("tenderList"),
    payRemaining: document.getElementById("payRemaining"),
    changeDue: document.getElementById("changeDueRow"),
    changeDueVal: document.getElementById("changeDueVal")
  };

  /* ---------------- Init & Data Fetch ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initPOSData();
  });

  async function initPOSData() {
    try {
      if (window.API) {
        liveCategories = ["All"].concat(await window.API.getCategories());
        liveCatalogItems = await window.API.getItems();
      }
    } catch (e) {
      console.warn("Failed to load POS data from backend API:", e);
    }
    renderCategoryRail();
    renderCatalog();
    recallFromQuery();
  }

  /* ---------------- Catalog rendering ---------------- */
  var activeCategory = "All";
  function renderCatalog(filterText) {
    var term = (filterText || (els.scanInput ? els.scanInput.value : "")).trim().toLowerCase();
    var list = liveCatalogItems.filter(function (item) {
      var matchCat = activeCategory === "All" || item.category_name === activeCategory;
      var matchTerm = !term || item.name.toLowerCase().indexOf(term) > -1 || item.sku.toLowerCase().indexOf(term) > -1 || item.barcode.toLowerCase().indexOf(term) > -1;
      return matchCat && matchTerm;
    });
    els.grid.innerHTML = "";
    if (list.length === 0) {
      els.grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No items match search filter.</div>';
      return;
    }
    list.forEach(function (item) {
      var isWeight = item.pricing_method === "weight";
      var card = document.createElement("button");
      card.type = "button";
      card.className = "item-card" + (item.stock === 0 ? " out-of-stock" : item.stock <= item.min_stock ? " low-stock" : "");
      card.disabled = item.stock === 0;
      var stockLabel = item.stock === 0 ? "Out of stock" : (isWeight ? item.stock.toFixed(2) + " kg in stock" : item.stock + " in stock");
      card.innerHTML =
        '<span class="item-name">' + item.name + "</span>" +
        '<span class="item-meta">' + item.sku + " &middot; " + stockLabel + "</span>" +
        '<span class="item-price">₹' + item.price.toFixed(2) + (isWeight ? " /kg" : "") + "</span>";
      card.addEventListener("click", function () { addToCart(item.sku); });
      els.grid.appendChild(card);
    });
  }

  function renderCategoryRail() {
    if (!els.categoryRail) return;
    els.categoryRail.innerHTML = "";
    liveCategories.forEach(function (cat) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (cat === activeCategory ? " active" : "");
      chip.textContent = cat;
      chip.addEventListener("click", function () {
        activeCategory = cat;
        els.categoryRail.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        renderCatalog(els.scanInput ? els.scanInput.value : "");
      });
      els.categoryRail.appendChild(chip);
    });
  }

  /* ---------------- Cart logic ---------------- */
  function addToCart(sku) {
    var item = liveCatalogItems.find(function (i) { return i.sku === sku; });
    if (!item || item.stock <= 0) { window.showToast("Item unavailable", "danger"); return; }
    if (item.pricing_method === "weight") { openScaleModal(sku); return; }
    var line = cart.find(function (l) { return l.sku === sku; });
    var inCartQty = line ? line.qty : 0;
    if (inCartQty + 1 > item.stock) { window.showToast("Only " + item.stock + " in stock", "warning"); return; }
    if (line) { line.qty += 1; }
    else {
      var mrp = item.price;
      var ws = typeof item.wholesale_price === "number" ? item.wholesale_price : item.price;
      cart.push({
        sku: item.sku,
        name: item.name,
        mrp: mrp,
        wholesale_price: ws,
        priceMode: "mrp",
        price: mrp,
        tax: item.tax_rate,
        pricingMethod: "qty",
        unit: item.unit || "pcs",
        qty: 1
      });
    }
    renderCart();
  }
  window.addToCart = addToCart;

  function addWeightToCart(sku, weightKg) {
    var item = liveCatalogItems.find(function (i) { return i.sku === sku; });
    if (!item) return;
    if (weightKg > item.stock) { window.showToast("Only " + item.stock.toFixed(3) + " kg in stock", "warning"); return; }
    var line = cart.find(function (l) { return l.sku === sku; });
    if (line) { line.qty = weightKg; }
    else {
      var mrp = item.price;
      var ws = typeof item.wholesale_price === "number" ? item.wholesale_price : item.price;
      cart.push({
        sku: item.sku,
        name: item.name,
        mrp: mrp,
        wholesale_price: ws,
        priceMode: "mrp",
        price: mrp,
        tax: item.tax_rate,
        pricingMethod: "weight",
        unit: item.unit || "kg",
        qty: weightKg
      });
    }
    renderCart();
  }
  window.addWeightToCart = addWeightToCart;

  function togglePriceMode(sku) {
    var line = cart.find(function (l) { return l.sku === sku; });
    if (!line) return;
    if (typeof line.mrp !== "number") {
      var item = liveCatalogItems.find(function (i) { return i.sku === sku; });
      if (item) {
        line.mrp = item.price;
        line.wholesale_price = typeof item.wholesale_price === "number" ? item.wholesale_price : item.price;
      } else {
        line.mrp = line.price;
        line.wholesale_price = line.price;
      }
    }
    if (line.priceMode === "wholesale") {
      line.priceMode = "mrp";
      line.price = line.mrp;
    } else {
      line.priceMode = "wholesale";
      line.price = line.wholesale_price;
    }
    renderCart();
  }
  window.togglePriceMode = togglePriceMode;

  function changeQty(sku, delta) {
    var line = cart.find(function (l) { return l.sku === sku; });
    if (!line) return;
    var item = liveCatalogItems.find(function (i) { return i.sku === sku; });
    var next = line.qty + delta;
    if (next <= 0) { cart = cart.filter(function (l) { return l.sku !== sku; }); }
    else if (item && next > item.stock) { window.showToast("Only " + item.stock + " in stock", "warning"); return; }
    else { line.qty = next; }
    renderCart();
  }
  window.changeQty = changeQty;

  function removeLine(sku) {
    cart = cart.filter(function (l) { return l.sku !== sku; });
    renderCart();
  }
  window.removeLine = removeLine;

  function currentPricingMode() {
    try {
      var store = JSON.parse(localStorage.getItem("pos_tax_settings") || "{}");
      return store.pricingMode || "exclusive";
    } catch (e) { return "exclusive"; }
  }

  function calcTotals() {
    var manual = discount.approved ? discount : { type: "percent", value: 0 };
    return window.computeCartTotals(cart, currentPricingMode(), manual);
  }

  function renderCart() {
    var totals = calcTotals();
    els.cartLines.innerHTML = "";
    if (cart.length === 0) {
      els.cartLines.innerHTML = '<div class="empty-state"><p>Scan or tap an item to start a bill.</p></div>';
    }
    cart.forEach(function (l, idx) {
      var computed = totals.lines[idx] || { originalAmount: l.price * l.qty, discountAmount: 0 };
      var isWeight = l.pricingMethod === "weight";
      var row = document.createElement("div");
      row.className = "cart-line";
      var qtyLabel = isWeight ? l.qty.toFixed(3) + " kg" : l.qty + " pcs";

      if (typeof l.mrp !== "number") l.mrp = l.price;
      if (typeof l.wholesale_price !== "number") l.wholesale_price = l.price;
      if (!l.priceMode) l.priceMode = "mrp";

      var isWholesale = l.priceMode === "wholesale";
      var badgeHtml = isWholesale
        ? '<span class="badge-price-toggle badge-wholesale" data-act="toggle-pm" title="Click to switch to MRP">Wholesale</span>'
        : '<span class="badge-price-toggle badge-mrp" data-act="toggle-pm" title="Click to switch to Wholesale">MRP</span>';

      var priceSubText = "";
      if (isWholesale) {
        priceSubText = '₹' + l.wholesale_price.toFixed(2) + ' <span class="price-strike">₹' + l.mrp.toFixed(2) + '</span> ' + (isWeight ? "/" + (l.unit || "kg") : "") + ' &times; ' + (isWeight ? l.qty.toFixed(3) : l.qty) + ' ' + (l.unit || "pcs") + ' &middot; GST ' + l.tax + '%';
      } else {
        var wsInfo = (l.wholesale_price && l.wholesale_price < l.mrp) ? ' (WS ₹' + l.wholesale_price.toFixed(2) + ')' : '';
        priceSubText = '₹' + l.mrp.toFixed(2) + wsInfo + ' &times; ' + qtyLabel + ' &middot; GST ' + l.tax + '%';
      }

      var discountSub = computed.discountAmount > 0
        ? '<div class="line-sub" style="color:var(--success-700)">Discount: −₹' + computed.discountAmount.toFixed(2) + '</div>'
        : "";

      row.innerHTML =
        '<div class="line-info">' +
          '<div class="line-header-row"><span class="line-name">' + l.name + '</span> ' + (isWholesale ? badgeHtml : '') + '</div>' +
          (!isWholesale ? '<div style="margin-top:2px; margin-bottom:2px;">' + badgeHtml + '</div>' : '') +
          '<div class="line-sub">' + priceSubText + '</div>' +
          discountSub +
        '</div>' +
        (isWeight
          ? '<button type="button" class="btn btn-ghost btn-sm" data-act="editw">Edit</button>'
          : '<div class="qty-stepper"><button type="button" data-act="dec">−</button><span>' + l.qty + '</span><button type="button" data-act="inc">+</button></div>') +
        '<div class="line-total">₹' + computed.originalAmount.toFixed(2) + '</div>' +
        '<button type="button" class="line-remove" aria-label="Remove">✕</button>';

      var toggleBtn = row.querySelector('[data-act="toggle-pm"]');
      if (toggleBtn) {
        toggleBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          togglePriceMode(l.sku);
        });
      }

      if (isWeight) {
        row.querySelector('[data-act="editw"]').addEventListener("click", function () { openScaleModal(l.sku); });
      } else {
        row.querySelector('[data-act="inc"]').addEventListener("click", function () { changeQty(l.sku, 1); });
        row.querySelector('[data-act="dec"]').addEventListener("click", function () { changeQty(l.sku, -1); });
      }
      row.querySelector(".line-remove").addEventListener("click", function () { removeLine(l.sku); });
      els.cartLines.appendChild(row);
    });

    els.cartCount.textContent = cart.reduce(function (n, l) { return n + (l.pricingMethod === "weight" ? 1 : l.qty); }, 0);
    if (els.pricingModeBadge) els.pricingModeBadge.textContent = totals.pricingMode === "inclusive" ? "Tax Inclusive" : "Tax Exclusive";

    var subtotalLabelEl = document.getElementById("sumSubtotalLabel");
    var taxLabelEl = document.getElementById("sumTaxLabel");
    if (totals.pricingMode === "inclusive") {
      if (subtotalLabelEl) subtotalLabelEl.textContent = "Items Subtotal";
      if (taxLabelEl) taxLabelEl.textContent = "Internal GST (Included)";
      els.subtotal.textContent = "₹" + (totals.grandTotal + totals.discountTotal).toFixed(2);
      els.taxTotal.textContent = "₹" + totals.gstTotal.toFixed(2);
    } else {
      if (subtotalLabelEl) subtotalLabelEl.textContent = "Taxable Amount";
      if (taxLabelEl) taxLabelEl.textContent = "GST Amount";
      els.subtotal.textContent = "₹" + totals.taxableTotal.toFixed(2);
      els.taxTotal.textContent = "₹" + totals.gstTotal.toFixed(2);
    }
    if (totals.discountTotal > 0) {
      els.discountRow.style.display = "flex";
      els.discountVal.textContent = "−₹" + totals.discountTotal.toFixed(2);
    } else if (els.discountRow) { els.discountRow.style.display = "none"; }
    els.grandTotal.textContent = "₹" + totals.grandTotal.toFixed(2);
    renderCatalog(els.scanInput ? els.scanInput.value : "");
  }

  /* ---------------- Barcode Search ---------------- */
  if (els.scanInput) {
    els.scanInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var val = els.scanInput.value.trim();
        if (!val) return;
        var match = liveCatalogItems.find(function (i) {
          return i.barcode === val || i.sku.toLowerCase() === val.toLowerCase() || i.name.toLowerCase() === val.toLowerCase();
        });
        if (match) {
          addToCart(match.sku);
          els.scanInput.value = "";
          renderCatalog();
        } else {
          window.showToast("No item found for '" + val + "'", "warning");
        }
      }
    });
    els.scanInput.addEventListener("input", function () {
      renderCatalog(els.scanInput.value);
    });
  }

  /* ---------------- Scale Modal ---------------- */
  var pendingScaleSku = null;
  window.openScaleModal = function (sku) {
    pendingScaleSku = sku || (liveCatalogItems.find(function (i) { return i.pricing_method === "weight"; }) || {}).sku;
    if (!pendingScaleSku) { window.showToast("Select a weight-priced item", "warning"); return; }
    var item = liveCatalogItems.find(function (i) { return i.sku === pendingScaleSku; });
    var labelEl = document.getElementById("scaleItemLabel");
    if (labelEl && item) labelEl.textContent = "Weighing: " + item.name + " (₹" + item.price.toFixed(2) + "/kg)";
    document.getElementById("manualWeightInput").value = "";
    window.openModal("scaleModal");
  };

  window.confirmScaleWeight = function () {
    var weight = parseFloat(document.getElementById("manualWeightInput").value);
    if (isNaN(weight) || weight <= 0) { window.showToast("Enter a valid weight in kg", "warning"); return; }
    addWeightToCart(pendingScaleSku, weight);
    window.closeModal("scaleModal");
    pendingScaleSku = null;
  };

  /* ---------------- Discounts & Approval ---------------- */
  window.stageDiscount = function () {
    var val = parseFloat(document.getElementById("discValue").value) || 0;
    var type = document.querySelector('input[name="discType"]:checked').value;
    var requiresApproval = (type === "percent" && val > 10) || (type === "flat" && val > 200);
    pendingDiscount = { type: type, value: val, approved: !requiresApproval };
    if (requiresApproval) {
      window.closeModal("discountModal");
      window.openModal("discountApprovalModal");
    } else {
      discount = pendingDiscount;
      renderCart();
      window.closeModal("discountModal");
      window.showToast("Discount applied");
    }
  };

  window.approveDiscount = async function () {
    var pin = document.getElementById("approvalPin").value;
    try {
      if (window.API) {
        await window.API.approveDiscountPin(pin);
        discount = pendingDiscount || { type: "percent", value: 0, approved: true };
        discount.approved = true;
        renderCart();
        window.closeModal("discountApprovalModal");
        document.getElementById("approvalPin").value = "";
        window.showToast("Discount approved by Admin", "success");
      }
    } catch (err) {
      window.showToast("Invalid Admin PIN", "danger");
    }
  };

  window.clearDiscount = function () {
    discount = { type: "percent", value: 0, approved: true };
    renderCart();
    window.showToast("Discount removed");
  };

  /* ---------------- Payment & Complete Sale ---------------- */
  window.openPayment = function () {
    if (cart.length === 0) { window.showToast("Add at least one item first", "warning"); return; }
    tenders = [{ mode: "Cash", amount: 0 }];
    activeTenderIndex = 0;
    renderTenders();
    window.openModal("paymentModal");
  };

  function totalDue() { return calcTotals().grandTotal; }
  function tenderedSum() { return tenders.reduce(function (s, t) { return s + t.amount; }, 0); }

  function renderTenders() {
    var due = totalDue();
    els.payAmount.textContent = "₹" + due.toFixed(2);
    els.tenderList.innerHTML = "";
    tenders.forEach(function (t, i) {
      var row = document.createElement("div");
      row.className = "split-row";
      row.innerHTML =
        '<span class="badge badge-neutral" style="min-width:56px;justify-content:center">' + t.mode + "</span>" +
        '<strong class="mono" style="flex:1">₹' + t.amount.toFixed(2) + "</strong>" +
        (tenders.length > 1 ? '<button type="button" class="btn btn-ghost btn-sm" data-remove="' + i + '">Remove</button>' : "");
      if (tenders.length > 1) {
        row.querySelector("[data-remove]").addEventListener("click", function () {
          tenders.splice(i, 1);
          activeTenderIndex = 0;
          renderTenders();
        });
      }
      row.addEventListener("click", function () { activeTenderIndex = i; highlightActiveTender(); });
      els.tenderList.appendChild(row);
    });
    highlightActiveTender();
    var remaining = due - tenderedSum();
    els.payRemaining.textContent = "₹" + Math.max(0, remaining).toFixed(2);
    if (remaining < 0) {
      els.changeDue.style.display = "flex";
      els.changeDueVal.textContent = "₹" + Math.abs(remaining).toFixed(2);
    } else {
      els.changeDue.style.display = "none";
    }
    document.getElementById("completeSaleBtn").disabled = tenderedSum() < due;
  }

  function highlightActiveTender() {
    Array.prototype.forEach.call(els.tenderList.children, function (row, i) {
      row.style.background = i === activeTenderIndex ? "var(--slate-50)" : "transparent";
    });
  }

  window.setTenderMode = function (mode) {
    if (!tenders[activeTenderIndex]) return;
    tenders[activeTenderIndex].mode = mode;
    document.querySelectorAll(".tender-tabs .chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-mode") === mode);
    });
    renderTenders();
  };

  window.numpadPress = function (key) {
    var t = tenders[activeTenderIndex];
    if (!t) return;
    var current = String(t.amount === 0 ? "" : t.amount);
    if (key === "C") { t.amount = 0; }
    else if (key === "back") { current = current.slice(0, -1); t.amount = parseFloat(current || "0"); }
    else if (key === ".") { if (current.indexOf(".") === -1) t.amount = parseFloat((current + ".0")); }
    else if (key === "exact") { t.amount = Math.max(0, totalDue() - (tenderedSum() - t.amount)); }
    else { current += key; t.amount = parseFloat(current); }
    renderTenders();
  };

  window.addSplitTender = function () {
    if (tenders.length >= 2) { window.showToast("Maximum of two payment modes per bill", "warning"); return; }
    var remaining = Math.max(0, totalDue() - tenderedSum());
    tenders.push({ mode: "Card", amount: remaining });
    activeTenderIndex = tenders.length - 1;
    renderTenders();
  };

  window.completeSale = async function () {
    if (tenderedSum() < totalDue()) { window.showToast("Amount tendered is short", "danger"); return; }
    
    var cartLinesInput = cart.map(function (l) {
      return {
        sku: l.sku,
        name: l.name,
        price: l.price,
        tax: l.tax,
        qty: l.qty,
        unit: l.unit || "pcs",
        pricing_method: l.pricingMethod || "qty"
      };
    });

    var salePayload = {
      lines: cartLinesInput,
      pricing_mode: currentPricingMode(),
      manual_discount: discount,
      tenders: tenders
    };

    try {
      var saleRecord = await window.API.createSale(salePayload);
      window.showToast("Sale completed! Invoice #" + saleRecord.invoice_no, "success");

      renderReceipt(saleRecord);
      cart = [];
      discount = { type: "percent", value: 0, approved: true };
      renderCart();
      window.closeModal("paymentModal");
      window.openModal("receiptModal");

      // Refresh live catalog stock
      initPOSData();
    } catch (err) {
      window.showToast("Checkout failed: " + (err.message || "Error"), "danger");
    }
  };

  function renderReceipt(record) {
    var box = document.getElementById("receiptContent");
    if (!box) return;
    if (record.receipt_html) {
      box.innerHTML = record.receipt_html;
    } else {
      box.innerHTML = window.renderReceiptHTML(record);
    }
  }

  /* ---------------- Hold & Recall ---------------- */
  window.holdBill = async function () {
    if (cart.length === 0) { window.showToast("Nothing to hold", "warning"); return; }
    try {
      var heldPayload = {
        lines: cart,
        discount: discount,
        item_count: cart.reduce(function (n, l) { return n + (l.pricingMethod === "weight" ? 1 : l.qty); }, 0),
        total: calcTotals().grandTotal
      };
      var res = await window.API.holdBill(heldPayload);
      window.showToast("Bill held as " + res.held_id, "success");
      cart = [];
      discount = { type: "percent", value: 0, approved: true };
      renderCart();
    } catch (e) {
      window.showToast("Failed to hold bill", "danger");
    }
  };

  async function recallFromQuery() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("recall");
    if (!id) return;
    try {
      var heldList = await window.API.getHeldBills();
      var found = heldList.find(function (h) { return h.id === id; });
      if (found) {
        cart = found.lines.slice();
        discount = found.discount || discount;
        await window.API.deleteHeldBill(id);
        renderCart();
        window.showToast("Recalled held bill #" + id, "success");
      }
    } catch (e) {}
    window.history.replaceState({}, "", "pos.html");
  }
})();
