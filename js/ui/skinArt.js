// 画像がある景品だけを対応づける。所持と装備はサーバーの装備状態を参照する。
/** ランク報酬の見た目がそろっているランク（data/ranks.json の id。低い順） */
export const RANK_IDS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'];

const items = new Set([
  'unit_crimson', 'unit_forest', 'unit_frost', 'unit_royal', 'unit_gold', 'unit_shadow',
  'castle_crimson', 'castle_forest', 'castle_frost', 'castle_gold', 'castle_shadow',
  'back_crimson', 'back_forest', 'back_royal', 'back_gold',
  ...RANK_IDS.map((r) => `back_rank_${r}`),
  'fx_emerald', 'fx_violet', 'fx_azure', 'fx_gold',
  'win_gold', 'win_sakura', 'win_aurora',
  'icon_paladin', 'icon_giant', 'icon_scout', 'icon_sniper', 'icon_sage', 'icon_dragon-knight',
  'title_rookie', 'title_hunter', 'title_wall', 'title_lucky', 'title_legend',
]);

// 裏面は、金の飾り・紋章だけを切り抜いた地図（-raised.png）があれば、拡大表示で手前に浮かせる
const raised = new Set(['back_crimson', 'back_forest', 'back_royal', 'back_gold', ...RANK_IDS.map((r) => `back_rank_${r}`)]);
export const skinRaised = (id) => (raised.has(id) ? `assets/skins/${id.replaceAll('_', '-')}-raised.png` : null);

export function skinArt(id) {
  return items.has(id) ? `assets/skins/${id.replaceAll('_', '-')}.png` : null;
}

/** ランク報酬のカードスキンの表（枠）。窓・文字枠は共通の位置。凹凸の地図は assets/cards/relief/ にある */
export const rankSkinFront = (rank) => (RANK_IDS.includes(rank) ? `cards/frame-skin-${rank}.png` : null);
/** ランク報酬のカードスキンの裏と、浮かせる部分の地図 */
export const rankSkinBack = (rank) => (RANK_IDS.includes(rank)
  ? { art: `assets/skins/back-rank-${rank}.png`, raised: `assets/skins/back-rank-${rank}-raised.png` } : null);
