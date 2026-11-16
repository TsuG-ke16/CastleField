// カードの左上（種類）と右上（レアリティ）に付けるバッジの絵。
// 太いこげ茶の輪郭線・やわらかいグラデーション・白いハイライトで、カードの絵柄（assets/STYLE.md）にそろえる。
// 以前は種類が細い線画で、レアリティは「● ◆ ✦」のような文字記号（端末のフォント任せ）だった。
// 画像生成AIで作った絵に差しかえるときは、このファイルの badgeKind / badgeRarity が返す中身を <img> に変える。

const INK = '#4a2e1a';
let uid = 0;

/** svg の外側。id を使うグラデーションは、同じページに何枚あっても重ならないように毎回別の名前にする */
function svg(cls, body) {
  return `<svg class="badge-svg ${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${body}</svg>`;
}
const stroke = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const shine = (d) => `<path d="${d}" fill="#fff" opacity=".75" stroke="none"/>`;

function grad(id, light, dark) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
}

/** 種類：兵士＝かぶと／魔法＝魔法の星／武器＝剣／防御＝盾 */
const KIND = {
  soldier: (id) => svg('kind-soldier', `<defs>${grad(id, '#f4f7fa', '#9fb0c0')}</defs>
    <path d="M5 20 C5 10 10 5 16 5 C22 5 27 10 27 20 L27 23 L5 23 Z" fill="url(#${id})" ${stroke}/>
    <path d="M13 5 H19 V13 H13 Z" fill="#e8504a" ${stroke}/>
    <path d="M8 18 H24 V22 H8 Z" fill="#2d2118" opacity=".78" stroke="none"/>
    ${shine('M8 15 C8 11 10 8 13 7 C11 10 11 13 11 15 Z')}`),
  spell: (id) => svg('kind-spell', `<defs>${grad(id, '#fff2a8', '#f2a931')}</defs>
    <path d="M16 3 L19.4 11.6 L28.5 12.3 L21.6 18.3 L23.8 27.2 L16 22.4 L8.2 27.2 L10.4 18.3 L3.5 12.3 L12.6 11.6 Z" fill="url(#${id})" ${stroke}/>
    ${shine('M16 7 L17.6 11.5 L14 12 Z')}`),
  weapon: (id) => svg('kind-weapon', `<defs>${grad(id, '#ffffff', '#a9bac9')}</defs>
    <path d="M24.5 3.5 L28.5 3.5 L28.5 7.5 L13.5 22.5 L9.5 18.5 Z" fill="url(#${id})" ${stroke}/>
    <path d="M6 15.5 L16.5 26 L13.8 28.7 L3.3 18.2 Z" fill="#f2b33d" ${stroke}/>
    <path d="M7.5 23 L4 26.5 L5.5 28 L9 24.5" fill="#7a4a26" ${stroke}/>
    ${shine('M24 6 L26 6 L13 19 Z')}`),
  defense: (id) => svg('kind-defense', `<defs>${grad(id, '#79b8f2', '#2f7fc8')}</defs>
    <path d="M16 3 L27 7 V15 C27 22 22.5 26.5 16 29.5 C9.5 26.5 5 22 5 15 V7 Z" fill="url(#${id})" ${stroke}/>
    <path d="M16 3 V29.5 C9.5 26.5 5 22 5 15 V7 Z" fill="#f2c14e" opacity=".95" stroke="none"/>
    <path d="M16 3 L27 7 V15 C27 22 22.5 26.5 16 29.5 C9.5 26.5 5 22 5 15 V7 Z" fill="none" ${stroke}/>
    <path d="M16 3 V29.5" ${stroke} stroke-width="1.6"/>
    ${shine('M19 8 L24 9.6 V13 C22 12 20.5 11 19 8 Z')}`),
};

/** レアリティ：コモン＝丸い石／アンコモン＝しずく型の宝石／レア＝ひし形／エピック＝六角形／レジェンド＝王冠。形でも見分けられる */
const RARITY = {
  common: (id, c) => svg('rarity-common', `<defs>${grad(id, '#e9edf1', c)}</defs>
    <circle cx="16" cy="17" r="10" fill="url(#${id})" ${stroke}/>${shine('M9.5 14 C10.5 10.5 13 9 15.5 8.8 C12.5 10.2 11 12 10.6 15.4 Z')}`),
  uncommon: (id, c) => svg('rarity-uncommon', `<defs>${grad(id, '#d9f7c8', c)}</defs>
    <path d="M16 3.5 C21.5 10 25.5 14 25.5 19.5 A9.5 9.5 0 0 1 6.5 19.5 C6.5 14 10.5 10 16 3.5 Z" fill="url(#${id})" ${stroke}/>${shine('M12 14 C12.6 11.6 14 9.6 15.4 8.2 C14.6 11 13.6 13.4 13.6 16 Z')}`),
  rare: (id, c) => svg('rarity-rare', `<defs>${grad(id, '#c6e6ff', c)}</defs>
    <path d="M16 2.8 L27.5 16 L16 29.2 L4.5 16 Z" fill="url(#${id})" ${stroke}/>
    <path d="M4.5 16 H27.5 M16 2.8 L11 16 L16 29.2 L21 16 Z" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" opacity=".55"/>${shine('M9 14 L14 5.5 L12.4 14 Z')}`),
  epic: (id, c) => svg('rarity-epic', `<defs>${grad(id, '#e6cfff', c)}</defs>
    <path d="M16 2.8 L26.6 8.9 V21.1 L16 27.2 L5.4 21.1 V8.9 Z" fill="url(#${id})" ${stroke}/>
    <path d="M16 9 L19.3 14 L16 21 L12.7 14 Z" fill="#fff" opacity=".35" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>${shine('M8.4 10.4 L14 6.6 L12.4 11 Z')}`),
  legendary: (id, c) => svg('rarity-legendary', `<defs>${grad(id, '#fff0a0', c)}</defs>
    <path d="M3.5 24.5 L5 9.5 L11.5 16 L16 6 L20.5 16 L27 9.5 L28.5 24.5 Z" fill="url(#${id})" ${stroke}/>
    <rect x="3.8" y="22.2" width="24.4" height="5.2" rx="1.6" fill="#f0a82e" ${stroke}/>
    <circle cx="16" cy="19" r="2.6" fill="#e8504a" ${stroke} stroke-width="1.5"/><circle cx="5" cy="9" r="1.9" fill="#fff" ${stroke} stroke-width="1.4"/><circle cx="27" cy="9" r="1.9" fill="#fff" ${stroke} stroke-width="1.4"/>`),
};

/** 種類（soldier / spell / weapon / defense）のバッジ。知らない種類は空 */
export function badgeKind(kind) {
  const make = KIND[kind];
  return make ? make(`bk${uid++}`) : '';
}

/** レアリティ（common〜legendary）のバッジ。color は data/rarities.json の色 */
export function badgeRarity(rarity, color = '#9aa3ad') {
  const make = RARITY[rarity];
  return make ? make(`br${uid++}`, color) : '';
}
