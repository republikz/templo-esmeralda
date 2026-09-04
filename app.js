"use strict";

const STORAGE_KEY = "pf2e-base-manager-v1";
const SESSION_KEY = "pf2e-base-manager-session-v1";
const STATE_API_URL = "/api/state";
const SEED_STATE_URL = "./campaign-state.json";
const CATALOG_URL = document.querySelector('meta[name="catalog-url"]')?.content || "table-data.json";
const CATALOG_WORKER_URL = document.querySelector('meta[name="catalog-worker-url"]')?.content || "catalog-worker.js";
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
  map: "Mapa da Base",
  missions: "Missões & Rumores",
  timeline: "Linha do Tempo",
  trophies: "Mural de Troféus",
  market: "Mercado Esmeralda",
  settings: "Configurações"
};

const campfireGoalCategories = {
  short: "Curto Prazo",
  medium: "Médio Prazo",
  long: "Longo Prazo"
};

const faithPointRulesDisplay = {
  title: "Ponto de F\u00e9",
  level: "Spell 12",
  traits: ["Rare", "Concentrate", "Divine", "Manipulate"],
  basics: [
    ["Tradi\u00e7\u00e3o", "divina"],
    ["Conjura\u00e7\u00e3o", "3 a\u00e7\u00f5es: material, som\u00e1tica e verbal"],
    ["Alcance", "ilimitado"]
  ],
  description: "Selecione o Fragmento Maior ou Menor cujo pedido ser\u00e1 direcionado. A sua rela\u00e7\u00e3o com o ser divino interfere diretamente nas consequ\u00eancias dos efeitos. Cada indiv\u00edduo possui uma quantidade determinada de Pontos de F\u00e9; quando utilizados, eles n\u00e3o retornam automaticamente e s\u00f3 podem ser readquiridos por concess\u00e3o direta de um ser divino.",
  activations: [
    "Voc\u00ea extrai segredos dos fundamentos da magia e pode duplicar uma magia de 9\u00ba n\u00edvel ou inferior da tradi\u00e7\u00e3o que conjura, ou uma magia de 7\u00ba n\u00edvel ou inferior de qualquer tradi\u00e7\u00e3o, mesmo que n\u00e3o conjure magias. O Mestre pode permitir op\u00e7\u00f5es mais amplas.",
    "Voc\u00ea declara seu pedido em voz alta, suplicando ao divino. O pedido pode ir de favores simples a grandes riquezas, desejos maiores ou destrui\u00e7\u00e3o de um reino inteiro. O resultado depende do ser divino e de seus interesses."
  ],
  outcomes: [
    ["Sucesso Cr\u00edtico", "20", "O pedido \u00e9 recebido pelo divino com tanto poder que ele se sente obrigado a agir. O pedido recebe maior prioridade e costuma trazer consequ\u00eancias ben\u00e9ficas."],
    ["Sucesso", "10-19", "A ativa\u00e7\u00e3o 1 ocorre sem consequ\u00eancia negativa. A ativa\u00e7\u00e3o 2 \u00e9 atendida na medida do poss\u00edvel e da vontade do divino, ainda podendo gerar efeitos imprevis\u00edveis."],
    ["Falha", "02-09", "O pedido tem grandes chances de falhar ou ser atendido de forma incompleta. Ainda pode ser atendido, mas com consequ\u00eancia dr\u00e1stica e inesperada."],
    ["Falha Cr\u00edtica", "01", "O pedido \u00e9 corrompido, interpretado de forma contr\u00e1ria pelo divino ou recebido por outro ser divino. Geralmente surgem consequ\u00eancias cru\u00e9is e inesperadas."]
  ]
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
const AUTH_API_BASE = "/api/auth";
const SYNC_INTERVAL_MS = 60000;
const MIN_SYNC_GAP_MS = 15000;
const INVESTIGATION_BOARD_MIN_WIDTH = 1200;
const INVESTIGATION_BOARD_MIN_HEIGHT = 900;
const INVESTIGATION_BOARD_MAX_WIDTH = 5000;
const INVESTIGATION_BOARD_MAX_HEIGHT = 4000;
const INVESTIGATION_BOARD_MARGIN_X = 360;
const INVESTIGATION_BOARD_MARGIN_Y = 300;
const BASE_MAP_FLOORS = [
  { id: "ground", name: "Térreo", image: "assets/maps/mapa-terreo.jpg", imageWidth: 1920, imageHeight: 1437 },
  { id: "top", name: "Topo", image: "assets/maps/mapa-topo.jpg", imageWidth: 1918, imageHeight: 1437 },
  { id: "underground", name: "Subterrâneo", image: "assets/maps/mapa-subterraneo.jpg", imageWidth: 1920, imageHeight: 1435 }
];
// Legacy coordinate space stays readable without rewriting saved zones.
const BASE_MAP_COLUMNS = 48;
const BASE_MAP_ROWS = 36;
// The artwork has a 43.636px square grid; the bottom/right cells are cropped.
const MAP_GRID_PITCH = 1920 / 44;
const MAP_GRID_COLUMNS = 44;
const MAP_GRID_ROWS = 33;
const JOURNEY_CATEGORIES = {
  event: "Acontecimento",
  location: "Local",
  creature: "Criatura",
  character: "Personagem",
  faction: "Facção",
  relic: "Item / Relíquia"
};

let activeView = "dashboard";
let catalog = [];
let catalogLoaded = false;
let catalogLoadPromise = null;
let state = freshState();
let sessionUserId = null;
let sessionToken = null;
let sessionExpiresAt = 0;
let authReady = false;
let toastTimer = null;
let syncTimer = null;
let syncInFlight = false;
let lastPermissionKey = "";
let selectedNpcId = "";
let npcModalEditId = "";
let selectedRoomUpgradeId = "";
let selectedCalendarMonthIndex = null;
let selectedCalendarDay = null;
let selectedJourneyEntryId = "";
let journeyModalEditId = "";
let journeyCommentEditId = "";
let campfireNotesEditing = false;
let selectedInvestigationNoteId = "";
let investigationConnectMode = false;
let investigationConnectFromId = "";
let investigationDragState = null;
let investigationSuppressClick = false;
let pendingInvestigationDeleteId = "";
let investigationDragFrame = 0;
let selectedMapFloorId = "ground";
let selectedMapZoneId = "";
let mapZoom = 1;
let mapSelection = null;
let selectedMissionId = "";
let selectedTimelineId = "";
let selectedTrophyId = "";
let trophyRarityFilter = "all";
let npcDispositionFilter = "all";

function isLocalDevelopmentHost() {
  const host = window.location.hostname;
  return host === "localhost"
    || host === "127.0.0.1"
    || host === "0.0.0.0"
    || host.startsWith("192.168.")
    || host.startsWith("10.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}
let investigationFullscreen = false;
let dashboardFaithExpanded = false;
let faithUseConfirmOpen = false;
let mobileNavigationOpen = false;
let lastSyncedRevision = 0;
let lastSyncedStateSnapshot = null;
let lastSyncStartedAt = 0;

const renderCache = {
  calendarEntries: { key: "", value: [] },
  dueSources: { key: "", value: [] },
  combinedMarket: { key: "", value: [] },
  dashboardHeroHtml: { key: "", value: "" },
  dashboardFaithHtml: { key: "", value: "" },
  dashboardCalendarHtml: { key: "", value: "" },
  dashboardJourneyHtml: { key: "", value: "" },
  dashboardJourneyCommentsHtml: { key: "", value: "" },
  dashboardMarketHtml: { key: "", value: "" },
  recentLedgerHtml: { key: "", value: "" },
  roomsHtml: { key: "", value: "" },
  npcsHtml: { key: "", value: "" },
  npcDetailHtml: { key: "", value: "" },
  financeSourcesHtml: { key: "", value: "" },
  ledgerRowsHtml: { key: "", value: "" },
  calendarSummaryHtml: { key: "", value: "" },
  calendarMonthsHtml: { key: "", value: "" },
  campfireBoardHtml: { key: "", value: "" },
  campfireGalleryHtml: { key: "", value: "" },
  campfireInvestigationNotesHtml: { key: "", value: "" },
  campfireInvestigationLinksHtml: { key: "", value: "" },
  campfireInvestigationModalHtml: { key: "", value: "" },
  journeyGalleryHtml: { key: "", value: "" },
  journeyDetailHtml: { key: "", value: "" },
  baseMapHtml: { key: "", value: "" },
  mapZoneListHtml: { key: "", value: "" },
  missionsHtml: { key: "", value: "" },
  timelineHtml: { key: "", value: "" },
  trophiesHtml: { key: "", value: "" },
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

document.addEventListener("click", (event) => {
  const button = event.target.closest("#trophyRarityFilters [data-rarity]");
  if (!button) return;
  trophyRarityFilter = button.dataset.rarity || "all";
  renderTrophies();
});

async function init() {
  const hashView = window.location.hash.replace("#", "");
  if (viewTitles[hashView]) {
    activeView = hashView;
  }
  bindEvents();
  initializeDateSelects();
  initializeComposerState();
  restoreSession(false);
  state = await loadSharedState();
  restoreSession();
  populateStaticForms();
  applyActiveViewState();
  applyAuthState();
  render();
  startStateSync();
  if (activeView === "market") {
    void ensureCatalog();
  }
}

function getActiveUser() {
  const users = Array.isArray(state.users) ? state.users : [];
  return users.find((user) => user.id === sessionUserId) || null;
}

function getActiveUserId() {
  return sessionUserId || state.activeUserId || null;
}

function isAuthenticated() {
  return Boolean(sessionUserId && state.users.some((user) => user.id === sessionUserId));
}

function isAdmin() {
  return getActiveUser()?.role === userRoles.admin;
}

function getFaithPointsForUser(userId) {
  if (!userId) {
    return 0;
  }
  return (Array.isArray(state.faithTransactions) ? state.faithTransactions : [])
    .filter((transaction) => transaction.userId === userId)
    .reduce((total, transaction) => total + (Number.parseInt(transaction.amount, 10) || 0), 0);
}

function addFaithTransaction(userId, amount, reason) {
  const normalizedAmount = Number.parseInt(amount, 10);
  if (!userId || !Number.isFinite(normalizedAmount) || normalizedAmount === 0) {
    return null;
  }
  const transaction = normalizeFaithTransaction({
    id: createId("faith"),
    userId,
    amount: normalizedAmount,
    reason,
    createdByUserId: getActiveUserId() || "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  if (!transaction) {
    return null;
  }
  state.faithTransactions = Array.isArray(state.faithTransactions) ? state.faithTransactions : [];
  state.faithTransactions.push(transaction);
  return transaction;
}

function setFaithPointsForUser(userId, targetAmount, reason = "Ajuste do Mestre") {
  const target = Math.max(0, Number.parseInt(targetAmount, 10) || 0);
  const current = getFaithPointsForUser(userId);
  const delta = target - current;
  return delta === 0 ? null : addFaithTransaction(userId, delta, reason);
}

function canAccessView(view) {
  if (view === "settings") {
    return isAdmin();
  }
  return true;
}

function bindEvents() {
  const sidebarToggle = $("#sidebarToggle");
  if (sidebarToggle) sidebarToggle.addEventListener("click", toggleSidebar);
  $("#mobileNavToggle")?.addEventListener("click", () => setMobileNavigation(!mobileNavigationOpen));
  $("#sidebarScrim")?.addEventListener("click", () => setMobileNavigation(false));
  const logoutButton = $("#logoutButton");
  if (logoutButton) logoutButton.addEventListener("click", logout);
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
    applyCompletedRoomUpgrades({ silent: true });
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
  $("#roomUpgradeModal")?.addEventListener("click", handleRoomUpgradeAction);
  $("#roomUpgradeDetail")?.addEventListener("click", handleRoomUpgradeAction);

  $("#npcForm").addEventListener("submit", saveNpc);
  $("#toggleNpcComposer").addEventListener("click", () => toggleComposer("npc"));
  $("#cancelNpcEdit").addEventListener("click", () => {
    clearNpcForm();
    toggleComposer("npc", false);
  });
  $("#clearNpcImage").addEventListener("click", clearNpcImage);
  $("#npcImageUpload").addEventListener("change", (event) => handleImageUpload(event, "npcImage", "npcImagePreview"));
  $("#npcSearch").addEventListener("input", refreshNpcs);
  $("#npcDispositionFilters")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-disposition]");
    if (!chip) return;
    npcDispositionFilter = chip.dataset.disposition;
    renderNpcs();
  });
  $("#npcSort").addEventListener("change", renderNpcs);
  $("#npcList").addEventListener("click", handleNpcAction);
  $("#npcModal")?.addEventListener("click", handleNpcAction);
  $("#npcDetail")?.addEventListener("click", handleNpcAction);
  $("#npcDetail")?.addEventListener("change", handleNpcDetailChange);
  $("#npcDetail")?.addEventListener("submit", saveNpcModalEdit);

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
  $("#calendarControls")?.addEventListener("click", handleCalendarAction);
  $("#calendarMonths").addEventListener("click", handleCalendarAction);
  $("#calendarDayPanel")?.addEventListener("click", handleCalendarAction);

  $("#ledgerForm").addEventListener("submit", saveLedgerEntry);
  $("#ledgerTable").addEventListener("click", handleLedgerAction);

  $("#generateMarket").addEventListener("click", async () => {
    if (await ensureCatalog() && generateMarketStock()) {
      saveState();
      render();
      showToast("Estoque dos mercadores atualizado.");
    }
  });
  $("#refreshMarketDashboard").addEventListener("click", async () => {
    if (await ensureCatalog() && generateMarketStock()) {
      saveState();
      render();
      playMarketRestockAnimation();
      showToast("Mercado atualizado no painel.");
    }
  });
  $("#rerollMarket").addEventListener("click", async () => {
    if (await ensureCatalog() && generateMarketStock({ reroll: true })) {
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
  $("#dashboardCalendarGrid")?.addEventListener("click", handleDashboardAction);
  $("#dashboardCalendarAgenda")?.addEventListener("click", handleDashboardAction);
  $("#dashboardFaithPanel")?.addEventListener("click", handleFaithAction);
  $("#dashboardHeroPanel")?.addEventListener("click", (event) => {
    const badge = event.target.closest("[data-hero-trophy]");
    if (!badge) return;
    selectedTrophyId = badge.dataset.heroTrophy;
    showView("trophies");
  });
  $("#dashboardMarketList")?.addEventListener("click", handleDashboardAction);
  $("#dashboardJourneyList")?.addEventListener("click", handleDashboardAction);
  $("#dashboardJourneyCommentList")?.addEventListener("click", handleDashboardAction);
  $("#openJourneyDashboard")?.addEventListener("click", () => showView("journey"));

  $("#campfireHeroForm")?.addEventListener("submit", saveCampfireHero);
  $("#toggleCampfireComposer")?.addEventListener("click", toggleCampfireHeroComposer);
  $("#cancelCampfireHero")?.addEventListener("click", clearCampfireHeroForm);
  $("#campfireHeroImageUpload")?.addEventListener("change", (event) => handleImageUpload(event, "campfireHeroImage", "campfireHeroImagePreview"));
  $("#clearCampfireHeroImage")?.addEventListener("click", clearCampfireHeroImage);
  $("#campfireGoalForm")?.addEventListener("submit", saveCampfireGoal);
  $("#cancelCampfireGoalEdit")?.addEventListener("click", clearCampfireGoalForm);
  $("#campfireLegionForm")?.addEventListener("submit", saveCampfireLegionNotes);
  $("#toggleCampfireLegionEditor")?.addEventListener("click", () => toggleCampfireLegionEditor(true));
  $("#cancelCampfireLegionEdit")?.addEventListener("click", () => toggleCampfireLegionEditor(false));
  $("#newInvestigationNote")?.addEventListener("click", () => openInvestigationNoteModal(""));
  $("#connectInvestigationNotes")?.addEventListener("click", startInvestigationConnectMode);
  $("#cancelInvestigationConnect")?.addEventListener("click", cancelInvestigationConnectMode);
  $("#fullscreenInvestigationBoard")?.addEventListener("click", toggleInvestigationFullscreen);
  $("#campfireInvestigationBoard")?.addEventListener("click", handleInvestigationBoardAction);
  $("#campfireInvestigationBoard")?.addEventListener("pointerdown", handleInvestigationPointerDown);
  $("#campfireInvestigationModal")?.addEventListener("click", handleInvestigationModalAction);
  $("#campfireInvestigationModal")?.addEventListener("submit", saveInvestigationNote);
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
  $("#journeyCategoryFilter")?.addEventListener("change", renderJourney);
  $("#journeySort")?.addEventListener("change", renderJourney);
  $("#view-journey")?.addEventListener("click", event => {
    const category = event.target.closest("[data-journey-category]");
    const sort = event.target.closest("[data-journey-sort]");
    if (!category && !sort) return;
    if (category) $("#journeyCategoryFilter").value = category.dataset.journeyCategory;
    if (sort) $("#journeySort").value = sort.dataset.journeySort;
    renderJourney();
  });
  $("#journeyGallery")?.addEventListener("click", handleJourneyAction);
  $("#journeyModal")?.addEventListener("click", handleJourneyAction);
  $("#journeyDetail")?.addEventListener("click", handleJourneyAction);
  $("#journeyDetail")?.addEventListener("change", handleJourneyDetailChange);
  $("#journeyDetail")?.addEventListener("submit", saveJourneyModalEdit);
  $("#journeyDetail")?.addEventListener("submit", handleJourneyCommentSubmit);
  document.addEventListener("keydown", handleJourneyKeydown);
  document.addEventListener("keydown", handleNpcKeydown);
  document.addEventListener("keydown", handleRoomUpgradeKeydown);
  document.addEventListener("keydown", handleInvestigationKeydown);

  $("#mapFloorControls")?.addEventListener("click", handleMapControlAction);
  $("#mapZoomIn")?.addEventListener("click", () => setMapZoom(mapZoom + 0.2));
  $("#mapZoomOut")?.addEventListener("click", () => setMapZoom(mapZoom - 0.2));
  $("#mapZoomReset")?.addEventListener("click", () => setMapZoom(1));
  $("#baseMapCanvas")?.addEventListener("pointerdown", handleMapPointerDown);
  $("#baseMapCanvas")?.addEventListener("pointermove", handleMapPointerMove);
  $("#baseMapCanvas")?.addEventListener("pointerup", handleMapPointerUp);
  $("#baseMapCanvas")?.addEventListener("pointercancel", handleMapPointerUp);
  $("#baseMapCanvas")?.addEventListener("click", handleMapCanvasAction);
  $("#baseMapZoneList")?.addEventListener("click", handleMapCanvasAction);
  $("#newMapZone")?.addEventListener("click", () => openMapZoneModal("", { x: 0, y: 0, width: 1, height: 1 }));
  $("#mapZoneModal")?.addEventListener("click", handleMapZoneModalAction);
  $("#mapZoneDetail")?.addEventListener("submit", saveMapZone);

  $("#toggleMissionComposer")?.addEventListener("click", () => toggleCampaignComposer("mission", true));
  $("#missionForm")?.addEventListener("submit", saveMission);
  $("#cancelMissionEdit")?.addEventListener("click", clearMissionForm);
  $("#missionSearch")?.addEventListener("input", debounce(renderMissions, 80));
  $("#missionTypeFilter")?.addEventListener("change", renderMissions);
  $("#missionStatusFilter")?.addEventListener("change", renderMissions);
  $("#missionList")?.addEventListener("click", handleMissionAction);

  $("#toggleTimelineComposer")?.addEventListener("click", () => toggleCampaignComposer("timeline", true));
  $("#timelineForm")?.addEventListener("submit", saveTimelineEntry);
  $("#cancelTimelineEdit")?.addEventListener("click", clearTimelineForm);
  $("#timelineSearch")?.addEventListener("input", debounce(renderTimeline, 80));
  $("#timelineEraFilter")?.addEventListener("change", renderTimeline);
  $("#timelineTypeFilter")?.addEventListener("change", renderTimeline);
  $("#timelineList")?.addEventListener("click", handleTimelineAction);
  $("#timelineEntryModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) { selectedTimelineId = ""; event.currentTarget.close(); }
    else handleTimelineAction(event);
  });
  $("#timelineEntryModal")?.addEventListener("close", () => { selectedTimelineId = ""; });
  $("#timelineDay")?.addEventListener("input", renderTimelineDayPreview);
  $("#timelineMonth")?.addEventListener("change", renderTimelineDayPreview);

  document.addEventListener("change", handleReferencePickerChange);
  document.addEventListener("input", handleReferencePickerSearch);
  $("#missionType")?.addEventListener("change", updateMissionFields);
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-mission-ref-category], [data-mission-ref-remove]");
    if (!button) return;
    const picker = button.closest(".reference-picker");
    if (button.hasAttribute("data-mission-ref-category")) picker.dataset.category = button.dataset.missionRefCategory;
    else {
      const option = [...$("#missionReferences").options].find(item => item.value === button.dataset.missionRefRemove);
      if (option) option.selected = false;
    }
    renderMissionReferencePicker(picker, $("#missionReferences"));
  });

  $("#toggleTrophyComposer")?.addEventListener("click", () => toggleCampaignComposer("trophy", true));
  $("#trophyForm")?.addEventListener("submit", saveTrophy);
  $("#cancelTrophyEdit")?.addEventListener("click", clearTrophyForm);
  $("#trophyImageUpload")?.addEventListener("change", (event) => handleImageUpload(event, "trophyImage", "trophyImagePreview"));
  $("#trophySearch")?.addEventListener("input", debounce(renderTrophies, 80));
  $("#trophyList")?.addEventListener("click", handleTrophyAction);
  $("#trophyModal")?.addEventListener("click", handleTrophyAction);

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
    "eventMonth",
    "timelineMonth",
    "trophyMonth"
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
  if (catalogLoadPromise) {
    return catalogLoadPromise;
  }
  const notice = $("#catalogNotice");
  catalogLoadPromise = (async () => {
    try {
      catalog = await loadCatalogInWorker();
      catalogLoaded = true;
      if (notice) notice.hidden = true;
      autoRestockIfDue();
      if (activeView === "market") renderMarket();
      return true;
    } catch (error) {
      catalogLoaded = false;
      catalogLoadPromise = null;
      if (notice) {
        notice.hidden = false;
        notice.textContent = "Catálogo de itens não encontrado. Coloque table-data.json junto ao index.html e abra pelo servidor local.";
      }
      if (activeView === "market") renderMarket();
      return false;
    }
  })();
  return catalogLoadPromise;
}

function loadCatalogInWorker() {
  if (!window.Worker) {
    return loadCatalogOnMainThread();
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(CATALOG_WORKER_URL);
    const finish = () => worker.terminate();
    worker.addEventListener("message", (event) => {
      finish();
      if (event.data?.ok && Array.isArray(event.data.items)) {
        resolve(event.data.items);
      } else {
        reject(new Error(event.data?.error || "Falha ao preparar o catálogo."));
      }
    }, { once: true });
    worker.addEventListener("error", () => {
      finish();
      loadCatalogOnMainThread().then(resolve, reject);
    }, { once: true });
    worker.postMessage({ url: CATALOG_URL, aonBaseUrl: AON_BASE_URL });
  });
}

