// デッキ編成・図鑑でカードを長押しすると、カードを大きく出す。指（マウス）でなぞる・端末を傾けると、
// カードが傾いて、偏光（Hologram.js の光）が動く。タップ・Esc・×で閉じる。
// 長押ししたカードには data-zoom="<カード種類>" を付けておく（付けた所だけが対象）。
import { mountMiniCard } from './cardView.js';
import { cardDescription } from './text.js';
import { createRelief, reliefPaths } from './CardRelief.js';
import { canRequestFoilTilt, enableFoilTilt } from './Hologram.js';

const HOLD_MS = 420;       // 長押しと見なす時間
const MOVE_LIMIT = 10;     // これ以上動いたら、長押しではなくスクロール
const MAX_TILT = 18;       // 傾きの最大（度）

const EDGE_LAYERS = 6;     // カードの厚み（枠の形の薄い層を重ねる）
const WALL_LAYERS = 6;     // 絵の窓の内側の壁（枠から、奥にある絵まで）
const FOIL = new Set(['rare', 'epic', 'legendary', 'special']);

let degraded = false;      // この端末で一度遅かったら、次からは最初から軽い表示にする
const reduced = () => document.documentElement.classList.contains('reduced-motion')
  || matchMedia('(prefers-reduced-motion: reduce)').matches;
