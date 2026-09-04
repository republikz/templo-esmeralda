import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const rooms = JSON.parse(await readFile('campaign-state.json', 'utf8')).rooms.slice(0, 3);
await mkdir('screenshots', { recursive: true });
for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.goto('http://127.0.0.1:4173/#rooms');
      await page.waitForLoadState('networkidle');
      const expectedUpgrades = await page.evaluate((fixtures) => {
        state.rooms = fixtures.map((room, i) => ({ ...room, status: ['Ativa', 'Em construção', 'Inativa'][i], description: 'Uma descrição extensa da sala. '.repeat(25) }));
        state.users = [{ id: 'test-admin', name: 'Test', role: 'admin' }];
        sessionUserId = 'test-admin'; sessionToken = 'isolated';
        saveState = () => { state.revision++; };
        state.revision = Date.now(); document.querySelector('#authOverlay').hidden = true;
        document.body.classList.add('authenticated'); showView('rooms');
        return state.rooms.filter(canShowRoomUpgradeButton).length;
      }, rooms);
      assert.equal(await page.locator('.room-card').count(), 3);
      assert.equal(await page.locator('.room-stat').count(), 9);
      assert.equal(await page.locator('.room-upgrade-action').count(), expectedUpgrades);
      assert.equal(await page.locator('.room-status-active').count(), 1);
      assert.equal(await page.locator('.room-status-building').count(), 1);
      assert.equal(await page.locator('.room-status-blocked').count(), 1);
      await page.locator('.room-card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.locator('.room-overview summary').first().click();
      assert.equal(await page.locator('.room-overview').first().getAttribute('open'), '');
      assert.ok((await page.locator('.room-expanded-copy').first().textContent()).length > 200);
      await page.locator('.room-overview summary').first().click();
      await page.locator('[data-action="edit-room"]').first().focus();
      await page.locator('[data-action="edit-room"]').first().click();
      await page.locator('#roomName').waitFor({ state: 'visible' });
      const editing = await page.locator('#roomId').inputValue();
      await page.locator('#roomImagePreview [data-crop-field="x"]').press('Home');
      await page.locator('#roomImagePreview [data-crop-field="zoom"]').press('End');
      await page.locator('#roomForm button[type="submit"]').click();
      assert.deepEqual(await page.evaluate((id) => normalizeRoom(state.rooms.find((room) => room.id === id)).imageCrop, editing), { x: 0, y: 50, zoom: 3 });
      await page.evaluate(() => toggleComposer('room', false));
      await page.locator('#roomList').screenshot({ path: `screenshots/rooms-${engineName}-${width}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => { state.users[0].role = 'player'; state.revision++; renderRooms(); });
      assert.equal(await page.locator('.room-maintenance-actions').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${engineName} ${width}: room layout, description, upgrade rules, edit and permissions passed`);
      await page.close();
    }
  } finally { await browser.close(); }
}