async function loadCatalogOnMainThread() {
  const response = await fetch(CATALOG_URL, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const rawCatalog = await response.json();
  return rawCatalog
    .map(normalizeCatalogItem)
    .filter((item) => item.level >= 1 && item.level <= 15 && item.priceCopper > 0);
}

function ensureCatalog() {
  return catalogLoaded ? Promise.resolve(true) : loadCatalog();
}

function createBaseMapState() {
  return {
    floors: BASE_MAP_FLOORS.map((floor) => ({ ...floor, columns: BASE_MAP_COLUMNS, rows: BASE_MAP_ROWS, zones: [] }))
  };
}

function freshState() {
  const roomTavernId = createId("room");
  const maeraId = createId("npc");
  const dornId = createId("npc");
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
    users: [],
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
    faithTransactions: [],
    events: [],
    autoProcessRecurring: false,
    campfire: {
      legionNotes: "A chama do grupo ainda está sendo escrita. Guardem promessas, rastros e pactos que merecem voltar à mesa.",
    investigationBoard: {
      width: 1800,
      height: 1250,
      notes: [],
      links: []
    },
    heroes: [
        {
        id: masterHeroId,
          ownerUserId: "",
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
      notificationBaselineAt: Date.now(),
      reads: [],
      entries: []
    },
    baseMap: createBaseMapState(),
    missions: [],
    timeline: [],
    trophies: [],
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

function emptyState() {
  return {
    version: 1,
    currentDay: 1,
    startingBalanceCopper: 0,
    revision: 0,
    updatedAt: Date.now(),
    deletedRecords: [],
    activeUserId: null,
    users: [],
    rooms: [],
    npcs: [],
    financeSources: [],
    ledger: [],
    faithTransactions: [],
    events: [],
    autoProcessRecurring: false,
    campfire: {
      legionNotes: "",
      investigationBoard: {
        width: INVESTIGATION_BOARD_MIN_WIDTH,
        height: INVESTIGATION_BOARD_MIN_HEIGHT,
        notes: [],
        links: []
      },
      heroes: []
    },
    journey: {
      notificationBaselineAt: Date.now(),
      reads: [],
      entries: []
    },
    baseMap: createBaseMapState(),
    missions: [],
    timeline: [],
    trophies: [],
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
  if (!isLocalDevelopmentHost()) {
    return null;
  }
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

async function loadSharedState() {
  const isLocal = isLocalDevelopmentHost();
  const fallback = isLocal ? await loadLocalState() : null;
  if (!sessionToken && !isLocal) {
    return emptyState();
  }
  const seed = isLocal ? await loadSeedState() : null;
  try {
    const response = await fetch(STATE_API_URL, { cache: "no-store", headers: authHeaders() });
    if (response.status === 401 && !isLocal) {
      clearSession();
      return emptyState();
    }
    if (response.ok) {
      const text = await response.text();
      if (text.trim()) {
        const remote = normalizeState(JSON.parse(text));
        if (hasMeaningfulState(remote)) {
          setSyncedStateBaseline(remote);
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
    return seed;
  }

  if (hasMeaningfulState(fallback)) {
    return fallback;
  }

  const fresh = isLocal ? freshState() : emptyState();
  saveLocalState(fresh);
  return fresh;
}

async function loadLocalState() {
  try {
    await localCacheQueue;
    const cached = await campaignCacheRequest("readonly", store => store.get("state"));
    if (cached) return normalizeState(cached);
  } catch (error) {
    // Retain compatibility with older browser caches when IndexedDB is unavailable.
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return null;
    }
    return normalizeState(JSON.parse(saved));
  } catch (error) {
    return null;
  }
}

function normalizeState(value) {
  const fallback = isLocalDevelopmentHost() ? freshState() : emptyState();
  const data = value && typeof value === "object" ? value : {};
  const normalizedUsers = Array.isArray(data.users) && data.users.length
    ? data.users.map(normalizeUser)
    : fallback.users;
  const users = normalizeUsers(normalizedUsers);
  const activeUserId = users.some((user) => user.id === data.activeUserId)
    ? data.activeUserId
    : null;
  const normalized = {
    version: 1,
    currentDay: Math.max(1, Number.parseInt(data.currentDay, 10) || fallback.currentDay),
    startingBalanceCopper: toSafeCopper(data.startingBalanceCopper, fallback.startingBalanceCopper),
    revision: Math.max(0, Number.parseInt(data.revision, 10) || fallback.revision || 0),
    updatedAt: Number(data.updatedAt) || fallback.updatedAt || Date.now(),
    deletedRecords: Array.isArray(data.deletedRecords) ? data.deletedRecords.map(normalizeDeletedRecord).filter(Boolean) : [],
    activeUserId,
    users,
    rooms: Array.isArray(data.rooms) ? data.rooms.map(normalizeRoom) : fallback.rooms,
    npcs: Array.isArray(data.npcs) ? data.npcs.map(normalizeNpc) : fallback.npcs,
    financeSources: Array.isArray(data.financeSources) ? data.financeSources.map(normalizeSource) : fallback.financeSources,
    ledger: Array.isArray(data.ledger) ? data.ledger.map(normalizeLedgerEntry) : fallback.ledger,
    faithTransactions: Array.isArray(data.faithTransactions) ? data.faithTransactions.map(normalizeFaithTransaction).filter(Boolean) : fallback.faithTransactions,
    events: Array.isArray(data.events) ? data.events.map(normalizeCalendarEvent) : fallback.events,
    autoProcessRecurring: data.autoProcessRecurring === true,
    campfire: normalizeCampfire(data.campfire || fallback.campfire, users),
    journey: normalizeJourney(data.journey || fallback.journey, users),
    baseMap: normalizeBaseMap(data.baseMap || fallback.baseMap, users),
    missions: Array.isArray(data.missions) ? data.missions.map((entry) => normalizeMission(entry, users)).filter(Boolean) : [],
    timeline: Array.isArray(data.timeline) ? data.timeline.map((entry) => normalizeTimelineEntry(entry, users)).filter(Boolean) : [],
    trophies: Array.isArray(data.trophies) ? data.trophies.map((entry) => normalizeTrophy(entry, users)).filter(Boolean) : [],
    market: normalizeMarket(data.market || fallback.market)
  };
  return repairNpcFinanceSources(normalized);
}

function normalizeReferences(references) {
  const seen = new Set();
  return (Array.isArray(references) ? references : [])
    .map((reference) => {
      if (typeof reference === "string") return reference.trim();
      const type = String(reference?.type || "").trim();
      const id = String(reference?.id || "").trim();
      return type && id ? `${type}:${id}` : "";
    })
    .filter((reference) => {
      if (!reference || !/^[^:]+:.+$/.test(reference) || seen.has(reference)) return false;
      seen.add(reference);
      return true;
    });
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 16);
  return String(value || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 16);
}

function creatorFields(record, users, fallbackName = "Mesa") {
  const userId = String(record?.createdByUserId || "").trim();
  const user = (users || []).find((candidate) => candidate.id === userId);
  return {
    createdByUserId: userId,
    createdByName: String(record?.createdByName || "").trim() || user?.name || fallbackName,
    createdAt: Number(record?.createdAt) || Date.now(),
    updatedAt: Number(record?.updatedAt) || Number(record?.createdAt) || Date.now()
  };
}

function normalizeBaseMap(value, users) {
  const source = value && typeof value === "object" ? value : {};
  const floorsById = new Map((Array.isArray(source.floors) ? source.floors : []).filter((floor) => floor?.id).map((floor) => [floor.id, floor]));
  return {
    floors: BASE_MAP_FLOORS.map((floor) => {
      const candidate = floorsById.get(floor.id) || {};
      return {
        ...floor,
        columns: MAP_GRID_COLUMNS,
        rows: MAP_GRID_ROWS,
        zones: (Array.isArray(candidate.zones) ? candidate.zones : []).map((zone) => normalizeMapZone(zone, floor.id, users)).filter(Boolean)
      };
    })
  };
}

function normalizeMapZone(zone, floorId, users) {
  if (!zone || typeof zone !== "object") return null;
  const gridVersion = zone.gridVersion === 2 ? 2 : 1;
  const columns = gridVersion === 2 ? MAP_GRID_COLUMNS : BASE_MAP_COLUMNS;
  const rows = gridVersion === 2 ? MAP_GRID_ROWS : BASE_MAP_ROWS;
  const x = Math.max(0, Math.min(columns - 1, Number.parseInt(zone.x, 10) || 0));
  const y = Math.max(0, Math.min(rows - 1, Number.parseInt(zone.y, 10) || 0));
  const width = Math.max(1, Math.min(columns - x, Number.parseInt(zone.width, 10) || 1));
  const height = Math.max(1, Math.min(rows - y, Number.parseInt(zone.height, 10) || 1));
  return {
    id: String(zone.id || createId("map-zone")), floorId, gridVersion,
    title: String(zone.title || "").trim() || "Zona sem nome",
    kind: zone.kind === "room" ? "room" : "construction",
    status: String(zone.status || "Planejada").trim(),
    description: String(zone.description || "").trim(),
    responsible: String(zone.responsible || "").trim(),
    roomId: String(zone.roomId || "").trim(), x, y, width, height,
    ...creatorFields(zone, users)
  };
}

function normalizeMission(entry, users) {
  if (!entry || typeof entry !== "object") return null;
  const type = entry.type === "rumor" ? "rumor" : "mission";
  const status = ["available", "active", "completed", "failed"].includes(entry.status) ? entry.status : "available";
  const reliability = ["uncertain", "likely", "confirmed", "false"].includes(entry.reliability) ? entry.reliability : "uncertain";
  return { id: String(entry.id || createId("mission")), type, status, reliability,
    title: String(entry.title || "").trim() || (type === "rumor" ? "Rumor sem título" : "Missão sem título"),
    description: String(entry.description || "").trim(), source: String(entry.source || "").trim(),
    assignee: String(entry.assignee || "").trim(), region: String(entry.region || "").trim(),
    dueDay: Math.max(0, Number.parseInt(entry.dueDay, 10) || 0), tags: normalizeTags(entry.tags), references: normalizeReferences(entry.references),
    ...creatorFields(entry, users) };
}

function normalizeTimelineEntry(entry, users) {
  if (!entry || typeof entry !== "object") return null;
  const type = ["session", "discovery", "decision"].includes(entry.type) ? entry.type : "discovery";
  return { id: String(entry.id || createId("timeline")), type, era: ["1", "2", "3"].includes(String(entry.era)) ? String(entry.era) : "1",
    order: Number.isFinite(entry.order) ? entry.order : null,
    title: String(entry.title || "").trim() || "Registro sem título", description: String(entry.description || "").trim(),
    day: Math.max(0, Number.parseInt(entry.day, 10) || 0), references: normalizeReferences(entry.references), ...creatorFields(entry, users) };
}

function normalizeTrophy(entry, users) {
  if (!entry || typeof entry !== "object") return null;
  const rarity = ["legendary", "epic", "notable"].includes(entry.rarity) ? entry.rarity : "notable";
  return { id: String(entry.id || createId("trophy")), title: String(entry.title || "").trim() || "Conquista sem título",
    category: String(entry.category || "Conquista").trim(), rarity, featured: Boolean(entry.featured), image: entry.image || "", description: String(entry.description || "").trim(),
    recipientHeroIds: Array.isArray(entry.recipientHeroIds) ? [...new Set(entry.recipientHeroIds.filter((id) => typeof id === "string"))] : [],
    awardedToGroup: entry.awardedToGroup !== false,
    day: Math.max(0, Number.parseInt(entry.day, 10) || 0), references: normalizeReferences(entry.references), ...creatorFields(entry, users) };
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
  const localPin = isLocalDevelopmentHost() ? String(user?.pin || user?.localPin || "") : "";
  return {
    id: user?.id || createId("user"),
    name: user?.name?.trim() || "Jogador",
    role,
    // The local development server needs the PIN to exercise the legacy local login.
    // Public state is sanitized on the server and never receives this field.
    ...(isLocalDevelopmentHost() ? { pin: localPin, localPin } : {}),
    createdAt: Number(user?.createdAt) || Date.now(),
    updatedAt: Number(user?.updatedAt) || Number(user?.createdAt) || Date.now()
  };
}

function normalizeFaithTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") {
    return null;
  }
  const userId = String(transaction.userId || "").trim();
  const amount = Number.parseInt(transaction.amount, 10);
  if (!userId || !Number.isFinite(amount) || amount === 0) {
    return null;
  }
  return {
    id: transaction.id || createId("faith"),
    userId,
    amount,
    reason: String(transaction.reason || "").trim(),
    createdByUserId: String(transaction.createdByUserId || "").trim(),
    createdAt: Number(transaction.createdAt) || Date.now(),
    updatedAt: Number(transaction.updatedAt) || Number(transaction.createdAt) || Date.now()
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


function normalizeUsers(users) {
  const source = Array.isArray(users) ? users : [];
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

  return cleaned;
}
function normalizeRoom(room) {
  const upgradeCost = toSafeCopper(room.upgradeCostCopper, gpToCopper(Number(room.upgradeCostGp) || 0));
  const upgradeDurationDays = Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30);
  const activeUpgrade = room.activeUpgrade && typeof room.activeUpgrade === "object"
    ? {
        startedDay: Math.max(1, Number.parseInt(room.activeUpgrade.startedDay, 10) || 1),
        finishDay: Math.max(1, Number.parseInt(room.activeUpgrade.finishDay, 10) || 1),
        costCopper: toSafeCopper(room.activeUpgrade.costCopper, upgradeCost),
        info: room.activeUpgrade.info || room.upgradeInfo || "",
        bonus: room.activeUpgrade.bonus || room.upgradeBonus || "",
        usage: room.activeUpgrade.usage || room.upgradeUsage || "",
        durationDays: Math.max(1, Number.parseInt(room.activeUpgrade.durationDays, 10) || upgradeDurationDays),
        purchasedByUserId: room.activeUpgrade.purchasedByUserId || "",
        purchasedByName: room.activeUpgrade.purchasedByName || "",
        startedAt: Number(room.activeUpgrade.startedAt) || Date.now()
      }
    : null;
  const upgradeAppliedSignature = room.upgradeAppliedSignature || "";
  return {
    id: room.id || createId("room"),
    name: room.name || "Sala sem nome",
    type: room.type || "",
    status: room.status || "Ativa",
    image: room.image || "",
    imageCrop: normalizePortraitCrop(room.imageCrop),
    bonus: room.bonus || "",
    usage: room.usage || "",
    description: room.description || "",
    upgradeInfo: room.upgradeInfo || "",
    upgradeCostCopper: upgradeCost,
    upgradeBonus: room.upgradeBonus || "",
    upgradeUsage: room.upgradeUsage || "",
    upgradeDurationDays,
    activeUpgrade,
    upgradeAppliedAt: Number(room.upgradeAppliedAt) || 0,
    upgradeAppliedSignature,
    updatedAt: Number(room.updatedAt) || Date.now()
  };
}

function normalizeNpc(npc) {
  return {
    id: npc.id || createId("npc"),
    name: npc.name || "NPC sem nome",
    image: npc.image || "",
    imageCrop: normalizePortraitCrop(npc.imageCrop),
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
    createdByUserId: String(source.createdByUserId || ""),
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
    createdByUserId: String(entry.createdByUserId || ""),
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
    createdByUserId: String(event.createdByUserId || ""),
    createdAt: Number(event.createdAt) || Date.now()
  };
}

function normalizeCampfire(campfire, users) {
  const source = campfire && typeof campfire === "object" ? campfire : {};
  const userLookup = new Map((Array.isArray(users) ? users : []).map((user) => [user.id, user]));
  return {
    legionNotes: String(source.legionNotes || "").trim() || "Anotações livres do Minimus Legio.",
    investigationBoard: normalizeInvestigationBoard(source.investigationBoard, source.legionNotes, userLookup),
    heroes: Array.isArray(source.heroes) ? source.heroes.map((hero) => normalizeCampfireHero(hero, userLookup)) : []
  };
}

function normalizeInvestigationBoard(board, legacyNotes, userLookup) {
  const source = board && typeof board === "object" ? board : {};
  const hasExistingBoard = board && typeof board === "object" && (
    Object.prototype.hasOwnProperty.call(source, "notes")
    || Object.prototype.hasOwnProperty.call(source, "links")
    || Object.prototype.hasOwnProperty.call(source, "migratedFromLegionNotesAt")
  );
  const notes = Array.isArray(source.notes)
    ? source.notes.map((note) => normalizeInvestigationNote(note, userLookup)).filter(Boolean)
    : [];
  const links = Array.isArray(source.links)
    ? source.links.map(normalizeInvestigationLink).filter(Boolean)
    : [];
  let migratedFromLegionNotesAt = Number(source.migratedFromLegionNotesAt) || 0;
  if (!notes.length && legacyNotes && !hasExistingBoard) {
    migratedFromLegionNotesAt = Date.now();
    String(legacyNotes)
      .split(/\n\s*\n/g)
      .map((text) => text.trim())
      .filter(Boolean)
      .slice(0, 12)
      .forEach((text, index) => {
        notes.push(normalizeInvestigationNote({
          id: createId("invnote"),
          title: index === 0 ? "Primeira pista" : `Pista ${index + 1}`,
          text,
          x: 48 + (index % 4) * 250,
          y: 48 + Math.floor(index / 4) * 210,
          color: ["gold", "green", "blue", "violet"][index % 4],
          createdByName: "Minimus Legio",
          createdAt: Date.now() - (12 - index),
          updatedAt: Date.now() - (12 - index)
        }, userLookup));
      });
  }
  const noteIds = new Set(notes.map((note) => note.id));
  const derivedSize = getInvestigationBoardSize(notes);
  return {
    width: derivedSize.width || Math.max(INVESTIGATION_BOARD_MIN_WIDTH, Math.min(INVESTIGATION_BOARD_MAX_WIDTH, Number(source.width) || 1800)),
    height: derivedSize.height || Math.max(INVESTIGATION_BOARD_MIN_HEIGHT, Math.min(INVESTIGATION_BOARD_MAX_HEIGHT, Number(source.height) || 1250)),
    migratedFromLegionNotesAt,
    notes,
    links: links.filter((link) => noteIds.has(link.fromNoteId) && noteIds.has(link.toNoteId) && link.fromNoteId !== link.toNoteId)
  };
}

function normalizeInvestigationNote(note, userLookup) {
  if (!note || typeof note !== "object") {
    return null;
  }
  const createdByUserId = note.createdByUserId || "";
  const creator = createdByUserId ? userLookup.get(createdByUserId) : null;
  const color = ["gold", "green", "blue", "violet", "red", "ash"].includes(note.color) ? note.color : "gold";
  const createdAt = Number(note.createdAt) || Date.now();
  const updatedAt = Number(note.updatedAt) || createdAt;
  const contentUpdatedAt = Number(note.contentUpdatedAt) || updatedAt;
  const positionUpdatedAt = Number(note.positionUpdatedAt) || updatedAt;
  const estimatedSize = getInvestigationNoteEstimatedSize(note);
  return {
    id: note.id || createId("invnote"),
    title: String(note.title || "").trim() || "Nota sem título",
    text: String(note.text || "").trim(),
    x: Math.max(0, Math.min(INVESTIGATION_BOARD_MAX_WIDTH - estimatedSize.width - 24, Number(note.x) || 40)),
    y: Math.max(0, Math.min(INVESTIGATION_BOARD_MAX_HEIGHT - estimatedSize.height - 24, Number(note.y) || 40)),
    color,
    journeyEntryId: note.journeyEntryId || "",
    createdByUserId,
    createdByName: String(note.createdByName || "").trim() || creator?.name || "Mesa",
    createdByHeroId: note.createdByHeroId || "",
    createdByHeroName: String(note.createdByHeroName || "").trim(),
    createdAt,
    updatedAt,
    contentUpdatedAt,
    positionUpdatedAt
  };
}

function normalizeInvestigationLink(link) {
  if (!link || typeof link !== "object" || !link.fromNoteId || !link.toNoteId) {
    return null;
  }
  return {
    id: link.id || createId("invlink"),
    fromNoteId: link.fromNoteId,
    toNoteId: link.toNoteId,
    label: String(link.label || "").trim(),
    createdByUserId: link.createdByUserId || "",
    createdAt: Number(link.createdAt) || Date.now(),
    updatedAt: Number(link.updatedAt) || Date.now()
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
    className: String(hero?.className || "").trim(),
    level: String(hero?.level || "").trim(),
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
  const entries = Array.isArray(source.entries) ? source.entries.map((entry) => normalizeJourneyEntry(entry, userLookup)) : [];
  return {
    notificationBaselineAt: Number(source.notificationBaselineAt) || getJourneyCommentActivityStamp(entries) || Date.now(),
    reads: Array.isArray(source.reads) ? source.reads.map(normalizeJourneyRead).filter(Boolean) : [],
    entries
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
    category: Object.prototype.hasOwnProperty.call(JOURNEY_CATEGORIES, entry?.category) ? entry.category : "event",
    threat: String(entry?.threat || "").trim(),
    region: String(entry?.region || "").trim(),
    tags: normalizeTags(entry?.tags),
    references: normalizeReferences(entry?.references),
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
    createdAt: Number(comment?.createdAt) || Date.now(),
    updatedAt: Number(comment?.updatedAt) || Number(comment?.createdAt) || Date.now()
  };
}

function normalizeJourneyRead(read) {
  const userId = String(read?.userId || "").trim();
  const entryId = String(read?.entryId || "").trim();
  if (!userId || !entryId) {
    return null;
  }
  return {
    id: read?.id || getJourneyReadId(userId, entryId),
    userId,
    entryId,
    readAt: Number(read?.readAt) || Date.now(),
    createdAt: Number(read?.createdAt) || Number(read?.readAt) || Date.now(),
    updatedAt: Number(read?.updatedAt) || Number(read?.readAt) || Date.now()
  };
}

function normalizeJourneyLevel(level) {
  const value = String(level ?? "").trim();
  return value || "?";
}

function getJourneyReadId(userId, entryId) {
  return `journey-read-${userId}-${entryId}`;
}

function getJourneyCommentStamp(comment) {
  return Math.max(Number(comment?.updatedAt) || 0, Number(comment?.createdAt) || 0);
}

function getJourneyCommentActivityStamp(entries = state.journey?.entries || []) {
  return (Array.isArray(entries) ? entries : []).reduce((entriesMax, entry) => Math.max(
    entriesMax,
    ...(Array.isArray(entry?.comments) ? entry.comments.map(getJourneyCommentStamp) : [0])
  ), 0);
}

function getJourneyEntryActivityStamp(entry) {
  return Math.max(
    Number(entry?.updatedAt) || Number(entry?.createdAt) || 0,
    ...(Array.isArray(entry?.comments) ? entry.comments.map(getJourneyCommentStamp) : [0])
  );
}

function getJourneyRead(entryId, userId = getActiveUserId()) {
  if (!entryId || !userId) {
    return null;
  }
  return (state.journey?.reads || []).find((read) => read.entryId === entryId && read.userId === userId) || null;
}

function getUnreadJourneyComments(entry, userId = getActiveUserId()) {
  if (!entry || !userId) {
    return [];
  }
  const baselineAt = Number(state.journey?.notificationBaselineAt) || 0;
  const readAt = Math.max(baselineAt, Number(getJourneyRead(entry.id, userId)?.readAt) || 0);
  return (entry.comments || []).filter((comment) => comment.userId !== userId && getJourneyCommentStamp(comment) > readAt);
}

function markJourneyEntryRead(entryId, options = {}) {
  const userId = getActiveUserId();
  const entry = state.journey?.entries?.find((item) => item.id === entryId);
  if (!entry || !userId || !getUnreadJourneyComments(entry, userId).length) {
    return false;
  }
  const now = Date.now();
  const readAt = Math.max(now, getJourneyEntryActivityStamp(entry));
  const existing = getJourneyRead(entry.id, userId);
  const payload = {
    id: existing?.id || getJourneyReadId(userId, entry.id),
    userId,
    entryId: entry.id,
    readAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (existing) {
    Object.assign(existing, payload);
  } else {
    state.journey.reads.push(payload);
  }
  if (!options.silent) {
    saveState();
  }
  return true;
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
  const level = Number.parseInt(item.level, 10) || 0;
  const normalCopper = toSafeCopper(item.normalCopper, 0);
  const section = item.section === "consumable" ? "consumable" : "permanent";
  const legacyPremiumLevel13 = section === "permanent" && level === 13 && item.stockType === "premium";
  const adjustmentPercent = legacyPremiumLevel13
    ? -10
    : (Number.parseInt(item.adjustmentPercent, 10) || 0);
  return {
    stockId: item.stockId || createId("stock"),
    name: item.name || "Item",
    level,
    rarity: item.rarity || "Common",
    category: item.category || "",
    subcategory: item.subcategory || "",
    trait: item.trait || "",
    url: item.url || "",
    normalCopper,
    merchantCopper: legacyPremiumLevel13
      ? roundToSilver(normalCopper * 0.9)
      : toSafeCopper(item.merchantCopper, 0),
    adjustmentPercent,
    stockType: legacyPremiumLevel13 ? "regular" : (item.stockType === "premium" ? "premium" : "regular"),
    section
  };
}

let localCacheQueue = Promise.resolve();
let localCacheWarningShown = false;
function campaignCacheRequest(mode, action) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("templo-esmeralda-cache", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("campaign");
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("Cache bloqueado por outra aba."));
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("campaign", mode);
      const request = action(transaction.objectStore("campaign"));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error || request.error); };
    };
  });
}
function saveLocalState(nextState) {
  const snapshot = structuredClone(nextState);
  localCacheQueue = localCacheQueue.then(() => campaignCacheRequest("readwrite", store => store.put(snapshot, "state"))).catch(() => {
    if (!localCacheWarningShown) {
      localCacheWarningShown = true;
      showToast("Cache local indisponível. O salvamento no servidor será tentado separadamente; aguarde a confirmação de sincronização antes de sair.");
    }
  });
  return localCacheQueue;
}

function getSavableStateSnapshot(nextState) {
  const snapshot = JSON.parse(JSON.stringify(nextState || {}));
  delete snapshot.activeUserId;
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

function getChangedRecordIds(nextItems, baselineItems) {
  const baselineById = new Map((Array.isArray(baselineItems) ? baselineItems : [])
    .filter((item) => item?.id)
    .map((item) => [item.id, item]));
  return (Array.isArray(nextItems) ? nextItems : [])
    .filter((item) => item?.id && JSON.stringify(item) !== JSON.stringify(baselineById.get(item.id)))
    .map((item) => item.id);
}

function getJourneyEntryContent(entry) {
  const copy = { ...(entry || {}) };
  delete copy.comments;
  return copy;
}

function getChangedJourneyRecords(nextEntries, baselineEntries) {
  const baselineById = new Map((Array.isArray(baselineEntries) ? baselineEntries : [])
    .filter((entry) => entry?.id)
    .map((entry) => [entry.id, entry]));
  const content = [];
  const comments = {};
  (Array.isArray(nextEntries) ? nextEntries : []).forEach((entry) => {
    if (!entry?.id) return;
    const baseline = baselineById.get(entry.id);
    if (!baseline || JSON.stringify(getJourneyEntryContent(entry)) !== JSON.stringify(getJourneyEntryContent(baseline))) {
      content.push(entry.id);
    }
    const changedComments = getChangedRecordIds(entry.comments, baseline?.comments);
    if (changedComments.length) comments[entry.id] = changedComments;
  });
  return { content, comments };
}

function getChangedRecordsForSave(nextState) {
  const baseline = lastSyncedStateSnapshot || {};
  const journeyChanges = getChangedJourneyRecords(nextState.journey?.entries, baseline.journey?.entries);
  return {
    rooms: getChangedRecordIds(nextState.rooms, baseline.rooms),
    npcs: getChangedRecordIds(nextState.npcs, baseline.npcs),
    financeSources: getChangedRecordIds(nextState.financeSources, baseline.financeSources),
    ledger: getChangedRecordIds(nextState.ledger, baseline.ledger),
    faithTransactions: getChangedRecordIds(nextState.faithTransactions, baseline.faithTransactions),
    events: getChangedRecordIds(nextState.events, baseline.events),
    campfireHeroes: getChangedRecordIds(nextState.campfire?.heroes, baseline.campfire?.heroes),
    investigationNotes: getChangedRecordIds(nextState.campfire?.investigationBoard?.notes, baseline.campfire?.investigationBoard?.notes),
    investigationLinks: getChangedRecordIds(nextState.campfire?.investigationBoard?.links, baseline.campfire?.investigationBoard?.links),
    journeyEntries: journeyChanges.content,
    journeyEntryContent: journeyChanges.content,
    journeyComments: journeyChanges.comments,
    journeyReads: getChangedRecordIds(nextState.journey?.reads, baseline.journey?.reads),
    mapZones: getChangedRecordIds(nextState.baseMap?.floors?.flatMap((floor) => floor.zones || []), baseline.baseMap?.floors?.flatMap((floor) => floor.zones || [])),
    missions: getChangedRecordIds(nextState.missions, baseline.missions),
    timeline: getChangedRecordIds(nextState.timeline, baseline.timeline),
    trophies: getChangedRecordIds(nextState.trophies, baseline.trophies)
  };
}

function addDeletedRecord(type, id, deletedAt = Date.now()) {
  if (!type || !id) {
    return;
  }
  const records = Array.isArray(state.deletedRecords) ? state.deletedRecords : [];
  state.deletedRecords = records
    .filter((record) => !(record.type === type && record.id === id))
    .concat({ type, id, deletedAt });
}


let saveTimer = null;
let saveInFlight = false;
let pendingPayload = null;
let lastSaveFailed = false;

function pickChangedRecords(records, ids) {
  const idSet = new Set(Array.isArray(ids) ? ids : []);
  return (Array.isArray(records) ? records : []).filter((record) => idSet.has(record?.id));
}

function getChangedDeletedRecords(records) {
  const baseline = new Map((Array.isArray(lastSyncedStateSnapshot?.deletedRecords) ? lastSyncedStateSnapshot.deletedRecords : [])
    .map((record) => [`${record?.type || ""}:${record?.id || ""}`, Number(record?.deletedAt) || 0]));
  return (Array.isArray(records) ? records : []).filter((record) => (
    (Number(record?.deletedAt) || 0) > (baseline.get(`${record?.type || ""}:${record?.id || ""}`) || 0)
  ));
}

function buildIncrementalSavePayload(nextState, changedFields, changedRecords) {
  const payload = {
    version: nextState.version,
    revision: nextState.revision,
    updatedAt: nextState.updatedAt,
    deletedRecords: getChangedDeletedRecords(nextState.deletedRecords),
    _changedFields: changedFields,
    _changedRecords: changedRecords
  };
  changedFields.forEach((field) => {
    if (field === "campfire.legionNotes") {
      payload.campfire = { ...(payload.campfire || {}), legionNotes: nextState.campfire?.legionNotes || "" };
    } else {
      payload[field] = nextState[field];
    }
  });
  payload.rooms = pickChangedRecords(nextState.rooms, changedRecords.rooms);
  payload.npcs = pickChangedRecords(nextState.npcs, changedRecords.npcs);
  payload.financeSources = pickChangedRecords(nextState.financeSources, changedRecords.financeSources);
  payload.ledger = pickChangedRecords(nextState.ledger, changedRecords.ledger);
  payload.faithTransactions = pickChangedRecords(nextState.faithTransactions, changedRecords.faithTransactions);
  payload.events = pickChangedRecords(nextState.events, changedRecords.events);
  payload.campfire = {
    ...(payload.campfire || {}),
    heroes: pickChangedRecords(nextState.campfire?.heroes, changedRecords.campfireHeroes),
    investigationBoard: {
      notes: pickChangedRecords(nextState.campfire?.investigationBoard?.notes, changedRecords.investigationNotes),
      links: pickChangedRecords(nextState.campfire?.investigationBoard?.links, changedRecords.investigationLinks)
    }
  };
  const journeyEntries = pickChangedRecords(nextState.journey?.entries, changedRecords.journeyEntryContent || changedRecords.journeyEntries)
    .map((entry) => ({
      ...entry,
      comments: pickChangedRecords(entry.comments, changedRecords.journeyComments?.[entry.id])
    }));
  const journeyCommentEntryIds = Object.keys(changedRecords.journeyComments || {});
  journeyCommentEntryIds.forEach((entryId) => {
    if (journeyEntries.some((entry) => entry.id === entryId)) return;
    const entry = (nextState.journey?.entries || []).find((candidate) => candidate.id === entryId);
    if (entry) {
      journeyEntries.push({ ...entry, comments: pickChangedRecords(entry.comments, changedRecords.journeyComments?.[entryId]) });
    }
  });
  payload.journey = {
    entries: journeyEntries,
    reads: pickChangedRecords(nextState.journey?.reads, changedRecords.journeyReads)
  };
  payload.baseMap = {
    floors: (nextState.baseMap?.floors || []).map((floor) => ({
      id: floor.id,
      name: floor.name,
      image: floor.image,
      columns: floor.columns,
      rows: floor.rows,
      zones: pickChangedRecords(floor.zones, changedRecords.mapZones)
    }))
  };
  payload.missions = pickChangedRecords(nextState.missions, changedRecords.missions);
  payload.timeline = pickChangedRecords(nextState.timeline, changedRecords.timeline);
  payload.trophies = pickChangedRecords(nextState.trophies, changedRecords.trophies);
  return payload;
}

function saveState(nextState = state, options = {}) {
  nextState.revision = (Number(nextState.revision) || 0) + 1;
  nextState.updatedAt = Date.now();
  const changedFields = getChangedFieldsForSave(nextState);
  const changedRecords = getChangedRecordsForSave(nextState);
  const snapshot = getSavableStateSnapshot(nextState);
  // The local PowerShell server is intentionally small and does not implement
  // Cloudflare's field-aware merge. It must receive a complete snapshot so an
  // incremental change can never replace the entire local campaign with a
  // partial payload. Production keeps the incremental transport below.
  const payloadState = isLocalDevelopmentHost()
    ? snapshot
    : buildIncrementalSavePayload(nextState, changedFields, changedRecords);
  saveLocalState(snapshot);
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
    pendingPayload = pendingPayload || payload;
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
    if (sessionUserId && (sessionToken || isLocalDevelopmentHost())) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: sessionUserId, token: sessionToken || "", expiresAt: sessionExpiresAt || 0, updatedAt: Date.now() }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch (error) {
    showToast("O navegador bloqueou a sessão local. Mantenha esta aba aberta para continuar.");
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return typeof parsed?.userId === "string" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function restoreSession(usersLoaded = true) {
  const saved = loadSession();
  if (saved) {
    sessionUserId = saved.userId;
    sessionToken = String(saved.token || "");
    sessionExpiresAt = Number(saved.expiresAt) || 0;
  }
  if (sessionExpiresAt && sessionExpiresAt <= Date.now()) {
    clearSession();
  }
  const user = sessionUserId ? state.users.find((entry) => entry.id === sessionUserId) : null;
  if (user) {
    sessionUserId = user.id;
    state.activeUserId = user.id;
  } else {
    if (usersLoaded && (!sessionToken || isLocalDevelopmentHost())) clearSession();
  }
  authReady = true;
  applyAuthState();
}

function clearSession() {
  sessionUserId = null;
  sessionToken = null;
  sessionExpiresAt = 0;
  if (state) state.activeUserId = null;
  try { localStorage.removeItem(SESSION_KEY); } catch (error) { /* browser storage unavailable */ }
}

function authHeaders(extra = {}) {
  return sessionToken ? { ...extra, Authorization: `Bearer ${sessionToken}` } : { ...extra };
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
  if (!sessionToken && !isLocalDevelopmentHost()) return false;
  try {
    const response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: authHeaders({
        "Content-Type": "application/json",
        "X-Base-Revision": String(lastSyncedRevision || 0),
        ...(isLocalDevelopmentHost() ? { "X-Local-State-Snapshot": "1" } : {})
      }),
      keepalive: payload.length < 60000,
      body: payload
    });
    if (response.status === 401) {
      clearSession();
      applyAuthState();
      render();
      showToast("Sua sessão expirou. Entre novamente.");
      return false;
    }
    if (!response.ok) {
      return false;
    }
    const text = await response.text();
    if (text.trim()) {
      const serverState = normalizeState(JSON.parse(text));
      setSyncedStateBaseline(serverState);
      if (!pendingPayload && !investigationDragState && !timelineDrag) {
        state = serverState;
        saveLocalState(state);
        applySessionToState();
        renderPermissions();
        render();
      }
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
    requestStateSync();
  }, SYNC_INTERVAL_MS);
  window.addEventListener("focus", () => requestStateSync());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (pendingPayload && !saveInFlight) {
        clearTimeout(saveTimer);
        void flushStateSave();
      }
    } else {
      requestStateSync();
    }
  });
  window.addEventListener("pagehide", () => {
    if (pendingPayload && !saveInFlight) {
      clearTimeout(saveTimer);
      void flushStateSave();
    }
  });
}

