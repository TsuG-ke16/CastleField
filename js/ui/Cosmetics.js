// 見た目のスキン（兵士・城・攻撃エフェクト・勝利演出・カード裏面）を、プレイヤーごとに盤面へ反映する。
// - 景品の中身は data/shop.json（サーバーと同じ一覧）。専用画像がない部位は既存の色替えを使う。
// - 対戦中は、部屋の席ごとの装備（サーバーが決めた、その人が持っているものだけ）を使う。ひとりで遊ぶ・同じ端末では、自分の装備を使う
// - 見た目だけで、ゲームの強さ・ルールには関わらない
import { skinArt } from './skinArt.js';

function setArt(el, property, path) {
  if (path) el.style.setProperty(property, `url("${new URL(path, document.baseURI)}")`);
  else el.style.removeProperty(property);
}

export class Cosmetics {
  constructor(catalog) {
    this.items = catalog?.items ?? {};
    this.mine = {};           // 自分の装備 { slot: itemId }
    this.byPlayer = {};       // playerId → { slot: itemId }
    this.viewerId = null;
  }

  spec(id) { return typeof id === 'string' && Object.hasOwn(this.items, id) ? this.items[id] : null; }

  /** 自分の装備（サーバーの値）。アイコン・称号は盤面に出さない */
  setMine(equipped) {
    this.mine = Object.fromEntries(Object.entries(equipped ?? {}).filter(([slot]) => !['icon', 'title'].includes(slot)));
  }

  /** オンライン：部屋の席ごと */
  setFromRoom(players, viewerId) {
    this.byPlayer = Object.fromEntries(players.map((p) => [p.playerId, p.cosmetics ?? {}]));
    this.localIds = null;
    this.viewerId = viewerId;
  }

  /** ひとりで遊ぶ・同じ端末：人間の席は自分の装備、CPU・ほかの人は標準 */
  setLocal(humanIds) {
    this.byPlayer = {};
    this.localIds = humanIds;
    this.viewerId = humanIds[0] ?? null;
  }

  /** その人の装備（ひとりで遊ぶときの自分は、いつでも最新の自分の装備） */
  map(pid) { return this.localIds?.includes(pid) ? this.mine : this.byPlayer[pid]; }
  equipped(pid, slot) { return this.spec(this.map(pid)?.[slot]); }

  /** 兵士・城の色替え（チームの色ごと）。なければ null */
  filterFor(pid, slot, color) {
    const it = this.equipped(pid, slot);
    if (!it || it.slot !== slot) return null;
    return it.filters?.[color] ?? it.filter ?? null;
  }

  styleSoldier(el, pid) {
    const f = this.filterFor(pid, 'unit', el.dataset.color);
    el.dataset.owner = pid;
    const pic = el.querySelector('.soldier-pic');
    if (!pic) return;
    const art = el.dataset.unitType === 'infantry' ? skinArt(this.map(pid)?.unit) : null;
    setArt(pic, '--unit-art', art);
    pic.toggleAttribute('data-painted', Boolean(art));
    if (f && !art) pic.style.setProperty('--skin-filter', f);
    else pic.style.removeProperty('--skin-filter');
  }

  styleCastle(el, pid) {
    const f = this.filterFor(pid, 'castle', el.dataset.color);
    const art = skinArt(this.map(pid)?.castle);
    setArt(el, '--castle-art', art);
    el.toggleAttribute('data-painted', Boolean(art));
    if (f) el.style.setProperty('--castle-skin-filter', f);
    else el.style.removeProperty('--castle-skin-filter');
  }

  /** 魔法・射撃の演出（誰が撃ったかで色が変わる） */
  styleFx(container, pid) {
    if (!container) return;
    const it = this.equipped(pid, 'attackFx');
    const art = skinArt(this.map(pid)?.attackFx);
    setArt(container, '--attack-art', art);
    container.toggleAttribute('data-painted-fx', Boolean(art));
    if (it?.filter) container.style.setProperty('--fx-filter', it.filter); else container.style.removeProperty('--fx-filter');
  }

  /** 勝った人の紙ふぶきの色（なければ null＝標準） */
  winArt(pid) { return skinArt(this.map(pid)?.winFx); }
  winColors(pid) { return this.equipped(pid, 'winFx')?.colors ?? null; }

  /** カードの裏（画面を見ている人の装備） */
  applyBack(app) {
    const id = this.map(this.viewerId)?.cardBack ?? (this.localIds || !this.viewerId ? this.mine.cardBack : null);
    const it = this.spec(id);
    const art = skinArt(id);
    setArt(app, '--back-art', art);
    app.toggleAttribute('data-painted-back', Boolean(art));
    if (it?.filter && !art) app.style.setProperty('--back-filter', it.filter); else app.style.removeProperty('--back-filter');
  }

  /** いま画面にある兵士・城に、装備を反映しなおす（装備や席の情報が変わったとき） */
  refresh(root) {
    for (const el of root.querySelectorAll('.soldier[data-owner]')) this.styleSoldier(el, el.dataset.owner);
    for (const el of root.querySelectorAll('.castle[data-player-id]')) this.styleCastle(el, el.dataset.playerId);
    this.applyBack(root);
  }
}

/** 景品の見た目の見本（ショップ・ガチャ・所持品で使う）。HTML は組み立てず、DOM を返す */
export function itemPreview(it) {
  const box = document.createElement('span');
  box.className = `item-preview slot-${it.slot}`;
  const img = (src, filter) => { const i = new Image(); i.src = src; i.alt = ''; i.loading = 'lazy'; if (filter) i.style.filter = filter; box.append(i); };
  const art = skinArt(it.id);
  if (art) {
    img(art);
    if (it.slot === 'title') {
      const title = document.createElement('b');
      title.textContent = it.text ?? it.name;
      box.append(title);
    }
  } else if (it.slot === 'unit') img('assets/units/knight-blue.png', it.filters?.blue);
  else if (it.slot === 'castle') img('assets/castles/castle-blue.png', it.filters?.blue);
  else if (it.slot === 'cardBack') img('assets/ui/card-back.png', it.filter);
  else if (it.slot === 'attackFx') img('assets/fx/fireball.png', it.filter);
  else if (it.slot === 'icon') img(it.image);
  else if (it.slot === 'winFx') for (const c of it.colors ?? []) { const s = document.createElement('i'); s.style.background = /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#ccc'; box.append(s); }
  else if (it.slot === 'title') { const t = document.createElement('b'); t.textContent = it.text ?? it.name; box.append(t); }
  return box;
}
