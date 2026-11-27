// Supplement the route walk with real touch, retry, modal focus and non-cost decks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const{chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL??'http://127.0.0.1:3000/';
const out=new URL('../assets/review/navigation-v4/',import.meta.url);mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium'});const report=[];
try{
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage(),errors=[];p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(new URL('?home=1&debug=1&fx=lite',base).href);await p.locator('#home:not([hidden])').waitFor();
 await p.locator('.cpu-choice[data-level=easy]').tap();assert.equal(await p.locator('.cpu-choice[data-level=easy]').getAttribute('aria-pressed'),'true');assert.equal(await p.evaluate(()=>castlefield.game()),null);
 await p.locator('.home-player').tap();await p.locator('[data-page=profile] [data-act=backMenu]').tap();assert.ok(await p.locator('[data-page=battle]').isVisible(),'profile returns to invoking home');
 await p.locator('[data-act=chooseMode]').tap();await p.locator('[data-mode=online]').tap();await p.locator('#title-pass').fill('retry-'+Date.now());
 await p.route('**/api/join',r=>r.fulfill({json:{ok:false,reason:'接続の試験拒否'}}),{times:1});
 await p.locator('.home-start').tap();await p.waitForFunction(()=>document.querySelector('#title-status').textContent.includes('試験拒否'));
 assert.ok(await p.locator('.home-start').isEnabled(),'failed join can be retried');
 await p.locator('.home-start').tap();await p.locator('#room-screen:not([hidden])').waitFor();report.push({touch:true,profileReturnsToCaller:true,failedJoinRetry:true,errors});assert.deepEqual(errors,[]);await c.close();
 for(const mode of ['shared','own']){
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();
  await p.goto(new URL('?home=1&debug=1&fx=lite',base).href);await p.locator('#home:not([hidden])').waitFor();await p.locator('[data-act=chooseMode]').tap();await p.locator('[data-mode=local]').tap();
  await p.locator('.home-match-options summary').tap();await p.selectOption('.home-match-fields [name=deckMode]',mode);
  if(mode==='own'){await p.selectOption('.home-match-fields [name=deck]','assault');assert.match(await p.locator('.home-match-fields .deck-preview').innerText(),/突撃/);}assert.ok(await p.locator('.home-deckpanel').isHidden());
  await p.locator('.home-match-options summary').tap();await p.locator('.home-start').tap();await p.waitForFunction(()=>Boolean(window.castlefield?.game()));
  const state=await p.evaluate(()=>({deckMode:castlefield.game().rules.deckMode,deckId:castlefield.game().getState(null).players.p1.deckId}));assert.equal(state.deckMode,mode);if(mode==='own')assert.equal(state.deckId,'assault');report.push(state);await c.close();
 }
 // A preset and a saved deck share the one home selector; neither option is lost.
 const c3=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),p3=await c3.newPage();
 const decks=JSON.parse(readFileSync(new URL('../data/decks.json',import.meta.url)));
 await c3.route('**/api/me',r=>r.fulfill({json:{ok:false}}));await c3.addInitScript(list=>localStorage.setItem('cf-mydecks-v2',JSON.stringify({active:0,slots:[{name:'保存したバランス',list},null,null,null]})),decks.costBalance.cards);
 await p3.goto(new URL('?home=1&debug=1&fx=lite',base).href);await p3.locator('#home:not([hidden])').waitFor();
 await p3.locator('[data-act=chooseDeck]').tap();await p3.screenshot({path:new URL('mobile-deck-choices.png',out).pathname});assert.equal(await p3.locator('[data-cost-preset]').count(),3);
 await p3.locator('[data-cost-preset=costAssault]').tap();await p3.reload();await p3.locator('#home:not([hidden])').waitFor();assert.match(await p3.locator('#home [data-part=deck]').textContent(),/突撃/);
 await p3.locator('[data-act=chooseDeck]').tap();await p3.locator('[data-choose-slot="0"]').tap();assert.equal(await p3.locator('#home [data-part=deck]').textContent(),'保存したバランス');
 await p3.locator('[data-act=chooseDeck]').tap();await p3.locator('[data-cost-preset=costAssault]').tap();await p3.locator('.home-tab[data-tab=deck]').tap();await p3.locator('.home-deck-editbtn').tap();await p3.locator('#deck-editor[open]').waitFor();await p3.locator('.deck-save').click();await p3.locator('.deck-close').click();
 const created=await p3.evaluate(()=>JSON.parse(localStorage.getItem('cf-mydecks-v2')));assert.deepEqual(created.slots[1].list,decks.costAssault.cards);assert.equal(created.active,1);assert.equal(await p3.evaluate(()=>localStorage.getItem('cf-home-cost-preset')),null);await p3.locator('.home-tab[data-tab=battle]').tap();

 await p3.locator('[data-act=chooseDeck]').tap();await p3.locator('[data-cost-preset=costAssault]').tap();await p3.locator('[data-act=chooseMode]').tap();await p3.locator('[data-mode=local]').tap();await p3.locator('.home-start').tap();await p3.waitForFunction(()=>Boolean(window.castlefield?.game()));
 const actual=await p3.evaluate(()=>{const g=castlefield.game(),pile=g.pileOf('p1'),hand=g.getState('p1').players.p1.hand;return[...pile.deck,...pile.discard,...pile.exhausted,...hand].reduce((m,c)=>(m[c.type]=(m[c.type]??0)+1,m),{})});assert.deepEqual(actual,decks.costAssault.cards);report.push({costPresets:3,presetPersistence:true,savedDeckSwitch:true,editFromPreset:true,presetMatchesActualCards:true});await c3.close();
 const classic=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'}),cp=await classic.newPage();
 await cp.goto(new URL('?home=1&debug=1&mode=classic&fx=lite',base).href);await cp.locator('#home:not([hidden])').waitFor();assert.equal(await cp.locator('[data-part=skillCount]').textContent(),'0');await cp.locator('.home-start').tap();await cp.waitForFunction(()=>Boolean(window.castlefield?.game()));assert.ok(await cp.locator('.skilltree').isHidden());report.push({classicStartsWithoutSkillEditor:true});await classic.close();
 // No account service: each feature page explains availability; profile still edits the local name.
 const c2=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),p2=await c2.newPage();
 await c2.route('**/api/me',r=>r.fulfill({json:{ok:false}}));await p2.goto(new URL('?home=1&fx=lite',base).href);await p2.locator('#home.home-local').waitFor();
 await p2.locator('.home-tab[data-tab=gacha]').click();await p2.getByText('オンラインにつながると利用できます。',{exact:false}).waitFor();
 await p2.locator('.home-player').click();await p2.locator('.profile-local-name input').fill('旅の騎士');await p2.locator('.profile-local-name button').click();assert.equal(await p2.evaluate(()=>localStorage.getItem('cf-name')),'旅の騎士');
 await p2.screenshot({path:new URL('offline-profile.png',out).pathname});report.push({localProfileName:true,offlineAvailability:true});await c2.close();
 writeFileSync(new URL('edgecases.json',out),JSON.stringify(report,null,2));console.log(report);
}finally{await b.close()}