// 立体の表示の段階。full：WebGL で凹凸と材質の光／lite：CSS の層だけ（厚み・奥行き・浮かせた部品）
// URL に ?fx=lite で軽い方を試せる。メモリやCPUの少ない端末も軽い方にする
function reliefTier() {
  const q = new URLSearchParams(location.search).get('fx');
  if (q === 'lite' || q === 'full') return q;
  if (degraded) return 'lite';
  if ((navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) return 'lite';
  return 'full';
}
const span = (className) => { const el = document.createElement('span'); el.className = className; el.setAttribute('aria-hidden', 'true'); return el; };

export function initCardZoom({ root = document.getElementById('app'), cards, rarities, rules }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'card-zoom';
  dialog.setAttribute('aria-label', 'カードの拡大表示');
  dialog.innerHTML = `
    <button type="button" class="zoom-close" aria-label="閉じる">×</button>
    <div class="zoom-stage"></div>
    <p class="zoom-name"></p>
    <p class="zoom-text"></p>
    <p class="zoom-hint">なぞる・傾けると光ります。外をタップで閉じる</p>
    <button type="button" class="zoom-sensor" hidden>傾きセンサーを使う</button>`;
  root.append(dialog);
  const stage = dialog.querySelector('.zoom-stage');
  const nameEl = dialog.querySelector('.zoom-name');
  const textEl = dialog.querySelector('.zoom-text');
  const sensorBtn = dialog.querySelector('.zoom-sensor');
  const shadow = span('zoom-shadow');
  let card = null;
  let relief = null;       // WebGL の凹凸（使えないときは null）
  let openId = 0;          // 読み込み中に閉じた・別のカードを開いたときに、古い結果を捨てる
  let slowFrames = 0;      // 描くのが遅いフレームの数。続いたら軽い表示に切りかえる
  let lastPaint = 0;

  // ---------- なめらかな傾き ----------
  // 指・マウス・センサーの位置は「目標」に入れるだけ。描くのは1フレームに1回で、目標に向かって少しずつ近づける
  // （入力の間隔がばらついても、動きがカクカクしない）。指を離すと、真ん中へゆっくり戻る。
  const target = { x: 0.5, y: 0.5 };
  const now = { x: 0.5, y: 0.5 };
  let frame = 0;
  let held = false;       // 指（マウス）が乗っているか
  let rect = null;        // stage の位置（開いたとき・向きが変わったときに測る。動かすたびには測らない）
  const measure = () => { rect = stage.getBoundingClientRect(); relief?.resize(); };

  const paint = () => {
    if (!card) return;
    const still = reduced();
    const rx = still ? 0 : (0.5 - now.y) * 2 * MAX_TILT;
    const ry = still ? 0 : (now.x - 0.5) * 2 * MAX_TILT;
    if (!still) {
      card.style.transform = `translate3d(0,0,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      // 机に落ちる影は、カードが傾くほど光の反対へずれて、ぼける
      shadow.style.transform = `translate3d(${(ry * 0.7).toFixed(1)}px, ${(-rx * 0.5 + Math.abs(rx) * 0.2).toFixed(1)}px, 0) scale(${(1 + (Math.abs(rx) + Math.abs(ry)) / 160).toFixed(3)})`;
    }
    if (relief) {
      const t0 = performance.now();
      if (!relief.draw(rx, ry)) dropRelief();
      // 2フレームに1回より遅い描画が続く端末では、凹凸の光をやめて軽い表示にする
      const spent = performance.now() - t0;
      const gap = lastPaint ? t0 - lastPaint : 16;
      lastPaint = t0;
      slowFrames = spent > 12 || gap > 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 24 && !forcedFull) { degraded = true; dropRelief(); card?.classList.add('zoom-lite'); }
    }
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
    if (settled && !held) { lastPaint = 0; card.classList.remove('foil-input'); card.style.removeProperty('--foil-x'); card.style.removeProperty('--foil-y'); return; }
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
    if (event.gamma == null || event.beta == null || !dialog.open) return;
    // センサーの値が届いた＝もう使える（Chrome にも requestPermission があるが、聞かなくても届く）。ボタンはいらない
    if (!sensorAllowed) { sensorAllowed = true; sensorBtn.hidden = true; }
    if (held) return;
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
  let sensorAllowed = false;
  const listenOrientation = () => {
    if (orienting || !window.DeviceOrientationEvent) return;
    window.addEventListener('deviceorientation', orient);
    orienting = true;
  };
  // iPhone などは、ボタンを押したときにだけセンサーの許可を聞ける（勝手には聞かない）
  sensorBtn.addEventListener('click', async (event) => {
    event.stopPropagation();   // 外のタップとして閉じない
    sensorBtn.hidden = true;
    if (await enableFoilTilt()) { sensorAllowed = true; if (dialog.open) listenOrientation(); }
  });

  const close = () => { if (dialog.open) dialog.close(); };
  dialog.querySelector('.zoom-close').addEventListener('click', close);
  // カードの外（背景）のタップで閉じる。カードの上のタップ・ドラッグでは閉じない
  dialog.addEventListener('click', (event) => { if (!event.target.closest('.zoom-stage, .zoom-text, .zoom-name, .zoom-hint, .zoom-sensor')) close(); });
  const dropRelief = () => {
    relief?.destroy(); relief = null;
    card?.classList.remove('zoom-gl');
  };
  dialog.addEventListener('close', () => {
    window.removeEventListener('deviceorientation', orient);
    openId++; dropRelief();
    orienting = false; held = false; card = null; rect = null; slowFrames = 0; lastPaint = 0;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    stage.replaceChildren();
  });

  // カードを立体にする：厚み・窓の内側の壁・奥の絵・枠・浮かせた部品・名前やメダルを、それぞれ違う奥行きに置く
  const build3d = (def) => {
    const frameImg = card.querySelector('.mini-card-frame');
    const image = card.querySelector('.mini-card-image');
    if (!frameImg || !image) return;
    const src = frameImg.getAttribute('src');
    const paths = reliefPaths(src);
    card.classList.add('zoom-3d');
    card.dataset.material = def.monster ? 'beast' : card.dataset.rarity ?? 'other';
    // url() は CSS ファイルの場所から読まれるので、ページからの絶対パスにして渡す
    const abs = (path) => `url("${new URL(path, document.baseURI).href}")`;
    card.style.setProperty('--frame-url', abs(src));
    if (paths) card.style.setProperty('--raised-url', abs(paths.raised));
    const layers = [];
    for (let i = 1; i <= EDGE_LAYERS; i++) { const el = span('zoom-edge'); el.style.setProperty('--i', i); layers.push(el); }
    if (!def.monster) for (let i = 1; i <= WALL_LAYERS; i++) { const el = span('zoom-wall'); el.style.setProperty('--i', i); layers.push(el); }
    const floor = span('zoom-floor');
    // 絵の上：くぼんだ窓のふちの影と、ひかえめなつや（絵そのものは変えない）
    image.append(span('zoom-recess'), span('zoom-sheen'));
    if (FOIL.has(card.dataset.rarity)) image.append(span('foil-sheet zoom-foil'));
    const raised = paths ? span('zoom-raised') : null;   // CSS だけのとき：枠の絵を王冠・宝石の形で切り抜いて浮かせる
    if (raised) { const img = frameImg.cloneNode(); img.className = 'zoom-raised-img'; raised.append(img); }
    card.prepend(...layers, floor);
    // 浮かせた部品の真下（元の枠の絵の王冠）を少し暗くして、傾けたときに側面・影に見せる（WebGL のときは光の計算でする）
    if (raised) card.append(span('zoom-raised-shade'), raised);
    if (!paths || tier === 'lite') { card.classList.add('zoom-lite'); return; }
    // WebGL の凹凸（読み込めたら、元の枠の絵と入れかえる）
    const id = openId;
    const current = () => id === openId && Boolean(card);
    const lost = () => { if (current()) { dropRelief(); card.classList.add('zoom-lite'); } };
    createRelief({ frameSrc: src, preset: card.dataset.material, isCurrent: current, onLost: lost }).then(r => {
      if (!current()) { r?.destroy(); return; }
      if (!r) { card.classList.add('zoom-lite'); return; }
      relief = r;
      frameImg.after(r.base); raised.after(r.raised);
      relief.resize();
      if (relief.draw(0, 0)) { card.classList.add('zoom-gl'); paint(); } else dropRelief();
    }, () => card?.classList.add('zoom-lite'));
  };
  let tier = 'full';
  let forcedFull = false;   // ?fx=full のときは、遅くても軽い表示に切りかえない（見た目の確認用）

  const open = (type) => {
    const def = cards?.[type];
    if (!def) return;
    openId++; dropRelief();
    tier = reliefTier();
    forcedFull = new URLSearchParams(location.search).get('fx') === 'full';
    card = document.createElement('div');
    card.className = 'zoom-card';
    mountMiniCard(card, type, def, rarities);
    // 枠がないカードも、同じ大きさで出す
    card.classList.add('zoom-card');
    if (card.classList.contains('mini-card')) build3d(def);
    shadow.style.transform = '';
    stage.replaceChildren(shadow, card);
    nameEl.textContent = def.name ?? '';
    textEl.textContent = `${rarities?.[def.rarity]?.name ?? ''}　${cardDescription(def, rules)}`;
    target.x = target.y = now.x = now.y = 0.5;
    if (!dialog.open) dialog.showModal();
    measure();
    // いつも聞いておく（許可がいる端末では、許可されるまで何も届かないだけ）。許可を聞ける端末には、まだ値が届いていなければボタンも出す
    listenOrientation();
    if (canRequestFoilTilt() && !sensorAllowed) sensorBtn.hidden = reduced();
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
