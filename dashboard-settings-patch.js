(function () {
  "use strict";

  let renderWrapped = false;
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

  function getInitials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function formatCopper(copper) {
    if (typeof window.formatCopper === "function") {
      return window.formatCopper(copper);
    }
    return `${Math.round((Number(copper) || 0) / 100)} gp`;
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
        <span>Itens disponíveis</span>
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

  function applyAll() {
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
