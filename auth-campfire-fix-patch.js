(function () {
  "use strict";

  const STATE_API_URL = "/api/state";
  const SESSION_KEY = "pf2e-base-manager-session-v1";
  let logoutBound = false;
  let campfireBound = false;
  let observerStarted = false;

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function notify(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    }
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

  function getSessionUserId() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return typeof parsed?.userId === "string" ? parsed.userId : "";
    } catch (error) {
      return "";
    }
  }

  async function getActiveUser() {
    const state = await readState();
    const userId = getSessionUserId();
    const user = (state.users || []).find((item) => item.id === userId) || null;
    return { state, user };
  }

  function clearCampfireHeroFields() {
    const fields = {
      campfireHeroId: "",
      campfireCharacterName: "",
      campfireHeroImage: "",
      campfireGoalId: "",
      campfireGoalText: ""
    };
    Object.entries(fields).forEach(([id, value]) => {
      const field = document.querySelector(`#${id}`);
      if (field) {
        field.value = value;
      }
    });
    const category = document.querySelector("#campfireGoalCategory");
    if (category) {
      category.value = "short";
    }
    const secret = document.querySelector("#campfireGoalSecret");
    if (secret) {
      secret.checked = false;
    }
    const upload = document.querySelector("#campfireHeroImageUpload");
    if (upload) {
      upload.value = "";
    }
    const preview = document.querySelector("#campfireHeroImagePreview");
    if (preview) {
      preview.innerHTML = "";
      preview.__codexImage = "";
    }
    const owner = document.querySelector("#campfireHeroOwnerUserId");
    if (owner) {
      owner.value = "";
    }
    const title = document.querySelector("#campfireFormTitle");
    if (title) {
      title.textContent = "Novo personagem";
    }
    document.querySelector("#campfireHeroForm")?.setAttribute("data-new-hero", "true");
  }

  function ensureLogoutButton() {
    const line = document.querySelector(".profile-line");
    if (!line || document.querySelector("#logoutButton")) {
      return;
    }
    const button = document.createElement("button");
    button.id = "logoutButton";
    button.className = "button ghost logout-button";
    button.type = "button";
    button.textContent = "Sair";
    button.title = "Sair deste perfil";
    line.appendChild(button);
  }

  function bindLogout() {
    if (logoutBound) {
      return;
    }
    logoutBound = true;
    document.addEventListener("click", (event) => {
      const button = event.target.closest("#logoutButton");
      if (!button) {
        return;
      }
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (error) {
        // ignore blocked storage
      }
      notify("Sessão encerrada.");
      window.location.hash = "#dashboard";
      window.location.reload();
    });
  }

  function ensureCampfireNewButton() {
    const original = document.querySelector("#toggleCampfireComposer");
    if (!original || document.querySelector("#newCampfireHeroButton")) {
      return;
    }
    const button = document.createElement("button");
    button.id = "newCampfireHeroButton";
    button.className = "button subtle";
    button.type = "button";
    button.textContent = "Novo personagem";
    button.title = "Criar outro personagem do zero";
    original.insertAdjacentElement("afterend", button);
  }

  function openNewCampfireHeroForm() {
    const body = document.querySelector("#campfireComposerBody");
    const toggle = document.querySelector("#toggleCampfireComposer");
    if (body) {
      body.hidden = false;
    }
    if (toggle) {
      toggle.textContent = "Fechar";
    }
    clearCampfireHeroFields();
    body?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveNewHero(event) {
    const form = event.target.closest("#campfireHeroForm");
    if (!form || form.dataset.newHero !== "true") {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    const characterName = document.querySelector("#campfireCharacterName")?.value.trim() || "";
    if (!characterName) {
      notify("Informe o nome do personagem.");
      return;
    }

    try {
      const { state, user } = await getActiveUser();
      if (!user) {
        notify("Faça login para criar personagem.");
        return;
      }
      const isAdmin = user.role === "admin";
      const ownerSelect = document.querySelector("#campfireHeroOwnerUserId");
      const ownerUserId = isAdmin ? (ownerSelect?.value || "") : user.id;
      const owner = ownerUserId ? (state.users || []).find((item) => item.id === ownerUserId) : null;
      state.campfire = state.campfire || { legionNotes: "", heroes: [] };
      state.campfire.heroes = Array.isArray(state.campfire.heroes) ? state.campfire.heroes : [];
      state.campfire.heroes.push({
        id: createId("hero"),
        ownerUserId,
        ownerName: owner?.name || (isAdmin ? "Arquivo da Fogueira" : user.name),
        characterName,
        image: document.querySelector("#campfireHeroImage")?.value || "",
        updatedAt: Date.now(),
        goals: []
      });
      await writeState(state);
      form.dataset.newHero = "false";
      notify("Novo personagem criado.");
      window.location.reload();
    } catch (error) {
      console.error("Falha ao criar personagem", error);
      notify("Não consegui criar o personagem agora.");
    }
  }

  function bindCampfire() {
    if (campfireBound) {
      return;
    }
    campfireBound = true;
    document.addEventListener("click", (event) => {
      if (event.target.closest("#newCampfireHeroButton")) {
        openNewCampfireHeroForm();
        return;
      }
      const addButton = event.target.closest("#toggleCampfireComposer");
      if (addButton && addButton.textContent.trim() === "Adicionar") {
        setTimeout(() => {
          const form = document.querySelector("#campfireHeroForm");
          const selectedHero = document.querySelector("#campfireHeroId")?.value || "";
          if (form && !selectedHero) {
            clearCampfireHeroFields();
          }
        }, 0);
      }
    }, true);
    document.addEventListener("submit", saveNewHero, true);
  }

  function injectStyles() {
    if (document.querySelector("#authCampfireFixPatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "authCampfireFixPatchStyles";
    style.textContent = `
      .profile-line {
        flex-wrap: wrap;
        gap: 8px 10px;
      }
      .logout-button {
        min-height: 28px;
        padding: 4px 10px;
        font-size: .78rem;
        line-height: 1;
      }
      #newCampfireHeroButton {
        margin-left: 8px;
      }
      @media (max-width: 680px) {
        #newCampfireHeroButton {
          margin-left: 0;
          margin-top: 8px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyAll() {
    injectStyles();
    ensureLogoutButton();
    ensureCampfireNewButton();
    bindLogout();
    bindCampfire();
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
