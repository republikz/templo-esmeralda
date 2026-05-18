"use strict";

const STORAGE_KEY = "pf2e-base-manager-v1";
const SESSION_KEY = "pf2e-base-manager-session-v1";
const STATE_API_URL = "/api/state";
const SEED_STATE_URL = "./campaign-state.json";
const AON_BASE_URL = "https://2e.aonprd.com";
const CALENDAR_MONTHS = ["Verão", "Outono", "Caos", "Inverno", "Primavera"];
const DAYS_PER_MONTH = 72;
const DAYS_PER_YEAR = CALENDAR_MONTHS.length * DAYS_PER_MONTH;

const viewTitles = {
  dashboard: "Início",
  rooms: "Salas especiais",
  npcs: "NPCs da base",
  finance: "Finanças da base",
  calendar: "Calendário",
  campfire: "Fogueira dos Heróis",
  journey: "Jornada",
  market: "Mercado Esmeralda",
  settings: "Configurações"
};

const campfireGoalCategories = {
  short: "Curto Prazo",
  medium: "Médio Prazo",
  long: "Longo Prazo"
};

const rarityRank = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Unique: 4
};

const userRoles = {
  admin: "admin",
  player: "player"
};

const CANONICAL_MASTER = {
  id: "user-gabriel-vieira",
  name: "Gabriel Vieira",
  role: userRoles.admin,
  pin: "310898"
};

let activeView = "dashboard";
let catalog = [];
let catalogLoaded = false;
let state = freshState();
let sessionUserId = null;
let authReady = false;
let toastTimer = null;
let syncTimer = null;
let syncInFlight = false;
let lastPermissionKey = "";
let selectedJourneyEntryId = "";
let journeyModalEditId = "";
let lastSyncedRevision = 0;
let lastSyncedStateSnapshot = null;

const renderCache = {
  calendarEntries: { key: "", value: [] },
  dueSources: { key: "", value: [] },
  combinedMarket: { key: "", value: [] },
  dashboardCalendarHtml: { key: "", value: "" },
  dashboardMarketHtml: { key: "", value: "" },
  recentLedgerHtml: { key: "", value: "" },
  roomsHtml: { key: "", value: "" },
  npcsHtml: { key: "", value: "" },
  financeSourcesHtml: { key: "", value: "" },
  ledgerRowsHtml: { key: "", value: "" },
  calendarSummaryHtml: { key: "", value: "" },
  calendarMonthsHtml: { key: "", value: "" },
  campfireBoardHtml: { key: "", value: "" },
  campfireGalleryHtml: { key: "", value: "" },
  journeyGalleryHtml: { key: "", value: "" },
  journeyDetailHtml: { key: "", value: "" },
  marketCategoryHtml: { key: "", value: "" },
  marketStatusHtml: { key: "", value: "" },
  marketSectionHtml: {
    permanent: { key: "", value: "" },
    consumable: { key: "", value: "" }
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function getCacheKey(...parts) {
  return parts.map((part) => String(part ?? "")).join("|");
}

function getCachedValue(cacheEntry, key, factory) {
  if (cacheEntry.key === key) {
    return cacheEntry.value;
  }
  const value = factory();
  cacheEntry.key = key;
  cacheEntry.value = value;
  return value;
}

function setHtmlIfChanged(element, html) {
  if (!element || element.__codexHtml === html) {
    return;
  }
  element.__codexHtml = html;
  element.innerHTML = html;
}

function debounce(fn, delay = 80) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  const hashView = window.location.hash.replace("#", "");
  if (viewTitles[hashView]) {
    activeView = hashView;
  }
  bindEvents();
  initializeDateSelects();
  initializeComposerState();
  state = await loadSharedState();
  setSyncedStateBaseline(state);
  restoreSession();
  populateStaticForms();
  applyActiveViewState();
  applyAuthState();
  render();
  startStateSync();
  loadCatalog();
}

function getActiveUser() {
  const users = Array.isArray(state.users) && state.users.length ? state.users : freshState().users;
  return users.find((user) => user.id === sessionUserId) || users[0];
}

function getActiveUserId() {
  return sessionUserId || state.activeUserId || null;
}

function isAuthenticated() {
  return Boolean(sessionUserId && state.users.some((user) => user.id === sessionUserId));
}

function isAdmin() {
  return isAuthenticated() && getActiveUser().role === userRoles.admin;
}

function canAccessView(view) {
  if (view === "settings") {
    return isAdmin();
  }
  return true;
}

function setActiveUser(userId) {
  const nextUser = state.users.find((user) => user.id === userId);
  if (!nextUser) {
    return false;
  }
  sessionUserId = nextUser.id;
  state.activeUserId = nextUser.id;
  saveSession();
  applyAuthState();
  renderPermissions();
  render();
  showToast(`Perfil ativo: ${nextUser.name}.`);
  return true;
}

function bindEvents() {
  const sidebarToggle = $("#sidebarToggle");
  if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);
  const logoutButton = $("#logoutButton");
  if (logoutButton) logoutButton.addEventListener("click", logout);
  const newHeroButton = $("#newCampfireHeroButton");
  if (newHeroButton) newHeroButton.addEventListener("click", openNewCampfireHeroForm);
  const refreshRooms = debounce(renderRooms, 80);
  const refreshNpcs = debounce(renderNpcs, 80);
  const refreshMarket = debounce(renderMarket, 80);

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });

  $("#dayForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const nextDay = getAbsoluteDayFromInputs("currentDayInput", "currentMonthInput", (Number.parseInt($("#currentCycleInput")?.value, 10) || (getCampaignYear(state.currentDay) + 1)) - 1);
    state.currentDay = nextDay;
    settleAllDue({ silent: true, system: true });
    autoRestockIfDue();
    saveState();
    render();
    showToast(`Data da campanha atualizada para ${formatCalendarDate(nextDay)}.`);
  });

  $("#roomForm").addEventListener("submit", saveRoom);
  $("#toggleRoomComposer").addEventListener("click", () => toggleComposer("room"));
  $("#cancelRoomEdit").addEventListener("click", () => {
    clearRoomForm();
    toggleComposer("room", false);
  });
  $("#clearRoomImage").addEventListener("click", clearRoomImage);
  $("#roomImageUpload").addEventListener("change", (event) => handleImageUpload(event, "roomImageData", "roomImagePreview"));
  $("#roomSearch").addEventListener("input", refreshRooms);
  $("#roomFilter").addEventListener("change", renderRooms);
  $("#roomList").addEventListener("click", handleRoomAction);

  $("#npcForm").addEventListener("submit", saveNpc);
  $("#toggleNpcComposer").addEventListener("click", () => toggleComposer("npc"));
  $("#cancelNpcEdit").addEventListener("click", () => {
    clearNpcForm();
    toggleComposer("npc", false);
  });
  $("#clearNpcImage").addEventListener("click", clearNpcImage);
  $("#npcImageUpload").addEventListener("change", (event) => handleImageUpload(event, "npcImage", "npcImagePreview"));
  $("#npcSearch").addEventListener("input", refreshNpcs);
  $("#npcRoleFilter").addEventListener("change", renderNpcs);
  $("#npcSort").addEventListener("change", renderNpcs);
  $("#npcList").addEventListener("click", handleNpcAction);

  $("#sourceForm").addEventListener("submit", saveSource);
  $("#toggleSourceComposer").addEventListener("click", () => toggleComposer("source"));
  $("#cancelSourceEdit").addEventListener("click", () => {
    clearSourceForm();
    toggleComposer("source", false);
  });
  $("#sourceList").addEventListener("click", handleSourceAction);
  $("#financeDueList")?.addEventListener("click", handleDueAction);
  $("#settleAllFinance")?.addEventListener("click", settleAllDue);
  $("#settleAllDashboard")?.addEventListener("click", settleAllDue);
  $("#processRecurringCalendar")?.addEventListener("click", settleAllDue);
  $("#autoProcessRecurring")?.addEventListener("change", (event) => {
    state.autoProcessRecurring = event.target.checked;
    if (state.autoProcessRecurring) {
      settleAllDue({ silent: true });
    }
    saveState();
    render();
    showToast(state.autoProcessRecurring ? "Processamento automático ativado." : "Processamento automático desativado.");
  });

  $("#eventForm").addEventListener("submit", saveCalendarEvent);
  $("#toggleEventComposer").addEventListener("click", () => toggleComposer("event"));
  $("#cancelEventEdit").addEventListener("click", () => {
    clearEventForm();
    toggleComposer("event", false);
  });
  $("#calendarMonths").addEventListener("click", handleCalendarAction);

  $("#ledgerForm").addEventListener("submit", saveLedgerEntry);
  $("#ledgerTable").addEventListener("click", handleLedgerAction);

  $("#generateMarket").addEventListener("click", () => {
    if (generateMarketStock()) {
      saveState();
      render();
      showToast("Estoque dos mercadores atualizado.");
    }
  });
  $("#refreshMarketDashboard").addEventListener("click", () => {
    if (generateMarketStock()) {
      saveState();
      render();
      showToast("Mercado atualizado no painel.");
    }
  });
  $("#rerollMarket").addEventListener("click", () => {
    if (generateMarketStock({ reroll: true })) {
      saveState();
      render();
      showToast("Nova variação de estoque gerada.");
    }
  });
  $("#marketSettingsForm").addEventListener("submit", saveMarketSettings);
  $("#marketSearch").addEventListener("input", refreshMarket);
  $("#marketRarityFilter").addEventListener("change", renderMarket);
  $("#marketCategoryFilter").addEventListener("change", renderMarket);
  $("#marketSort").addEventListener("change", renderMarket);

  $("#financeBalanceForm").addEventListener("submit", saveFinanceBalance);
  $("#toggleFinanceBalanceForm").addEventListener("click", () => toggleFinanceBalanceEditor(true));
  $("#cancelFinanceBalance").addEventListener("click", () => toggleFinanceBalanceEditor(false));
  $("#authForm").addEventListener("submit", handleAccessSubmit);

  $("#campfireHeroForm")?.addEventListener("submit", saveCampfireHero);
  $("#toggleCampfireComposer")?.addEventListener("click", () => toggleComposer("campfire"));
  $("#cancelCampfireHero")?.addEventListener("click", clearCampfireHeroForm);
  $("#campfireHeroImageUpload")?.addEventListener("change", (event) => handleImageUpload(event, "campfireHeroImage", "campfireHeroImagePreview"));
  $("#clearCampfireHeroImage")?.addEventListener("click", clearCampfireHeroImage);
  $("#campfireGoalForm")?.addEventListener("submit", saveCampfireGoal);
  $("#cancelCampfireGoalEdit")?.addEventListener("click", clearCampfireGoalForm);
  $("#campfireLegionForm")?.addEventListener("submit", saveCampfireLegionNotes);
  $("#campfireOwnGoals")?.addEventListener("click", handleCampfireAction);
  $("#campfireGallery")?.addEventListener("click", handleCampfireAction);

  $("#journeyForm")?.addEventListener("submit", saveJourneyEntry);
  $("#toggleJourneyComposer")?.addEventListener("click", () => toggleComposer("journey"));
  $("#cancelJourneyEdit")?.addEventListener("click", () => {
    clearJourneyForm();
    toggleComposer("journey", false);
  });
  $("#journeyImageUpload")?.addEventListener("change", (event) => handleImageUpload(event, "journeyImage", "journeyImagePreview"));
  $("#clearJourneyImage")?.addEventListener("click", clearJourneyImage);
  $("#journeySearch")?.addEventListener("input", debounce(renderJourney, 80));
  $("#journeySort")?.addEventListener("change", renderJourney);
  $("#journeyGallery")?.addEventListener("click", handleJourneyAction);
  $("#journeyModal")?.addEventListener("click", handleJourneyAction);
  $("#journeyDetail")?.addEventListener("click", handleJourneyAction);
  $("#journeyDetail")?.addEventListener("change", handleJourneyDetailChange);
  $("#journeyDetail")?.addEventListener("submit", saveJourneyModalEdit);
  $("#journeyDetail")?.addEventListener("submit", handleJourneyCommentSubmit);
  document.addEventListener("keydown", handleJourneyKeydown);

  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#exportData").addEventListener("click", exportData);
  $("#importForm").addEventListener("submit", importData);
  $("#resetData").addEventListener("click", resetData);
  $("#userForm").addEventListener("submit", saveUser);
  $("#cancelUserEdit").addEventListener("click", clearUserForm);
  $("#userList").addEventListener("click", handleUserAction);
}

function initializeDateSelects() {
  [
    "currentMonthInput",
    "sourceStartMonth",
    "sourceLastMonth",
    "ledgerMonth",
    "eventMonth"
  ].forEach((id) => {
    const select = $(`#${id}`);
    if (!select) {
      return;
    }
    select.innerHTML = CALENDAR_MONTHS
      .map((month, index) => `<option value="${index}">${month}</option>`)
      .join("");
  });
}

function initializeComposerState() {
  ["room", "npc", "source", "event", "campfire", "journey"].forEach((name) => toggleComposer(name, false, { silent: true }));
}

