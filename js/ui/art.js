// 画像素材（PNG・WebP）。SVGは一切使わず、画像生成した本番素材のみを使用する。
// - どの種類にどの絵を使うかは、ここで決める（data/ には画像の情報を入れない）
// - カード・魔物を増やしたら、CARD_TYPES 等に追加する。未登録時はテキスト代替になる

import { factionCardPath, factionUnitPath } from './factionArt.js';

/** プレイヤーの色（p1 は空色、p2 は夕焼けオレンジ） */
export const PLAYER_COLORS = {
  blue: { main: '#4da3e8', light: '#bfe3fb', dark: '#2a6cab' },
  orange: { main: '#f5923e', light: '#ffd9b0', dark: '#c05a1c' },
};

export function colorOf(playerId) {
  return Number(String(playerId).slice(1)) % 2 === 0 ? 'orange' : 'blue';
}

// 新しい兵士14種は、見本を添付して画像生成で作った本番PNGだけを使用。
const NEW_SOLDIER_TYPES = new Set([
  'scout', 'cavalry', 'paladin', 'dragonKnight',
  'apprenticeArcher', 'archer', 'longbowman', 'sniper', 'skyArcher',
  'apprenticeMage', 'mage', 'sorcerer', 'archmage', 'sage',
]);

/** 道の脇の木（SVG不使用・背景絵に統合） */
export function treeArt() {
  return '<span class="tree-art" aria-hidden="true"></span>';
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const CARD_TYPES = new Set([
  'galeForce', 'chainBlast', 'ignitionBurst', 'shieldBlast', 'purifyFlare', 'moonrise', 'dawnbreak', 'assassin',
  'attackDice', 'healDice', 'manaDice', 'coinDice', 'shieldDice', 'buffDice', 'randomDice', 'godDice',
  'manaRaid', 'lifeSteal', 'desperateShot', 'powderKeg', 'antidote', 'weatherCall',
  'manaShard', 'manaDrop', 'manaCrystal', 'manaSpring', 'worldTreeDew', 'adapt',
  ...NEW_SOLDIER_TYPES,
  'infantry', 'knight', 'fireball', 'thunder', 'heal', 'flameSword', 'waterSpear', 'windBow', 'earthHammer',
  'shield', 'wall', 'poisonMist', 'frostBreath', 'spearman', 'heavy', 'giant', 'meteor', 'bigThunder',
  'venom', 'deepFreeze', 'ironSword', 'bigShield', 'sandbag', 'reflect', 'decoy', 'blessing', 'thief',
  'minorHeal', 'toxicRain', 'glacier', 'bolt',
  'fireSpirit', 'greatFireSpirit', 'waterSpirit', 'greatWaterSpirit', 'windSpirit', 'greatWindSpirit',
  'earthSpirit', 'greatEarthSpirit',
  'hero', 'inferno', 'starfall', 'apocalypse', 'raijin', 'judgment', 'greatHeal', 'holyLight', 'goddess',
  'deathMist', 'plague', 'absoluteZero', 'frozenWorld', 'magicSword', 'holySword', 'godSword',
  'steelShield', 'holyShield', 'godShield', 'stoneWall', 'gate', 'barrier',
  'fireKing', 'waterKing', 'windKing', 'earthKing', 'treasure', 'goldVein', 'kingTreasure',
]);
const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const READY = new Set();
export const isAssetReady = (path) => READY.has(path);

const TITLE_ASSETS = [
  'ui/cosmic/cosmic-magic-crest.webp',
  'ui/cosmic/cta-aurora-primary.webp',
  'ui/cosmic/btn-nebula-glass.webp',
  'ui/cosmic/laurel-aurora.webp',
  'ui/cosmic/rank-unranked.webp',
  'ui/cosmic/icon-profile.webp',
  'ui/cosmic/icon-deck.webp',
  'ui/cosmic/icon-rank.webp',
  'ui/cosmic/icon-gacha.webp',
  'ui/cosmic/icon-settings.webp',
  'ui/cosmic/icon-catalog.webp',
  'ui/cosmic/icon-help.webp',
  'ui/cosmic/icon-solo.webp',
  'ui/cosmic/icon-online.webp',
  'ui/cosmic/icon-local.webp',
  'ui/cosmic/icon-notice.webp',
  'ui/cosmic/icon-arrow.webp',
  'ui/cosmic/icon-down.webp',
  'ui/cosmic/icon-close.webp',
  'ui/cosmic/icon-check.webp',
  'ui/cosmic/icon-more.webp',
  'ui/icon-coin.png',
  'ui/card-back.png',
];

export async function preloadAssets(timeoutMs = 8000, onProgress = null, { phase = 'game' } = {}) {
  let paths = [...TITLE_ASSETS];
  if (phase !== 'title') {
    try {
      const res = await fetch('assets/asset-manifest.json');
      if (res.ok) paths = [...new Set([...paths, ...Object.keys(await res.json())])].filter((p) => p !== 'style-reference.png');
    } catch {}
  }
  paths = paths.filter((p) => !READY.has(p));
  let done = 0;
  let index = 0;
  const load = (path) => new Promise((resolve) => {
    const img = new Image();
    let ended = false;
    const finish = (ok) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (ok) READY.add(path);
      done++;
      onProgress?.(done, paths.length);
      resolve();
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = async () => { try { await img.decode(); } catch {} finish(true); };
    img.onerror = () => finish(false);
    img.src = `assets/${path}`;
  });
  await Promise.all(Array.from({ length: Math.min(12, paths.length) }, async () => {
    while (index < paths.length) await load(paths[index++]);
  }));
}

export function imageArt(path, fallback = '', cls = '') {
  return `<span class="asset-art ${READY.has(path) ? 'asset-loaded ' : ''}${cls}" aria-hidden="true"><span class="asset-wait">${fallback || '…'}</span><img class="asset-image" src="assets/${path}" alt="" decoding="async" draggable="false"></span>`;
}

document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('asset-image')) {
    if (e.target.parentElement.classList.contains('adapt-asset') || e.target.parentElement.classList.contains('icon-asset')) {
      e.target.parentElement.classList.remove('asset-loaded');
    }
    const wait = e.target.parentElement.querySelector('.asset-wait');
    if (wait && wait.textContent === '…') wait.textContent = '画像なし';
  }
}, true);

