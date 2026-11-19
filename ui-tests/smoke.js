// 実行: node ui-tests/smoke.js（環境にあるPlaywrightと同梱Chromiumを使用）
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const artifacts=resolve(root,'ui-tests/artifacts');mkdirSync(artifacts,{recursive:true});
const base=process.env.UI_TEST_URL??'http://127.0.0.1:8000/';
const viewport = { width: Number(process.env.UI_TEST_WIDTH ?? 390), height: Number(process.env.UI_TEST_HEIGHT ?? 844) };
let server,browser,page,serverLog='';
const errors=[],warnings=[];
const available=async()=>{try{return(await fetch(base,{signal:AbortSignal.timeout(1000)})).ok}catch{return false}};
async function ensureServer(){
  if(await available())return;
  if(process.env.UI_TEST_URL)throw Error(`UI_TEST_URLに接続できません: ${base}`);
  server=spawn('python3',['-m','http.server','8000','--bind','127.0.0.1'],{cwd:root,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{serverLog=(serverLog+chunk).slice(-4000)});
  for(let n=0;n<40;n++){if(await available())return;await new Promise(r=>setTimeout(r,100))}
  throw Error(`HTTPサーバーを起動できませんでした\n${serverLog}`);
}
async function snapshot(name){await page.screenshot({path:resolve(artifacts,`${name}.png`)})}
async function state(){
  return page.evaluate(()=>{
    const game=window.castlefield.game(),id=document.querySelector('#app').dataset.viewer,st=game.getState(id);
    const mine=st.players[id];
    return {id,phase:st.phase,turn:st.turn,winner:st.winner,current:st.currentPlayer,busy:document.querySelector('#app').classList.contains('busy'),
      defending:st.defense?.defenderId===id,
      discard:st.phase==='discard'&&st.currentPlayer===id?mine.hand.slice(0,mine.handCount-mine.maxHand).map(c=>c.cardId):null,
      playable:st.phase==='main'&&st.currentPlayer===id?mine.hand.filter(c=>game.canPlayCard(c.cardId).ok).map(c=>({id:c.cardId,soldier:document.querySelector(`.card[data-id="${CSS.escape(c.cardId)}"]`)?.classList.contains('soldier')})):[],
    };
  });
}
async function press(selector){await page.locator(selector).focus();await page.keyboard.press('Enter')}
async function play(card){
  await press(`#hand .card[data-id="${card.id}"]`);
  await page.locator('#card-detail').waitFor({state:'visible'});
  assert.ok(await page.locator('.detail-desc').isVisible(),'カード説明が見える');
  await press('.detail-use');
  if(await page.locator('#target-bar').isVisible()){
    await page.waitForTimeout(20); // 対象選びを始めたキーで、そのまま確定しないための間
    assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('targetable')),'対象へフォーカスが移る');
    await page.keyboard.press('Enter');
    if(await page.locator('.target-members button').count())await press('.target-members button:first-child');
  }
}
try{
  await ensureServer();
  browser=await chromium.launch({headless:true,...(process.env.UI_TEST_CHROMIUM?{executablePath:process.env.UI_TEST_CHROMIUM}:{})});
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});
  page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.location().url?.endsWith('/api/me'))errors.push(message.text()); /* アカウント機能のない簡易サーバーでは /api/me が404になる（想定内） */if(message.text().startsWith('[sync]'))warnings.push(message.text())});
  // debugは公開状態を読むためだけに使用。Gameの変更メソッドはテストから呼ばない。
  // 既存のdebug起動からメニューでタイトルへ戻り、以降は実際のUIで開始する。
  const url=new URL(base);url.search='?local=1&cpu=hard&debug=1&seed=8';
  await page.goto(url.href);await page.waitForFunction(()=>Boolean(window.castlefield?.game()),{},{timeout:60000});
  await page.evaluate(async()=>{(await import('./js/ui/config.js')).UI_CONFIG.speed=.03});
  await press('#menu-open');await press('#menu-title-btn');
  assert.ok(await page.locator('#title').isVisible(),'タイトルを表示');await snapshot('title');
  await press('#title-solo');await press('.level[data-level="hard"]');
  await page.waitForFunction(()=>Boolean(window.castlefield?.game()),{},{timeout:60000});
  await page.evaluate(()=>{window.__uiSmokeCards=0;const id=document.querySelector('#app').dataset.viewer;castlefield.game().on('cardPlayed',e=>{if(e.playerId===id)window.__uiSmokeCards++})});
  const deadline=Date.now()+180000;let deployed=false,ended=false;
  while(Date.now()<deadline){
    const s=await state();if(s.busy){await page.waitForTimeout(20);continue}
    if(s.defending){await press('#end-turn');continue}
    if(s.current!==s.id||s.phase!=='main'){await page.waitForTimeout(20);continue}
    const card=s.playable.find(c=>c.soldier);assert.ok(card,'最初の手番に出せる兵士がある');
    await play(card);
    await page.waitForFunction(()=>{const id=document.querySelector('#app').dataset.viewer;return castlefield.game().getState(id).players[id].soldiers.length>0});
    deployed=true;await snapshot('deployed');
    await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('busy'));
    await press('#end-turn');ended=true;break;
  }
  assert.ok(deployed&&ended,'実際のUIで兵士を出してターンを終える');
  while(Date.now()<deadline){
    if(await page.locator('#result').isVisible())break;
    const s=await state();
    if(s.busy||s.phase==='gameOver'||(s.current!==s.id&&!s.defending)){await page.waitForTimeout(20);continue}
    if(s.defending){await press('#end-turn');continue}
    if(s.discard){for(const id of s.discard)await press(`#hand .card[data-id="${id}"]`);await press('.discard-ok');continue}
    if(s.playable.length)await play(s.playable[0]);else await press('#end-turn');
    await page.waitForTimeout(20);
  }
  await page.locator('#result').waitFor({state:'visible'});await snapshot('result');
  const final=await state();const used=await page.evaluate(()=>window.__uiSmokeCards);
  const values=await page.locator('#result-stats dd').allTextContents();
  assert.equal(Number(values[0]),final.turn,'結果の手番数がGameと一致');
  assert.equal(Number(values[3]),used,'結果の使用カード数が実イベントと一致');
  assert.ok(used>0);assert.ok(await page.locator('#rematch').isEnabled());
  assert.ok(await page.locator('#rematch').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight && rect.height >= 44;
  }), '再戦がスクロールなしで押せる');
  await page.evaluate(()=>{window.__uiSmokePrevious=castlefield.game()});await press('#rematch');
  await page.waitForFunction(()=>Boolean(castlefield.game())&&castlefield.game()!==window.__uiSmokePrevious&&castlefield.game().getState(null).phase!=='gameOver');
  assert.deepEqual(errors,[],'コンソールとページにエラーがない');assert.deepEqual(warnings,[],'描画の同期警告がない');
  const report={viewport:`${viewport.width}x${viewport.height}`,deployed,ended,turns:final.turn,cards:used,errors,warnings,rematch:true};
  writeFileSync(resolve(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){
  if(page)await snapshot('failure').catch(()=>{});
  writeFileSync(resolve(artifacts,'failure.json'),JSON.stringify({error:String(error),errors,warnings,serverLog},null,2)+'\n');
  console.error(error);process.exitCode=1;
}finally{await browser?.close();server?.kill()}
