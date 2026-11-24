// ホーム・共通UIのアイコン。SVGを使わず、画像生成した星雲×オーロラ透過WebPを使用する。
const ICON_FILES = {
  profile: 'icon-profile',
  deck: 'icon-deck',
  rank: 'icon-rank',
  gacha: 'icon-gacha',
  settings: 'icon-settings',
  catalog: 'icon-catalog',
  help: 'icon-help',
  more: 'icon-more',
  arrow: 'icon-arrow',
  down: 'icon-down',
  close: 'icon-close',
  check: 'icon-check',
  solo: 'icon-solo',
  online: 'icon-online',
  local: 'icon-local',
  ranking: 'icon-ranking',
  mission: 'icon-mission',
  friend: 'icon-friend',
  shop: 'icon-shop',
  skin: 'icon-skin',
  notice: 'icon-notice',
  edit: 'icon-edit',
  crown: 'icon-crown',
  rates: 'icon-rates',
  return: 'icon-return',
  surrender: 'icon-surrender',
};

export const homeIcon = (id, size = 24) => {
  const file = ICON_FILES[id] ?? ICON_FILES.more;
  return `<img class="cosmic-icon cosmic-icon-${id}" src="assets/ui/cosmic/${file}.webp" width="${size}" height="${size}" alt="" aria-hidden="true" decoding="async" draggable="false">`;
};
