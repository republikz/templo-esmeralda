(function () {
  "use strict";

  const STATE_API_URL = "/api/state";
  let pendingSave = Promise.resolve(true);

  function hasSharedState(value) {
    return Boolean(value)
      && Array.isArray(value.rooms)
      && Array.isArray(value.npcs)
      && Array.isArray(value.financeSources)
      && Array.isArray(value.users);
  }

  function notify(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message);
    } else {
      console.warn(message);
    }
  }

  function normalizePayload(nextState) {
    const payloadState = { ...nextState };
    delete payloadState.activeUserId;
    return payloadState;
  }

  async function sendState(payloadState) {
    const response = await fetch(STATE_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadState)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${detail || "sem detalhes"}`);
    }

    return response.text();
  }

  window.shouldBootstrapFromSeed = function shouldBootstrapFromSeed(remoteState, seedState) {
    if (hasSharedState(remoteState)) {
      return false;
    }
    return hasSharedState(seedState);
  };

  window.persistState = async function persistState(payload) {
    try {
      const payloadState = typeof payload === "string" ? JSON.parse(payload) : payload;
      await sendState(payloadState);
      return true;
    } catch (error) {
      console.error("Falha ao salvar no servidor", error);
      notify("Falha ao salvar no servidor. A mudança não ficará após atualizar.");
      return false;
    }
  };

  window.saveState = function saveState(nextState = window.state) {
    if (!nextState || typeof nextState !== "object") {
      notify("Falha ao salvar: estado da campanha indisponível.");
      return pendingSave;
    }

    nextState.revision = (Number(nextState.revision) || 0) + 1;
    nextState.updatedAt = Date.now();
    const payloadState = normalizePayload(nextState);

    try {
      localStorage.setItem("pf2e-base-manager-v1", JSON.stringify(payloadState));
    } catch (error) {
      console.warn("Falha ao atualizar cache local", error);
    }

    pendingSave = pendingSave
      .catch(() => true)
      .then(async () => {
        try {
          await sendState(payloadState);
          return true;
        } catch (error) {
          console.error("Falha ao salvar no servidor", error);
          notify("Falha ao salvar no servidor. Verifique /api/health e as variáveis do Supabase.");
          return false;
        }
      });

    return pendingSave;
  };
}());