// loadはバブルしないためキャプチャする。インラインハンドラを使わない。
document.addEventListener('load', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('asset-image')) {
    e.target.parentElement.classList.add('asset-loaded');
  }
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('card-frame')) {
    e.target.parentElement.classList.add('has-frame');
  }
}, true);

const WEATHER_ICONS = {
  sunny: 'sunny', rain: 'rain', heavyRain: 'heavy-rain', fog: 'fog',
  storm: 'storm', sandstorm: 'sandstorm', coinRain: 'coin-rain',
};

export function weatherIcon(type, glyph = '🌤️') {
  const iconEl = document.createElement('span');
  iconEl.className = 'weather-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  if (Object.hasOwn(WEATHER_ICONS, type)) {
    iconEl.innerHTML = imageArt(`ui/weather-${WEATHER_ICONS[type]}.png`, '', 'icon-asset')
      .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${escapeText(glyph)}</span>`);
  } else iconEl.textContent = glyph;
  return iconEl;
}

function generatedSoldierPng(path, cls, name) {
  return `<span class="asset-art asset-loaded ${cls}"><img class="asset-image" src="assets/${path}" alt="${escapeText(name)}" decoding="sync" draggable="false"></span>`;
}

const textBadgeFallback = (name, cls) =>
  `<span class="art ${cls} art-text-fallback" aria-hidden="true">${escapeText(String(name || '?').charAt(0))}</span>`;

/** 魔物の駒は、仲間になった姿の専用イラストを使う */
const beastOf = (type) => (typeof type === 'string' && type.startsWith('beast_') ? type.slice(6) : null);
function beastArt(beast, name, cls) {
  const fallback = monsterArt(beast, name);
  return imageArt(`cards/card-beast-${kebab(beast)}.png`, '', `art ${cls} icon-asset`)
    .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${fallback}</span>`);
}

