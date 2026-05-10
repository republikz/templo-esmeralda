(function () {
  "use strict";

  const STATE_API_URL = "/api/state";
  const SESSION_KEY = "pf2e-base-manager-session-v1";
  const MASTER = {
    id: "user-gabriel-vieira",
    name: "Gabriel Vieira",
    role: "admin",
    pin: "310898",
    createdAt: Date.now()
  };

  let lastState = null;
  let bound = false;
  let renderTimer = null;

  function notify(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    }
  }

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR");
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

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function hasCampaignShape(value) {
    return Boolean(value)
      && typeof value === "object"
      && Array.isArray(value.rooms)
      && Array.isArray(value.npcs)
      && Array.isArray(value.financeSources);
  }

  function normalizeUser(user) {
    const role = user?.role === "admin" ? "admin" : "player";
    return {
      id: String(user?.id || createId("user")),
      name: String(user?.name || (role === "admin" ? MASTER.name : "Jogador")).trim(),
      role,
      pin: String(user?.pin || ""),
      createdAt: Number(user?.createdAt) || Date.now()
    };
  }

  function repairUsers(state) {
    if (!hasCampaignShape(state)) {
      return { state, changed: false };
    }

    const originalUsers = Array.isArray(state.users) ? state.users : [];
    const seen = new Set();
    const users = [];
    let changed = !Array.isArray(state.users);

    originalUsers.map(normalizeUser).forEach((user) => {
      const key = normalizeName(user.name);
      if (!key || seen.has(key)) {
        changed = true;
        return;
      }
      seen.add(key);
      users.push(user);
    });

    const masterKey = normalizeName(MASTER.name);
    const master = users.find((user) => normalizeName(user.name) === masterKey);
    if (master) {
      if (master.name !== MASTER.name || master.role !== MASTER.role || master.pin !== MASTER.pin) {
        changed = true;
      }
      master.name = MASTER.name;
      master.role = MASTER.role;
      master.pin = MASTER.pin;
      master.createdAt = Number(master.createdAt) || MASTER.createdAt;
    } else {
      users.unshift({ ...MASTER, createdAt: Date.now() });
      changed = true;
    }

    if (users.length !== originalUsers.length) {
      changed = true;
    }

    return {
      state: {
        ...state,
        users,
        revision: (Number(state.revision) || 0) + (changed ? 1 : 0),
        updatedAt: changed ? Date.now() : state.updatedAt
      },
      changed
    };
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

  async function readState() {
    const response = await fetch(STATE_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const parsed = text.trim() ? JSON.parse(text) : {};
    const repaired = repairUsers(parsed);
    if (repaired.changed) {
      await writeState(repaired.state, { silent: true });
    }
    lastState = repaired.state;
    return repaired.state;
  }

  async function writeState(state, options = {}) {
    const nextState = {
      ...state,
      revision: (Number(state.revision) || 0) + (options.silent ? 0 : 1),
      updatedAt: Date.now()
    };
    const response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextState)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    lastState = await response.json().catch(() => nextState);
    return lastState;
  }

  function sortUsers(users) {
    return [...users].sort((a, b) => {
      if (a.role === b.role) {
        return a.name.localeCompare(b.name, "pt-BR");
      }
      return a.role === "admin" ? -1 : 1;
    });
  }

  function renderUserList(state) {
    const list = document.querySelector("#userList");
    if (!list) {
      return;
    }
    const users = sortUsers(Array.isArray(state.users) ? state.users : []);
    const activeId = getSessionUserId();
    list.innerHTML = users.length
      ? users.map((user) => `
          <article class="user-card ${user.id === activeId ? "active" : ""}">
            <div>
              <strong>${escapeHtml(user.name)}</strong>
              <div class="chip-row">
                <span class="chip ${user.role === "admin" ? "premium" : "income"}">${user.role === "admin" ? "Mestre" : "Jogador"}</span>
                <span class="chip">${user.pin ? "PIN definido" : "Sem PIN"}</span>
              </div>
            </div>
            <div class="card-actions">
              <button class="icon-button" type="button" title="Editar usuário" data-sync-user-action="edit" data-user-id="${escapeAttr(user.id)}">✎</button>
              ${user.role === "admin" ? "" : `<button class="icon-button" type="button" title="Remover usuário" data-sync-user-action="delete" data-user-id="${escapeAttr(user.id)}">✕</button>`}
            </div>
          </article>
        `).join("")
      : `<article class="empty-state"><strong>Nenhum usuário</strong><p>Crie os perfis dos jogadores aqui.</p></article>`;
  }

  async function refreshUsers() {
    if (!document.querySelector("#userList")) {
      return;
    }
    try {
      const state = await readState();
      renderUserList(state);
    } catch (error) {
      console.warn("Falha ao carregar usuários", error);
      const list = document.querySelector("#userList");
      if (list && !list.children.length) {
        list.innerHTML = `<article class="empty-state"><strong>Usuários indisponíveis</strong><p>Não foi possível ler os perfis agora.</p></article>`;
      }
    }
  }

  function scheduleRefresh() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(refreshUsers, 120);
  }

  function fillUserForm(user) {
    const id = document.querySelector("#userId");
    const name = document.querySelector("#userName");
    const role = document.querySelector("#userRole");
    const pin = document.querySelector("#userPin");
    if (id) id.value = user.id;
    if (name) name.value = user.name;
    if (role) role.value = user.role;
    if (pin) pin.value = user.pin || "";
    document.querySelector("#userManagementPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveUserFromForm(event) {
    const form = event.target.closest("#userForm");
    if (!form) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      const remote = await readState();
      const repaired = repairUsers(remote).state;
      const id = document.querySelector("#userId")?.value || "";
      const name = document.querySelector("#userName")?.value.trim() || "";
      if (!name) {
        notify("Informe um nome para o usuário.");
        return;
      }
      const isMaster = normalizeName(name) === normalizeName(MASTER.name);
      const payload = {
        id: id || createId("user"),
        name: isMaster ? MASTER.name : name,
        role: isMaster ? "admin" : (document.querySelector("#userRole")?.value === "admin" ? "admin" : "player"),
        pin: isMaster ? MASTER.pin : (document.querySelector("#userPin")?.value.trim() || ""),
        createdAt: Date.now()
      };

      const users = Array.isArray(repaired.users) ? repaired.users : [];
      const sameName = users.find((user) => normalizeName(user.name) === normalizeName(payload.name) && user.id !== payload.id);
      if (sameName) {
        payload.id = sameName.id;
        payload.createdAt = sameName.createdAt || payload.createdAt;
      }

      const index = users.findIndex((user) => user.id === payload.id);
      if (index >= 0) {
        users[index] = { ...users[index], ...payload, createdAt: users[index].createdAt || payload.createdAt };
      } else {
        users.push(payload);
      }
      repaired.users = repairUsers({ ...repaired, users }).state.users;
      const saved = await writeState(repaired);
      form.reset();
      const hidden = document.querySelector("#userId");
      if (hidden) hidden.value = "";
      renderUserList(saved);
      notify("Usuário salvo.");
    } catch (error) {
      console.error("Falha ao salvar usuário", error);
      notify("Não consegui salvar o usuário agora.");
    }
  }

  async function handleUserClick(event) {
    const button = event.target.closest("[data-sync-user-action]");
    if (!button) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      const remote = await readState();
      const users = Array.isArray(remote.users) ? remote.users : [];
      const user = users.find((item) => item.id === button.dataset.userId);
      if (!user) {
        await refreshUsers();
        return;
      }
      if (button.dataset.syncUserAction === "edit") {
        fillUserForm(user);
        return;
      }
      if (button.dataset.syncUserAction === "delete") {
        if (user.role === "admin") {
          notify("O Mestre principal não pode ser removido.");
          return;
        }
        if (!confirm(`Remover o usuário ${user.name}?`)) {
          return;
        }
        remote.users = users.filter((item) => item.id !== user.id);
        const saved = await writeState(repairUsers(remote).state);
        renderUserList(saved);
        notify("Usuário removido.");
      }
    } catch (error) {
      console.error("Falha ao alterar usuário", error);
      notify("Não consegui alterar os usuários agora.");
    }
  }

  function bind() {
    if (bound) {
      return;
    }
    bound = true;
    document.addEventListener("submit", saveUserFromForm, true);
    document.addEventListener("click", handleUserClick, true);
    window.addEventListener("hashchange", scheduleRefresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleRefresh();
      }
    });
  }

  async function repairRemoteUsers() {
    try {
      const remote = await readState();
      renderUserList(remote);
      return true;
    } catch (error) {
      console.warn("Falha ao reparar usuários remotos", error);
      return false;
    }
  }

  window.repairRemoteUsers = repairRemoteUsers;

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    scheduleRefresh();
    setTimeout(scheduleRefresh, 800);
  });
}());
