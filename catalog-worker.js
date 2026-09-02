"use strict";

function parsePriceToCopper(price) {
  const normalized = String(price || "").replace(/,/g, "").toLowerCase();
  let total = 0;
  const regex = /(\d+(?:\.\d+)?)\s*(pp|gp|sp|cp)/g;
  let match = regex.exec(normalized);
  while (match) {
    const value = Number(match[1]);
    total += value * ({ pp: 1000, gp: 100, sp: 10, cp: 1 }[match[2]] || 0);
    match = regex.exec(normalized);
  }
  return Math.round(total);
}

self.addEventListener("message", async (event) => {
  try {
    const { url, aonBaseUrl } = event.data || {};
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawCatalog = await response.json();
    const items = rawCatalog.map((raw) => {
      const relativeUrl = raw.url || "";
      return {
        itemKey: `${raw.name || ""}|${raw.level || ""}|${raw.url || ""}`,
        name: raw.name || "Item",
        level: Number.parseInt(raw.level, 10) || 0,
        rarity: raw.rarity || "Common",
        category: raw.item_category || "Outros",
        subcategory: raw.item_subcategory || "",
        trait: raw.trait || "",
        priceCopper: parsePriceToCopper(raw.price || ""),
        url: relativeUrl ? (relativeUrl.startsWith("http") ? relativeUrl : `${aonBaseUrl}${relativeUrl}`) : ""
      };
    }).filter((item) => item.level >= 1 && item.level <= 15 && item.priceCopper > 0);
    self.postMessage({ ok: true, items });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || "Falha ao carregar catálogo." });
  }
});
