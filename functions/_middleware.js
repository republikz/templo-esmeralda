const PATCH_TAGS = [
  '<script src="/persistence-patch.js?v=3" defer></script>',
  '<script src="/users-sync-patch.js?v=1" defer></script>',
  '<script src="/dashboard-settings-patch.js?v=4" defer></script>',
  '<script src="/emerald-icon-patch.js?v=4" defer></script>',
  '<script src="/recurring-finance-patch.js?v=2" defer></script>',
  '<script src="/date-cycle-patch.js?v=3" defer></script>',
  '<script src="/ui-cleanup-image-patch.js?v=2" defer></script>',
  '<script src="/auth-campfire-fix-patch.js?v=2" defer></script>'
];

function injectPatches(html) {
  const tags = PATCH_TAGS.filter((tag) => {
    const match = tag.match(/src="([^"]+)/);
    return match ? !html.includes(match[1].split("?")[0].replace("/", "")) : !html.includes(tag);
  });

  if (!tags.length) {
    return html;
  }

  return html.includes("</body>")
    ? html.replace("</body>", `  ${tags.join("\n  ")}\n  </body>`)
    : `${html}\n${tags.join("\n")}`;
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("Content-Type") || "";

  if (context.request.method !== "GET" || !contentType.includes("text/html")) {
    return response;
  }

  const html = injectPatches(await response.text());
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
