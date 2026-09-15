/* ============================================================
   app.js — Shared shell behavior for actual Phase 1 app
   - Centralized authentication & strict role enforcement
   - Removal of role switcher (roles fixed post-login)
   - Configurable idle auto-lock (Auto-Lock After value from Store Settings)
   - Toast notifications & generic modal/tab helpers
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

  /* ---------------- Auth & Role Enforcement ---------------- */
  window.getLoggedUser = function () {
    try {
      var raw = localStorage.getItem("pos_logged_user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  window.logoutUser = function () {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_logged_user");
    window.location.href = "login.html";
  };

  function enforceRoleAndSession() {
    var currentPath = window.location.pathname;
    var isLoginPage = currentPath.endsWith("login.html");
    var user = getLoggedUser();

    if (!user || !localStorage.getItem("pos_token")) {
      if (!isLoginPage) {
        window.location.href = "login.html";
        return;
      }
    }

    if (isLoginPage) return;

    var role = user.role || "cashier";
    document.body.setAttribute("data-role", role);

    // Hide top-left role switcher if present in DOM
    var roleSwitcher = document.querySelector(".role-switch");
    if (roleSwitcher) {
      roleSwitcher.style.display = "none";
    }

    // Hide admin-only elements for cashier
    document.querySelectorAll("[data-admin-only]").forEach(function (el) {
      el.style.display = role === "admin" ? "" : "none";
    });

    // Restrict cashier from admin-only pages
    var adminPages = ["users.html", "store-settings.html", "discounts.html", "stock-upload.html"];
    var currentPageName = currentPath.substring(currentPath.lastIndexOf("/") + 1);
    if (role !== "admin" && adminPages.includes(currentPageName)) {
      alert("Access Denied: Cashiers cannot access " + currentPageName);
      window.location.href = "pos.html";
      return;
    }

    // Update user profile chip in UI
    var chip = document.querySelector(".user-chip");
    if (chip) {
      var avatar = chip.querySelector(".avatar");
      var name = chip.querySelector(".user-chip-name");
      var sub = chip.querySelector(".user-chip-sub");
      if (avatar) avatar.textContent = user.full_name ? user.full_name.split(" ").map(function(n){return n[0];}).join("").toUpperCase() : "U";
      if (name) name.textContent = user.full_name || user.username;
      if (sub) sub.textContent = user.sub_text || (role === "admin" ? "Admin · Store Manager" : "Cashier · Counter 1");
    }

    // Attach logout button listener
    var logoutBtn = document.getElementById("logoutBtn") || document.querySelector(".logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function (e) {
        e.preventDefault();
        logoutUser();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", enforceRoleAndSession);
  enforceRoleAndSession();

  /* ---------------- Idle Auto-Lock ---------------- */
  var idleTimeoutMs = 45000; // Default 45 seconds
  var idleTimer = null;

  async function fetchIdleTimeoutConfig() {
    try {
      if (window.API) {
        var store = await window.API.getStoreSettings();
        if (store && store.idle_timeout_seconds) {
          idleTimeoutMs = store.idle_timeout_seconds * 1000;
        }
      }
    } catch (e) {
      console.warn("Could not fetch store idle timeout, using default:", e);
    }
    resetIdle();
  }

  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    var overlay = document.getElementById("lockOverlay");
    if (overlay && !window.location.pathname.endsWith("login.html")) {
      idleTimer = setTimeout(function () {
        overlay.classList.add("open");
      }, idleTimeoutMs);
    }
  }

  ["mousemove", "keydown", "click", "touchstart"].forEach(function (evt) {
    document.addEventListener(evt, resetIdle, { passive: true });
  });

  fetchIdleTimeoutConfig();

  window.unlockScreen = async function () {
    var pin = document.getElementById("lockPinInput");
    var user = getLoggedUser();
    if (!pin || pin.value.length < 4) {
      showToast("Enter your PIN to continue", "warning");
      return;
    }
    try {
      if (window.API) {
        await window.API.login(user.username, pin.value, user.role);
        document.getElementById("lockOverlay").classList.remove("open");
        pin.value = "";
        showToast("Screen unlocked", "success");
        resetIdle();
      }
    } catch (err) {
      showToast("Invalid PIN. Please try again.", "danger");
    }
  };

  /* ---------------- Mobile sidebar toggle ---------------- */
  var navToggle = document.getElementById("navToggle");
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      document.querySelector(".sidebar").classList.toggle("open");
    });
  }
})();
