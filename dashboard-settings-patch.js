(function () {
  "use strict";

  let renderWrapped = false;
  let toastWrapped = false;
  let settingsPrepared = false;
  let lastHeroHtml = "";
  let lastMarketHtml = "";

  const LABELS = new Map([
    ["Painel", "Início"],
    ["Dados", "Configurações"],
    ["Dados da campanha", "Configurações"],
    ["Mercado dos mercadores", "Mercado Esmeralda"],
    ["Mercadores da base", "Mercado Esmeralda"],
    ["Livro-caixa", "Tesouro"],
    ["Lançamentos", "Movimentos do Cofre"],
    ["Ciclos recorrentes", "Contratos recorrentes"],
    ["Nova fonte", "Novo contrato"],
    ["Editar fonte", "Editar contrato"],
    ["Salvar fonte", "Salvar contrato"],
    ["Fontes", "Contratos"],
    ["Nenhuma fonte", "Nenhum contrato"],
    ["Fonte sem nome", "Contrato sem nome"],
    ["Sem lançamentos", "Sem movimentos"],
    ["Saldo e backup", "Saldo atual e backup"],
    ["Saldo inicial em gp", "Saldo atual em gp"],
    ["Salvar saldo", "Salvar saldo atual"]
  ]);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function setText(element, value) {
    if (element && element.textContent.trim() !== value) {
      element.textContent = value;
    }
  }

  function applyKnownLabels(root = document) {
    root.querySelectorAll("h1, h2, h3, .eyebrow, button, label, .nav-label").forEach((element) => {
      const current = element.textContent.trim();
      const next = LABELS.get(current);
      if (next) {
        element.textContent = next;
      }
    });

    document.querySelectorAll("[placeholder], [title], [aria-label]").forEach((element) => {
      ["placeholder", "title", "aria-label"].forEach((attr) => {
        const value = element.getAttribute(attr);
        const next = LABELS.get(value);
        if (next) {
          element.setAttribute(attr, next);
        }
      });
    });
  }

  function injectStyles() {
    if (document.querySelector("#dashboardSettingsPatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "dashboardSettingsPatchStyles";
    style.textContent = `
      #view-dashboard .metric-grid { display: none !important; }
      .dash-hero-panel {
        margin-bottom: 16px;
        overflow: hidden;
        background:
          radial-gradient(circle at 14% 10%, rgba(80, 212, 174, .16), transparent 32%),
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
        min-width: 0;
      }
      .dash-hero-goal {
        min-width: 0;
        border: 1px solid rgba(222, 184, 93, .28);
        border-radius: 8px;
        padding: 12px;
        background: rgba(7, 9, 8, .5);
      }
      .dash-hero-goal-short { border-color: rgba(82, 220, 146, .55); }
      .dash-hero-goal-medium { border-color: rgba(255, 170, 64, .58); }
      .dash-hero-goal-long { border-color: rgba(166, 112, 255, .58); }
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
        overflow-wrap: anywhere;
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
      .settings-date-panel .day-control label { min-width: 160px; }
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
    if (!dashboard || (location.hash || "#dashboard").replace("#", "") !== "dashboard") {
      return;
    }
    let panel = document.querySelector("#dashboardHeroPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "dashboardHeroPanel";
      panel.className = "panel dash-hero-panel";
      dashboard.insertBefore(panel, dashboard.firstElementChild);
    }

    const hero = typeof window.getCampfireHeroForUser === "function" ? window.getCampfireHeroForUser() : null;
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
        <div class="dash-hero-goals">${renderHeroGoals(hero)}</div>
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
    if (!list || !section || (location.hash || "#dashboard").replace("#", "") !== "dashboard") {
      return;
    }
    setText(section.querySelector(".eyebrow"), "Mercado Esmeralda");
    setText(section.querySelector("h2"), "Mercado Atual");
    const button = section.querySelector("#refreshMarketDashboard");
    if (button) {
      button.hidden = false;
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
    setText(form.closest(".panel")?.querySelector("h2"), "Saldo atual e backup");
    setText(form.querySelector("button[type='submit']"), "Salvar saldo atual");
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
    const view = (location.hash || "#dashboard").replace("#", "") || "dashboard";
    const title = document.querySelector("#viewTitle");
    const titles = {
      dashboard: "Início",
      market: "Mercado Esmeralda",
      settings: "Configurações"
    };
    if (title && titles[view]) {
      title.textContent = titles[view];
    }
  }

  function applyNavigationLabels() {
    document.querySelectorAll(".nav-button").forEach((button) => {
      const target = button.dataset.viewTarget;
      const label = button.querySelector(".nav-label") || Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const names = { dashboard: "Início", settings: "Configurações" };
      if (target && names[target] && label) {
        if (label.nodeType === Node.TEXT_NODE) {
          label.nodeValue = ` ${names[target]}`;
        } else {
          label.textContent = names[target];
        }
      }
    });
  }

  function applyFinanceLabels() {
    const finance = document.querySelector("#view-finance");
    if (!finance) {
      return;
    }
    setText(finance.querySelector("#sourceFormTitle"), "Novo contrato");
    finance.querySelectorAll(".eyebrow, h2, h3, button, label").forEach((element) => {
      const next = LABELS.get(element.textContent.trim());
      if (next) {
        element.textContent = next;
      }
    });
  }

  function applyMarketLabels() {
    const market = document.querySelector("#view-market");
    if (!market) {
      return;
    }
    market.querySelectorAll("h1, h2, .eyebrow").forEach((element) => {
      if (/mercado|bazar/i.test(element.textContent)) {
        element.textContent = "Mercado Esmeralda";
      }
    });
  }

  function wrapToast() {
    if (toastWrapped || typeof window.showToast !== "function") {
      return;
    }
    const originalToast = window.showToast;
    window.showToast = function patchedToast(message, ...args) {
      const messages = new Map([
        ["Saldo inicial salvo.", "Saldo atual salvo."],
        ["Fonte financeira salva.", "Contrato salvo."],
        ["Fonte removida.", "Contrato removido."],
        ["Recorrentes processadas no livro-caixa.", "Recorrentes processadas nos registros do tesouro."],
        ["Pendência registrada no livro-caixa.", "Pendência registrada no tesouro."]
      ]);
      return originalToast.call(this, messages.get(message) || message, ...args);
    };
    toastWrapped = true;
  }

  function applyAll() {
    injectStyles();
    wrapToast();
    applyTitle();
    applyNavigationLabels();
    applyKnownLabels(document);
    renderHeroPanel();
    renderMarketSummary();
    moveDateControlToSettings();
    prepareSettingsBalance();
    syncSettingsBalanceValue();
    applyFinanceLabels();
    applyMarketLabels();
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
    setTimeout(applyAll, 250);
    setTimeout(applyAll, 900);
  });
  window.addEventListener("hashchange", () => queueMicrotask(applyAll));
}());
