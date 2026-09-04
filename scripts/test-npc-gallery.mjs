import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const fixture = JSON.parse(await readFile('campaign-state.json', 'utf8')).npcs.slice(0, 4);
await mkdir('screenshots', { recursive: true });
for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  if (process.env.TEST_ENGINE && process.env.TEST_ENGINE !== engineName) continue;
  const browser = await engine.launch();
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.goto('http://127.0.0.1:4173/#npcs');
      await page.waitForLoadState('networkidle');
      await page.evaluate((npcs) => {
        state.npcs = npcs.map((npc, i) => normalizeNpc({ ...npc, id: `fixture-${i}`, tags: ['Aliado, Maga', 'Parente', 'Funcionário', 'Crianças'][i] }));
        state.users = [{ id: 'test-admin', name: 'Test', role: 'admin' }];
        sessionUserId = 'test-admin'; sessionToken = 'isolated';
        saveState = () => { state.revision++; };
        state.revision = Date.now(); document.querySelector('#authOverlay').hidden = true;
        document.body.classList.add('authenticated'); showView('npcs');
      }, fixture);
      assert.equal(await page.locator('.npc-card').count(), 4);
      assert.equal(await page.locator('.npc-new-face').count(), 1);
      await page.locator('[data-disposition="aliado"]').click();
      assert.equal(await page.locator('.npc-card').count(), 1);
      assert.equal(await page.locator('.npc-disposition-seal').textContent(), 'Aliado');
      await page.locator('[data-disposition="all"]').click();
      await page.locator('.npc-card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.locator('.npc-card [data-action="edit-npc"]').first().focus();
      await page.locator('.npc-card [data-action="edit-npc"]').first().click();
      await page.locator('.npc-modal-edit-form').waitFor({ state: 'visible' });
      await page.locator('#npcModalImagePreview [data-crop-field="x"]').press('Home');
      await page.locator('#npcModalImagePreview [data-crop-field="zoom"]').press('End');
      const editing = await page.locator('.npc-modal-edit-form').getAttribute('data-npc-id');
      await page.locator('.npc-modal-edit-form button[type="submit"]').click();
      assert.deepEqual(await page.evaluate((id) => normalizeNpc(state.npcs.find((npc) => npc.id === id)).imageCrop, editing), { x: 0, y: 50, zoom: 3 });
      await page.keyboard.press('Escape');
      await page.evaluate(() => closeNpcModal());
      await page.locator('.npc-new-face').click();
      assert.equal(await page.locator('#npcName').isVisible(), true);
      await page.locator('#cancelNpcEdit').click();
      await page.locator('#npcList').screenshot({ path: `screenshots/npcs-${engineName}-${width}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => { state.users[0].role = 'player'; state.revision++; renderNpcs(); });
      assert.equal(await page.locator('.npc-new-face').count(), 0);
      assert.equal(await page.locator('.npc-card-actions').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${engineName} ${width}: filters, edit, create, permissions and layout passed`);
      await page.close();
    }
  } finally { await browser.close(); }
}
