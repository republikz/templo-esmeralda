(function () {
  "use strict";

  const STORAGE_KEY = "templo-sidebar-collapsed";
  const GEM_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Esmeralda">
      <defs>
        <linearGradient id="emeraldTop" x1="18" y1="8" x2="78" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#e9fff2"/>
          <stop offset="0.22" stop-color="#8ff2bd"/>
          <stop offset="0.58" stop-color="#23b878"/>
          <stop offset="1" stop-color="#067351"/>
        </linearGradient>
        <linearGradient id="emeraldCore" x1="22" y1="20" x2="70" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#65f5a8"/>
          <stop offset="0.45" stop-color="#129667"/>
          <stop offset="1" stop-color="#063f35"/>
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="blur"/>
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.12 0 0 0 0 0.94 0 0 0 0 0.58 0 0 0 .75 0"/>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="M18 31 33 13h30l15 18-30 53Z" fill="#064b3e" opacity=".95" filter="url(#glow)"/>
      <path d="M18 31 33 13h30l15 18H18Z" fill="url(#emeraldTop)"/>
      <path d="M18 31h60L48 84Z" fill="url(#emeraldCore)"/>
      <path d="M33 13 40 31H18Z" fill="#b8ffd4" opacity=".72"/>
      <path d="M63 13 56 31h22Z" fill="#55dfa0" opacity=".72"/>
      <path d="M40 31h16L48 84Z" fill="#31d58d" opacity=".58"/>
      <path d="M18 31 48 84 40 31Z" fill="#07875e" opacity=".56"/>
      <path d="M78 31 48 84 56 31Z" fill="#034b41" opacity=".55"/>
      <path d="M40 31 33 13h30l-7 18Z" fill="#d7ffe6" opacity=".52"/>
      <path d="M18 31 33 13h30l15 18-30 53Z" fill="none" stroke="#d8ffe7" stroke-width="3" stroke-linejoin="round" opacity=".82"/>
      <path d="M33 19h29" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".72"/>
    </svg>
  `;

  function injectStyles() {
    if (document.querySelector("#sidebarBrandPatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "sidebarBrandPatchStyles";
    style.textContent = `
      .brand { position: relative; }
      .brand-mark.emerald-brand-mark {
        background:
          radial-gradient(circle at 30% 18%, rgba(255, 255, 255, .22), transparent 24%),
          linear-gradient(145deg, rgba(34, 78, 62, .96), rgba(52, 35, 28, .98));
        border-color: rgba(105, 245, 169, .52);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06), 0 0 22px rgba(31, 196, 126, .15);
      }
      .brand-mark.emerald-brand-mark::before { display: none !important; }
      .brand-emerald-image {
        width: 34px;
        height: 34px;
        display: block;
        pointer-events: none;
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

  function applyBrandMark() {
    const mark = document.querySelector(".brand-mark");
    if (!mark || mark.dataset.emeraldApplied === "true") {
      return;
    }
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(GEM_SVG)}`;
    mark.classList.add("emerald-brand-mark");
    mark.innerHTML = `<img class="brand-emerald-image" src="${src}" alt="">`;
    mark.dataset.emeraldApplied = "true";
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
    applyBrandMark();
    ensureNavLabels();
    ensureToggle();
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    setInterval(applyAll, 1000);
  });
}());
