// デッキ編成・図鑑でカードを長押しすると、カードを大きく出す。指（マウス）でなぞる・端末を傾けると、
// カードが傾いて、偏光（Hologram.js の光）が動く。タップ・Esc・×で閉じる。
// 長押ししたカードには data-zoom="<カード種類>" を付けておく（付けた所だけが対象）。
import { mountMiniCard } from './cardView.js';
import { cardDescription } from './text.js';

const HOLD_MS = 420;       // 長押しと見なす時間
const MOVE_LIMIT = 10;     // これ以上動いたら、長押しではなくスクロール
const MAX_TILT = 18;       // 傾きの最大（度）

const reduced = () => document.documentElement.classList.contains('reduced-motion')
  || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initCardZoom({ root = document.getElementById('app'), cards, rarities, rules }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'card-zoom';
  dialog.setAttribute('aria-label', 'カードの拡大表示');
  dialog.innerHTML = `
    <button type="button" class="zoom-close" aria-label="閉じる">×</button>
    <div class="zoom-stage"></div>
    <p class="zoom-name"></p>
    <p class="zoom-text"></p>
    <p class="zoom-hint">なぞる・傾けると光ります。外をタップで閉じる</p>`;
  root.append(dialog);
  const stage = dialog.querySelector('.zoom-stage');
  const nameEl = dialog.querySelector('.zoom-name');
  const textEl = dialog.querySelector('.zoom-text');
  let card = null;

  // ---------- なめらかな傾き ----------
  // 指・マウス・センサーの位置は「目標」に入れるだけ。描くのは1フレームに1回で、目標に向かって少しずつ近づける
  // （入力の間隔がばらついても、動きがカクカクしない）。指を離すと、真ん中へゆっくり戻る。
  const target = { x: 0.5, y: 0.5 };
  const now = { x: 0.5, y: 0.5 };
  let frame = 0;
  let held = false;       // 指（マウス）が乗っているか
  let rect = null;        // stage の位置（開いたとき・向きが変わったときに測る。動かすたびには測らない）
  const measure = () => { rect = stage.getBoundingClientRect(); };

  const paint = () => {
    if (!card) return;
    const rx = (0.5 - now.y) * 2 * MAX_TILT;
    const ry = (now.x - 0.5) * 2 * MAX_TILT;
    if (!reduced()) card.style.transform = `translate3d(0,0,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    const fx = `${(now.x * 100).toFixed(1)}%`;
    const fy = `${(now.y * 100).toFixed(1)}%`;
    card.style.setProperty('--foil-x', fx);
    card.style.setProperty('--foil-y', fy);
    card.style.setProperty('--gloss-x', fx);
    card.style.setProperty('--gloss-y', fy);
  };
  const step = () => {
    frame = 0;
    if (!card) return;
    const k = held ? 0.28 : 0.12;           // 触れているあいだは素早く、戻るときはゆっくり
    now.x += (target.x - now.x) * k;
    now.y += (target.y - now.y) * k;
    paint();
    const settled = Math.abs(target.x - now.x) < 0.002 && Math.abs(target.y - now.y) < 0.002;
    if (settled && !held) { card.classList.remove('foil-input'); card.style.removeProperty('--foil-x'); card.style.removeProperty('--foil-y'); return; }
    frame = requestAnimationFrame(step);
  };
  const aim = (px, py) => {
    target.x = Math.min(1, Math.max(0, px));
    target.y = Math.min(1, Math.max(0, py));
    if (card) card.classList.add('foil-input');
    if (!frame) frame = requestAnimationFrame(step);
  };
  const pointerAim = (event) => {
    if (!rect || !rect.width) measure();
    if (!rect.width || !rect.height) return;
    aim((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  const orient = (event) => {
    if (event.gamma == null || event.beta == null || !dialog.open || held) return;
    aim(0.5 + event.gamma / 60, 0.5 + (event.beta - 40) / 60);
  };
  const release = () => { held = false; aim(0.5, 0.5); };

  stage.addEventListener('pointerdown', (event) => { held = true; measure(); pointerAim(event); });
  window.addEventListener('pointermove', (event) => {
    if (!dialog.open) return;
    if (held || event.pointerType === 'mouse') pointerAim(event);
  }, { passive: true });
  window.addEventListener('pointerup', () => { if (held) release(); });
  window.addEventListener('pointercancel', () => { if (held) release(); });
  window.addEventListener('resize', () => { if (dialog.open) measure(); });
  let orienting = false;

  const close = () => { if (dialog.open) dialog.close(); };
  dialog.querySelector('.zoom-close').addEventListener('click', close);
  // カードの外（背景）のタップで閉じる。カードの上のタップ・ドラッグでは閉じない
  dialog.addEventListener('click', (event) => { if (!event.target.closest('.zoom-stage, .zoom-text, .zoom-name')) close(); });
  dialog.addEventListener('close', () => {
    window.removeEventListener('deviceorientation', orient);
    orienting = false; held = false; card = null; rect = null;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    stage.replaceChildren();
  });

  const open = (type) => {
    const def = cards?.[type];
    if (!def) return;
    card = document.createElement('div');
    card.className = 'zoom-card';
    mountMiniCard(card, type, def, rarities);
    // 枠がないカードも、同じ大きさで出す
    card.classList.add('zoom-card');
    stage.replaceChildren(card);
    nameEl.textContent = def.name ?? '';
    textEl.textContent = `${rarities?.[def.rarity]?.name ?? ''}　${cardDescription(def, rules)}`;
    target.x = target.y = now.x = now.y = 0.5;
    if (!dialog.open) dialog.showModal();
    measure();
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', orient);
      orienting = true;
    }
  };

  // ---------- 長押しの検出（まとめて受ける） ----------
  let hold = null;
  let swallow = 0;
  const cancel = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
  document.addEventListener('pointerdown', (event) => {
    if (dialog.open || event.button > 0) return;
    const source = event.target.closest?.('[data-zoom]');
    if (!source) return;
    cancel();
    const { clientX: x0, clientY: y0 } = event;
    hold = {
      x0, y0,
      timer: setTimeout(() => {
        hold = null;
        swallow = Date.now() + 900;            // 指を離したときのクリック（カードを足すなど）を止める
        open(source.dataset.zoom);
      }, HOLD_MS),
    };
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (hold && Math.hypot(event.clientX - hold.x0, event.clientY - hold.y0) > MOVE_LIMIT) cancel();
  }, { passive: true, capture: true });
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(type, cancel, true);
  document.addEventListener('click', (event) => {
    if (Date.now() < swallow && !dialog.contains(event.target)) { event.stopPropagation(); event.preventDefault(); swallow = 0; }
  }, true);
  // 長押しで出るメニュー（コピー・画像を保存）を出さない
  document.addEventListener('contextmenu', (event) => { if (event.target.closest?.('[data-zoom]') || dialog.open) event.preventDefault(); }, true);

  return { open, close };
}
