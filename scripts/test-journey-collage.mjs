import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const fixtures = JSON.parse(await readFile('campaign-state.json', 'utf8')).journey.entries.slice(0, 6);
await mkdir('screenshots', { recursive:true });
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport:{ width, height:1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', route => route.fulfill({ status:401, contentType:'application/json', body:'{}' }));
      await page.goto('http://127.0.0.1:4173/#journey');
      await page.waitForLoadState('networkidle');
      await page.evaluate(entries => {
        state.users = [{ id:'test', name:'Test', role:'admin' }];
        sessionUserId = 'test'; sessionToken = 'isolated';
        saveState = () => { state.revision++; };
        state.journey.entries = entries.map((entry, i) => normalizeJourneyEntry({ ...entry, category:Object.keys(JOURNEY_CATEGORIES)[i % 6], comments:i === 0 ? [{ id:'test-comment', text:'Uma lembrança', userId:'test', heroName:'Herói', createdAt:1 }] : [] }, new Map()));
        state.revision = Date.now();
        document.querySelector('#authOverlay').hidden = true;
        document.body.classList.add('authenticated'); showView('journey');
      }, fixtures);
      assert.equal(await page.locator('.journey-card').count(), fixtures.length);
      assert.equal(await page.locator('.journey-comment-count').count(), 1);
      assert.equal(await page.locator('#journeyCategoryChips button').count(), 7);
      await page.locator('[data-journey-category="location"]').click();
      assert.equal(await page.locator('.journey-card').count(), 1);
      await page.locator('[data-journey-category="all"]').click();
      await page.locator('.journey-card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.locator('.journey-card-actions [data-action="edit-journey"]').first().focus();
      await page.locator('.journey-card-actions [data-action="edit-journey"]').first().click();
      assert.equal(await page.locator('#journeyModal').isVisible(), true);
      assert.ok(await page.evaluate(() => Boolean(journeyModalEditId)));
      await page.evaluate(() => closeJourneyModal());
      await page.screenshot({ path:`screenshots/journey-${name}-${width}.png`, fullPage:true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => { state.users[0].role='player'; state.journey.entries.forEach(e => { e.createdByUserId='other'; }); state.revision++; renderJourney(); });
      assert.equal(await page.locator('.journey-card-actions').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${name} ${width}: filters, comments, editing, permissions and layout passed`);
      await page.close();
    }
  } finally { await browser.close(); }
}
