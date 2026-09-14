/* ============================================================
   pos.js — Point-of-Sale billing screen logic (Phase 1)
   FR-P1-POS-001..010
   All state is in-memory + localStorage; no backend.
   ============================================================ */

(function () {
  "use strict";
  if (!document.querySelector(".pos-layout")) return; /* only run on pos.html */

  var INVOICE_KEY = "pos_demo_invoice_seq";
  var HELD_KEY = "pos_demo_held_bills";
  var SALES_LOG_KEY = "pos_demo_sales_log";

  var cart = [];              // [{sku,name,price,tax,pricingMethod,unit,qty}] qty = pieces or kg
  var discount = { type: "percent", value: 0, approved: true }; // manual bill-level discount (existing FR-P1-POS-003)
  var tenders = [];           // [{mode:'Cash'|'Card'|'UPI', amount:number}]
  var activeTenderIndex = 0;
  var pendingDiscount = null; // staged discount awaiting approval

  var pendingScaleSku = null;  // item targeted by the weighing-scale modal
  var scalePort = null;        // connected Web Serial port, if any

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
    changeDueVal: document.getElementById("changeDueVal"),
    numpadValue: document.getElementById("numpadValue")
  };

  /* ---------------- Catalog rendering ---------------- */
  var activeCategory = "All";
  function renderCatalog(filterText) {
    var catalog = window.getLiveCatalog();
    var term = (filterText || "").trim().toLowerCase();
    var list = catalog.filter(function (item) {
      var matchCat = activeCategory === "All" || item.category === activeCategory;
      var matchTerm = !term || item.name.toLowerCase().indexOf(term) > -1 || item.sku.toLowerCase().indexOf(term) > -1;
      return matchCat && matchTerm;
    });
    els.grid.innerHTML = "";
    if (list.length === 0) {
      els.grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No items match.</div>';
      return;
    }
    list.forEach(function (item) {
      var isWeight = item.pricingMethod === "weight";
      var card = document.createElement("button");
      card.type = "button";
      card.className = "item-card" + (item.stock === 0 ? " out-of-stock" : item.stock <= item.min ? " low-stock" : "");
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
    ["All"].concat(window.getLiveCategories()).forEach(function (cat, i) {
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
  renderCategoryRail();

  /* ---------------- Cart logic ---------------- */
  function addToCart(sku) {
    var catalog = window.getLiveCatalog();
    var item = catalog.find(function (i) { return i.sku === sku; });
    if (!item || item.stock <= 0) { window.showToast("Item unavailable", "danger"); return; }
    if (item.pricingMethod === "weight") { openScaleModal(sku); return; }
    var line = cart.find(function (l) { return l.sku === sku; });
    var inCartQty = line ? line.qty : 0;
    if (inCartQty + 1 > item.stock) { window.showToast("Only " + item.stock + " in stock", "warning"); return; }
    if (line) { line.qty += 1; }
    else { cart.push({ sku: item.sku, name: item.name, price: item.price, tax: item.tax, pricingMethod: "qty", unit: item.unit || "pcs", qty: 1 }); }
    renderCart();
  }
  window.addToCart = addToCart;

  function addWeightToCart(sku, weightKg) {
    var item = window.getLiveCatalog().find(function (i) { return i.sku === sku; });
    if (!item) return;
    if (weightKg > item.stock) { window.showToast("Only " + item.stock.toFixed(3) + " kg in stock", "warning"); return; }
    var line = cart.find(function (l) { return l.sku === sku; });
    if (line) { line.qty = weightKg; }
    else { cart.push({ sku: item.sku, name: item.name, price: item.price, tax: item.tax, pricingMethod: "weight", unit: item.unit || "kg", qty: weightKg }); }
    renderCart();
  }

  function changeQty(sku, delta) {
    var line = cart.find(function (l) { return l.sku === sku; });
    if (!line) return;
    var catalog = window.getLiveCatalog();
    var item = catalog.find(function (i) { return i.sku === sku; });
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

  function currentPricingMode() { return window.getTaxSettings().pricingMode; }
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
      var computed = totals.lines[idx];
      var isWeight = l.pricingMethod === "weight";
      var row = document.createElement("div");
      row.className = "cart-line";
      var qtyLabel = window.formatQty(l);
      var discountSub = computed.discountAmount > 0
        ? '<div class="line-sub" style="color:var(--success-700)">Discount' + (computed.discountName ? " (" + computed.discountName + ")" : "") + ": −₹" + computed.discountAmount.toFixed(2) + "</div>"
        : "";
      row.innerHTML =
        '<div class="line-info"><div class="line-name">' + l.name + '</div><div class="line-sub">₹' + l.price.toFixed(2) + (isWeight ? "/kg" : "") + " &times; " + qtyLabel + " &middot; GST " + l.tax + "%</div>" + discountSub + "</div>" +
        (isWeight
          ? '<button type="button" class="btn btn-ghost btn-sm" data-act="editw">Edit</button>'
          : '<div class="qty-stepper"><button type="button" data-act="dec">−</button><span>' + l.qty + '</span><button type="button" data-act="inc">+</button></div>') +
        '<div class="line-total">₹' + computed.originalAmount.toFixed(2) + "</div>" +
        '<button type="button" class="line-remove" aria-label="Remove">✕</button>';
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

  /* ---------------- Barcode / search entry ---------------- */
  if (els.scanInput) {
    els.scanInput.addEventListener("input", function () { renderCatalog(els.scanInput.value); });
    els.scanInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var term = els.scanInput.value.trim();
      if (!term) return;
      var catalog = window.getLiveCatalog();
      var item = catalog.find(function (i) { return i.barcode === term || i.sku.toLowerCase() === term.toLowerCase(); });
      if (item) {
        var wasWeight = item.pricingMethod === "weight";
        addToCart(item.sku);
        els.scanInput.value = "";
        renderCatalog("");
        if (!wasWeight) window.showToast(item.name + " added");
      } else {
        window.showToast("No item matches “" + term + "”", "warning");
      }
    });
  }

  /* ---------------- Weighing scale (FR-P1-HW-002) ----------------
     Uses the Web Serial API for a real connected scale when the
     browser/context supports it (Chromium, served over HTTPS or
     localhost). Manual weight entry is always available as a
     fallback, and is what "Add to Bill" reads from — a live scale
     reading simply writes into the same field. */
  function scaleItems() { return window.getLiveCatalog().filter(function (i) { return i.pricingMethod === "weight"; }); }

  function updateScaleItemLabel(sku) {
    var item = window.getLiveCatalog().find(function (i) { return i.sku === sku; });
    var label = document.getElementById("scaleItemLabel");
    if (label && item) label.textContent = item.name + " — ₹" + item.price.toFixed(2) + " / kg";
  }

  window.openScaleModal = function (sku) {
    var picker = document.getElementById("scaleItemPicker");
    var select = document.getElementById("scaleItemSelect");
    if (!sku) {
      var items = scaleItems();
      if (items.length === 0) { window.showToast("No weight-priced items configured", "warning"); return; }
      select.innerHTML = items.map(function (i) { return '<option value="' + i.sku + '">' + i.name + " (₹" + i.price.toFixed(2) + "/kg)</option>"; }).join("");
      picker.style.display = "";
      sku = select.value;
      select.onchange = function () { updateScaleItemLabel(select.value); };
    } else {
      picker.style.display = "none";
    }
    pendingScaleSku = sku;
    updateScaleItemLabel(sku);
    var existing = cart.find(function (l) { return l.sku === sku; });
    var input = document.getElementById("manualWeightInput");
    input.value = existing ? existing.qty : "";
    document.getElementById("scaleReading").textContent = existing ? existing.qty.toFixed(3) + " kg" : "— kg";
    document.getElementById("scaleStatus").textContent = scalePort ? "Connected" : "Not connected";
    document.getElementById("scaleStatus").className = "badge " + (scalePort ? "badge-success" : "badge-neutral");
    openModal("scaleModal");
  };

  window.connectScale = async function () {
    if (!("serial" in navigator)) {
      window.showToast("Web Serial not supported in this browser/context — use manual weight entry", "warning");
      return;
    }
    try {
      var port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      scalePort = port;
      document.getElementById("scaleStatus").textContent = "Connected";
      document.getElementById("scaleStatus").className = "badge badge-success";
      window.showToast("Weighing scale connected");
      readScaleLoop(port);
    } catch (e) {
      window.showToast("Scale connection cancelled or unavailable", "warning");
    }
  };

  async function readScaleLoop(port) {
    var buffer = "";
    try {
      var decoder = new TextDecoderStream();
      var readableClosed = port.readable.pipeTo(decoder.writable);
      var reader = decoder.readable.getReader();
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        buffer += result.value;
        var parts = buffer.split(/[\r\n]+/);
        buffer = parts.pop();
        parts.forEach(function (line) {
          var match = line.match(/-?\d+(\.\d+)?/);
          if (!match) return;
          var kg = parseFloat(match[0]);
          if (!window.isValidWeightKg(kg)) return;
          var input = document.getElementById("manualWeightInput");
          var reading = document.getElementById("scaleReading");
          if (input) input.value = kg.toFixed(3);
          if (reading) reading.textContent = kg.toFixed(3) + " kg";
        });
      }
      await readableClosed.catch(function () {});
    } catch (e) {
      /* device unplugged or read error — fall back to manual entry silently */
    }
    scalePort = null;
    var status = document.getElementById("scaleStatus");
    if (status) { status.textContent = "Disconnected"; status.className = "badge badge-neutral"; }
  }

  window.confirmScaleWeight = function () {
    var picker = document.getElementById("scaleItemPicker");
    var sku = (picker && picker.style.display !== "none") ? document.getElementById("scaleItemSelect").value : pendingScaleSku;
    var weight = parseFloat(document.getElementById("manualWeightInput").value);
    if (!window.isValidWeightKg(weight)) {
      window.showToast("Enter a valid weight between 1 g and " + window.MAX_WEIGHT_KG + " kg", "danger");
      return;
    }
    addWeightToCart(sku, weight);
    closeModal("scaleModal");
    window.showToast("Weight added to bill");
  };

  /* ---------------- Discount ---------------- */
  window.stageDiscount = function () {
    var type = document.querySelector('input[name="discType"]:checked').value;
    var value = parseFloat(document.getElementById("discValue").value) || 0;
    var needsApproval = (type === "percent" && value > 10) || (type === "flat" && value > 200);
    pendingDiscount = { type: type, value: value };
    if (needsApproval && document.body.getAttribute("data-role") !== "admin") {
      closeModal("discountModal");
      openModal("discountApprovalModal");
    } else {
      discount = { type: type, value: value, approved: true };
      renderCart();
      closeModal("discountModal");
      window.showToast("Discount applied");
    }
  };
  window.approveDiscount = function () {
    var pin = document.getElementById("approvalPin");
    if (!pin.value || pin.value.length < 4) { window.showToast("Enter admin PIN", "warning"); return; }
    discount = Object.assign({ approved: true }, pendingDiscount);
    renderCart();
    pin.value = "";
    closeModal("discountApprovalModal");
    window.showToast("Discount approved and applied");
  };
  window.clearDiscount = function () {
    discount = { type: "percent", value: 0, approved: true };
    renderCart();
    window.showToast("Discount removed");
  };

  /* ---------------- Payment ---------------- */
  window.openPayment = function () {
    if (cart.length === 0) { window.showToast("Add at least one item first", "warning"); return; }
    tenders = [{ mode: "Cash", amount: 0 }];
    activeTenderIndex = 0;
    renderTenders();
    openModal("paymentModal");
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

  window.completeSale = function () {
    if (tenderedSum() < totalDue()) { window.showToast("Amount tendered is short", "danger"); return; }
    var seq = parseInt(localStorage.getItem(INVOICE_KEY) || "1024", 10) + 1;
    localStorage.setItem(INVOICE_KEY, String(seq));
    var invoiceNo = "INV-FY26-" + String(seq).padStart(5, "0");

    cart.forEach(function (l) { window.adjustStock(l.sku, -l.qty); });

    var totals = calcTotals();
    var record = Object.assign({ invoiceNo: invoiceNo, time: new Date().toISOString(), tenders: tenders.slice() }, totals);
    try {
      var log = JSON.parse(localStorage.getItem(SALES_LOG_KEY) || "[]");
      log.push(record);
      localStorage.setItem(SALES_LOG_KEY, JSON.stringify(log));
    } catch (e) {}

    renderReceipt(record);
    cart = []; discount = { type: "percent", value: 0, approved: true };
    renderCart();
    closeModal("paymentModal");
    openModal("receiptModal");
  };

  function renderReceipt(record) {
    var box = document.getElementById("receiptContent");
    if (!box) return;
    box.innerHTML = window.renderReceiptHTML(record);
  }

  /* ---------------- Hold & Recall ---------------- */
  window.holdBill = function () {
    if (cart.length === 0) { window.showToast("Nothing to hold", "warning"); return; }
    try {
      var held = JSON.parse(localStorage.getItem(HELD_KEY) || "[]");
      held.push({ id: "HOLD-" + Date.now(), time: new Date().toISOString(), lines: cart.slice(), discount: discount, itemCount: cart.reduce(function (n, l) { return n + (l.pricingMethod === "weight" ? 1 : l.qty); }, 0), total: calcTotals().grandTotal });
      localStorage.setItem(HELD_KEY, JSON.stringify(held));
    } catch (e) {}
    cart = []; discount = { type: "percent", value: 0, approved: true };
    renderCart();
    window.showToast("Bill parked. Recall it from Hold & Recall.");
  };

  function recallFromQuery() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("recall");
    if (!id) return;
    try {
      var held = JSON.parse(localStorage.getItem(HELD_KEY) || "[]");
      var found = held.find(function (h) { return h.id === id; });
      if (found) {
        cart = found.lines.slice();
        discount = found.discount || discount;
        held = held.filter(function (h) { return h.id !== id; });
        localStorage.setItem(HELD_KEY, JSON.stringify(held));
        window.showToast("Recalled parked bill");
      }
    } catch (e) {}
    window.history.replaceState({}, "", "pos.html");
  }

  /* ---------------- Init ---------------- */
  recallFromQuery();
  renderCart();
})();
