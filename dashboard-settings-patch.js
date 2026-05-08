(function () {
  "use strict";

  let renderWrapped = false;
  let toastWrapped = false;
  let settingsPrepared = false;
  let lastHeroHtml = "";
  let lastMarketHtml = "";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function injectStyles() {
    if (document.querySelector("#dashboardSettingsPatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "dashboardSettingsPatchStyles";
    style.textContent = `
      #view-dashboard .metric-grid[hidden] { display: none !important; }
      .dash-hero-panel {
        margin-bottom: 16px;
        overflow: hidden;
        background:
          radial-gradient(circle at 14% 10%, rgba(80, 212, 174, .18), transparent 32%),
          radial-gradient(circle at 88% 0%, rgba(210, 154, 68, .17), transparent 28%),
          linear-gradient(135deg, rgba(22, 27, 23, .96), rgba(12, 14, 13, .98));
      }
      .dash-hero-body {
        display: grid;
        grid-template-columns: 104px minmax(0, 1fr);
        gap: 18px;
        align-items: stretch;
      }
      .dash-hero-avatar {
        width: 104px;
        min-height: 104px;
        border-radius: 10px;
        border: 1px solid rgba(222, 184, 93, .45);
        background: linear-gradient(145deg, rgba(84, 57, 31, .85), rgba(13, 15, 14, .95));
        display: grid;
        place-items: center;
        color: var(--paper);
        font-family: var(--font-display);
        font-size: 2rem;
        box-shadow: inset 0 0 22px rgba(0, 0, 0, .32);
        overflow: hidden;
      }
      .dash-hero-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .dash-hero-goals {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .dash-hero-goal {
        min-width: 0;
        border: 1px solid rgba(222, 184, 93, .28);
        border-radius: 8px;
        padding: 12px;
        background: rgba(7, 9, 8, .5);
      }
      .dash-hero-goal-short { border-color: rgba(82, 220, 146, .55); box-shadow: inset 0 1px 0 rgba(82, 220, 146, .12); }
      .dash-hero-goal-medium { border-color: rgba(255, 170, 64, .58); box-shadow: inset 0 1px 0 rgba(255, 170, 64, .12); }
      .dash-hero-goal-long { border-color: rgba(166, 112, 255, .58); box-shadow: inset 0 1px 0 rgba(166, 112, 255, .12); }
      .dash-hero-goal strong {
        display: block;
        color: var(--paper);
        font-size: .9rem;
        margin-bottom: 8px;
      }
      .dash-hero-goal p {
        margin: 8px 0 0;
        color: rgba(255, 247, 224, .86);
        line-height: 1.35;
        font-size: .9rem;
      }
      .dash-hero-goal span {
        color: var(--muted);
        font-size: .86rem;
      }
      .dash-hero-goal em {
        display: inline-block;
        margin-left: 6px;
        color: #f5c36b;
        font-size: .68rem;
        text-transform: uppercase;
        font-style: normal;
        letter-spacing: 0;
      }
      .dash-market-summary {
        border: 1px solid rgba(222, 184, 93, .32);
        border-radius: 8px;
        padding: 15px;
        background: linear-gradient(135deg, rgba(18, 23, 20, .9), rgba(8, 10, 9, .95));
      }
      .dash-market-summary + .dash-market-summary { margin-top: 12px; }
      .dash-market-summary span {
        display: block;
        color: var(--muted);
        font-size: .78rem;
        text-transform: uppercase;
        font-weight: 800;
      }
      .dash-market-summary strong {
        display: block;
        margin-top: 8px;
        color: var(--paper);
        font-family: var(--font-display);
        font-size: clamp(1.45rem, 3vw, 2.2rem);
        line-height: 1;
      }
      .settings-date-panel .day-control {
        margin: 0;
        display: flex;
        align-items: end;
        justify-content: flex-start;
        flex-wrap: wrap;
        gap: 10px;
      }
      .settings-date-panel .day-control label {
        min-width: 160px;
      }
      @media (max-width: 980px) {
        .dash-hero-body { grid-template-columns: 88px minmax(0, 1fr); }
        .dash-hero-avatar { width: 88px; min-height: 88px; }
        .dash-hero-goals { grid-template-columns: 1fr; }
      }
      @media (max-width: 680px) {
        .dash-hero-body { grid-template-columns: 1fr; }
        .dash-hero-avatar { width: 100%; min-height: 180px; }
      }
    `;
    document.head.appendChild(style);
  }

  function getInitials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function formatCalendarDate(day) {
    if (typeof window.formatCalendarDate === "function") {
      return window.formatCalendarDate(day);
    }
    return `Dia ${day}`;
  }

  function getHero() {
    if (typeof window.getCampfireHeroForUser !== "function") {
      return null;
    }
    return window.getCampfireHeroForUser();
  }

  function canSeeSecrets(hero) {
    if (typeof window.canSeeCampfireSecrets === "function") {
      return window.canSeeCampfireSecrets(hero);
    }
    return false;
  }

  function renderHeroGoals(hero) {
    const categories = [
      ["short", "Curto Prazo"],
      ["medium", "Médio Prazo"],
      ["long", "Longo Prazo"]
    ];
    const revealSecrets = canSeeSecrets(hero);
    return categories.map(([category, label]) => {
      const goals = (hero.goals || []).filter((goal) => goal.category === category && (revealSecrets || !goal.secret));
      return `
        <section class="dash-hero-goal dash-hero-goal-${category}">
          <strong>${label}</strong>
          ${goals.length
            ? goals.slice(0, 3).map((goal) => `<p>${escapeHtml(goal.text)}${goal.secret ? `<em>Secreto</em>` : ""}</p>`).join("")
            : `<span>Nada visível.</span>`}
        </section>
      `;
    }).join("");
  }

  function renderHeroPanel() {
    const dashboard = document.querySelector("#view-dashboard");
    if (!dashboard) {
      return;
    }
    let panel = document.querySelector("#dashboardHeroPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "dashboardHeroPanel";
      panel.className = "panel dash-hero-panel";
      dashboard.insertBefore(panel, dashboard.firstElementChild);
    }

    const hero = getHero();
    const html = hero ? `
      <div class="section-header">
        <div>
          <p class="eyebrow">Seu Herói</p>
          <h2>${escapeHtml(hero.characterName)}</h2>
        </div>
        <span class="chip">Objetivos atuais</span>
      </div>
      <div class="dash-hero-body">
        <div class="dash-hero-avatar ${hero.image ? "has-image" : ""}" aria-hidden="true">
          ${hero.image ? `<img src="${escapeHtml(hero.image)}" alt="">` : `<span>${escapeHtml(getInitials(hero.characterName))}</span>`}
        </div>
        <div class="dash-hero-goals">
          ${renderHeroGoals(hero)}
        </div>
      </div>
    ` : `
      <div class="section-header">
        <div>
          <p class="eyebrow">Seu Herói</p>
          <h2>Personagem não vinculado</h2>
        </div>
      </div>
      <p class="muted">Vincule um personagem ao seu usuário na Fogueira dos Heróis para ver objetivos aqui.</p>
    `;

    if (html !== lastHeroHtml) {
      panel.innerHTML = html;
      lastHeroHtml = html;
    }
  }

  function renderMarketSummary() {
    const list = document.querySelector("#dashboardMarketList");
    const section = list?.closest("section.panel");
    if (!list || !section) {
      return;
    }
    const eyebrow = section.querySelector(".eyebrow");
    if (eyebrow) {
      eyebrow.textContent = "Mercado Esmeralda";
    }
    const title = section.querySelector("h2");
    if (title) {
      title.textContent = "Mercado Atual";
    }
    const button = section.querySelector("#refreshMarketDashboard");
    if (button) {
      button.hidden = true;
    }
    const total = typeof window.getMarketStockTotal === "function" ? window.getMarketStockTotal() : 0;
    const nextDay = typeof window.getNextMarketDay === "function" ? window.getNextMarketDay() : null;
    const html = `
      <article class="dash-market-summary">
        <span>Itens no mercado</span>
        <strong>${total}</strong>
      </article>
      <article class="dash-market-summary">
        <span>Próxima atualização</span>
        <strong>${nextDay ? formatCalendarDate(nextDay) : "Sem previsão"}</strong>
      </article>
    `;
    if (html !== lastMarketHtml) {
      list.innerHTML = html;
      lastMarketHtml = html;
    }
  }

  function moveDateControlToSettings() {
    const settings = document.querySelector("#view-settings");
    const dayForm = document.querySelector("#dayForm");
    if (!settings || !dayForm) {
      return;
    }
    let panel = document.querySelector("#settingsDatePanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "settingsDatePanel";
      panel.className = "panel settings-date-panel";
      panel.innerHTML = `
        <div class="section-header">
          <div>
            <p class="eyebrow">Calendário da campanha</p>
            <h2>Data atual do RPG</h2>
          </div>
        </div>
      `;
      settings.insertBefore(panel, settings.firstElementChild);
    }
    if (!panel.contains(dayForm)) {
      panel.appendChild(dayForm);
    }
    dayForm.hidden = false;
  }

  function prepareSettingsBalance() {
    const form = document.querySelector("#settingsForm");
    const input = document.querySelector("#startingBalance");
    if (!form || !input) {
      return;
    }
    const label = input.closest("label");
    if (label && !label.dataset.balanceRelabeled) {
      const text = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (text) {
        text.textContent = "Saldo atual em gp";
      }
      label.dataset.balanceRelabeled = "true";
    }
    const heading = form.closest(".panel")?.querySelector("h2");
    if (heading) {
      heading.textContent = "Saldo atual e backup";
    }
    const submit = form.querySelector("button[type='submit']");
    if (submit) {
      submit.textContent = "Salvar saldo atual";
    }
    if (!settingsPrepared) {
      form.addEventListener("submit", () => {
        const desiredCopper = Math.round((Number(input.value) || 0) * 100);
        const currentCopper = typeof window.getBalanceCopper === "function" ? window.getBalanceCopper() : desiredCopper;
        const startingCopper = Math.round((Number(input.dataset.startingBalanceGp) || 0) * 100);
        const ledgerDelta = currentCopper - startingCopper;
        const nextStartingCopper = desiredCopper - ledgerDelta;
        input.value = String(Math.max(0, nextStartingCopper) / 100);
      }, true);
      settingsPrepared = true;
    }
  }

  function syncSettingsBalanceValue() {
    const input = document.querySelector("#startingBalance");
    if (!input || document.activeElement === input) {
      return;
    }
    const currentCopper = typeof window.getBalanceCopper === "function" ? window.getBalanceCopper() : 0;
    const currentGp = Math.round(currentCopper) / 100;
    if (!input.dataset.startingBalanceGp || input.value !== String(currentGp)) {
      input.dataset.startingBalanceGp = input.value || "0";
      input.value = String(currentGp);
    }
  }

  function applyTitle() {
    if (location.hash.replace("#", "") === "market") {
      const title = document.querySelector("#viewTitle");
      if (title) {
        title.textContent = "Mercado Esmeralda";
      }
    }
  }

  function applyDashboardPatch() {
    const metricGrid = document.querySelector("#view-dashboard .metric-grid");
    if (metricGrid) {
      metricGrid.hidden = true;
    }
    renderHeroPanel();
    renderMarketSummary();
  }

  function applySettingsPatch() {
    moveDateControlToSettings();
    prepareSettingsBalance();
    if (location.hash.replace("#", "") === "settings") {
      syncSettingsBalanceValue();
    }
  }

  function wrapToast() {
    if (toastWrapped || typeof window.showToast !== "function") {
      return;
    }
    const originalToast = window.showToast;
    window.showToast = function patchedToast(message, ...args) {
      const nextMessage = message === "Saldo inicial salvo." ? "Saldo atual salvo." : message;
      return originalToast.call(this, nextMessage, ...args);
    };
    toastWrapped = true;
  }

  function applyAll() {
    injectStyles();
    wrapToast();
    applyTitle();
    applyDashboardPatch();
    applySettingsPatch();
  }

  function wrapRender() {
    if (renderWrapped || typeof window.render !== "function") {
      return;
    }
    const originalRender = window.render;
    window.render = function patchedRender(...args) {
      const result = originalRender.apply(this, args);
      queueMicrotask(applyAll);
      return result;
    };
    renderWrapped = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    wrapRender();
    applyAll();
    setInterval(() => {
      wrapRender();
      applyAll();
    }, 1000);
  });
  window.addEventListener("hashchange", () => queueMicrotask(applyAll));
}());
