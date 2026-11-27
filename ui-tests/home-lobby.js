// UIの公開操作で、ホーム・準備・デッキ・4陣営を確認する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const { chromium }=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL ?? 'http://127.0.0.1:8000/';
const dir=new URL('./artifacts/home-lobby/',import.meta.url);mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({...(process.env.UI_TEST_CHROMIUM?{executablePath:process.env.UI_TEST_CHROMIUM}:{})});
const errors=[],report=[];
const ready=async(page)=>{
  await page.locator('#home:not([hidden]) .home-tabbar[aria-orientation]').waitFor();
  await page.locator('#home .home-arena').evaluate(im=>im.decode());
  await page.evaluate(async()=>{await document.fonts.ready;const visible=[...document.querySelectorAll('#home img')].filter(im=>im.getBoundingClientRect().width>0&&im.getBoundingClientRect().height>0);await Promise.race([Promise.all(visible.map(im=>im.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,3000))]);});
};
const shot=async(page,name)=>{await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:new URL(name+'.png',dir).pathname});};
const selectMode=async(page,id)=>{await page.locator('[data-act=chooseMode]').click();await page.locator(`.home-mode[data-mode=${id}]`).click();};
try {
  for(const [width,height] of [[375,812],[390,844],[430,932],[1280,800]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await ready(page);
    const geometry=await page.evaluate(()=>{
      const home=document.querySelector('#home'),b=home.querySelector('.home-start'),r=b.getBoundingClientRect(),n=home.querySelector('.home-tabbar').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      const targets=[...home.querySelectorAll('.home-world,.home-mode-picker,.home-deck-change,.home-start,.home-shortcuts button,.home-tab,.home-icon-btn,.home-player')];
      return {width:home.clientWidth,overflow:home.scrollWidth>home.clientWidth+1,start:{top:r.top,bottom:r.bottom,height:r.height},nav:{top:n.top,bottom:n.bottom},startClickable:b.contains(hit),smallTargets:targets.filter(el=>{const q=el.getBoundingClientRect();return q.width<44||q.height<44}).map(el=>el.className),orientation:home.querySelector('.home-tabbar').getAttribute('aria-orientation')};
    });
    assert.equal(geometry.overflow,false);assert.ok(geometry.start.top>=0&&geometry.start.bottom<=height);assert.equal(geometry.startClickable,true);
    if(width<1000)assert.ok(geometry.start.bottom<=geometry.nav.top,'開始がナビに隠れない');
    assert.deepEqual(geometry.smallTargets,[],'主要操作のタップ領域は44px以上');
    await shot(page,`home-${width}`);
    const vertical=width>=1000;assert.equal(geometry.orientation,vertical?'vertical':'horizontal');
    await page.locator('.home-tab[data-tab=battle]').focus();await page.keyboard.press(vertical?'ArrowDown':'ArrowRight');
    assert.equal(await page.locator('.home-tab:focus').getAttribute('data-tab'),'shop');
    await page.keyboard.press('Home');assert.equal(await page.locator('.home-tab:focus').getAttribute('data-tab'),'deck');
    await page.keyboard.press('End');assert.equal(await page.locator('.home-tab:focus').getAttribute('data-tab'),'menu');
    for(const id of ['deck','gacha','shop','menu','battle']) {
      await page.locator(`.home-tab[data-tab=${id}]`).click();
      assert.equal(await page.locator('#home .home-page:visible').count(),1);
      assert.equal(await page.locator(`#home-page-${id}`).getAttribute('aria-labelledby'),`home-tab-${id}`);
      if(width===390)await shot(page,'tab-'+id);
      if(id!=='battle'&&await page.locator(`#home-page-${id} button:visible`).count()) {
        const last=page.locator(`#home-page-${id} button:visible`).last();
        await last.scrollIntoViewIfNeeded();
        assert.ok(await last.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit)}),`${id}: 下端の操作もナビに隠れず押せる`);
      }

    }
    await page.locator('[data-act=chooseMode]').click();
    await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement.closest('#home-mode-sheet')!==null));
    if(width===390)await shot(page,'mode-sheet');
    await page.keyboard.press('Escape');assert.ok(await page.locator('[data-act=chooseMode]').evaluate(el=>el===document.activeElement));
    await selectMode(page,'local');assert.match(await page.locator('[data-part=modeName]').innerText(),/同じ端末/);
    assert.ok(await page.locator('.home-match-options').isVisible());assert.ok(await page.locator('.home-cpu').isHidden());
    if(width===390)await shot(page,'local-setup');
    await selectMode(page,'online');assert.ok(await page.locator('#title-form').isVisible());
    await selectMode(page,'solo');await page.locator('.cpu-choice[data-level=hard]').click();assert.ok(await page.locator('#home:not([hidden])').isVisible());
    if(width===390)await shot(page,'solo-setup');
    await page.locator('[data-act=chooseDeck]').first().click();assert.equal(await page.locator('.home-deck-choice[data-choose-slot]').count(),4);
    if(width===390)await shot(page,'deck-sheet');await page.keyboard.press('Escape');
    await page.locator('.home-shortcuts [data-act=catalog]').click();await page.locator('#card-guide:not([hidden])').waitFor();
    await page.locator('.guide-query input').fill('歩兵');assert.ok(await page.locator('.guide-card').count()>0);
    if(width===390)await shot(page,'catalog');await page.getByRole('button',{name:'一覧を閉じる'}).click();
    await page.locator('.home-tab[data-tab=menu]').click();assert.equal(await page.locator('#home-page-menu .home-tile').count(),9);
    if(width===390)await shot(page,'menu');
    await page.locator('.home-tab[data-tab=menu]').click();await page.locator('.home-tile[data-id=settings]').click();
    await page.locator('#settings:not([hidden])').waitFor();if(width===390)await shot(page,'settings');await page.keyboard.press('Escape');
    report.push({width,height,...geometry,normalFlows:true,keyboard:true,nativeSheetFocus:true});
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const url=new URL(base);url.search='?home=1&debug=1&field3d=2d&fx=lite&seed=8';await page.goto(url.href);await ready(page);
  await page.locator('.home-world[data-ruleset=factions]').click();await ready(page);
  assert.equal(new URL(page.url()).searchParams.get('mode'),'factions');
  assert.equal(await page.locator('.home-faction-chip[data-faction-quick]').count(),4);
  await shot(page,'faction-choice');await page.locator('.home-faction-chip[data-faction-quick=dragon]').click();
  assert.equal(await page.locator('[data-faction-quick=dragon]').getAttribute('aria-pressed'),'true');
