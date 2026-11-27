// 入口はホームだけ（タイトルのメニューはなくした）。ホームから各画面へ進む、人が触るのと同じ道すじの部品。
export async function toTitle(page) { // 名前は昔のまま：ホームが出るのを待つ
  await page.locator('#home:not([hidden])').waitFor();
}
/** ホームでモード（solo / local / online）を選んで設定を選ぶ（開始は呼び出し側で必要な入力を済ませてから押す） */
export async function openMode(page, mode) {
  await toTitle(page);
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home [data-act="chooseMode"]').click(); await page.locator(`#home .home-mode[data-mode="${mode}"]`).click();
}
/** ホームのメニュー → アカウント管理 */
export async function openAccountFromHome(page) {
  await toTitle(page);
  await page.click('#home .home-tab[data-tab=menu]');
  await page.click('#home .home-tile[data-id=account]');
}

/** 難易度を必要なときだけ開き、選択後はコンパクト表示へ戻す。 */
export async function selectDifficulty(page, level, touch = false) {
  const choice=page.locator(`.cpu-choice[data-level="${level}"]`);
  if(!await choice.isVisible()) await page.locator('.home-cpu summary')[touch?'tap':'click']();
  await choice[touch?'tap':'click']();
}
