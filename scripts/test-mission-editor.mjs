import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
for (const [name, engine] of Object.entries({chromium,firefox,webkit})) {
 const browser=await engine.launch();
 try { for(const width of [390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await page.goto('http://127.0.0.1:4173/#missions'); await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{sessionUserId=state.users[0].id;sessionToken='isolated';saveState=()=>{};document.querySelector('#authOverlay').hidden=true;document.body.classList.add('authenticated');showView('missions');clearMissionForm();toggleCampaignComposer('mission',true);});
  assert.equal(await page.locator('#missionAssignee').isVisible(),true);
  assert.equal(await page.locator('#missionSource').isVisible(),false);
  await page.locator('#missionAssignee').fill('Herói');
  await page.locator('#missionType').selectOption('rumor');
  assert.equal(await page.locator('#missionAssignee').isVisible(),false);
  assert.equal(await page.locator('#missionReliability').isVisible(),true);
  await page.locator('#missionType').selectOption('mission');
  assert.equal(await page.locator('#missionAssignee').inputValue(),'Herói');
  const checkbox=page.locator('.mission-reference-results input').first();
  const id=await checkbox.inputValue(); await checkbox.check();
  assert.ok(await page.evaluate(id=>getSelectedOptions(document.querySelector('#missionReferences')).includes(id),id));
  await page.locator('[data-reference-search="missionReferences"]').fill('zzzznotfound');
  assert.equal(await page.locator('.mission-reference-results input').count(),0);
  assert.equal(await page.locator('.mission-reference-selected button').count(),1);
  await page.locator('.mission-reference-selected button').click();
  assert.equal(await page.locator('.mission-reference-selected button').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`screenshots/mission-editor-${name}-${width}.png`,fullPage:true});
  console.log(`${name} ${width}: conditional fields, references and layout passed`); await page.close();
 }} finally {await browser.close();}
}
