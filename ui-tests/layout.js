// Layout contracts: essential controls remain reachable, secondary information is disclosed on demand.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { toTitle } from './lib/title.js';
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
 browser=await chromium.launch({headless:true,...(process.env.UI_TEST_CHROMIUM?{executablePath:process.env.UI_TEST_CHROMIUM}:{})});
 for(const [width,height] of [[390,844],[360,640],[844,390],[1440,1000]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  const url=new URL(base);
  url.search=new URLSearchParams({
   local:'1',cpu:'hard',debug:'1',seed:'8',
   rules:JSON.stringify({weatherFirstRound:1,weatherChangeChance:1,monsterFirstRound:1,monsterSpawnChance:1}),
  });
  await page.goto(url.href);
  await page.waitForFunction(()=>window.castlefield?.game(), {}, { timeout: 60000 });
  await page.evaluate(async () => { (await import('./js/ui/config.js')).UI_CONFIG.speed = .05; });
  await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('busy'));
  // The developer-only floating toggle is not part of the shipped player layout.
  await page.addStyleTag({content:'#debug-toggle { display:none }'});
  assert.ok(await page.locator('#turn-status').isVisible());assert.ok(await page.locator('.hand-toolbar').isVisible());
  const metrics=await page.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
   const hud = rect('#hud');
   const hudItems = ['#turn-status','#turn-info','#my-mp','#weather-chip','#chat-open','#menu-open'].map(rect);
   return {hud,hudItems,end:rect('#end-turn'),fuse:rect('#fusion-open'),upgrade:rect('#upgrade-open'),menu:rect('#menu-open'),field:rect('#field'),width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth};
  });
  assert.ok(metrics.scroll<=width,'no document overflow');
  assert.ok(Math.abs(metrics.end.y-metrics.fuse.y)<3 && Math.abs(metrics.end.y-metrics.upgrade.y)<3,'primary actions share one row');
  assert.ok(metrics.end.w>=90&&metrics.end.h>=44,'end turn has a readable touch target');
  assert.ok(metrics.menu.right<=width&&metrics.menu.bottom<=height,'menu stays reachable');
  assert.ok(metrics.hudItems.every(item => item.w > 0 && item.right <= metrics.hud.right && item.bottom <= metrics.hud.bottom), 'all HUD items fit when weather is active');
  const [turn, round, mp, weather, chat, menu] = metrics.hudItems;
  assert.ok(turn.bottom <= round.y && mp.right <= weather.x && weather.right <= chat.x && chat.right <= menu.x, 'turn, weather, MP and controls have their own space');
  assert.ok(menu.h >= 44 && chat.h >= 44, 'menu and chat tap targets');
  const myHp = await page.evaluate(() => {
   const game = castlefield.game();
   const id = document.querySelector('#app').dataset.viewer;
   return String(game.getState(id).players[id].castleHp);
  });
  assert.equal(await page.locator('#castle-me .health-meter').getAttribute('aria-valuenow'), myHp);
  assert.ok(await page.evaluate(async () => {
   const board = document.querySelector('#board');
   await castlefield.anim().screenShake('spell', 24);
   return board.getAnimations().every(animation => !animation.effect.getKeyframes().some(frame => frame.transform));
  }), 'reduce motion stops the board shake');
  const monster = page.locator('.monster .health-meter').first();
  assert.equal(await monster.getAttribute('data-level'), 'high');
  const health = await page.evaluate(() => {
   const renderer = castlefield.renderer();
   const id = document.querySelector('.monster').dataset.id;
   const m = renderer.monster(id);
   renderer.updateMonster(id, {hp: 1});
   const result = m.el.querySelector('.health-meter').dataset.level;
   renderer.updateMonster(id, {hp: m.maxHp});
   return result;
  });
  assert.equal(health, 'low', 'monster and castle gauges use the same low-health threshold');
  assert.equal(await page.locator('#turn-status span').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'your turn label is legible');
  assert.ok(await page.locator('#weather-chip').isVisible(), 'weather remains visible');
  assert.ok(await page.locator('#board > #weather-fx').count(), 'weather effects stay in the arena');
  assert.ok(metrics.field.h>=90,'board retains usable space');
  assert.equal(await page.locator('#deck-pile').isVisible(),false,'secondary counters not constantly visible');
  await page.screenshot({path:new URL(`./artifacts/layout-${width}.png`,import.meta.url).pathname});
  await page.locator('#weather-chip').click();
  assert.ok(await page.locator('#weather-detail').isVisible(), 'weather explanation opens from the HUD');
  assert.match(await page.locator('#weather-detail-remaining').innerText(), /残り \d+周/);
  await page.keyboard.press('Escape');
  assert.ok(!await page.locator('#weather-detail').isVisible());
  // Many cards use the same public debug interface as the built-in debug panel.
  await page.evaluate(async()=>{const id=document.querySelector('#app').dataset.viewer;castlefield.game().debugSetHand(id,['infantry','infantry','fireball','manaShard','manaDrop','adapt','cavalry','thunder','shield','heal','earthHammer','prayer']);await castlefield.refresh()});
  assert.match(await page.locator('#hand-count').textContent(),/12枚/);
  await page.locator('#hand .card.can-fuse').first().waitFor();
  assert.match(await page.locator('#hand .card.can-fuse').first().getAttribute('aria-description'),/合成/);
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
  await page.locator('#menu-title-btn').click();await toTitle(page); // メニューの「タイトルへ」はホーム（入口）に戻る
  assert.ok(await page.locator('#home [data-act="start"]').isVisible());assert.equal(await page.locator('#title').isVisible(),false,'タイトルのメニューはない（入口はホームだけ）');
  await page.screenshot({path:new URL(`./artifacts/layout-title-${width}.png`,import.meta.url).pathname});
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home .home-mode[data-mode="solo"]').click();await page.locator('#home [data-act="start"]').click();assert.equal(await page.locator('#local-recommended').count(),0,'one start choice per action');
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: 4 viewports, primary action row, touch targets, board space, 12-card hand, folded references, match information, title hierarchy');
}finally{await browser?.close();server?.kill()}
