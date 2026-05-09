(function () {
  "use strict";

  const STATE_API_URL = "/api/state";
  const DAYS_PER_MONTH = 72;
  const MONTHS_PER_YEAR = 5;
  const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
  let bound = false;
  let syncing = false;
  let observerStarted = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function campaignYear(day) {
    return Math.floor((Math.max(1, Number(day) || 1) - 1) / DAYS_PER_YEAR);
  }

  function calendarParts(day) {
    const safeDay = Math.max(1, Number(day) || 1);
    const dayInYear = ((safeDay - 1) % DAYS_PER_YEAR) + 1;
    return {
      monthIndex: Math.floor((dayInYear - 1) / DAYS_PER_MONTH),
      dayOfMonth: ((dayInYear - 1) % DAYS_PER_MONTH) + 1,
      cycle: campaignYear(safeDay) + 1
    };
  }

  function getAbsoluteDay(dayOfMonth, monthIndex, cycle) {
    return (cycle - 1) * DAYS_PER_YEAR + monthIndex * DAYS_PER_MONTH + dayOfMonth;
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

  function ensureCycleField() {
    const form = document.querySelector("#dayForm");
    const dateFields = form?.querySelector(".date-fields");
    if (!form || !dateFields) {
      return null;
    }

    let input = document.querySelector("#currentCycleInput");
    if (!input) {
      const wrap = document.createElement("span");
      wrap.className = "cycle-field-wrap";
      wrap.innerHTML = `
        <label class="cycle-field-label" for="currentCycleInput">
          Ciclo
          <input id="currentCycleInput" name="currentCycleInput" type="number" min="1" max="999" step="1" value="1" aria-label="Ciclo atual">
        </label>
      `;
      dateFields.insertAdjacentElement("afterend", wrap);
      input = wrap.querySelector("#currentCycleInput");
    }
    return input;
  }

  async function syncCycleValue() {
    const input = ensureCycleField();
    if (!input || document.activeElement === input || syncing) {
      return;
    }
    syncing = true;
    try {
      const state = await readState();
      const parts = calendarParts(state.currentDay || 1);
      input.value = String(parts.cycle);
    } catch (error) {
      // Keep the visible value if the server is briefly unreachable.
    } finally {
      syncing = false;
    }
  }

  function bindDateForm() {
    const form = document.querySelector("#dayForm");
    if (!form || bound) {
      return;
    }
    bound = true;
    form.addEventListener("submit", async (event) => {
      const cycleInput = ensureCycleField();
      if (!cycleInput) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();

      const dayInput = document.querySelector("#currentDayInput");
      const monthInput = document.querySelector("#currentMonthInput");
      const dayOfMonth = clamp(Number.parseInt(dayInput?.value, 10) || 1, 1, DAYS_PER_MONTH);
      const monthIndex = clamp(Number.parseInt(monthInput?.value, 10) || 0, 0, MONTHS_PER_YEAR - 1);
      const cycle = clamp(Number.parseInt(cycleInput.value, 10) || 1, 1, 999);

      try {
        const state = await readState();
        state.currentDay = getAbsoluteDay(dayOfMonth, monthIndex, cycle);
        state.autoProcessRecurring = true;
        await writeState(state);
        if (typeof window.showToast === "function") {
          window.showToast(`Data da campanha atualizada para ciclo ${cycle}.`);
        }
        window.location.reload();
      } catch (error) {
        console.error("Falha ao salvar ciclo da campanha", error);
        if (typeof window.showToast === "function") {
          window.showToast("Falha ao salvar a data da campanha.");
        }
      }
    }, true);
  }

  function injectStyles() {
    if (document.querySelector("#dateCyclePatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "dateCyclePatchStyles";
    style.textContent = `
      .cycle-field-wrap {
        display: inline-flex;
        min-width: 96px;
      }
      .cycle-field-label {
        display: grid;
        gap: 6px;
        color: var(--muted, rgba(255, 247, 224, .72));
        font-size: .82rem;
        font-weight: 800;
      }
      #currentCycleInput {
        width: 96px;
      }
      .settings-date-panel .day-control {
        align-items: end;
      }
    `;
    document.head.appendChild(style);
  }

  function applyAll() {
    injectStyles();
    ensureCycleField();
    bindDateForm();
    syncCycleValue();
  }

  function startObserver() {
    if (observerStarted || !document.body) {
      return;
    }
    observerStarted = true;
    const observer = new MutationObserver(() => applyAll());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    startObserver();
  });
}());
