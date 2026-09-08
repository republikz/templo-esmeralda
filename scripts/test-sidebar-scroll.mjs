import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
for (const engine of [chromium, firefox, webkit]) {
 const browser=await engine.launch();
 try { for (const width of [390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:650}});
  await page.route('**/api/**',r=>r.fulfill({status:401,body:'{}'}));
  await page.goto('http://127.0.0.1:4173');await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{document.querySelector('#authOverlay').hidden=true;document.body.classList.add('authenticated','mobile-nav-open');});
  const before=await page.evaluate(()=>window.scrollY);
  const result=await page.evaluate(()=>{
   const bar=document.querySelector('.sidebar');bar.scrollTop=bar.scrollHeight;
   const last=bar.querySelector('.side-status').getBoundingClientRect();
   return {scroll:bar.scrollTop,height:bar.getBoundingClientRect().height,bottom:last.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.ok(result.scroll>0);assert.ok(result.height<=650);assert.ok(result.bottom<=650);assert.equal(result.overflow,false);
  assert.equal(await page.evaluate(()=>window.scrollY),before);
  console.log(`${engine.name()} ${width}: sidebar fits and scrolls independently`);
  await page.close();
 }}finally{await browser.close();}
}