function requestStateSync(options = {}) {
  if (document.hidden || saveInFlight || pendingPayload || investigationDragState || timelineDrag) {
    return;
  }
  const now = Date.now();
  if (!options.force && now - lastSyncStartedAt < MIN_SYNC_GAP_MS) {
    return;
  }
  void syncStateFromServer();
}

async function syncStateFromServer() {
  if (!sessionToken && !isLocalDevelopmentHost()) return;
  if (syncInFlight || saveInFlight || pendingPayload || investigationDragState || timelineDrag) {
    return;
  }
  const now = Date.now();
  if (now - lastSyncStartedAt < MIN_SYNC_GAP_MS) {
    return;
  }
  lastSyncStartedAt = now;
  syncInFlight = true;
  try {
    const revision = Math.max(0, Number(lastSyncedRevision) || 0);
    const response = await fetch(STATE_API_URL, {
      cache: "no-store",
      headers: authHeaders(revision ? { "If-None-Match": `\"state-${revision}\"` } : {})
    });
    if (response.status === 401) {
      clearSession();
      applyAuthState();
      render();
      return;
    }
    if (response.status === 304) {
      return;
    }
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
    if (remoteRevision > localRevision && !investigationDragState && !timelineDrag) {
      state = remote;
      const upgradesApplied = applyCompletedRoomUpgrades({ silent: true });
      setSyncedStateBaseline(state);
      saveLocalState(state);
      applySessionToState();
      if (upgradesApplied) {
        saveState();
      }
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
  if (activeView === "market") {
    void ensureCatalog();
  }
  setMobileNavigation(false);
  if (activeView !== "npcs") {
    selectedNpcId = "";
    npcModalEditId = "";
    document.body.classList.remove("npc-modal-open");
  }
  if (activeView !== "journey") {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
    document.body.classList.remove("journey-modal-open");
  }
  if (activeView !== "map") {
    selectedMapZoneId = "";
    mapSelection = null;
  }
  if (activeView !== "trophies") {
    selectedTrophyId = "";
  }
  if (activeView !== "rooms") {
    closeRoomUpgradeModal({ silent: true });
  }
  if (activeView !== "campfire") {
    selectedInvestigationNoteId = "";
    investigationConnectMode = false;
    investigationConnectFromId = "";
    investigationFullscreen = false;
    document.body.classList.remove("investigation-modal-open");
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
  if (applyCompletedRoomUpgrades({ silent: true })) {
    saveState();
  }
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
    case "map":
      renderBaseMap();
      break;
    case "missions":
      renderMissions();
      break;
    case "timeline":
      renderTimeline();
      break;
    case "trophies":
      renderTrophies();
      break;
    case "market":
      renderMarket();
      break;
    case "settings":
      renderSettings();
      break;
    default:
      renderDashboard();
      break;
  }
}

function renderPermissions() {
  const user = getActiveUser();
  const authenticated = Boolean(user);
  const admin = user?.role === userRoles.admin;
  const permissionKey = getCacheKey(sessionUserId || "", state.activeUserId || "", admin ? "admin" : "player", authenticated ? "auth" : "guest", activeView);
  if (lastPermissionKey === permissionKey) {
    return;
  }
  lastPermissionKey = permissionKey;
  document.body.classList.toggle("role-admin", admin);
  document.body.classList.toggle("role-player", !admin);
  const profileName = $("#activeProfileName");
  const roleBadge = $("#activeRoleBadge");
  if (profileName) {
    profileName.textContent = authenticated ? user.name : "Aguardando acesso";
  }
  if (roleBadge) {
    roleBadge.textContent = authenticated ? (admin ? "Mestre" : "Jogador") : "Login necessário";
    roleBadge.className = `role-badge ${!authenticated ? "player" : admin ? "admin" : "player"}`;
  }

  const dayForm = $("#dayForm");
  if (dayForm) {
    const canEditDate = admin;
    dayForm.hidden = !canEditDate;
    dayForm.classList.toggle("locked", !canEditDate);
    $$("#dayForm input, #dayForm select, #dayForm button").forEach((element) => {
      if (element.id === "currentDayInput" || element.id === "currentMonthInput" || element.id === "currentCycleInput" || element.type === "submit") {
        element.disabled = !canEditDate;
      }
    });
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
  const trophyToggle = $("#toggleTrophyComposer");
  if (trophyToggle) {
    trophyToggle.hidden = !admin;
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

function setMobileNavigation(open) {
  mobileNavigationOpen = Boolean(open && window.matchMedia("(max-width: 860px)").matches);
  document.body.classList.toggle("mobile-nav-open", mobileNavigationOpen);
  const button = $("#mobileNavToggle");
  if (button) {
    button.setAttribute("aria-expanded", String(mobileNavigationOpen));
    button.setAttribute("aria-label", mobileNavigationOpen ? "Fechar navegação" : "Abrir navegação");
  }
}

function logout() {
  clearSession();
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
  const entries = getCalendarEntries().filter((entry) => getCalendarParts(entry.day).monthIndex === currentMonth && getCampaignYear(entry.day) === getCampaignYear(state.currentDay));
  const entriesByDay = new Map();
  entries.forEach((entry) => {
    const dayOfMonth = getCalendarParts(entry.day).dayOfMonth;
    if (!entriesByDay.has(dayOfMonth)) {
      entriesByDay.set(dayOfMonth, []);
    }
    entriesByDay.get(dayOfMonth).push(entry);
  });

  $("#dashboardCalendarTitle").textContent = `${CALENDAR_MONTHS[currentMonth]} • ciclo ${currentYear}`;
  $("#dashboardCalendarCount").textContent = `${entriesByDay.size} dia${entriesByDay.size === 1 ? "" : "s"} com registro`;
  setHtmlIfChanged($("#dashboardCalendarAgenda"), [...entriesByDay].sort(([a], [b]) => a - b).map(([day, items]) => `<section class="dashboard-agenda-day"><button type="button" data-action="open-calendar-day" data-day="${items[0].day}">${escapeHtml(formatCalendarDate(items[0].day))}</button><ul>${items.map(item => `<li>${renderDashboardCalendarEntry(item)}<span>${escapeHtml(item.title)}${item.amountCopper ? ` · ${formatCopper(item.amountCopper)}` : ""}</span></li>`).join("")}</ul></section>`).join(""));

  const key = getCacheKey(state.revision, currentYear, currentMonth);
    const html = getCachedValue(renderCache.dashboardCalendarHtml, key, () => Array.from({ length: DAYS_PER_MONTH }, (_, index) => index + 1).map((day) => {
      const dayEntries = (entriesByDay.get(day) || []).sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "pt-BR"));
      const isToday = currentParts.dayOfMonth === day;
      const absoluteDay = getYearStart(state.currentDay) + currentMonth * DAYS_PER_MONTH + day;
      const classes = ["calendar-mini-day", "dashboard-calendar-day"];
      classes.push(absoluteDay < state.currentDay ? "is-past" : absoluteDay > state.currentDay ? "is-future" : "is-present");
      if (isToday) {
        classes.push("today");
      }
    if (dayEntries.length) {
      classes.push("has-entries");
    }
      const visibleEntries = dayEntries.slice(0, 2);
      const extraCount = dayEntries.length - visibleEntries.length;
      return `
        <button class="${classes.join(" ")}" type="button" data-action="open-calendar-day" data-day="${absoluteDay}" aria-label="${escapeAttr(`${String(day).padStart(2, "0")} de ${CALENDAR_MONTHS[currentMonth]}`)}">
          <header>
            <strong>${String(day).padStart(2, "0")}</strong>
            <span>${dayEntries.length ? `${dayEntries.length}` : ""}</span>
        </header>
        <div class="calendar-mini-dots" aria-label="${escapeAttr(dayEntries.length ? `${dayEntries.length} registro${dayEntries.length === 1 ? "" : "s"}` : "Sem registros")}">
          ${visibleEntries.length
            ? visibleEntries.map(renderDashboardCalendarEntry).join("")
            : ""}
            ${extraCount > 0 ? `<span class="calendar-mini-more" title="${escapeAttr(`${extraCount} registros adicionais`)}">+${extraCount}</span>` : ""}
          </div>
        </button>
      `;
    }).join(""));
    setHtmlIfChanged(grid, html);
  }

  function handleDashboardAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }
    if (button.dataset.action === "open-calendar-day") {
      const day = Number.parseInt(button.dataset.day, 10) || state.currentDay;
      selectedCalendarMonthIndex = getCalendarParts(day).monthIndex;
      selectedCalendarDay = day;
      showView("calendar");
      return;
    }
    if (button.dataset.action === "open-journey-entry") {
      openJourneyEntry(button.dataset.id);
      return;
    }
    if (button.dataset.action === "open-market") {
      showView("market");
    }
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

function hasRoomUpgradeConfigured(room) {
  if (!room) {
    return false;
  }
  return Number(room.upgradeCostCopper) > 0
    || Boolean((room.upgradeBonus || "").trim())
    || Boolean((room.upgradeUsage || "").trim())
    || Boolean((room.upgradeInfo || "").trim());
}

function getRoomUpgradeSignature(room) {
  if (!room) {
    return "";
  }
  return [
    Number(room.upgradeCostCopper) || 0,
    Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30),
    (room.upgradeInfo || "").trim(),
    (room.upgradeBonus || "").trim(),
    (room.upgradeUsage || "").trim()
  ].join("|");
}

function isRoomUpgradeCurrentApplied(room) {
  if (!room?.upgradeAppliedAt) {
    return false;
  }
  return !room.upgradeAppliedSignature || room.upgradeAppliedSignature === getRoomUpgradeSignature(room);
}

function canShowRoomUpgradeButton(room) {
  return hasRoomUpgradeConfigured(room) && !isRoomUpgradeCurrentApplied(room);
}

function findRoomById(roomId) {
  const id = String(roomId ?? "");
  return state.rooms.find((item) => String(item?.id ?? "") === id) || null;
}

function applyCompletedRoomUpgrades(options = {}) {
  let changed = false;
  state.rooms = state.rooms.map((room) => {
    const active = room?.activeUpgrade;
    if (!active || Number(active.finishDay) > state.currentDay) {
      return room;
    }
    const nextRoom = {
      ...room,
      bonus: active.bonus || room.bonus,
      usage: active.usage || room.usage,
      activeUpgrade: null,
      upgradeAppliedAt: Date.now(),
      upgradeAppliedSignature: getRoomUpgradeSignature(room),
      updatedAt: Date.now()
    };
    changed = true;
    return nextRoom;
  });
  if (changed && !options.silent) {
    showToast("Upgrade de sala concluído e aplicado automaticamente.");
  }
  return changed;
}

function buildRoomUpgradePreview(room) {
  const costLabel = formatCopper(Number(room.upgradeCostCopper) || 0);
  const durationLabel = `${Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30)} dia(s)`;
  const bonusLabel = (room.upgradeBonus || "").trim() || "Sem alteração de bônus.";
  const usageLabel = (room.upgradeUsage || "").trim() || "Sem alteração de uso.";
  const infoLabel = (room.upgradeInfo || "").trim() || "Sem observações adicionais.";
  return [
    `Upgrade de ${room.name}`,
    "",
    `Valor: ${costLabel}`,
    `Tempo de obra/reforma: ${durationLabel}`,
    "",
    `Informações: ${infoLabel}`,
    "",
    "Novo bônus:",
    bonusLabel,
    "",
    "Novo uso:",
    usageLabel
  ].join("\n");
}

function beginRoomUpgrade(roomId) {
  const room = findRoomById(roomId);
  if (!room || !hasRoomUpgradeConfigured(room)) {
    showToast("Esta sala ainda não possui upgrade configurado.");
    return;
  }
  if (room.activeUpgrade) {
    showToast(`Este upgrade já está em andamento e termina em ${formatCalendarDate(room.activeUpgrade.finishDay)}.`);
    return;
  }
  if (room.upgradeAppliedAt) {
    showToast("Esta sala já recebeu o upgrade configurado.");
    return;
  }

  const balanceCopper = getBalanceCopper();
  if (balanceCopper < Number(room.upgradeCostCopper || 0)) {
    showToast(`Saldo insuficiente para o upgrade. Necessário: ${formatCopper(room.upgradeCostCopper || 0)}.`);
    return;
  }

  const durationDays = Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30);
  const finishDay = state.currentDay + durationDays;
  const activeUser = getActiveUser();
  const updatedRoom = {
    ...room,
    activeUpgrade: {
      startedDay: state.currentDay,
      finishDay,
      costCopper: Number(room.upgradeCostCopper) || 0,
      info: room.upgradeInfo || "",
      bonus: room.upgradeBonus || "",
      usage: room.upgradeUsage || "",
      durationDays,
      purchasedByUserId: activeUser?.id || "",
      purchasedByName: activeUser?.name || "",
      startedAt: Date.now()
    },
    updatedAt: Date.now()
  };

  state.rooms = state.rooms.map((item) => (String(item?.id ?? "") === String(roomId ?? "") ? updatedRoom : item));
  state.ledger.push({
    id: createId("ledger"),
    day: state.currentDay,
    name: `Upgrade da sala: ${room.name}`,
    type: "expense",
    amountCopper: Number(room.upgradeCostCopper) || 0,
    sourceId: `room-upgrade:${room.id}`,
    note: `Conclusão prevista para ${formatCalendarDate(finishDay)}.`,
    createdAt: Date.now()
  });
  selectedRoomUpgradeId = "";
  saveState();
  render();
  showToast(`Upgrade iniciado. Conclusão prevista para ${formatCalendarDate(finishDay)}.`);
}

function saveRoom(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode salvar salas.");
    return;
  }
  const id = $("#roomId").value;
  const existing = state.rooms.find((item) => item.id === id);
  const upgradeDraft = {
    upgradeInfo: $("#roomUpgradeInfo").value.trim(),
    upgradeCostCopper: gpToCopper(Number($("#roomUpgradeCost").value) || 0),
    upgradeBonus: $("#roomUpgradeBonus").value.trim(),
    upgradeUsage: $("#roomUpgradeUsage").value.trim(),
    upgradeDurationDays: Math.max(1, Number.parseInt($("#roomUpgradeDuration").value, 10) || 30)
  };
  const upgradeChanged = existing ? getRoomUpgradeSignature(existing) !== getRoomUpgradeSignature(upgradeDraft) : false;
  const room = {
    id: id || createId("room"),
    name: $("#roomName").value.trim(),
    type: $("#roomType").value.trim(),
    status: $("#roomStatus").value,
    image: $("#roomImageData").value,
    imageCrop: readPortraitCrop("roomImagePreview"),
    bonus: $("#roomBonus").value.trim(),
    usage: $("#roomUsage").value.trim(),
    description: $("#roomDescription").value.trim(),
    ...upgradeDraft,
    activeUpgrade: upgradeChanged ? null : (existing?.activeUpgrade || null),
    upgradeAppliedAt: upgradeChanged ? 0 : (Number(existing?.upgradeAppliedAt) || 0),
    upgradeAppliedSignature: upgradeChanged ? "" : (existing?.upgradeAppliedSignature || ""),
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
  $("#roomUpgradeCost").value = "0";
  $("#roomUpgradeDuration").value = "30";
  $("#roomFormTitle").textContent = "Nova sala especial";
}

function handleRoomAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "select-room-upgrade") {
    event.preventDefault();
    event.stopPropagation();
    const room = findRoomById(id);
    if (!room) {
      return;
    }
    selectedRoomUpgradeId = String(room.id);
    renderRoomUpgradeModal();
    return;
  }
  if (!isAdmin()) {
    return;
  }
  if (button.dataset.action === "edit-room") {
    const room = findRoomById(id);
    if (!room) {
      return;
    }
    $("#roomId").value = room.id;
    $("#roomName").value = room.name;
    $("#roomType").value = room.type;
    $("#roomStatus").value = room.status;
    $("#roomImageData").value = room.image || "";
    renderImagePreview("roomImagePreview", room.image || "", room.imageCrop);
    $("#roomBonus").value = room.bonus;
    $("#roomUsage").value = room.usage;
    $("#roomDescription").value = room.description;
    $("#roomUpgradeInfo").value = room.upgradeInfo || "";
    $("#roomUpgradeCost").value = copperToGpInput(room.upgradeCostCopper || 0);
    $("#roomUpgradeBonus").value = room.upgradeBonus || "";
    $("#roomUpgradeUsage").value = room.upgradeUsage || "";
    $("#roomUpgradeDuration").value = String(Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30));
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
      const haystack = `${room.name} ${room.type} ${room.status} ${room.bonus} ${room.usage} ${room.description} ${room.upgradeInfo || ""} ${room.upgradeBonus || ""} ${room.upgradeUsage || ""}`.toLowerCase();
      return (!query || haystack.includes(query)) && (filter === "all" || room.status === filter);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));

  const html = rooms.length ? rooms.map(renderRoomCard).join("")
    : renderEmpty("Nenhuma sala encontrada", "A lista de salas não tem resultados para os filtros atuais.");
  setHtmlIfChanged($("#roomList"), html);
  renderRoomUpgradeModal();
}

function getRoomStatusTone(room) {
  const status = String(room.status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/bloque|inativ|desativ|danific/.test(status)) return "blocked";
  if (/constr|planej|obra/.test(status)) return "building";
  if (/ativa|pronta|conclu/.test(status)) return "active";
  return "neutral";
}

function renderRoomCard(room) {
  const upgrade = room.activeUpgrade ? `Conclusão: ${formatCalendarDate(room.activeUpgrade.finishDay)}`
    : isRoomUpgradeCurrentApplied(room) ? "Concluído"
    : hasRoomUpgradeConfigured(room) ? `${formatCopper(room.upgradeCostCopper || 0)} · ${Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30)} dia(s)` : "Não cadastrado";
  return `<article class="room-card room-status-${getRoomStatusTone(room)}">
    <div class="room-thumbnail">${room.image ? `<img style="${portraitCropStyle(room.imageCrop)}" src="${escapeAttr(room.image)}" alt="${escapeAttr(room.name)}" width="140" height="140" loading="lazy" decoding="async">` : `<span class="room-thumbnail-placeholder" aria-hidden="true"></span>`}<span class="room-status-seal"><i aria-hidden="true"></i>${escapeHtml(room.status)}</span></div>
    <div class="room-card-content"><header><div class="room-heading"><h3 title="${escapeAttr(room.name)}">${escapeHtml(room.name)}</h3>${room.type ? `<span class="room-type">${escapeHtml(room.type)}</span>` : ""}</div>${canShowRoomUpgradeButton(room) ? `<button class="button primary small room-upgrade-action" type="button" data-action="select-room-upgrade" data-id="${escapeAttr(room.id)}">${room.activeUpgrade ? "Ver upgrade" : "Upgrade"}</button>` : ""}</header>
    <details class="room-overview"><summary><span class="room-description-preview">${escapeHtml(room.description || "Sem descrição cadastrada.")}</span><span class="room-read-more">Ver mais</span><span class="room-read-less">Ver menos</span></summary><div class="room-expanded-copy">${room.description ? `<p>${nl2br(room.description)}</p>` : ""}${room.bonus ? `<p><strong>Bônus:</strong> ${nl2br(room.bonus)}</p>` : ""}${room.usage ? `<p><strong>Uso:</strong> ${nl2br(room.usage)}</p>` : ""}${room.upgradeInfo ? `<p><strong>Upgrade:</strong> ${nl2br(room.upgradeInfo)}</p>` : ""}</div></details>
    <dl class="room-stat-strip">${[["bonus", "Bônus", room.bonus || "Não cadastrado"], ["usage", "Uso", room.usage || "Não cadastrado"], ["upgrade", "Upgrade", upgrade]].map(([kind, label, value]) => `<div class="room-stat stat-${kind}"><dt><i aria-hidden="true"></i>${label}</dt><dd title="${escapeAttr(value)}">${escapeHtml(value)}</dd></div>`).join("")}</dl></div>
    ${isAdmin() ? `<div class="room-maintenance-actions"><button class="icon-button" type="button" title="Editar sala" aria-label="Editar ${escapeAttr(room.name)}" data-action="edit-room" data-id="${escapeAttr(room.id)}">✎</button><button class="icon-button" type="button" title="Remover sala" aria-label="Remover ${escapeAttr(room.name)}" data-action="delete-room" data-id="${escapeAttr(room.id)}">×</button></div>` : ""}
  </article>`;
}

function renderRoomUpgradeDetail(room) {
  if (!room) {
    return "";
  }
  const active = room.activeUpgrade;
  const canPurchase = !active && !room.upgradeAppliedAt && hasRoomUpgradeConfigured(room);
  const currentBalance = getBalanceCopper();
  const hasBalance = currentBalance >= Number(room.upgradeCostCopper || 0);
  const article = getMonthArticle(CALENDAR_MONTHS[getCalendarParts(active?.finishDay || state.currentDay).monthIndex]);
  return `
    <article class="room-upgrade-modal-card">
      <header>
        <div>
          <p class="eyebrow">Upgrade da sala</p>
          <h3>${escapeHtml(room.name)}</h3>
        </div>
        <button class="icon-button" type="button" title="Fechar upgrade" aria-label="Fechar upgrade" data-action="close-room-upgrade">X</button>
      </header>
      <div class="room-upgrade-modal-grid">
        <section class="room-upgrade-modal-col">
          <p class="muted"><strong>Informações:</strong> ${escapeHtml((room.upgradeInfo || "").trim() || "Sem observações adicionais.")}</p>
          <p class="muted"><strong>Valor:</strong> ${formatCopper(room.upgradeCostCopper || 0)}</p>
          <p class="muted"><strong>Tempo:</strong> ${Math.max(1, Number.parseInt(room.upgradeDurationDays, 10) || 30)} dia(s)</p>
        </section>
        <section class="room-upgrade-modal-col">
          <p class="eyebrow">Novo bônus</p>
          <p class="room-upgrade-preview-copy">${nl2br((room.upgradeBonus || "").trim() || "Sem alteração de bônus.")}</p>
          <p class="eyebrow">Novo uso</p>
          <p class="room-upgrade-preview-copy">${nl2br((room.upgradeUsage || "").trim() || "Sem alteração de uso.")}</p>
        </section>
      </div>
      ${active ? `
        <div class="room-upgrade-modal-status">
          <span class="chip warning">Em andamento</span>
          <span class="muted">Termina em ${formatCalendarDate(active.finishDay)} (${article} ${CALENDAR_MONTHS[getCalendarParts(active.finishDay).monthIndex]}).</span>
        </div>
      ` : room.upgradeAppliedAt ? `
        <div class="room-upgrade-modal-status">
          <span class="chip income">Upgrade já concluído</span>
        </div>
      ` : `
        <div class="room-upgrade-modal-status">
          <span class="chip ${hasBalance ? "income" : "expense"}">${hasBalance ? "Saldo suficiente" : "Saldo insuficiente"}</span>
          <span class="muted">Saldo atual: ${formatCopper(currentBalance)}</span>
        </div>
      `}
      <div class="button-row">
        ${canPurchase ? `<button class="button primary" type="button" data-action="purchase-room-upgrade" data-id="${escapeAttr(room.id)}" ${hasBalance ? "" : "disabled"}>Confirmar compra do upgrade</button>` : ""}
        <button class="button ghost" type="button" data-action="close-room-upgrade">Fechar</button>
      </div>
    </article>
  `;
}

function handleRoomUpgradeAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "close-room-upgrade") {
    event.preventDefault();
    event.stopPropagation();
    closeRoomUpgradeModal();
    return;
  }
  if (action === "purchase-room-upgrade") {
    event.preventDefault();
    event.stopPropagation();
    const id = button.dataset.id || selectedRoomUpgradeId;
    if (!id) {
      return;
    }
    beginRoomUpgrade(id);
  }
}

function handleRoomUpgradeKeydown(event) {
  if (event.key === "Escape" && selectedRoomUpgradeId) {
    closeRoomUpgradeModal();
  }
}

function renderRoomUpgradeModal() {
  const modal = $("#roomUpgradeModal");
  const detail = $("#roomUpgradeDetail");
  if (!modal || !detail) {
    return;
  }
  const selected = selectedRoomUpgradeId ? findRoomById(selectedRoomUpgradeId) : null;
  setHtmlIfChanged(detail, selected ? renderRoomUpgradeDetail(selected) : "");
  modal.hidden = !selected;
  document.body.classList.toggle("room-upgrade-modal-open", Boolean(selected));
}

