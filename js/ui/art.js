// 絵（SVG）。assets/STYLE.md の絵柄（太いこげ茶の輪郭線・明るい色・2頭身のちびキャラ）に合わせて、コードで描いている。
// - 画像ファイルを読みに行かないので、どこで開いてもすぐ出る（404 も出ない）
// - どの種類にどの絵を使うかは、ここで決める（data/ には画像の情報を入れない）
// - カード・魔物を増やしたら、CARD_ART / MONSTER_ART に同じキーで足す。なければ仮の絵（名前の1文字目）になる

const INK = '#4a2e1a';
const SKIN = '#ffe2c4';
const STEEL = '#cfd8e0';
const STEEL_D = '#9aa8b5';

/** プレイヤーの色（p1 は空色、p2 は夕焼けオレンジ） */
export const PLAYER_COLORS = {
  blue: { main: '#4da3e8', light: '#bfe3fb', dark: '#2a6cab' },
  orange: { main: '#f5923e', light: '#ffd9b0', dark: '#c05a1c' },
};

export function colorOf(playerId) {
  return playerId === 'p2' ? 'orange' : 'blue';
}

const S = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
const svg = (viewBox, body, cls = '', fit = 'xMidYMid meet') =>
  `<svg class="art ${cls}" viewBox="${viewBox}" preserveAspectRatio="${fit}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const face = (cx, cy, s = 1) =>
  `<ellipse cx="${cx - 8 * s}" cy="${cy}" rx="${2.6 * s}" ry="${3.6 * s}" fill="${INK}"/>` +
  `<ellipse cx="${cx + 8 * s}" cy="${cy}" rx="${2.6 * s}" ry="${3.6 * s}" fill="${INK}"/>` +
  `<circle cx="${cx - 14 * s}" cy="${cy + 6 * s}" r="${3.4 * s}" fill="#ff9d9d" opacity=".75"/>` +
  `<circle cx="${cx + 14 * s}" cy="${cy + 6 * s}" r="${3.4 * s}" fill="#ff9d9d" opacity=".75"/>` +
  `<path d="M${cx - 3 * s} ${cy + 7 * s} q${3 * s} ${3 * s} ${6 * s} 0" fill="none" ${S} stroke-width="${2 * s}"/>`;

// ---------- 兵士 ----------

function infantryBody(c) {
  return (
    `<ellipse cx="50" cy="93" rx="26" ry="5" fill="#000" opacity=".18"/>` +
    // 剣
    `<path d="M77 70 L90 34" ${S} stroke-width="9"/><path d="M77 70 L90 34" stroke="#eef3f7" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M70 64 L86 70" ${S} stroke-width="5"/><path d="M70 64 L86 70" stroke="#f2c14e" stroke-width="2" stroke-linecap="round"/>` +
    // 足・体
    `<rect x="35" y="84" width="12" height="9" rx="4" fill="#8a5a32" ${S} stroke-width="3"/>` +
    `<rect x="53" y="84" width="12" height="9" rx="4" fill="#8a5a32" ${S} stroke-width="3"/>` +
    `<path d="M30 86 Q28 60 50 60 Q72 60 70 86 Z" fill="${c.main}" ${S} stroke-width="3.5"/>` +
    `<path d="M33 76 H67" stroke="${c.dark}" stroke-width="4"/>` +
    `<circle cx="74" cy="72" r="5.5" fill="${SKIN}" ${S} stroke-width="3"/>` +
    // 頭・かぶと
    `<circle cx="50" cy="42" r="24" fill="${SKIN}" ${S} stroke-width="3.5"/>` +
    `<path d="M25 42 Q24 15 50 15 Q76 15 75 42 Q50 34 25 42 Z" fill="${STEEL}" ${S} stroke-width="3.5"/>` +
    `<path d="M33 24 Q42 18 52 18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M50 15 Q44 2 54 3 Q62 6 54 15 Z" fill="${c.main}" ${S} stroke-width="3"/>` +
    face(50, 48)
  );
}

