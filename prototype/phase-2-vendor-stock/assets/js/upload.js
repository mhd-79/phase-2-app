/* ============================================================
   upload.js — bulk item/stock CSV upload with preview-before-commit
   FR-P1-STK-001, FR-P1-STK-006, Phase 2 Stock Upload Updates
   ============================================================ */

(function () {
  "use strict";
  var parsedRows = [];

  function normalizeHeader(h) {
    var clean = (h || "").trim().toLowerCase().replace(/_/g, " ");
    if (clean === "sku") return "sku";
    if (clean === "barcode") return "barcode";
    if (clean === "batch no" || clean === "batchno" || clean === "batch") return "batch_no";
    if (clean === "name" || clean === "item name") return "name";
    if (clean === "category") return "category";
    if (clean === "cost price" || clean === "cost") return "cost_price";
    if (clean === "selling price" || clean === "price" || clean === "mrp") return "selling_price";
    if (clean === "tax rate" || clean === "tax") return "tax_rate";
    if (clean === "opening qty" || clean === "opening quantity" || clean === "qty" || clean === "stock") return "opening_qty";
    if (clean === "mfg date" || clean === "mfgdate" || clean === "manufacture date") return "mfg_date";
    if (clean === "exp date" || clean === "expdate" || clean === "expiry date") return "exp_date";
    return clean;
  }

  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length; });
    if (lines.length < 2) return [];
    var headers = lines[0].split(",").map(normalizeHeader);
    return lines.slice(1).map(function (line) {
      var cells = line.split(",").map(function (c) { return c.trim(); });
      var row = {};
      headers.forEach(function (h, i) { row[h] = cells[i] || ""; });
      return row;
    });
  }

  function classifyRow(row) {
    var required = ["sku", "name", "selling_price", "opening_qty"];
    var missing = required.filter(function (k) { return !row[k]; });
    if (missing.length) return { status: "error", reason: "Missing " + missing.join(", "), row: row };
    var exists = window.getLiveCatalog().some(function (i) { return i.sku === row.sku; });
    return { status: exists ? "update" : "new", row: row };
  }

  function renderPreview(rows) {
    var results = rows.map(classifyRow);
    parsedRows = results;
    var tbody = document.getElementById("previewTbody");
    tbody.innerHTML = "";
    var counts = { new: 0, update: 0, error: 0 };
    results.forEach(function (r) {
      counts[r.status]++;
      var badge = r.status === "new" ? '<span class="badge badge-info">New Item</span>'
        : r.status === "update" ? '<span class="badge badge-warning">Qty Update</span>'
        : '<span class="badge badge-danger">Error</span>';
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="mono">' + (r.row.sku || "—") + "</td>" +
        '<td class="mono text-xs">' + (r.row.barcode || "—") + "</td>" +
        '<td class="mono text-xs">' + (r.row.batch_no || "—") + "</td>" +
        "<td><strong>" + (r.row.name || "—") + "</strong></td>" +
        "<td>" + (r.row.category || "Grocery") + "</td>" +
        '<td class="num mono">₹' + (r.row.cost_price || "0") + "</td>" +
        '<td class="num mono">₹' + (r.row.selling_price || "0") + "</td>" +
        '<td class="num mono">' + (r.row.tax_rate || "0") + "%</td>" +
        '<td class="num mono" style="font-weight:700">' + (r.row.opening_qty || "0") + "</td>" +
        '<td class="mono text-xs">' + (r.row.mfg_date || "—") + "</td>" +
        '<td class="mono text-xs">' + (r.row.exp_date || "—") + "</td>" +
        "<td>" + badge + (r.reason ? '<div class="text-xs text-muted" style="margin-top:2px">' + r.reason + "</div>" : "") + "</td>";
      tbody.appendChild(tr);
    });
    document.getElementById("previewSection").style.display = "";
    document.getElementById("countNew").textContent = counts.new;
    document.getElementById("countUpdate").textContent = counts.update;
    document.getElementById("countError").textContent = counts.error;
    document.getElementById("commitBtn").disabled = (counts.new + counts.update) === 0;
  }

  function handleFile(text, filename) {
    var rows = parseCSV(text);
    if (rows.length === 0) { window.showToast("File has no data rows", "danger"); return; }
    document.getElementById("fileNameLabel").textContent = filename + " · " + rows.length + " rows parsed";
    renderPreview(rows);
  }

  var fileInput = document.getElementById("csvFileInput");
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) { handleFile(e.target.result, file.name); };
      reader.readAsText(file);
    });
  }

  window.loadSampleFile = function () {
    fetch("assets/data/items.sample.csv").then(function (r) { return r.text(); }).then(function (text) {
      handleFile(text, "items.sample.csv");
    }).catch(function () { window.showToast("Could not load sample file", "danger"); });
  };

  window.commitUpload = function () {
    var applied = 0;
    parsedRows.forEach(function (r) {
      if (r.status === "error") return;
      var openingQty = parseFloat(r.row.opening_qty) || 0;
      var record = {
        sku: r.row.sku,
        barcode: r.row.barcode || "",
        name: r.row.name,
        category: r.row.category || "Grocery",
        price: parseFloat(r.row.selling_price) || 0,
        tax: parseFloat(r.row.tax_rate) || 0,
        stock: openingQty,
        min: Math.max(10, Math.round(openingQty * 0.2))
      };
      if (r.status === "update") {
        window.setStockAbsolute(record.sku, record.stock);
      } else {
        window.upsertCustomItem(record);
      }

      // Record Batch information in pos_p2_batches_v1
      var batchNo = r.row.batch_no || ("BAT-" + record.sku);
      var mfgDate = r.row.mfg_date || "2026-01-01";
      var expDate = r.row.exp_date || "2027-01-01";
      if (typeof window.addBatch === "function") {
        window.addBatch({
          sku: record.sku,
          name: record.name,
          batch: batchNo,
          mfgDate: mfgDate,
          expiryDate: expDate,
          qty: openingQty
        });
      }

      applied++;
    });
    window.showToast(applied + " item row(s) & batch record(s) committed to stock");
    document.getElementById("previewSection").style.display = "none";
    document.getElementById("fileNameLabel").textContent = "";
    if (fileInput) fileInput.value = "";
    parsedRows = [];
  };
})();