export function cardArt(type, color = 'blue', name = '') {
  const factionPath = factionCardPath(type);
  if (factionPath) return imageArt(factionPath, '', 'art card-art-img');
  if (beastOf(type)) return beastArt(beastOf(type), name, 'card-art-img');
  if (NEW_SOLDIER_TYPES.has(type)) return generatedSoldierPng(`cards/card-${kebab(type)}.png`, 'art card-art-img', name);
  const fallback = textBadgeFallback(name || type, 'card-art-img');
  if (type === 'adapt' || type === 'weatherCall') {
    const fallbackClass = type === 'adapt' ? 'adapt-asset' : 'icon-asset';
    return imageArt(`cards/card-${kebab(type)}.png`, '', `art card-art-img ${fallbackClass}`)
      .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${fallback}</span>`);
  }
  return CARD_TYPES.has(type) ? imageArt(`cards/card-${kebab(type)}.png`, '', 'art card-art-img') : fallback;
}

export function unitArt(type, color, name = '') {
  const factionPath = factionUnitPath(type);
  if (factionPath) return imageArt(factionPath, '', 'art unit-art');
  if (beastOf(type)) return beastArt(beastOf(type), name, 'unit-art');
  if (NEW_SOLDIER_TYPES.has(type)) return generatedSoldierPng(`units/${kebab(type)}-${color === 'orange' ? 'orange' : 'blue'}.png`, 'art unit-art', name);
  return ['infantry', 'knight', 'spearman', 'heavy', 'giant', 'hero'].includes(type)
    ? imageArt(`units/${kebab(type)}-${color === 'orange' ? 'orange' : 'blue'}.png`, '', 'art unit-art')
    : textBadgeFallback(name || type, 'unit-art');
}

export function monsterArt(type, name = '') {
  return ['slime', 'goblin', 'dragon', 'bat', 'skeleton', 'golem', 'demon', 'ghost', 'treant', 'mimic', 'vampire', 'demonKing'].includes(type)
    ? imageArt(`units/monster-${kebab(type)}.png`, '', 'art monster-art')
    : textBadgeFallback(name || type, 'monster-art');
}

export function castleArt(color, damage = 0, kind = 'standard') {
  const team = color === 'orange' ? 'orange' : 'blue';
  if (damage >= 4) return imageArt(`castles/castle-${team}-ruined.png`, '', 'art castle-art');
  const stage = Math.max(0, Math.min(3, damage));
  const prefix = ['fortress', 'tower', 'barracks'].includes(kind) ? kind : 'castle';
  return imageArt(`castles/${prefix}-${team}${stage ? `-damaged-${stage}` : ''}.png`, '', 'art castle-art').replace('<span ', `<span data-damage-stage="${stage}" `);
}

export function spiritSprite(element, great = false) {
  return imageArt(`units/${great ? 'great-' : ''}${element}-spirit.png`, '', 'art spirit-art');
}

const PNG_ICONS = new Set([
  'mp', 'luck', 'fire', 'water', 'wind', 'earth', 'heart', 'coin',
  'kind-wild', 'kind-soldier', 'kind-spell', 'kind-weapon', 'kind-defense',
  'rarity-common', 'rarity-uncommon', 'rarity-rare', 'rarity-epic', 'rarity-legendary', 'rarity-special',
]);

const COSMIC_WEBP_ICONS = {
  sword: 'icon-sword',
  boot: 'icon-boot',
  target: 'icon-target',
  shield: 'icon-shield',
  wall: 'icon-wall',
  stone: 'icon-wall',
  skull: 'icon-skull',
  snow: 'icon-snow',
  crown: 'icon-crown',
  hammer: 'icon-hammer',
  sound: 'icon-sound',
  mute: 'icon-mute',
};

export function icon(name, fallbackText = null) {
  if (name === 'card') return imageArt('ui/card-back.png', '', 'ic card-back-icon');
  if (PNG_ICONS.has(name)) {
    const fb = fallbackText === null ? '' : `<span class="icon-text">${escapeText(fallbackText)}</span>`;
    return imageArt(`ui/icon-${name}.png`, '', `ic ic-${name} icon-asset`)
      .replace('<span class="asset-wait">…</span>', fb ? `<span class="asset-fallback">${fb}</span>` : '<span class="asset-fallback"></span>');
  }
  const cosmicFile = COSMIC_WEBP_ICONS[name];
  if (cosmicFile) {
    return `<span class="asset-art asset-loaded ic ic-${name} icon-asset" aria-hidden="true"><img class="asset-image" src="assets/ui/cosmic/${cosmicFile}.webp" alt="" decoding="async" draggable="false"></span>`;
  }
  return `<span class="icon-text ic ic-${escapeText(name)}" aria-hidden="true">${escapeText(fallbackText ?? '')}</span>`;
}