await shot(page,'factions-home');
  await page.locator('[data-act=chooseMode]').click();assert.equal(await page.locator('.home-mode[data-mode=online]').isDisabled(),false,'4陣営でもカジュアル対戦（オンライン）を選べる');await page.locator('.home-mode[data-mode=solo]').click();
  await page.locator('.cpu-choice[data-level=hard]').click();await page.locator('.home-start').click();
  await page.waitForFunction(()=>Boolean(window.castlefield?.game()));
  const state=await page.evaluate(()=>{const id=document.querySelector('#app').dataset.viewer,s=castlefield.game().getState(id),p=s.players[id];return {id,deckId:p.deckId,hand:p.hand.map(c=>c.type),opponents:Object.entries(s.players).filter(([pid])=>pid!==id).map(([,p])=>p.deckId)}});
  assert.equal(state.deckId,'dragon');assert.ok(state.hand.every(c=>c.startsWith('fac_dragon_')));assert.ok(state.opponents.some(d=>d!=='dragon'));
  await page.locator('#hand .card').first().waitFor();await shot(page,'factions-battle');
  await context.close();
  // 初期化後に別の保存枠を選び、準備と実際の山札が一致することを確かめる。
  console.log('viewports and faction flow complete');
  const presets=JSON.parse(readFileSync(new URL('../data/decks.json',import.meta.url),'utf8'));
  const deckContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  await deckContext.route('**/api/me',r=>r.fulfill({json:{ok:false}}));
  await deckContext.addInitScript((state)=>localStorage.setItem('cf-mydecks-v2',JSON.stringify(state)),{active:0,slots:[{name:'バランス枠',list:presets.costBalance.cards},{name:'突撃枠',list:presets.costAssault.cards},null,null]});
  const deckPage=await deckContext.newPage();deckPage.on('pageerror',e=>errors.push(e.message));
  const deckUrl=new URL(base);deckUrl.search='?home=1&debug=1&field3d=2d&fx=lite&seed=8';await deckPage.goto(deckUrl.href);await ready(deckPage);console.log('deck fixture ready');
  await deckPage.locator('[data-act=chooseDeck]').first().click();await deckPage.locator('[data-choose-slot="1"]').click();
  assert.equal(await deckPage.locator('.home-deckpanel-name').innerText(),'突撃枠');console.log('deck selected');
  await selectMode(deckPage,'local');await deckPage.locator('.home-start').click();
