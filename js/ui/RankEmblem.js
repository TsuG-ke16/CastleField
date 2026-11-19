// ランクのエンブレム（オリジナルの図柄。盾に、階級ごとに違う中心の形と、ディビジョンの数だけの点）。他作品の素材は使わない。
const OK_COLOR = /^#[0-9a-f]{6}$/i;
const star = (cx, cy, ro, ri, n) => Array.from({ length: n * 2 }, (_, i) => {
  const a = (Math.PI * i) / n - Math.PI / 2; const r = i % 2 ? ri : ro;
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const poly = (cx, cy, r, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => {
  const a = rot + (2 * Math.PI * i) / n;
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

// 階級の順（Iron … Radiant）ごとの中心の図柄。色は ranks.json の color
const CENTER = [
  (c) => `<polygon points="${poly(50, 52, 17, 6)}" fill="${c}" stroke="#3b2a1a" stroke-width="3"/><circle cx="50" cy="52" r="5" fill="#3b2a1a" opacity=".55"/>`,
  (c) => `<polygon points="50,32 70,52 50,72 30,52" fill="${c}" stroke="#3b2a1a" stroke-width="3"/><polygon points="50,40 62,52 50,64 38,52" fill="#fff" opacity=".35"/>`,
  (c) => `<polygon points="${star(50, 53, 21, 9, 5)}" fill="${c}" stroke="#3b2a1a" stroke-width="3" stroke-linejoin="round"/>`,
  (c) => `<polygon points="${star(50, 53, 22, 10, 5)}" fill="${c}" stroke="#3b2a1a" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="53" r="6" fill="#fff" opacity=".55"/>`,
  (c) => `<path d="M30 42 L50 30 L70 42 M30 54 L50 42 L70 54 M30 66 L50 54 L70 66" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 42 L50 30 L70 42 M30 54 L50 42 L70 54 M30 66 L50 54 L70 66" fill="none" stroke="#3b2a1a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  (c) => `<polygon points="34,42 42,32 58,32 66,42 50,72" fill="${c}" stroke="#3b2a1a" stroke-width="3" stroke-linejoin="round"/><path d="M34 42 H66 M42 32 L50 42 L58 32 M50 42 V72" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>`,
  (c) => `<path d="M50 28 L64 56 H36 Z" fill="${c}" stroke="#3b2a1a" stroke-width="3" stroke-linejoin="round"/><path d="M26 44 Q32 58 46 64 M74 44 Q68 58 54 64" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  (c) => `<path d="M50 28 C58 40 66 44 62 58 C60 66 54 70 50 72 C44 70 38 66 38 58 C36 48 44 44 50 28 Z" fill="${c}" stroke="#3b2a1a" stroke-width="3" stroke-linejoin="round"/><path d="M50 50 C54 56 54 62 50 66 C46 62 46 56 50 50 Z" fill="#fff" opacity=".5"/>`,
  (c) => `<g stroke="${c}" stroke-width="4" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const a = (Math.PI * 2 * i) / 12; return `<line x1="${(50 + 17 * Math.cos(a)).toFixed(1)}" y1="${(52 + 17 * Math.sin(a)).toFixed(1)}" x2="${(50 + 26 * Math.cos(a)).toFixed(1)}" y2="${(52 + 26 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g><circle cx="50" cy="52" r="14" fill="${c}" stroke="#3b2a1a" stroke-width="3"/><circle cx="50" cy="52" r="6" fill="#fff" opacity=".7"/>`,
];

/** @param {{ tierIndex: number, division: number|null, color: string, name: string, divisionLabel?: string }|null} rank 認定中は null（「？」の盾） */
export function rankEmblem(rank, size = 64) {
  const color = rank && OK_COLOR.test(rank.color) ? rank.color : '#b9b19a';
  const idx = rank ? Math.max(0, Math.min(CENTER.length - 1, rank.tierIndex)) : -1;
  const label = rank ? (rank.divisionLabel ?? rank.name) : 'ランク未確定';
  const pips = rank?.division ? Array.from({ length: rank.division }, (_, i) => `<circle cx="${50 + (i - (rank.division - 1) / 2) * 12}" cy="95" r="4" fill="#fff8e0" stroke="#3b2a1a" stroke-width="1.5"/>`).join('') : '';
  const upper = rank && !rank.division ? `<path d="M26 14 L50 6 L74 14" fill="none" stroke="#fff8e0" stroke-width="3" stroke-linecap="round"/>` : '';
  const body = rank ? CENTER[idx](color) : `<text x="50" y="68" text-anchor="middle" font-size="44" font-weight="bold" fill="#8a7e62" font-family="sans-serif">?</text>`;
  return `<svg class="rank-emblem" viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}" role="img" aria-label="${label}">
    <defs><linearGradient id="rg${idx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e5d6ae"/></linearGradient></defs>
    <path d="M50 4 L90 16 V58 C90 86 68 106 50 116 C32 106 10 86 10 58 V16 Z" fill="${color}" stroke="#3b2a1a" stroke-width="4" stroke-linejoin="round"/>
    <path d="M50 12 L82 22 V58 C82 80 64 97 50 106 C36 97 18 80 18 58 V22 Z" fill="url(#rg${idx})" stroke="#3b2a1a" stroke-width="2"/>
    ${body}${pips}${upper}</svg>`;
}
