import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

const baseUrl = process.env.PERF_URL || "http://127.0.0.1:4174";
const statePath = process.env.PERF_STATE_FILE || join(process.cwd(), ".local-perf-test", "campaign-state-heavy.json");
const state = JSON.parse(await readFile(statePath, "utf8"));
const master = (state.users || []).find((user) => user.role === "admin" && user.pin);
if (!master) throw new Error("A massa de teste local não possui um Mestre com PIN.");

const allTargets = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];
const requestedEngines = (process.env.PERF_ENGINES || "").split(",").filter(Boolean);
const targets = requestedEngines.length ? allTargets.filter(([name]) => requestedEngines.includes(name)) : allTargets;
const allViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 }
];
const requestedViewports = (process.env.PERF_VIEWPORTS || "").split(",").filter(Boolean);
const viewports = requestedViewports.length ? allViewports.filter(({ name }) => requestedViewports.includes(name)) : allViewports;
const pages = ["dashboard", "rooms", "npcs", "finance", "calendar", "campfire", "journey", "market", "settings"];
const results = [];

for (const [engineName, engine] of targets) {
  const browser = await engine.launch();
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.addInitScript(() => {
        window.__perfLongTasks = [];
        if ("PerformanceObserver" in window) {
          try {
            new PerformanceObserver((list) => {
              list.getEntries().forEach((entry) => window.__perfLongTasks.push({ name: entry.name, duration: entry.duration }));
            }).observe({ type: "longtask", buffered: true });
          } catch { /* unsupported by this engine */ }
        }
      });
      await page.goto(`${baseUrl}/#dashboard`, { waitUntil: "networkidle" });
      await page.locator("#accessName").fill(master.name);
      await page.locator("#accessPin").fill(master.pin);
      await page.locator("#authForm button[type='submit']").click();
      await page.locator("body.authenticated").waitFor({ timeout: 8000 });
      const pageResults = [];
      for (const view of pages) {
        await page.evaluate((targetView) => {
          document.querySelector(`[data-view-target="${targetView}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }, view);
        await page.waitForTimeout(220);
        // Measure scrolling after the deliberate page transition has settled.
        // This keeps the threshold focused on the interaction users repeat most.
        await page.evaluate(() => { window.__perfLongTasks = []; });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(160);
        pageResults.push(await page.evaluate((viewName) => ({
          view: viewName,
          width: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          longTasks: window.__perfLongTasks || []
        }), view));
      }
      const metrics = await page.evaluate(() => ({
        navigation: performance.getEntriesByType("navigation")[0]?.duration || 0
      }));
      results.push({ engine: engineName, viewport: viewport.name, pages: pageResults, ...metrics });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

console.log(JSON.stringify(results, null, 2));
const failures = results.filter((result) => result.pages.some((page) => page.width > page.viewport + 1 || page.longTasks.some((task) => task.duration > 100)));
if (failures.length) {
  console.error("Falha de fluidez ou largura detectada.");
  process.exitCode = 1;
}
