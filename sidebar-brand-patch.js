(function () {
  "use strict";

  const STORAGE_KEY = "templo-sidebar-collapsed";

  function injectStyles() {
    if (document.querySelector("#sidebarBrandPatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "sidebarBrandPatchStyles";
    style.textContent = `
      .brand { position: relative; }
      .nav-button .nav-label {
        width: auto;
        min-width: 0;
        flex: 1 1 auto;
        color: inherit;
        margin: 0;
      }
      .sidebar-toggle {
        margin-left: auto;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        border: 1px solid rgba(231, 197, 123, .35);
        background: rgba(255, 235, 170, .08);
        color: #ffe6ad;
        display: inline-grid;
        place-items: center;
        cursor: pointer;
        transition: transform .18s ease, background .18s ease, border-color .18s ease;
      }
      .sidebar-toggle:hover {
        background: rgba(255, 235, 170, .14);
        border-color: rgba(231, 197, 123, .62);
      }
      .sidebar-toggle-icon {
        width: 18px;
        height: 18px;
        display: block;
        background: currentColor;
        -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 6l-6 6 6 6'/%3E%3Cpath d='M20 4v16'/%3E%3C/svg%3E") center / contain no-repeat;
        mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M15 6l-6 6 6 6'/%3E%3Cpath d='M20 4v16'/%3E%3C/svg%3E") center / contain no-repeat;
      }
      body.sidebar-collapsed .sidebar-toggle-icon { transform: rotate(180deg); }
      @media (min-width: 981px) {
        .app-shell { transition: grid-template-columns .22s ease; }
        .sidebar { transition: width .22s ease, padding .22s ease; }
        body.sidebar-collapsed .app-shell { grid-template-columns: 88px minmax(0, 1fr); }
        body.sidebar-collapsed .sidebar {
          padding: 22px 14px;
          gap: 18px;
        }
        body.sidebar-collapsed .brand {
          flex-direction: column;
          gap: 12px;
          align-items: center;
          padding-bottom: 18px;
        }
        body.sidebar-collapsed .brand > div:not(.brand-mark),
        body.sidebar-collapsed .nav-button .nav-label,
        body.sidebar-collapsed .side-status span,
        body.sidebar-collapsed .side-status strong {
          display: none !important;
        }
        body.sidebar-collapsed .sidebar-toggle { margin-left: 0; }
        body.sidebar-collapsed .nav-button {
          justify-content: center;
          padding: 12px;
          min-height: 48px;
        }
        body.sidebar-collapsed .nav-button > span[aria-hidden="true"] {
          margin: 0;
        }
        body.sidebar-collapsed .side-status {
          padding: 10px;
          gap: 8px;
        }
        body.sidebar-collapsed .side-status div {
          width: 28px;
          height: 5px;
          border-radius: 999px;
          background: rgba(255, 226, 165, .42);
        }
      }
      @media (max-width: 980px) {
        .sidebar-toggle { margin-left: auto; }
        body.sidebar-collapsed .brand > div:not(.brand-mark),
        body.sidebar-collapsed .nav-button .nav-label,
        body.sidebar-collapsed .side-status {
          display: none !important;
        }
        body.sidebar-collapsed .nav-list {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        body.sidebar-collapsed .nav-button {
          justify-content: center;
          min-height: 48px;
          padding: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setCollapsed(nextValue) {
    document.body.classList.toggle("sidebar-collapsed", nextValue);
    try {
      localStorage.setItem(STORAGE_KEY, nextValue ? "1" : "0");
    } catch (error) {
      // localStorage can be blocked in some browsers; the visual toggle can still work.
    }
    const toggle = document.querySelector("#sidebarCollapseToggle");
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(nextValue));
      toggle.setAttribute("aria-label", nextValue ? "Expandir barra lateral" : "Recolher barra lateral");
      toggle.title = nextValue ? "Expandir barra lateral" : "Recolher barra lateral";
    }
  }

  function getSavedCollapsed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function ensureNavLabels() {
    document.querySelectorAll(".nav-button").forEach((button) => {
      const icon = button.querySelector('span[aria-hidden="true"]');
      if (!icon) {
        return;
      }
      Array.from(button.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          const label = document.createElement("span");
          label.className = "nav-label";
          label.textContent = node.textContent.trim();
          button.replaceChild(label, node);
        }
      });
    });
  }

  function ensureToggle() {
    const brand = document.querySelector(".brand");
    if (!brand || document.querySelector("#sidebarCollapseToggle")) {
      return;
    }
    const toggle = document.createElement("button");
    toggle.id = "sidebarCollapseToggle";
    toggle.className = "sidebar-toggle";
    toggle.type = "button";
    toggle.innerHTML = '<span class="sidebar-toggle-icon" aria-hidden="true"></span>';
    toggle.addEventListener("click", () => setCollapsed(!document.body.classList.contains("sidebar-collapsed")));
    brand.appendChild(toggle);
    setCollapsed(getSavedCollapsed());
  }

  function applyAll() {
    injectStyles();
    ensureNavLabels();
    ensureToggle();
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    setInterval(applyAll, 1000);
  });
}());
