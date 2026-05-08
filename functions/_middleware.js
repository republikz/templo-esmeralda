const PATCH_TAG = '<script src="/persistence-patch.js?v=2" defer></script>';

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("Content-Type") || "";

  if (context.request.method !== "GET" || !contentType.includes("text/html")) {
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
