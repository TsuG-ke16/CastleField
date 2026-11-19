// 画像がある景品だけを対応づける。所持と装備はサーバーの装備状態を参照する。
const items = new Set([
  'unit_crimson', 'unit_forest', 'unit_frost', 'unit_royal', 'unit_gold', 'unit_shadow',
  'castle_crimson', 'castle_forest', 'castle_frost', 'castle_gold', 'castle_shadow',
  'back_crimson', 'back_forest', 'back_royal', 'back_gold',
  'fx_emerald', 'fx_violet', 'fx_azure', 'fx_gold',
  'win_gold', 'win_sakura', 'win_aurora',
  'icon_paladin', 'icon_giant', 'icon_scout', 'icon_sniper', 'icon_sage', 'icon_dragon-knight',
  'title_rookie', 'title_hunter', 'title_wall', 'title_lucky', 'title_legend',
]);

export function skinArt(id) {
  return items.has(id) ? `assets/skins/${id.replace('_', '-')}.png` : null;
}