function closeRoomUpgradeModal(options = {}) {
  selectedRoomUpgradeId = "";
  if (options.silent) {
    const modal = $("#roomUpgradeModal");
    const detail = $("#roomUpgradeDetail");
    if (modal) modal.hidden = true;
    if (detail) setHtmlIfChanged(detail, "");
    document.body.classList.remove("room-upgrade-modal-open");
    return;
  }
  renderRoomUpgradeModal();
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
    imageCrop: readPortraitCrop("npcImagePreview"),
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
  const action = button.dataset.action;
  const id = button.dataset.id;
  const npc = state.npcs.find((item) => item.id === id);

  if (action === "new-npc" && isAdmin()) {
    clearNpcForm();
    toggleComposer("npc", true);
    $("#npcName").focus();
    return;
  }

  if (action === "select-npc" && npc) {
    selectedNpcId = id;
    npcModalEditId = "";
    renderNpcs();
    return;
  }

  if (action === "close-npc-modal") {
    closeNpcModal();
    return;
  }

  if (action === "edit-npc" && npc && isAdmin()) {
    selectedNpcId = id;
    npcModalEditId = id;
    renderNpcs();
    return;
  }

  if (action === "cancel-npc-edit") {
    npcModalEditId = "";
    renderNpcs();
    return;
  }

  if (action === "clear-npc-modal-image") {
    const image = $("#npcModalImage");
    const upload = $("#npcModalImageUpload");
    if (image) image.value = "";
    if (upload) upload.value = "";
    renderImagePreview("npcModalImagePreview", "");
    return;
  }

  if (action === "delete-npc" && npc && isAdmin() && confirm("Remover este NPC?")) {
    addDeletedRecord("npc", id);
    state.financeSources
      .filter((source) => source.linkedNpcId === id)
      .forEach((source) => addDeletedRecord("source", source.id));
    state.npcs = state.npcs.filter((item) => item.id !== id);
    state.financeSources = state.financeSources.filter((source) => source.linkedNpcId !== id);
    if (selectedNpcId === id) {
      selectedNpcId = "";
      npcModalEditId = "";
    }
    saveState();
    render();
    showToast("NPC removido.");
  }
}


function renderNpcs() {
  renderNpcDispositionFilters();
  const list = $("#npcList");
  const detail = $("#npcDetail");
  const modal = $("#npcModal");
  if (!list || !detail || !modal) {
    return;
  }
  const query = ($("#npcSearch")?.value || "").trim().toLowerCase();
  const roleFilter = npcDispositionFilter;
  const sort = $("#npcSort")?.value || "name";
  if (selectedNpcId && !state.npcs.some((npc) => npc.id === selectedNpcId)) {
    selectedNpcId = "";
    npcModalEditId = "";
  }
  const key = getCacheKey(state.revision, query, roleFilter, sort, selectedNpcId, npcModalEditId, isAdmin());
  let npcs = getCachedValue(renderCache.npcsHtml, key, () => state.npcs.filter((npc) => {
    const haystack = `${npc.name} ${npc.role} ${npc.tags} ${npc.summary} ${npc.description}`.toLowerCase();
    return (!query || haystack.includes(query)) && (roleFilter === "all" || getNpcDisposition(npc).key === roleFilter);
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
  setHtmlIfChanged(list, html + (isAdmin() ? `<button class="npc-new-face" type="button" data-action="new-npc"><span aria-hidden="true">+</span><span>Novo rosto na base</span></button>` : ""));
  const selectedNpc = selectedNpcId ? state.npcs.find((npc) => npc.id === selectedNpcId) : null;
  const detailKey = getCacheKey(state.revision, selectedNpc?.id || "none", selectedNpc?.updatedAt || 0, npcModalEditId, isAdmin());
  const detailHtml = getCachedValue(renderCache.npcDetailHtml, detailKey, () => renderNpcDetail(selectedNpc));
  setHtmlIfChanged(detail, detailHtml);
  modal.hidden = !selectedNpc;
  document.body.classList.toggle("npc-modal-open", Boolean(selectedNpc));
}

function getNpcDisposition(npc) {
  const label = String(npc.tags || "").split(",").map((tag) => tag.trim()).find(Boolean) || "Sem disposição";
  const key = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const colors = { aliado: "#46c9a0", parente: "#81b8e3", funcionario: "#d5b16a", criancas: "#be9dde", neutro: "#d5b16a", hostil: "#e58372" };
  return { key, label, color: colors[key] || "#9aa8ad" };
}

function renderNpcDispositionFilters() {
  const container = $("#npcDispositionFilters");
  if (!container) return;
  const categories = new Map(state.npcs.map((npc) => { const value = getNpcDisposition(npc); return [value.key, value]; }));
  if (npcDispositionFilter !== "all" && !categories.has(npcDispositionFilter)) npcDispositionFilter = "all";
  const options = [{ key: "all", label: "Todos", color: "transparent" }, ...[...categories.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))];
  setHtmlIfChanged(container, options.map((item) => `<button type="button" data-disposition="${escapeAttr(item.key)}" aria-pressed="${npcDispositionFilter === item.key}" class="${npcDispositionFilter === item.key ? "active" : ""}" style="--disposition-color:${item.color}">${item.key === "all" ? "" : '<i aria-hidden="true"></i>'}${escapeHtml(item.label)}</button>`).join(""));
}

function renderNpcCard(npc) {
  const disposition = getNpcDisposition(npc);
  return `<article class="npc-card" style="--disposition-color:${disposition.color}">
    <button class="npc-card-open" type="button" data-action="select-npc" data-id="${escapeAttr(npc.id)}">
      <span class="npc-portrait">${npc.image ? `<img style="${portraitCropStyle(npc.imageCrop)}" src="${escapeAttr(npc.image)}" alt="" width="320" height="280" loading="lazy" decoding="async">` : `<span>${escapeHtml(getInitials(npc.name))}</span>`}
        <span class="npc-disposition-seal"><i aria-hidden="true"></i>${escapeHtml(disposition.label)}</span>
      </span>
      <span class="npc-card-copy"><span class="npc-card-title">${escapeHtml(npc.name)}</span><span class="npc-meta">${escapeHtml(npc.role || "Sem função")}</span>${npc.summary ? `<span class="npc-card-summary">${escapeHtml(npc.summary)}</span>` : ""}</span>
    </button>
    ${isAdmin() ? `<div class="npc-card-actions"><button class="icon-button" type="button" title="Editar NPC" aria-label="Editar ${escapeAttr(npc.name)}" data-action="edit-npc" data-id="${escapeAttr(npc.id)}">✎</button><button class="icon-button" type="button" title="Remover NPC" aria-label="Remover ${escapeAttr(npc.name)}" data-action="delete-npc" data-id="${escapeAttr(npc.id)}">×</button></div>` : ""}
  </article>`;
}

function renderNpcDetail(npc) {
  if (!npc) {
    return "";
  }
  if (npcModalEditId === npc.id && isAdmin()) {
    return renderNpcEditForm(npc);
  }
  const initials = getInitials(npc.name);
  const impact = npc.financeType !== "none" && npc.financeAmountCopper > 0
    ? `<span class="chip ${npc.financeType === "income" ? "income" : "expense"}">${npc.financeType === "income" ? "Receita" : "Despesa"} ${formatCopper(npc.financeAmountCopper)}/30 dias</span>`
    : `<span class="chip">Sem impacto financeiro</span>`;
  return `
    <article class="npc-detail-card">
      <header>
        <div>
          <p class="eyebrow">NPC da base</p>
          <h3>${escapeHtml(npc.name)}</h3>
          <div class="chip-row compact">
            <span class="chip">${escapeHtml(npc.role || "Sem função")}</span>
            ${impact}
          </div>
        </div>
        <div class="card-actions">
          ${isAdmin() ? `<button class="icon-button" type="button" title="Editar NPC" data-action="edit-npc" data-id="${escapeAttr(npc.id)}">✎</button>` : ""}
          ${isAdmin() ? `<button class="icon-button" type="button" title="Remover NPC" data-action="delete-npc" data-id="${escapeAttr(npc.id)}">✕</button>` : ""}
          <button class="icon-button" type="button" title="Fechar NPC" data-action="close-npc-modal">×</button>
        </div>
      </header>
      <div class="npc-detail-layout">
        <div class="npc-detail-image">
          ${npc.image ? `<img src="${escapeAttr(npc.image)}" alt="${escapeAttr(npc.name)}" loading="lazy" decoding="async">` : `<span>${escapeHtml(initials)}</span>`}
        </div>
        <div class="npc-detail-copy">
          ${npc.summary ? `<p class="npc-summary">${escapeHtml(npc.summary)}</p>` : ""}
          ${npc.description ? `<p>${nl2br(npc.description)}</p>` : `<p class="muted">Nenhuma descrição foi registrada.</p>`}
          ${npc.tags ? `<div class="chip-row">${npc.tags.split(",").map((tag) => `<span class="chip">${escapeHtml(tag.trim())}</span>`).join("")}</div>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderNpcEditForm(npc) {
  return `
    <article class="npc-detail-card npc-edit-card">
      <header>
        <div>
          <p class="eyebrow">Editar NPC</p>
          <h3>${escapeHtml(npc.name)}</h3>
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" title="Cancelar edição" data-action="cancel-npc-edit" data-id="${escapeAttr(npc.id)}">×</button>
        </div>
      </header>
      <form class="stacked-form npc-modal-edit-form" data-npc-id="${escapeAttr(npc.id)}">
        <label>
          Imagem do NPC
          <input id="npcModalImageUpload" type="file" accept="image/*">
          <input id="npcModalImage" type="hidden" value="${escapeAttr(npc.image || "")}">
        </label>
        <div class="image-preview" id="npcModalImagePreview">
          ${renderPortraitEditor(npc.image, npc.imageCrop)}
        </div>
        <div class="form-row">
          <label>
            Nome
            <input name="name" required maxlength="80" autocomplete="off" value="${escapeAttr(npc.name)}">
          </label>
          <label>
            Função
            <input name="role" maxlength="50" value="${escapeAttr(npc.role)}">
          </label>
        </div>
        <label>
          Ordenação
          <input name="tags" maxlength="80" value="${escapeAttr(npc.tags)}">
        </label>
        <label>
          Resumo breve
          <input name="summary" maxlength="140" value="${escapeAttr(npc.summary)}">
        </label>
        <label>
          Descrição
          <textarea name="description" rows="5">${escapeHtml(npc.description || "")}</textarea>
        </label>
        <div class="form-row">
          <label>
            Impacto mensal
            <select name="financeType">
              <option value="none" ${npc.financeType === "none" ? "selected" : ""}>Nenhum</option>
              <option value="income" ${npc.financeType === "income" ? "selected" : ""}>Receita</option>
              <option value="expense" ${npc.financeType === "expense" ? "selected" : ""}>Despesa</option>
            </select>
          </label>
          <label>
            Valor em gp
            <input name="financeAmount" type="number" min="0" step="0.1" value="${escapeAttr(copperToGpInput(npc.financeAmountCopper))}">
          </label>
        </div>
        <div class="button-row">
          <button class="button primary" type="submit">Salvar NPC</button>
          <button class="button ghost" type="button" data-action="clear-npc-modal-image">Remover imagem</button>
          <button class="button ghost" type="button" data-action="cancel-npc-edit" data-id="${escapeAttr(npc.id)}">Cancelar</button>
        </div>
      </form>
    </article>
  `;
}

function handleNpcDetailChange(event) {
  if (event.target?.id === "npcModalImageUpload") {
    handleImageUpload(event, "npcModalImage", "npcModalImagePreview");
  }
}

function saveNpcModalEdit(event) {
  if (!event.target.classList.contains("npc-modal-edit-form")) {
    return;
  }
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode salvar NPCs.");
    return;
  }
  const npc = state.npcs.find((item) => item.id === event.target.dataset.npcId);
  if (!npc) {
    return;
  }
  const name = event.target.elements.name?.value.trim() || "";
  if (!name) {
    showToast("Informe o nome do NPC.");
    return;
  }
  const nextNpc = {
    ...npc,
    name,
    image: $("#npcModalImage")?.value || "",
    imageCrop: readPortraitCrop("npcModalImagePreview"),
    role: event.target.elements.role?.value.trim() || "",
    tags: event.target.elements.tags?.value.trim() || "",
    summary: event.target.elements.summary?.value.trim() || "",
    description: event.target.elements.description?.value.trim() || "",
    financeType: event.target.elements.financeType?.value || "none",
    financeAmountCopper: gpToCopper(Number(event.target.elements.financeAmount?.value) || 0),
    updatedAt: Date.now()
  };
  const index = state.npcs.findIndex((item) => item.id === npc.id);
  state.npcs[index] = nextNpc;
  syncNpcFinanceSource(nextNpc);
  npcModalEditId = "";
  saveState();
  render();
  showToast("NPC salvo.");
}

function handleNpcKeydown(event) {
  if (event.key === "Escape" && selectedNpcId) {
    closeNpcModal();
  }
}

function closeNpcModal() {
  selectedNpcId = "";
  npcModalEditId = "";
  renderNpcs();
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

function getRecurringFlow(sources) {
  const totals = { income: 0, expense: 0 };
  for (const source of sources) {
    if (!source.active || !Object.hasOwn(totals, source.type)) continue;
    totals[source.type] += (Number(source.amountCopper) || 0) * 30 / Math.max(1, Number(source.intervalDays) || 30);
  }
  return { income: Math.round(totals.income), expense: Math.round(totals.expense), net: Math.round(totals.income - totals.expense) };
}

function renderFinance() {
  $("#financeBalance").textContent = formatCopper(getBalanceCopper());
  $("#financeBalanceInput").value = "";
  $("#financeBalanceAction").value = "income";
  const due = getDueSources();
  const totals = getDueTotals(due);
  $("#financeIncomeDue").textContent = formatCopper(totals.income);
  $("#financeExpenseDue").textContent = formatCopper(totals.expense);
  const flow = getRecurringFlow(state.financeSources);
  $("#financeRecurringIncome").textContent = `+${formatCopper(flow.income)}`;
  $("#financeRecurringExpense").textContent = `−${formatCopper(flow.expense)}`;
  $("#financeRecurringNet").textContent = `${flow.net < 0 ? "−" : "+"}${formatCopper(Math.abs(flow.net))}`;
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
    createdByUserId: existing?.createdByUserId || getActiveUserId() || "",
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
    <article class="source-card source-${source.type === "income" ? "income" : "expense"}">
      <header>
        <div>
          <h3>${escapeHtml(source.name)}</h3>
          <div class="source-meta">
            <span>${escapeHtml(source.kindLabel || getKindLabel(source.kind))}</span>
            <span class="type-${source.type}">${source.type === "income" ? "Receita" : "Despesa"}</span>
            <span>${formatCopper(source.amountCopper)} / ${source.intervalDays} dias</span>
            <span class="source-status ${source.active ? "is-active" : ""}">${source.active ? "Ativa" : "Inativa"}</span>
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
      <div class="source-dates">
        <small>Início ${formatCalendarDate(source.startDay || 1)} · Último ${source.lastProcessedDay > 0 ? formatCalendarDate(source.lastProcessedDay) : "nenhum"}</small>
        ${source.active ? `<span class="source-next">Próxima cobrança · ${formatCalendarDate(nextDay)}</span>` : `<span class="muted">Cobrança pausada</span>`}
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
    createdByUserId: getActiveUserId() || "",
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
        <td class="ledger-amount type-${entry.type === "income" ? "income" : "expense"}"><span aria-hidden="true">${entry.type === "income" ? "↗" : "↘"}</span> ${entry.type === "income" ? "+" : "−"}${formatCopper(entry.amountCopper)}</td>
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
  const currentParts = getCalendarParts(state.currentDay);
  if (selectedCalendarMonthIndex === null || selectedCalendarMonthIndex < 0 || selectedCalendarMonthIndex >= CALENDAR_MONTHS.length) {
    selectedCalendarMonthIndex = currentParts.monthIndex;
  }
  if (!selectedCalendarDay || getCampaignYear(selectedCalendarDay) !== getCampaignYear(state.currentDay) || getCalendarParts(selectedCalendarDay).monthIndex !== selectedCalendarMonthIndex) {
    selectedCalendarDay = getYearStart(state.currentDay) + selectedCalendarMonthIndex * DAYS_PER_MONTH + currentParts.dayOfMonth;
  }
  $("#calendarYearTitle").textContent = `${CALENDAR_MONTHS[selectedCalendarMonthIndex]} · Ciclo ${getCampaignYear(state.currentDay) + 1}`;
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

  const key = getCacheKey(state.revision, getCampaignYear(state.currentDay), selectedCalendarMonthIndex, selectedCalendarDay, isAdmin());
  const monthsHtml = getCachedValue(renderCache.calendarMonthsHtml, key, () => renderCalendarMonthGrid(entries));
  setHtmlIfChanged($("#calendarMonths"), monthsHtml);
  setHtmlIfChanged($("#calendarDayPanel"), renderCalendarDayPanel(entries));
  renderNextCycleCalendar();
}

function renderNextCycleCalendar() {
  const calendarStage = $(".calendar-stage");
  if (!calendarStage) return;
  let panel = $("#nextCycleCalendarPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "nextCycleCalendarPanel";
    panel.className = "panel next-cycle-panel";
    calendarStage.insertAdjacentElement("afterend", panel);
  }
  const nextYear = getCampaignYear(state.currentDay) + 1;
  const rangeStart = nextYear * DAYS_PER_YEAR + 1;
  const rangeEnd = rangeStart + DAYS_PER_YEAR - 1;
  const entries = getRecurringCalendarEntries(rangeStart, rangeEnd);
  const income = entries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amountCopper, 0);
  const expense = entries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amountCopper, 0);
  const preview = entries
    .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, 8);
  const html = `<div class="section-header"><div><p class="eyebrow">Próximo ciclo</p><h2>Ciclo ${nextYear + 1}</h2></div><div class="chip-row"><span class="chip income">Receitas: ${formatCopper(income)}</span><span class="chip expense">Despesas: ${formatCopper(expense)}</span><span class="chip">${entries.length} registro${entries.length === 1 ? "" : "s"}</span></div></div><div class="next-cycle-list compact">${preview.length ? preview.map(renderCalendarEntry).join("") : renderEmpty("Sem contratos no próximo ciclo", "Os contratos ativos aparecerão aqui quando tiverem datas previstas.")}</div>`;
  setHtmlIfChanged(panel, html);
}

function renderCalendarMonthGrid(entries) {
  const monthName = CALENDAR_MONTHS[selectedCalendarMonthIndex];
  const monthEntries = entries.filter((entry) => getCalendarParts(entry.day).monthIndex === selectedCalendarMonthIndex);
  const entriesByDay = new Map();
  monthEntries.forEach((entry) => {
    const day = getCalendarParts(entry.day).dayOfMonth;
    if (!entriesByDay.has(day)) {
      entriesByDay.set(day, []);
    }
    entriesByDay.get(day).push(entry);
  });
  const previousMonth = (selectedCalendarMonthIndex + CALENDAR_MONTHS.length - 1) % CALENDAR_MONTHS.length;
  const nextMonth = (selectedCalendarMonthIndex + 1) % CALENDAR_MONTHS.length;
  return `
    <section class="calendar-board">
      <header class="calendar-board-head">
        <button class="button ghost small" type="button" data-action="calendar-month" data-month="${previousMonth}" aria-label="Mês anterior">‹</button>
        <div>
          <p class="eyebrow">Mês aberto</p>
          <h3>${monthName}</h3>
        </div>
        <button class="button ghost small" type="button" data-action="calendar-month" data-month="${nextMonth}" aria-label="Próximo mês">›</button>
      </header>
      <nav class="calendar-month-tabs" aria-label="Meses da campanha">
        ${CALENDAR_MONTHS.map((month, index) => `<button class="${index === selectedCalendarMonthIndex ? "active" : ""}" type="button" data-action="calendar-month" data-month="${index}">${month}</button>`).join("")}
      </nav>
      <div class="calendar-grid" role="grid" aria-label="${escapeAttr(`Calendário de ${monthName}`)}">
        ${Array.from({ length: DAYS_PER_MONTH }, (_, index) => renderCalendarDayCell(index + 1, entriesByDay.get(index + 1) || [])).join("")}
      </div>
    </section>
  `;
}

function renderCalendarDayCell(dayOfMonth, dayEntries) {
  const absoluteDay = getYearStart(state.currentDay) + selectedCalendarMonthIndex * DAYS_PER_MONTH + dayOfMonth;
  const isToday = absoluteDay === state.currentDay;
  const isSelected = absoluteDay === selectedCalendarDay;
  const classes = ["calendar-day-cell"];
  classes.push(absoluteDay < state.currentDay ? "is-past" : absoluteDay > state.currentDay ? "is-future" : "is-present");
  if (isToday) classes.push("today");
  if (isSelected) classes.push("selected");
  if (dayEntries.length) classes.push("has-entries");
  const visibleEntries = dayEntries
    .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, 3);
  const income = dayEntries.filter((entry) => entry.type === "income").length;
  const expense = dayEntries.filter((entry) => entry.type === "expense").length;
  const events = dayEntries.filter((entry) => entry.kind === "event" || entry.kind === "room-upgrade").length;
  const extra = Math.max(0, dayEntries.length - visibleEntries.length);
  return `
    <button class="${classes.join(" ")}" type="button" data-action="calendar-day" data-day="${absoluteDay}" aria-label="${escapeAttr(`${String(dayOfMonth).padStart(2, "0")} de ${CALENDAR_MONTHS[selectedCalendarMonthIndex]}, ${dayEntries.length} registro${dayEntries.length === 1 ? "" : "s"}`)}">
      <span class="calendar-day-number">${String(dayOfMonth).padStart(2, "0")}</span>
      <span class="calendar-day-dots" aria-hidden="true">
        ${income ? `<i class="calendar-mini-dot income"></i>` : ""}
        ${expense ? `<i class="calendar-mini-dot expense"></i>` : ""}
        ${events ? `<i class="calendar-mini-dot event"></i>` : ""}
        ${extra ? `<em>+${extra}</em>` : ""}
      </span>
      <span class="calendar-day-preview">
        ${visibleEntries.map((entry) => `<small class="${entry.type}">${escapeHtml(entry.title)}</small>`).join("")}
      </span>
    </button>
  `;
}

function renderCalendarDayPanel(entries) {
  const day = selectedCalendarDay || state.currentDay;
  const parts = getCalendarParts(day);
  const dayEntries = entries
    .filter((entry) => entry.day === day)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const canAddEvent = isAuthenticated();
  return `
    <section class="panel calendar-selected-day">
      <div class="section-header">
        <div>
          <p class="eyebrow">${day === state.currentDay ? "Hoje no RPG" : "Dia selecionado"}</p>
          <h2>${String(parts.dayOfMonth).padStart(2, "0")} ${getMonthArticle(CALENDAR_MONTHS[parts.monthIndex])} ${CALENDAR_MONTHS[parts.monthIndex]}</h2>
        </div>
        ${canAddEvent ? `<button class="button primary small" type="button" data-action="calendar-add-event" data-day="${day}">Adicionar evento</button>` : ""}
      </div>
      <div class="calendar-entry-list detailed">
        ${dayEntries.length ? dayEntries.map(renderCalendarEntry).join("") : renderEmpty("Sem registros", "Nenhum evento, receita ou despesa foi marcado para este dia.")}
      </div>
    </section>
  `;
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
    const roomUpgradeEntries = state.rooms
      .filter((room) => room?.activeUpgrade && inRange(Number(room.activeUpgrade.finishDay)))
      .map((room) => ({
        id: `room-upgrade-${room.id}`,
        roomId: room.id,
        kind: "room-upgrade",
        day: Number(room.activeUpgrade.finishDay),
        title: `Upgrade concluído: ${room.name}`,
        type: "warning",
        amountCopper: 0,
        description: "A obra termina neste dia e os novos bônus/uso da sala entram em vigor automaticamente.",
        status: "scheduled"
      }));
    return [...ledgerEntries, ...eventEntries, ...roomUpgradeEntries, ...getRecurringCalendarEntries(rangeStart, rangeEnd)];
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
  const entryTypeClass = entry.type === "income" ? "income" : entry.type === "expense" ? "expense" : entry.type === "warning" ? "warning" : "";

  return `
    <article class="calendar-entry ${entryTypeClass} ${entry.status}">
      <div>
        <span class="calendar-date">${formatCalendarDate(entry.day)}</span>
        <h4>${escapeHtml(entry.title)}</h4>
        <p>${escapeHtml(entry.description || statusLabel)}</p>
        <div class="chip-row">
          <span class="chip ${entryTypeClass}">${statusLabel}</span>
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
  const existing = state.events.find((entry) => entry.id === id);
  const payload = {
    id: id || createId("event"),
    title: $("#eventTitle").value.trim(),
    type: $("#eventType").value,
    day: getAbsoluteDayFromInputs("eventDay", "eventMonth", getCampaignYear(state.currentDay)),
    description: $("#eventDescription").value.trim(),
    createdByUserId: existing?.createdByUserId || getActiveUserId() || "",
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
  selectedCalendarMonthIndex = getCalendarParts(payload.day).monthIndex;
  selectedCalendarDay = payload.day;
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

function prepareEventFormForDay(day) {
  clearEventForm();
  setDateInputs("eventDay", "eventMonth", day);
  toggleComposer("event", true, { silent: true });
  $("#eventTitle")?.focus();
}

function handleCalendarAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "calendar-month") {
    selectedCalendarMonthIndex = Number.parseInt(button.dataset.month, 10);
    selectedCalendarDay = null;
    renderCalendar();
    return;
  }
  if (action === "calendar-day") {
    selectedCalendarDay = Number.parseInt(button.dataset.day, 10);
    renderCalendar();
    return;
  }
  if (action === "calendar-add-event") {
    selectedCalendarDay = Number.parseInt(button.dataset.day, 10) || selectedCalendarDay || state.currentDay;
    prepareEventFormForDay(selectedCalendarDay);
    renderCalendar();
    return;
  }
  if (!isAdmin()) {
    return;
  }
  const id = button.dataset.id;
  const entry = state.events.find((item) => item.id === id);
  if (action === "edit-event" && entry) {
    $("#eventId").value = entry.id;
    $("#eventTitle").value = entry.title;
    $("#eventType").value = entry.type;
    setDateInputs("eventDay", "eventMonth", entry.day);
    $("#eventDescription").value = entry.description;
    selectedCalendarMonthIndex = getCalendarParts(entry.day).monthIndex;
    selectedCalendarDay = entry.day;
    toggleComposer("event", true, { silent: true });
    showView("calendar");
  }
  if (action === "delete-event" && confirm("Remover este evento?")) {
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

async function saveMarketSettings(event) {
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
  if (!await ensureCatalog()) {
    showToast("O catálogo não pôde ser carregado. Tente novamente.");
    return;
  }
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
  const icon = getDashboardMarketIcon(item);
  return `
    <article class="market-card ${rarityClass} ${sectionClass}">
      <header class="market-card-head">
        <span class="market-card-icon icon-${icon}" aria-hidden="true"></span>
        <div class="market-card-identity">
          <h3>${escapeHtml(item.name)}</h3>
          <div class="market-card-facts">
            <span class="level-pill">Nível ${item.level}</span>
            <span class="market-category">${escapeHtml(item.category)}</span>
          </div>
        </div>
      </header>
      <div class="market-card-tags" aria-label="Características do item">
          <span class="chip market-rarity-chip">${escapeHtml(item.rarity)}</span>
          <span class="chip">${sectionLabel}</span>
          <span class="chip ${item.stockType === "premium" ? "expense" : "warn"}">${adjustmentLabel}</span>
      </div>
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
  const permanentPool = catalog.filter((item) => !isConsumableCatalogItem(item) && allowed.includes(item.rarity) && item.level <= 15);
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
    const levelWeight = item.level >= 14 ? 2.65 : item.level >= 13 ? 2.25 : item.level >= 10 ? 2 : item.level >= 8 ? 1.4 : 1;
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
  const isHighLevelPermanent = stockType === "permanent" && item.level >= 14;
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
  $("#settingsCurrentBalance").textContent = formatCopper(getBalanceCopper());
  $("#settingsBalanceAction").value = "income";
  $("#startingBalance").value = "";
  renderUsers();
}

function applyBalanceAdjustment({ action, amountGp, label }) {
  const amountCopper = gpToCopper(Number(amountGp) || 0);
  const type = action === "expense" ? "expense" : "income";
  if (amountCopper <= 0) {
    showToast("Informe um valor em gp para ajustar o saldo.");
    return false;
  }
  state.ledger.push({
    id: createId("ledger"),
    day: state.currentDay,
    name: label || (type === "income" ? "Ajuste de saldo: acréscimo" : "Ajuste de saldo: retirada"),
    type,
    amountCopper,
    sourceId: "",
    note: "Ajuste manual do saldo atual da base.",
    createdByUserId: getActiveUserId() || "",
    createdAt: Date.now()
  });
  return true;
}

