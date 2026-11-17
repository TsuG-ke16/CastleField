import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_ONLINE_URL??'http://127.0.0.1:8787';
const browser=await chromium.launch({headless:true});
const errors=[];
try {
 for(const teams of ['off','auto']) {
  const room=await fetch(`${base}/api/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase:`ui-review-${teams}-${Date.now()}`,name:'UI確認'})}).then(r=>r.json());
  assert.ok(room.ok);
  const action=async(method,args=[])=>{
   const result=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:room.token,method,args})}).then(r=>r.json());
   assert.ok(result.ok,`${method}: ${result.reason}`);return result;
  };
  await action('setRules',[{teams,winCondition:'lastStanding'}]);
  for(let i=0;i<3;i++)await action('addCpu',['easy']);
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await ctx.addInitScript(({token,playerId})=>sessionStorage.setItem('cf-online',JSON.stringify({token,playerId})),room);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#room-screen').waitFor({state:'visible'}).catch(()=>{});
  await action('start');
  await page.waitForFunction(()=>!document.documentElement.classList.contains('at-title'));
  await page.waitForFunction(()=>[...document.querySelectorAll('#hand img')].every(i=>i.complete));
  await page.screenshot({path:new URL(`./artifacts/online-${teams}.png`,import.meta.url).pathname});
  if(teams==='off') {
   await page.locator('#menu-open').click();await page.locator('#menu-surrender').click();await page.locator('#menu-surrender').click();
   await page.locator('#spectator-strip').waitFor({state:'visible'});
   assert.ok(await page.locator('#end-turn').isDisabled());
   await page.screenshot({path:new URL('./artifacts/online-spectator.png',import.meta.url).pathname});
   await page.reload();await page.locator('#spectator-strip').waitFor({state:'visible'});
   assert.equal(await page.locator('#upgrade-panel').isVisible(),false);
  }
  await action('leave');await ctx.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: online 4-player plaza, surrender/spectating/reconnect, team match');
}finally{await browser.close()}
