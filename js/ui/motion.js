// 兵士・魔物の種類ごとの「動きの型」。待機・歩き方（css/motion.css）と、攻撃のしかた（Animations.js）を決める。
// 絵は1枚なので、体重のかけ方・予備動作・伸び縮みで種類のちがいを出す。
// カード・魔物を増やしたら、ここに同じキーで足す（なければ 'foot' / 'imp' になる）。

/** 兵士：カード種類 → 動きの型（弓兵・魔法使いは role で決まる） */
const SOLDIER_MOTION = {
  infantry: 'foot', spearman: 'lancer', heavy: 'heavy', giant: 'giant', hero: 'hero',
  scout: 'rider', cavalry: 'rider', knight: 'rider', paladin: 'rider', dragonKnight: 'rider',
};

/** 魔物：種類 → 動きの型 */
const MONSTER_MOTION = {
  slime: 'jelly', bat: 'flyer', ghost: 'specter', vampire: 'specter',
  goblin: 'imp', skeleton: 'bones', mimic: 'mimic',
  golem: 'titan', treant: 'tree',
  dragon: 'beast', demon: 'beast', demonKing: 'lord',
};

export function soldierMotion(type, def) {
  if (def?.role === 'archer') return 'archer';
  if (def?.role === 'mage') return 'mage';
  return SOLDIER_MOTION[type] ?? 'foot';
}

export function monsterMotion(type) {
  return MONSTER_MOTION[type] ?? 'imp';
}

/**
 * 攻撃のしかた。
 * style：動きと当たったときの印 / weight：重さ（時間・揺れ・ノックバックが大きくなる）
 * reach：相手までの距離のうち、どこまで踏み込むか / time：長さの倍率
 */
const ATTACK = {
  foot:    { style: 'slash',  weight: 1,   reach: .42, time: 1 },
  lancer:  { style: 'thrust', weight: 1,   reach: .55, time: .95 },
  heavy:   { style: 'smash',  weight: 1.5, reach: .40, time: 1.35 },
  giant:   { style: 'smash',  weight: 2,   reach: .45, time: 1.6 },
  hero:    { style: 'cross',  weight: 1.6, reach: .50, time: 1.45 },
  rider:   { style: 'charge', weight: 1.3, reach: .62, time: 1.1 },
  archer:  { style: 'bump',   weight: .7,  reach: .30, time: .9 },
  mage:    { style: 'bump',   weight: .7,  reach: .30, time: .9 },
  jelly:   { style: 'slam',   weight: 1,   reach: .45, time: 1.2 },
  flyer:   { style: 'bump',   weight: .7,  reach: .55, time: .85 },
  specter: { style: 'claw',   weight: 1.1, reach: .45, time: 1.1 },
  imp:     { style: 'bump',   weight: .9,  reach: .40, time: .9 },
  bones:   { style: 'slash',  weight: 1,   reach: .42, time: 1 },
  mimic:   { style: 'slam',   weight: 1.2, reach: .40, time: 1.1 },
  titan:   { style: 'smash',  weight: 2,   reach: .40, time: 1.6 },
  tree:    { style: 'smash',  weight: 1.5, reach: .35, time: 1.4 },
  beast:   { style: 'claw',   weight: 1.6, reach: .50, time: 1.25 },
  lord:    { style: 'claw',   weight: 2.2, reach: .50, time: 1.5 },
};

export function attackOf(motion) {
  return ATTACK[motion] ?? ATTACK.foot;
}

/**
 * 攻撃の動き（token にかける keyframes）と、当たる瞬間（0〜1。2回当たる型は配列）。
 * (ux, uy) は相手への向き、r は踏み込む距離(px)。
 */