await deckPage.waitForFunction(()=>Boolean(window.castlefield?.game()));
  const actualDeck=await deckPage.evaluate(()=>{const g=castlefield.game(),p=g.pileOf('p1'),cards=[...p.deck,...p.discard,...p.exhausted,...g.getState('p1').players.p1.hand];return cards.reduce((map,c)=>(map[c.type]=(map[c.type]??0)+1,map),{})});
  assert.deepEqual(actualDeck,presets.costAssault.cards,'ホームで選んだ枠のカードが実際の山札になる');
  console.log('actual deck verified');await deckContext.close();
  // 決まりに合わない保存デッキ（見本を使用中）も削除できる。コピーは保存したデッキの中身を写す（#192 の退行）
  const badList={infantry:1};
  const badContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  await badContext.route('**/api/me',r=>r.fulfill({json:{ok:false}}));
  await badContext.addInitScript((list)=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('cf-mydecks-v2',JSON.stringify({active:0,slots:[{name:'こわれ枠',list},null,null,null]}));}},badList);
  const badPage=await badContext.newPage();badPage.on('pageerror',e=>errors.push(e.message));badPage.on('dialog',d=>d.accept());
  const badUrl=new URL(base);badUrl.search='?home=1&field3d=2d&fx=lite';await badPage.goto(badUrl.href);await ready(badPage);
  await badPage.locator('.home-tab[data-tab=deck]').click();
  assert.match(await badPage.locator('.home-deck-state').first().innerText(),/見本を使用中/);
  await badPage.locator('[data-act=deckCopy]').click();
  const afterCopy=await badPage.evaluate(()=>JSON.parse(localStorage.getItem('cf-mydecks-v2')));
  assert.equal(afterCopy.slots[1]?.name,'こわれ枠のコピー');assert.deepEqual(afterCopy.slots[1]?.list,badList,'コピーは保存したデッキの中身');
  await badPage.locator('[data-act=deckDelete]').click();
  const afterDelete=await badPage.evaluate(()=>JSON.parse(localStorage.getItem('cf-mydecks-v2')));
  // コピーすると写した枠が使うデッキになる（saveMyDeck）。そのコピー（決まりに合わない）を消す
  assert.equal(afterCopy.active,1);assert.equal(afterDelete.slots[1],null,'決まりに合わない保存デッキを削除できる');assert.equal(afterDelete.slots[0]?.name,'こわれ枠');
  console.log('invalid saved deck: copy and delete verified');await badContext.close();
  assert.deepEqual(errors,[],'ページエラーなし');
  writeFileSync(new URL('report.json',dir),JSON.stringify({report,factionFlow:state,selectedDeckMatches:true,errors},null,2)+'\n');
  console.log(JSON.stringify({viewports:report.length,factionFlow:state,errors}));
}finally{await browser.close()}
