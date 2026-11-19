// ホームがいつも入口なので、タイトル画面（ひとりで遊ぶ・同じ端末・合言葉・遊び方など）を確かめるテストは、
// ホームの「対戦開始」（ひとりで）→ 強さを選ぶ画面の「戻る」でタイトルへ進む（人が触るのと同じ道すじ）。
export async function toTitle(page) {
  await page.locator('#home:not([hidden])').waitFor();
  await page.locator('#home .home-mode[data-mode="solo"]').click();
  await page.locator('#home [data-act="start"]').click();
  await page.locator('#title-levels:not([hidden])').waitFor();
  await page.locator('#levels-back').click();
  await page.locator('#title-solo').waitFor({ state: 'visible' });
}