function toggleComposer(name, forceOpen, options = {}) {
  const body = $(`#${name}ComposerBody`);
  const button = $(`#toggle${capitalize(name)}Composer`);
  if (!body || !button) {
    return;
  }
  const isOpen = body.hidden === false;
  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
  body.hidden = !nextOpen;
  const panel = name === "journey" ? $("#journeyEditorPanel") : null;
  if (panel) {
    panel.hidden = !nextOpen;
  }
  button.textContent = nextOpen ? "Fechar" : "Adicionar";
  if (!options.silent && nextOpen) {
    body.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function loadCatalog() {
  const notice = $("#catalogNotice");
  try {
    const response = await fetch("table-data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawCatalog = await response.json();
    catalog = rawCatalog
      .map(normalizeCatalogItem)
      .filter((item) => item.level >= 1 && item.level <= 14 && item.priceCopper > 0);
    catalogLoaded = true;
    notice.hidden = true;
    autoRestockIfDue();
    saveState();
    render();
  } catch (error) {
    catalogLoaded = false;
    notice.hidden = false;
    notice.textContent = "Catálogo de itens não encontrado. Coloque table-data.json junto ao index.html e abra pelo servidor local.";
    renderMarket();
  }
}

function freshState() {
  const roomTavernId = createId("room");
  const maeraId = createId("npc");
  const dornId = createId("npc");
  const masterUserId = createId("user");
  const masterHeroId = createId("hero");
  const guestHeroId = createId("hero");
  return {
    version: 1,
    currentDay: 1,
    startingBalanceCopper: gpToCopper(200),
    revision: 1,
    updatedAt: Date.now(),
    deletedRecords: [],
    activeUserId: null,
    users: [
      {
        id: masterUserId,
        name: "Gabriel Vieira",
        role: userRoles.admin,
        pin: "310898",
        createdAt: Date.now()
      }
    ],
    rooms: [
      {
        id: roomTavernId,
        name: "Taverna do Pórtico",
        type: "Taverna",
        status: "Ativa",
        image: "",
        bonus: "Receita recorrente a cada 30 dias. Pode servir como ponto de rumores, contratos e contatos locais.",
        usage: "Usada para hospedagem, refeições, pequenos encontros e negociações discretas.",
        description: "Um salão de pedra escura com balcão de madeira polida, sempre aquecido por braseiros baixos.",
        updatedAt: Date.now()
      },
      {
        id: createId("room"),
        name: "Oficina Arcana",
        type: "Oficina",
        status: "Ativa",
        image: "",
        bonus: "Facilita reparos, identificação de itens mágicos e preparação de projetos de criação.",
        usage: "Reservada para artesãos, magos aliados e manutenção de equipamentos incomuns.",
        description: "Bancadas estreitas, cristais de foco, ferramentas gravadas e um cofre para componentes raros.",
        updatedAt: Date.now()
      },
      {
        id: createId("room"),
        name: "Enfermaria da Guarda",
        type: "Suporte",
        status: "Em construção",
        image: "",
        bonus: "Quando concluída, pode reduzir custos narrativos de recuperação e manter suprimentos médicos.",
        usage: "Tratamento de feridos, repouso supervisionado e armazenamento de antídotos.",
        description: "Uma ala limpa e fria, com leitos simples e armários ainda vazios.",
        updatedAt: Date.now()
      }
    ],
    npcs: [
      {
        id: maeraId,
        name: "Maera Vela-Baixa",
        image: "",
        role: "Estalajadeira",
        tags: "comércio, rumores",
        summary: "Cuida da taverna e conhece quase todo viajante que passa pela região.",
        description: "Maera é pragmática, cordial e raramente esquece uma dívida.",
        financeType: "none",
        financeAmountCopper: 0,
        updatedAt: Date.now()
      },
      {
        id: dornId,
        name: "Dorn Calafrio",
        image: "",
        role: "Guarda",
        tags: "segurança, patrulha",
        summary: "Veterano contratado para organizar turnos de vigia e treinamento básico.",
        description: "Fala pouco, observa muito e mantém uma lista de pontos fracos da muralha.",
        financeType: "expense",
        financeAmountCopper: gpToCopper(8),
        updatedAt: Date.now()
      }
    ],
    financeSources: [
      {
        id: createId("source"),
        name: "Taverna do Pórtico",
        kind: "tavern",
        type: "income",
        amountCopper: gpToCopper(35),
        intervalDays: 30,
        startDay: 30,
        lastProcessedDay: 0,
        active: true,
        note: "Receita líquida estimada da taverna.",
        linkedNpcId: "",
        updatedAt: Date.now()
      },
      {
        id: createId("source"),
        name: "NPC: Dorn Calafrio",
        kind: "npc",
        type: "expense",
        amountCopper: gpToCopper(8),
        intervalDays: 30,
        startDay: 30,
        lastProcessedDay: 0,
        active: true,
        note: "Veterano contratado para organizar turnos de vigia e treinamento básico.",
        linkedNpcId: dornId,
        updatedAt: Date.now()
      },
      {
        id: createId("source"),
        name: "Manutenção da base",
        kind: "building",
        type: "expense",
        amountCopper: gpToCopper(12),
        intervalDays: 30,
        startDay: 30,
        lastProcessedDay: 0,
        active: true,
        note: "Suprimentos, reparos, salários menores e despesas gerais.",
        linkedNpcId: "",
        updatedAt: Date.now()
      }
    ],
    ledger: [],
    events: [],
    autoProcessRecurring: false,
    campfire: {
      legionNotes: "A chama do grupo ainda está sendo escrita. Guardem promessas, rastros e pactos que merecem voltar à mesa.",
      heroes: [
        {
        id: masterHeroId,
        ownerUserId: masterUserId,
        ownerName: "Gabriel Vieira",
        characterName: "Iril Vantor",
          image: "",
          updatedAt: Date.now(),
          goals: [
            {
              id: createId("goal"),
              category: "short",
              text: "Recuperar o mapa queimado das ruínas do salão leste.",
              secret: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            },
            {
              id: createId("goal"),
              category: "medium",
              text: "Convencer um aliado improvável a jurar lealdade à base.",
              secret: true,
              createdAt: Date.now(),
              updatedAt: Date.now()
            },
            {
              id: createId("goal"),
              category: "long",
              text: "Reerguer um círculo de proteção que faça a fortaleza respirar magia novamente.",
              secret: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ]
        },
        {
          id: guestHeroId,
          ownerUserId: "",
          ownerName: "Arquivo da Fogueira",
          characterName: "Lira Candelária",
          image: "",
          updatedAt: Date.now(),
          goals: [
            {
              id: createId("goal"),
              category: "short",
              text: "Descobrir quem tem deixado marcas nas portas durante a noite.",
              secret: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            },
            {
              id: createId("goal"),
              category: "medium",
              text: "Abrir uma rota segura até o refúgio das colinas de vidro.",
              secret: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ]
        }
      ]
    },
    journey: {
      entries: []
    },
    market: {
      permanentCount: 14,
      consumableCount: 10,
      allowedRarities: ["Common", "Uncommon", "Rare"],
      lastRestockDay: 0,
      nonce: 0,
      stock: {
        permanent: [],
        consumable: []
      }
    }
  };
}

async function loadSeedState() {
  try {
    const response = await fetch(SEED_STATE_URL, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }
    return normalizeState(JSON.parse(text));
  } catch (error) {
    return null;
  }
}

function hasCanonicalAdmin(users) {
  return Array.isArray(users)
    && users.some((user) => user.role === userRoles.admin
      && normalizeAccessName(user.name) === normalizeAccessName("Gabriel Vieira")
      && String(user.pin || "") === "310898");
}


function shouldBootstrapFromSeed(remoteState, seedState) {
  if (hasMeaningfulState(remoteState)) {
    return false;
  }
  return Boolean(seedState && hasMeaningfulState(seedState));
}

async function loadSharedState() {
  const fallback = loadLocalState();
  const seed = await loadSeedState();
  try {
    const response = await fetch(STATE_API_URL, { cache: "no-store" });
    if (response.ok) {
      const text = await response.text();
      if (text.trim()) {
        const remote = normalizeState(JSON.parse(text));
        if (hasMeaningfulState(remote)) {
          if (shouldBootstrapFromSeed(remote, seed)) {
            const canonical = seed || fallback;
            saveLocalState(canonical);
            void saveState(canonical);
            return canonical;
          }
          if (!hasCanonicalAdmin(JSON.parse(text).users)) {
            void saveState(remote);
          }
          saveLocalState(remote);
          return remote;
        }
      }
    }
  } catch (error) {
    // fallback below
  }

  if (seed && hasMeaningfulState(seed)) {
    saveLocalState(seed);
    void saveState(seed);
    return seed;
  }

  if (hasMeaningfulState(fallback)) {
    void saveState(fallback);
    return fallback;
  }

  const fresh = freshState();
  saveLocalState(fresh);
  void saveState(fresh);
  return fresh;
}

function loadLocalState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return freshState();
    }
    return normalizeState(JSON.parse(saved));
  } catch (error) {
    return freshState();
  }
}

function normalizeState(value) {
  const fallback = freshState();
  const data = value && typeof value === "object" ? value : {};
  const normalizedUsers = Array.isArray(data.users) && data.users.length
    ? data.users.map(normalizeUser)
    : fallback.users;
  const users = ensureCanonicalUsers(normalizedUsers);
  const activeUserId = users.some((user) => user.id === data.activeUserId)
    ? data.activeUserId
    : null;
  const normalized = {
    version: 1,
    currentDay: Math.max(1, Number.parseInt(data.currentDay, 10) || fallback.currentDay),
    startingBalanceCopper: toSafeCopper(data.startingBalanceCopper, fallback.startingBalanceCopper),
    revision: Math.max(0, Number.parseInt(data.revision, 10) || fallback.revision || 0),
    updatedAt: Number(data.updatedAt) || fallback.updatedAt || Date.now(),
    deletedRecords: Array.isArray(data.deletedRecords) ? data.deletedRecords.map(normalizeDeletedRecord).filter(Boolean).slice(-500) : [],
    activeUserId,
    users,
    rooms: Array.isArray(data.rooms) ? data.rooms.map(normalizeRoom) : fallback.rooms,
    npcs: Array.isArray(data.npcs) ? data.npcs.map(normalizeNpc) : fallback.npcs,
    financeSources: Array.isArray(data.financeSources) ? data.financeSources.map(normalizeSource) : fallback.financeSources,
    ledger: Array.isArray(data.ledger) ? data.ledger.map(normalizeLedgerEntry) : fallback.ledger,
    events: Array.isArray(data.events) ? data.events.map(normalizeCalendarEvent) : fallback.events,
    autoProcessRecurring: data.autoProcessRecurring === true,
    campfire: normalizeCampfire(data.campfire || fallback.campfire, users),
    journey: normalizeJourney(data.journey || fallback.journey, users),
    market: normalizeMarket(data.market || fallback.market)
  };
  return repairNpcFinanceSources(normalized);
}

function hasMeaningfulState(value) {
  return Boolean(value)
    && Array.isArray(value.rooms)
    && Array.isArray(value.npcs)
    && Array.isArray(value.financeSources)
    && Array.isArray(value.users);
}

function normalizeUser(user) {
  const role = user?.role === userRoles.admin ? userRoles.admin : userRoles.player;
  return {
    id: user?.id || createId("user"),
    name: user?.name?.trim() || (role === userRoles.admin ? "Gabriel Vieira" : "Jogador"),
    role,
    pin: String(role === userRoles.admin ? (user?.pin || "310898") : (user?.pin || "")),
    createdAt: Number(user?.createdAt) || Date.now(),
    updatedAt: Number(user?.updatedAt) || Number(user?.createdAt) || Date.now()
  };
}

function normalizeDeletedRecord(record) {
  const type = String(record?.type || "").trim();
  const id = String(record?.id || "").trim();
  if (!type || !id) {
    return null;
  }
  return {
    type,
    id,
    deletedAt: Number(record?.deletedAt) || Date.now()
  };
}


function ensureCanonicalUsers(users) {
  const source = Array.isArray(users) && users.length ? users : [CANONICAL_MASTER];
  const seen = new Set();
  const cleaned = [];

  source.map(normalizeUser).forEach((user) => {
    const nameKey = normalizeAccessName(user.name);
    if (!nameKey || seen.has(nameKey)) {
      return;
    }
    seen.add(nameKey);
    cleaned.push(user);
  });

  const masterNameKey = normalizeAccessName(CANONICAL_MASTER.name);
  const master = cleaned.find((user) => normalizeAccessName(user.name) === masterNameKey);
  if (master) {
    master.name = CANONICAL_MASTER.name;
    master.role = userRoles.admin;
    master.pin = CANONICAL_MASTER.pin;
  } else {
    cleaned.unshift({
      ...CANONICAL_MASTER,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  return cleaned.length ? cleaned : [{
    ...CANONICAL_MASTER,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }];
}
function normalizeRoom(room) {
  return {
    id: room.id || createId("room"),
    name: room.name || "Sala sem nome",
    type: room.type || "",
    status: room.status || "Ativa",
    image: room.image || "",
    bonus: room.bonus || "",
    usage: room.usage || "",
    description: room.description || "",
    updatedAt: Number(room.updatedAt) || Date.now()
  };
}

function normalizeNpc(npc) {
  return {
    id: npc.id || createId("npc"),
    name: npc.name || "NPC sem nome",
    image: npc.image || "",
    role: npc.role || "",
    tags: npc.tags || "",
    summary: npc.summary || "",
    description: npc.description || "",
    financeType: ["income", "expense", "none"].includes(npc.financeType) ? npc.financeType : "none",
    financeAmountCopper: toSafeCopper(npc.financeAmountCopper, 0),
    updatedAt: Number(npc.updatedAt) || Date.now()
  };
}

function normalizeSource(source) {
  return {
    id: source.id || createId("source"),
    name: source.name || "Contrato sem nome",
    kind: source.kind || "other",
    type: source.type === "expense" ? "expense" : "income",
    amountCopper: toSafeCopper(source.amountCopper, 0),
    intervalDays: Math.max(1, Number.parseInt(source.intervalDays, 10) || 30),
    startDay: Math.max(1, Number.parseInt(source.startDay, 10) || Number.parseInt(source.intervalDays, 10) || 30),
    lastProcessedDay: Math.max(0, Number.parseInt(source.lastProcessedDay, 10) || 0),
    active: source.active !== false,
    note: source.note || "",
    linkedNpcId: source.linkedNpcId || "",
    updatedAt: Number(source.updatedAt) || Date.now()
  };
}

function normalizeLedgerEntry(entry) {
  return {
    id: entry.id || createId("ledger"),
    day: Math.max(1, Number.parseInt(entry.day, 10) || 1),
    name: entry.name || "Lançamento",
    type: entry.type === "expense" ? "expense" : "income",
    amountCopper: toSafeCopper(entry.amountCopper, 0),
    sourceId: entry.sourceId || "",
    note: entry.note || "",
    createdAt: Number(entry.createdAt) || Date.now()
  };
}

function normalizeCalendarEvent(event) {
  return {
    id: event.id || createId("event"),
    title: event.title || "Evento",
    type: ["event", "session", "quest", "warning"].includes(event.type) ? event.type : "event",
    day: Math.max(1, Number.parseInt(event.day, 10) || 1),
    description: event.description || "",
    createdAt: Number(event.createdAt) || Date.now()
  };
}

function normalizeCampfire(campfire, users) {
  const source = campfire && typeof campfire === "object" ? campfire : {};
  const userLookup = new Map((Array.isArray(users) ? users : []).map((user) => [user.id, user]));
  return {
    legionNotes: String(source.legionNotes || "").trim() || "Anotações livres do Minimus Legio.",
    heroes: Array.isArray(source.heroes) ? source.heroes.map((hero) => normalizeCampfireHero(hero, userLookup)) : []
  };
}

function normalizeCampfireHero(hero, userLookup) {
  const ownerUserId = hero?.ownerUserId || "";
  const owner = ownerUserId ? userLookup.get(ownerUserId) : null;
  return {
    id: hero?.id || createId("hero"),
    ownerUserId,
    ownerName: hero?.ownerName?.trim() || owner?.name || (ownerUserId ? "Jogador" : "Exemplo da mesa"),
    characterName: hero?.characterName?.trim() || "Personagem sem nome",
    image: hero?.image || "",
    updatedAt: Number(hero?.updatedAt) || Date.now(),
    goals: Array.isArray(hero?.goals) ? hero.goals.map(normalizeCampfireGoal) : []
  };
}

function normalizeCampfireGoal(goal) {
  const category = ["short", "medium", "long"].includes(goal?.category) ? goal.category : "short";
  return {
    id: goal?.id || createId("goal"),
    category,
    text: goal?.text?.trim() || "Objetivo sem texto.",
    secret: goal?.secret === true,
    createdAt: Number(goal?.createdAt) || Date.now(),
    updatedAt: Number(goal?.updatedAt) || Date.now()
  };
}

function normalizeJourney(journey, users) {
  const source = journey && typeof journey === "object" ? journey : {};
  const userLookup = new Map((Array.isArray(users) ? users : []).map((user) => [user.id, user]));
  return {
    entries: Array.isArray(source.entries) ? source.entries.map((entry) => normalizeJourneyEntry(entry, userLookup)) : []
  };
}

function normalizeJourneyEntry(entry, userLookup) {
  const createdByUserId = entry?.createdByUserId || "";
  const creator = createdByUserId ? userLookup.get(createdByUserId) : null;
  return {
    id: entry?.id || createId("journey"),
    title: String(entry?.title || "").trim() || "Lembrança sem título",
    level: normalizeJourneyLevel(entry?.level),
    image: entry?.image || "",
    description: String(entry?.description || "").trim(),
    createdByUserId,
    createdByName: entry?.createdByName?.trim() || creator?.name || "Mesa",
    createdAt: Number(entry?.createdAt) || Date.now(),
    updatedAt: Number(entry?.updatedAt) || Date.now(),
    comments: Array.isArray(entry?.comments) ? entry.comments.map((comment) => normalizeJourneyComment(comment, userLookup)) : []
  };
}

function normalizeJourneyComment(comment, userLookup) {
  const userId = comment?.userId || "";
  const user = userId ? userLookup.get(userId) : null;
  return {
    id: comment?.id || createId("journey-comment"),
    text: String(comment?.text || "").trim() || "Comentário vazio.",
    userId,
    userName: comment?.userName?.trim() || user?.name || "Viajante",
    heroId: comment?.heroId || "",
    heroName: comment?.heroName?.trim() || "",
    createdAt: Number(comment?.createdAt) || Date.now()
  };
}

function normalizeJourneyLevel(level) {
  const value = String(level ?? "").trim();
  return value || "?";
}

function normalizeMarket(market) {
  const source = market && typeof market === "object" ? market : {};
  const rarities = Array.isArray(source.allowedRarities) && source.allowedRarities.length
    ? source.allowedRarities.filter((rarity) => rarityRank[rarity])
    : ["Common", "Uncommon", "Rare"];
  const stock = normalizeMarketStock(source.stock);
  return {
    permanentCount: clamp(Number.parseInt(source.permanentCount ?? source.regularCount, 10) || 14, 4, 60),
    consumableCount: clamp(Number.parseInt(source.consumableCount ?? source.premiumCount, 10) || 10, 4, 60),
    allowedRarities: rarities.length ? rarities : ["Common", "Uncommon", "Rare"],
    lastRestockDay: Math.max(0, Number.parseInt(source.lastRestockDay, 10) || 0),
    nonce: Math.max(0, Number.parseInt(source.nonce, 10) || 0),
    stock
  };
}

function normalizeMarketStock(stock) {
  if (Array.isArray(stock)) {
    return migrateLegacyMarketStock(stock);
  }
  const source = stock && typeof stock === "object" ? stock : {};
  return {
    permanent: Array.isArray(source.permanent) ? source.permanent.map(normalizeStockEntry) : [],
    consumable: Array.isArray(source.consumable) ? source.consumable.map(normalizeStockEntry) : []
  };
}

function migrateLegacyMarketStock(entries) {
  const normalized = { permanent: [], consumable: [] };
  entries.map(normalizeStockEntry).forEach((item) => {
    const bucket = isConsumableCatalogItem(item) ? "consumable" : "permanent";
    normalized[bucket].push(item);
  });
  return normalized;
}

function repairNpcFinanceSources(data) {
  const npcIds = new Set(data.npcs.map((npc) => npc.id));
  data.financeSources = data.financeSources.filter((source) => !source.linkedNpcId || npcIds.has(source.linkedNpcId));

  data.npcs.forEach((npc) => {
    const existingIndex = data.financeSources.findIndex((source) => source.linkedNpcId === npc.id);
    if (npc.financeType === "none" || npc.financeAmountCopper <= 0) {
      if (existingIndex >= 0) {
        data.financeSources.splice(existingIndex, 1);
      }
      return;
    }

    const payload = {
      id: existingIndex >= 0 ? data.financeSources[existingIndex].id : createId("source"),
      name: `NPC: ${npc.name}`,
      kind: "npc",
      type: npc.financeType,
      amountCopper: npc.financeAmountCopper,
      intervalDays: 30,
      startDay: existingIndex >= 0 ? data.financeSources[existingIndex].startDay : data.currentDay,
      lastProcessedDay: existingIndex >= 0 ? data.financeSources[existingIndex].lastProcessedDay : (data.currentDay <= 1 ? 0 : data.currentDay),
      active: existingIndex >= 0 ? data.financeSources[existingIndex].active : true,
      note: npc.summary || "",
      linkedNpcId: npc.id,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      data.financeSources[existingIndex] = payload;
    } else {
      data.financeSources.push(payload);
    }
  });

  return data;
}

function normalizeStockEntry(item) {
  return {
    stockId: item.stockId || createId("stock"),
    name: item.name || "Item",
    level: Number.parseInt(item.level, 10) || 0,
    rarity: item.rarity || "Common",
    category: item.category || "",
    subcategory: item.subcategory || "",
    trait: item.trait || "",
    url: item.url || "",
    normalCopper: toSafeCopper(item.normalCopper, 0),
    merchantCopper: toSafeCopper(item.merchantCopper, 0),
    adjustmentPercent: Number.parseInt(item.adjustmentPercent, 10) || 0,
    stockType: item.stockType === "premium" ? "premium" : "regular",
    section: item.section === "consumable" ? "consumable" : "permanent"
  };
}

function saveLocalState(nextState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    // ignore local cache failures
  }
}

function getSavableStateSnapshot(nextState) {
  const snapshot = JSON.parse(JSON.stringify(nextState || {}));
  delete snapshot.activeUserId;
  delete snapshot._baseRevision;
  delete snapshot._changedFields;
  return snapshot;
}

function setSyncedStateBaseline(nextState) {
  lastSyncedRevision = Number(nextState?.revision) || 0;
  lastSyncedStateSnapshot = getSavableStateSnapshot(nextState);
}

function changedSinceBaseline(nextState, field) {
  if (!lastSyncedStateSnapshot) {
    return true;
  }
  return JSON.stringify(nextState?.[field]) !== JSON.stringify(lastSyncedStateSnapshot?.[field]);
}

function getChangedFieldsForSave(nextState) {
  const fields = [];
  ["currentDay", "startingBalanceCopper", "autoProcessRecurring", "market"].forEach((field) => {
    if (changedSinceBaseline(nextState, field)) {
      fields.push(field);
    }
  });
  const nextNotes = nextState?.campfire?.legionNotes || "";
  const baseNotes = lastSyncedStateSnapshot?.campfire?.legionNotes || "";
  if (!lastSyncedStateSnapshot || nextNotes !== baseNotes) {
    fields.push("campfire.legionNotes");
  }
  return fields;
}

function addDeletedRecord(type, id, deletedAt = Date.now()) {
  if (!type || !id) {
    return;
  }
  const records = Array.isArray(state.deletedRecords) ? state.deletedRecords : [];
  state.deletedRecords = records
    .filter((record) => !(record.type === type && record.id === id))
    .concat({ type, id, deletedAt })
    .slice(-500);
}


let saveTimer = null;
let saveInFlight = false;
let pendingPayload = null;
let lastSaveFailed = false;

function saveState(nextState = state, options = {}) {
  nextState.revision = (Number(nextState.revision) || 0) + 1;
  nextState.updatedAt = Date.now();
  const payloadState = { ...nextState };
  payloadState.deletedRecords = Array.isArray(payloadState.deletedRecords) ? payloadState.deletedRecords.slice(-500) : [];
  payloadState._baseRevision = lastSyncedRevision;
  payloadState._changedFields = getChangedFieldsForSave(payloadState);
  delete payloadState.activeUserId;
  saveLocalState(getSavableStateSnapshot(payloadState));
  pendingPayload = JSON.stringify(payloadState);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushStateSave, options.immediate ? 0 : 350);
}

async function flushStateSave() {
  if (saveInFlight || !pendingPayload) {
    return;
  }
  saveInFlight = true;
  const payload = pendingPayload;
  pendingPayload = null;
  const ok = await persistState(payload);
  saveInFlight = false;
  if (!ok) {
    pendingPayload = payload;
    if (!lastSaveFailed) {
      showToast("Falha ao salvar no servidor. Vou tentar novamente em instantes.");
    }
    lastSaveFailed = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushStateSave, 2500);
    return;
  }
  lastSaveFailed = false;
  if (pendingPayload) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushStateSave, 120);
  }
}

