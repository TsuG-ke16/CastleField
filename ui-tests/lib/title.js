// 入口はホームだけ（タイトルのメニューはなくした）。ホームから各画面へ進む、人が触るのと同じ道すじの部品。
export async function toTitle(page) { // 名前は昔のまま：ホームが出るのを待つ
  await page.locator('#home:not([hidden])').waitFor();
}
/** ホームでモード（solo / local / online）を選んで「対戦開始」を押す（強さの画面・同じ端末の設定・合言葉の入力が出る） */
export async function openMode(page, mode) {
  await toTitle(page);
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home [data-act="chooseMode"]').click(); await page.locator(`#home .home-mode[data-mode="${mode}"]`).click();
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home [data-act="start"]').click();
}
/** ホームの設定 → アカウント */
export async function openAccountFromHome(page) {
  await toTitle(page);
  await page.click('#home .home-tab[data-tab=settings]'); await page.locator('#home .home-tile[data-id="settings"]').click();
  await page.locator('.set-account-btn').click();
}
