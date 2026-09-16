/* ============================================================
   app.js — shared shell behavior for every Phase 1 screen
   - modal open/close
   - toast notifications
   - idle-timer auto-lock (FR-P1-UM-004)
   - admin/cashier role switch (demo affordance, FR-P1-UM-001)
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- Modal helpers ---------------- */
  window.openModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("open");
  };
  window.closeModal = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("open");
  };
  document.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("open");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(function (m) {
        m.classList.remove("open");
      });
    }
  });

  /* ---------------- Toast ---------------- */
  window.showToast = function (message, tone) {
    var stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    var toast = document.createElement("div");
    toast.className = "toast";
    var dot = document.createElement("span");
    dot.className = "dot " + (tone === "danger" ? "dot-danger" : tone === "warning" ? "dot-warning" : "dot-success");
    toast.appendChild(dot);
    var text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(text);
    stack.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 200ms ease";
      setTimeout(function () { toast.remove(); }, 220);
    }, 3200);
  };

  /* ---------------- Tabs (generic) ---------------- */
  document.querySelectorAll("[data-tabs]").forEach(function (group) {
    var tabs = group.querySelectorAll(".tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-tab-target");
        tabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        group.querySelectorAll(".tab-panel").forEach(function (panel) {
          panel.classList.toggle("active", panel.id === target);
        });
      });
    });
  });

  /* ---------------- Role switch (demo only) ---------------- */
  var ROLE_PROFILE = {
    admin:   { initials: "AM", name: "Arjun M.",  sub: "Admin · Store Manager" },
    cashier: { initials: "PK", name: "Priya K.",  sub: "Cashier · Counter 1" }
  };
  function applyRole(role) {
    document.body.setAttribute("data-role", role);
    document.querySelectorAll(".role-switch button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-role") === role);
    });
    document.querySelectorAll("[data-admin-only]").forEach(function (el) {
      el.style.display = role === "admin" ? "" : "none";
    });
    var profile = ROLE_PROFILE[role] || ROLE_PROFILE.cashier;
    var chip = document.querySelector(".user-chip");
    if (chip) {
      var avatar = chip.querySelector(".avatar");
      var name = chip.querySelector(".user-chip-name");
      var sub = chip.querySelector(".user-chip-sub");
      if (avatar) avatar.textContent = profile.initials;
      if (name) name.textContent = profile.name;
      if (sub) sub.textContent = profile.sub;
    }
    try { localStorage.setItem("pos_demo_role", role); } catch (e) {}
  }
  document.querySelectorAll(".role-switch button").forEach(function (btn) {
    btn.addEventListener("click", function () { applyRole(btn.getAttribute("data-role")); });
  });
  (function initRole() {
    var saved = "admin";
    try { saved = localStorage.getItem("pos_demo_role") || "admin"; } catch (e) {}
    if (document.querySelector(".role-switch")) applyRole(saved);
  })();

  /* ---------------- Idle auto-lock ---------------- */
  var IDLE_MS = 45000; /* demo-shortened idle window so the behavior is visible */
  var idleTimer;
  function resetIdle() {
    clearTimeout(idleTimer);
    if (document.getElementById("lockOverlay")) {
      idleTimer = setTimeout(function () {
        document.getElementById("lockOverlay").classList.add("open");
      }, IDLE_MS);
    }
  }
  ["mousemove", "keydown", "click", "touchstart"].forEach(function (evt) {
    document.addEventListener(evt, resetIdle, { passive: true });
  });
  resetIdle();

  window.unlockScreen = function () {
    var pin = document.getElementById("lockPinInput");
    if (pin && pin.value.length < 4) {
      showToast("Enter your PIN to continue", "warning");
      return;
    }
    document.getElementById("lockOverlay").classList.remove("open");
    if (pin) pin.value = "";
    resetIdle();
  };

  /* ---------------- Mobile sidebar toggle ---------------- */
  var navToggle = document.getElementById("navToggle");
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      document.querySelector(".sidebar").classList.toggle("open");
    });
  }
})();