function saveSession() {
  try {
    if (sessionUserId) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: sessionUserId, updatedAt: Date.now() }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    // ignore local cache failures
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return typeof parsed?.userId === "string" ? parsed.userId : null;
  } catch (error) {
    return null;
  }
}

function restoreSession() {
  const userId = loadSession();
  const user = userId ? state.users.find((entry) => entry.id === userId) : null;
  if (user) {
    sessionUserId = user.id;
    state.activeUserId = user.id;
  } else {
    sessionUserId = null;
    state.activeUserId = null;
  }
  authReady = true;
  applyAuthState();
}

function normalizeAccessName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function applySessionToState() {
  const user = sessionUserId ? state.users.find((entry) => entry.id === sessionUserId) : null;
  if (user) {
    state.activeUserId = user.id;
    return;
  }
  state.activeUserId = null;
}

function applyAuthState() {
  applySessionToState();
  document.body.classList.toggle("authenticated", isAuthenticated());
  const authOverlay = $("#authOverlay");
  if (authOverlay) {
    authOverlay.hidden = isAuthenticated();
  }
  const logoutButton = $("#logoutButton");
  if (logoutButton) logoutButton.hidden = !isAuthenticated();
  if (!isAuthenticated()) {
    const nameInput = $("#accessName");
    if (nameInput && authReady) {
      nameInput.focus();
    }
  }
}


async function persistState(payload) {
  try {
    const response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload
    });
    if (!response.ok) {
      return false;
    }
    const text = await response.text();
    if (text.trim() && !pendingPayload) {
      state = normalizeState(JSON.parse(text));
      setSyncedStateBaseline(state);
      saveLocalState(state);
      applySessionToState();
      renderPermissions();
    }
    return true;
  } catch (error) {
    return false;
  }
}

function startStateSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  syncTimer = setInterval(() => {
    if (!document.hidden && !saveInFlight && !pendingPayload) {
      void syncStateFromServer();
    }
  }, 20000);
  window.addEventListener("focus", () => void syncStateFromServer());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void syncStateFromServer();
    }
  });
}

async function syncStateFromServer() {
  if (syncInFlight || saveInFlight || pendingPayload) {
    return;
  }
  syncInFlight = true;
  try {
    const response = await fetch(STATE_API_URL, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const text = await response.text();
    if (!text.trim()) {
      return;
    }
    const remote = normalizeState(JSON.parse(text));
    const localRevision = Number(state.revision) || 0;
    const remoteRevision = Number(remote.revision) || 0;
    if (remoteRevision > localRevision) {
      state = remote;
      setSyncedStateBaseline(state);
      saveLocalState(state);
      applySessionToState();
      render();
      showToast("Dados sincronizados com a mesa.");
    }
  } catch (error) {
    // ignore sync misses
  } finally {
    syncInFlight = false;
  }
}

function showView(view) {
  activeView = viewTitles[view] && canAccessView(view) ? view : "dashboard";
  if (activeView !== "journey") {
    selectedJourneyEntryId = "";
    document.body.classList.remove("journey-modal-open");
  }
  applyActiveViewState();
  if (window.location.hash !== `#${activeView}`) {
    history.replaceState(null, "", `#${activeView}`);
  }
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function applyActiveViewState() {
  if (!canAccessView(activeView)) {
    activeView = "dashboard";
    history.replaceState(null, "", `#${activeView}`);
  }
  $$(".nav-button").forEach((button) => {
    const adminOnly = button.dataset.adminOnly === "true";
    button.hidden = adminOnly && !isAdmin();
    button.classList.toggle("active", button.dataset.viewTarget === activeView);
  });
  $$(".view").forEach((section) => {
    const adminOnly = section.dataset.adminOnly === "true";
    const isActiveSection = section.id === `view-${activeView}`;
    section.hidden = !isActiveSection || (adminOnly && !isAdmin());
    section.classList.toggle("active", isActiveSection);
    section.setAttribute("aria-hidden", String(!isActiveSection));
  });
  $("#viewTitle").textContent = viewTitles[activeView];
}

function render() {
  applyActiveViewState();
  setDateInputs("currentDayInput", "currentMonthInput", state.currentDay);
  const cycleInput = $("#currentCycleInput");
  if (cycleInput) cycleInput.value = getCampaignYear(state.currentDay) + 1;
  $("#viewTitle").textContent = viewTitles[activeView];
  renderPermissions();
  renderSidebar();
  switch (activeView) {
    case "dashboard":
      renderDashboard();
      break;
    case "rooms":
      renderRooms();
      break;
    case "npcs":
      renderNpcs();
      break;
    case "finance":
      renderFinance();
      break;
    case "calendar":
      renderCalendar();
      break;
    case "campfire":
      renderCampfire();
      break;
    case "journey":
      renderJourney();
      break;
    case "market":
      renderMarket();
      break;
    case "settings":
      renderSettings();
      renderUsers();
      break;
    default:
      renderDashboard();
      break;
  }
}

function renderPermissions() {
  const user = getActiveUser();
  const admin = user.role === userRoles.admin;
  const permissionKey = getCacheKey(sessionUserId || "", state.activeUserId || "", admin ? "admin" : "player", isAuthenticated() ? "auth" : "guest");
  if (lastPermissionKey === permissionKey) {
    return;
  }
  lastPermissionKey = permissionKey;
  document.body.classList.toggle("role-admin", admin);
  document.body.classList.toggle("role-player", !admin);
  const profileName = $("#activeProfileName");
  const roleBadge = $("#activeRoleBadge");
  if (profileName) {
    profileName.textContent = isAuthenticated() ? user.name : "Aguardando acesso";
  }
  if (roleBadge) {
    roleBadge.textContent = isAuthenticated() ? (admin ? "Mestre" : "Jogador") : "Login necessário";
    roleBadge.className = `role-badge ${!isAuthenticated() ? "player" : admin ? "admin" : "player"}`;
  }

  const dayForm = $("#dayForm");
  if (dayForm) {
    const canEditDate = admin && activeView === "settings";
    dayForm.hidden = !canEditDate;
    dayForm.classList.toggle("locked", !canEditDate);
    $$("#dayForm input, #dayForm select, #dayForm button").forEach((element) => {
      if (element.id === "currentDayInput" || element.id === "currentMonthInput" || element.id === "currentCycleInput" || element.type === "submit") {
        element.disabled = !canEditDate;
      }
    });
  }
  const topbarActions = $(".topbar-actions");
  if (topbarActions) {
    topbarActions.hidden = true;
    topbarActions.setAttribute("aria-hidden", "true");
  }

  const financeBalancePanel = $("#financeBalancePanel");
  const financeBalanceForm = $("#financeBalanceForm");
  const financeBalanceToggle = $("#toggleFinanceBalanceForm");
  if (!admin && financeBalancePanel) {
    financeBalancePanel.hidden = true;
    financeBalancePanel.classList.remove("editing");
    if (financeBalanceForm) {
      financeBalanceForm.hidden = true;
    }
    if (financeBalanceToggle) {
      financeBalanceToggle.setAttribute("aria-expanded", "false");
    }
  }

  const settingsNav = $(`.nav-button[data-view-target="settings"]`);
  if (settingsNav) {
    settingsNav.hidden = !admin;
  }
  const settingsView = $("#view-settings");
  if (settingsView) {
    settingsView.hidden = !admin;
  }

  const marketControls = $("#marketControls");
  if (marketControls) {
    marketControls.hidden = !admin;
  }
  const marketSettingsForm = $("#marketSettingsForm");
  if (marketSettingsForm) {
    marketSettingsForm.hidden = !admin;
  }
  ["settleAllDashboard", "refreshMarketDashboard", "settleAllFinance", "processRecurringCalendar"].forEach((id) => {
    const button = $(`#${id}`);
    if (button) {
      button.hidden = !admin;
    }
  });
  const roomToggle = $("#toggleRoomComposer");
  const npcToggle = $("#toggleNpcComposer");
  const roomBody = $("#roomComposerBody");
  const npcBody = $("#npcComposerBody");
  const roomPanel = roomBody?.closest(".form-panel");
  const npcPanel = npcBody?.closest(".form-panel");
  if (roomToggle) {
    roomToggle.hidden = !admin;
  }
  if (npcToggle) {
    npcToggle.hidden = !admin;
  }
  if (roomPanel) {
    roomPanel.hidden = !admin;
  }
  if (npcPanel) {
    npcPanel.hidden = !admin;
  }
  if (roomBody && !admin) {
    roomBody.hidden = true;
  }
  if (npcBody && !admin) {
    npcBody.hidden = true;
  }
}

function toggleSidebar() {
  const collapsed = !document.body.classList.contains("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const button = $("#sidebarToggle");
  if (button) {
    button.setAttribute("aria-pressed", String(collapsed));
    button.setAttribute("aria-label", collapsed ? "Expandir navegação" : "Recolher navegação");
  }
}

function logout() {
  sessionUserId = null;
  state.activeUserId = null;
  saveSession();
  applyAuthState();
  showView("dashboard");
  render();
  showToast("Sessão encerrada.");
}

function renderSidebar() {
  $("#sidebarDay").textContent = formatCalendarDate(state.currentDay);
  $("#sidebarBalance").textContent = formatCopper(getBalanceCopper());
  const nextMarketDay = getNextMarketDay();
  $("#sidebarMarket").textContent = getMarketStockTotal() ? formatCalendarDate(nextMarketDay) : "Gerar";
}

function renderDashboardCalendar() {
  const grid = $("#dashboardCalendarGrid");
  if (!grid) {
    return;
  }
  const currentParts = getCalendarParts(state.currentDay);
  const currentMonth = currentParts.monthIndex;
  const currentYear = getCampaignYear(state.currentDay) + 1;
  const entries = getCalendarEntries().filter((entry) => getCalendarParts(entry.day).monthIndex === currentMonth);
  const entriesByDay = new Map();
  entries.forEach((entry) => {
    const dayOfMonth = getCalendarParts(entry.day).dayOfMonth;
    if (!entriesByDay.has(dayOfMonth)) {
      entriesByDay.set(dayOfMonth, []);
    }
    entriesByDay.get(dayOfMonth).push(entry);
  });

  $("#dashboardCalendarTitle").textContent = `${CALENDAR_MONTHS[currentMonth]} • ciclo ${currentYear}`;
  $("#dashboardCalendarCount").textContent = `${entries.length} registro${entries.length === 1 ? "" : "s"}`;

  const key = getCacheKey(state.revision, currentYear, currentMonth);
  const html = getCachedValue(renderCache.dashboardCalendarHtml, key, () => Array.from({ length: DAYS_PER_MONTH }, (_, index) => index + 1).map((day) => {
    const dayEntries = (entriesByDay.get(day) || []).sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "pt-BR"));
    const isToday = currentParts.dayOfMonth === day;
    const classes = ["calendar-mini-day"];
    if (isToday) {
      classes.push("today");
    }
    if (dayEntries.length) {
      classes.push("has-entries");
    }
    const visibleEntries = dayEntries.slice(0, 2);
    const extraCount = dayEntries.length - visibleEntries.length;
    return `
      <article class="${classes.join(" ")}">
        <header>
          <strong>${String(day).padStart(2, "0")}</strong>
          <span>${dayEntries.length ? `${dayEntries.length}` : ""}</span>
        </header>
        <div class="calendar-mini-dots" aria-label="${escapeAttr(dayEntries.length ? `${dayEntries.length} registro${dayEntries.length === 1 ? "" : "s"}` : "Sem registros")}">
          ${visibleEntries.length
            ? visibleEntries.map(renderDashboardCalendarEntry).join("")
            : `<span class="calendar-mini-empty" aria-hidden="true"></span>`}
          ${extraCount > 0 ? `<span class="calendar-mini-more" title="${escapeAttr(`${extraCount} registros adicionais`)}">+${extraCount}</span>` : ""}
        </div>
      </article>
    `;
  }).join(""));
  setHtmlIfChanged(grid, html);
}

function renderDashboardCalendarEntry(entry) {
  const classes = [
    "calendar-mini-dot",
    entry.kind === "event" ? "event" : entry.type === "income" ? "income" : "expense"
  ];
  const label = entry.kind === "event"
    ? getEventTypeLabel(entry.type)
    : entry.type === "income"
      ? "Receita"
      : "Despesa";
  const amount = entry.amountCopper ? formatCopper(entry.amountCopper) : "";
  return `
    <span class="${classes.join(" ")}" title="${escapeAttr(entry.title)} · ${escapeAttr(label)}${amount ? ` · ${escapeAttr(amount)}` : ""}" aria-label="${escapeAttr(entry.title)}"></span>
  `;
}

function saveRoom(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode salvar salas.");
    return;
  }
  const id = $("#roomId").value;
  const room = {
    id: id || createId("room"),
    name: $("#roomName").value.trim(),
    type: $("#roomType").value.trim(),
    status: $("#roomStatus").value,
    image: $("#roomImageData").value,
    bonus: $("#roomBonus").value.trim(),
    usage: $("#roomUsage").value.trim(),
    description: $("#roomDescription").value.trim(),
    updatedAt: Date.now()
  };

  if (!room.name) {
    return;
  }

  const index = state.rooms.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.rooms[index] = room;
  } else {
    state.rooms.push(room);
  }

  saveState();
  clearRoomForm();
  toggleComposer("room", false, { silent: true });
  render();
  showToast("Sala especial salva.");
}

function clearRoomForm() {
  $("#roomForm").reset();
  $("#roomId").value = "";
  $("#roomImageData").value = "";
  renderImagePreview("roomImagePreview", "");
  $("#roomStatus").value = "Ativa";
  $("#roomFormTitle").textContent = "Nova sala especial";
}

function handleRoomAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (!isAdmin()) {
    return;
  }
  const id = button.dataset.id;
  if (button.dataset.action === "edit-room") {
    const room = state.rooms.find((item) => item.id === id);
    if (!room) {
      return;
    }
    $("#roomId").value = room.id;
    $("#roomName").value = room.name;
    $("#roomType").value = room.type;
    $("#roomStatus").value = room.status;
    $("#roomImageData").value = room.image || "";
    renderImagePreview("roomImagePreview", room.image || "");
    $("#roomBonus").value = room.bonus;
    $("#roomUsage").value = room.usage;
    $("#roomDescription").value = room.description;
    $("#roomFormTitle").textContent = "Editar sala especial";
    toggleComposer("room", true, { silent: true });
    showView("rooms");
  }

  if (button.dataset.action === "delete-room" && confirm("Remover esta sala especial?")) {
    addDeletedRecord("room", id);
    state.rooms = state.rooms.filter((room) => room.id !== id);
    saveState();
    render();
    showToast("Sala removida.");
  }
}

function renderRooms() {
  const query = ($("#roomSearch")?.value || "").trim().toLowerCase();
  const filter = $("#roomFilter")?.value || "all";
  const key = getCacheKey(state.revision, query, filter, isAdmin());
  const rooms = getCachedValue(renderCache.roomsHtml, key, () => state.rooms
    .filter((room) => {
      const haystack = `${room.name} ${room.type} ${room.status} ${room.bonus} ${room.usage} ${room.description}`.toLowerCase();
      return (!query || haystack.includes(query)) && (filter === "all" || room.status === filter);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));

  const html = rooms.length
    ? rooms.map((room) => `
        <article class="room-card">
          <header>
            <div>
              <h3>${escapeHtml(room.name)}</h3>
              <div class="chip-row">
                ${room.type ? `<span class="chip">${escapeHtml(room.type)}</span>` : ""}
                <span class="chip">${escapeHtml(room.status)}</span>
              </div>
            </div>
            ${isAdmin() ? `
              <div class="card-actions">
                <button class="icon-button" type="button" title="Editar sala" data-action="edit-room" data-id="${escapeAttr(room.id)}">✎</button>
                <button class="icon-button" type="button" title="Remover sala" data-action="delete-room" data-id="${escapeAttr(room.id)}">✕</button>
              </div>
            ` : ""}
          </header>
          ${room.image ? `<img class="room-image" src="${escapeAttr(room.image)}" alt="${escapeAttr(room.name)}">` : ""}
          ${room.description ? `<p class="room-description-text">${nl2br(room.description)}</p>` : ""}
          ${room.bonus ? `<p class="room-bonus-text"><strong>Bônus:</strong> ${nl2br(room.bonus)}</p>` : ""}
          ${room.usage ? `<p class="room-usage-text"><strong>Uso:</strong> ${nl2br(room.usage)}</p>` : ""}
        </article>
      `).join("")
    : renderEmpty("Nenhuma sala encontrada", "A lista de salas não tem resultados para os filtros atuais.");
  setHtmlIfChanged($("#roomList"), html);
}

function saveNpc(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode salvar NPCs.");
    return;
  }
  const id = $("#npcId").value;
  const npc = {
    id: id || createId("npc"),
    name: $("#npcName").value.trim(),
    image: $("#npcImage").value.trim(),
    role: $("#npcRole").value.trim(),
    tags: $("#npcTags").value.trim(),
    summary: $("#npcSummary").value.trim(),
    description: $("#npcDescription").value.trim(),
    financeType: $("#npcFinanceType").value,
    financeAmountCopper: gpToCopper(Number($("#npcFinanceAmount").value) || 0),
    updatedAt: Date.now()
  };

  if (!npc.name) {
    return;
  }

  const index = state.npcs.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.npcs[index] = npc;
  } else {
    state.npcs.push(npc);
  }

  syncNpcFinanceSource(npc);
  saveState();
  clearNpcForm();
  toggleComposer("npc", false, { silent: true });
  render();
  showToast("NPC salvo.");
}

