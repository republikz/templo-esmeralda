(function () {
  "use strict";

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

  window.shouldBootstrapFromSeed = function shouldBootstrapFromSeed(remoteState, seedState) {
    if (hasSharedState(remoteState)) {
      return false;
    }
    return hasSharedState(seedState);
  };

  window.persistState = async function persistState(payload) {
    try {
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${detail || "sem detalhes"}`);
      }

      return true;
    } catch (error) {
      console.error("Falha ao salvar no servidor", error);
      notify("Falha ao salvar no servidor. A mudança não ficará após atualizar.");
      return false;
    }
  };
}());
