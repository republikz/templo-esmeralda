import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('screenshots', { recursive: true });
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
      await page.goto('http://127.0.0.1:4173/#finance');
      await page.waitForLoadState('networkidle');
      const flow = await page.evaluate(() => {
        state.users = [{ id: 'test', name: 'Test', role: 'admin' }];
        sessionUserId = 'test'; sessionToken = 'isolated';
        saveState = () => { state.revision++; };
        state.financeSources = [
          { id: 'a', name: 'Auditório', type: 'income', amountCopper: 20000, intervalDays: 30, active: true },
          { id: 'b', name: 'Manutenção', type: 'expense', amountCopper: 5000, intervalDays: 15, active: true },
          { id: 'c', name: 'Pausado', type: 'income', amountCopper: 99999, intervalDays: 30, active: false }
        ].map(s => ({ ...s, startDay: 1, lastProcessedDay: 1, kind: 'room', note: 'Contrato de teste.' }));
        state.ledger = [{ id:'l', day:1, name:'Recebimento', type:'income', amountCopper:20000, createdAt:1 }, { id:'m', day:2, name:'Pagamento', type:'expense', amountCopper:5000, createdAt:2 }];
        state.revision = Date.now();
        document.querySelector('#authOverlay').hidden = true;
        document.body.classList.add('authenticated'); showView('finance');
        return getRecurringFlow(state.financeSources);
      });
      assert.deepEqual(flow, { income:20000, expense:10000, net:10000 });
      assert.equal(await page.locator('.source-next').count(), 2);
      assert.match(await page.locator('.ledger-amount.type-income').innerText(), /\+/);
      assert.match(await page.locator('.ledger-amount.type-expense').innerText(), /−/);
      assert.equal(await page.locator('#ledgerForm label').count(), 5);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path:`screenshots/finance-${name}-${width}.png`, fullPage:true });
      await page.evaluate(() => { state.users[0].role = 'player'; state.revision++; renderFinance(); });
      assert.equal(await page.locator('#sourceList .card-actions').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${name} ${width}: flow, permissions, signs and layout passed`);
      await page.close();
    }
  } finally { await browser.close(); }
}