function clearNpcForm() {
  $("#npcForm").reset();
  $("#npcId").value = "";
  $("#npcImage").value = "";
  renderImagePreview("npcImagePreview", "");
  $("#npcFinanceType").value = "none";
  $("#npcFinanceAmount").value = "0";
  $("#npcFormTitle").textContent = "Novo NPC";
}

function handleNpcAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (!isAdmin()) {
    return;
  }
  const id = button.dataset.id;
  const npc = state.npcs.find((item) => item.id === id);

  if (button.dataset.action === "edit-npc" && npc) {
    $("#npcId").value = npc.id;
    $("#npcName").value = npc.name;
    $("#npcImage").value = npc.image;
    renderImagePreview("npcImagePreview", npc.image || "");
    $("#npcRole").value = npc.role;
    $("#npcTags").value = npc.tags;
    $("#npcSummary").value = npc.summary;
    $("#npcDescription").value = npc.description;
    $("#npcFinanceType").value = npc.financeType;
    $("#npcFinanceAmount").value = copperToGpInput(npc.financeAmountCopper);
    $("#npcFormTitle").textContent = "Editar NPC";
    toggleComposer("npc", true, { silent: true });
    showView("npcs");
  }

  if (button.dataset.action === "delete-npc" && confirm("Remover este NPC?")) {
    addDeletedRecord("npc", id);
    state.financeSources
      .filter((source) => source.linkedNpcId === id)
      .forEach((source) => addDeletedRecord("source", source.id));
    state.npcs = state.npcs.filter((item) => item.id !== id);
    state.financeSources = state.financeSources.filter((source) => source.linkedNpcId !== id);
    saveState();
    render();
    showToast("NPC removido.");
  }
}

function renderNpcs() {
  renderNpcRoleOptions();
  const query = ($("#npcSearch")?.value || "").trim().toLowerCase();
  const roleFilter = $("#npcRoleFilter")?.value || "all";
  const sort = $("#npcSort")?.value || "name";
  const key = getCacheKey(state.revision, query, roleFilter, sort, isAdmin());
  let npcs = getCachedValue(renderCache.npcsHtml, key, () => state.npcs.filter((npc) => {
    const haystack = `${npc.name} ${npc.role} ${npc.tags} ${npc.summary} ${npc.description}`.toLowerCase();
    return (!query || haystack.includes(query)) && (roleFilter === "all" || npc.role === roleFilter);
  }));

  npcs = [...npcs].sort((a, b) => {
    if (sort === "role") {
      return (a.role || "").localeCompare(b.role || "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR");
    }
    if (sort === "impact") {
      return Math.abs(b.financeAmountCopper) - Math.abs(a.financeAmountCopper);
    }
    if (sort === "recent") {
      return b.updatedAt - a.updatedAt;
    }
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const html = npcs.length
    ? npcs.map(renderNpcCard).join("")
    : renderEmpty("Nenhum NPC encontrado", "A lista de NPCs não tem resultados para os filtros atuais.");
  setHtmlIfChanged($("#npcList"), html);
}

function renderNpcRoleOptions() {
  const select = $("#npcRoleFilter");
  if (!select) {
    return;
  }
  const current = select.value || "all";
  const roles = unique(state.npcs.map((npc) => npc.role).filter(Boolean)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  select.innerHTML = `<option value="all">Todas as funções</option>${roles.map((role) => `<option value="${escapeAttr(role)}">${escapeHtml(role)}</option>`).join("")}`;
  select.value = roles.includes(current) ? current : "all";
}

function renderNpcCard(npc) {
  const initials = getInitials(npc.name);
  const impact = npc.financeType !== "none" && npc.financeAmountCopper > 0
    ? `<span class="chip ${npc.financeType === "income" ? "income" : "expense"}">${npc.financeType === "income" ? "Receita" : "Despesa"} ${formatCopper(npc.financeAmountCopper)}/30 dias</span>`
    : "";

  return `
    <article class="npc-card">
      <div class="npc-card-body">
        <div class="npc-portrait">
          ${npc.image ? `<img src="${escapeAttr(npc.image)}" alt="${escapeAttr(npc.name)}">` : `<span>${escapeHtml(initials)}</span>`}
        </div>
        <div class="npc-info">
          <h3>${escapeHtml(npc.name)}</h3>
          <div class="npc-meta">${escapeHtml(npc.role || "Sem função")}</div>
          ${npc.summary ? `<p>${escapeHtml(npc.summary)}</p>` : ""}
          ${npc.description ? `<p>${escapeHtml(npc.description)}</p>` : ""}
          <div class="chip-row">
            ${npc.tags ? npc.tags.split(",").map((tag) => `<span class="chip">${escapeHtml(tag.trim())}</span>`).join("") : ""}
            ${impact}
          </div>
          ${isAdmin() ? `
            <div class="card-actions">
              <button class="icon-button" type="button" title="Editar NPC" data-action="edit-npc" data-id="${escapeAttr(npc.id)}">✎</button>
              <button class="icon-button" type="button" title="Remover NPC" data-action="delete-npc" data-id="${escapeAttr(npc.id)}">✕</button>
            </div>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function syncNpcFinanceSource(npc) {
  const existing = state.financeSources.find((source) => source.linkedNpcId === npc.id);
  if (npc.financeType === "none" || npc.financeAmountCopper <= 0) {
    state.financeSources = state.financeSources.filter((source) => source.linkedNpcId !== npc.id);
    return;
  }

  const payload = {
    id: existing?.id || createId("source"),
    name: `NPC: ${npc.name}`,
    kind: "npc",
    type: npc.financeType,
    amountCopper: npc.financeAmountCopper,
    intervalDays: 30,
    startDay: existing?.startDay ?? state.currentDay,
    lastProcessedDay: existing?.lastProcessedDay ?? (state.currentDay <= 1 ? 0 : state.currentDay),
    active: true,
    note: npc.summary || "",
    linkedNpcId: npc.id,
    updatedAt: Date.now()
  };

  if (existing) {
    const index = state.financeSources.findIndex((source) => source.id === existing.id);
    state.financeSources[index] = payload;
  } else {
    state.financeSources.push(payload);
  }
}

function renderFinance() {
  $("#financeBalance").textContent = formatCopper(getBalanceCopper());
  $("#financeBalanceInput").value = copperToGpInput(state.startingBalanceCopper);
  const due = getDueSources();
  const totals = getDueTotals(due);
  $("#financeIncomeDue").textContent = formatCopper(totals.income);
  $("#financeExpenseDue").textContent = formatCopper(totals.expense);
  setDateInputs("ledgerDay", "ledgerMonth", state.currentDay);

  const sourceKey = getCacheKey(state.revision, isAdmin());
  const sourceHtml = getCachedValue(renderCache.financeSourcesHtml, sourceKey, () => state.financeSources.length
    ? [...state.financeSources]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map(renderSourceCard)
      .join("")
    : renderEmpty("Nenhum contrato", "Adicione construções, salas, NPCs ou despesas recorrentes."));
  setHtmlIfChanged($("#sourceList"), sourceHtml);

  renderLedgerTable();
}

function toggleFinanceBalanceEditor(forceOpen) {
  const panel = $("#financeBalancePanel");
  const form = $("#financeBalanceForm");
  const button = $("#toggleFinanceBalanceForm");
  const open = typeof forceOpen === "boolean" ? forceOpen : (panel ? panel.hidden : form?.hidden);
  if (form) {
    form.hidden = !open;
  }
  if (panel) {
    panel.hidden = !open;
    panel.classList.toggle("editing", open);
  }
  if (button) {
    button.setAttribute("aria-expanded", String(open));
  }
  if (open) {
    $("#financeBalanceInput")?.focus();
  }
}

function saveSource(event) {
  event.preventDefault();
  const id = $("#sourceId").value;
  const existing = state.financeSources.find((source) => source.id === id);
  const intervalDays = Math.max(1, Number.parseInt($("#sourceInterval").value, 10) || 30);
  const startDay = getAbsoluteDayFromInputs("sourceStartDay", "sourceStartMonth", getCampaignYear(state.currentDay));
  const selectedLastDay = getAbsoluteDayFromInputs("sourceLastDay", "sourceLastMonth", getCampaignYear(state.currentDay));
  const source = {
    id: id || createId("source"),
    name: $("#sourceName").value.trim(),
    kind: $("#sourceKind").value,
    type: $("#sourceType").value,
    amountCopper: gpToCopper(Number($("#sourceAmount").value) || 0),
    intervalDays,
    startDay,
    lastProcessedDay: id ? selectedLastDay : startDay - intervalDays,
    active: $("#sourceActive").checked,
    note: $("#sourceNote").value.trim(),
    linkedNpcId: existing?.linkedNpcId || "",
    updatedAt: Date.now()
  };

  if (!source.name) {
    return;
  }

  const index = state.financeSources.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.financeSources[index] = source;
  } else {
    state.financeSources.push(source);
  }

  saveState();
  clearSourceForm();
  toggleComposer("source", false, { silent: true });
  render();
  showToast("Contrato salvo.");
}

function clearSourceForm() {
  $("#sourceForm").reset();
  $("#sourceId").value = "";
  $("#sourceKind").value = "building";
  $("#sourceType").value = "income";
  $("#sourceInterval").value = "30";
  setDateInputs("sourceStartDay", "sourceStartMonth", state.currentDay);
  setDateInputs("sourceLastDay", "sourceLastMonth", Math.max(1, state.currentDay - 30));
  $("#sourceActive").checked = true;
  $("#sourceFormTitle").textContent = "Novo contrato";
}

function handleSourceAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (!isAdmin()) {
    return;
  }
  const id = button.dataset.id;
  const source = state.financeSources.find((item) => item.id === id);

  if (button.dataset.action === "edit-source" && source) {
    $("#sourceId").value = source.id;
    $("#sourceName").value = source.name;
    $("#sourceKind").value = source.kind;
    $("#sourceType").value = source.type;
    $("#sourceAmount").value = copperToGpInput(source.amountCopper);
    $("#sourceInterval").value = source.intervalDays;
    setDateInputs("sourceStartDay", "sourceStartMonth", source.startDay || state.currentDay);
    setDateInputs("sourceLastDay", "sourceLastMonth", source.lastProcessedDay || Math.max(1, (source.startDay || state.currentDay) - source.intervalDays));
    $("#sourceActive").checked = source.active;
    $("#sourceNote").value = source.note;
    $("#sourceFormTitle").textContent = "Editar contrato";
    toggleComposer("source", true, { silent: true });
    showView("finance");
  }

  if (button.dataset.action === "delete-source" && confirm("Remover este contrato?")) {
    addDeletedRecord("source", id);
    state.financeSources = state.financeSources.filter((item) => item.id !== id);
    saveState();
    render();
    showToast("Contrato removido.");
  }
}

function handleDueAction(event) {
  const button = event.target.closest("[data-action='settle-source']");
  if (!button) {
    return;
  }
  if (!isAdmin()) {
    return;
  }
  settleSource(button.dataset.id);
}

function settleAllDue(options = {}) {
  if (!isAdmin() && !options.system) {
    if (!options.silent) {
      showToast("Somente o Mestre pode processar recorrentes.");
    }
    return;
  }
  const due = getDueSources();
  if (!due.length) {
    if (!options.silent) {
      showToast("Não há pendências financeiras.");
    }
    return;
  }
  due.forEach((entry) => settleSource(entry.source.id, { silent: true, system: options.system === true }));
  saveState();
  render();
  if (!options.silent) {
    showToast("Recorrentes processadas nos registros do tesouro.");
  }
}

function settleSource(sourceId, options = {}) {
  if (!isAdmin() && !options.system) {
    if (!options.silent) {
      showToast("Somente o Mestre pode registrar recorrentes.");
    }
    return;
  }
  const source = state.financeSources.find((item) => item.id === sourceId);
  if (!source) {
    return;
  }
  const due = getDueForSource(source);
  if (!due.cycles) {
    if (!options.silent) {
      showToast("Este contrato ainda não tem ciclos pendentes.");
    }
    return;
  }

  const ledgerName = `${source.name} (${due.cycles} ciclo${due.cycles > 1 ? "s" : ""})`;
  const duplicate = state.ledger.some((entry) => entry.sourceId === source.id && entry.day === state.currentDay && entry.name === ledgerName && Number(entry.amountCopper) === due.amountCopper);
  if (!duplicate) {
    state.ledger.push({
      id: createId("ledger"),
      day: state.currentDay,
      name: ledgerName,
    type: source.type,
    amountCopper: due.amountCopper,
    sourceId: source.id,
    note: `${due.cycles} ciclo(s) de ${source.intervalDays} dias.`,
      createdAt: Date.now()
    });
  }

  source.lastProcessedDay = due.lastProcessedDayAfter;
  source.updatedAt = Date.now();

  if (!options.silent) {
    saveState();
    render();
    showToast("Pendência registrada no tesouro.");
  }
}

function renderDueCard(entry) {
  const typeLabel = entry.source.type === "income" ? "Receita" : "Despesa";
  return `
    <article class="due-card">
      <div>
        <strong>${escapeHtml(entry.source.name)}</strong>
        <span class="muted">${typeLabel} · ${entry.cycles} ciclo${entry.cycles > 1 ? "s" : ""} · próximo: ${formatCalendarDate(entry.nextDueDay)}</span>
      </div>
      <div>
        <div class="amount ${entry.source.type}">${formatCopper(entry.amountCopper)}</div>
        ${isAdmin() ? `<button class="button subtle" type="button" data-action="settle-source" data-id="${escapeAttr(entry.source.id)}">Registrar</button>` : ""}
      </div>
    </article>
  `;
}

function renderSourceCard(source) {
  const due = getDueForSource(source);
  const nextDay = due.nextDueDayAfter || getNextDueDayForSource(source);
  return `
    <article class="source-card">
      <header>
        <div>
          <h3>${escapeHtml(source.name)}</h3>
          <div class="source-meta">
            <span>${source.kindLabel || getKindLabel(source.kind)}</span>
            <span class="type-${source.type}">${source.type === "income" ? "Receita" : "Despesa"}</span>
            <span>${formatCopper(source.amountCopper)} / ${source.intervalDays} dias</span>
            <span>${source.active ? "Ativa" : "Inativa"}</span>
          </div>
        </div>
        ${isAdmin() ? `
          <div class="card-actions">
            <button class="icon-button" type="button" title="Editar contrato" data-action="edit-source" data-id="${escapeAttr(source.id)}">✎</button>
            <button class="icon-button" type="button" title="Remover contrato" data-action="delete-source" data-id="${escapeAttr(source.id)}">×</button>
          </div>
        ` : ""}
      </header>
      ${source.note ? `<p>${escapeHtml(source.note)}</p>` : ""}
      <div class="chip-row">
        <span class="chip">Início ${formatCalendarDate(source.startDay || 1)}</span>
        <span class="chip">Último ${source.lastProcessedDay > 0 ? formatCalendarDate(source.lastProcessedDay) : "nenhum"}</span>
        <span class="chip ${due.cycles ? "warn" : ""}">Próximo ${formatCalendarDate(nextDay)}</span>
      </div>
    </article>
  `;
}

function saveLedgerEntry(event) {
  event.preventDefault();
  const entry = {
    id: createId("ledger"),
    day: getAbsoluteDayFromInputs("ledgerDay", "ledgerMonth", getCampaignYear(state.currentDay)),
    name: $("#ledgerName").value.trim(),
    type: $("#ledgerType").value,
    amountCopper: gpToCopper(Number($("#ledgerAmount").value) || 0),
    sourceId: "",
    note: "",
    createdAt: Date.now()
  };

  if (!entry.name || entry.amountCopper <= 0) {
    return;
  }

  state.ledger.push(entry);
  saveState();
  $("#ledgerForm").reset();
  setDateInputs("ledgerDay", "ledgerMonth", state.currentDay);
  render();
  showToast("Lançamento adicionado.");
}



function renderLedgerTable() {
  const rows = [...state.ledger]
    .sort((a, b) => b.day - a.day || b.createdAt - a.createdAt)
    .map((entry) => `
      <tr>
        <td>${formatCalendarDate(entry.day)}</td>
        <td>${escapeHtml(entry.name)}</td>
        <td class="type-${entry.type}">${entry.type === "income" ? "Receita" : "Despesa"}</td>
        <td>${formatCopper(entry.amountCopper)}</td>
        <td><button class="icon-button" type="button" title="Remover movimento" data-action="delete-ledger" data-id="${escapeAttr(entry.id)}">✕</button></td>
      </tr>
    `);

  const html = getCachedValue(renderCache.ledgerRowsHtml, getCacheKey(state.revision, rows.length), () => rows.length
    ? rows.join("")
    : `<tr><td colspan="5">Sem movimentos registrados.</td></tr>`);
  setHtmlIfChanged($("#ledgerTable"), html);
}

function handleLedgerAction(event) {
  const button = event.target.closest("[data-action='delete-ledger']");
  if (!button) {
    return;
  }
  if (confirm("Remover este movimento?")) {
    addDeletedRecord("ledger", button.dataset.id);
    state.ledger = state.ledger.filter((entry) => entry.id !== button.dataset.id);
    saveState();
    render();
    showToast("Lançamento removido.");
  }
}

function renderCalendar() {
  if (!$("#calendarMonths")) {
    return;
  }
  const autoRecurring = $("#autoProcessRecurring");
  if (autoRecurring) autoRecurring.checked = true;
  state.autoProcessRecurring = true;
  $("#calendarYearTitle").textContent = `Calendário do ciclo ${getCampaignYear(state.currentDay) + 1}`;
  const entries = getCalendarEntries();
  const incomeTotal = entries
    .filter((entry) => entry.type === "income")
    .reduce((total, entry) => total + (entry.amountCopper || 0), 0);
  const expenseTotal = entries
    .filter((entry) => entry.type === "expense")
    .reduce((total, entry) => total + (entry.amountCopper || 0), 0);
  const pendingCount = entries.filter((entry) => entry.status === "pending").length;
  const summaryHtml = [
    `<span class="chip income">Receitas no calendário: ${formatCopper(incomeTotal)}</span>`,
    `<span class="chip expense">Despesas no calendário: ${formatCopper(expenseTotal)}</span>`,
    `<span class="chip ${pendingCount ? "warn" : ""}">Pendências recorrentes: ${pendingCount}</span>`,
    `<span class="chip">Hoje: ${formatCalendarDate(state.currentDay)}</span>`
  ].join("");
  setHtmlIfChanged($("#calendarSummary"), summaryHtml);

  const key = getCacheKey(state.revision, getCampaignYear(state.currentDay));
  const monthsHtml = getCachedValue(renderCache.calendarMonthsHtml, key, () => CALENDAR_MONTHS
    .map((month, monthIndex) => {
      const monthEntries = entries
        .filter((entry) => getCalendarParts(entry.day).monthIndex === monthIndex)
        .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "pt-BR"));
      return `
        <section class="calendar-month">
          <header>
            <h3>${month}</h3>
            <span>${monthEntries.length} registro${monthEntries.length === 1 ? "" : "s"}</span>
          </header>
          <div class="calendar-entry-list">
            ${monthEntries.length ? monthEntries.map(renderCalendarEntry).join("") : renderEmpty("Sem registros", "Nenhum gasto, receita ou evento neste mês.")}
          </div>
        </section>
      `;
    })
    .join(""));
  setHtmlIfChanged($("#calendarMonths"), monthsHtml);
  renderNextCycleCalendar();
}

