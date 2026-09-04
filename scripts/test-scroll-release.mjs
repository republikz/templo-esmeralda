import { chromium,firefox,webkit } from '@playwright/test';
import { writeFile,mkdir } from 'node:fs/promises';
const results=[];
for(const engine of [chromium,firefox,webkit]) {
 const browser=await engine.launch();
 try {for(const width of [390,768,1440,1920]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/api/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await page.goto('http://127.0.0.1:4173/#dashboard');await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{sessionUserId=state.users[0].id;sessionToken='isolated';saveState=()=>{};document.querySelector('#authOverlay').hidden=true;document.body.classList.add('authenticated');window.tasks=[];try{new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask'});}catch{}});
  for(const view of ['dashboard','rooms','npcs','finance','calendar','campfire','journey','market','map','missions','timeline','trophies']) {
   await page.evaluate(view=>showView(view),view);await page.waitForTimeout(350);
   await page.evaluate(()=>{tasks=[];});
   for(let i=0;i<6;i++){await page.mouse.wheel(0,500);await page.waitForTimeout(80);}
   results.push(await page.evaluate(({view,width,engine})=>({view,width,engine,overflow:document.documentElement.scrollWidth>innerWidth,longTasks:tasks.slice()}),{view,width,engine:engine.name()}));
   await page.evaluate(()=>scrollTo(0,0));
  }
  await page.close();
 }}finally{await browser.close();}
}
await mkdir('screenshots',{recursive:true});
await writeFile('screenshots/release-scroll-report.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({scenarios:results.length,overflow:results.filter(r=>r.overflow),longTaskScenarios:results.filter(r=>r.longTasks.length)},null,2));
