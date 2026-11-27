// Presentation only: accepts the immutable, already committed /api/gacha/pull results.
import { itemPreview } from './Cosmetics.js';

const NAMES = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンド', special: 'スペシャル' };
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special'];
const node = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (text, fn, cls = '') => { const b = node('button', `plank-btn ${cls}`, text); b.type = 'button'; b.addEventListener('click', fn); return b; };

/** Six planar faces, with a separate hinged lid. No WebGL context or render loop. */
export function treasureChest() {
  const camera = node('div', 'royal-chest-camera'); camera.setAttribute('aria-hidden', 'true');
  camera.innerHTML = `<div class="royal-chest"><div class="chest-body"><i class="chest-front"><span class="chest-crest">♛</span></i><i class="chest-back"></i><i class="chest-left"></i><i class="chest-right"></i><i class="chest-floor"></i></div><div class="chest-lid"><i class="lid-top"><span>✦</span></i><i class="lid-front"></i><i class="lid-back"></i><i class="lid-left"></i><i class="lid-right"></i></div></div>`;
  return camera;
}

export class GachaPresentation {
  constructor({ host, results, reducedMotion = false, onClose = () => {} }) {
    this.results = results; this.onClose = onClose; this.reduced = reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.returnFocus = document.activeElement; this.phase = 'charge'; this.index = 0; this.closed = false;
    this.high = results.filter(r => ORDER.indexOf(r.rarity) >= 3);
    this.queue = results.length === 1 ? results : this.high;
    const best = results.reduce((a, r) => ORDER.indexOf(r.rarity) > ORDER.indexOf(a) ? r.rarity : a, 'common');
    const root = this.root = node('section', 'royal-reveal'); root.dataset.phase = 'charge'; root.dataset.rarity = best; root.classList.toggle('fx-lite', new URLSearchParams(location.search).get('fx') === 'lite');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'ガチャ演出と結果');
    this.title = node('h3', 'royal-reveal-title', '王家の宝箱'); this.title.setAttribute('aria-live', 'polite');
    this.skip = button('スキップ', () => this.showResults(), 'royal-skip');
    this.stage = node('div', 'royal-stage');
    const halo = node('div', 'royal-halo');
    const particles = node('div', 'royal-particles'); particles.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 16; i++) { const p = node('i', ''); p.style.setProperty('--n', i); particles.append(p); }
    this.chest = treasureChest(); this.cardSlot = node('div', 'royal-card-slot');
    this.stage.append(halo, particles, this.chest, this.cardSlot);
    this.hint = node('p', 'royal-hint', '光が集まる…');
    this.controls = node('div', 'royal-controls');
    this.advance = button('タップで早送り', () => this.next(), 'royal-advance');
    this.controls.append(this.advance); root.append(this.skip, this.title, this.stage, this.hint, this.controls);
    root.addEventListener('keydown', e => this.key(e));
    this.stage.addEventListener('click', () => { if (this.phase !== 'inspect' && this.phase !== 'results') this.next(); });
    host.append(root); this.skip.focus({ preventScroll: true });
    if (this.reduced) this.showResults(); else this.schedule(1000);
  }
  schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.next(), ms); }
  next() {
    if (this.closed) return;
    clearTimeout(this.timer);
    if (this.phase === 'charge') {
      this.phase = 'open'; this.root.dataset.phase = 'open'; this.hint.textContent = '封印が解かれる…'; this.schedule(700);
    } else if (this.phase === 'open') {
      if (this.queue.length) this.revealCard(); else this.showResults();
    } else if (this.phase === 'card') {
      this.index++;
      if (this.index < this.queue.length) this.revealCard(); else this.showResults();
    }
  }
  makeCard(r) {
    const card = node('div', `royal-card r-${r.rarity}`);
    const front = node('div', 'royal-card-front');
    const mark = node('span', r.duplicate ? 'royal-duplicate' : 'royal-new', r.duplicate ? `重複 +${r.pointsGained}pt` : 'NEW');
    const crest = new Image(); crest.src = 'assets/ui/kingdom-crest.png'; crest.alt = ''; crest.className = 'royal-card-crest';
    front.append(mark, crest, itemPreview(r.item), node('span', 'royal-rarity', NAMES[r.rarity] ?? r.rarity), node('strong', 'royal-card-name', r.item.name));
    const back = node('div', 'royal-card-back'); const img = new Image(); img.src = 'assets/ui/card-back.png'; img.alt = '王国のカード裏面'; back.append(img);
    back.setAttribute('aria-hidden', 'true'); card.append(front, back); return card;
  }
  revealCard() {
    this.phase = 'card'; this.root.dataset.phase = 'card'; const r = this.queue[this.index];
    this.root.dataset.rarity = r.rarity;
    this.title.textContent = `${NAMES[r.rarity] ?? r.rarity}！`;
    this.hint.textContent = this.results.length > 1 ? `特別な宝物 ${this.index + 1} / ${this.queue.length}` : '新しい宝物との出会い';
    this.cardSlot.replaceChildren(this.makeCard(r)); this.schedule(1500);
  }
  showResults() {
    if (this.closed) return;
    clearTimeout(this.timer); this.phase = 'results'; this.root.dataset.phase = 'results';
    this.title.textContent = `${this.results.length === 10 ? '10連' : '召喚'}結果`; this.skip.hidden = true; this.stage.hidden = true;
    this.gallery?.remove(); this.gallery = node('div', 'royal-results');
    for (const r of this.results) {
      const b = button('', () => this.inspect(r), `royal-result r-${r.rarity}`);
      b.setAttribute('aria-label', `${r.item.name}、${NAMES[r.rarity] ?? r.rarity}、${r.duplicate ? `重複、${r.pointsGained}ポイント` : 'NEW'}。観賞する`);
      b.append(node('span', r.duplicate ? 'royal-duplicate' : 'royal-new', r.duplicate ? `重複 +${r.pointsGained}pt` : 'NEW'), itemPreview(r.item), node('span', 'royal-rarity', NAMES[r.rarity] ?? r.rarity), node('strong', '', r.item.name));
      this.gallery.append(b);
    }
    this.root.insertBefore(this.gallery, this.hint);
    const points = this.results.reduce((n, r) => n + (r.duplicate ? r.pointsGained : 0), 0);
    this.hint.textContent = `カードをタップで観賞${points ? ` ・ 重複変換 合計 +${points}pt` : ''}`;
    this.done = button('結果を閉じる', () => this.close()); this.controls.replaceChildren(this.done); this.done.focus({ preventScroll: true });
  }
  inspect(r) {
    this.phase = 'inspect'; this.root.dataset.phase = 'inspect'; this.root.dataset.rarity = r.rarity;
    this.gallery.hidden = true; this.stage.hidden = false; this.title.textContent = r.item.name;
    const card = this.makeCard(r); this.cardSlot.replaceChildren(card); this.angle = 0;
    this.hint.textContent = 'ドラッグで傾ける / 回転スライダーで裏返す';
    const range = node('input', 'royal-rotation'); range.type = 'range'; range.min = '-180'; range.max = '180'; range.value = '0'; range.setAttribute('aria-label', 'カードの回転角度');
    const rotate = (x, y = 0) => { card.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`; const back = Math.abs(x) > 90; card.children[0].setAttribute('aria-hidden', String(back)); card.children[1].setAttribute('aria-hidden', String(!back)); };
    range.addEventListener('input', () => { this.angle = Number(range.value); rotate(this.angle); });
    let pointer = null;
    card.addEventListener('pointerdown', e => { pointer = { x: e.clientX, y: e.clientY }; card.setPointerCapture(e.pointerId); });
    card.addEventListener('pointermove', e => { if (pointer) rotate(this.angle + Math.max(-28, Math.min(28, (e.clientX - pointer.x) / 3)), Math.max(-18, Math.min(18, (pointer.y - e.clientY) / 4))); });
    const release = () => { pointer = null; rotate(this.angle); };
    card.addEventListener('pointerup', release); card.addEventListener('pointercancel', release);
    const flip = button('裏返す', () => { this.angle = this.angle === 0 ? 180 : 0; range.value = String(this.angle); rotate(this.angle); });
    const reset = button('角度を戻す', () => { this.angle = 0; range.value = '0'; rotate(0); });
    const back = button('一覧に戻る', () => this.showResults());
    this.controls.replaceChildren(range, flip, reset, back); back.focus({ preventScroll: true });
  }
  key(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.phase === 'results') this.close(); else this.showResults(); }
    if (e.key === 'Tab') {
      const list = [...this.root.querySelectorAll('button, input')].filter(e => !e.disabled && e.getClientRects().length);
      const first = list[0], last = list.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  close() { if (this.closed) return; this.closed = true; clearTimeout(this.timer); this.root.remove(); this.onClose(); if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true }); }
}