export function attackFrames(style, ux, uy, r) {
  const t = (k, extra = '') => `translate(${(ux * k).toFixed(1)}px, ${(uy * k).toFixed(1)}px) ${extra}`.trim();
  switch (style) {
    case 'thrust': return { hits: [.46], frames: [
      { transform: 'none' },
      { transform: t(-11, 'scale(1.1, .9)'), offset: .3, easing: 'cubic-bezier(.7, 0, 1, .6)' },
      { transform: t(r, 'scale(.9, 1.14)'), offset: .46 },
      { transform: t(r * .95, 'scale(.96, 1.06)'), offset: .62, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    case 'charge': return { hits: [.52], frames: [
      { transform: 'none' },
      { transform: t(-10, 'rotate(-13deg) scale(1.06)'), offset: .3, easing: 'cubic-bezier(.7, 0, 1, .5)' },
      { transform: t(r, 'rotate(9deg) scale(.95, 1.08)'), offset: .52 },
      { transform: t(r * .8, 'rotate(-5deg)'), offset: .68, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    case 'smash': return { hits: [.56], frames: [
      { transform: 'none' },
      { transform: `${t(-5)} translateY(-15px) scale(1.14) rotate(-7deg)`, offset: .4, easing: 'cubic-bezier(.8, 0, 1, .5)' },
      { transform: t(r, 'scale(1.2, .8) rotate(6deg)'), offset: .56 },
      { transform: t(r, 'scale(1.1, .9)'), offset: .72, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    case 'cross': return { hits: [.28, .62], frames: [
      { transform: 'none' },
      { transform: t(-7, 'rotate(-12deg) scale(1.08, .93)'), offset: .14, easing: 'ease-in' },
      { transform: t(r, 'rotate(16deg)'), offset: .28 },
      { transform: t(r * .35, 'rotate(14deg) scale(1.08, .93)'), offset: .46, easing: 'ease-in' },
      { transform: t(r * 1.1, 'rotate(-18deg) scale(.95, 1.08)'), offset: .62 },
      { transform: t(r, 'rotate(-12deg)'), offset: .76, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    case 'slam': return { hits: [.58], frames: [
      { transform: 'none' },
      { transform: 'scale(1.28, .68)', offset: .28, easing: 'ease-out' },
      { transform: `${t(r * .5)} translateY(-14px) scale(.84, 1.22)`, offset: .46, easing: 'ease-in' },
      { transform: t(r, 'scale(1.3, .7)'), offset: .58 },
      { transform: t(r * .6, 'scale(.94, 1.08)'), offset: .76, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    case 'claw': return { hits: [.5], frames: [
      { transform: 'none' },
      { transform: t(-9, 'rotate(-9deg) scale(1.12)'), offset: .32, easing: 'cubic-bezier(.7, 0, 1, .5)' },
      { transform: t(r, 'rotate(12deg) scale(1.08)'), offset: .5 },
      { transform: t(r * .85, 'rotate(8deg)'), offset: .66, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    case 'bump': return { hits: [.5], frames: [
      { transform: 'none' },
      { transform: t(-6, 'scale(1.06, .94)'), offset: .3, easing: 'ease-in' },
      { transform: t(r * .8), offset: .5, easing: 'ease-out' },
      { transform: 'none' },
    ] };
    default: return { hits: [.48], frames: [ // slash
      { transform: 'none' },
      { transform: t(-8, 'rotate(-11deg) scale(1.08, .92)'), offset: .28, easing: 'cubic-bezier(.7, 0, 1, .6)' },
      { transform: t(r, 'rotate(15deg) scale(.95, 1.07)'), offset: .48 },
      { transform: t(r * .9, 'rotate(18deg)'), offset: .62, easing: 'ease-out' },
      { transform: 'none' },
    ] };
  }
}

const INK = '#4a2e1a';
const P = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
const wrap = (body) => `<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const CRESCENT = 'M-40 22 Q0 -52 40 22 Q0 -12 -40 22 Z';
const STAR = 'M0 -44 L9 -15 L38 -24 L18 -2 L44 12 L14 14 L20 42 L0 22 L-20 42 L-14 14 L-44 12 L-18 -2 L-38 -24 L-9 -15 Z';

/** 当たった瞬間の印（太いこげ茶の輪郭線で、絵柄に合わせる）。右向き（0度）が攻撃の向き */
export function impactSvg(style, color = '#fff') {
  switch (style) {
    case 'thrust': return wrap(`<path d="M-48 0 L8 -8 L48 0 L8 8 Z" fill="${color}" ${P}/><path d="M-30 -14 L6 -17 M-30 14 L6 17" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity=".85"/>`);
    case 'claw': return wrap([-20, 0, 20].map((y) => `<path d="M-36 ${y - 12} Q4 ${y - 8} 36 ${y + 14} Q0 ${y + 2} -36 ${y - 12} Z" fill="${color}" ${P}/>`).join(''));
    case 'cross': return wrap(`<g transform="rotate(90)"><path d="${CRESCENT}" fill="${color}" ${P}/></g>`);
    case 'star': return wrap(`<path d="${STAR}" fill="${color}" ${P}/><circle r="11" fill="#fff"/>`);
    default: return wrap(`<g transform="rotate(90)"><path d="${CRESCENT}" fill="${color}" ${P}/></g>`);
  }
}