function renderNextCycleCalendar() {
  const calendarMonths = $("#calendarMonths");
  if (!calendarMonths) return;
  let panel = $("#nextCycleCalendarPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "nextCycleCalendarPanel";
    panel.className = "panel next-cycle-panel";
    calendarMonths.insertAdjacentElement("afterend", panel);
  }
  const nextYear = getCampaignYear(state.currentDay) + 1;
  const rangeStart = nextYear * DAYS_PER_YEAR + 1;
  const rangeEnd = rangeStart + DAYS_PER_YEAR - 1;
  const entries = getRecurringCalendarEntries(rangeStart, rangeEnd);
  const income = entries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amountCopper, 0);
  const expense = entries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amountCopper, 0);
  const html = `<div class="section-header"><div><p class="eyebrow">Próximo ciclo</p><h2>Ciclo ${nextYear + 1}</h2></div><div class="chip-row"><span class="chip income">Receitas: ${formatCopper(income)}</span><span class="chip expense">Despesas: ${formatCopper(expense)}</span><span class="chip">${entries.length} registro${entries.length === 1 ? "" : "s"}</span></div></div><div class="next-cycle-list">${entries.length ? entries.map(renderCalendarEntry).join("") : renderEmpty("Sem contratos no próximo ciclo", "Os contratos ativos aparecerão aqui quando tiverem datas previstas.")}</div>`;
  setHtmlIfChanged(panel, html);
}

function getCalendarEntries() {
  const key = getCacheKey(state.revision, getCampaignYear(state.currentDay));
  return getCachedValue(renderCache.calendarEntries, key, () => {
    const yearStart = getYearStart(state.currentDay);
    const rangeStart = yearStart + 1;
    const rangeEnd = yearStart + DAYS_PER_YEAR;
    const inRange = (day) => day >= rangeStart && day <= rangeEnd;
    const ledgerEntries = state.ledger
      .filter((entry) => inRange(entry.day))
      .map((entry) => ({
        id: entry.id,
        kind: "ledger",
        day: entry.day,
        title: entry.name,
        type: entry.type,
        amountCopper: entry.amountCopper,
        description: "Registrado no tesouro.",
        status: "registered"
      }));
    const eventEntries = state.events
      .filter((entry) => inRange(entry.day))
      .map((entry) => ({
        id: entry.id,
        kind: "event",
        day: entry.day,
        title: entry.title,
        type: entry.type,
        amountCopper: 0,
        description: entry.description,
        status: "event"
      }));
    return [...ledgerEntries, ...eventEntries, ...getRecurringCalendarEntries(rangeStart, rangeEnd)];
  });
}

function getRecurringCalendarEntries(rangeStart, rangeEnd) {
  const entries = [];
  state.financeSources.forEach((source) => {
    if (!source.active || source.amountCopper <= 0) {
      return;
    }
    const interval = Math.max(1, Number.parseInt(source.intervalDays, 10) || 30);
    let day = Math.max(1, Number.parseInt(source.startDay, 10) || interval);
    while (day < rangeStart) {
      day += interval;
    }
    while (day <= rangeEnd) {
      if (day > source.lastProcessedDay) {
        entries.push({
          id: `${source.id}-${day}`,
          sourceId: source.id,
          kind: "recurring",
          day,
          title: source.name,
          type: source.type,
          amountCopper: source.amountCopper,
          description: `${getKindLabel(source.kind)} recorrente a cada ${source.intervalDays} dias.`,
          status: day <= state.currentDay ? "pending" : "scheduled"
        });
      }
      day += interval;
    }
  });
  return entries;
}

function renderCalendarEntry(entry) {
  const amount = entry.amountCopper ? `<strong>${formatCopper(entry.amountCopper)}</strong>` : "";
  const actions = isAdmin() && entry.kind === "event"
    ? `<div class="card-actions">
        <button class="icon-button" type="button" title="Editar evento" data-action="edit-event" data-id="${escapeAttr(entry.id)}">✎</button>
        <button class="icon-button" type="button" title="Remover evento" data-action="delete-event" data-id="${escapeAttr(entry.id)}">✕</button>
      </div>`
    : "";
  const statusLabel = {
    pending: "Pendente",
    scheduled: "Previsto",
    registered: "Registrado",
    event: getEventTypeLabel(entry.type)
  }[entry.status] || "Registro";

  return `
    <article class="calendar-entry ${entry.type} ${entry.status}">
      <div>
        <span class="calendar-date">${formatCalendarDate(entry.day)}</span>
        <h4>${escapeHtml(entry.title)}</h4>
        <p>${escapeHtml(entry.description || statusLabel)}</p>
        <div class="chip-row">
          <span class="chip ${entry.type === "income" ? "income" : entry.type === "expense" ? "expense" : ""}">${statusLabel}</span>
          ${amount ? `<span class="chip">${amount}</span>` : ""}
        </div>
      </div>
      ${actions}
    </article>
  `;
}

function saveCalendarEvent(event) {
  event.preventDefault();
  const id = $("#eventId").value;
  const payload = {
    id: id || createId("event"),
    title: $("#eventTitle").value.trim(),
    type: $("#eventType").value,
    day: getAbsoluteDayFromInputs("eventDay", "eventMonth", getCampaignYear(state.currentDay)),
    description: $("#eventDescription").value.trim(),
    createdAt: Date.now()
  };
  if (!payload.title) {
    return;
  }
  const index = state.events.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    state.events[index] = payload;
  } else {
    state.events.push(payload);
  }
  saveState();
  clearEventForm();
  toggleComposer("event", false, { silent: true });
  render();
  showToast("Evento salvo no calendário.");
}

function clearEventForm() {
  $("#eventForm").reset();
  $("#eventId").value = "";
  setDateInputs("eventDay", "eventMonth", state.currentDay);
}

function handleCalendarAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (!isAdmin()) {
    return;
  }
  const id = button.dataset.id;
  const entry = state.events.find((item) => item.id === id);
  if (button.dataset.action === "edit-event" && entry) {
    $("#eventId").value = entry.id;
    $("#eventTitle").value = entry.title;
    $("#eventType").value = entry.type;
    setDateInputs("eventDay", "eventMonth", entry.day);
    $("#eventDescription").value = entry.description;
    toggleComposer("event", true, { silent: true });
    showView("calendar");
  }
  if (button.dataset.action === "delete-event" && confirm("Remover este evento?")) {
    addDeletedRecord("event", id);
    state.events = state.events.filter((item) => item.id !== id);
    saveState();
    render();
    showToast("Evento removido.");
  }
}

function getEventTypeLabel(type) {
  const labels = {
    event: "Evento",
    session: "Sessão",
    quest: "Missão",
    warning: "Presságio"
  };
  return labels[type] || "Evento";
}

function getDueSources() {
  const key = getCacheKey(state.revision, state.currentDay);
  return getCachedValue(renderCache.dueSources, key, () => state.financeSources
    .map((source) => ({ source, ...getDueForSource(source) }))
    .filter((entry) => entry.cycles > 0)
    .sort((a, b) => (a.source.type === b.source.type ? a.source.name.localeCompare(b.source.name, "pt-BR") : a.source.type.localeCompare(b.source.type))));
}

function getDueForSource(source) {
  if (!source.active || source.amountCopper <= 0) {
    return {
      cycles: 0,
      amountCopper: 0,
      lastProcessedDayAfter: source.lastProcessedDay,
      nextDueDay: getNextDueDayForSource(source),
      nextDueDayAfter: getNextDueDayForSource(source)
    };
  }
  const interval = Math.max(1, Number.parseInt(source.intervalDays, 10) || 30);
  const startDay = Math.max(1, Number.parseInt(source.startDay, 10) || interval);
  const lastProcessed = Math.max(0, Number.parseInt(source.lastProcessedDay, 10) || 0);
  const baseline = Math.max(lastProcessed, startDay - interval);
  const elapsed = state.currentDay - baseline;
  const cycles = Math.max(0, Math.floor(elapsed / interval));
  const nextDueDay = baseline + interval;
  const lastProcessedDayAfter = baseline + cycles * interval;
  return {
    cycles,
    amountCopper: source.amountCopper * cycles,
    lastProcessedDayAfter,
    nextDueDay,
    nextDueDayAfter: lastProcessedDayAfter + interval
  };
}

function getNextDueDayForSource(source) {
  const interval = Math.max(1, Number.parseInt(source.intervalDays, 10) || 30);
  const startDay = Math.max(1, Number.parseInt(source.startDay, 10) || interval);
  const lastProcessed = Math.max(0, Number.parseInt(source.lastProcessedDay, 10) || 0);
  if (lastProcessed < startDay) {
    return startDay;
  }
  return lastProcessed + interval;
}

function getDueTotals(due = getDueSources()) {
  return due.reduce((totals, entry) => {
    totals[entry.source.type] += entry.amountCopper;
    return totals;
  }, { income: 0, expense: 0 });
}

function getBalanceCopper() {
  return state.ledger.reduce((total, entry) => {
    return total + (entry.type === "income" ? entry.amountCopper : -entry.amountCopper);
  }, state.startingBalanceCopper);
}

function saveMarketSettings(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode ajustar o mercado.");
    return;
  }
  const checkedRarities = $$("input[name='rarity']:checked").map((input) => input.value);
  state.market.permanentCount = clamp(Number.parseInt($("#permanentCount").value, 10) || 14, 4, 60);
  state.market.consumableCount = clamp(Number.parseInt($("#consumableCount").value, 10) || 10, 4, 60);
  state.market.allowedRarities = checkedRarities.length ? checkedRarities : ["Common", "Uncommon", "Rare"];
  state.market.stock = { permanent: [], consumable: [] };
  generateMarketStock();
  saveState();
  render();
  showToast("Ajustes do mercado salvos.");
}

function renderMarket() {
  renderMarketSettings();
  renderMarketCategoryOptions();
  renderMarketStatus();
  renderMarketSection("permanent", "marketPermanentList", "permanentCountLabel");
  renderMarketSection("consumable", "marketConsumableList", "consumableCountLabel");
}

function renderMarketSettings() {
  $("#permanentCount").value = state.market.permanentCount;
  $("#consumableCount").value = state.market.consumableCount;
  $$("input[name='rarity']").forEach((input) => {
    input.checked = state.market.allowedRarities.includes(input.value);
  });
}



