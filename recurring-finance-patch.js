(function () {
  "use strict";

  const STATE_API_URL = "/api/state";
  const MONTHS = ["Verão", "Outono", "Caos", "Inverno", "Primavera"];
  const DAYS_PER_MONTH = 72;
  const DAYS_PER_YEAR = MONTHS.length * DAYS_PER_MONTH;
  const AUTO_SETTLE_KEY = "templo-auto-settle-reload";
  let busy = false;
  let renderWrapped = false;
  let lastNextCycleHtml = "";

  function monthArticle(month) {
    return month === "Primavera" ? "da" : "do";
  }

  function calendarParts(day) {
    const safeDay = Math.max(1, Number(day) || 1);
    const dayInYear = ((safeDay - 1) % DAYS_PER_YEAR) + 1;
    const monthIndex = Math.floor((dayInYear - 1) / DAYS_PER_MONTH);
    const dayOfMonth = ((dayInYear - 1) % DAYS_PER_MONTH) + 1;
    return { dayInYear, monthIndex, dayOfMonth };
  }

  function campaignYear(day) {
    return Math.floor((Math.max(1, Number(day) || 1) - 1) / DAYS_PER_YEAR);
  }

  function yearStart(day) {
    return campaignYear(day) * DAYS_PER_YEAR;
  }

  function formatCalendarDate(day) {
    const parts = calendarParts(day);
    const month = MONTHS[parts.monthIndex] || MONTHS[0];
    return `${String(parts.dayOfMonth).padStart(2, "0")} ${monthArticle(month)} ${month}`;
  }

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatCopper(copper) {
    const value = Math.round(Number(copper) || 0);
    const gp = Math.floor(value / 100);
    const sp = Math.floor((value % 100) / 10);
    const cp = value % 10;
    const parts = [];
    if (gp) parts.push(`${gp} gp`);
    if (sp) parts.push(`${sp} sp`);
    if (cp) parts.push(`${cp} cp`);
    return parts.length ? parts.join(" ") : "0 gp";
  }

  function kindLabel(kind) {
    return {
      building: "Construção",
      npc: "NPC",
      room: "Sala especial",
      tavern: "Taverna",
      other: "Outro"
    }[kind] || "Contrato";
  }

  async function readState() {
    const response = await fetch(STATE_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  async function writeState(state) {
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Date.now();
    const response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  function dueForSource(state, source) {
    if (!source || !source.active || Number(source.amountCopper) <= 0) {
      return { cycles: 0, amountCopper: 0, lastProcessedDayAfter: Number(source?.lastProcessedDay) || 0 };
    }
    const interval = Math.max(1, Number.parseInt(source.intervalDays, 10) || 30);
    const startDay = Math.max(1, Number.parseInt(source.startDay, 10) || interval);
    const lastProcessed = Math.max(0, Number.parseInt(source.lastProcessedDay, 10) || 0);
    const baseline = Math.max(lastProcessed, startDay - interval);
    const elapsed = (Number(state.currentDay) || 1) - baseline;
    const cycles = Math.max(0, Math.floor(elapsed / interval));
    return {
      cycles,
      amountCopper: (Number(source.amountCopper) || 0) * cycles,
      lastProcessedDayAfter: baseline + cycles * interval,
      firstDueDay: baseline + interval
    };
  }

  function recurringEntriesForRange(state, rangeStart, rangeEnd) {
    const entries = [];
    (state.financeSources || []).forEach((source) => {
      if (!source.active || Number(source.amountCopper) <= 0) {
        return;
      }
      const interval = Math.max(1, Number.parseInt(source.intervalDays, 10) || 30);
      let day = Math.max(1, Number.parseInt(source.startDay, 10) || interval);
      while (day < rangeStart) {
        day += interval;
      }
      while (day <= rangeEnd) {
        if (day > (Number(source.lastProcessedDay) || 0)) {
          entries.push({
            id: `${source.id}-${day}`,
            sourceId: source.id,
            kind: "recurring",
            day,
            title: source.name || "Contrato sem nome",
            type: source.type,
            amountCopper: Number(source.amountCopper) || 0,
            description: `${kindLabel(source.kind)} recorrente a cada ${source.intervalDays || 30} dias.`,
            status: day <= (Number(state.currentDay) || 1) ? "pending" : "scheduled"
          });
        }
        day += interval;
      }
    });
    return entries.sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "pt-BR"));
  }

  function settleDueContracts(state) {
    let changed = false;
    state.ledger = Array.isArray(state.ledger) ? state.ledger : [];
    state.financeSources = Array.isArray(state.financeSources) ? state.financeSources : [];

    state.financeSources.forEach((source) => {
      const due = dueForSource(state, source);
      if (!due.cycles) {
        return;
      }
      const name = `${source.name || "Contrato sem nome"} (${due.cycles} ciclo${due.cycles > 1 ? "s" : ""})`;
      const duplicate = state.ledger.some((entry) => entry.sourceId === source.id
        && entry.day === state.currentDay
        && entry.name === name
        && Number(entry.amountCopper) === due.amountCopper);
      if (!duplicate) {
        state.ledger.push({
          id: createId("ledger"),
          day: Number(state.currentDay) || 1,
          name,
          type: source.type === "income" ? "income" : "expense",
          amountCopper: due.amountCopper,
          sourceId: source.id,
          note: `${due.cycles} ciclo(s) de ${source.intervalDays || 30} dias.`,
          createdAt: Date.now()
        });
      }
      source.lastProcessedDay = due.lastProcessedDayAfter;
      source.updatedAt = Date.now();
      changed = true;
    });

    return changed;
  }

  async function autoSettleDueContracts() {
    if (busy || document.hidden) {
      return;
    }
    busy = true;
    try {
      const state = await readState();
      if (!settleDueContracts(state)) {
        return;
      }
      state.autoProcessRecurring = true;
      await writeState(state);
      try {
        sessionStorage.setItem(AUTO_SETTLE_KEY, String(Date.now()));
      } catch (error) {
        // ignore storage limitations
      }
      window.location.reload();
    } catch (error) {
      console.warn("Falha ao processar contratos recorrentes", error);
    } finally {
      busy = false;
    }
  }

  function renderNextCycleCalendar(state) {
    const calendarMonths = document.querySelector("#calendarMonths");
    if (!calendarMonths) {
      return;
    }
    let panel = document.querySelector("#nextCycleCalendarPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "nextCycleCalendarPanel";
      panel.className = "panel next-cycle-panel";
      calendarMonths.insertAdjacentElement("afterend", panel);
    }

    const currentYear = campaignYear(state.currentDay || 1);
    const nextStart = (currentYear + 1) * DAYS_PER_YEAR + 1;
    const nextEnd = nextStart + DAYS_PER_YEAR - 1;
    const entries = recurringEntriesForRange(state, nextStart, nextEnd);
    const income = entries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amountCopper, 0);
    const expense = entries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amountCopper, 0);
    const html = `
      <div class="section-header">
        <div>
          <p class="eyebrow">Próximo ciclo</p>
          <h2>Ciclo ${currentYear + 2}</h2>
        </div>
        <div class="chip-row">
          <span class="chip income">Receitas: ${formatCopper(income)}</span>
          <span class="chip expense">Despesas: ${formatCopper(expense)}</span>
          <span class="chip">${entries.length} registro${entries.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div class="next-cycle-list">
        ${entries.length ? entries.map((entry) => `
          <article class="calendar-entry ${entry.type} scheduled">
            <div>
              <span class="calendar-date">${formatCalendarDate(entry.day)}</span>
              <h4>${escapeHtml(entry.title)}</h4>
              <p>${escapeHtml(entry.description)}</p>
              <div class="chip-row">
                <span class="chip ${entry.type === "income" ? "income" : "expense"}">${entry.type === "income" ? "Receita" : "Despesa"}</span>
                <span class="chip"><strong>${formatCopper(entry.amountCopper)}</strong></span>
              </div>
            </div>
          </article>
        `).join("") : `<div class="empty-state"><strong>Sem contratos no próximo ciclo</strong><p>Os contratos ativos aparecerão aqui quando tiverem datas previstas.</p></div>`}
      </div>
    `;
    if (html !== lastNextCycleHtml) {
      panel.innerHTML = html;
      lastNextCycleHtml = html;
    }
  }

  function hideManualRecurringControls() {
    document.querySelector("#processRecurringCalendar")?.setAttribute("hidden", "");
    const autoLine = document.querySelector(".auto-process");
    if (autoLine) {
      autoLine.hidden = true;
    }
    const auto = document.querySelector("#autoProcessRecurring");
    if (auto) {
      auto.checked = true;
    }
  }

  function fixPrimaveraArticle(root = document.body) {
    if (!root) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, textarea, input")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(/\bdo Primavera\b/g, "da Primavera");
    });
  }

  function injectStyles() {
    if (document.querySelector("#recurringFinancePatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "recurringFinancePatchStyles";
    style.textContent = `
      #processRecurringCalendar[hidden], .auto-process[hidden] { display: none !important; }
      .next-cycle-panel { margin-top: 18px; }
      .next-cycle-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
      }
      .next-cycle-list .calendar-entry { min-height: 0; }
      .next-cycle-list .calendar-entry h4 { word-break: break-word; }
    `;
    document.head.appendChild(style);
  }

  async function decorateCalendar() {
    hideManualRecurringControls();
    fixPrimaveraArticle();
    if ((location.hash || "#dashboard").replace("#", "") !== "calendar") {
      return;
    }
    try {
      const state = await readState();
      renderNextCycleCalendar(state);
      fixPrimaveraArticle();
    } catch (error) {
      console.warn("Falha ao montar o próximo ciclo", error);
    }
  }

  function wrapRender() {
    if (renderWrapped || typeof window.render !== "function") {
      return;
    }
    const original = window.render;
    window.render = function recurringFinanceRenderPatch(...args) {
      const result = original.apply(this, args);
      queueMicrotask(() => {
        decorateCalendar();
        autoSettleDueContracts();
      });
      return result;
    };
    renderWrapped = true;
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    wrapRender();
    decorateCalendar();
    autoSettleDueContracts();
    setInterval(() => {
      wrapRender();
      decorateCalendar();
      autoSettleDueContracts();
    }, 5000);
  });

  window.addEventListener("hashchange", () => queueMicrotask(decorateCalendar));
}());