function saveFinanceBalance(event) {
  event.preventDefault();
  const ok = applyBalanceAdjustment({
    action: $("#financeBalanceAction").value,
    amountGp: $("#financeBalanceInput").value,
    label: $("#financeBalanceAction").value === "expense" ? "Ajuste de saldo: retirada" : "Ajuste de saldo: acréscimo"
  });
  if (!ok) {
    return;
  }
  saveState();
  render();
  toggleFinanceBalanceEditor(false);
  showToast("Saldo atual ajustado.");
}

async function handleAccessSubmit(event) {
  event.preventDefault();
  const name = $("#accessName").value.trim();
  const pin = $("#accessPin").value.trim();
  if (!name || !pin) {
    showToast("Informe nome e PIN para acessar.");
    return;
  }

  if (isLocalDevelopmentHost()) {
    const existing = state.users.find((user) => normalizeAccessName(user.name) === normalizeAccessName(name));
    if (existing && String(existing.localPin || "") !== pin) {
      showToast("Nome ou PIN inválidos.");
      return;
    }
    const user = existing || normalizeUser({ id: createId("user"), name, role: userRoles.player, pin, createdAt: Date.now() });
    if (!existing) state.users.push(user);
    sessionUserId = user.id;
    state.activeUserId = user.id;
    saveSession();
    if (!existing) saveState();
    applyAuthState();
    render();
    showToast(`Bem-vindo, ${user.name}.`);
    return;
  }
  try {
    const response = await fetch(`${AUTH_API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.token || !result.user?.id) {
      showToast(result.error || "Nome ou PIN inválidos.");
      return;
    }
    sessionToken = result.token;
    sessionUserId = result.user.id;
    sessionExpiresAt = Number(result.expiresAt) || 0;
    saveSession();
    state = await loadSharedState();
    state.activeUserId = sessionUserId;
    applyAuthState();
    render();
    showToast(`Bem-vindo, ${result.user.name}.`);
  } catch (error) {
    showToast("Não foi possível alcançar a mesa. Tente novamente.");
  }
}

function renderUsers() {
  const list = $("#userList");
  if (!list) {
    return;
  }
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
              <span class="chip">PIN protegido</span>
              <span class="chip faith-chip">${getFaithPointsForUser(user.id)} PF</span>
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
  const faithInput = $("#userFaithPoints");
  if (faithInput) {
    faithInput.value = "0";
  }
}

async function saveUser(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Somente o Mestre pode gerenciar usuários.");
    return;
  }
  const id = $("#userId").value;
  const payload = {
    id,
    name: $("#userName").value.trim(),
    role: $("#userRole").value === userRoles.admin ? userRoles.admin : userRoles.player,
    pin: $("#userPin").value.trim()
  };
  if (!payload.name) {
    showToast("Informe um nome para o usuário.");
    return;
  }
  if (!isLocalDevelopmentHost()) {
    try {
      const response = await fetch(`${AUTH_API_BASE}/users`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(result.error || "Não foi possível salvar o usuário.");
        return;
      }
      state = await loadSharedState();
      const savedUserId = result.user?.id || id;
      setFaithPointsForUser(savedUserId, $("#userFaithPoints")?.value || 0, "Ajuste do Mestre");
      saveState();
    } catch (error) {
      showToast("Não foi possível alcançar o servidor.");
      return;
    }
  } else {
    const localId = id || createId("user");
    const existingIndex = state.users.findIndex((user) => user.id === localId);
    const existingUser = existingIndex >= 0 ? state.users[existingIndex] : null;
    const localUser = normalizeUser({
      ...payload,
      pin: payload.pin || existingUser?.localPin || existingUser?.pin || "",
      id: localId,
      createdAt: existingUser?.createdAt || Date.now()
    });
    if (existingIndex >= 0) state.users[existingIndex] = localUser;
    else state.users.push(localUser);
    setFaithPointsForUser(localId, $("#userFaithPoints")?.value || 0, "Ajuste do Mestre");
    saveState();
  }
  clearUserForm();
  render();
  showToast("Usuário salvo.");
}

async function handleUserAction(event) {
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
    $("#userPin").value = "";
    $("#userPin").placeholder = "Deixe vazio para manter";
    const faithInput = $("#userFaithPoints");
    if (faithInput) {
      faithInput.value = Math.max(0, getFaithPointsForUser(user.id));
    }
    $("#userManagementPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (button.dataset.action === "delete-user" && confirm(`Remover o usuário ${user.name}?`)) {
    if (!isLocalDevelopmentHost()) {
      try {
        const response = await fetch(`${AUTH_API_BASE}/users`, {
          method: "DELETE",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ id: user.id })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          showToast(result.error || "Não foi possível remover o usuário.");
          return;
        }
        state = await loadSharedState();
        render();
        showToast("Usuário removido.");
      } catch (error) {
        showToast("Não foi possível alcançar o servidor.");
      }
      return;
    }
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
  const ok = applyBalanceAdjustment({
    action: $("#settingsBalanceAction").value,
    amountGp: $("#startingBalance").value,
    label: $("#settingsBalanceAction").value === "expense" ? "Ajuste do Mestre: retirada" : "Ajuste do Mestre: acréscimo"
  });
  if (!ok) {
    return;
  }
  saveState();
  render();
  showToast("Saldo atual ajustado.");
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
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.notes) && Array.isArray(parsed.links)) {
      const users = Array.isArray(state.users) ? state.users : [];
      const userLookup = new Map(users.map((user) => [user.id, user]));
      state.campfire = state.campfire && typeof state.campfire === "object" ? state.campfire : {};
      state.campfire.investigationBoard = normalizeInvestigationBoard(parsed, "", userLookup);
      saveState();
      $("#importData").value = "";
      render();
      showToast("Quadro de investigação restaurado.");
      return;
    }
    state = normalizeState(parsed);
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

function setCampaignRecordDate(prefix, day = 0) {
  setDateInputs(`${prefix}Day`, `${prefix}Month`, day || state.currentDay);
  if (!day) $(`#${prefix}Day`).value = "";
}

function readCampaignRecordDate(prefix, previousDay = 0) {
  if (!$(`#${prefix}Day`).value) return 0;
  return getAbsoluteDayFromInputs(`${prefix}Day`, `${prefix}Month`, getCampaignYear(previousDay || state.currentDay));
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
    const dataUrl = await readImageAsDataUrl(file, { preserveTransparency: hiddenInputId === "trophyImage" });
    $(`#${hiddenInputId}`).value = dataUrl;
    renderImagePreview(previewId, dataUrl);
    showToast("Imagem carregada.");
  } catch (error) {
    showToast("Não foi possível carregar a imagem.");
  }
}

function readImageAsDataUrl(file, { preserveTransparency = false } = {}) {
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
        const keepAlpha = preserveTransparency && file.type === "image/png";
        const context = canvas.getContext("2d", { alpha: keepAlpha });
        if (!keepAlpha) {
          context.fillStyle = "#10130f";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function normalizePortraitCrop(value) {
  const finite = (number, fallback, min, max) => Number.isFinite(Number(number)) ? Math.min(max, Math.max(min, Number(number))) : fallback;
  return { x: finite(value?.x, 50, 0, 100), y: finite(value?.y, 50, 0, 100), zoom: finite(value?.zoom, 1, 1, 3) };
}

function portraitCropStyle(value) {
  const crop = normalizePortraitCrop(value);
  return `object-position:${crop.x}% ${crop.y}%;transform:scale(${crop.zoom});transform-origin:${crop.x}% ${crop.y}%`;
}

function readPortraitCrop(previewId) {
  const preview = document.getElementById(previewId);
  const values = {};
  preview?.querySelectorAll("[data-crop-field]").forEach((input) => { values[input.dataset.cropField] = Number(input.value); });
  return normalizePortraitCrop(values);
}

function renderPortraitEditor(image, value) {
  if (!image) return "<span>Nenhuma imagem selecionada</span>";
  const crop = normalizePortraitCrop(value);
  return `<div class="portrait-crop-editor"><div class="portrait-crop-window"><img src="${escapeAttr(image)}" alt="Prévia do enquadramento" style="${portraitCropStyle(crop)}"></div><div class="portrait-crop-controls">${[["x", "Horizontal", 0, 100, 1], ["y", "Vertical", 0, 100, 1], ["zoom", "Zoom", 1, 3, 0.05]].map(([key, label, min, max, step]) => `<label>${label}<input type="range" data-crop-field="${key}" min="${min}" max="${max}" step="${step}" value="${crop[key]}"></label>`).join("")}</div></div>`;
}

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-crop-field]")) return;
  const preview = event.target.closest(".image-preview");
  const image = preview?.querySelector(".portrait-crop-window img");
  if (image) image.style.cssText = portraitCropStyle(readPortraitCrop(preview.id));
});

