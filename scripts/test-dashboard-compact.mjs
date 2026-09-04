import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('screenshots', { recursive:true });
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const width of [390,768,1440]) {
      const page = await browser.newPage({ viewport:{width,height:1000} });
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
      await page.goto('http://127.0.0.1:4173/#dashboard');
      await page.waitForLoadState('networkidle');
      await page.evaluate(()=>{
        sessionUserId=state.users.find(u=>u.role==='admin')?.id || state.users[0].id;
        sessionToken='isolated'; saveState=()=>{state.revision++;};
        state.journey.entries=state.journey.entries.slice(0,4).map(e=>({...e,createdAt:1700000000000,comments:[]}));
        state.ledger=[{id:'test-a',name:'Recebimento',type:'income',day:state.currentDay,amountCopper:10000,createdAt:2},{id:'test-b',name:'Pagamento',type:'expense',day:state.currentDay,amountCopper:5000,createdAt:1}];
        state.revision=Date.now(); document.querySelector('#authOverlay').hidden=true; document.body.classList.add('authenticated'); showView('dashboard');
      });
      assert.equal(await page.locator('#dashboardCalendarGrid button').count(),72);
      assert.equal(await page.locator('#dashboardCalendarGrid .calendar-mini-empty').count(),0);
      assert.equal(await page.locator('#dashboardCalendarGrid .today').count(),1);
      assert.equal(await page.locator('#recentLedger .dashboard-date-group').count(),1);
      assert.equal(await page.locator('#dashboardJourneyList time').count(),0);
      assert.equal(await page.locator('.dashboard-all-read').count(),1);
      const more = page.locator('.dashboard-goal-toggle:visible').first();
      if (await more.count()) {
        await more.click();
        assert.equal(await more.getAttribute('aria-expanded'),'true');
        await more.click();
        assert.equal(await more.getAttribute('aria-expanded'),'false');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`screenshots/dashboard-compact-${name}-${width}.png`,fullPage:true});
      await page.locator('#dashboardCalendarGrid .today').click();
      assert.equal(await page.evaluate(()=>activeView),'calendar');
      assert.deepEqual(errors,[]);
      console.log(`${name} ${width}: heatmap, groups, navigation and layout passed`);
      await page.close();
    }
  } finally { await browser.close(); }
}