function knightBody(c) {
  return (
    `<ellipse cx="50" cy="94" rx="32" ry="5" fill="#000" opacity=".18"/>` +
    // やり
    `<path d="M80 80 L92 14" ${S} stroke-width="7"/><path d="M80 80 L92 14" stroke="#c99a5b" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M92 14 L87 26 L97 25 Z" fill="${STEEL}" ${S} stroke-width="2.5"/>` +
    // 馬
    `<rect x="26" y="80" width="9" height="13" rx="4" fill="#f4ead8" ${S} stroke-width="3"/>` +
    `<rect x="62" y="80" width="9" height="13" rx="4" fill="#f4ead8" ${S} stroke-width="3"/>` +
    `<ellipse cx="50" cy="74" rx="29" ry="15" fill="#fbf4e6" ${S} stroke-width="3.5"/>` +
    `<path d="M28 70 Q50 60 72 70 L70 80 Q50 72 30 80 Z" fill="${c.main}" ${S} stroke-width="3"/>` +
    `<path d="M10 66 Q6 50 20 48 Q32 48 32 62 Q30 74 20 74 Q12 74 10 66 Z" fill="#fbf4e6" ${S} stroke-width="3.5"/>` +
    `<path d="M14 49 L12 40 L21 46 Z" fill="#fbf4e6" ${S} stroke-width="3"/>` +
    `<circle cx="17" cy="60" r="2.4" fill="${INK}"/><path d="M22 48 Q30 44 33 56" fill="none" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/>` +
    // 乗り手
    `<path d="M38 66 Q36 50 52 50 Q68 50 66 66 Z" fill="${STEEL}" ${S} stroke-width="3.5"/>` +
    `<circle cx="52" cy="34" r="19" fill="${SKIN}" ${S} stroke-width="3.5"/>` +
    `<path d="M32 36 Q31 12 52 12 Q73 12 72 36 Q62 30 60 40 L44 40 Q42 30 32 36 Z" fill="${STEEL}" ${S} stroke-width="3.5"/>` +
    `<path d="M52 12 Q46 0 56 1 Q64 4 56 12 Z" fill="${c.main}" ${S} stroke-width="3"/>` +
    face(52, 41, 0.8) +
    // 盾
    `<path d="M26 54 Q36 50 46 54 Q46 70 36 76 Q26 70 26 54 Z" fill="${c.main}" ${S} stroke-width="3.5"/>` +
    `<path d="M36 57 V71 M30 62 H42" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>`
  );
}

const UNIT_ART = { infantry: infantryBody, knight: knightBody };

/** 盤面の兵士の絵。知らない種類は、歩兵の絵に名前の1文字目を重ねる */
export function unitArt(type, color, name = '') {
  const c = PLAYER_COLORS[color] ?? PLAYER_COLORS.blue;
  const draw = UNIT_ART[type];
  if (draw) return svg('0 0 100 100', draw(c), 'unit-art');
  return svg('0 0 100 100', infantryBody(c) +
    `<text x="50" y="82" font-size="20" font-weight="900" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="4" paint-order="stroke">${escapeText(name.charAt(0))}</text>`, 'unit-art');
}

// ---------- 魔物 ----------

