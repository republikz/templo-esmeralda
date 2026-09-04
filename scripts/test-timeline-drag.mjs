import { chromium,firefox,webkit } from '@playwright/test';
import assert from 'node:assert/strict';
for(const engine of [chromium,firefox,webkit]) {
 const browser=await engine.launch();
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/api/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
 await page.goto('http://127.0.0.1:4173/#timeline');await page.waitForLoadState('networkidle');
 await page.evaluate(()=>{sessionUserId=state.users[0].id;sessionToken='test';saveState=()=>{state.revision++;};state.timeline=['a','b','c'].map((id,i)=>normalizeTimelineEntry({id,title:id,era:'1',day:i+1,createdAt:i+1},state.users));state.revision=Date.now();document.querySelector('#authOverlay').hidden=true;showView('timeline');});
 const a=page.locator('.timeline-node[data-id="a"]'),b=page.locator('.timeline-node[data-id="b"]');
 await a.scrollIntoViewIfNeeded();
 const start=await a.boundingBox(),end=await b.boundingBox();
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
 await page.mouse.move(end.x+end.width-5,end.y+end.height/2,{steps:12});await page.mouse.up();
 assert.deepEqual(await page.locator('.timeline-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),['b','a','c']);
 assert.equal(await page.evaluate(()=>selectedTimelineId),'');
 assert.equal(await page.evaluate(()=>normalizeTimelineEntry(state.timeline.find(n=>n.id==='a'),state.users).day),1);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.timeline-horizontal-scroll')).scrollbarWidth),'none');
 console.log(`${engine.name()}: drag, order, dates and click suppression passed`);
 }finally{await browser.close();}
}
