// Production UI routes: no Game mutation, no rules or effect changes.
import {createRequire} from 'node:module';import {mkdirSync,writeFileSync} from 'node:fs';
const{chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.UI_TEST_URL??'http://127.0.0.1:3000';const out=new URL(process.env.UI_REVIEW_DIR??'../assets/review/kingdom-fantasy-v2/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.UI_TEST_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});const report=[];
try{for(const[device,width,height]of[['pc',1440,900],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const home=async()=>{await page.goto(base+'/?fx=lite');await page.locator('#home:not([hidden])').waitFor();await page.waitForTimeout(350)};
 const shot=async name=>{await page.locator('img:visible').evaluateAll(es=>Promise.race([Promise.all(es.filter(e=>e.getBoundingClientRect().top<innerHeight&&e.getBoundingClientRect().bottom>0).map(e=>e.decode?.().catch(()=>{}))),new Promise(r=>setTimeout(r,2000))]));await page.screenshot({path:out+device+'-'+name+'.png',fullPage:true});report.push({device,screen:name,errors:[...errors]});console.log(device,name)};
 await home();await shot('home');
 for(const tab of ['account','deck','shop','settings']){await page.click(`#home .home-tab[data-tab=${tab}]`);await shot(tab)}
 await home();await page.click('#home [data-act=chooseMode]');await shot('mode-dialog');await page.click('#home .home-mode[data-mode=solo]');await page.click('#home [data-act=start]');await page.locator('.level[data-level=hard]').waitFor();await shot('cpu-preparation');
 await page.locator('.local-options').evaluate(el=>el.open=true);await shot('preparation-options');
 await home();await page.click('#home .home-tab[data-tab=deck]');await page.click('#home .home-deck-editbtn');await page.locator('#deck-editor').waitFor({state:'visible'});await shot('deck-editor');
 await home();await page.click('#home [data-act=catalog]');await page.locator('#card-guide').waitFor({state:'visible'});await shot('catalog');
 await home();await page.click('#home .home-tab[data-tab=account]');await page.click('#home [data-act=account]');await page.locator('#account').waitFor({state:'visible'});await shot('account-dialog');
 await home();await page.click('#home .home-tab[data-tab=settings]');await page.click('#home .home-tile[data-id=settings]');await page.locator('#settings').waitFor({state:'visible'});await shot('settings-dialog');
 await home();await page.click('#home [data-act=more]');await shot('more-dialog');
 await home();await page.click('#home .home-tab[data-tab=shop]');await page.click('#home [data-act=gacha]');await shot('gacha-dialog');
 await home();await page.click('#home .home-tab[data-tab=settings]');await page.click('#home [data-act=help]');await page.locator('#help').waitFor({state:'visible'});await shot('help-dialog');
 await context.close();}
 writeFileSync(out+'screens.json',JSON.stringify(report,null,2));}finally{await browser.close()}
