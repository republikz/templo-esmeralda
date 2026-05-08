(function () {
  "use strict";

  function hasSharedState(value) {
    return Boolean(value)
      && Array.isArray(value.rooms)
      && Array.isArray(value.npcs)
      && Array.isArray(value.financeSources)
      && Array.isArray(value.users);
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
        console.error("Falha ao salvar no servidor", response.status, detail);
        if (typeof window.showToast === "function") {
          window.showToast("Não consegui salvar no servidor. Verifique as variáveis do Supabase no Cloudflare.");
        }
        return false;
      }

      const text = await response.text();
      if (text.trim() && typeof window.normalizeState === "function" && typeof window.saveLocalState === "function") {
        window.saveLocalState(window.normalizeState(JSON.parse(text)));
      }

      return true;
    } catch (error) {
      console.error("Falha ao salvar no servidor", error);
      if (typeof window.showToast === "function") {
        window.showToast("Não consegui salvar no servidor. A alteração pode sumir ao atualizar.");
      }
      return false;
    }
  };
}());
