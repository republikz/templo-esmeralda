import { onRequest as handleStateRequest } from "./functions/api/state.js";
import { onRequest as handleHealthRequest } from "./functions/api/health.js";

const PATCH_TAG = '<script src="/persistence-patch.js?v=3" defer></script>';

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("Content-Type") || "";

  if (request.method !== "GET" || !contentType.includes("text/html")) {
    return response;
  }

  let html = await response.text();
  if (!html.includes("persistence-patch.js")) {
    html = html.includes("</body>")
      ? html.replace("</body>", `  ${PATCH_TAG}\n  </body>`)
      : `${html}\n${PATCH_TAG}`;
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
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
      return serveAsset(request, env);
    }

    return notFound();
  }
};
