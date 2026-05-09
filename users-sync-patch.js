(function () {
  "use strict";

  const STATE_API_URL = "/api/state";
  const REPAIR_KEY = "templo-users-repair-v1";
  const MASTER = {
    id: "user-gabriel-vieira",
    name: "Gabriel Vieira",
    role: "admin",
    pin: "310898",
    createdAt: Date.now()
  };

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR");
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
      id: String(user?.id || crypto.randomUUID()),
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

    let changed = false;
    const users = Array.isArray(state.users) ? state.users.map(normalizeUser) : [];
    if (!Array.isArray(state.users) || state.users.length !== users.length) {
      changed = true;
    }

    const seen = new Set();
    const cleaned = [];
    users.forEach((user) => {
      const key = normalizeName(user.name);
      if (!key || seen.has(key)) {
        changed = true;
        return;
      }
      seen.add(key);
      cleaned.push(user);
    });

    const masterKey = normalizeName(MASTER.name);
    const master = cleaned.find((user) => normalizeName(user.name) === masterKey);
    if (master) {
      if (master.name !== MASTER.name || master.role !== MASTER.role || master.pin !== MASTER.pin) {
        changed = true;
      }
      master.name = MASTER.name;
      master.role = MASTER.role;
      master.pin = MASTER.pin;
      master.createdAt = Number(master.createdAt) || MASTER.createdAt;
    } else {
      cleaned.unshift({ ...MASTER, createdAt: Date.now() });
      changed = true;
    }

    if (!cleaned.length) {
      cleaned.push({ ...MASTER, createdAt: Date.now() });
      changed = true;
    }

    const nextState = {
      ...state,
      users: cleaned,
      revision: (Number(state.revision) || 0) + (changed ? 1 : 0),
      updatedAt: changed ? Date.now() : state.updatedAt
    };

    return { state: nextState, changed };
  }

  async function readState() {
    const response = await fetch(STATE_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : {};
  }

  async function writeState(state) {
    const response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  async function repairRemoteUsers({ forceReload = true } = {}) {
    try {
      const remote = await readState();
      const repaired = repairUsers(remote);
      if (!repaired.changed) {
        return false;
      }
      await writeState(repaired.state);
      try {
        sessionStorage.setItem(REPAIR_KEY, String(Date.now()));
      } catch (error) {
        // storage can be blocked in private tabs
      }
      if (forceReload) {
        window.location.reload();
      }
      return true;
    } catch (error) {
      console.warn("Falha ao reparar usuários remotos", error);
      return false;
    }
  }

  window.repairRemoteUsers = repairRemoteUsers;

  document.addEventListener("DOMContentLoaded", () => {
    let repairedRecently = false;
    try {
      const lastRepair = Number(sessionStorage.getItem(REPAIR_KEY)) || 0;
      repairedRecently = Date.now() - lastRepair < 10000;
    } catch (error) {
      repairedRecently = false;
    }
    if (!repairedRecently) {
      repairRemoteUsers({ forceReload: true });
    }
  });
}());