const MONSTER_ART = {
  slime: () =>
    `<ellipse cx="50" cy="92" rx="30" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M14 78 Q10 40 50 22 Q90 40 86 78 Q86 92 50 92 Q14 92 14 78 Z" fill="#5cc6f2" ${S} stroke-width="4"/>` +
    `<path d="M28 50 Q34 36 46 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>` +
    `<ellipse cx="38" cy="64" rx="5" ry="7" fill="${INK}"/><ellipse cx="62" cy="64" rx="5" ry="7" fill="${INK}"/>` +
    `<circle cx="39.5" cy="61" r="2" fill="#fff"/><circle cx="63.5" cy="61" r="2" fill="#fff"/>` +
    `<path d="M42 77 Q50 84 58 77" fill="#e2475b" ${S} stroke-width="3"/>`,
  goblin: () =>
    `<ellipse cx="50" cy="94" rx="28" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M76 84 L90 40" ${S} stroke-width="12"/><path d="M76 84 L90 40" stroke="#a9753f" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M32 92 Q28 66 50 66 Q72 66 68 92 Z" fill="#9c6b3c" ${S} stroke-width="3.5"/>` +
    `<path d="M24 42 L4 30 L22 54 Z" fill="#7cc45a" ${S} stroke-width="3.5"/><path d="M76 42 L96 30 L78 54 Z" fill="#7cc45a" ${S} stroke-width="3.5"/>` +
    `<circle cx="50" cy="46" r="26" fill="#8ed066" ${S} stroke-width="3.5"/>` +
    `<path d="M32 38 L46 44 M68 38 L54 44" ${S} stroke-width="3.5"/>` +
    `<circle cx="40" cy="48" r="4" fill="#fff36b" ${S} stroke-width="2.5"/><circle cx="60" cy="48" r="4" fill="#fff36b" ${S} stroke-width="2.5"/>` +
    `<path d="M38 60 Q50 68 62 60" fill="none" ${S} stroke-width="3"/><path d="M43 62 l2 -5 l3 6 M53 63 l3 -6 l2 5" fill="#fff" ${S} stroke-width="2"/>`,
  dragon: () =>
    `<ellipse cx="50" cy="94" rx="32" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M22 60 Q-4 40 6 16 Q16 36 34 42 Z" fill="#f08a3c" ${S} stroke-width="3.5"/><path d="M78 60 Q104 40 94 16 Q84 36 66 42 Z" fill="#f08a3c" ${S} stroke-width="3.5"/>` +
    `<path d="M28 92 Q22 62 50 60 Q78 62 72 92 Z" fill="#e2463c" ${S} stroke-width="3.5"/>` +
    `<path d="M40 92 Q38 74 50 72 Q62 74 60 92 Z" fill="#ffd98a" ${S} stroke-width="3"/>` +
    `<path d="M30 22 L24 4 L40 16 Z" fill="#fff1c9" ${S} stroke-width="3"/><path d="M70 22 L76 4 L60 16 Z" fill="#fff1c9" ${S} stroke-width="3"/>` +
    `<path d="M24 44 Q22 14 50 14 Q78 14 76 44 Q76 66 50 66 Q24 66 24 44 Z" fill="#ee5a48" ${S} stroke-width="3.5"/>` +
    `<path d="M32 34 L46 40 M68 34 L54 40" ${S} stroke-width="3.5"/>` +
    `<ellipse cx="40" cy="43" rx="4" ry="5" fill="#fff36b" ${S} stroke-width="2.5"/><ellipse cx="60" cy="43" rx="4" ry="5" fill="#fff36b" ${S} stroke-width="2.5"/>` +
    `<ellipse cx="40" cy="43" rx="1.2" ry="4" fill="${INK}"/><ellipse cx="60" cy="43" rx="1.2" ry="4" fill="${INK}"/>` +
    `<circle cx="45" cy="56" r="1.8" fill="${INK}"/><circle cx="55" cy="56" r="1.8" fill="${INK}"/>`,
};

export function monsterArt(type, name = '') {
  const draw = MONSTER_ART[type];
  if (draw) return svg('0 0 100 100', draw(), 'monster-art');
  return svg('0 0 100 100',
    `<circle cx="50" cy="52" r="34" fill="#a78bda" ${S} stroke-width="4"/>` +
    `<text x="50" y="64" font-size="34" font-weight="900" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke">${escapeText(name.charAt(0) || '?')}</text>`, 'monster-art');
}

// ---------- 城 ----------

