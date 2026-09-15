/* ============================================================
   upload.js — bulk item/stock CSV upload with DB persistence
   FR-P1-STK-001, FR-P1-STK-006
   ============================================================ */

(function () {
  "use strict";
  var currentParsedRows = [];

  function parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length; });
    if (lines.length < 2) return [];
    var headers = lines[0].split(",").map(function (h) { return h.trim().toLowerCase(); });
    return lines.slice(1).map(function (line) {
      var cells = line.split(",").map(function (c) { return c.trim(); });
      var row = {};
      headers.forEach(function (h, i) { row[h] = cells[i] !== undefined ? cells[i] : ""; });
      return row;
    });
  }

  async function renderPreview(rows) {
    try {
      var catalog = await window.API.getItems();
      var existingSkus = {};
      catalog.forEach(function (i) { existingSkus[i.sku] = i; });

      var results = [];
      var counts = { new: 0, update: 0, error: 0 };

      rows.forEach(function (row) {
        var sku = row.sku || "";
        var name = row.name || "";
        var price = row.selling_price || row.price || "";
        var qty = row.opening_qty || row.stock || "";

        var missing = [];
        if (!sku) missing.append ? missing.push("sku") : null;
        if (!name) missing.push("name");
        if (!price) missing.push("selling_price");
        if (!qty) missing.push("opening_qty");

        var status = "new";
        var reason = "";
        if (missing.length > 0) {
          status = "error";
          reason = "Missing " + missing.join(", ");
          counts.error++;
        } else if (existingSkus[sku]) {
          status = "update";
          reason = "Existing SKU — stock refresh";
          counts.update++;
        } else {
          status = "new";
          reason = "New SKU entry";
          counts.new++;
        }

        results.push({
          status: status,
          reason: reason,
          row: {
            sku: sku,
            barcode: row.barcode || sku,
            name: name,
            category: row.category || row.category_name || "Grocery",
            selling_price: parseFloat(price) || 0,
            tax_rate: parseFloat(row.tax_rate || row.tax) || 0,
            opening_qty: parseFloat(qty) || 0,
            pricing_method: row.pricing_method || "qty",
            unit: row.unit || "pcs"
          }
        });
      });

      currentParsedRows = results;

      var tbody = document.getElementById("previewTbody");
      tbody.innerHTML = "";

      results.forEach(function (r) {
        var badge = r.status === "new" ? '<span class="badge badge-info">New Item</span>'
          : r.status === "update" ? '<span class="badge badge-warning">Qty Update</span>'
          : '<span class="badge badge-danger">Error</span>';
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="mono">' + (r.row.sku || "—") + "</td>" +
          "<td><strong>" + (r.row.name || "—") + "</strong></td>" +
          "<td>" + (r.row.category || "—") + "</td>" +
          '<td class="num mono">₹' + r.row.selling_price.toFixed(2) + "</td>" +
          '<td class="num mono font-semibold">' + r.row.opening_qty + " " + r.row.unit + "</td>" +
          "<td>" + badge + (r.reason ? '<div class="text-xs text-muted" style="margin-top:2px">' + r.reason + "</div>" : "") + "</td>";
        tbody.appendChild(tr);
      });

      document.getElementById("previewSection").style.display = "";
      document.getElementById("countNew").textContent = counts.new;
      document.getElementById("countUpdate").textContent = counts.update;
      document.getElementById("countError").textContent = counts.error;
      document.getElementById("commitBtn").disabled = (counts.new + counts.update) === 0;
    } catch (err) {
      showToast("Error processing upload preview: " + (err.message || "Failed"), "danger");
    }
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

  window.downloadSampleTemplate = function () {
    window.location.href = window.API.BASE_URL + "/catalog/upload/sample";
  };

  window.loadSampleFile = function () {
    var sampleCSV =
      "sku,barcode,name,category,selling_price,tax_rate,opening_qty,pricing_method,unit\n" +
      "BEV-005,8901030875069,Lemon Iced Tea 500ml,Beverages,55.0,12.0,60.0,qty,pcs\n" +
      "SNK-005,8901030876189,Trail Mix 120g,Snacks,70.0,12.0,45.0,qty,pcs\n" +
      "DAI-005,8901030877285,Greek Yogurt 100g,Dairy,39.0,0.0,80.0,qty,pcs\n" +
      "GRO-006,8901030879500,Red Kidney Beans 500g,Grocery,89.0,5.0,36.0,weight,kg\n" +
      "PC-005,8901030880605,Face Wash 100ml,Personal Care,149.0,18.0,25.0,qty,pcs\n";
    handleFile(sampleCSV, "stock_upload_sample.csv");
  };

  window.commitUpload = async function () {
    if (currentParsedRows.length === 0) return;
    try {
      var res = await window.API.uploadCommit(currentParsedRows);
      showToast(res.message || "Stock items committed to database!", "success");
      document.getElementById("previewSection").style.display = "none";
      document.getElementById("fileNameLabel").textContent = "";
      if (fileInput) fileInput.value = "";
      currentParsedRows = [];
      setTimeout(function () { window.location.href = "items-stock.html"; }, 800);
    } catch (err) {
      showToast("Upload commit failed: " + (err.message || "Error"), "danger");
    }
  };
})();
