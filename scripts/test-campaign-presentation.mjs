import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// All API traffic is intercepted. Fixtures and saves exist only in the browser.
const url = process.env.PRESENTATION_URL || 'http://127.0.0.1:4173';
await mkdir('screenshots', { recursive: true });
for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"isolated test"}' }));
      await page.goto(`${url}/#trophies`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => {
        const now = Date.now();
        const actor = { id: 'test-master', name: 'Test Master', role: 'admin' };
        state = normalizeState({ ...state, users: [actor], revision: now, campfire: { ...state.campfire, heroes: [
          { id: 'hero-a', ownerUserId: actor.id, characterName: 'Lynn', updatedAt: now },
          { id: 'hero-b', ownerUserId: actor.id, characterName: 'Doran', updatedAt: now }
        ] }, trophies: [{ id: 'trophy-a', title: 'A queda da rainha', description: 'Uma conquista conjunta.', rarity: 'legendary', featured: true, awardedToGroup: false, recipientHeroIds: ['hero-a'], day: 73, image: 'assets/maps/mapa-topo.jpg', updatedAt: now }], timeline: [1, 2, 3].flatMap((era) => [1, 2].map((n) => ({ id: `era-${era}-${n}`, era: String(era), type: 'discovery', title: `Descoberta ${n}`, description: 'História completa do registro.', day: 72 + n, updatedAt: now, createdAt: now }))), baseMap: { floors: BASE_MAP_FLOORS.map((floor) => ({ ...floor, zones: [{ id: `zone-${floor.id}`, floorId: floor.id, x: 3, y: 4, width: 5, height: 3, gridVersion: 2, title: 'Sala de teste', kind: 'room', updatedAt: now }] })) } });
        sessionUserId = actor.id;
        sessionToken = 'isolated-test';
        saveState = () => { state.revision++; };
        document.querySelector('#authOverlay').hidden = true;
        document.body.classList.add('authenticated');
        showView('trophies');
      });
      await page.locator('#trophyRarityFilters [data-rarity="notable"]').click();
      assert.equal(await page.locator('.trophy-card').count(), 0);
      await page.locator('#trophyRarityFilters [data-rarity="all"]').click();
      assert.equal(await page.locator('.trophy-card-body>strong').evaluate((el) => getComputedStyle(el).textTransform), 'none');
      assert.match(await page.locator('.trophy-meta').innerText(), /Lynn/);
      assert.equal(await page.locator('#view-trophies h2').count(), 0);
      await page.locator('.trophy-card [data-action="edit-trophy"]').focus();
      await page.locator('.trophy-card [data-action="edit-trophy"]').click();
      assert.equal(await page.locator('#trophyDay').inputValue(), '1');
      assert.equal(await page.locator('#trophyMonth').inputValue(), '1');
      await page.locator('#trophyDay').fill('17');
      await page.locator('#trophyMonth').selectOption('2');
      await page.locator('#trophyRecipientOptions input[value="hero-b"]').check();
      await page.locator('#trophyForm button[type=submit]').click();
      assert.match(await page.locator('.trophy-meta').innerText(), /Lynn.*Doran/);
      assert.match(await page.locator('.trophy-meta').innerText(), /17 do Caos/);
      assert.deepEqual(await page.evaluate(() => normalizeState(JSON.parse(JSON.stringify(state))).trophies[0].recipientHeroIds), ['hero-a', 'hero-b']);
      await page.locator('.trophy-card').screenshot({ path: `screenshots/trophy-${engineName}-${viewport.width}.png` });
      const dateRoundTrips = await page.evaluate(() => ['timeline', 'trophy'].every((prefix) => {
        for (let month = 0; month < 5; month++) {
          const saved = 2 * DAYS_PER_YEAR + month * DAYS_PER_MONTH + 72;
          setCampaignRecordDate(prefix, saved);
          if (readCampaignRecordDate(prefix, saved) !== saved) return false;
        }
        setCampaignRecordDate(prefix, 0);
        return readCampaignRecordDate(prefix) === 0;
      }));
      assert.equal(dateRoundTrips, true);
      const alpha = await page.evaluate(async () => {
        const source = document.createElement('canvas');
        source.width = 1400; source.height = 1400;
        source.getContext('2d').fillRect(600, 600, 200, 200);
        const blob = await new Promise((resolve) => source.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'transparent-trophy.png', { type: 'image/png' });
        await handleImageUpload({ target: { files: [file] } }, 'trophyImage', 'trophyImagePreview');
        const result = document.querySelector('#trophyImage').value;
        const img = new Image(); img.src = result; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        return { png: result.startsWith('data:image/png;'), width: img.width, corner: ctx.getImageData(0, 0, 1, 1).data[3], center: ctx.getImageData(600, 600, 1, 1).data[3] };
      });
      assert.deepEqual(alpha, { png: true, width: 1200, corner: 0, center: 255 });
      await page.evaluate(() => {
        const source = state.trophies[0];
        state.trophies.push({ ...source, id: 'group-trophy', title: 'Vitória de Minimus Legio', awardedToGroup: true, recipientHeroIds: [] });
        state.trophies.push({ ...source, id: 'other-trophy', title: 'Apenas Doran', awardedToGroup: false, recipientHeroIds: ['hero-b'] });
        state.campfire.heroes[0].className = 'Druida'; state.campfire.heroes[0].level = 13;
        state.revision++; showView('dashboard');
      });
      assert.equal(await page.locator('.hero-trophy-badge').count(), 2);
      assert.equal((await page.locator('.hero-trophy-badge').first().innerText()).trim(), '');
      assert.equal(await page.locator('.hero-trophy-badge').first().evaluate((el) => Math.round(el.getBoundingClientRect().width)), 72);
      assert.equal(await page.locator('.hero-trophy-badge').first().evaluate((el) => getComputedStyle(el).borderTopWidth), '0px');
      assert.equal(await page.locator('.hero-trophy-badge').first().evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      const badgePlacement = await page.evaluate(() => {
        const badge = document.querySelector('.hero-trophy-badges').getBoundingClientRect();
        const meta = document.querySelector('.hero-identity-meta').getBoundingClientRect();
        const goals = document.querySelector('.dashboard-hero-goals').getBoundingClientRect();
        return (badge.top >= meta.bottom || badge.left >= meta.right) && badge.bottom <= goals.top && document.documentElement.scrollWidth <= innerWidth;
      });
      assert.equal(badgePlacement, true);
      await page.locator('#dashboardHeroPanel').screenshot({ path: `screenshots/hero-badges-${engineName}-${viewport.width}.png` });
      await page.locator('[data-hero-trophy="trophy-a"]').click();
      assert.equal(await page.locator('#trophyModal').isVisible(), true);
      await page.locator('#trophyDetail [data-action="close-trophy"]').click();
      await page.evaluate(() => {
        const source = state.trophies.find((item) => item.id === 'group-trophy');
        for (let n = 0; n < 6; n++) state.trophies.push({ ...source, id: `extra-group-${n}`, createdAt: Date.now() + n });
        state.revision++; showView('dashboard');
      });
      assert.equal(await page.locator('.hero-trophy-badge').count(), 4);
      assert.equal(await page.locator('.hero-trophy-badge').first().getAttribute('data-hero-trophy'), 'trophy-a');
      await page.evaluate(() => showView('timeline'));
      await page.locator('[data-action="open-timeline"]').first().click();
      assert.equal(await page.locator('#timelineEntryModal').evaluate((el) => el.open), true);
      assert.match(await page.locator('.timeline-detail-date').innerText(), /01 (do|da) (Verão|Outono|Inverno|Primavera)/);
      await page.locator('[data-action="close-timeline"]').click();
      await page.locator('[data-action="add-timeline"][data-era="2"]').click();
      assert.equal(await page.locator('#timelineEra').inputValue(), '2');
      await page.locator('#cancelTimelineEdit').click();
      assert.notEqual(await page.locator('.timeline-era-segment').first().evaluate((el) => getComputedStyle(el, '::before').backgroundImage), 'none');
      await page.locator('.timeline-horizontal-scroll').evaluate((el) => { el.scrollLeft = 0; });
      const positions = await page.locator('.timeline-node').evaluateAll((nodes) => nodes.map((node) => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
      assert.ok(positions[1].x > positions[0].x && positions[1].y === positions[0].y);
      await page.locator('#timelineList').screenshot({ path: `screenshots/timeline-${engineName}-${viewport.width}.png` });
      for (const floorId of ['ground', 'top', 'underground']) {
        await page.evaluate((id) => { selectedMapFloorId = id; showView('map'); }, floorId);
        await page.locator('.base-map-stage>img').evaluate((img) => img.decode());
        const geometry = await page.evaluate(() => {
          const stage = document.querySelector('.base-map-stage').getBoundingClientRect();
          const image = document.querySelector('.base-map-stage>img');
          const zone = document.querySelector('.base-map-zone').getBoundingClientRect();
          const unit = MAP_GRID_PITCH / image.naturalWidth * stage.width;
          const cell = getMapCellFromEvent({ clientX: stage.left + unit * 7.5, clientY: stage.top + unit * 8.5 });
          return { error: Math.abs(zone.x - stage.x - 3 * unit), cell, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.ok(geometry.error < 1, JSON.stringify(geometry));
        assert.deepEqual(geometry.cell, { x: 7, y: 8 });
        assert.equal(geometry.overflow, false);
      }
      await page.locator('#baseMapCanvas').screenshot({ path: `screenshots/map-${engineName}-${viewport.width}.png` });
      assert.equal(await page.evaluate(() => {
        const legacy = normalizeMapZone({ id: 'legacy', x: 46, y: 34, width: 2, height: 2 }, 'ground', state.users);
        const before = JSON.stringify(legacy);
        const adapted = getMapZoneGeometry(legacy);
        return before === JSON.stringify(legacy) && adapted.x + adapted.width <= 44 && adapted.y + adapted.height <= 33;
      }), true);
      assert.deepEqual(errors, []);
      console.log(`${engineName} ${viewport.width}: trophy filters/recipients, timeline, map geometry passed`);
      await page.close();
    }
  } finally { await browser.close(); }
}
