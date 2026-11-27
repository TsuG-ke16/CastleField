// Real online sessions + real server cost planning. All rooms and accounts are disposable.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGameServer,loadData,loadModeData} from '../server/server.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const out=new URL('../assets/review/online-skills/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const modes=loadModeData();modes.classic.rules={...modes.classic.rules,mulligan:false};
const server=createGameServer({data:loadData(),modeData:modes,makeRng:()=>()=>0.1});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
const post=async(path,data)=>(await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
const report=[];
try{
 for(const [device,width,height]of [['pc',1440,900],['mobile',390,844]]){
  const name=`os-${device}-${Date.now()}`,a=await post('/api/join',{passphrase:name,name:'確認A',mode:'classic'}),b=await post('/api/join',{passphrase:name,name:'確認B',mode:'classic'});
  const act=async(who,method,args=[])=>post('/api/action',{token:who.token,method,args});
  assert.ok((await act(a,'setSeat',[{skills:{ids:['B01','B02','X35'],config:{}}}])).ok);
  assert.ok((await act(a,'start')).ok);
  const {room}=server.lobby.findSeat(a.token);const g=room.game;assert.equal(g.currentPlayer,'p1');
  g.players.p1.hand.splice(2);assert.ok(g.skillAction('p1','B02').ok);
  g.debugSetHand('p1',['classic_king_holy_fireball']);g.players.p1.mp=1;room.broadcastState();
  const contexts=[],pages=[],errors=[];
  for(const who of [a,b]){
   const c=await browser.newContext({viewport:{width,height},hasTouch:device==='mobile',isMobile:device==='mobile',reducedMotion:'reduce',serviceWorkers:'block'});contexts.push(c);
   await c.addInitScript(w=>sessionStorage.setItem('cf-online',JSON.stringify({...w,mode:'classic'})),who);
   const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/?mode=classic&fx=lite');await p.locator('.skill-battle-toggle:not([hidden])').waitFor();
  }
  const [p,foe]=pages;await p.locator('.skill-battle-toggle').click();await foe.locator('.skill-battle-toggle').click();
  await p.locator('.sb-log').getByText(/血の契約/).first().waitFor();await foe.locator('.sb-log').getByText(/血の契約/).first().waitFor();
  assert.match(await foe.locator('.sb-log').innerText(),/城HP3/);
  await foe.screenshot({path:out+device+'-opponent-log.png'});
  const toggle=p.locator('[data-pref=X35]');await toggle.check();await p.waitForFunction(()=>document.querySelector('[data-pref=X35]')?.checked);
  for(let i=0;i<50&&!g.skillRt.states.p1.prefs.X35?.autoDefer;i++)await p.waitForTimeout(50);
  assert.equal(g.skillRt.states.p1.prefs.X35.autoDefer,true);await toggle.uncheck();
  for(let i=0;i<50&&g.skillRt.states.p1.prefs.X35?.autoDefer;i++)await p.waitForTimeout(50);assert.equal(g.skillRt.states.p1.prefs.X35.autoDefer,false);
  await p.locator('#skill-battle [data-close]').click();
  const cardId=g.players.p1.hand[0].cardId;
  const openCost=async()=>{
   await p.locator('#app:not(.busy):not(.sending)').waitFor();
   await p.locator(`#hand .card[data-id="${cardId}"]`).click();
   await p.locator('#card-detail .detail-use').click();
   await Promise.race([p.locator('[role=dialog][aria-label$="のスキル選択"]').waitFor(),p.locator('.targetable').first().waitFor()]);
   if(await p.locator('.targetable').count())await p.locator('.targetable').first().click();
   await p.locator('.sb-preview').filter({hasText:'実際の支払い'}).waitFor();
  };
  const hp=g.players.p1.castle.hp;await openCost();assert.match(await p.locator('.sb-preview').innerText(),/MP 1・城HP 6/);
  await p.screenshot({path:out+device+'-cost-confirm.png'});
  await p.locator('[data-no]').click();assert.equal(g.players.p1.castle.hp,hp);assert.equal(g.players.p1.mp,1);assert.equal(g.players.p1.hand.length,1);
  await openCost();await p.locator('[data-q=hpForMp]').uncheck();await p.locator('.sb-preview.bad').waitFor();assert.ok(await p.locator('[data-ok]').isDisabled());
  await p.locator('[data-q=hpForMp]').check();await p.locator('[data-ok]:enabled').waitFor();
  const response=p.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().postDataJSON()?.method==='playCard');await p.locator('[data-ok]').click();assert.ok((await(await response).json()).ok);
  assert.equal(g.players.p1.mp,0);assert.equal(g.players.p1.castle.hp,hp-6);assert.equal(g.players.p1.hand.length,0);
  await p.reload();await p.locator('.skill-battle-toggle:not([hidden])').waitFor();await p.locator('.skill-battle-toggle').click();await p.locator('.sb-log').getByText(/血の契約/).first().waitFor();
  await p.screenshot({path:out+device+'-reconnected-log.png'});
  // Real rematch: old history disappears; fresh actions and settings use the new game.
  assert.ok((await act(a,'surrender')).ok);assert.ok((await act(a,'rematch')).ok);assert.ok((await act(b,'rematch')).ok);
  const next=room.game;assert.notEqual(next,g);next.players.p1.hand.splice(2);assert.ok(next.skillAction('p1','B02').ok);room.broadcastState();
  await p.waitForTimeout(1000);await p.locator('.skill-battle-toggle:not([hidden])').waitFor();
  if(await p.locator('#skill-battle').isHidden())await p.locator('.skill-battle-toggle').click();
  await p.locator('.sb-log').getByText(/血の契約/).first().waitFor();assert.equal(await p.locator('.sb-log').getByText(/血の契約/).count(),1);
  // Run the manual skill through the existing panel and OnlineClient, in a fresh interval.
  for(let i=0;i<2;i++){assert.ok(next.endTurn().ok);if(next.phase==='discard')assert.ok(next.discard(next.players[next.currentPlayer].hand.slice(0,next.discardCount).map(c=>c.cardId)).ok);}
  assert.equal(next.currentPlayer,'p1');room.broadcastState();await p.locator('#app:not(.busy):not(.sending)').waitFor();
  await p.locator('.sb-action').filter({hasText:'血の契約'}).click();await p.locator('[data-run]').waitFor();
  const manualHp=next.players.p1.castle.hp,manualHand=next.players.p1.hand.length;
  const manual=p.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().postDataJSON()?.method==='skillAction');
  await p.locator('[data-run]').click();assert.ok((await(await manual).json()).ok);
  assert.equal(next.players.p1.castle.hp,manualHp-3);assert.equal(next.players.p1.hand.length,manualHand+1);
  assert.deepEqual(errors,[]);report.push({device,online:true,opponentPublicLog:true,initialLog:true,reconnectedLog:true,rematchLog:true,preferences:true,manualSkill:true,cancelNoConsumption:true,rejectInsufficientMp:true,payment:{mp:1,hp:6},errors});
  for(const c of contexts)await c.close();
 }
 writeFileSync(out+'report.json',JSON.stringify(report,null,2)+'\n');console.log('Online skills browser: PC/mobile, public log, prefs, MP/HP preview/cancel/payment, reconnect/rematch passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}
