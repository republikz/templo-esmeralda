import { chromium, firefox, webkit } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture = JSON.parse(await readFile('campaign-state.json', 'utf8'));
const results = [];
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 768, 1440, 1920]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ status: 401, body: '{}' }));
      await page.route('https://**/*', route => route.abort());
      await page.goto('http://127.0.0.1:4180/');
      await page.evaluate(source => { state = normalizeState(source); sessionUserId = state.users.find(u => u.role === 'admin').id; saveState = () => {}; applyAuthState(); }, fixture);
      for (const view of ['dashboard', 'rooms', 'npcs', 'finance', 'calendar', 'campfire', 'journey', 'map', 'missions', 'timeline', 'trophies', 'market', 'settings']) {
        await page.evaluate(view => showView(view), view);
        await page.waitForTimeout(90);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, `${engine.name()}/${width}/${view}: horizontal overflow`);
        results.push({ engine: engine.name(), width, view, overflow });
      }
      await page.evaluate(() => { showView('campfire'); openInvestigationNoteModal(state.campfire.investigationBoard.notes[0].id); });
      assert.equal(await page.locator('[name="journeyEntryId"]').count(), 0);
      await page.locator('.investigation-note-form [name="text"]').fill('Unsaved form content');
      await page.evaluate(() => render({ remote: true }));
      assert.equal(await page.locator('.investigation-note-form [name="text"]').inputValue(), 'Unsaved form content');
      assert.deepEqual(errors, [], `${engine.name()}/${width}: runtime errors`);
      await page.close();
    }
  } finally { await browser.close(); }
}
await writeFile('screenshots/stability/navigation.json', JSON.stringify(results, null, 2));
console.log(`Navigation: ${results.length} scenarios passed; no horizontal overflow or runtime errors.`);
