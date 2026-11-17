// Layout contracts: essential controls remain reachable, secondary information is disclosed on demand.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8000/';
let browser,server;
const errors=[];
try {
 try {await fetch(base)}catch{
  server=spawn('python3',['-m','http.server','8000','--bind','127.0.0.1'],{cwd:new URL('../',import.meta.url),stdio:'ignore'});
  for(let i=0;i<50;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 }
 mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
 browser=await chromium.launch({headless:true});
 for(const [width,height] of [[390,844],[360,640],[844,390],[1440,1000]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(base);url.search='?local=1&cpu=hard&debug=1&seed=8';await page.goto(url.href);
  await page.waitForFunction(()=>window.castlefield?.game()&&!document.querySelector('#app').classList.contains('busy'));
  // The developer-only floating toggle is not part of the shipped player layout.
  await page.addStyleTag({content:'#debug-toggle { display:none }'});
  assert.ok(await page.locator('#turn-status').isVisible());assert.ok(await page.locator('.hand-toolbar').isVisible());
  const metrics=await page.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
   return {end:rect('#end-turn'),fuse:rect('#fusion-open'),upgrade:rect('#upgrade-open'),menu:rect('#menu-open'),field:rect('#field'),width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth};
  });
  assert.ok(metrics.scroll<=width,'no document overflow');
  assert.ok(Math.abs(metrics.end.y-metrics.fuse.y)<3 && Math.abs(metrics.end.y-metrics.upgrade.y)<3,'primary actions share one row');
  assert.ok(metrics.end.w>=90&&metrics.end.h>=44,'end turn has a readable touch target');
  assert.ok(metrics.menu.right<=width&&metrics.menu.bottom<=height,'menu stays reachable');
  assert.ok(metrics.field.h>=90,'board retains usable space');
  assert.equal(await page.locator('#deck-pile').isVisible(),false,'secondary counters not constantly visible');
  await page.screenshot({path:new URL(`./artifacts/layout-${width}.png`,import.meta.url).pathname});
  // Many cards use the same public debug interface as the built-in debug panel.
  await page.evaluate(async()=>{const id=document.querySelector('#app').dataset.viewer;castlefield.game().debugSetHand(id,['infantry','infantry','fireball','manaShard','manaDrop','adapt','cavalry','thunder','shield','heal','earthHammer','prayer']);await castlefield.refresh()});
  assert.match(await page.locator('#hand-count').textContent(),/12枚/);
  await page.locator('#hand .card').first().focus();await page.keyboard.press('Enter');
  await page.locator('#card-detail').waitFor({state:'visible'});
  assert.equal(await page.locator('.detail-extra').getAttribute('open'),null,'reference is initially folded');
  assert.ok(await page.locator('.detail-desc').isVisible());assert.ok(await page.locator('.detail-use').isVisible());
  await page.locator('.detail-extra summary').click();assert.ok(await page.locator('.detail-meta').isVisible());
  await page.screenshot({path:new URL(`./artifacts/layout-detail-${width}.png`,import.meta.url).pathname});
  await page.locator('.detail-close').click();
  if(height>500){
    await page.locator('#hand-toggle').click();assert.equal(await page.locator('#hand').isVisible(),false);
    if(width===390){
      await page.setViewportSize({width:844,height:390});assert.ok(await page.locator('#hand').isVisible(),'rotation cannot strand a folded hand');
      await page.setViewportSize({width,height});
    }
    await page.locator('#hand-toggle').click();assert.ok(await page.locator('#hand').isVisible());
  }
  await page.locator('#menu-open').click();await page.locator('#match-info summary').click();
  assert.equal(await page.locator('.match-seats li').count(),2);assert.ok(await page.locator('#deck-pile').isVisible());
  await page.screenshot({path:new URL(`./artifacts/layout-menu-${width}.png`,import.meta.url).pathname});
  await page.locator('#menu-title-btn').click();await page.locator('#title').waitFor({state:'visible'});
  assert.ok(await page.locator('#title-solo').isVisible());assert.ok(await page.locator('#title-online').isVisible());
  assert.equal(await page.locator('#record-clear').isVisible(),false,'destructive record reset is folded');
  await page.screenshot({path:new URL(`./artifacts/layout-title-${width}.png`,import.meta.url).pathname});
  await page.locator('#title-solo').click();assert.equal(await page.locator('#local-recommended').count(),0,'one start choice per action');
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: 4 viewports, primary action row, touch targets, board space, 12-card hand, folded references, match information, title hierarchy');
}finally{await browser?.close();server?.kill()}
