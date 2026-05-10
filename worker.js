import { onRequest as handleStateRequest } from "./functions/api/state.js";
import { onRequest as handleHealthRequest } from "./functions/api/health.js";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/state" || url.pathname === "/api/state/") {
      return handleStateRequest({ request, env, ctx, params: {} });
    }

    if (url.pathname === "/api/health" || url.pathname === "/api/health/") {
      return handleHealthRequest({ request, env, ctx, params: {} });
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return notFound();
  }
};