function renderMarketCategoryOptions() {
  const select = $("#marketCategoryFilter");
  if (!select) {
    return;
  }
  const current = select.value || "all";
  const categories = unique(getCombinedMarketStock().map((item) => item.category).filter(Boolean)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const key = getCacheKey(state.revision, categories.join("\u0001"));
  const html = getCachedValue(renderCache.marketCategoryHtml, key, () => `<option value="all">Todas as categorias</option>${categories.map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join("")}`);
  if (select.__codexHtml !== html) {
    select.__codexHtml = html;
    select.innerHTML = html;
  }
  select.value = categories.includes(current) ? current : "all";
}

function renderMarketStatus() {
  const nextDay = getNextMarketDay();
  const due = !getMarketStockTotal() || state.currentDay >= nextDay;
  const permanentTotal = state.market.stock.permanent.length;
  const consumableTotal = state.market.stock.consumable.length;
  const status = [
    `<span class="chip ${catalogLoaded ? "income" : "warn"}">${catalogLoaded ? `${catalog.length} itens no catálogo` : "Catálogo pendente"}</span>`,
    `<span class="chip">Estoque de ${formatCalendarDate(state.market.lastRestockDay || state.currentDay)}</span>`,
    `<span class="chip ${due ? "warn" : ""}">Próxima troca em ${formatCalendarDate(nextDay)}</span>`,
    `<span class="chip premium">Permanentes: ${permanentTotal}</span>`,
    `<span class="chip income">Consumíveis: ${consumableTotal}</span>`
  ];
  setHtmlIfChanged($("#marketStatus"), status.join(""));
}

function renderMarketSection(section, listId, labelId) {
  const container = $(`#${listId}`);
  if (!container) {
    return;
  }
  const key = getCacheKey(state.revision, section, $("#marketSearch")?.value || "", $("#marketRarityFilter")?.value || "all", $("#marketCategoryFilter")?.value || "all", $("#marketSort")?.value || "level", isAdmin());
  const cache = renderCache.marketSectionHtml[section];
  const result = getCachedValue(cache, key, () => {
    const stock = getFilteredMarketStock(section);
    return {
      count: stock.length,
      html: stock.length
        ? stock.map((item) => renderMarketCard(item, section)).join("")
        : renderEmpty("Mercado vazio", catalogLoaded ? "Gere o estoque dos mercadores." : "O catálogo local ainda não foi carregado.")
    };
  });
  const label = $(`#${labelId}`);
  if (label) {
    label.textContent = `${result.count} itens`;
  }
  const html = result.html;
  setHtmlIfChanged(container, html);
}

function getFilteredMarketStock(section) {
  const query = ($("#marketSearch")?.value || "").trim().toLowerCase();
  const rarity = $("#marketRarityFilter")?.value || "all";
  const category = $("#marketCategoryFilter")?.value || "all";
  const sort = $("#marketSort")?.value || "level";

  return [...getMarketStockSection(section)]
    .filter((item) => {
      const haystack = `${item.name} ${item.rarity} ${item.category} ${item.subcategory} ${item.trait}`.toLowerCase();
      return (!query || haystack.includes(query))
        && (rarity === "all" || item.rarity === rarity)
        && (category === "all" || item.category === category);
    })
    .sort((a, b) => {
      if (sort === "price") {
        return a.merchantCopper - b.merchantCopper || a.name.localeCompare(b.name, "pt-BR");
      }
      if (sort === "rarity") {
        return (rarityRank[a.rarity] || 99) - (rarityRank[b.rarity] || 99) || a.level - b.level;
      }
      if (sort === "name") {
        return a.name.localeCompare(b.name, "pt-BR");
      }
      return a.level - b.level || a.name.localeCompare(b.name, "pt-BR");
    });
}

function renderMarketCard(item, section) {
  const adjustmentLabel = item.stockType === "premium"
    ? "Sobrepreço +10%"
    : `Desconto ${Math.abs(item.adjustmentPercent)}%`;
  const rarityClass = `rarity-${String(item.rarity || "").toLowerCase()}`;
  const sectionClass = section === "consumable" ? "section-consumable" : "section-permanent";
  const sectionLabel = section === "consumable" ? "Consumível" : "Permanente";
  const rarityChipClass = "";
  return `
    <article class="market-card ${rarityClass} ${sectionClass}">
      <header>
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <div class="market-meta">
            <span class="level-pill">Nível ${item.level}</span>
            <span>${escapeHtml(item.rarity)}</span>
            <span>${escapeHtml(item.category)}</span>
          </div>
        </div>
        <div class="chip-row compact">
          <span class="chip ${rarityChipClass}">${escapeHtml(item.rarity)}</span>
          <span class="chip">${sectionLabel}</span>
          <span class="chip ${item.stockType === "premium" ? "expense" : "warn"}">${adjustmentLabel}</span>
        </div>
      </header>
      <div class="price-line">
        <span>Normal: ${formatCopper(item.normalCopper)}</span>
        <strong>${formatCopper(item.merchantCopper)}</strong>
      </div>
      ${item.url ? `<a class="market-link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">Ver no Archives of Nethys</a>` : ""}
    </article>
  `;
}

function generateMarketStock(options = {}) {
  if (!catalogLoaded || !catalog.length) {
    showToast("O catálogo de itens ainda não carregou.");
    return false;
  }
  if (!isAdmin()) {
    return false;
  }
  if (options.reroll) {
    state.market.nonce += 1;
  }

  const rng = createSeededRandom(`${state.currentDay}|${state.market.nonce}|${state.market.permanentCount}|${state.market.consumableCount}`);
  const allowed = state.market.allowedRarities.length ? state.market.allowedRarities : ["Common", "Uncommon", "Rare"];
  const permanentPool = catalog.filter((item) => !isConsumableCatalogItem(item) && allowed.includes(item.rarity));
  const consumablePool = catalog.filter((item) => isConsumableCatalogItem(item) && allowed.includes(item.rarity) && item.level <= 12);
  const permanentItems = pickVariedItems(permanentPool, state.market.permanentCount, allowed, rng)
    .map((item) => makeStockEntry(item, "permanent", rng));
  const consumableItems = pickVariedItems(consumablePool, state.market.consumableCount, allowed, rng)
    .map((item) => makeStockEntry(item, "consumable", rng));

  state.market.stock = {
    permanent: permanentItems,
    consumable: consumableItems
  };
  state.market.lastRestockDay = state.currentDay;
  return true;
}

function autoRestockIfDue() {
  if (!catalogLoaded) {
    return;
  }
  if (!getMarketStockTotal() || state.currentDay >= getNextMarketDay()) {
    generateMarketStock();
  }
}

function getNextMarketDay() {
  return (Number(state.market.lastRestockDay) || state.currentDay) + 7;
}

function getMarketStockSection(section) {
  if (!state.market.stock || typeof state.market.stock !== "object") {
    state.market.stock = { permanent: [], consumable: [] };
  }
  return section === "consumable" ? state.market.stock.consumable : state.market.stock.permanent;
}

function getCombinedMarketStock() {
  const key = getCacheKey(state.revision);
  return getCachedValue(renderCache.combinedMarket, key, () => [...getMarketStockSection("permanent"), ...getMarketStockSection("consumable")]);
}

function getMarketStockTotal() {
  return getCombinedMarketStock().length;
}

function isConsumableCatalogItem(item) {
  const category = String(item.category || "").toLowerCase();
  const subcategory = String(item.subcategory || "").toLowerCase();
  const trait = String(item.trait || "").toLowerCase();
  return category.includes("consumable")
    || category.includes("alchemical")
    || subcategory.includes("ammunition")
    || subcategory.includes("bomb")
    || subcategory.includes("elixir")
    || trait.includes("bomb")
    || trait.includes("consumable")
    || trait.includes("ammunition")
    || trait.includes("elixir");
}

function pickVariedItems(pool, count, allowedRarities, rng) {
  const selected = [];
  const used = new Set();
  const byRarity = new Map();
  pool.forEach((item) => {
    if (!byRarity.has(item.rarity)) {
      byRarity.set(item.rarity, []);
    }
    byRarity.get(item.rarity).push(item);
  });

  allowedRarities.forEach((rarity) => {
    if (selected.length >= count) {
      return;
    }
    const candidate = pickUnused(byRarity.get(rarity) || [], used, rng);
    if (candidate) {
      selected.push(candidate);
      used.add(candidate.itemKey);
    }
  });

  const weightedRarities = allowedRarities.flatMap((rarity) => {
    const weight = rarity === "Common" ? 6 : rarity === "Uncommon" ? 4 : rarity === "Rare" ? 2 : 1;
    return Array.from({ length: weight }, () => rarity);
  });

  while (selected.length < count && used.size < pool.length) {
    const weightedPool = pool.filter((item) => !used.has(item.itemKey));
    if (!weightedPool.length) {
      break;
    }
    const rarity = weightedRarities[Math.floor(rng() * weightedRarities.length)] || allowedRarities[0];
    const rarityBucket = byRarity.get(rarity) || [];
    const levelWeighted = rarityBucket.filter((item) => !used.has(item.itemKey));
    const candidate = pickWeightedItem(levelWeighted.length ? levelWeighted : weightedPool, rng);
    if (!candidate) {
      break;
    }
    selected.push(candidate);
    used.add(candidate.itemKey);
  }

  return selected;
}

function pickUnused(pool, used, rng) {
  const available = pool.filter((item) => !used.has(item.itemKey));
  if (!available.length) {
    return null;
  }
  return available[Math.floor(rng() * available.length)];
}

function pickWeightedItem(pool, rng) {
  if (!pool.length) {
    return null;
  }
  const scored = pool.map((item) => {
    const levelWeight = item.level >= 10 ? 2 : item.level >= 8 ? 1.4 : 1;
    const rarityWeight = item.rarity === "Rare" ? 1.25 : item.rarity === "Uncommon" ? 1.15 : 1;
    return { item, weight: levelWeight * rarityWeight };
  });
  const total = scored.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * total;
  for (const entry of scored) {
    cursor -= entry.weight;
    if (cursor <= 0) {
      return entry.item;
    }
  }
  return scored[scored.length - 1].item;
}

function makeStockEntry(item, stockType, rng) {
  const isHighLevelPermanent = stockType === "permanent" && item.level >= 13;
  const adjustmentPercent = isHighLevelPermanent
    ? 10
    : -(10 + Math.floor(rng() * 11));
  const multiplier = isHighLevelPermanent
    ? 1.1
    : 1 + adjustmentPercent / 100;
  return {
    stockId: createId("stock"),
    name: item.name,
    level: item.level,
    rarity: item.rarity,
    category: item.category,
    subcategory: item.subcategory,
    trait: item.trait,
    url: item.url,
    normalCopper: item.priceCopper,
    merchantCopper: roundToSilver(item.priceCopper * multiplier),
    adjustmentPercent,
    stockType: isHighLevelPermanent ? "premium" : "regular",
    section: stockType
  };
}

function normalizeCatalogItem(raw) {
  const relativeUrl = raw.url || "";
  const absoluteUrl = relativeUrl.startsWith("http") ? relativeUrl : `${AON_BASE_URL}${relativeUrl}`;
  return {
    itemKey: `${raw.name || ""}|${raw.level || ""}|${raw.url || ""}`,
    name: raw.name || "Item",
    level: Number.parseInt(raw.level, 10) || 0,
    rarity: raw.rarity || "Common",
    category: raw.item_category || "Outros",
    subcategory: raw.item_subcategory || "",
    trait: raw.trait || "",
    priceCopper: parsePriceToCopper(raw.price || ""),
    url: relativeUrl ? absoluteUrl : ""
  };
}

function populateStaticForms() {
  clearRoomForm();
  clearNpcForm();
  clearSourceForm();
  clearEventForm();
  clearCampfireHeroForm({ silent: true });
  clearCampfireGoalForm({ silent: true });
}

function renderSettings() {
  const repairedUsers = ensureCanonicalUsers(state.users);
  if (JSON.stringify(repairedUsers) !== JSON.stringify(state.users)) {
    state.users = repairedUsers;
    saveState();
  }
  moveDateControlToSettings();
  $("#startingBalance").value = copperToGpInput(state.startingBalanceCopper);
  renderUsers();
}

function moveDateControlToSettings() {
  const settings = $("#view-settings");
  const dayForm = $("#dayForm");
  if (!settings || !dayForm) {
    return;
  }
  let panel = $("#settingsDatePanel");
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
}

function saveFinanceBalance(event) {
  event.preventDefault();
  state.startingBalanceCopper = gpToCopper(Number($("#financeBalanceInput").value) || 0);
  saveState();
  render();
  toggleFinanceBalanceEditor(false);
  showToast("Saldo atual salvo.");
}

function handleAccessSubmit(event) {
  event.preventDefault();
  const name = $("#accessName").value.trim();
  const pin = $("#accessPin").value.trim();
  if (!name || !pin) {
    showToast("Informe nome e PIN para acessar.");
    return;
  }

  state.users = ensureCanonicalUsers(state.users);
  const normalizedName = normalizeAccessName(name);
  const existing = state.users.find((user) => normalizeAccessName(user.name) === normalizedName);
  if (existing) {
    if (String(existing.pin || "") !== pin) {
      showToast("Nome ou PIN inválidos.");
      return;
    }
    sessionUserId = existing.id;
    state.activeUserId = existing.id;
    saveSession();
    applyAuthState();
    render();
    showToast(`Bem-vindo, ${existing.name}.`);
    return;
  }

  const nextUser = normalizeUser({
    id: createId("user"),
    name,
    role: userRoles.player,
    pin,
    createdAt: Date.now()
  });
  state.users.push(nextUser);
  sessionUserId = nextUser.id;
  state.activeUserId = nextUser.id;
  saveSession();
  saveState();
  applyAuthState();
  render();
  showToast(`Perfil criado: ${nextUser.name}.`);
}

function renderUsers() {
  const list = $("#userList");
  if (!list) {
    return;
  }
  state.users = ensureCanonicalUsers(state.users);
  const users = [...state.users].sort((a, b) => {
    if (a.role === b.role) {
      return a.name.localeCompare(b.name, "pt-BR");
    }
    return a.role === userRoles.admin ? -1 : 1;
  });
  list.innerHTML = users.length
    ? users.map((user) => `
        <article class="user-card ${user.id === getActiveUserId() ? "active" : ""}">
          <div>
            <strong>${escapeHtml(user.name)}</strong>
            <div class="chip-row">
              <span class="chip ${user.role === userRoles.admin ? "premium" : "income"}">${user.role === userRoles.admin ? "Mestre" : "Jogador"}</span>
              <span class="chip">${user.pin ? "PIN definido" : "Sem PIN"}</span>
            </div>
          </div>
          <div class="card-actions">
            <button class="icon-button" type="button" title="Editar usuário" data-action="edit-user" data-id="${escapeAttr(user.id)}">✎</button>
            ${user.role === userRoles.admin ? "" : `<button class="icon-button" type="button" title="Remover usuário" data-action="delete-user" data-id="${escapeAttr(user.id)}">✕</button>`}
          </div>
        </article>
      `).join("")
    : renderEmpty("Nenhum usuário", "Crie os perfis dos jogadores aqui.");
}

function clearUserForm() {
  $("#userForm").reset();
  $("#userId").value = "";
}

function saveUser(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode gerenciar usuários.");
    return;
  }
  const id = $("#userId").value;
  const payload = {
    id: id || createId("user"),
    name: $("#userName").value.trim(),
    role: $("#userRole").value === userRoles.admin ? userRoles.admin : userRoles.player,
    pin: $("#userPin").value.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  if (!payload.name) {
    showToast("Informe um nome para o usuário.");
    return;
  }
  const existingIndex = state.users.findIndex((user) => user.id === id);
  if (existingIndex >= 0) {
    state.users[existingIndex] = { ...state.users[existingIndex], ...payload, createdAt: state.users[existingIndex].createdAt || Date.now(), updatedAt: Date.now() };
  } else {
    state.users.push(payload);
  }
  saveState();
  clearUserForm();
  render();
  showToast("Usuário salvo.");
}

function handleUserAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !isAdmin()) {
    return;
  }
  const user = state.users.find((item) => item.id === button.dataset.id);
  if (!user) {
    return;
  }
  if (button.dataset.action === "edit-user") {
    $("#userId").value = user.id;
    $("#userName").value = user.name;
    $("#userRole").value = user.role;
    $("#userPin").value = user.pin || "";
    $("#userManagementPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (button.dataset.action === "delete-user" && confirm(`Remover o usuário ${user.name}?`)) {
    addDeletedRecord("user", user.id);
    state.users = state.users.filter((item) => item.id !== user.id);
    if (sessionUserId === user.id) {
      sessionUserId = null;
      saveSession();
      applyAuthState();
    }
    saveState();
    render();
    showToast("Usuário removido.");
  }
}

function saveSettings(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode alterar os dados da campanha.");
    return;
  }
  state.startingBalanceCopper = gpToCopper(Number($("#startingBalance").value) || 0);
  saveState();
  render();
  showToast("Saldo inicial salvo.");
}

function exportData() {
  if (!isAdmin()) {
    showToast("Somente o Mestre pode exportar os dados.");
    return;
  }
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `templo-esmeralda-${formatCalendarDate(state.currentDay).replace(/\s+/g, "-").toLowerCase()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode importar dados.");
    return;
  }
  try {
    const raw = $("#importData").value.trim();
    if (!raw) {
      return;
    }
    state = normalizeState(JSON.parse(raw));
    saveState();
    $("#importData").value = "";
    render();
    showToast("Dados importados.");
  } catch (error) {
    showToast("JSON inválido. A importação não foi aplicada.");
  }
}

function resetData() {
  if (!isAdmin()) {
    showToast("Somente o Mestre pode reiniciar o app.");
    return;
  }
  if (!confirm("Reiniciar todos os dados salvos neste navegador?")) {
    return;
  }
  state = freshState();
  autoRestockIfDue();
  saveState();
  render();
  showToast("App reiniciado.");
}

function getKindLabel(kind) {
  const labels = {
    building: "Construção",
    npc: "NPC",
    room: "Sala especial",
    tavern: "Taverna",
    other: "Outro"
  };
  return labels[kind] || "Outro";
}

function parsePriceToCopper(price) {
  const normalized = String(price || "").replace(/,/g, "").toLowerCase();
  let total = 0;
  const regex = /(\d+(?:\.\d+)?)\s*(pp|gp|sp|cp)/g;
  let match = regex.exec(normalized);
  while (match) {
    const value = Number(match[1]);
    const unit = match[2];
    if (unit === "pp") {
      total += value * 1000;
    } else if (unit === "gp") {
      total += value * 100;
    } else if (unit === "sp") {
      total += value * 10;
    } else if (unit === "cp") {
      total += value;
    }
    match = regex.exec(normalized);
  }
  return Math.round(total);
}

function getCampaignYear(day) {
  return Math.floor((Math.max(1, Number(day) || 1) - 1) / DAYS_PER_YEAR);
}

function getYearStart(day) {
  return getCampaignYear(day) * DAYS_PER_YEAR;
}

function getCalendarParts(day) {
  const safeDay = Math.max(1, Number(day) || 1);
  const dayInYear = ((safeDay - 1) % DAYS_PER_YEAR) + 1;
  const monthIndex = Math.floor((dayInYear - 1) / DAYS_PER_MONTH);
  const dayOfMonth = ((dayInYear - 1) % DAYS_PER_MONTH) + 1;
  return { dayInYear, monthIndex, dayOfMonth };
}

function getMonthArticle(month) {
  return month === "Primavera" ? "da" : "do";
}

function formatCalendarDate(day) {
  const parts = getCalendarParts(day);
  const month = CALENDAR_MONTHS[parts.monthIndex];
  return `${String(parts.dayOfMonth).padStart(2, "0")} ${getMonthArticle(month)} ${month}`;
}

function setDateInputs(dayInputId, monthInputId, absoluteDay) {
  const dayInput = $(`#${dayInputId}`);
  const monthInput = $(`#${monthInputId}`);
  if (!dayInput || !monthInput) {
    return;
  }
  const parts = getCalendarParts(absoluteDay);
  dayInput.value = parts.dayOfMonth;
  monthInput.value = parts.monthIndex;
}

function getAbsoluteDayFromInputs(dayInputId, monthInputId, yearIndex = 0) {
  const dayInput = $(`#${dayInputId}`);
  const monthInput = $(`#${monthInputId}`);
  const dayOfMonth = clamp(Number.parseInt(dayInput?.value, 10) || 1, 1, DAYS_PER_MONTH);
  const monthIndex = clamp(Number.parseInt(monthInput?.value, 10) || 0, 0, CALENDAR_MONTHS.length - 1);
  return yearIndex * DAYS_PER_YEAR + monthIndex * DAYS_PER_MONTH + dayOfMonth;
}