function renderImagePreview(previewId, dataUrl, crop) {
  const preview = $(`#${previewId}`);
  if (!preview) {
    return;
  }
  if (["roomImagePreview", "npcImagePreview", "npcModalImagePreview"].includes(previewId)) {
    preview.innerHTML = renderPortraitEditor(dataUrl, crop);
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

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value || "")) : String(value || "").replace(/["\\]/g, "\\$&");
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

function renderDashboardDateGroups(items, dateKey, dateLabel, renderItem) {
  const groups = new Map();
  items.forEach(item => { const key = dateKey(item); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
  return [...groups.values()].map(group => `<section class="dashboard-date-group"><h3>${escapeHtml(dateLabel(group[0]))}</h3>${group.map(renderItem).join("")}</section>`).join("");
}

function renderDashboard() {
  renderDashboardHero();
  renderDashboardFaith();
  renderDashboardCalendar();
  renderDashboardJourney();
  const marketStock = getCombinedMarketStock();
  const marketKey = getCacheKey(state.revision, marketStock.length, state.market.lastRestockDay);
  const marketHtml = getCachedValue(renderCache.dashboardMarketHtml, marketKey, () => marketStock.length
    ? `<div class="market-shelf-grid">${marketStock.slice(0, 6).map(renderDashboardMarketItem).join("")}</div>
       <footer><span>${marketStock.length} item${marketStock.length === 1 ? "" : "s"} na vitrine</span><strong>Renova em ${formatCalendarDate(getNextMarketDay())}</strong></footer>`
    : renderEmpty("Portas fechadas", "O Mercado Esmeralda ainda não recebeu seu estoque desta semana."));
  setHtmlIfChanged($("#dashboardMarketList"), marketHtml);
  const recent = [...state.ledger].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const recentHtml = getCachedValue(renderCache.recentLedgerHtml, getCacheKey(state.revision, recent.length, "dashboard-ledger"), () => recent.length
    ? renderDashboardDateGroups(recent, entry => entry.day, entry => formatCalendarDate(entry.day), entry => `<article class="dashboard-ledger-row ${entry.type === "income" ? "income" : "expense"}"><strong>${escapeHtml(entry.name)}</strong><span>${entry.type === "income" ? "↗ +" : "↘ −"}${formatCopper(entry.amountCopper)}</span></article>`)
    : renderEmpty("Sem movimentos", "Os registros do tesouro ainda não receberam movimentos."));
  setHtmlIfChanged($("#recentLedger"), recentHtml);
}

function renderDashboardHero() {
  dashboardGoalObserver.disconnect();
  const panel = $("#dashboardHeroPanel");
  if (!panel) return;
  const hero = getCampfireHeroForUser(getActiveUserId());
  panel.classList.toggle("is-empty", !hero);
  if (!hero) {
    setHtmlIfChanged(panel, renderEmpty("Seu herói", "Nenhum personagem está vinculado a este perfil."));
    return;
  }
  const visibleGoals = hero.goals.filter((goal) => canSeeCampfireSecrets(hero) || !goal.secret);
  const goalsHtml = ["short", "medium", "long"].map((category) => {
    const goals = visibleGoals.filter((item) => item.category === category);
    const goalList = goals.length
      ? `<ul>${goals.map((goal) => `<li class="${goal.secret ? "goal-is-secret" : ""}"><span class="dashboard-goal-text">${escapeHtml(goal.text)}</span><button type="button" class="dashboard-goal-toggle" aria-expanded="false" hidden>Ver mais</button>${goal.secret ? `<span class="goal-secret-lock" role="img" aria-label="Objetivo secreto" title="Objetivo secreto"></span>` : ""}</li>`).join("")}</ul>`
      : `<p>Sem objetivo visível.</p>`;
    return `<article class="dash-goal goal-${category}"><strong>${escapeHtml(campfireGoalCategories[category])}</strong>${goalList}</article>`;
  }).join("");
  const trophies = state.trophies
    .filter((item) => item.awardedToGroup !== false || item.recipientHeroIds?.includes(hero.id))
    .sort((a, b) => Number(a.awardedToGroup !== false) - Number(b.awardedToGroup !== false)
      || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
      || a.id.localeCompare(b.id))
    .slice(0, 4);
  const heroKey = getCacheKey(state.revision, hero.id, hero.updatedAt, visibleGoals.length, trophies.map((item) => [item.id, item.title, item.image, item.rarity]));
  const html = getCachedValue(renderCache.dashboardHeroHtml, heroKey, () => `
    <div class="dashboard-hero-portrait ${hero.image ? "has-image" : ""}">
      ${hero.image ? `<img src="${escapeAttr(hero.image)}" alt="${escapeAttr(hero.characterName)}" width="360" height="480" loading="eager" decoding="async">` : `<span>${escapeHtml(getInitials(hero.characterName))}</span>`}
    </div>
    <div class="dashboard-hero-sheet">
      <header class="dashboard-hero-identity">
        <div class="dashboard-hero-identity-copy">
          <p class="eyebrow">Seu herói</p>
          <h2>${escapeHtml(hero.characterName)}</h2>
          ${(hero.className || hero.level) ? `<div class="hero-identity-meta" aria-label="Detalhes do personagem">
            ${hero.className ? `<span>${escapeHtml(hero.className)}</span>` : ""}
            ${(hero.className && hero.level) ? `<i aria-hidden="true">&middot;</i>` : ""}
            ${hero.level ? `<span>${escapeHtml(hero.level)}</span>` : ""}
          </div>` : ""}
        </div>
 ${trophies.length ? `<div class="hero-trophy-badges" aria-label="Conquistas do herói">${trophies.map((item) => `<button type="button" class="hero-trophy-badge rarity-${escapeAttr(item.rarity)}" data-hero-trophy="${escapeAttr(item.id)}" title="${escapeAttr(item.title)}" aria-label="Ver conquista: ${escapeAttr(item.title)}">${item.image ? `<img src="${escapeAttr(item.image)}" alt="" width="64" height="64" loading="lazy" decoding="async">` : `<span class="hero-trophy-icon" aria-hidden="true"></span>`}</button>`).join("")}</div>` : ""}
      </header>
    </div>
    <div class="dash-goal-grid dashboard-hero-goals">${goalsHtml}</div>`);
  setHtmlIfChanged(panel, html);
  panel.querySelectorAll(".dashboard-goal-text").forEach(text => dashboardGoalObserver.observe(text));
}

const dashboardGoalObserver = new ResizeObserver(entries => {
  for (const { target } of entries) {
    const button = target.nextElementSibling;
    const limit = parseFloat(getComputedStyle(target).lineHeight) * 3;
    button.hidden = target.scrollHeight <= limit + 1;
  }
});
document.addEventListener("click", event => {
  const button = event.target.closest(".dashboard-goal-toggle");
  if (!button) return;
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  button.textContent = open ? "Ver menos" : "Ver mais";
  button.previousElementSibling.classList.toggle("is-expanded", open);
});

function renderDashboardMarketItem(item) {
  const icon = getDashboardMarketIcon(item);
  const rarity = String(item.rarity || "Common").toLowerCase();
  return `<button class="market-shelf-item rarity-${escapeAttr(rarity)}" type="button" data-action="open-market" title="${escapeAttr(item.name)}">
    <span class="market-shelf-icon icon-${icon}" aria-hidden="true"></span>
    <span><strong>${escapeHtml(item.name)}</strong><small>Nível ${item.level} · ${escapeHtml(item.rarity)}</small></span>
  </button>`;
}

function playMarketRestockAnimation() {
  const panel = document.querySelector(".dashboard-market-panel");
  if (!panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  panel.classList.remove("is-restocking");
  window.requestAnimationFrame(() => {
    panel.classList.add("is-restocking");
    window.setTimeout(() => panel.classList.remove("is-restocking"), 720);
  });
}

function getDashboardMarketIcon(item) {
  const text = `${item.category || ""} ${item.subcategory || ""} ${item.trait || ""}`.toLowerCase();
  if (item.section === "consumable" || /elixir|potion|alchemical|bomb|consumable/.test(text)) return "potion";
  if (/weapon|sword|bow|staff|wand/.test(text)) return "weapon";
  if (/armor|shield/.test(text)) return "armor";
  if (/magic|spell|arcane|divine|occult|primal/.test(text)) return "arcane";
  return "relic";
}

function renderDashboardFaith() {
  const panel = $("#dashboardFaithPanel");
  if (!panel) return;
  const rules = faithPointRulesDisplay;
  const activeUser = isAuthenticated() ? getActiveUser() : null;
  const points = activeUser ? Math.max(0, getFaithPointsForUser(activeUser.id)) : 0;
  panel.classList.toggle("collapsed", !dashboardFaithExpanded);
  const basics = rules.basics
    .map(([label, value]) => `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`)
    .join("");
  const traits = rules.traits
    .map((trait) => `<span class="faith-trait">${escapeHtml(trait)}</span>`)
    .join("");
  const activations = rules.activations
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join("");
  const outcomes = rules.outcomes
    .map(([label, roll, text], index) => {
      const classes = ["critical-success", "success", "failure", "critical-failure"];
      return `<article class="faith-outcome ${classes[index] || ""}"><strong>${escapeHtml(label)} <small>(${escapeHtml(roll)})</small></strong><p>${escapeHtml(text)}</p></article>`;
    })
    .join("");
  const canUse = Boolean(activeUser && points > 0);
  const faithKey = getCacheKey(state.revision, activeUser?.id || "", points, dashboardFaithExpanded, faithUseConfirmOpen);
  const confirmHtml = faithUseConfirmOpen
    ? `<div class="faith-confirm" role="alert">
        <strong>Entregar este pedido ao divino?</strong>
        <p>Ao gastar um Ponto de Fé, a prece deixa suas mãos e só retorna por nova concessão divina.</p>
        <div class="button-row compact">
          <button class="button primary" type="button" data-action="confirm-use-faith">Confirmar uso</button>
          <button class="button ghost" type="button" data-action="cancel-use-faith">Cancelar</button>
        </div>
      </div>`
    : "";
  const html = getCachedValue(renderCache.dashboardFaithHtml, faithKey, () => `
    <button class="faith-compact" type="button" data-action="toggle-faith-panel" aria-expanded="${dashboardFaithExpanded ? "true" : "false"}">
      <span>Pontos de Fé</span>
      <strong>${points}</strong>
      <em>${dashboardFaithExpanded ? "Recolher" : "Ver regras"}</em>
    </button>
    <div class="faith-summary">
      <div class="faith-traits">${traits}</div>
      <button class="button primary faith-use-button" type="button" data-action="use-faith-point" ${canUse ? "" : "disabled"}>Usar Ponto de Fé</button>
    </div>
    ${confirmHtml}
    <div class="faith-rule-card">
      <header>
        <div>${basics}</div>
      </header>
      <p>${escapeHtml(rules.description)}</p>
      <section>
        <h3>Possibilidades de ativação</h3>
        <ol>${activations}</ol>
      </section>
      <section class="faith-outcomes">
        <h3>Resultado do pedido</h3>
        <div>${outcomes}</div>
      </section>
    </div>`);
  setHtmlIfChanged(panel, html);
}

function handleFaithAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "toggle-faith-panel") {
    dashboardFaithExpanded = !dashboardFaithExpanded;
    faithUseConfirmOpen = false;
    renderDashboardFaith();
    return;
  }
  if (action === "cancel-use-faith") {
    faithUseConfirmOpen = false;
    renderDashboardFaith();
    return;
  }
  const activeUser = getActiveUser();
  if (!isAuthenticated() || !activeUser) {
    showToast("Entre com seu perfil para usar Pontos de Fé.");
    return;
  }
  const current = getFaithPointsForUser(activeUser.id);
  if (current <= 0) {
    showToast("Você não possui Pontos de Fé disponíveis.");
    faithUseConfirmOpen = false;
    renderDashboardFaith();
    return;
  }
  if (action === "use-faith-point") {
    faithUseConfirmOpen = true;
    renderDashboardFaith();
    return;
  }
  if (action !== "confirm-use-faith") {
    return;
  }
  addFaithTransaction(activeUser.id, -1, "Uso de Ponto de Fé");
  saveState();
  faithUseConfirmOpen = false;
  render();
  showToast("Ponto de Fé utilizado.");
}

function renderDashboardJourney() {
  const list = $("#dashboardJourneyList");
  const commentList = $("#dashboardJourneyCommentList");
  if (!list || !commentList) return;
  const entries = [...state.journey.entries]
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0) || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, 4);
  const key = getCacheKey(state.revision, entries.map((entry) => `${entry.id}:${entry.createdAt}:${entry.updatedAt}`).join(","));
  const html = getCachedValue(renderCache.dashboardJourneyHtml, key, () => entries.length
    ? renderDashboardDateGroups(entries, entry => new Date(Number(entry.createdAt) || 0).toLocaleDateString("pt-BR"), entry => new Date(Number(entry.createdAt) || 0).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" }), entry => renderDashboardJourneyCard(entry, { showUnread: false }))
    : renderEmpty("Jornada vazia", "As novas lembranças da mesa aparecerão aqui."));
  setHtmlIfChanged(list, html);

  const unreadEntries = state.journey.entries
    .map((entry) => ({ entry, comments: getUnreadJourneyComments(entry) }))
    .filter((item) => item.comments.length)
    .sort((a, b) => Math.max(...b.comments.map(getJourneyCommentStamp)) - Math.max(...a.comments.map(getJourneyCommentStamp)) || a.entry.title.localeCompare(b.entry.title, "pt-BR"))
    .slice(0, 4);
  const commentsKey = getCacheKey(
    state.revision,
    getActiveUserId() || "",
    unreadEntries.map(({ entry, comments }) => `${entry.id}:${comments.length}:${Math.max(...comments.map(getJourneyCommentStamp))}`).join(",")
  );
  const commentsHtml = getCachedValue(renderCache.dashboardJourneyCommentsHtml, commentsKey, () => unreadEntries.length
    ? unreadEntries.map(({ entry }) => renderDashboardJourneyCard(entry)).join("")
    : `<div class="dashboard-all-read"><span aria-hidden="true">✓</span><div><strong>Tudo lido</strong><p>Nenhum novo comentário na Jornada.</p></div></div>`);
  setHtmlIfChanged(commentList, commentsHtml);
}

function renderDashboardJourneyCard(entry, options = {}) {
  const unreadCount = options.showUnread === false ? 0 : getUnreadJourneyComments(entry).length;
  const unreadBadge = unreadCount
    ? `<em class="journey-unread-badge">${unreadCount} novo${unreadCount === 1 ? "" : "s"}</em>`
    : "";
  return `
    <button class="dashboard-journey-card ${unreadCount ? "has-unread" : ""}" type="button" data-action="open-journey-entry" data-id="${escapeAttr(entry.id)}">
      <span class="dashboard-journey-memory">${entry.image ? `<img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}" loading="lazy" decoding="async">` : `<span class="journey-image-placeholder">Sem imagem</span>`}</span>
      <span class="dashboard-journey-copy"><strong>${escapeHtml(entry.title)}</strong><small>Nível ${escapeHtml(entry.level)}</small><p>${escapeHtml(String(entry.description || "Sem descrição.").slice(0, 150))}</p></span>
      ${unreadBadge}
    </button>
  `;
}

function formatJournalDate(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

function openJourneyEntry(id) {
  if (!id || !state.journey.entries.some((entry) => entry.id === id)) {
    showView("journey");
    return;
  }
  showView("journey");
  selectedJourneyEntryId = id;
  journeyModalEditId = "";
  markJourneyEntryRead(id);
  renderJourney();
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
  const journeyReferences = $("#journeyReferences");
  if (journeyReferences && !journeyReferences.options.length) journeyReferences.innerHTML = getCampaignReferenceOptions();
  const entries = getFilteredJourneyEntries();
  setHtmlIfChanged($("#journeyCategoryChips"), [["all", "Todos"], ...Object.entries(JOURNEY_CATEGORIES)].map(([key, label]) => `<button type="button" class="journey-filter category-${key}" data-journey-category="${key}" aria-pressed="${$("#journeyCategoryFilter").value === key}"><i class="journey-category-icon" aria-hidden="true"></i>${escapeHtml(label)}</button>`).join(""));
  $$("[data-journey-sort]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.journeySort === $("#journeySort").value)));
  if (count) {
    count.textContent = `${entries.length} lembrança${entries.length === 1 ? "" : "s"}`;
  }
  if (selectedJourneyEntryId && !state.journey.entries.some((entry) => entry.id === selectedJourneyEntryId)) {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
    journeyCommentEditId = "";
  }
  if (selectedJourneyEntryId && entries.length && !entries.some((entry) => entry.id === selectedJourneyEntryId)) {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
    journeyCommentEditId = "";
  }
  if (!entries.length) {
    selectedJourneyEntryId = "";
    journeyModalEditId = "";
    journeyCommentEditId = "";
  }
  const key = getCacheKey(state.revision, $("#journeySearch")?.value || "", $("#journeyCategoryFilter")?.value || "all", $("#journeySort")?.value || "name", selectedJourneyEntryId, journeyModalEditId, journeyCommentEditId, getActiveUserId(), isAdmin());
  const galleryHtml = getCachedValue(renderCache.journeyGalleryHtml, key, () => entries.length
    ? entries.map(renderJourneyCard).join("")
    : renderEmpty("Jornada vazia", "Adicione uma imagem, um nome e uma descrição para começar o diário da mesa."));
  setHtmlIfChanged(gallery, galleryHtml);
  const selectedEntry = selectedJourneyEntryId ? state.journey.entries.find((entry) => entry.id === selectedJourneyEntryId) : null;
  const commentsStamp = selectedEntry?.comments?.reduce((max, comment) => Math.max(max, Number(comment.updatedAt) || Number(comment.createdAt) || 0), 0) || 0;
  const detailKey = getCacheKey(state.revision, selectedEntry?.id || "none", selectedEntry?.updatedAt || 0, selectedEntry?.comments.length || 0, commentsStamp, journeyModalEditId, journeyCommentEditId, getActiveUserId(), isAdmin());
  const detailHtml = getCachedValue(renderCache.journeyDetailHtml, detailKey, () => renderJourneyDetail(selectedEntry));
  setHtmlIfChanged(detail, detailHtml);
  modal.hidden = !selectedEntry;
  document.body.classList.toggle("journey-modal-open", Boolean(selectedEntry));
}

function getFilteredJourneyEntries() {
  const query = ($("#journeySearch")?.value || "").trim().toLowerCase();
  const sort = $("#journeySort")?.value || "name";
  const category = $("#journeyCategoryFilter")?.value || "all";
  const entries = state.journey.entries.filter((entry) => {
    const comments = entry.comments.map((comment) => `${comment.text} ${comment.heroName} ${comment.userName}`).join(" ");
    const haystack = `${entry.title} ${entry.level} ${entry.description} ${entry.category} ${entry.region} ${entry.threat} ${(entry.tags || []).join(" ")} ${comments}`.toLowerCase();
    return (!query || haystack.includes(query)) && (category === "all" || entry.category === category);
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
  const unreadCount = getUnreadJourneyComments(entry).length;
  return `
    <article class="journey-card category-${Object.hasOwn(JOURNEY_CATEGORIES, entry.category) ? entry.category : "event"} ${active} ${unreadCount ? "has-unread" : ""}">
      <button class="journey-card-open" type="button" data-action="select-journey" data-id="${escapeAttr(entry.id)}">
        ${entry.image ? `<img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}" loading="lazy" decoding="async">` : `<span class="journey-image-placeholder">Sem imagem</span>`}
        <span class="journey-photo-caption"><span class="journey-card-title">${escapeHtml(entry.title)}</span><span class="journey-photo-meta">
        <span class="journey-level">Nível ${escapeHtml(entry.level || "?")}</span>
        <span class="journey-category"><i class="journey-category-icon" aria-hidden="true"></i>${escapeHtml(JOURNEY_CATEGORIES[entry.category] || "Acontecimento")}</span>
        </span></span>
        ${entry.comments?.length ? `<span class="journey-comment-count" aria-label="${entry.comments.length} comentários${unreadCount ? `, ${unreadCount} novos` : ""}" title="${entry.comments.length} comentários${unreadCount ? ` · ${unreadCount} novos` : ""}"><i aria-hidden="true"></i>${entry.comments.length}${unreadCount ? `<b aria-hidden="true">•</b>` : ""}</span>` : ""}
      </button>
      ${canRemove ? `<div class="journey-card-actions"><button class="icon-button" type="button" title="Editar lembrança" data-action="edit-journey" data-id="${escapeAttr(entry.id)}">✎</button><button class="icon-button" type="button" title="Remover lembrança" data-action="delete-journey" data-id="${escapeAttr(entry.id)}">✕</button></div>` : ""}
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
            <span class="chip">${escapeHtml(JOURNEY_CATEGORIES[entry.category] || entry.category || "Acontecimento")}</span>
            ${entry.threat ? `<span class="chip">Ameaça ${escapeHtml(entry.threat)}</span>` : ""}
            ${entry.region ? `<span class="chip">${escapeHtml(entry.region)}</span>` : ""}
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
      ${entry.tags?.length ? `<div class="chip-row">${entry.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      ${renderReferenceChips(entry.references || [])}
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
          <p class="eyebrow">Editar lembrança</p>
          <h3>${escapeHtml(entry.title)}</h3>
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" title="Cancelar edição" data-action="cancel-journey-edit" data-id="${escapeAttr(entry.id)}">×</button>
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
            Título
            <input name="title" maxlength="100" autocomplete="off" value="${escapeAttr(entry.title)}">
          </label>
          <label>
            Nível
            <input name="level" maxlength="12" autocomplete="off" value="${escapeAttr(entry.level)}">
          </label>
        </div>
        <div class="form-row">
          <label>Categoria<select name="category">${Object.entries(JOURNEY_CATEGORIES).map(([key,label]) => `<option value="${key}"${entry.category === key ? " selected" : ""}>${label}</option>`).join("")}</select></label>
          <label>Ameaça<input name="threat" maxlength="40" value="${escapeAttr(entry.threat || "")}"></label>
          <label>Região<input name="region" maxlength="60" value="${escapeAttr(entry.region || "")}"></label>
        </div>
        <label>Etiquetas (separadas por vírgula)<input name="tags" maxlength="160" value="${escapeAttr((entry.tags || []).join(", "))}"></label>
        <label>Referências cruzadas<select name="references" multiple size="5">${getCampaignReferenceOptions(entry.references || [])}</select></label>
        <label>
          Descrição
          <textarea name="description" rows="6" maxlength="1200">${escapeHtml(entry.description || "")}</textarea>
        </label>
        <div class="button-row">
          <button class="button primary" type="submit">Salvar lembrança</button>
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
  const isEditing = journeyCommentEditId === comment.id && canRemove;
  if (isEditing) {
    return `
      <article class="journey-comment editing">
        <form class="journey-comment-edit-form" data-entry-id="${escapeAttr(entry.id)}" data-comment-id="${escapeAttr(comment.id)}">
          <label>
            Editar comentário
            <textarea name="comment" rows="3" maxlength="500">${escapeHtml(comment.text || "")}</textarea>
          </label>
          <div class="button-row compact">
            <button class="button subtle" type="submit">Salvar</button>
            <button class="button ghost" type="button" data-action="cancel-journey-comment-edit">Cancelar</button>
          </div>
        </form>
      </article>
    `;
  }
  return `
    <article class="journey-comment">
      <div>
        <strong>${escapeHtml(author)}</strong>
        ${comment.heroName && comment.userName ? `<span>${escapeHtml(comment.userName)}</span>` : ""}
      </div>
      <p>${nl2br(comment.text)}</p>
      ${canRemove ? `<div class="comment-actions"><button class="icon-button" type="button" title="Editar comentário" data-action="edit-journey-comment" data-entry-id="${escapeAttr(entry.id)}" data-comment-id="${escapeAttr(comment.id)}">✎</button><button class="icon-button" type="button" title="Remover comentário" data-action="delete-journey-comment" data-entry-id="${escapeAttr(entry.id)}" data-comment-id="${escapeAttr(comment.id)}">✕</button></div>` : ""}
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
    category: $("#journeyCategory")?.value || "event",
    threat: $("#journeyThreat")?.value.trim() || "",
    region: $("#journeyRegion")?.value.trim() || "",
    tags: normalizeTags($("#journeyTags")?.value || ""),
    references: getSelectedOptions($("#journeyReferences")),
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
    journeyCommentEditId = "";
    markJourneyEntryRead(id);
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
      journeyCommentEditId = "";
      renderJourney();
    }
    return;
  }
  if (action === "cancel-journey-edit") {
    journeyModalEditId = "";
    journeyCommentEditId = "";
    renderJourney();
    return;
  }
  if (action === "edit-journey-comment") {
    const entry = state.journey.entries.find((item) => item.id === button.dataset.entryId);
    const comment = entry?.comments.find((item) => item.id === button.dataset.commentId);
    if (comment && canManageJourneyComment(comment)) {
      journeyCommentEditId = comment.id;
      renderJourney();
    }
    return;
  }
  if (action === "cancel-journey-comment-edit") {
    journeyCommentEditId = "";
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
        journeyCommentEditId = "";
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
    showToast("Você só pode editar lembranças que criou.");
    return;
  }
  const title = event.target.elements.title?.value.trim() || "";
  if (!title) {
    showToast("Informe um título para a lembrança.");
    return;
  }
  const index = state.journey.entries.findIndex((item) => item.id === entry.id);
  state.journey.entries[index] = {
    ...entry,
    title,
    level: normalizeJourneyLevel(event.target.elements.level?.value),
    image: $("#journeyModalImage")?.value || "",
    description: event.target.elements.description?.value.trim() || "",
    category: event.target.elements.category?.value || entry.category || "event",
    threat: event.target.elements.threat?.value.trim() || "",
    region: event.target.elements.region?.value.trim() || "",
    tags: normalizeTags(event.target.elements.tags?.value || ""),
    references: getSelectedOptions(event.target.elements.references),
    updatedAt: Date.now()
  };
  journeyModalEditId = "";
  saveState();
  renderJourney();
  showToast("Lembrança atualizada.");
}

function handleJourneyCommentSubmit(event) {
  if (event.target.classList.contains("journey-comment-edit-form")) {
    saveJourneyCommentEdit(event);
    return;
  }
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
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  textarea.value = "";
  saveState();
  renderJourney();
  showToast("Comentário adicionado.");
}

function saveJourneyCommentEdit(event) {
  event.preventDefault();
  const entry = state.journey.entries.find((item) => item.id === event.target.dataset.entryId);
  const comment = entry?.comments.find((item) => item.id === event.target.dataset.commentId);
  const text = event.target.elements.comment?.value.trim() || "";
  if (!entry || !comment || !canManageJourneyComment(comment)) {
    return;
  }
  if (!text) {
    showToast("O comentário não pode ficar vazio.");
    return;
  }
  comment.text = text;
  comment.updatedAt = Date.now();
  entry.updatedAt = Date.now();
  journeyCommentEditId = "";
  saveState();
  renderJourney();
  showToast("Comentário atualizado.");
}

function handleJourneyKeydown(event) {
  if (event.key === "Escape" && selectedJourneyEntryId) {
    closeJourneyModal();
  }
}

function closeJourneyModal() {
  selectedJourneyEntryId = "";
  journeyModalEditId = "";
  journeyCommentEditId = "";
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
  $("#journeyCategory").value = entry.category || "event";
  $("#journeyThreat").value = entry.threat || "";
  $("#journeyRegion").value = entry.region || "";
  $("#journeyTags").value = (entry.tags || []).join(", ");
  $("#journeyReferences").innerHTML = getCampaignReferenceOptions(entry.references || []);
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
  $("#journeyCategory").value = "event";
  $("#journeyThreat").value = "";
  $("#journeyRegion").value = "";
  $("#journeyTags").value = "";
  $("#journeyReferences").innerHTML = getCampaignReferenceOptions();
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
  const noteField = $("#campfireLegionNotes");
  const noteRead = $("#campfireLegionRead");
  const noteDisplay = $("#campfireLegionDisplay");
  const noteForm = $("#campfireLegionForm");
  const noteToggle = $("#toggleCampfireLegionEditor");
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
  if (noteDisplay) {
    const legionNotes = state.campfire.legionNotes || "";
    noteDisplay.textContent = legionNotes || "Minimus Legio ainda não guardou anotações.";
    noteDisplay.classList.toggle("empty", !legionNotes);
  }
  if (noteRead) {
    noteRead.hidden = campfireNotesEditing;
  }
  if (noteForm) {
    noteForm.hidden = !campfireNotesEditing;
  }
  if (noteToggle) {
    noteToggle.hidden = campfireNotesEditing;
  }
  if (galleryCount) {
    galleryCount.textContent = `${state.campfire.heroes.length} card${state.campfire.heroes.length === 1 ? "" : "s"}`;
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
  renderCampfireInvestigation();
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
          ${hero.image ? `<img src="${escapeAttr(hero.image)}" alt="${escapeAttr(hero.characterName)}" loading="lazy" decoding="async">` : `<span>${escapeHtml(getInitials(hero.characterName))}</span>`}
        </div>
        <div class="hero-headline">
          <h3>${escapeHtml(hero.characterName)}</h3>
          <div class="chip-row">
            ${statusLabel ? `<span class="chip income">${escapeHtml(statusLabel)}</span>` : ""}
            ${hero.className ? `<span class="chip">${escapeHtml(hero.className)}</span>` : ""}
            ${hero.level ? `<span class="chip">Nível ${escapeHtml(hero.level)}</span>` : ""}
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

function getInvestigationBoard() {
  state.campfire.investigationBoard = state.campfire.investigationBoard && typeof state.campfire.investigationBoard === "object"
    ? state.campfire.investigationBoard
    : { notes: [], links: [] };
  state.campfire.investigationBoard.width = Math.max(INVESTIGATION_BOARD_MIN_WIDTH, Math.min(INVESTIGATION_BOARD_MAX_WIDTH, Number(state.campfire.investigationBoard.width) || 1800));
  state.campfire.investigationBoard.height = Math.max(INVESTIGATION_BOARD_MIN_HEIGHT, Math.min(INVESTIGATION_BOARD_MAX_HEIGHT, Number(state.campfire.investigationBoard.height) || 1250));
  state.campfire.investigationBoard.notes = Array.isArray(state.campfire.investigationBoard.notes) ? state.campfire.investigationBoard.notes : [];
  state.campfire.investigationBoard.links = Array.isArray(state.campfire.investigationBoard.links) ? state.campfire.investigationBoard.links : [];
  return state.campfire.investigationBoard;
}

function getInvestigationNoteEstimatedSize(note) {
  return {
    width: 220,
    height: Math.max(166, 128 + Math.ceil(String(note?.text || "").length / 48) * 18 + (note?.journeyEntryId ? 104 : 0))
  };
}

function getInvestigationBoardSize(notes, measureNote) {
  const safeNotes = Array.isArray(notes) ? notes : [];
  const maxRight = safeNotes.reduce((max, note) => {
    const measured = measureNote ? measureNote(note) : null;
    const fallback = getInvestigationNoteEstimatedSize(note);
    const width = measured?.width || fallback.width;
    return Math.max(max, (Number(note.x) || 0) + width);
  }, 0);
  const maxBottom = safeNotes.reduce((max, note) => {
    const measured = measureNote ? measureNote(note) : null;
    const fallback = getInvestigationNoteEstimatedSize(note);
    const height = measured?.height || fallback.height;
    return Math.max(max, (Number(note.y) || 0) + height);
  }, 0);
  return {
    width: Math.max(INVESTIGATION_BOARD_MIN_WIDTH, Math.min(INVESTIGATION_BOARD_MAX_WIDTH, Math.ceil(maxRight + INVESTIGATION_BOARD_MARGIN_X))),
    height: Math.max(INVESTIGATION_BOARD_MIN_HEIGHT, Math.min(INVESTIGATION_BOARD_MAX_HEIGHT, Math.ceil(maxBottom + INVESTIGATION_BOARD_MARGIN_Y)))
  };
}

function fitInvestigationBoardToNotes() {
  const board = getInvestigationBoard();
  const nextSize = getInvestigationBoardSize(board.notes, (note) => {
    const element = document.querySelector(`.investigation-note[data-note-id="${cssEscape(note.id)}"]`);
    return element ? { width: element.offsetWidth, height: element.offsetHeight } : null;
  });
  board.width = nextSize.width;
  board.height = nextSize.height;
  return board;
}

function applyInvestigationBoardSize(board = getInvestigationBoard()) {
  const boardElement = $("#campfireInvestigationBoard");
  const linksSvg = $("#campfireInvestigationLinks");
  if (boardElement) {
    boardElement.style.width = `${board.width}px`;
    boardElement.style.height = `${board.height}px`;
  }
  if (linksSvg) {
    linksSvg.setAttribute("width", String(board.width));
    linksSvg.setAttribute("height", String(board.height));
    linksSvg.style.width = `${board.width}px`;
    linksSvg.style.height = `${board.height}px`;
  }
}

function getInvestigationAuthor() {
  const user = getActiveUser();
  const hero = getCampfireHeroForUser(user?.id);
  return {
    createdByUserId: user?.id || "",
    createdByName: user?.name || "Viajante",
    createdByHeroId: hero?.id || "",
    createdByHeroName: hero?.characterName || ""
  };
}

function getInvestigationJourneyEntry(note) {
  return note?.journeyEntryId ? state.journey.entries.find((entry) => entry.id === note.journeyEntryId) || null : null;
}

function renderCampfireInvestigation() {
  const notesWrap = $("#campfireInvestigationNotes");
  const linksSvg = $("#campfireInvestigationLinks");
  const connectButton = $("#connectInvestigationNotes");
  const cancelButton = $("#cancelInvestigationConnect");
  const fullscreenButton = $("#fullscreenInvestigationBoard");
  const boardPanel = $(".campfire-investigation");
  if (!notesWrap || !linksSvg) {
    return;
  }
  const board = fitInvestigationBoardToNotes();
  applyInvestigationBoardSize(board);
  boardPanel?.classList.toggle("is-fullscreen", investigationFullscreen);
  if (fullscreenButton) {
    fullscreenButton.textContent = investigationFullscreen ? "Sair da tela cheia" : "Tela cheia";
  }
  if (selectedInvestigationNoteId && !board.notes.some((note) => note.id === selectedInvestigationNoteId)) {
    selectedInvestigationNoteId = "";
  }
  if (investigationConnectFromId && !board.notes.some((note) => note.id === investigationConnectFromId)) {
    investigationConnectFromId = "";
    investigationConnectMode = false;
  }
  if (connectButton) {
    connectButton.classList.toggle("active", investigationConnectMode);
    connectButton.textContent = investigationConnectFromId ? "Escolha o destino" : (investigationConnectMode ? "Escolha a origem" : "Conectar");
  }
  if (cancelButton) {
    cancelButton.hidden = !investigationConnectMode;
  }
  const notesKey = getCacheKey(
    state.revision,
    selectedInvestigationNoteId,
    investigationConnectMode,
    investigationConnectFromId,
    board.notes.map((note) => `${note.id}:${note.x}:${note.y}:${note.updatedAt}:${note.contentUpdatedAt}:${note.positionUpdatedAt}:${note.journeyEntryId}:${String(note.title || "").length}:${String(note.text || "").length}`).join(","),
    `${board.width}x${board.height}`,
    state.journey.entries.map((entry) => `${entry.id}:${entry.updatedAt}:${entry.image}`).join(",")
  );
  const notesHtml = getCachedValue(renderCache.campfireInvestigationNotesHtml, notesKey, () => board.notes.length
    ? board.notes.map(renderInvestigationNote).join("")
    : `<div class="investigation-empty">Nenhuma pista no quadro. Crie uma nota para começar a ligar os fios da história.</div>`);
  setHtmlIfChanged(notesWrap, notesHtml);
  applyInvestigationBoardSize(fitInvestigationBoardToNotes());
  renderInvestigationLinks();
  renderInvestigationModal();
}

function renderInvestigationNote(note) {
  const entry = getInvestigationJourneyEntry(note);
  const author = note.createdByHeroName || note.createdByName || "Mesa";
  const active = selectedInvestigationNoteId === note.id ? "active" : "";
  const connecting = investigationConnectFromId === note.id ? "connecting" : "";
  return `
    <article class="investigation-note note-${escapeAttr(note.color)} ${active} ${connecting}" data-note-id="${escapeAttr(note.id)}" style="left:${Math.round(note.x)}px; top:${Math.round(note.y)}px">
      <div class="investigation-pin" aria-hidden="true"></div>
      ${entry?.image ? `<div class="investigation-note-image" aria-label="Lembrança vinculada"><img src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.title)}" loading="lazy" decoding="async"></div>` : ""}
      <div class="investigation-note-main">
        <strong>${escapeHtml(note.title)}</strong>
        <span>${note.text ? escapeHtml(note.text) : "Sem descrição."}</span>
      </div>
      ${entry ? `<em class="investigation-journey-label">${escapeHtml(entry.title)}</em>` : ""}
      <footer>
        <span>${escapeHtml(author)}</span>
        <span class="investigation-note-actions">
          <button class="icon-button" type="button" title="Editar nota" data-action="edit-investigation-note" data-note-id="${escapeAttr(note.id)}">✎</button>
          <button class="icon-button" type="button" title="Remover nota" data-action="delete-investigation-note" data-note-id="${escapeAttr(note.id)}">✕</button>
        </span>
      </footer>
    </article>
  `;
}

function renderInvestigationLinks() {
  const linksSvg = $("#campfireInvestigationLinks");
  if (!linksSvg) {
    return;
  }
  const board = getInvestigationBoard();
  const noteMap = new Map(board.notes.map((note) => [note.id, note]));
  const linksKey = getCacheKey(
    state.revision,
    board.links.map((link) => `${link.id}:${link.fromNoteId}:${link.toNoteId}:${link.updatedAt}`).join(","),
    board.notes.map((note) => `${note.id}:${note.x}:${note.y}:${note.positionUpdatedAt}:${note.contentUpdatedAt}:${String(note.title || "").length}:${String(note.text || "").length}:${note.journeyEntryId || ""}`).join(",")
  );
  const linksHtml = getCachedValue(renderCache.campfireInvestigationLinksHtml, linksKey, () => board.links.map((link) => {
    const from = noteMap.get(link.fromNoteId);
    const to = noteMap.get(link.toNoteId);
    if (!from || !to) {
      return "";
    }
    const fromElement = document.querySelector(`.investigation-note[data-note-id="${cssEscape(from.id)}"]`);
    const toElement = document.querySelector(`.investigation-note[data-note-id="${cssEscape(to.id)}"]`);
    const { x: x1, y: y1 } = getInvestigationNoteCenter(from, fromElement);
    const { x: x2, y: y2 } = getInvestigationNoteCenter(to, toElement);
    return `<line class="investigation-link" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-link-id="${escapeAttr(link.id)}"></line>`;
  }).join(""));
  setHtmlIfChanged(linksSvg, linksHtml);
}

function getInvestigationNoteCenter(note, element) {
  return {
    x: (Number(note.x) || 0) + ((element?.offsetWidth || 220) / 2),
    y: (Number(note.y) || 0) + ((element?.offsetHeight || 166) / 2)
  };
}

function updateInvestigationLinkPositions(noteId = "") {
  const linksSvg = $("#campfireInvestigationLinks");
  if (!linksSvg) {
    return;
  }
  const board = getInvestigationBoard();
  const noteMap = new Map(board.notes.map((note) => [note.id, note]));
  board.links.forEach((link) => {
    if (noteId && link.fromNoteId !== noteId && link.toNoteId !== noteId) {
      return;
    }
    const line = linksSvg.querySelector(`[data-link-id="${cssEscape(link.id)}"]`);
    const from = noteMap.get(link.fromNoteId);
    const to = noteMap.get(link.toNoteId);
    if (!line || !from || !to) {
      return;
    }
    const fromElement = document.querySelector(`.investigation-note[data-note-id="${cssEscape(from.id)}"]`);
    const toElement = document.querySelector(`.investigation-note[data-note-id="${cssEscape(to.id)}"]`);
    const fromCenter = getInvestigationNoteCenter(from, fromElement);
    const toCenter = getInvestigationNoteCenter(to, toElement);
    line.setAttribute("x1", String(Math.round(fromCenter.x)));
    line.setAttribute("y1", String(Math.round(fromCenter.y)));
    line.setAttribute("x2", String(Math.round(toCenter.x)));
    line.setAttribute("y2", String(Math.round(toCenter.y)));
  });
}

function renderInvestigationModal() {
  const modal = $("#campfireInvestigationModal");
  const content = $("#campfireInvestigationModalContent");
  if (!modal || !content) {
    return;
  }
  const board = getInvestigationBoard();
  const note = selectedInvestigationNoteId ? board.notes.find((item) => item.id === selectedInvestigationNoteId) : null;
  modal.hidden = !note;
  document.body.classList.toggle("investigation-modal-open", Boolean(note));
  if (!note) {
    pendingInvestigationDeleteId = "";
    setHtmlIfChanged(content, "");
    return;
  }
  const journeyOptions = [
    `<option value="">Sem vínculo com a Jornada</option>`,
    ...state.journey.entries
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
      .map((entry) => `<option value="${escapeAttr(entry.id)}" ${entry.id === note.journeyEntryId ? "selected" : ""}>${escapeHtml(entry.title)}${entry.level ? ` · Nível ${escapeHtml(entry.level)}` : ""}</option>`)
  ].join("");
  const linkList = board.links
    .filter((link) => link.fromNoteId === note.id || link.toNoteId === note.id)
    .map((link) => {
      const otherId = link.fromNoteId === note.id ? link.toNoteId : link.fromNoteId;
      const other = board.notes.find((item) => item.id === otherId);
      return other ? `<li><span>${escapeHtml(other.title)}</span><button class="button ghost tiny" type="button" data-action="delete-investigation-link" data-link-id="${escapeAttr(link.id)}">Remover linha</button></li>` : "";
    })
    .join("");
  const deletePending = pendingInvestigationDeleteId === note.id;
  const key = getCacheKey(state.revision, note.id, note.updatedAt, note.journeyEntryId, board.links.length, state.journey.entries.length, deletePending);
  if (deletePending) {
    const html = `
      <header>
        <div>
          <p class="eyebrow">Confirmar remo\u00e7\u00e3o</p>
          <h3>${escapeHtml(note.title)}</h3>
        </div>
        <button class="icon-button close-button" type="button" title="Fechar nota" data-action="close-investigation-modal">X</button>
      </header>
      <section class="delete-confirmation-panel">
        <p>Esta nota e todas as linhas conectadas a ela ser\u00e3o removidas do quadro de investiga\u00e7\u00e3o.</p>
        <p>Essa a\u00e7\u00e3o n\u00e3o deve ser feita por acidente. Confirme apenas se deseja apagar esta pista da mesa.</p>
      </section>
      <div class="button-row">
        <button class="button danger" type="button" data-action="confirm-delete-investigation-note" data-note-id="${escapeAttr(note.id)}">Confirmar remo\u00e7\u00e3o</button>
        <button class="button ghost" type="button" data-action="cancel-delete-investigation-note">Cancelar</button>
      </div>
    `;
    setHtmlIfChanged(content, html);
    return;
  }
  const html = getCachedValue(renderCache.campfireInvestigationModalHtml, key, () => `
    <header>
      <div>
        <p class="eyebrow">Quadro de investigação</p>
        <h3>${escapeHtml(note.title)}</h3>
      </div>
      <button class="icon-button close-button" type="button" title="Fechar nota" data-action="close-investigation-modal">X</button>
    </header>
    <form class="stacked-form investigation-note-form" data-note-id="${escapeAttr(note.id)}">
      <div class="form-row">
        <label>
          Título
          <input name="title" maxlength="80" value="${escapeAttr(note.title)}">
        </label>
        <label>
          Cor
          <select name="color">
            ${["gold", "green", "blue", "violet", "red", "ash"].map((color) => `<option value="${color}" ${note.color === color ? "selected" : ""}>${escapeHtml(getInvestigationColorLabel(color))}</option>`).join("")}
          </select>
        </label>
      </div>
      <label>
        Lembrança da Jornada
        <select name="journeyEntryId">${journeyOptions}</select>
      </label>
      <label>
        Texto da nota
        <textarea name="text" rows="5" maxlength="600">${escapeHtml(note.text || "")}</textarea>
      </label>
      <section class="investigation-note-links">
        <p class="eyebrow">Conexões desta nota</p>
        <ul>${linkList || "<li>Nenhuma linha conectada.</li>"}</ul>
      </section>
      <div class="button-row">
        <button class="button primary" type="submit">Salvar nota</button>
        <button class="button ghost" type="button" data-action="delete-investigation-note" data-note-id="${escapeAttr(note.id)}">Remover nota</button>
      </div>
    </form>
  `);
  setHtmlIfChanged(content, html);
}

function getInvestigationColorLabel(color) {
  return { gold: "Dourada", green: "Verde", blue: "Azul", violet: "Violeta", red: "Vermelha", ash: "Cinza" }[color] || "Dourada";
}

function openInvestigationNoteModal(noteId) {
  if (!isAuthenticated()) {
    showToast("Faça login para usar o quadro de investigação.");
    return;
  }
  const board = getInvestigationBoard();
  if (!noteId) {
    const author = getInvestigationAuthor();
    const viewport = $("#campfireInvestigationViewport");
    const note = normalizeInvestigationNote({
      id: createId("invnote"),
      title: "Nova pista",
      text: "",
      x: (viewport?.scrollLeft || 0) + 80,
      y: (viewport?.scrollTop || 0) + 80,
      color: "gold",
      ...author,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contentUpdatedAt: Date.now(),
      positionUpdatedAt: Date.now()
    }, new Map());
    board.notes.push(note);
    selectedInvestigationNoteId = note.id;
    saveState();
    renderCampfireInvestigation();
    return;
  }
  selectedInvestigationNoteId = noteId;
  renderCampfireInvestigation();
}

function closeInvestigationNoteModal() {
  selectedInvestigationNoteId = "";
  pendingInvestigationDeleteId = "";
  document.body.classList.remove("investigation-modal-open");
  renderCampfireInvestigation();
}

function startInvestigationConnectMode() {
  if (!isAuthenticated()) {
    showToast("Faça login para conectar pistas.");
    return;
  }
  investigationConnectMode = true;
  investigationConnectFromId = "";
  selectedInvestigationNoteId = "";
  renderCampfireInvestigation();
  showToast("Escolha a primeira nota do fio.");
}

function cancelInvestigationConnectMode() {
  investigationConnectMode = false;
  investigationConnectFromId = "";
  renderCampfireInvestigation();
}

function toggleInvestigationFullscreen() {
  investigationFullscreen = !investigationFullscreen;
  renderCampfireInvestigation();
}

function handleInvestigationConnectSelection(noteId) {
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }
  if (!investigationConnectFromId) {
    investigationConnectFromId = noteId;
    renderCampfireInvestigation();
    showToast("Agora escolha a nota de destino.");
    return;
  }
  if (investigationConnectFromId === noteId) {
    showToast("Escolha duas notas diferentes.");
    return;
  }
  const exists = board.links.some((link) =>
    (link.fromNoteId === investigationConnectFromId && link.toNoteId === noteId)
    || (link.fromNoteId === noteId && link.toNoteId === investigationConnectFromId)
  );
  if (exists) {
    investigationConnectMode = false;
    investigationConnectFromId = "";
    renderCampfireInvestigation();
    showToast("Essas pistas já estão conectadas.");
    return;
  }
  board.links.push({
    id: createId("invlink"),
    fromNoteId: investigationConnectFromId,
    toNoteId: noteId,
    label: "",
    createdByUserId: getActiveUser()?.id || "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  investigationConnectMode = false;
  investigationConnectFromId = "";
  saveState();
  renderCampfireInvestigation();
  showToast("Pistas conectadas.");
}

function handleInvestigationBoardAction(event) {
  if (investigationSuppressClick) {
    investigationSuppressClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const noteElement = event.target.closest(".investigation-note");
  const noteId = event.target.closest("[data-note-id]")?.dataset.noteId || noteElement?.dataset.noteId || "";
  if (investigationConnectMode && noteId) {
    event.preventDefault();
    event.stopPropagation();
    handleInvestigationConnectSelection(noteId);
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "edit-investigation-note") {
    pendingInvestigationDeleteId = "";
    openInvestigationNoteModal(button.dataset.noteId);
  }
  if (action === "delete-investigation-note") {
    deleteInvestigationNote(button.dataset.noteId);
  }
}

function handleInvestigationModalAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === "close-investigation-modal") {
    closeInvestigationNoteModal();
  }
  if (action === "delete-investigation-note") {
    deleteInvestigationNote(button.dataset.noteId || selectedInvestigationNoteId);
  }
  if (action === "confirm-delete-investigation-note") {
    confirmDeleteInvestigationNote(button.dataset.noteId || pendingInvestigationDeleteId);
  }
  if (action === "cancel-delete-investigation-note") {
    closeInvestigationNoteModal();
  }
  if (action === "delete-investigation-link") {
    deleteInvestigationLink(button.dataset.linkId);
  }
}

function saveInvestigationNote(event) {
  if (!event.target.classList.contains("investigation-note-form")) {
    return;
  }
  event.preventDefault();
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === event.target.dataset.noteId);
  if (!note) {
    return;
  }
  const title = event.target.elements.title?.value.trim() || "";
  if (!title) {
    showToast("Dê um título para a nota.");
    return;
  }
  note.title = title;
  note.text = event.target.elements.text?.value.trim() || "";
  note.color = event.target.elements.color?.value || "gold";
  note.journeyEntryId = event.target.elements.journeyEntryId?.value || "";
  note.contentUpdatedAt = Date.now();
  note.updatedAt = Math.max(Number(note.contentUpdatedAt) || 0, Number(note.positionUpdatedAt) || 0, Date.now());
  selectedInvestigationNoteId = "";
  document.body.classList.remove("investigation-modal-open");
  fitInvestigationBoardToNotes();
  saveState();
  renderCampfireInvestigation();
  showToast("Nota salva.");
}

function deleteInvestigationNote(noteId) {
  if (!noteId) {
    return;
  }
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }
  pendingInvestigationDeleteId = noteId;
  selectedInvestigationNoteId = noteId;
  renderCampfireInvestigation();
}

function confirmDeleteInvestigationNote(noteId) {
  if (!noteId || pendingInvestigationDeleteId !== noteId) {
    return;
  }
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === noteId);
  if (!note) {
    pendingInvestigationDeleteId = "";
    return;
  }
  pendingInvestigationDeleteId = "";
  const linked = board.links.filter((link) => link.fromNoteId === noteId || link.toNoteId === noteId);
  addDeletedRecord("campfireInvestigationNote", noteId);
  linked.forEach((link) => addDeletedRecord("campfireInvestigationLink", link.id));
  board.notes = board.notes.filter((item) => item.id !== noteId);
  board.links = board.links.filter((link) => link.fromNoteId !== noteId && link.toNoteId !== noteId);
  if (selectedInvestigationNoteId === noteId) {
    selectedInvestigationNoteId = "";
  }
  if (investigationConnectFromId === noteId) {
    investigationConnectFromId = "";
    investigationConnectMode = false;
  }
  fitInvestigationBoardToNotes();
  saveState();
  renderCampfireInvestigation();
  showToast("Nota removida.");
}

function deleteInvestigationLink(linkId) {
  if (!linkId) {
    return;
  }
  const board = getInvestigationBoard();
  if (!board.links.some((link) => link.id === linkId)) {
    return;
  }
  addDeletedRecord("campfireInvestigationLink", linkId);
  board.links = board.links.filter((link) => link.id !== linkId);
  saveState();
  renderCampfireInvestigation();
  showToast("Linha removida.");
}

function handleInvestigationPointerDown(event) {
  if (investigationConnectMode || event.button !== 0) {
    return;
  }
  const noteElement = event.target.closest(".investigation-note");
  if (
    !noteElement
    || event.target.closest("input, textarea, select, a")
    || event.target.closest("[data-action='delete-investigation-note'], [data-action='edit-investigation-note']")
  ) {
    return;
  }
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === noteElement.dataset.noteId);
  if (!note) {
    return;
  }
  investigationDragState = {
    noteId: note.id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    noteX: Number(note.x) || 0,
    noteY: Number(note.y) || 0,
    moved: false
  };
  noteElement.setPointerCapture?.(event.pointerId);
  noteElement.classList.add("dragging");
  event.preventDefault();
  window.addEventListener("pointermove", moveInvestigationPointer);
  window.addEventListener("pointerup", endInvestigationPointer, { once: true });
  window.addEventListener("pointercancel", endInvestigationPointer, { once: true });
}

function moveInvestigationPointer(event) {
  if (!investigationDragState || event.pointerId !== investigationDragState.pointerId) {
    return;
  }
  const boardElement = $("#campfireInvestigationBoard");
  const noteElement = $(`.investigation-note[data-note-id="${cssEscape(investigationDragState.noteId)}"]`);
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === investigationDragState.noteId);
  if (!boardElement || !noteElement || !note) {
    return;
  }
  const dx = event.clientX - investigationDragState.startX;
  const dy = event.clientY - investigationDragState.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) {
    investigationDragState.moved = true;
  }
  if (!investigationDragState.moved) {
    return;
  }
  note.x = clamp(investigationDragState.noteX + dx, 0, INVESTIGATION_BOARD_MAX_WIDTH - noteElement.offsetWidth - 24);
  note.y = clamp(investigationDragState.noteY + dy, 0, INVESTIGATION_BOARD_MAX_HEIGHT - noteElement.offsetHeight - 24);
  investigationDragState.nextX = note.x;
  investigationDragState.nextY = note.y;
  if (investigationDragFrame) {
    return;
  }
  investigationDragFrame = requestAnimationFrame(() => {
    investigationDragFrame = 0;
    const drag = investigationDragState;
    if (!drag) {
      return;
    }
    const activeNote = $(`.investigation-note[data-note-id="${cssEscape(drag.noteId)}"]`);
    if (!activeNote) {
      return;
    }
    activeNote.style.left = `${Math.round(drag.nextX)}px`;
    activeNote.style.top = `${Math.round(drag.nextY)}px`;
    updateInvestigationLinkPositions(drag.noteId);
  });
}

function endInvestigationPointer() {
  if (!investigationDragState) {
    return;
  }
  if (investigationDragFrame) {
    cancelAnimationFrame(investigationDragFrame);
    investigationDragFrame = 0;
    const pendingNote = $(`.investigation-note[data-note-id="${cssEscape(investigationDragState.noteId)}"]`);
    if (pendingNote) {
      pendingNote.style.left = `${Math.round(investigationDragState.nextX ?? investigationDragState.noteX)}px`;
      pendingNote.style.top = `${Math.round(investigationDragState.nextY ?? investigationDragState.noteY)}px`;
      updateInvestigationLinkPositions(investigationDragState.noteId);
    }
  }
  const noteElement = $(`.investigation-note[data-note-id="${cssEscape(investigationDragState.noteId)}"]`);
  noteElement?.classList.remove("dragging");
  const board = getInvestigationBoard();
  const note = board.notes.find((item) => item.id === investigationDragState.noteId);
  if (investigationDragState.moved && note) {
    investigationSuppressClick = true;
    window.setTimeout(() => {
      investigationSuppressClick = false;
    }, 120);
    note.positionUpdatedAt = Date.now();
    note.updatedAt = Math.max(Number(note.contentUpdatedAt) || 0, Number(note.positionUpdatedAt) || 0);
    fitInvestigationBoardToNotes();
    applyInvestigationBoardSize(board);
    renderInvestigationLinks();
    saveInvestigationMoveSoon();
  }
  investigationDragState = null;
  window.removeEventListener("pointermove", moveInvestigationPointer);
}

function saveInvestigationMoveSoon() {
  saveState();
}

function handleInvestigationKeydown(event) {
  if (event.key === "Escape") {
    if (selectedInvestigationNoteId) {
      closeInvestigationNoteModal();
    } else if (investigationConnectMode) {
      cancelInvestigationConnectMode();
    } else if (investigationFullscreen) {
      toggleInvestigationFullscreen();
    }
  }
}

function openNewCampfireHeroForm() {
  toggleComposer("campfire", true, { silent: true });
  clearCampfireHeroForm();
  const body = $("#campfireComposerBody");
  if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleCampfireHeroComposer() {
  const body = $("#campfireComposerBody");
  if (body && !body.hidden) {
    toggleComposer("campfire", false);
    return;
  }
  openNewCampfireHeroForm();
}

function loadCampfireHero(heroId) {
  const hero = getCampfireHeroById(heroId);
  if (!hero || !canManageCampfireHero(hero)) {
    return false;
  }
  $("#campfireHeroId").value = hero.id;
  $("#campfireCharacterName").value = hero.characterName;
  $("#campfireCharacterClass").value = hero.className || "";
  $("#campfireCharacterLevel").value = hero.level || "";
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
    className: $("#campfireCharacterClass").value.trim(),
    level: $("#campfireCharacterLevel").value.trim(),
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
  $("#campfireCharacterClass").value = ownHero?.className || "";
  $("#campfireCharacterLevel").value = ownHero?.level || "";
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
  campfireNotesEditing = false;
  saveState(state, { immediate: true });
  renderCampfire();
  showToast("Anotações do Minimus Legio salvas.");
}

function toggleCampfireLegionEditor(open) {
  campfireNotesEditing = Boolean(open);
  renderCampfire();
  if (campfireNotesEditing) {
    $("#campfireLegionNotes")?.focus();
  }
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

// Campaign expansion: all records remain small, independently mergeable entities.
function getCampaignReferenceOptions(selected = []) {
  const selectedIds = new Set(selected);
  return getCampaignReferenceRecords().map((item) => `<option value="${escapeAttr(item.id)}"${selectedIds.has(item.id) ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
}

function getCampaignReferenceRecords() {
  const mapZones = (state.baseMap?.floors || []).flatMap((floor) =>
    (floor.zones || []).map((zone) => ({ id: `zone:${floor.id}:${zone.id}`, group: "Mapa da Base", label: `${floor.name} · ${zone.title}` }))
  );
  const investigationNotes = (state.campfire?.investigationBoard?.notes || []).map((note) => ({
    id: `board:${note.id}`,
    group: "Quadro de Investigação",
    label: note.title
  }));
  return [
    ...state.journey.entries.map((item) => ({ id: `journey:${item.id}`, group: "Jornada", label: item.title })),
    ...state.npcs.map((item) => ({ id: `npc:${item.id}`, group: "NPCs", label: item.name })),
    ...state.rooms.map((item) => ({ id: `room:${item.id}`, group: "Salas", label: item.name })),
    ...state.missions.map((item) => ({ id: `mission:${item.id}`, group: "Missões e Rumores", label: `${item.type === "rumor" ? "Rumor" : "Missão"} · ${item.title}` })),
    ...state.timeline.map((item) => ({ id: `timeline:${item.id}`, group: "Linha do Tempo", label: item.title })),
    ...state.trophies.map((item) => ({ id: `trophy:${item.id}`, group: "Troféus", label: item.title })),
    ...mapZones,
    ...investigationNotes
  ];
}

function renderReferencePicker(selectOrId) {
  const select = typeof selectOrId === "string" ? $(`#${selectOrId}`) : selectOrId;
  if (!select?.id) return;
  const picker = document.querySelector(`[data-reference-picker="${select.id}"]`);
  if (!picker) return;
  if (select.id === "missionReferences") {
    picker.dataset.category = "";
    picker.dataset.query = "";
    renderMissionReferencePicker(picker, select);
    return;
  }
  const selected = new Set(getSelectedOptions(select));
  const groups = new Map();
  getCampaignReferenceRecords().forEach((record) => {
    if (!groups.has(record.group)) groups.set(record.group, []);
    groups.get(record.group).push(record);
  });
  const selectedLabels = getCampaignReferenceRecords().filter((record) => selected.has(record.id));
  picker.innerHTML = `<div class="reference-selection-summary">${selectedLabels.length ? `<strong>${selectedLabels.length} vínculo${selectedLabels.length === 1 ? "" : "s"}</strong>${selectedLabels.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("")}` : `<span>Nenhum vínculo selecionado</span>`}</div><input class="reference-search" type="search" data-reference-search="${escapeAttr(select.id)}" placeholder="Buscar personagem, lugar ou registro"><div class="reference-groups">${[...groups.entries()].map(([group, records]) => `<details><summary>${escapeHtml(group)} <span>${records.filter((item) => selected.has(item.id)).length || ""}</span></summary><div>${records.map((record) => `<label data-reference-label="${escapeAttr(`${group} ${record.label}`.toLocaleLowerCase("pt-BR"))}"><input type="checkbox" data-reference-select="${escapeAttr(select.id)}" value="${escapeAttr(record.id)}"${selected.has(record.id) ? " checked" : ""}><span>${escapeHtml(record.label)}</span></label>`).join("")}</div></details>`).join("")}</div>`;
}

function renderMissionReferencePicker(picker, select) {
  const records = getCampaignReferenceRecords();
  const selected = new Set(getSelectedOptions(select));
  const query = picker.dataset.query || "";
  const category = picker.dataset.category || "";
  const activeSearch = picker.querySelector("input[type=search]") === document.activeElement;
  const matches = records.filter(record => (!category || record.group === category) && (!query || `${record.group} ${record.label}`.toLocaleLowerCase("pt-BR").includes(query)));
  picker.innerHTML = `<div class="mission-reference-toolbar"><input class="reference-search" type="search" aria-label="Buscar vínculos narrativos" data-reference-search="missionReferences" placeholder="Buscar vínculo..." value="${escapeAttr(query)}"><div class="mission-reference-categories" role="group" aria-label="Categorias de vínculo">${["", ...new Set(records.map(record => record.group))].map(group => `<button type="button" data-mission-ref-category="${escapeAttr(group)}" aria-pressed="${category === group}">${escapeHtml(group || "Todos")}</button>`).join("")}</div></div><div class="mission-reference-selected">${[...selected].map(id => `<button type="button" data-mission-ref-remove="${escapeAttr(id)}" title="Remover vínculo">${escapeHtml(records.find(record => record.id === id)?.label || "Registro indisponível")} <span aria-hidden="true">×</span></button>`).join("")}</div><div class="mission-reference-results">${matches.slice(0, 50).map(record => `<label><input type="checkbox" data-reference-select="missionReferences" value="${escapeAttr(record.id)}"${selected.has(record.id) ? " checked" : ""}><span>${escapeHtml(record.label)}<small>${escapeHtml(record.group)}</small></span></label>`).join("") || `<p>Nenhum registro encontrado.</p>`}</div>${matches.length > 50 ? `<small class="muted">${matches.length} resultados. Refine a busca para encontrar outros registros.</small>` : ""}`;
  if (activeSearch) picker.querySelector("input[type=search]").focus();
}

function handleReferencePickerChange(event) {
  const checkbox = event.target.closest("[data-reference-select]");
  if (!checkbox) return;
  const select = $(`#${checkbox.dataset.referenceSelect}`);
  const option = [...(select?.options || [])].find((item) => item.value === checkbox.value);
  if (option) option.selected = checkbox.checked;
  if (select?.id === "missionReferences") { renderMissionReferencePicker(checkbox.closest(".reference-picker"), select); return; }
  renderReferencePicker(select);
}

function handleReferencePickerSearch(event) {
  const input = event.target.closest("[data-reference-search]");
  if (!input) return;
  const picker = input.closest(".reference-picker");
  if (input.dataset.referenceSearch === "missionReferences") { picker.dataset.query = input.value.toLocaleLowerCase("pt-BR"); renderMissionReferencePicker(picker, $("#missionReferences")); return; }
  const query = input.value.trim().toLocaleLowerCase("pt-BR");
  picker?.querySelectorAll(".reference-groups details").forEach((details) => {
    let visible = 0;
    details.querySelectorAll("[data-reference-label]").forEach((label) => {
      const matches = !query || label.dataset.referenceLabel.includes(query);
      label.hidden = !matches;
      if (matches) visible += 1;
    });
    details.hidden = visible === 0;
    if (query && visible) details.open = true;
  });
}

function getSelectedOptions(select) {
  return select ? [...select.selectedOptions].map((option) => option.value).filter(Boolean) : [];
}

function getActorMetadata() {
  const user = getActiveUser();
  const hero = user ? getCampfireHeroForUser(user.id) : null;
  return {
    createdByUserId: user?.id || "",
    createdByName: user?.name || "Mesa",
    createdByHeroId: hero?.id || "",
    createdByHeroName: hero?.characterName || ""
  };
}

function renderReferenceChips(references = []) {
  if (!references.length) return "";
  const records = new Map(getCampaignReferenceRecords().map((record) => [record.id, record]));
  return `<div class="reference-chip-row" aria-label="Vínculos narrativos">${references.map((reference) => { const record = records.get(reference); return `<button class="reference-chip" type="button" data-action="open-reference" data-reference="${escapeAttr(reference)}"><small>${escapeHtml(record?.group || "Referência")}</small><span>${escapeHtml(record?.label || "Registro indisponível")}</span></button>`; }).join("")}</div>`;
}

function openCampaignReference(reference) {
  const [kind, id] = String(reference || "").split(":");
  if (!id) return;
  if (kind === "journey") {
    selectedJourneyEntryId = id;
    journeyModalEditId = "";
    showView("journey");
    return;
  }
  if (kind === "npc") {
    selectedNpcId = id;
    showView("npcs");
    return;
  }
  if (kind === "room") return showView("rooms");
  if (kind === "mission") {
    selectedMissionId = id;
    return showView("missions");
  }
  if (kind === "timeline") {
    selectedTimelineId = id;
    return showView("timeline");
  }
  if (kind === "trophy") {
    selectedTrophyId = id;
    return showView("trophies");
  }
  if (kind === "zone") {
    const [, floorId, zoneId] = String(reference || "").split(":");
    const floor = state.baseMap?.floors?.find((item) => item.id === floorId);
    if (!floor?.zones?.some((zone) => zone.id === zoneId)) return;
    selectedMapFloorId = floorId;
    selectedMapZoneId = zoneId;
    showView("map");
    openMapZoneModal(zoneId);
    return;
  }
  if (kind === "board") {
    const note = state.campfire?.investigationBoard?.notes?.find((item) => item.id === id);
    if (!note) return;
    showView("campfire");
    openInvestigationNoteModal(id);
  }
}

function renderBaseMap() {
  const canvas = $("#baseMapCanvas");
  const list = $("#baseMapZoneList");
  if (!canvas || !list) return;
  const floor = state.baseMap.floors.find((item) => item.id === selectedMapFloorId) || state.baseMap.floors[0];
  if (!floor) return;
  selectedMapFloorId = floor.id;
  const floorArt = BASE_MAP_FLOORS.find((item) => item.id === floor.id) || BASE_MAP_FLOORS[0];
  $$("[data-floor]").forEach((button) => button.classList.toggle("active", button.dataset.floor === floor.id));
  const zones = [...floor.zones].sort((a, b) => a.y - b.y || a.x - b.x);
  const key = getCacheKey(state.revision, floor.id, mapZoom, mapSelection, selectedMapZoneId);
  const canvasHtml = getCachedValue(renderCache.baseMapHtml, key, () => `
    <div class="base-map-stage" style="--map-scale:${mapZoom};--map-ratio:${floorArt.imageWidth}/${floorArt.imageHeight}">
      <img src="${escapeAttr(floor.image)}" alt="Mapa ${escapeAttr(floor.name)}" width="${floorArt.imageWidth}" height="${floorArt.imageHeight}" draggable="false" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
      <p class="map-art-missing" hidden>Arte deste piso ainda não foi adicionada.</p>
      <div class="base-map-overlay" style="width:${MAP_GRID_PITCH * MAP_GRID_COLUMNS / floorArt.imageWidth * 100}%;height:${MAP_GRID_PITCH * MAP_GRID_ROWS / floorArt.imageHeight * 100}%">
      <div class="base-map-grid" aria-hidden="true"></div>
      ${zones.map((zone) => renderBaseMapZone(zone)).join("")}
      ${mapSelection ? `<div class="base-map-selection" style="left:${(mapSelection.x / floor.columns) * 100}%;top:${(mapSelection.y / floor.rows) * 100}%;width:${(mapSelection.width / floor.columns) * 100}%;height:${(mapSelection.height / floor.rows) * 100}%"></div>` : ""}
      </div>
    </div>`);
  setHtmlIfChanged(canvas, canvasHtml);
  const listHtml = zones.length ? zones.map((zone) => `<button class="map-zone-list-item" type="button" data-action="open-map-zone" data-id="${escapeAttr(zone.id)}"><strong>${escapeHtml(zone.title)}</strong><span>${escapeHtml(zone.kind === "room" ? "Sala" : "Construção")} · ${escapeHtml(zone.status)}</span></button>`).join("") : renderEmpty("Nenhuma área marcada", "Arraste sobre o mapa para reservar a primeira área.");
  setHtmlIfChanged(list, listHtml);
}

function getMapZoneGeometry(zone) {
  if (zone.gridVersion === 2) return zone;
  const art = BASE_MAP_FLOORS.find((floor) => floor.id === zone.floorId) || BASE_MAP_FLOORS[0];
  const x = Math.min(MAP_GRID_COLUMNS - 1, Math.round(zone.x / BASE_MAP_COLUMNS * art.imageWidth / MAP_GRID_PITCH));
  const y = Math.min(MAP_GRID_ROWS - 1, Math.round(zone.y / BASE_MAP_ROWS * art.imageHeight / MAP_GRID_PITCH));
  const right = Math.min(MAP_GRID_COLUMNS, Math.round((zone.x + zone.width) / BASE_MAP_COLUMNS * art.imageWidth / MAP_GRID_PITCH));
  const bottom = Math.min(MAP_GRID_ROWS, Math.round((zone.y + zone.height) / BASE_MAP_ROWS * art.imageHeight / MAP_GRID_PITCH));
  return { ...zone, x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function renderBaseMapZone(zone) {
  zone = getMapZoneGeometry(zone);
  const status = getMapZoneStatus(zone.status);
  const kindLabel = zone.kind === "room" ? "Sala" : "Construção";
  return `<button class="base-map-zone ${zone.kind} status-${status}" type="button" data-action="open-map-zone" data-id="${escapeAttr(zone.id)}" aria-label="${escapeAttr(`${kindLabel}: ${zone.title}, ${zone.status}`)}" style="--zone-columns:${zone.width};--zone-rows:${zone.height};left:${(zone.x / MAP_GRID_COLUMNS) * 100}%;top:${(zone.y / MAP_GRID_ROWS) * 100}%;width:${(zone.width / MAP_GRID_COLUMNS) * 100}%;height:${(zone.height / MAP_GRID_ROWS) * 100}%"><span class="base-map-zone-fill" aria-hidden="true"></span><span class="base-map-zone-label"><strong>${escapeHtml(zone.title)}</strong><em>${escapeHtml(zone.status)}</em></span></button>`;
}

function getMapZoneStatus(value) {
  const status = String(value || "").toLocaleLowerCase("pt-BR");
  if (/conclu|pront|ativ|ocupad/.test(status)) return "active";
  if (/obra|constru|andamento|progres/.test(status)) return "building";
  if (/inativ|abandon|bloquead/.test(status)) return "inactive";
  return "planned";
}

function getMapCellFromEvent(event) {
  const stage = $("#baseMapCanvas .base-map-stage");
  const floor = state.baseMap.floors.find((item) => item.id === selectedMapFloorId);
  if (!stage || !floor) return null;
  const rect = stage.querySelector(".base-map-overlay").getBoundingClientRect();
  const x = Math.max(0, Math.min(floor.columns - 1, Math.floor(((event.clientX - rect.left) / rect.width) * floor.columns)));
  const y = Math.max(0, Math.min(floor.rows - 1, Math.floor(((event.clientY - rect.top) / rect.height) * floor.rows)));
  return { x, y };
}

function handleMapPointerDown(event) {
  if (!event.target.closest(".base-map-stage") || event.button > 0) return;
  if (event.target.closest("[data-zone-id], .base-map-zone")) return;
  const point = getMapCellFromEvent(event);
  if (!point) return;
  mapSelection = { x: point.x, y: point.y, width: 1, height: 1, startX: point.x, startY: point.y };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  renderBaseMap();
}

function handleMapPointerMove(event) {
  if (!mapSelection) return;
  const point = getMapCellFromEvent(event);
  if (!point) return;
  mapSelection.x = Math.min(mapSelection.startX, point.x);
  mapSelection.y = Math.min(mapSelection.startY, point.y);
  mapSelection.width = Math.abs(point.x - mapSelection.startX) + 1;
  mapSelection.height = Math.abs(point.y - mapSelection.startY) + 1;
  const selection = $("#baseMapCanvas .base-map-selection");
  const floor = state.baseMap.floors.find((item) => item.id === selectedMapFloorId);
  if (selection && floor) {
    selection.style.left = `${(mapSelection.x / floor.columns) * 100}%`;
    selection.style.top = `${(mapSelection.y / floor.rows) * 100}%`;
    selection.style.width = `${(mapSelection.width / floor.columns) * 100}%`;
    selection.style.height = `${(mapSelection.height / floor.rows) * 100}%`;
  }
}

function handleMapPointerUp(event) {
  if (!mapSelection) return;
  const selection = { x: mapSelection.x, y: mapSelection.y, width: mapSelection.width, height: mapSelection.height };
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  mapSelection = null;
  openMapZoneModal("", selection);
}

function handleMapCanvasAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "open-map-zone") openMapZoneModal(button.dataset.id);
}

function handleMapControlAction(event) {
  const button = event.target.closest("[data-floor]");
  if (!button) return;
  selectedMapFloorId = button.dataset.floor;
  selectedMapZoneId = "";
  mapSelection = null;
  renderBaseMap();
}

function setMapZoom(nextZoom) {
  mapZoom = Math.max(0.7, Math.min(1.6, Math.round(nextZoom * 10) / 10));
  renderBaseMap();
}

function openMapZoneModal(zoneId = "", selection = null) {
  const modal = $("#mapZoneModal");
  const detail = $("#mapZoneDetail");
  const floor = state.baseMap.floors.find((item) => item.id === selectedMapFloorId);
  if (!modal || !detail || !floor) return;
  const existing = floor.zones.find((zone) => zone.id === zoneId);
  selectedMapZoneId = existing?.id || "";
  const zone = existing ? getMapZoneGeometry(existing) : { id: "", title: "", kind: "room", status: "Planejada", description: "", responsible: "", roomId: "", ...(selection || { x: 0, y: 0, width: 1, height: 1 }) };
  detail.innerHTML = `<article class="campaign-modal-card"><header><div><p class="eyebrow">${existing ? "Editar área" : "Nova área"}</p><h3>${existing ? escapeHtml(existing.title) : "Marcar área no mapa"}</h3></div><button class="icon-button" type="button" title="Fechar" data-action="close-map-zone">×</button></header><form class="stacked-form map-zone-form"><input name="id" type="hidden" value="${escapeAttr(zone.id)}"><input name="x" type="hidden" value="${zone.x}"><input name="y" type="hidden" value="${zone.y}"><input name="width" type="hidden" value="${zone.width}"><input name="height" type="hidden" value="${zone.height}"><div class="form-row"><label>Nome<input name="title" required maxlength="80" value="${escapeAttr(zone.title)}"></label><label>Tipo<select name="kind"><option value="room"${zone.kind === "room" ? " selected" : ""}>Sala</option><option value="construction"${zone.kind === "construction" ? " selected" : ""}>Construção</option></select></label></div><div class="form-row"><label>Estado<input name="status" maxlength="40" value="${escapeAttr(zone.status)}"></label><label>Responsável<input name="responsible" maxlength="60" value="${escapeAttr(zone.responsible)}"></label></div><label>Vincular sala existente<select name="roomId"><option value="">Sem vínculo</option>${state.rooms.map((room) => `<option value="${escapeAttr(room.id)}"${room.id === zone.roomId ? " selected" : ""}>${escapeHtml(room.name)}</option>`).join("")}</select></label><label>Descrição<textarea name="description" rows="4" maxlength="600">${escapeHtml(zone.description)}</textarea></label><p class="map-zone-coordinates">Grade: ${zone.x + 1}, ${zone.y + 1} · ${zone.width} × ${zone.height} quadrados</p><div class="button-row"><button class="button primary" type="submit">Salvar área</button>${existing ? `<button class="button danger" type="button" data-action="delete-map-zone" data-id="${escapeAttr(existing.id)}">Remover</button>` : ""}<button class="button ghost" type="button" data-action="close-map-zone">Cancelar</button></div></form></article>`;
  modal.hidden = false;
  document.body.classList.add("campaign-modal-open");
}

function handleMapZoneModalAction(event) {
  if (event.target === event.currentTarget || event.target.closest("[data-action='close-map-zone']")) {
    $("#mapZoneModal").hidden = true;
    document.body.classList.remove("campaign-modal-open");
    selectedMapZoneId = "";
    return;
  }
  const remove = event.target.closest("[data-action='delete-map-zone']");
  if (!remove) return;
  const floor = state.baseMap.floors.find((item) => item.id === selectedMapFloorId);
  const zone = floor?.zones.find((item) => item.id === remove.dataset.id);
  if (floor && zone && confirm(`Remover a área ${zone.title}?`)) {
    addDeletedRecord("mapZone", zone.id);
    floor.zones = floor.zones.filter((item) => item.id !== zone.id);
    $("#mapZoneModal").hidden = true;
    document.body.classList.remove("campaign-modal-open");
    saveState(); renderBaseMap(); showToast("Área removida do mapa.");
  }
}

function saveMapZone(event) {
  event.preventDefault();
  const form = event.target;
  const floor = state.baseMap.floors.find((item) => item.id === selectedMapFloorId);
  if (!floor) return;
  const data = new FormData(form);
  const id = String(data.get("id") || "");
  const existing = floor.zones.find((item) => item.id === id);
  const zone = normalizeMapZone({
    ...(existing || getActorMetadata()), id: id || createId("map-zone"), floorId: floor.id, title: String(data.get("title") || "").trim(), kind: data.get("kind"), status: String(data.get("status") || "Planejada").trim(), responsible: String(data.get("responsible") || "").trim(), roomId: String(data.get("roomId") || ""), description: String(data.get("description") || "").trim(), x: Number(data.get("x")), y: Number(data.get("y")), width: Number(data.get("width")), height: Number(data.get("height")), updatedAt: Date.now(), gridVersion: 2
  }, floor.id, state.users);
  const overlaps = floor.zones.map(getMapZoneGeometry).some((item) => item.id !== zone.id && zone.x < item.x + item.width && zone.x + zone.width > item.x && zone.y < item.y + item.height && zone.y + zone.height > item.y);
  if (overlaps) { showToast("Essa área se sobrepõe a uma zona já marcada."); return; }
  const index = floor.zones.findIndex((item) => item.id === zone.id);
  if (index >= 0) floor.zones[index] = zone; else floor.zones.push(zone);
  $("#mapZoneModal").hidden = true; document.body.classList.remove("campaign-modal-open");
  saveState(state, { immediate: true }); renderBaseMap(); showToast("Área salva. Sincronizando com a mesa...");
}

function updateMissionFields() {
  const rumor = $("#missionType").value === "rumor";
  $("#missionAssignee").closest("label").hidden = rumor;
  $("#missionSource").closest("label").hidden = !rumor;
  $("#missionReliability").closest("label").hidden = !rumor;
}

function toggleCampaignComposer(kind, open) {
  if (kind === "mission") updateMissionFields();
  const panel = $(`#${kind}EditorPanel`);
  if (panel) panel.hidden = !open;
  if (open) {
    const references = panel?.querySelector("select[multiple]");
    if (references && !references.options.length) references.innerHTML = getCampaignReferenceOptions();
    renderReferencePicker(references);
  }
  if (open) panel?.querySelector("input, textarea, select")?.focus();
}

function clearMissionForm() { const form = $("#missionForm"); if (form) form.reset(); $("#missionId").value = ""; $("#missionReferences").innerHTML = getCampaignReferenceOptions(); renderReferencePicker("missionReferences"); toggleCampaignComposer("mission", false); }
function clearTimelineForm() { const form = $("#timelineForm"); if (form) form.reset(); $("#timelineId").value = "";setCampaignRecordDate("timeline"); $("#timelineReferences").innerHTML = getCampaignReferenceOptions(); renderReferencePicker("timelineReferences"); renderTimelineDayPreview(); toggleCampaignComposer("timeline", false); }
function clearTrophyForm() { const form = $("#trophyForm"); if (form) form.reset(); $("#trophyId").value = "";setCampaignRecordDate("trophy"); $("#trophyImage").value = ""; $("#trophyReferences").innerHTML = getCampaignReferenceOptions(); renderReferencePicker("trophyReferences"); renderImagePreview("trophyImagePreview", ""); renderTrophyRecipients({awardedToGroup:true,recipientHeroIds:[]});toggleCampaignComposer("trophy", false); }

function renderTimelineDayPreview() {
  const output = $("#timelineDayPreview");
  if (!output) return;
  const day = readCampaignRecordDate("timeline");
  output.textContent = day ? formatCalendarDate(day) : "Sem data definida";
}

function renderMissions() {
  const list = $("#missionList"); if (!list) return;
  const query = $("#missionSearch")?.value.trim().toLowerCase() || "";
  const type = $("#missionTypeFilter")?.value || "all";
  const status = $("#missionStatusFilter")?.value || "all";
  const records = state.missions.filter((item) => (!query || `${item.title} ${item.description} ${item.region} ${item.tags}`.toLowerCase().includes(query)) && (type === "all" || item.type === type) && (status === "all" || item.status === status)).sort((a,b) => b.updatedAt - a.updatedAt);
  const key = getCacheKey(state.revision, query, type, status, isAdmin());
  setHtmlIfChanged(list, getCachedValue(renderCache.missionsHtml, key, () => renderMissionBoard(records, type)));
}

function renderMissionBoard(records, typeFilter) {
  if (!records.length) return renderEmpty("Nenhuma missão ou rumor", "Registre oportunidades, boatos e fios narrativos para a companhia.");
  const missions = records.filter((item) => item.type === "mission");
  const rumors = records.filter((item) => item.type === "rumor");
  const columns = [
    { key: "available", title: "Disponíveis", items: missions.filter((item) => item.status === "available") },
    { key: "active", title: "Em curso", items: missions.filter((item) => item.status === "active") },
    { key: "closed", title: "Encerradas", items: missions.filter((item) => ["completed", "failed"].includes(item.status)) }
  ];
  return `<div class="quest-board">
    ${typeFilter !== "rumor" ? `<div class="quest-board-columns">${columns.map((column) => `<section class="quest-column status-${column.key}"><header><h3>${column.title}</h3><span>${column.items.length}</span></header><div>${column.items.length ? column.items.map(renderMissionNotice).join("") : `<p class="quest-column-empty">Nenhum chamado.</p>`}</div></section>`).join("")}</div>` : ""}
    ${typeFilter !== "mission" ? `<section class="rumor-board"><header><p class="eyebrow">Vozes à meia-luz</p><h3>Rumores</h3><span>${rumors.length}</span></header><div class="rumor-strip">${rumors.length ? rumors.map(renderMissionNotice).join("") : `<p class="quest-column-empty">Nenhum rumor circulando.</p>`}</div></section>` : ""}
  </div>`;
}

function renderMissionNotice(item) {
  const typeLabel = item.type === "rumor" ? "Rumor" : ({ available: "Disponível", active: "Em curso", completed: "Concluída", failed: "Fracassada" }[item.status] || item.status);
  return `<article class="quest-notice ${item.type} status-${escapeAttr(item.status)}"><span class="quest-pin" aria-hidden="true"></span><header><p>${escapeHtml(typeLabel)}</p><div class="card-actions">${item.type === "rumor" ? `<button class="icon-button" type="button" title="Converter em missão" data-action="convert-rumor" data-id="${escapeAttr(item.id)}">↗</button>` : ""}<button class="icon-button" type="button" title="Editar" data-action="edit-mission" data-id="${escapeAttr(item.id)}">✎</button><button class="icon-button" type="button" title="Remover" data-action="delete-mission" data-id="${escapeAttr(item.id)}">✕</button></div></header><h4>${escapeHtml(item.title)}</h4>${item.description ? `<p>${nl2br(item.description)}</p>` : ""}<div class="quest-notice-meta">${item.region ? `<span>${escapeHtml(item.region)}</span>` : ""}${item.assignee ? `<span>${escapeHtml(item.assignee)}</span>` : ""}${item.type === "rumor" ? `<span>${escapeHtml(item.reliability)}</span>` : ""}${item.dueDay ? `<span>${escapeHtml(formatCalendarDate(item.dueDay))}</span>` : ""}</div>${renderReferenceChips(item.references)}</article>`;
}

function saveMission(event) {
  event.preventDefault(); const id = $("#missionId").value; const existing = state.missions.find((item) => item.id === id); const item = normalizeMission({ ...(existing || getActorMetadata()), id: id || createId("mission"), type: $("#missionType").value, title: $("#missionTitle").value.trim(), description: $("#missionDescription").value.trim(), status: $("#missionStatus").value, assignee: $("#missionAssignee").value.trim(), region: $("#missionRegion").value.trim(), source: $("#missionSource").value.trim(), reliability: $("#missionReliability").value, dueDay: Number($("#missionDueDay").value) || 0, tags: $("#missionTags").value, references: getSelectedOptions($("#missionReferences")), updatedAt: Date.now() }, state.users); if (!item.title) return showToast("Informe um título."); const index = state.missions.findIndex((record) => record.id === item.id); if (index >= 0) state.missions[index] = item; else state.missions.push(item); saveState(state, { immediate: true }); clearMissionForm(); renderMissions(); showToast(item.type === "rumor" ? "Rumor salvo. Sincronizando com a mesa..." : "Missão salva. Sincronizando com a mesa...");
}

function handleMissionAction(event) {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const item = state.missions.find((record) => record.id === button.dataset.id);
  if (button.dataset.action === "open-reference") return openCampaignReference(button.dataset.reference);
  if (!item) return;
  if (button.dataset.action === "edit-mission") { $("#missionId").value=item.id; $("#missionType").value=item.type; $("#missionTitle").value=item.title; $("#missionDescription").value=item.description; $("#missionStatus").value=item.status; $("#missionAssignee").value=item.assignee; $("#missionRegion").value=item.region; $("#missionSource").value=item.source; $("#missionReliability").value=item.reliability; $("#missionDueDay").value=item.dueDay || ""; $("#missionTags").value=item.tags.join(", "); $("#missionReferences").innerHTML=getCampaignReferenceOptions(item.references); renderReferencePicker("missionReferences"); toggleCampaignComposer("mission",true); return; }
  if (button.dataset.action === "convert-rumor" && item.type === "rumor") { item.type = "mission"; item.status = "available"; item.updatedAt = Date.now(); saveState(); renderMissions(); showToast("Rumor convertido em missão."); return; }
  if (button.dataset.action === "delete-mission" && confirm(`Remover ${item.title}?`)) { addDeletedRecord("mission",item.id); state.missions=state.missions.filter((record)=>record.id!==item.id); saveState(); renderMissions(); }
}

let timelineDrag = null;
function timelineRank(item) { return Number.isFinite(item.order) ? item.order : Number(item.day) || 0; }
function moveTimelineNode(id, era, beforeId) {
  const item = state.timeline.find(record => record.id === id);
  if (!item || !isAuthenticated()) return;
  const peers = state.timeline.filter(record => record.id !== id && record.era === era).sort((a,b) => timelineRank(a)-timelineRank(b) || a.createdAt-b.createdAt || a.id.localeCompare(b.id));
  const index = beforeId ? peers.findIndex(record => record.id === beforeId) : peers.length;
  if (index < 0) return;
  const left = peers[index-1], right = peers[index];
  // Equal legacy dates need distinct ranks before inserting between them.
  if (left && right && timelineRank(left) === timelineRank(right)) {
    peers.forEach((record,i) => { record.order = i * 1024; record.updatedAt = Date.now(); });
  }
  item.order = left && right ? (timelineRank(left)+timelineRank(right))/2 : left ? timelineRank(left)+1024 : right ? timelineRank(right)-1024 : 0;
  item.era = era; item.updatedAt = Date.now();
  saveState(state, { immediate:true });
}
document.addEventListener("pointerdown", event => {
  const node = event.target.closest(".timeline-node");
  if (!node || event.button !== 0 || !isAuthenticated()) return;
  timelineDrag = { node, id:node.dataset.id, x:event.clientX, y:event.clientY, active:false, target:null };
  node.setPointerCapture(event.pointerId);
});
document.addEventListener("pointermove", event => {
  const drag = timelineDrag;
  if (!drag) return;
  if (!drag.active && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7) return;
  drag.active = true; drag.node.classList.add("is-dragging");
  drag.node.style.transform = `translate(${event.clientX-drag.x}px,${event.clientY-drag.y}px)`;
  const scroller = drag.node.closest(".timeline-horizontal-scroll");
  const bounds = scroller.getBoundingClientRect();
  if (event.clientX > bounds.right-45) scroller.scrollLeft += 20;
  if (event.clientX < bounds.left+45) scroller.scrollLeft -= 20;
  drag.node.style.pointerEvents = "none";
  const hit = document.elementFromPoint(event.clientX,event.clientY);
  drag.node.style.pointerEvents = "";
  const segment = hit?.closest(".timeline-era-segment");
  document.querySelectorAll(".timeline-drop-target").forEach(el=>el.classList.remove("timeline-drop-target"));
  if (!segment) { drag.target=null; return; }
  const nodes = [...segment.querySelectorAll(".timeline-node")].filter(el=>el!==drag.node);
  const next = nodes.find(el=>event.clientX < el.getBoundingClientRect().left+el.offsetWidth/2);
  drag.target = { era:segment.querySelector(".timeline-add-node").dataset.era, beforeId:next?.dataset.id };
  (next || segment.querySelector(".timeline-add-node")).classList.add("timeline-drop-target");
});
function finishTimelineDrag(event) {
  const drag=timelineDrag; if(!drag)return;
  timelineDrag=null;
  drag.node.style.transform=""; drag.node.classList.remove("is-dragging");
  document.querySelectorAll(".timeline-drop-target").forEach(el=>el.classList.remove("timeline-drop-target"));
  if(!drag.active)return;
  const suppressClick = event=>{event.preventDefault();event.stopImmediatePropagation();};
  document.addEventListener("click", suppressClick,{once:true,capture:true});
  setTimeout(()=>document.removeEventListener("click",suppressClick,true),0);
  const scroll=drag.node.closest(".timeline-horizontal-scroll").scrollLeft;
  if(event.type==="pointerup" && drag.target) moveTimelineNode(drag.id,drag.target.era,drag.target.beforeId);
  renderTimeline();
  document.querySelector(".timeline-horizontal-scroll").scrollLeft=scroll;
}
document.addEventListener("pointerup",finishTimelineDrag);
document.addEventListener("pointercancel",finishTimelineDrag);
document.addEventListener("click",event=>{
  const button=event.target.closest("[data-timeline-pan]");
  if(button) document.querySelector(".timeline-horizontal-scroll")?.scrollBy({left:Number(button.dataset.timelinePan)*320,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
});
function renderTimeline() {
  if(timelineDrag)return;
  const list = $("#timelineList");
  if (!list) return;
  const query = $("#timelineSearch")?.value.trim().toLocaleLowerCase("pt-BR") || "";
  const era = $("#timelineEraFilter")?.value || "all";
  const type = $("#timelineTypeFilter")?.value || "all";
  const records = state.timeline.filter((item) => (!query || `${item.title} ${item.description}`.toLocaleLowerCase("pt-BR").includes(query)) && (era === "all" || item.era === era) && (type === "all" || item.type === type)).sort((a, b) => timelineRank(a) - timelineRank(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const key = getCacheKey(state.revision, query, era, type, records.map((item) => [item.id, item.updatedAt]));
  setHtmlIfChanged(list, getCachedValue(renderCache.timelineHtml, key, () => `<div class="timeline-horizontal-scroll"><div class="campaign-chronicle-horizontal">${[1, 2, 3].map((currentEra) => {
    const entries = records.filter((item) => Number(item.era) === currentEra);
    return `<section class="timeline-era-segment" style="--era-width:${Math.max(360, (entries.length + 1) * 180 + 100)}px"><header class="timeline-era-marker"><span>${["I", "II", "III"][currentEra - 1]}</span><h2>${currentEra}ª Era</h2></header><div class="timeline-era-events">${entries.map((item, index) => `<button type="button" class="timeline-node type-${escapeAttr(item.type)} ${index % 2 ? "below" : "above"}" data-action="open-timeline" data-id="${escapeAttr(item.id)}"><span class="timeline-node-dot" aria-hidden="true"></span><span class="timeline-node-label"><small>${item.day ? escapeHtml(formatCalendarDate(item.day)) : "Sem data"}</small><strong>${escapeHtml(item.title)}</strong></span></button>`).join("")}<button class="timeline-add-node" type="button" data-action="add-timeline" data-era="${currentEra}" title="Adicionar registro à ${currentEra}ª Era" aria-label="Adicionar registro à ${currentEra}ª Era">+</button></div></section>`;
  }).join("")}</div></div>`));
  renderTimelineDetail();
  if (!list.querySelector(".timeline-pan-controls")) list.insertAdjacentHTML("afterbegin", `<div class="timeline-pan-controls"><button type="button" data-timeline-pan="-1" aria-label="Navegar para a esquerda" title="Navegar para a esquerda">←</button><button type="button" data-timeline-pan="1" aria-label="Navegar para a direita" title="Navegar para a direita">→</button></div>`);
}

function renderTimelineDetail() {
  const dialog = $("#timelineEntryModal");
  const detail = $("#timelineEntryDetail");
  if (!dialog || !detail) return;
  const item = state.timeline.find((record) => record.id === selectedTimelineId);
  if (!item) { if (dialog.open) dialog.close(); return; }
  const labels = { session: "Sessão", discovery: "Descoberta", decision: "Decisão" };
  setHtmlIfChanged(detail, `<header><div><p class="eyebrow">${escapeHtml(labels[item.type])} · ${item.era}ª Era</p><h2>${escapeHtml(item.title)}</h2></div><button type="button" class="icon-button" data-action="close-timeline" aria-label="Fechar" title="Fechar">×</button></header><p class="timeline-detail-date">${item.day ? escapeHtml(formatCalendarDate(item.day)) : "Sem data registrada"}</p><div class="timeline-detail-text">${nl2br(item.description)}</div>${renderReferenceChips(item.references)}<footer class="button-row"><button type="button" class="button ghost" data-action="edit-timeline" data-id="${escapeAttr(item.id)}">Editar registro</button><button type="button" class="button danger" data-action="delete-timeline" data-id="${escapeAttr(item.id)}">Remover</button></footer>`);
  if (!dialog.open) dialog.showModal();
}

function saveTimelineEntry(event) { event.preventDefault(); const id=$("#timelineId").value,existing=state.timeline.find((item)=>item.id===id); const item=normalizeTimelineEntry({...(existing||getActorMetadata()),id:id||createId("timeline"),title:$("#timelineTitle").value.trim(),description:$("#timelineDescription").value.trim(),type:$("#timelineType").value,era:$("#timelineEra").value,day:readCampaignRecordDate("timeline",existing?.day),references:getSelectedOptions($("#timelineReferences")),updatedAt:Date.now()},state.users); if(!item.title)return showToast("Informe um título."); const index=state.timeline.findIndex((record)=>record.id===item.id); if(index>=0)state.timeline[index]=item;else state.timeline.push(item);saveState(state,{immediate:true});clearTimelineForm();renderTimeline();showToast("Marco salvo. Sincronizando com a mesa..."); }
function handleTimelineAction(event){const button=event.target.closest("[data-action]");if(!button)return;if(button.dataset.action==="close-timeline"){selectedTimelineId="";renderTimelineDetail();return;}if(button.dataset.action==="add-timeline"){clearTimelineForm();$("#timelineEra").value=button.dataset.era;toggleCampaignComposer("timeline",true);return;}if(button.dataset.action==="open-reference")return openCampaignReference(button.dataset.reference);const item=state.timeline.find((record)=>record.id===button.dataset.id);if(!item)return;if(button.dataset.action==="open-timeline"){selectedTimelineId=item.id;renderTimelineDetail();return;}if(button.dataset.action==="edit-timeline"){selectedTimelineId="";renderTimelineDetail();$("#timelineId").value=item.id;$("#timelineTitle").value=item.title;$("#timelineDescription").value=item.description;$("#timelineType").value=item.type;$("#timelineEra").value=item.era;setCampaignRecordDate("timeline",item.day);$("#timelineReferences").innerHTML=getCampaignReferenceOptions(item.references);renderReferencePicker("timelineReferences");renderTimelineDayPreview();toggleCampaignComposer("timeline",true);}if(button.dataset.action==="delete-timeline"&&confirm(`Remover ${item.title}?`)){addDeletedRecord("timeline",item.id);state.timeline=state.timeline.filter((record)=>record.id!==item.id);saveState();renderTimeline();}}

function renderTrophies() {
  const list = $("#trophyList"); if (!list) return;
  renderTrophyRecipients();
  const query = $("#trophySearch")?.value.trim().toLowerCase() || "";
  const records = state.trophies.filter((item) => (trophyRarityFilter === "all" || item.rarity === trophyRarityFilter) && (!query || `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(query))).sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAt - a.updatedAt);
  $$("#trophyRarityFilters [data-rarity]").forEach((button) => button.classList.toggle("active", button.dataset.rarity === trophyRarityFilter));
  const key = getCacheKey(state.revision, query, trophyRarityFilter, isAdmin());
  const emptyHooks = 3;
  setHtmlIfChanged(list, getCachedValue(renderCache.trophiesHtml, key, () => `<div class="trophy-hall">${records.map(renderTrophyCard).join("")}${Array.from({ length: emptyHooks }, () => `<div class="trophy-empty-hook" aria-hidden="true"><span>☠</span><small>Gancho vazio</small></div>`).join("")}</div>${!records.length ? `<div class="trophy-filter-empty"><strong>${state.trophies.length ? "Nenhuma conquista neste filtro" : "O salão aguarda seu primeiro feito"}</strong><span>As próximas vitórias encontrarão seu lugar nestas muralhas.</span></div>` : ""}`));
  const modal = $("#trophyModal"), detail = $("#trophyDetail");
  const selected = selectedTrophyId ? state.trophies.find((item) => item.id === selectedTrophyId) : null;
  if (modal && detail) { setHtmlIfChanged(detail, selected ? `<article class="campaign-modal-card trophy-detail"><header><div><p class="eyebrow">${escapeHtml(selected.category || "Conquista")}</p><h3>${escapeHtml(selected.title)}</h3></div><button class="icon-button" data-action="close-trophy" title="Fechar">×</button></header><p class="trophy-detail-recipients">${escapeHtml(getTrophyRecipientsLabel(selected))}</p>${selected.image ? `<img src="${escapeAttr(selected.image)}" alt="${escapeAttr(selected.title)}">` : ""}<p>${nl2br(selected.description)}</p>${selected.day ? `<p class="muted">${escapeHtml(formatCalendarDate(selected.day))}</p>` : ""}${renderReferenceChips(selected.references)}</article>` : ""); modal.hidden = !selected; }
}

function renderTrophyRecipients(item = null) {
  const container = $("#trophyRecipientOptions");
  if (!container) return;
  const selected = new Set(item?.recipientHeroIds || $$("#trophyRecipientOptions input:checked").map((input) => input.value));
  const heroes = state.campfire?.heroes || [];
  const key = JSON.stringify(heroes.map((hero) => [hero.id, hero.characterName]));
  if (item || container.dataset.heroes !== key) {
    container.innerHTML = heroes.map((hero) => `<label class="checkbox-row"><input type="checkbox" value="${escapeAttr(hero.id)}" ${selected.has(hero.id) ? "checked" : ""}>${escapeHtml(hero.characterName)}</label>`).join("");
    container.dataset.heroes = key;
  }
  if (item) $("#trophyAwardGroup").checked = item.awardedToGroup !== false;
}

function getTrophyRecipientsLabel(item) {
  const names = (item.recipientHeroIds || []).map((id) => state.campfire.heroes.find((hero) => hero.id === id)?.characterName || "Herói arquivado");
  if (item.awardedToGroup !== false) names.unshift("Minimus Legio");
  return names.join(" · ") || "Sem atribuição";
}

function renderTrophyCard(item) {
  const rarity = item.rarity || "notable";
  const rarityLabel = { legendary: "Marco Lendário", epic: "Conquista Épica", notable: "Feito Notável" }[rarity];
  const rarityIcon = { legendary: "♛", epic: "✦", notable: "◆" }[rarity];
  const author = getTrophyRecipientsLabel(item);
  const context = item.description.length > 150 ? `${item.description.slice(0, 147).trim()}...` : item.description;
  return `<article class="trophy-card rarity-${rarity}${item.featured ? " featured" : ""}"><button class="trophy-card-main" type="button" data-action="open-trophy" data-id="${escapeAttr(item.id)}"><span class="trophy-rarity"><b aria-hidden="true">${rarityIcon}</b>${rarityLabel}</span><span class="trophy-art">${item.image ? `<img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.title)}" loading="lazy" decoding="async">` : `<span class="trophy-placeholder" aria-hidden="true">✦</span>`}${item.featured ? `<i class="trophy-spark" aria-hidden="true">✦</i>` : ""}</span><span class="trophy-card-body"><strong>${escapeHtml(item.title)}</strong>${context ? `<span class="trophy-context">${escapeHtml(context)}</span>` : ""}<span class="trophy-meta"><span>${escapeHtml(author)}</span><span>${item.day ? escapeHtml(formatCalendarDate(item.day)) : "Data não registrada"}</span></span></span></button>${isAdmin() ? `<div class="card-actions"><button class="icon-button" title="Editar" data-action="edit-trophy" data-id="${escapeAttr(item.id)}">✎</button><button class="icon-button" title="Remover" data-action="delete-trophy" data-id="${escapeAttr(item.id)}">✕</button></div>` : ""}</article>`;
}

function saveTrophy(event){event.preventDefault();if(!isAdmin())return;if(!$("#trophyAwardGroup").checked && !$$("#trophyRecipientOptions input:checked").length)return showToast("Escolha pelo menos um personagem ou Minimus Legio.");const id=$("#trophyId").value,existing=state.trophies.find((item)=>item.id===id);const item=normalizeTrophy({...(existing||getActorMetadata()),id:id||createId("trophy"),title:$("#trophyTitle").value.trim(),category:$("#trophyCategory").value.trim(),rarity:$("#trophyRarity").value,featured:$("#trophyFeatured").checked,awardedToGroup:$("#trophyAwardGroup").checked,recipientHeroIds:$$("#trophyRecipientOptions input:checked").map((input)=>input.value),image:$("#trophyImage")?.value||"",description:$("#trophyDescription").value.trim(),day:readCampaignRecordDate("trophy",existing?.day),references:getSelectedOptions($("#trophyReferences")),updatedAt:Date.now()},state.users);if(!item.title)return showToast("Informe um título.");const index=state.trophies.findIndex((record)=>record.id===item.id);if(index>=0)state.trophies[index]=item;else state.trophies.push(item);saveState(state,{immediate:true});clearTrophyForm();renderTrophies();showToast("Troféu salvo. Sincronizando com a mesa...");}
function handleTrophyAction(event){const button=event.target.closest("[data-action]");if(!button)return;if(button.dataset.action==="open-reference")return openCampaignReference(button.dataset.reference);const item=state.trophies.find((record)=>record.id===button.dataset.id);if(button.dataset.action==="close-trophy"||event.target===event.currentTarget){selectedTrophyId="";renderTrophies();return;}if(!item)return;if(button.dataset.action==="open-trophy"){selectedTrophyId=item.id;renderTrophies();return;}if(!isAdmin())return;if(button.dataset.action==="edit-trophy"){$("#trophyId").value=item.id;$("#trophyTitle").value=item.title;$("#trophyCategory").value=item.category;$("#trophyRarity").value=item.rarity||"notable";$("#trophyFeatured").checked=Boolean(item.featured);renderTrophyRecipients(item);setCampaignRecordDate("trophy",item.day);$("#trophyDescription").value=item.description;$("#trophyReferences").innerHTML=getCampaignReferenceOptions(item.references);renderReferencePicker("trophyReferences");$("#trophyImage").value=item.image||"";renderImagePreview("trophyImagePreview",item.image||"");toggleCampaignComposer("trophy",true);}if(button.dataset.action==="delete-trophy"&&confirm(`Remover ${item.title}?`)){addDeletedRecord("trophy",item.id);state.trophies=state.trophies.filter((record)=>record.id!==item.id);selectedTrophyId="";saveState();renderTrophies();}}