/** 城。壊れ具合は、親の要素の data-damage（0〜3）に合わせて CSS がひび・煙を出す */
export function castleArt(color) {
  const c = PLAYER_COLORS[color] ?? PLAYER_COLORS.blue;
  const stone = '#e6dfd0';
  const stoneD = '#c9bfab';
  const tower = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${stone}" ${S} stroke-width="4"/>` +
    `<path d="M${x + 5} ${y + 16} h${w - 10}" stroke="${stoneD}" stroke-width="3" stroke-linecap="round"/>`;
  const roof = (cx, base, half, top) =>
    `<path d="M${cx - half} ${base} L${cx} ${top} L${cx + half} ${base} Z" fill="${c.main}" ${S} stroke-width="4"/>` +
    `<path d="M${cx - half * 0.45} ${base - 6} L${cx - 2} ${top + 12}" stroke="${c.light}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
  const win = (x, y) => `<path d="M${x} ${y + 12} v-8 a5 5 0 0 1 10 0 v8 Z" fill="#6b4a2e" ${S} stroke-width="2.5"/>`;
  return svg('0 0 200 150',
    `<ellipse cx="100" cy="142" rx="86" ry="8" fill="#000" opacity=".16"/>` +
    `<g class="castle-flag"><path d="M100 22 V2" ${S} stroke-width="3.5"/><path d="M101 3 L122 9 L101 15 Z" fill="${c.main}" ${S} stroke-width="3"/></g>` +
    tower(20, 62, 40, 78) + tower(140, 62, 40, 78) + tower(78, 44, 44, 70) +
    `<rect x="46" y="84" width="108" height="56" rx="6" fill="${stone}" ${S} stroke-width="4"/>` +
    `<path d="M46 96 h14 v-8 h12 v8 h14 v-8 h12 v8 h14 v-8 h12 v8 h16" fill="none" stroke="${stoneD}" stroke-width="3" stroke-linejoin="round"/>` +
    roof(40, 64, 27, 26) + roof(160, 64, 27, 26) + roof(100, 46, 29, 12) +
    win(35, 78) + win(155, 78) + win(95, 60) +
    `<path d="M84 140 V118 a16 16 0 0 1 32 0 V140 Z" fill="#8a5a32" ${S} stroke-width="4"/>` +
    `<path d="M100 104 V140 M90 110 V140 M110 110 V140" stroke="#6b4426" stroke-width="2.5"/>` +
    // 壊れ具合（CSS で出し分ける）
    `<g class="castle-crack c1" fill="none" ${S} stroke-width="3"><path d="M58 90 l8 10 l-6 8 l9 12"/><path d="M150 70 l-6 9 l7 7"/></g>` +
    `<g class="castle-crack c2" fill="none" ${S} stroke-width="3"><path d="M132 92 l-9 9 l8 9 l-7 12"/><path d="M92 50 l6 8 l-5 8"/><path d="M30 96 l7 8 l-5 9"/></g>` +
    `<g class="castle-crack c3"><path d="M140 62 L140 48 L150 56 L158 44 L166 56 L180 50 L180 62 Z" fill="${stone}" ${S} stroke-width="4"/><path d="M24 100 l10 6 l-4 10 l10 8" fill="none" ${S} stroke-width="3"/></g>` +
    `<g class="castle-smoke"><circle cx="150" cy="40" r="9"/><circle cx="160" cy="26" r="7"/><circle cx="146" cy="16" r="5"/></g>` +
    `<g class="castle-fire"><path d="M52 84 q-8 -14 2 -22 q0 8 6 8 q-2 -10 6 -16 q-2 10 6 16 q4 8 -4 14 Z" fill="#f5923e" ${S} stroke-width="2.5"/><path d="M58 84 q-4 -8 2 -12 q4 4 2 12 Z" fill="#ffe27a"/></g>`,
    'castle-art');
}

// ---------- カードの絵 ----------

const bg = (a, b) => `<rect width="100" height="100" fill="${a}"/><circle cx="50" cy="50" r="46" fill="${b}" opacity=".6"/>`;

const CARD_ART = {
  infantry: (c) => bg('#cfeeb0', '#eaf8d4') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>`,
  knight: (c) => bg('#cfeeb0', '#eaf8d4') + `<g transform="translate(6 8) scale(.88)">${knightBody(c)}</g>`,
  fireball: () => bg('#ffd9a8', '#fff0cf') +
    `<path d="M50 10 Q62 26 76 30 Q90 46 82 66 Q74 90 50 90 Q24 90 18 66 Q12 46 28 34 Q28 46 36 46 Q32 24 50 10 Z" fill="#f2622e" ${S} stroke-width="4"/>` +
    `<path d="M50 34 Q62 44 66 60 Q68 80 50 82 Q32 80 34 62 Q36 52 44 50 Q44 42 50 34 Z" fill="#ffc83d" ${S} stroke-width="3"/>` +
    `<ellipse cx="43" cy="64" rx="2.6" ry="4" fill="${INK}"/><ellipse cx="57" cy="64" rx="2.6" ry="4" fill="${INK}"/><path d="M44 72 q6 5 12 0" fill="none" ${S} stroke-width="2.5"/>`,
  thunder: () => bg('#b9c3e6', '#dfe5f7') +
    `<path d="M22 46 Q8 44 12 30 Q16 18 30 22 Q36 8 52 12 Q66 8 72 22 Q90 20 90 36 Q90 48 76 48 Z" fill="#6c7693" ${S} stroke-width="4"/>` +
    `<path d="M30 30 Q36 20 48 20" fill="none" stroke="#a8b2cc" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M56 40 L38 66 H50 L42 92 L68 58 H55 L64 40 Z" fill="#ffd93b" ${S} stroke-width="4"/>`,
  heal: () => bg('#d6f5cf', '#f0fde9') +
    `<path d="M50 84 Q14 60 18 36 Q22 18 38 22 Q46 24 50 32 Q54 24 62 22 Q78 18 82 36 Q86 60 50 84 Z" fill="#f77f9c" ${S} stroke-width="4"/>` +
    `<path d="M30 36 Q32 28 40 28" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M14 70 v12 M8 76 h12 M84 12 v12 M78 18 h12 M82 70 v8 M78 74 h8" stroke="#3fb950" stroke-width="5" stroke-linecap="round"/>`,
  flameSword: () => bg('#ffd2b0', '#ffecd9') +
    `<path d="M24 80 L70 18 Q84 10 80 28 L34 88 Z" fill="#ff8a3d" ${S} stroke-width="4"/>` +
    `<path d="M34 76 L72 26" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M14 62 L44 92" ${S} stroke-width="10"/><path d="M14 62 L44 92" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M22 86 L12 94" ${S} stroke-width="9"/><path d="M22 86 L12 94" stroke="#8a5a32" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M78 40 q10 -4 8 -16 q8 10 2 22 Z M52 22 q-2 -10 6 -14 q-2 8 4 12 Z" fill="#f2622e" ${S} stroke-width="2.5"/>`,
  waterSpear: () => bg('#bfe6fb', '#e4f5ff') +
    `<path d="M18 90 L66 30" ${S} stroke-width="9"/><path d="M18 90 L66 30" stroke="#c99a5b" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M58 40 Q52 20 70 8 Q72 22 84 22 Q90 28 76 40 Q70 46 58 40 Z" fill="#4db8f0" ${S} stroke-width="4"/>` +
    `<path d="M66 30 Q66 20 72 16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M28 34 q-7 10 0 14 q7 -4 0 -14 Z M84 58 q-6 9 0 12 q6 -3 0 -12 Z" fill="#7fd0f7" ${S} stroke-width="2.5"/>`,
  woodAxe: () => bg('#cdecb4', '#eaf8dc') +
    `<path d="M26 92 L64 22" ${S} stroke-width="10"/><path d="M26 92 L64 22" stroke="#a9753f" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M50 20 Q70 4 90 24 Q84 44 62 46 Q66 32 50 20 Z" fill="#7cc45a" ${S} stroke-width="4"/>` +
    `<path d="M62 20 Q72 14 82 24" fill="none" stroke="#d4f2bf" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M20 44 Q12 30 26 22 Q36 34 20 44 Z" fill="#5fae4e" ${S} stroke-width="3"/><path d="M21 42 L25 26" stroke="${INK}" stroke-width="2"/>`,
  shield: () => bg('#cfe0f2', '#eaf2fb') +
    `<path d="M50 10 Q68 20 84 20 Q86 62 50 90 Q14 62 16 20 Q32 20 50 10 Z" fill="#6f9fd8" ${S} stroke-width="4"/>` +
    `<path d="M50 20 Q62 27 74 28 Q74 56 50 78 Z" fill="#8fb8e8"/>` +
    `<path d="M50 30 l6 13 l14 1 l-11 9 l4 14 l-13 -8 l-13 8 l4 -14 l-11 -9 l14 -1 Z" fill="#ffd93b" ${S} stroke-width="3"/>`,
  wall: () => bg('#e6dcc8', '#f6efe0') +
    `<path d="M10 88 V34 h14 v-12 h14 v12 h12 v-12 h14 v12 h12 v-12 h14 v12 h0 V88 Z" fill="#d9cfbb" ${S} stroke-width="4"/>` +
    `<path d="M10 52 H90 M10 70 H90 M30 34 V52 M60 34 V52 M44 52 V70 M74 52 V70 M26 70 V88 M56 70 V88" stroke="#a89c84" stroke-width="3"/>` +
    `<path d="M18 40 h8" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
  poisonMist: () => bg('#d9c7ef', '#efe5fb') +
    `<path d="M18 62 Q4 58 10 44 Q14 34 26 38 Q30 22 46 26 Q58 14 70 28 Q88 26 90 44 Q96 60 80 64 Q76 78 60 72 Q50 84 38 74 Q24 78 18 62 Z" fill="#9b6fd6" ${S} stroke-width="4"/>` +
    `<circle cx="40" cy="48" r="7" fill="#c9f26b" ${S} stroke-width="3"/><circle cx="62" cy="48" r="7" fill="#c9f26b" ${S} stroke-width="3"/>` +
    `<path d="M44 62 h4 v4 h4 v-4 h4" fill="none" ${S} stroke-width="3"/>` +
    `<circle cx="24" cy="86" r="5" fill="#c9f26b" ${S} stroke-width="2.5"/><circle cx="78" cy="84" r="3.5" fill="#c9f26b" ${S} stroke-width="2.5"/>`,
  frostBreath: () => bg('#cfeefb', '#eefaff') +
    `<g ${S} stroke-width="6" fill="none"><path d="M50 12 V88 M17 31 L83 69 M17 69 L83 31"/><path d="M40 20 L50 30 L60 20 M40 80 L50 70 L60 80 M19 45 L32 40 L28 26 M81 55 L68 60 L72 74 M19 55 L32 60 L28 74 M81 45 L68 40 L72 26"/></g>` +
    `<g stroke="#8fdcff" stroke-width="2.5" stroke-linecap="round" fill="none"><path d="M50 12 V88 M17 31 L83 69 M17 69 L83 31"/></g>` +
    `<circle cx="50" cy="50" r="8" fill="#e9faff" ${S} stroke-width="3"/>`,
  // 追加カード：もとの絵を使い回し、背景の色と一部の飾りで見分ける（専用の絵ができたら差しかえる）
  spearman: (c) => bg('#cfeeb0', '#eaf8d4') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>` +
    `<path d="M88 92 L72 14" ${S} stroke-width="8"/><path d="M88 92 L72 14" stroke="#c99a5b" stroke-width="4" stroke-linecap="round"/><path d="M72 4 L79 20 L65 20 Z" fill="${STEEL}" ${S} stroke-width="3"/>`,
  heavy: (c) => bg('#d6dbe3', '#eef1f5') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>` +
    `<path d="M62 52 Q78 56 86 52 Q86 74 74 86 Q62 74 62 52 Z" fill="${STEEL}" ${S} stroke-width="4"/>`,
  giant: (c) => bg('#e8d3b8', '#f7ecdd') + `<g transform="translate(-8 -4) scale(1.1)">${knightBody(c)}</g>`,
  meteor: () => bg('#ffc9a0', '#ffe9d2') +
    `<path d="M84 8 L30 56" stroke="#f2622e" stroke-width="14" stroke-linecap="round" opacity=".55"/>` +
    `<circle cx="34" cy="62" r="26" fill="#8a6a50" ${S} stroke-width="4"/><circle cx="26" cy="56" r="6" fill="#6b4f3a"/><circle cx="42" cy="72" r="5" fill="#6b4f3a"/>` +
    `<path d="M16 40 q-6 -14 4 -22 q0 8 6 8 q-2 -8 4 -12 q-2 10 4 14 Z" fill="#ffc83d" ${S} stroke-width="2.5"/>`,
  bigThunder: () => bg('#8f9bd0', '#c9d1f0') +
    `<path d="M22 46 Q8 44 12 30 Q16 18 30 22 Q36 8 52 12 Q66 8 72 22 Q90 20 90 36 Q90 48 76 48 Z" fill="#4c5578" ${S} stroke-width="4"/>` +
    `<path d="M48 36 L26 68 H42 L32 94 L66 54 H50 L62 36 Z" fill="#ffe94d" ${S} stroke-width="4"/>`,
  venom: () => bg('#c2e08a', '#e4f4c4') +
    `<path d="M50 10 Q74 40 74 60 Q74 86 50 88 Q26 86 26 60 Q26 40 50 10 Z" fill="#8fd13a" ${S} stroke-width="4"/>` +
    `<circle cx="42" cy="56" r="5" fill="${INK}"/><circle cx="58" cy="56" r="5" fill="${INK}"/><path d="M42 72 h16" ${S} stroke-width="3"/>`,
  deepFreeze: () => bg('#a9dcf5', '#e2f5ff') +
    `<path d="M50 6 L70 38 L94 50 L70 62 L50 94 L30 62 L6 50 L30 38 Z" fill="#bfeaff" ${S} stroke-width="4"/>` +
    `<path d="M50 20 L50 80 M20 50 H80" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>`,
  ironSword: () => bg('#dfe3ea', '#f3f5f8') +
    `<path d="M24 80 L70 18 Q84 10 80 28 L34 88 Z" fill="${STEEL}" ${S} stroke-width="4"/>` +
    `<path d="M34 76 L72 26" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M14 62 L44 92" ${S} stroke-width="10"/><path d="M14 62 L44 92" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M22 86 L12 94" ${S} stroke-width="9"/><path d="M22 86 L12 94" stroke="#8a5a32" stroke-width="4.5" stroke-linecap="round"/>`,
  bigShield: () => bg('#b7cdea', '#dbe8f7') +
    `<path d="M50 4 Q72 16 94 16 Q96 66 50 96 Q4 66 6 16 Q28 16 50 4 Z" fill="#4f82c4" ${S} stroke-width="4"/>` +
    `<path d="M50 20 l8 17 l18 2 l-14 12 l5 18 l-17 -10 l-17 10 l5 -18 l-14 -12 l18 -2 Z" fill="#ffd93b" ${S} stroke-width="3"/>`,
  sandbag: () => bg('#eadfc6', '#f8f1df') +
    `<path d="M8 86 Q6 66 22 62 H46 Q62 66 60 86 Z" fill="#d7bf8a" ${S} stroke-width="4"/>` +
    `<path d="M40 62 Q38 42 54 38 H76 Q92 42 90 62 Z" fill="#c9ae74" ${S} stroke-width="4"/>` +
    `<path d="M28 74 h18 M58 52 h18" stroke="#a88f58" stroke-width="3" stroke-linecap="round"/>`,
};

/** カードの絵（知らない種類は、名前の1文字目を出す） */
export function cardArt(type, color = 'blue', name = '') {
  const draw = CARD_ART[type];
  const c = PLAYER_COLORS[color] ?? PLAYER_COLORS.blue;
  if (draw) return svg('0 0 100 100', draw(c), 'card-art-svg', 'xMidYMid slice');
  return svg('0 0 100 100', bg('#eadfc6', '#f8f1df') +
    `<text x="50" y="66" font-size="46" font-weight="900" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="6" paint-order="stroke">${escapeText(name.charAt(0) || '?')}</text>`, 'card-art-svg', 'xMidYMid slice');
}

// ---------- 小さな記号 ----------

const ICONS = {
  heart: `<path d="M12 21 Q1 13 3 7 Q5 2 9 4 Q11 5 12 7 Q13 5 15 4 Q19 2 21 7 Q23 13 12 21 Z" fill="#f2566e" ${S} stroke-width="2"/>`,
  sword: `<path d="M5 19 L17 5 L20 4 L19 7 L7 21 Z" fill="#eef3f7" ${S} stroke-width="2"/><path d="M4 14 L10 20" ${S} stroke-width="3.4"/><path d="M4 14 L10 20" stroke="#f2c14e" stroke-width="1.4" stroke-linecap="round"/>`,
  boot: `<path d="M8 3 h7 v10 q6 1 6 6 v2 H6 Z" fill="#b98250" ${S} stroke-width="2"/>`,
  shield: `<path d="M12 2 Q17 5 21 5 Q21 15 12 22 Q3 15 3 5 Q7 5 12 2 Z" fill="#6f9fd8" ${S} stroke-width="2"/>`,
  coin: `<circle cx="12" cy="12" r="9" fill="#ffcf3f" ${S} stroke-width="2"/><path d="M12 7 l1.6 3.3 l3.6 .5 l-2.6 2.5 l.6 3.6 l-3.2 -1.7 l-3.2 1.7 l.6 -3.6 l-2.6 -2.5 l3.6 -.5 Z" fill="#fff3b0" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
  wall: `<path d="M3 21 V9 h4 V5 h4 v4 h2 V5 h4 v4 h4 v12 Z" fill="#d9cfbb" ${S} stroke-width="2"/><path d="M3 15 H21 M9 9 v6 M15 15 v6" stroke="#8d8069" stroke-width="1.5"/>`,
  card: `<rect x="5" y="2" width="14" height="20" rx="3" fill="#b0703c" ${S} stroke-width="2"/><path d="M12 7 l1.5 3 l3.3 .4 l-2.4 2.3 l.6 3.3 l-3 -1.6 l-3 1.6 l.6 -3.3 l-2.4 -2.3 l3.3 -.4 Z" fill="#ffd93b"/>`,
  skull: `<path d="M12 3 Q21 3 21 12 Q21 16 17 17 V21 H7 V17 Q3 16 3 12 Q3 3 12 3 Z" fill="#c9f26b" ${S} stroke-width="2"/><circle cx="8.5" cy="12" r="2" fill="${INK}"/><circle cx="15.5" cy="12" r="2" fill="${INK}"/>`,
  snow: `<g ${S} stroke-width="3.6" fill="none"><path d="M12 2 V22 M3.5 7 L20.5 17 M3.5 17 L20.5 7"/></g><g stroke="#8fdcff" stroke-width="1.5" stroke-linecap="round"><path d="M12 2 V22 M3.5 7 L20.5 17 M3.5 17 L20.5 7"/></g>`,
  fire: `<path d="M12 2 Q14 7 18 9 Q22 14 19 19 Q16 23 12 22 Q6 23 4 17 Q3 12 7 9 Q8 12 10 11 Q9 6 12 2 Z" fill="#f2622e" ${S} stroke-width="2"/><path d="M12 12 Q15 15 14 18 Q12 20 10 18 Q9 15 12 12 Z" fill="#ffc83d"/>`,
  water: `<path d="M12 2 Q20 12 19 16 Q18 22 12 22 Q6 22 5 16 Q4 12 12 2 Z" fill="#4db8f0" ${S} stroke-width="2"/><path d="M9 14 q0 4 3 5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`,
  wood: `<path d="M12 22 V12" ${S} stroke-width="2.4"/><path d="M12 14 Q2 14 3 3 Q13 3 12 14 Z M12 16 Q21 17 21 8 Q13 7 12 16 Z" fill="#7cc45a" ${S} stroke-width="2"/>`,
  crown: `<path d="M3 19 L2 7 L8 12 L12 4 L16 12 L22 7 L21 19 Z" fill="#ffcf3f" ${S} stroke-width="2"/><circle cx="12" cy="15" r="1.8" fill="#e2475b"/>`,
  hammer: `<path d="M6 21 L14 11" ${S} stroke-width="4.4"/><path d="M6 21 L14 11" stroke="#a9753f" stroke-width="2" stroke-linecap="round"/><path d="M10 6 L15 2 L22 9 L18 13 Z" fill="${STEEL_D}" ${S} stroke-width="2"/>`,
  stone: `<path d="M3 17 L7 8 L16 6 L21 13 L18 19 L7 20 Z" fill="${STEEL}" ${S} stroke-width="2"/><path d="M8 11 L15 9" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  sound: `<path d="M3 9 h4 l6 -5 v16 l-6 -5 H3 Z" fill="#fff7e0" ${S} stroke-width="2"/><path d="M16 8 q3 4 0 8 M19 5 q5 7 0 14" fill="none" ${S} stroke-width="2"/>`,
  mute: `<path d="M3 9 h4 l6 -5 v16 l-6 -5 H3 Z" fill="#fff7e0" ${S} stroke-width="2"/><path d="M16 9 l6 6 M22 9 l-6 6" ${S} stroke-width="2.4"/>`,
};

/** 小さな記号（24×24）。class="ic" で文字の大きさに合わせて出る */
export function icon(name) {
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

/** 道の脇の木 */
export function treeArt() {
  return svg('0 0 100 110',
    `<ellipse cx="50" cy="102" rx="26" ry="6" fill="#000" opacity=".15"/>` +
    `<rect x="43" y="70" width="14" height="30" rx="5" fill="#a9753f" ${S} stroke-width="4"/>` +
    `<path d="M50 6 Q84 8 86 40 Q92 70 50 76 Q8 70 14 40 Q16 8 50 6 Z" fill="#5fae4e" ${S} stroke-width="4"/>` +
    `<path d="M30 30 Q36 18 50 16" fill="none" stroke="#9ad77f" stroke-width="6" stroke-linecap="round"/>`, 'tree-art');
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
