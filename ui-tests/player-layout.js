// Player-facing layouts, real touch and real economy APIs. Fixtures stay in memory.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGameServer,loadModeData} from '../server/server.js';
import {selectDifficulty} from './lib/title.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=new URL(process.env.UI_REVIEW_DIR??'../assets/review/player-layout-v5/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const server=createGameServer({modeData:loadModeData(),accounts:{dbPath:':memory:',env:{}}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
const report=[];
try{
 for(const [device,width,height] of [['pc',1440,900],['mobile',390,844]]){
  const touch=device==='mobile';
  const c=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage(),errors=[];
  p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
  const press=async s=>p.locator(s)[touch?'tap':'click']();
  const shot=async name=>{await p.evaluate(()=>document.activeElement?.blur());await p.screenshot({path:`${out}${device}-${name}.png`})};
  const tab=async name=>press(`.home-tab[data-tab=${name}]`);
  await p.goto(base+'/?home=1&fx=lite&debug=1');await p.locator('#home:not([hidden])').waitFor();
  await p.waitForFunction(async()=>!!(await import('/js/ui/Account.js')).account.user);
  const user=(await(await c.request.get(base+'/api/me')).json()).user;
  server.account.economy.credit(user.id,15000,'ui-test',device+'-coins');
  server.account.economy.credit(user.id,3000,'ui-test',device+'-points','exchange_points');
  await p.reload();await p.locator('#home:not([hidden])').waitFor();
  assert.ok(await p.locator('.cpu-choice').first().isHidden());await shot('home');
  await press('.home-cpu summary');await shot('difficulty');await selectDifficulty(p,'hard',touch);
  assert.ok(await p.locator('.cpu-choice').first().isHidden());assert.match(await p.locator('[data-cpu-current]').innerText(),/つよい/);
  assert.equal(await p.evaluate(()=>castlefield.game()),null);
  await p.reload();await p.locator('#home:not([hidden])').waitFor();assert.match(await p.locator('[data-cpu-current]').innerText(),/つよい/);
  assert.equal(await p.locator('.home-battle-links .home-tile').count(),2);
  await tab('menu');assert.equal(await p.locator('[data-page=menu] [data-id=rank],[data-page=menu] [data-id=friend]').count(),0);await shot('menu');
  // Search preserves the input/focus, category and sorting affect actual visible products.
  await tab('shop');await p.locator('[data-act=buy][data-id=unit_crimson]').waitFor();await shot('shop');
  assert.equal(await p.locator('.item-card').count(),24);await press('[data-shop-more]');assert.equal(await p.locator('.item-card').count(),48);
  await p.locator('.shop-query').fill('紅蓮の兵');await p.locator('.shop-query').press('End');
  assert.ok(await p.locator('.shop-query').evaluate(e=>e===document.activeElement));assert.equal(await p.locator('.item-card').count(),1);await shot('shop-search');
  await press('[data-act=buy][data-id=unit_crimson]');await p.locator('.item-card[data-item-id=unit_crimson].owned').waitFor();
  await p.locator('.shop-query').fill('castle-no-result');await p.getByText('条件に合う商品がありません',{exact:true}).waitFor();await press('[data-shop-reset]');assert.equal(await p.locator('.item-card').count(),24);
  await press('.collection-slot[data-slot=castle]');await p.selectOption('.shop-sort','price');
  const prices=await p.locator('[data-act=buy]').evaluateAll(bs=>bs.map(b=>Number(b.textContent.replace(/\D/g,''))));assert.deepEqual(prices,[...prices].sort((a,b)=>a-b));
  await press('[data-act=buy][data-id=castle_crimson]');await p.locator('.item-card[data-item-id=castle_crimson].owned').waitFor();
  await press('[data-shop-source=exchange]');await p.locator('[data-act=exchange]').first().waitFor();await shot('shop-exchange');
  const exchangeId=await p.locator('[data-act=exchange]').first().getAttribute('data-id');await press(`[data-act=exchange][data-id=${exchangeId}]`);await p.locator(`[data-act=exchange][data-id=${exchangeId}]`).waitFor({state:'detached'});
  await press('[data-shop-source=coin]');await press('.shop-affordable input');assert.equal(await p.locator('.item-card.owned').count(),0);await press('.shop-affordable input');
  // Equipment stage shows server-confirmed choices and the standard preview on removal.
  await tab('menu');await press('.home-tile[data-id=skin]');await press('[data-act=equip][data-id=unit_crimson]');
  await p.locator('[data-preview-slot=unit][data-equipped-id=unit_crimson]').waitFor();
  await press('.collection-slot[data-slot=castle]');await press('[data-act=equip][data-id=castle_crimson]');await p.locator('[data-preview-slot=castle][data-equipped-id=castle_crimson]').waitFor();await shot('skin');
  const equipped=(await(await c.request.get(base+'/api/collection')).json()).equipped;assert.equal(equipped.unit,'unit_crimson');assert.equal(equipped.castle,'castle_crimson');
  await press('[data-act=unequip][data-id=castle_crimson]');await p.locator('[data-preview-slot=castle][data-equipped-id=""]').waitFor();
  // A pull is bought once; header reload cannot destroy the native result dialog.
  await tab('gacha');await p.locator('[data-act=pull][data-count="1"]:enabled').waitFor();await shot('gacha');
  let pulls=0;p.on('request',r=>{if(r.url().endsWith('/api/gacha/pull')&&r.method()==='POST')pulls++});
  await press('[data-act=pull][data-count="1"]');await p.locator('.gacha-reveal[open]').waitFor();await p.locator('.gacha-pull button:enabled').first().waitFor({state:'attached'});
  assert.equal(pulls,1);assert.ok(await p.locator('.gacha-reveal').evaluate(e=>e.getBoundingClientRect().height<=innerHeight*.89));await shot('chest');await press('.gacha-open');assert.equal(await p.locator('.gacha-card:visible').count(),1);await shot('reward');await press('.gacha-close');
  await press('[data-act=pull][data-count="10"]');await p.locator('.gacha-reveal[open]').waitFor();await press('.gacha-open');assert.equal(await p.locator('.gacha-card:visible').count(),10);await shot('ten-rewards');assert.equal(pulls,2);
  await p.keyboard.press('Escape');await p.locator('.gacha-reveal').waitFor({state:'detached'});assert.ok(await p.locator('[data-page=gacha]').isVisible());
  await tab('menu');await press('.home-tile[data-id=settings]');await p.locator('#settings.embedded-view').waitFor();await shot('settings');
  assert.deepEqual(errors,[]);report.push({device,compactDifficulty:true,difficultyPersists:true,battleLinks:2,shopSearch:true,shopPagination:true,shopSort:true,coinPurchase:true,pointExchange:true,equipmentPreview:true,realPulls:pulls,singleAndTenRewards:true,escapeReturnsToGacha:true,touch,errors});
  console.log(device,'player layouts passed');await c.close();
 }
 // Long titles and mode-specific controls at phone/tablet/landscape/desktop sizes.
 for(const [device,width,height] of [['small',320,568],['tablet',820,1180],['landscape',844,390],['pc',1440,900]]){
  const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();
  for(const mode of ['kingdom','factions','classic']){
   await p.goto(`${base}/?home=1&fx=lite${mode==='kingdom'?'':`&mode=${mode}`}`);await p.locator('#home:not([hidden])').waitFor();
   const geo=await p.evaluate(()=>{const h=document.querySelector('#home'),rect=s=>h.querySelector(s).getBoundingClientRect(),r=rect('.home-worlds'),t=rect('.home-battle-heading'),a=rect('.home-hero'),b=rect('.home-start'),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{overflow:h.scrollWidth>h.clientWidth+1,titleClear:t.top>=r.bottom-1,heroHeight:a.height,heroClear:a.top>=t.bottom-1,startClickable:h.querySelector('.home-start').contains(hit)}});
   assert.equal(geo.overflow,false);assert.ok(geo.titleClear);assert.ok(geo.heroClear);assert.ok(geo.heroHeight>=210);
   assert.equal(await p.locator('.home-battle-links').isVisible(),mode==='kingdom');
   await p.screenshot({path:`${out}${device}-${mode}-home.png`});
   await p.locator('.home-start').scrollIntoViewIfNeeded();const startReachable=await p.locator('.home-start').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});assert.ok(startReachable,`${device}/${mode}: start reachable after scrolling`);
   report.push({device,mode,...geo,startReachable});
  }await c.close();
 }
 writeFileSync(out+'player-layout.json',JSON.stringify(report,null,2)+'\n');console.log('Player layout passed',report.length);
}finally{await browser.close();await new Promise(r=>server.close(r))}
