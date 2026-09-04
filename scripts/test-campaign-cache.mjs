import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
for (const engine of [chromium, firefox, webkit]) {
 const browser=await engine.launch();
 try {
  const page=await browser.newPage();
  await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await page.goto('http://127.0.0.1:4173/#timeline'); await page.waitForLoadState('networkidle');
  const result=await page.evaluate(async()=>{
   await localCacheQueue;
   let notices=0; showToast=()=>{notices++;};
   const value={revision:1,image:'x'.repeat(8*1024*1024),timeline:[{id:'test',order:100}]};
   const first=saveLocalState(value);
   value.revision=2;value.timeline[0].order=200;
   await saveLocalState(value);await first;
   const cached=await campaignCacheRequest('readonly',store=>store.get('state'));
   const original=campaignCacheRequest;
   campaignCacheRequest=()=>Promise.reject(new Error('Quota exceeded'));
   await saveLocalState(value);await saveLocalState(value);
   campaignCacheRequest=original;
   return {revision:cached.revision,order:cached.timeline[0].order,length:cached.image.length,notices};
  });
  assert.deepEqual(result,{revision:2,order:200,length:8*1024*1024,notices:1});
  console.log(`${engine.name()}: 8 MB cache, ordered writes and one-time failure warning passed`);
 } finally {await browser.close();}
}