async function handleImageUpload(event, hiddenInputId, previewId) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    showToast("Selecione um arquivo de imagem.");
    event.target.value = "";
    return;
  }
  try {
    const dataUrl = await readImageAsDataUrl(file);
    $(`#${hiddenInputId}`).value = dataUrl;
    renderImagePreview(previewId, dataUrl);
    showToast("Imagem carregada.");
  } catch (error) {
    showToast("Não foi possível carregar a imagem.");
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => resolve(reader.result);
      image.onload = () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        if (scale >= 1 && file.size < 650000) {
          resolve(reader.result);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#10130f";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderImagePreview(previewId, dataUrl) {
  const preview = $(`#${previewId}`);
  if (!preview) {
    return;
  }
  preview.innerHTML = dataUrl
    ? `<img src="${escapeAttr(dataUrl)}" alt="Prévia da imagem">`
    : `<span>Nenhuma imagem selecionada</span>`;
}

function clearRoomImage() {
  $("#roomImageData").value = "";
  $("#roomImageUpload").value = "";
  renderImagePreview("roomImagePreview", "");
}

function clearNpcImage() {
  $("#npcImage").value = "";
  $("#npcImageUpload").value = "";
  renderImagePreview("npcImagePreview", "");
}

function formatCopper(copper) {
  const sign = copper < 0 ? "-" : "";
  let remaining = Math.round(Math.abs(copper));
  const gp = Math.floor(remaining / 100);
  remaining %= 100;
  const sp = Math.floor(remaining / 10);
  const cp = remaining % 10;
  const parts = [];
  if (gp) {
    parts.push(`${gp.toLocaleString("pt-BR")} gp`);
  }
  if (sp) {
    parts.push(`${sp} sp`);
  }
  if (cp) {
    parts.push(`${cp} cp`);
  }
  return `${sign}${parts.length ? parts.join(" ") : "0 gp"}`;
}

function gpToCopper(gp) {
  return Math.max(0, Math.round((Number(gp) || 0) * 100));
}

function copperToGpInput(copper) {
  const value = Math.round((Number(copper) || 0)) / 100;
  return Number.isInteger(value) ? String(value) : String(value.toFixed(2)).replace(/0+$/, "").replace(/\.$/, "");
}

function toSafeCopper(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

function roundToSilver(copper) {
  return Math.max(1, Math.round(copper / 10) * 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function unique(values) {
  return [...new Set(values)];
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  const text = String(seedText);
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return function random() {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

function renderEmpty(title, body) {
  return `
    <article class="empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function renderDashboard() {
  renderDashboardHero();
  renderDashboardCalendar();
  const totalItems = getMarketStockTotal();
  const nextMarketDay = getNextMarketDay();
  const marketHtml = [`<article class="ledger-item market-overview-card"><span class="eyebrow">Itens no mercado</span><strong>${totalItems}</strong></article>`,
    `<article class="ledger-item market-overview-card"><span class="eyebrow">Próxima atualização</span><strong>${formatCalendarDate(nextMarketDay)}</strong></article>`].join("");
  setHtmlIfChanged($("#dashboardMarketList"), marketHtml);
  const recent = [...state.ledger].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const recentHtml = getCachedValue(renderCache.recentLedgerHtml, getCacheKey(state.revision, recent.length, "dashboard-ledger"), () => recent.length
    ? recent.map((entry) => `<article class="ledger-item"><strong>${escapeHtml(entry.name)}</strong><p>${formatCalendarDate(entry.day)} ? <span class="type-${entry.type}">${entry.type === "income" ? "Receita" : "Despesa"}</span> ? ${formatCopper(entry.amountCopper)}</p></article>`).join("")
    : renderEmpty("Sem movimentos", "Os registros do tesouro ainda não receberam movimentos."));
  setHtmlIfChanged($("#recentLedger"), recentHtml);
}

function renderDashboardHero() {
  const panel = $("#dashboardHeroPanel");
  if (!panel) return;
  const hero = getCampfireHeroForUser(getActiveUserId());
  if (!hero) {
    setHtmlIfChanged(panel, renderEmpty("Seu herói", "Nenhum personagem está vinculado a este perfil."));
    return;
  }
  const visibleGoals = hero.goals.filter((goal) => canSeeCampfireSecrets(hero) || !goal.secret);
  const goalsHtml = ["short", "medium", "long"].map((category) => {
    const goal = visibleGoals.find((item) => item.category === category);
    return `<article class="dash-goal goal-${category}"><strong>${escapeHtml(campfireGoalCategories[category])}</strong><p>${goal ? escapeHtml(goal.text) : "Sem objetivo visível."}${goal?.secret ? " <em>Secreto</em>" : ""}</p></article>`;
  }).join("");
  const html = `<div class="dashboard-hero-copy"><p class="eyebrow">Seu herói</p><h2>${escapeHtml(hero.characterName)}</h2></div><div class="dashboard-hero-content"><div class="dash-hero-avatar ${hero.image ? "has-image" : ""}">${hero.image ? `<img src="${escapeAttr(hero.image)}" alt="${escapeAttr(hero.characterName)}" loading="lazy" decoding="async">` : `<span>${escapeHtml(getInitials(hero.characterName))}</span>`}</div><div class="dash-goal-grid">${goalsHtml}</div></div>`;
  setHtmlIfChanged(panel, html);
}

function getUserById(userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function getCampfireHeroById(heroId) {
  return state.campfire.heroes.find((hero) => hero.id === heroId) || null;
}

function getCampfireHeroForUser(userId = getActiveUserId()) {
  if (!userId) {
    return null;
  }
  return state.campfire.heroes.find((hero) => hero.ownerUserId === userId) || null;
}

function canManageCampfireHero(hero) {
  return Boolean(hero) && (isAdmin() || hero.ownerUserId === getActiveUserId());
}

function canSeeCampfireSecrets(hero) {
  return Boolean(hero) && (isAdmin() || hero.ownerUserId === getActiveUserId());
}

function getCampfireEditorHero() {
  const selectedId = $("#campfireHeroId")?.value || "";
  const selectedHero = selectedId ? getCampfireHeroById(selectedId) : null;
  const ownHero = getCampfireHeroForUser(getActiveUserId());
  if (selectedHero && canManageCampfireHero(selectedHero)) {
    return selectedHero;
  }
  if (ownHero) {
    return ownHero;
  }
  if (isAdmin()) {
    return selectedHero || state.campfire.heroes[0] || null;
  }
  return null;
}

function renderJourney() {
  const gallery = $("#journeyGallery");
  const detail = $("#journeyDetail");
  const modal = $("#journeyModal");
  const count = $("#journeyCount");
  if (!gallery || !detail || !modal) {
    return;
  }
  const entries = getFilteredJourneyEntries();
  if (count) {
    count.textContent = `${entries.length} lembrança${entries.length === 1 ? "" : "s"}`;
  }
  if (selectedJourneyEntryId && !state.journey.entries.some((entry) => entry.id === selectedJourneyEntryId)) {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
  }
  if (selectedJourneyEntryId && entries.length && !entries.some((entry) => entry.id === selectedJourneyEntryId)) {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
  }
  if (!entries.length) {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
  }
  const key = getCacheKey(state.revision, $("#journeySearch")?.value || "", $("#journeySort")?.value || "name", selectedJourneyEntryId, journeyModalEditId, getActiveUserId(), isAdmin());
  const galleryHtml = getCachedValue(renderCache.journeyGalleryHtml, key, () => entries.length
    ? entries.map(renderJourneyCard).join("")
    : renderEmpty("Jornada vazia", "Adicione uma imagem, um nome e uma descrição para começar o diário da mesa."));
  setHtmlIfChanged(gallery, galleryHtml);
  const selectedEntry = selectedJourneyEntryId ? state.journey.entries.find((entry) => entry.id === selectedJourneyEntryId) : null;
  const detailKey = getCacheKey(state.revision, selectedEntry?.id || "none", selectedEntry?.updatedAt || 0, selectedEntry?.comments.length || 0, journeyModalEditId, getActiveUserId(), isAdmin());
  const detailHtml = getCachedValue(renderCache.journeyDetailHtml, detailKey, () => renderJourneyDetail(selectedEntry));
  setHtmlIfChanged(detail, detailHtml);
  modal.hidden = !selectedEntry;
  document.body.classList.toggle("journey-modal-open", Boolean(selectedEntry));
}

function getFilteredJourneyEntries() {
  const query = ($("#journeySearch")?.value || "").trim().toLowerCase();
  const sort = $("#journeySort")?.value || "name";
  const entries = state.journey.entries.filter((entry) => {
    const comments = entry.comments.map((comment) => `${comment.text} ${comment.heroName} ${comment.userName}`).join(" ");
    const haystack = `${entry.title} ${entry.level} ${entry.description} ${comments}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  return [...entries].sort((a, b) => {
    if (sort === "level") {
      const levelCompare = compareJourneyLevels(a.level, b.level);
      if (levelCompare !== 0) {
        return levelCompare;
      }
    }
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

function compareJourneyLevels(a, b) {
  const first = Number.parseFloat(String(a).replace(",", "."));
  const second = Number.parseFloat(String(b).replace(",", "."));
  const firstKnown = Number.isFinite(first);
  const secondKnown = Number.isFinite(second);
  if (firstKnown && secondKnown && first !== second) {
    return first - second;
  }
  if (firstKnown !== secondKnown) {
    return firstKnown ? -1 : 1;
  }
  return String(a).localeCompare(String(b), "pt-BR");
}

function renderJourneyCard(entry) {
  const active = entry.id === selectedJourneyEntryId ? "active" : "";
  const canRemove = canManageJourneyEntry(entry);
  return `
    <article class="journey-card ${active}">
      <button class="journey-card-open" type="button" data-action="select-journey" data-id="${escapeAttr(entry.id)}">
        ${entry.image ? `<img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}" loading="lazy" decoding="async">` : `<span class="journey-image-placeholder">Sem imagem</span>`}
        <span class="journey-card-title">${escapeHtml(entry.title)}</span>
        <span class="journey-level">Nível ${escapeHtml(entry.level)}</span>
      </button>
      ${canRemove ? `<button class="icon-button journey-card-delete" type="button" title="Remover lembrança" data-action="delete-journey" data-id="${escapeAttr(entry.id)}">✕</button>` : ""}
    </article>
  `;
}

function renderJourneyDetail(entry) {
  if (!entry) {
    return "";
  }
  if (journeyModalEditId === entry.id && canManageJourneyEntry(entry)) {
    return renderJourneyEditForm(entry);
  }
  const canRemove = canManageJourneyEntry(entry);
  const comments = entry.comments.length
    ? entry.comments
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((comment) => renderJourneyComment(entry, comment))
        .join("")
    : renderEmpty("Sem comentários", "Os heróis ainda não deixaram notas sobre esta lembrança.");
  return `
    <article class="journey-detail-card">
      <header>
        <div>
          <p class="eyebrow">Lembrança aberta</p>
          <h3>${escapeHtml(entry.title)}</h3>
          <div class="chip-row compact">
            <span class="chip">Nível ${escapeHtml(entry.level)}</span>
            <span class="chip">${escapeHtml(entry.createdByName)}</span>
          </div>
        </div>
        <div class="card-actions">
          ${canRemove ? `<button class="icon-button" type="button" title="Editar lembrança" data-action="edit-journey" data-id="${escapeAttr(entry.id)}">✎</button>` : ""}
          ${canRemove ? `<button class="icon-button" type="button" title="Remover lembrança" data-action="delete-journey" data-id="${escapeAttr(entry.id)}">✕</button>` : ""}
          <button class="icon-button" type="button" title="Fechar lembrança" data-action="close-journey-modal">×</button>
        </div>
      </header>
      ${entry.image ? `<img class="journey-detail-image" src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}" loading="lazy" decoding="async">` : ""}
      <p class="journey-description">${entry.description ? nl2br(entry.description) : "Nenhuma descrição foi registrada."}</p>
      <section class="journey-comments">
        <div class="section-header floating lower">
          <div>
            <p class="eyebrow">Comentários</p>
            <h4>Notas dos heróis</h4>
          </div>
        </div>
        <form class="journey-comment-form" data-entry-id="${escapeAttr(entry.id)}">
          <textarea name="comment" rows="3" maxlength="500" placeholder="Escreva uma observação do seu herói..."></textarea>
          <button class="button subtle" type="submit">Comentar</button>
        </form>
        <div class="journey-comment-list">${comments}</div>
      </section>
    </article>
  `;
}

function renderJourneyEditForm(entry) {
  return `
    <article class="journey-detail-card journey-edit-card">
      <header>
        <div>
          <p class="eyebrow">Editar lembranÃ§a</p>
          <h3>${escapeHtml(entry.title)}</h3>
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" title="Cancelar ediÃ§Ã£o" data-action="cancel-journey-edit" data-id="${escapeAttr(entry.id)}">Ã—</button>
        </div>
      </header>
      <form class="stacked-form journey-modal-edit-form" data-entry-id="${escapeAttr(entry.id)}">
        <label>
          Imagem
          <input id="journeyModalImageUpload" type="file" accept="image/*">
          <input id="journeyModalImage" type="hidden" value="${escapeAttr(entry.image || "")}">
        </label>
        <div class="image-preview" id="journeyModalImagePreview">
          ${entry.image ? `<img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}" loading="lazy" decoding="async">` : ""}
        </div>
        <div class="form-row">
          <label>
            TÃ­tulo
            <input name="title" maxlength="100" autocomplete="off" value="${escapeAttr(entry.title)}">
          </label>
          <label>
            NÃ­vel
            <input name="level" maxlength="12" autocomplete="off" value="${escapeAttr(entry.level)}">
          </label>
        </div>
        <label>
          DescriÃ§Ã£o
          <textarea name="description" rows="6" maxlength="1200">${escapeHtml(entry.description || "")}</textarea>
        </label>
        <div class="button-row">
          <button class="button primary" type="submit">Salvar lembranÃ§a</button>
          <button class="button ghost" type="button" data-action="clear-journey-modal-image">Remover imagem</button>
          <button class="button ghost" type="button" data-action="cancel-journey-edit" data-id="${escapeAttr(entry.id)}">Cancelar</button>
        </div>
      </form>
    </article>
  `;
}

function renderJourneyComment(entry, comment) {
  const author = comment.heroName || comment.userName || "Viajante";
  const canRemove = canManageJourneyComment(comment);
  return `
    <article class="journey-comment">
      <div>
        <strong>${escapeHtml(author)}</strong>
        ${comment.heroName && comment.userName ? `<span>${escapeHtml(comment.userName)}</span>` : ""}
      </div>
      <p>${nl2br(comment.text)}</p>
      ${canRemove ? `<button class="icon-button" type="button" title="Remover comentário" data-action="delete-journey-comment" data-entry-id="${escapeAttr(entry.id)}" data-comment-id="${escapeAttr(comment.id)}">✕</button>` : ""}
    </article>
  `;
}

function saveJourneyEntry(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    showToast("Faça login para registrar a Jornada.");
    return;
  }
  const title = $("#journeyTitle").value.trim();
  if (!title) {
    showToast("Informe um título para a lembrança.");
    return;
  }
  const id = $("#journeyEntryId").value;
  const existing = id ? state.journey.entries.find((entry) => entry.id === id) : null;
  if (existing && !canManageJourneyEntry(existing)) {
    showToast("Você só pode editar lembranças que criou.");
    return;
  }
  const user = getActiveUser();
  const payload = {
    id: existing?.id || createId("journey"),
    title,
    level: normalizeJourneyLevel($("#journeyLevel").value),
    image: $("#journeyImage").value || "",
    description: $("#journeyDescription").value.trim(),
    createdByUserId: existing?.createdByUserId || user.id,
    createdByName: existing?.createdByName || user.name,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    comments: existing?.comments || []
  };
  const index = state.journey.entries.findIndex((entry) => entry.id === payload.id);
  if (index >= 0) {
    state.journey.entries[index] = payload;
  } else {
    state.journey.entries.push(payload);
  }
  selectedJourneyEntryId = "";
  saveState();
  clearJourneyForm({ keepOpen: false });
  toggleComposer("journey", false, { silent: true });
  renderJourney();
  showToast("Lembrança registrada na Jornada.");
}

function handleJourneyAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "select-journey" && id) {
    selectedJourneyEntryId = id;
    journeyModalEditId = "";
    renderJourney();
    return;
  }
  if (action === "close-journey-modal") {
    closeJourneyModal();
    return;
  }
  if (action === "edit-journey" && id) {
    const entry = state.journey.entries.find((item) => item.id === id);
    if (entry && canManageJourneyEntry(entry)) {
      selectedJourneyEntryId = id;
      journeyModalEditId = id;
      renderJourney();
    }
    return;
  }
  if (action === "cancel-journey-edit") {
    journeyModalEditId = "";
    renderJourney();
    return;
  }
  if (action === "clear-journey-modal-image") {
    const image = $("#journeyModalImage");
    const upload = $("#journeyModalImageUpload");
    if (image) image.value = "";
    if (upload) upload.value = "";
    renderImagePreview("journeyModalImagePreview", "");
    return;
  }
  if (action === "delete-journey" && id) {
    const entry = state.journey.entries.find((item) => item.id === id);
    if (!entry || !canManageJourneyEntry(entry)) {
      return;
    }
    if (confirm(`Remover ${entry.title} da Jornada?`)) {
      addDeletedRecord("journeyEntry", id);
      state.journey.entries = state.journey.entries.filter((item) => item.id !== id);
      if (selectedJourneyEntryId === id) {
        selectedJourneyEntryId = "";
        journeyModalEditId = "";
      }
      saveState();
      renderJourney();
      showToast("Lembrança removida.");
    }
    return;
  }
  if (action === "delete-journey-comment") {
    deleteJourneyComment(button.dataset.entryId, button.dataset.commentId);
  }
}

function handleJourneyDetailChange(event) {
  if (event.target?.id === "journeyModalImageUpload") {
    handleImageUpload(event, "journeyModalImage", "journeyModalImagePreview");
  }
}

function saveJourneyModalEdit(event) {
  if (!event.target.classList.contains("journey-modal-edit-form")) {
    return;
  }
  event.preventDefault();
  const entry = state.journey.entries.find((item) => item.id === event.target.dataset.entryId);
  if (!entry || !canManageJourneyEntry(entry)) {
    showToast("VocÃª sÃ³ pode editar lembranÃ§as que criou.");
    return;
  }
  const title = event.target.elements.title?.value.trim() || "";
  if (!title) {
    showToast("Informe um tÃ­tulo para a lembranÃ§a.");
    return;
  }
  const index = state.journey.entries.findIndex((item) => item.id === entry.id);
  state.journey.entries[index] = {
    ...entry,
    title,
    level: normalizeJourneyLevel(event.target.elements.level?.value),
    image: $("#journeyModalImage")?.value || "",
    description: event.target.elements.description?.value.trim() || "",
    updatedAt: Date.now()
  };
  journeyModalEditId = "";
  saveState();
  renderJourney();
  showToast("LembranÃ§a atualizada.");
}

function handleJourneyCommentSubmit(event) {
  if (!event.target.classList.contains("journey-comment-form")) {
    return;
  }
  event.preventDefault();
  if (!isAuthenticated()) {
    showToast("Faça login para comentar.");
    return;
  }
  const entry = state.journey.entries.find((item) => item.id === event.target.dataset.entryId);
  const textarea = event.target.elements.comment;
  const text = textarea?.value.trim() || "";
  if (!entry || !text) {
    return;
  }
  const user = getActiveUser();
  const hero = getCampfireHeroForUser(user.id);
  entry.comments.push({
    id: createId("journey-comment"),
    text,
    userId: user.id,
    userName: user.name,
    heroId: hero?.id || "",
    heroName: hero?.characterName || "",
    createdAt: Date.now()
  });
  textarea.value = "";
  saveState();
  renderJourney();
  showToast("Comentário adicionado.");
}

function handleJourneyKeydown(event) {
  if (event.key === "Escape" && selectedJourneyEntryId) {
    closeJourneyModal();
  }
}

function closeJourneyModal() {
  selectedJourneyEntryId = "";
  journeyModalEditId = "";
  renderJourney();
}

function loadJourneyEntry(id) {
  const entry = state.journey.entries.find((item) => item.id === id);
  if (!entry || !canManageJourneyEntry(entry)) {
    return;
  }
  $("#journeyEntryId").value = entry.id;
  $("#journeyTitle").value = entry.title;
  $("#journeyLevel").value = entry.level;
  $("#journeyImage").value = entry.image || "";
  $("#journeyDescription").value = entry.description || "";
  $("#journeyFormTitle").textContent = "Editar lembrança";
  $("#journeyImageUpload").value = "";
  renderImagePreview("journeyImagePreview", entry.image || "");
  toggleComposer("journey", true, { silent: true });
  renderJourney();
}

function clearJourneyForm(options = {}) {
  $("#journeyEntryId").value = "";
  $("#journeyTitle").value = "";
  $("#journeyLevel").value = "";
  $("#journeyImage").value = "";
  $("#journeyImageUpload").value = "";
  $("#journeyDescription").value = "";
  $("#journeyFormTitle").textContent = "Nova lembrança";
  renderImagePreview("journeyImagePreview", "");
  if (!options.keepOpen) {
    renderJourney();
  }
}

function clearJourneyImage() {
  $("#journeyImage").value = "";
  $("#journeyImageUpload").value = "";
  renderImagePreview("journeyImagePreview", "");
}

function deleteJourneyComment(entryId, commentId) {
  const entry = state.journey.entries.find((item) => item.id === entryId);
  const comment = entry?.comments.find((item) => item.id === commentId);
  if (!entry || !comment || !canManageJourneyComment(comment)) {
    return;
  }
  if (confirm("Remover este comentário?")) {
    addDeletedRecord("journeyComment", comment.id);
    entry.comments = entry.comments.filter((item) => item.id !== comment.id);
    saveState();
    renderJourney();
    showToast("Comentário removido.");
  }
}

function canManageJourneyEntry(entry) {
  return Boolean(entry) && (isAdmin() || entry.createdByUserId === getActiveUserId());
}

function canManageJourneyComment(comment) {
  return Boolean(comment) && (isAdmin() || comment.userId === getActiveUserId());
}

function renderCampfire() {
  const galleryCount = $("#campfireGalleryCount");
  const introNote = $("#campfireNoteSummary");
  const noteField = $("#campfireLegionNotes");
  const ownBoard = $("#campfireOwnGoals");
  const gallery = $("#campfireGallery");
  if (!ownBoard || !gallery) {
    return;
  }

  const hero = getCampfireEditorHero();
  const canEditHero = canManageCampfireHero(hero);
  const heroIdField = $("#campfireHeroId");
  const heroNameField = $("#campfireCharacterName");
  const heroImageField = $("#campfireHeroImage");
  const heroImagePreview = $("#campfireHeroImagePreview");
  const ownerField = $("#campfireHeroOwnerField");
  const ownerSelect = $("#campfireHeroOwnerUserId");
  const formTitle = $("#campfireFormTitle");
  const goalFormFields = [
    $("#campfireGoalCategory"),
    $("#campfireGoalText"),
    $("#campfireGoalSecret"),
    $("#campfireGoalForm button[type='submit']")
  ].filter(Boolean);

  if (ownerField) {
    ownerField.hidden = !isAdmin();
  }
  if (ownerSelect) {
    const options = [
      `<option value="">Sem vínculo</option>`,
      ...state.users
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.role === userRoles.admin ? "Mestre" : "Jogador")})</option>`)
    ].join("");
    if (ownerSelect.__codexOptions !== options) {
      ownerSelect.innerHTML = options;
      ownerSelect.__codexOptions = options;
    }
  }

  if (heroIdField) {
    heroIdField.value = hero?.id || "";
  }
  if (heroNameField && hero && heroNameField.value !== hero.characterName) {
    heroNameField.value = hero.characterName;
  }
  if (heroNameField && !hero && heroNameField.value) {
    heroNameField.value = "";
  }
  if (heroImageField && !hero && heroImageField.value) {
    heroImageField.value = "";
  }
  if (heroImageField && hero && heroImageField.value !== hero.image) {
    heroImageField.value = hero.image || "";
  }
  if (heroImagePreview && heroImagePreview.__codexImage !== (hero?.image || "")) {
    heroImagePreview.__codexImage = hero?.image || "";
    renderImagePreview("campfireHeroImagePreview", hero?.image || "");
  }
  if (heroImagePreview && !hero && heroImagePreview.__codexImage) {
    heroImagePreview.__codexImage = "";
    renderImagePreview("campfireHeroImagePreview", "");
  }
  if (ownerSelect) {
    const ownerValue = hero?.ownerUserId || "";
    if (ownerSelect.value !== ownerValue) {
      ownerSelect.value = ownerValue;
    }
  }
  if (formTitle) {
    formTitle.textContent = hero ? "Personagem da fogueira" : "Cadastrar personagem";
  }
  goalFormFields.forEach((element) => {
    element.disabled = !canEditHero;
  });
  if (noteField && noteField.value !== state.campfire.legionNotes) {
    noteField.value = state.campfire.legionNotes || "";
  }
  if (galleryCount) {
    galleryCount.textContent = `${state.campfire.heroes.length} card${state.campfire.heroes.length === 1 ? "" : "s"}`;
  }
  if (introNote) {
    introNote.textContent = state.campfire.legionNotes || "Minimus Legio ainda não recebeu anotações.";
  }

  const boardKey = getCacheKey(
    state.revision,
    hero?.id || "none",
    hero?.updatedAt || 0,
    canEditHero ? "edit" : "view",
    hero?.goals.length || 0
  );
  const boardHtml = getCachedValue(renderCache.campfireBoardHtml, boardKey, () => renderCampfireHeroBoard(hero, canEditHero));
  setHtmlIfChanged(ownBoard, boardHtml);

  const galleryKey = getCacheKey(state.revision, getActiveUserId() || "", isAdmin() ? "admin" : "player");
  const galleryHtml = getCachedValue(renderCache.campfireGalleryHtml, galleryKey, () => renderCampfireGallery());
  setHtmlIfChanged(gallery, galleryHtml);
}

function renderCampfireHeroBoard(hero, canEditHero) {
  if (!hero) {
    return renderEmpty("Cadastre seu personagem", "Salve o nome do personagem para liberar os objetivos e a galeria pessoal.");
  }
  const ownerLabel = hero.ownerUserId ? (getUserById(hero.ownerUserId)?.name || hero.ownerName || "Jogador") : (hero.ownerName || "Exemplo da mesa");
  const counts = ["short", "medium", "long"].map((category) => {
    const total = hero.goals.filter((goal) => goal.category === category).length;
    return `<span class="chip">${escapeHtml(campfireGoalCategories[category])}: ${total}</span>`;
  }).join("");
  return `
    <div class="campfire-board">
      <section class="campfire-board-head">
        <div>
          <p class="eyebrow">Fogueira ativa</p>
          <h3>${escapeHtml(hero.characterName)}</h3>
          <p class="muted">Vinculado a ${escapeHtml(ownerLabel)}.</p>
        </div>
        <div class="chip-row">
          ${counts}
          ${canEditHero && hero.goals.some((goal) => goal.secret) ? `<span class="chip warn">Segredos guardados</span>` : ""}
        </div>
      </section>
      <div class="campfire-goal-columns">
        ${["short", "medium", "long"].map((category) => renderCampfireGoalColumn(hero, category, canEditHero)).join("")}
      </div>
    </div>
  `;
}

function renderCampfireGoalColumn(hero, category, canEditHero) {
  const goals = hero.goals
    .filter((goal) => goal.category === category)
    .sort((a, b) => a.updatedAt - b.updatedAt || a.createdAt - b.createdAt);
  return `
    <article class="campfire-lane lane-${category}">
      <header>
        <div>
          <p class="eyebrow">${escapeHtml(campfireGoalCategories[category])}</p>
          <h4>${goals.length} objetivo${goals.length === 1 ? "" : "s"}</h4>
        </div>
      </header>
      <div class="campfire-goal-list">
        ${goals.length
          ? goals.map((goal) => renderCampfireGoalItem(hero, goal, canEditHero)).join("")
          : renderEmpty("Sem objetivos", "Ainda não há anotações nesta categoria.")}
      </div>
    </article>
  `;
}

function renderCampfireGoalItem(hero, goal, canEditHero) {
  const secret = goal.secret ? `<span class="chip warn campfire-secret-chip">Secreto</span>` : "";
  const categoryClass = `goal-${goal.category}`;
  const actions = canEditHero ? `
    <div class="card-actions">
      <button class="icon-button" type="button" title="Editar objetivo" data-action="edit-campfire-goal" data-hero-id="${escapeAttr(hero.id)}" data-goal-id="${escapeAttr(goal.id)}">✎</button>
      <button class="icon-button" type="button" title="Remover objetivo" data-action="delete-campfire-goal" data-hero-id="${escapeAttr(hero.id)}" data-goal-id="${escapeAttr(goal.id)}">✕</button>
    </div>
  ` : "";
  return `
    <article class="campfire-goal-item ${categoryClass} ${goal.secret ? "secret" : ""}">
      <div class="campfire-goal-copy">
        <div class="chip-row compact">
          <span class="chip">${escapeHtml(campfireGoalCategories[goal.category])}</span>
          ${secret}
        </div>
        <p>${escapeHtml(goal.text)}</p>
      </div>
      ${actions}
    </article>
  `;
}

function renderCampfireGallery() {
  const heroes = [...state.campfire.heroes].sort((a, b) => {
    const activeId = getActiveUserId();
    if (a.ownerUserId === activeId) {
      return -1;
    }
    if (b.ownerUserId === activeId) {
      return 1;
    }
    return b.updatedAt - a.updatedAt || a.characterName.localeCompare(b.characterName, "pt-BR");
  });
  return heroes.length
    ? heroes.map((hero) => renderCampfireHeroCard(hero)).join("")
    : renderEmpty("Sem personagens na fogueira", "Quando os jogadores preencherem seus perfis, os objetivos aparecerão aqui.");
}

function renderCampfireHeroCard(hero) {
  const ownerLabel = hero.ownerUserId ? (getUserById(hero.ownerUserId)?.name || hero.ownerName || "Jogador") : (hero.ownerName || "Exemplo da mesa");
  const selectedHeroId = $("#campfireHeroId")?.value || "";
  const isSelectedHero = selectedHeroId ? hero.id === selectedHeroId : false;
  const isOwnHero = hero.ownerUserId === getActiveUserId();
  const isActiveHero = isSelectedHero || (!selectedHeroId && isOwnHero);
  const canEditHero = canManageCampfireHero(hero);
  const canSeeSecrets = canSeeCampfireSecrets(hero);
  const visibleGoals = hero.goals
    .filter((goal) => canSeeSecrets || !goal.secret)
    .sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || a.updatedAt - b.updatedAt);
  const secretCount = canSeeSecrets ? hero.goals.filter((goal) => goal.secret).length : 0;
  const statusLabel = isOwnHero ? "Seu personagem" : "";
  const actions = canEditHero ? `
    <div class="card-actions">
      <button class="icon-button" type="button" title="Editar personagem" data-action="edit-campfire-hero" data-hero-id="${escapeAttr(hero.id)}">✎</button>
      <button class="icon-button" type="button" title="Remover personagem" data-action="delete-campfire-hero" data-hero-id="${escapeAttr(hero.id)}">✕</button>
    </div>
  ` : "";
  return `
    <article class="hero-card ${isActiveHero ? "active" : ""}">
      <header>
        <div class="hero-avatar ${hero.image ? "has-image" : ""}" aria-hidden="true">
          ${hero.image ? `<img src="${escapeAttr(hero.image)}" alt="${escapeAttr(hero.characterName)}">` : `<span>${escapeHtml(getInitials(hero.characterName))}</span>`}
        </div>
        <div class="hero-headline">
          <h3>${escapeHtml(hero.characterName)}</h3>
          <div class="chip-row">
            ${statusLabel ? `<span class="chip income">${escapeHtml(statusLabel)}</span>` : ""}
            <span class="chip">${escapeHtml(ownerLabel)}</span>
            ${canSeeSecrets && secretCount ? `<span class="chip warn">${secretCount} secreto${secretCount === 1 ? "" : "s"}</span>` : ""}
          </div>
        </div>
        ${actions}
      </header>
      <div class="hero-goal-columns">
        ${["short", "medium", "long"].map((category) => {
          const goals = visibleGoals.filter((goal) => goal.category === category);
          return `
            <section class="hero-goal-column">
              <div class="hero-goal-column-head">
                <strong>${escapeHtml(campfireGoalCategories[category])}</strong>
                <span>${goals.length}</span>
              </div>
              <div class="hero-goal-items">
                ${goals.length
                  ? goals.map((goal) => `
                      <article class="hero-goal-chip goal-${goal.category} ${goal.secret ? "secret" : ""}">
                        <span>${escapeHtml(goal.text)}</span>
                        ${canSeeSecrets && goal.secret ? `<em>Secreto</em>` : ""}
                      </article>
                    `).join("")
                  : `<div class="hero-goal-empty">Nada visível.</div>`}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function openNewCampfireHeroForm() {
  toggleComposer("campfire", true, { silent: true });
  clearCampfireHeroForm();
  const body = $("#campfireComposerBody");
  if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadCampfireHero(heroId) {
  const hero = getCampfireHeroById(heroId);
  if (!hero || !canManageCampfireHero(hero)) {
    return false;
  }
  $("#campfireHeroId").value = hero.id;
  $("#campfireCharacterName").value = hero.characterName;
  $("#campfireHeroImage").value = hero.image || "";
  const ownerSelect = $("#campfireHeroOwnerUserId");
  if (ownerSelect) {
    ownerSelect.value = hero.ownerUserId || "";
  }
  renderImagePreview("campfireHeroImagePreview", hero.image || "");
  $("#campfireFormTitle").textContent = "Personagem da fogueira";
  clearCampfireGoalForm({ silent: true });
  toggleComposer("campfire", true, { silent: true });
  renderCampfire();
  return true;
}

function saveCampfireHero(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    showToast("Faça login para usar a fogueira.");
    return;
  }
  const name = $("#campfireCharacterName").value.trim();
  if (!name) {
    showToast("Informe o nome do personagem.");
    return;
  }
  const selectedId = $("#campfireHeroId").value;
  const selectedHero = selectedId ? getCampfireHeroById(selectedId) : null;
  const ownHero = getCampfireHeroForUser(getActiveUserId());
  const currentHero = selectedHero && canManageCampfireHero(selectedHero) ? selectedHero : (isAdmin() ? null : ownHero);
  if (selectedHero && !canManageCampfireHero(selectedHero)) {
    showToast("Você só pode editar o seu próprio personagem.");
    return;
  }
  const payload = {
    id: currentHero?.id || createId("hero"),
    ownerUserId: isAdmin() ? ($("#campfireHeroOwnerUserId").value || "") : getActiveUserId(),
    ownerName: isAdmin()
      ? (getUserById($("#campfireHeroOwnerUserId").value || "")?.name || currentHero?.ownerName || "Exemplo da mesa")
      : (currentHero?.ownerName || getActiveUser().name),
    characterName: name,
    image: $("#campfireHeroImage").value || "",
    goals: currentHero?.goals || [],
    updatedAt: Date.now()
  };
  const index = state.campfire.heroes.findIndex((hero) => hero.id === payload.id);
  if (index >= 0) {
    state.campfire.heroes[index] = payload;
  } else {
    state.campfire.heroes.push(payload);
  }
  $("#campfireHeroId").value = payload.id;
  saveState();
  renderCampfire();
  showToast("Personagem da fogueira salvo.");
}

function clearCampfireHeroForm() {
  const ownHero = isAdmin() ? null : getCampfireHeroForUser(getActiveUserId());
  $("#campfireHeroId").value = ownHero?.id || "";
  $("#campfireCharacterName").value = ownHero?.characterName || "";
  $("#campfireHeroImage").value = ownHero?.image || "";
  const ownerSelect = $("#campfireHeroOwnerUserId");
  if (ownerSelect) ownerSelect.value = ownHero?.ownerUserId || "";
  $("#campfireHeroImageUpload").value = "";
  renderImagePreview("campfireHeroImagePreview", ownHero?.image || "");
  $("#campfireFormTitle").textContent = ownHero ? "Personagem da fogueira" : "Novo personagem";
  clearCampfireGoalForm({ silent: true });
  renderCampfire();
}

function clearCampfireHeroImage() {
  $("#campfireHeroImage").value = "";
  $("#campfireHeroImageUpload").value = "";
  renderImagePreview("campfireHeroImagePreview", "");
}

function saveCampfireGoal(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    showToast("Faça login para usar a fogueira.");
    return;
  }
  const heroId = $("#campfireHeroId").value;
  const hero = heroId ? getCampfireHeroById(heroId) : getCampfireHeroForUser(getActiveUserId());
  if (!hero || !canManageCampfireHero(hero)) {
    showToast("Cadastre ou selecione o seu personagem primeiro.");
    return;
  }
  const goalText = $("#campfireGoalText").value.trim();
  if (!goalText) {
    showToast("Escreva o objetivo antes de salvar.");
    return;
  }
  const goalId = $("#campfireGoalId").value;
  const existing = goalId ? hero.goals.find((goal) => goal.id === goalId) : null;
  const payload = {
    id: existing?.id || createId("goal"),
    category: $("#campfireGoalCategory").value,
    text: goalText,
    secret: $("#campfireGoalSecret").checked,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  const heroIndex = state.campfire.heroes.findIndex((item) => item.id === hero.id);
  if (heroIndex < 0) {
    return;
  }
  const heroPayload = state.campfire.heroes[heroIndex];
  const goalIndex = heroPayload.goals.findIndex((goal) => goal.id === payload.id);
  if (goalIndex >= 0) {
    heroPayload.goals[goalIndex] = payload;
  } else {
    heroPayload.goals.push(payload);
  }
  saveState();
  clearCampfireGoalForm({ silent: true });
  renderCampfire();
  showToast("Objetivo salvo.");
}

function clearCampfireGoalForm(options = {}) {
  $("#campfireGoalId").value = "";
  $("#campfireGoalCategory").value = "short";
  $("#campfireGoalText").value = "";
  $("#campfireGoalSecret").checked = false;
  const hero = getCampfireEditorHero();
  const enabled = Boolean(hero) && canManageCampfireHero(hero);
  $("#campfireGoalCategory").disabled = !enabled;
  $("#campfireGoalText").disabled = !enabled;
  $("#campfireGoalSecret").disabled = !enabled;
  $("#campfireGoalForm button[type='submit']").disabled = !enabled;
  if (!options.silent) {
    renderCampfire();
  }
}

function saveCampfireLegionNotes(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    showToast("Faça login para editar o Minimus Legio.");
    return;
  }
  state.campfire.legionNotes = $("#campfireLegionNotes").value.trim();
  saveState();
  renderCampfire();
  showToast("Anotações do Minimus Legio salvas.");
}

function handleCampfireAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const heroId = button.dataset.heroId;
  const goalId = button.dataset.goalId;
  if (button.dataset.action === "edit-campfire-hero" && heroId) {
    loadCampfireHero(heroId);
    return;
  }
  if (button.dataset.action === "delete-campfire-hero" && heroId) {
    const hero = getCampfireHeroById(heroId);
    if (!hero || !canManageCampfireHero(hero)) {
      return;
    }
    if (confirm(`Remover o personagem ${hero.characterName}?`)) {
      addDeletedRecord("campfireHero", hero.id);
      state.campfire.heroes = state.campfire.heroes.filter((item) => item.id !== hero.id);
      if ($("#campfireHeroId").value === hero.id) {
        clearCampfireHeroForm();
      }
      saveState();
      renderCampfire();
      showToast("Personagem removido.");
    }
    return;
  }
  if (button.dataset.action === "edit-campfire-goal" && heroId && goalId) {
    const hero = getCampfireHeroById(heroId);
    const goal = hero?.goals.find((item) => item.id === goalId);
    if (!hero || !goal || !canManageCampfireHero(hero)) {
      return;
    }
    $("#campfireHeroId").value = hero.id;
    $("#campfireCharacterName").value = hero.characterName;
    $("#campfireGoalId").value = goal.id;
    $("#campfireGoalCategory").value = goal.category;
    $("#campfireGoalText").value = goal.text;
    $("#campfireGoalSecret").checked = goal.secret;
    $("#campfireFormTitle").textContent = "Personagem da fogueira";
    toggleComposer("campfire", true, { silent: true });
    renderCampfire();
    return;
  }
  if (button.dataset.action === "delete-campfire-goal" && heroId && goalId) {
    const hero = getCampfireHeroById(heroId);
    if (!hero || !canManageCampfireHero(hero)) {
      return;
    }
    if (confirm("Remover este objetivo?")) {
      addDeletedRecord("campfireGoal", goalId);
      hero.goals = hero.goals.filter((goal) => goal.id !== goalId);
      saveState();
      renderCampfire();
      showToast("Objetivo removido.");
    }
  }
}

