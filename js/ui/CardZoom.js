// デッキ編成・図鑑でカードを長押しすると、カードを大きく出す。押してなぞると、どの向きにも360度回せる（裏は装備中のカードの裏）。
// マウスを乗せる・端末を傾けると、カードが小さく傾いて、偏光（Hologram.js の光）が動く。タップ・Esc・×で閉じる。
// 長押ししたカードには data-zoom="<カード種類>" を付けておく（付けた所だけが対象）。
import { mountMiniCard } from './cardView.js';
import { cardDescription } from './text.js';
import { createRelief, reliefPaths } from './CardRelief.js';
import { canRequestFoilTilt, enableFoilTilt } from './Hologram.js';

const HOLD_MS = 420;       // 長押しと見なす時間
const MOVE_LIMIT = 10;     // これ以上動いたら、長押しではなくスクロール
const MAX_TILT = 18;       // 傾きの最大（度）。マウスを乗せる・端末を傾けるとき
const DRAG_RAD_PER_PX = 0.012; // なぞったときの回り方（1px で約0.7度。カードの幅をなぞると、ほぼ半回転）

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
    <p class="zoom-hint">なぞると回せます（裏も見られます）。ダブルタップで正面へ。外をタップで閉じる</p>
    <button type="button" class="zoom-reset" hidden>正面に戻す</button>
    <button type="button" class="zoom-sensor" hidden>傾きセンサーを使う</button>`;
  root.append(dialog);
  const stage = dialog.querySelector('.zoom-stage');
  const nameEl = dialog.querySelector('.zoom-name');
  const textEl = dialog.querySelector('.zoom-text');
  const sensorBtn = dialog.querySelector('.zoom-sensor');
  const resetBtn = dialog.querySelector('.zoom-reset');
  const shadow = span('zoom-shadow');
  let card = null;
  let relief = null;       // WebGL の凹凸（使えないときは null）
  let openId = 0;          // 読み込み中に閉じた・別のカードを開いたときに、古い結果を捨てる
  let slowFrames = 0;      // 描くのが遅いフレームの数。続いたら軽い表示に切りかえる
  let lastPaint = 0;

  // ---------- 向き（どの向きにも360度）と、小さな傾き ----------
  // 向き：押してなぞると、なぞった方向へカードが回る（裏も見える）。離すと少し回り続けて止まる。ダブルタップ・「正面に戻す」で正面へ。
  //   回転はクォータニオン [w, x, y, z]（CSS と同じ座標：x 右・y 下・z 手前）で持ち、画面の向きで足していく（ジンバルロックしない）
  // 傾き：マウスを乗せる・端末を傾けると、今の向きの上に小さく傾く（今までと同じ。光が動く）
  //   指・マウス・センサーの位置は「目標」に入れるだけ。描くのは1フレームに1回で、目標に向かって少しずつ近づける
  const target = { x: 0.5, y: 0.5 };
  const now = { x: 0.5, y: 0.5 };
  let q = [1, 0, 0, 0];   // カードの向き
  let spin = null;        // 離したあとの回転の勢い { ax, ay, az, w }（ラジアン／ミリ秒）
  let homing = false;     // 正面へ戻している途中
  let frame = 0;
  let lastStep = 0;
  let held = false;       // 指（マウス）で押してなぞっているか
  let drag = null;        // { x, y, t, moved }
  let justDragged = false; // なぞったあとの click で閉じないように
  let rect = null;        // stage の位置（開いたとき・向きが変わったときに測る。動かすたびには測らない）
  const measure = () => { rect = stage.getBoundingClientRect(); relief?.resize(); };

  const qMul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
  const qNorm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
  const qAxis = (ax, ay, az, rad) => { const s = Math.sin(rad / 2); return [Math.cos(rad / 2), ax * s, ay * s, az * s]; };
  /** 画面の向きで回す（いまの向きの上に足す） */
  const turn = (ax, ay, az, rad) => { q = qNorm(qMul(qAxis(ax, ay, az, rad), q)); };
  const facingFront = (n) => n.z >= 0;
  const rotateCss = () => {
    const w = Math.min(1, Math.abs(q[0]));
    const s = Math.sqrt(1 - w * w);
    if (s < 1e-5) return '';
    const deg = (2 * Math.acos(w) * 180 / Math.PI) * Math.sign(q[0] || 1);
    return ` rotate3d(${(q[1] / s).toFixed(5)}, ${(q[2] / s).toFixed(5)}, ${(q[3] / s).toFixed(5)}, ${deg.toFixed(3)}deg)`;
  };
  /** カードの表の向き（手前が z+）。CSS の rotate3d と同じ回し方 */
  const normalOf = (tiltX, tiltY) => {
    // q で (0,0,1) を回す
    const [w, x, y, z] = q;
    let nx = 2 * (x * z + w * y);
    let ny = 2 * (y * z - w * x);
    let nz = 1 - 2 * (x * x + y * y);
    // そのうえに傾き（rotateX(tiltX) rotateY(tiltY) の順で、右から当たる）
    const cy = Math.cos(tiltY), sy = Math.sin(tiltY);
    [nx, nz] = [nx * cy + nz * sy, -nx * sy + nz * cy];
    const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    [ny, nz] = [ny * cx - nz * sx, ny * sx + nz * cx];
    return { x: nx, y: ny, z: nz };
  };
  const rotated = () => Math.abs(q[0]) < 0.9995;

  const paint = () => {
    if (!card) return;
    const still = reduced();
    // 小さな傾き（マウス・センサー）。動きを減らす設定では傾けない
    const rx = still ? 0 : (0.5 - now.y) * 2 * MAX_TILT;
    const ry = still ? 0 : (now.x - 0.5) * 2 * MAX_TILT;
    const rot = rotateCss();
    const tilt = still ? '' : ` rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    card.style.transform = `translate3d(0,0,0)${tilt}${rot}`;
    const n = normalOf(rx * Math.PI / 180, ry * Math.PI / 180);
    const front = facingFront(n);
    card.classList.toggle('zoom-flipped', !front);
    resetBtn.hidden = !rotated();
    // 光・影・凹凸は「表がどちらを向いているか」から決める（傾きだけのときは今までと同じ値になる）
    const lx = Math.asin(Math.max(-1, Math.min(1, -n.y))) * 180 / Math.PI;
    const ly = Math.asin(Math.max(-1, Math.min(1, n.x))) * 180 / Math.PI;
    const ex = Math.max(-60, Math.min(60, lx));
    const ey = Math.max(-60, Math.min(60, ly));
    // 机に落ちる影は、カードが傾くほど光の反対へずれて、ぼける
    shadow.style.transform = `translate3d(${(ey * 0.7).toFixed(1)}px, ${(-ex * 0.5 + Math.abs(ex) * 0.2).toFixed(1)}px, 0) scale(${(1 + (Math.abs(ex) + Math.abs(ey)) / 160).toFixed(3)})`;
    if (relief && front) {
      const t0 = performance.now();
      if (!relief.draw(ex, ey)) dropRelief();
      // 2フレームに1回より遅い描画が続く端末では、凹凸の光をやめて軽い表示にする
      const spent = performance.now() - t0;
      const gap = lastPaint ? t0 - lastPaint : 16;
      lastPaint = t0;
      slowFrames = spent > 12 || gap > 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 24 && !forcedFull) { degraded = true; dropRelief(); card?.classList.add('zoom-lite'); }
    }
    const fx = `${(Math.max(0, Math.min(1, 0.5 + ey / (2 * MAX_TILT))) * 100).toFixed(1)}%`;
    const fy = `${(Math.max(0, Math.min(1, 0.5 - ex / (2 * MAX_TILT))) * 100).toFixed(1)}%`;
    card.style.setProperty('--foil-x', fx);
    card.style.setProperty('--foil-y', fy);
    card.style.setProperty('--gloss-x', fx);
    card.style.setProperty('--gloss-y', fy);
  };
  const step = (time) => {
    frame = 0;
    if (!card) return;
    const dt = lastStep ? Math.min(50, time - lastStep) : 16;
    lastStep = time;
    const k = held ? 0.28 : 0.12;           // 触れているあいだは素早く、戻るときはゆっくり
    now.x += (target.x - now.x) * k;
    now.y += (target.y - now.y) * k;
    if (spin && !held) {
      turn(spin.ax, spin.ay, spin.az, spin.w * dt);
      spin.w *= Math.pow(0.94, dt / 16);
      if (Math.abs(spin.w) < 0.00005) spin = null;
    }
    if (homing) {
      // 正面へ：今の向きと正面のあいだを少しずつ縮める
      const t = 1 - Math.pow(0.82, dt / 16);
      const sign = q[0] < 0 ? -1 : 1;
      q = qNorm(q.map((v, i) => v * (1 - t) + (i === 0 ? sign : 0) * t));
      if (!rotated()) { q = [1, 0, 0, 0]; homing = false; }
    }
    paint();
    const settled = Math.abs(target.x - now.x) < 0.002 && Math.abs(target.y - now.y) < 0.002;
    if (settled && !held && !spin && !homing) {
      lastPaint = 0; lastStep = 0;
      card.classList.remove('foil-input');
      if (!rotated()) { card.style.removeProperty('--foil-x'); card.style.removeProperty('--foil-y'); }
      return;
    }
    frame = requestAnimationFrame(step);
  };
  const kick = () => { if (!frame) frame = requestAnimationFrame(step); };
  const aim = (px, py) => {
    target.x = Math.min(1, Math.max(0, px));
    target.y = Math.min(1, Math.max(0, py));
    if (card) card.classList.add('foil-input');
    kick();
  };
  const hoverAim = (event) => {
    if (!rect || !rect.width) measure();
    if (!rect.width || !rect.height) return;
    aim((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  const orient = (event) => {
    if (event.gamma == null || event.beta == null || !dialog.open || held) return;
    aim(0.5 + event.gamma / 60, 0.5 + (event.beta - 40) / 60);
  };
  const goHome = () => {
    spin = null;
    if (reduced()) { q = [1, 0, 0, 0]; paint(); return; }
    homing = true; kick();
  };

  // 押してなぞると回す（なぞった方向へ、表が向く）
  stage.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    if (event.pointerType === 'mouse') event.preventDefault(); // マウスで範囲選択・画像のドラッグが始まらないように
    window.getSelection?.()?.removeAllRanges();
    held = true; spin = null; homing = false;
    drag = { x: event.clientX, y: event.clientY, t: performance.now(), moved: 0, vx: 0, vy: 0 };
    measure();
    target.x = target.y = 0.5;   // 回すあいだは、小さな傾きは真ん中へ
    card?.classList.add('foil-input');
    kick();
  });
  window.addEventListener('pointermove', (event) => {
    if (!dialog.open) return;
    if (held && drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const len = Math.hypot(dx, dy);
      if (!len) return;
      const t = performance.now();
      const dt = Math.max(1, t - drag.t);
      const rad = len * DRAG_RAD_PER_PX;
      turn(-dy / len, dx / len, 0, rad);
      // 離したときの勢い（最近の動きを少しずつ混ぜる）
      drag.vx = drag.vx * 0.5 + (dx / dt) * 0.5;
      drag.vy = drag.vy * 0.5 + (dy / dt) * 0.5;
      drag.moved += len;
      drag.x = event.clientX; drag.y = event.clientY; drag.t = t;
      kick();
    } else if (event.pointerType === 'mouse') hoverAim(event);
  }, { passive: true });
  const release = () => {
    if (!held) return;
    held = false;
    if (drag && drag.moved > 6) {
      justDragged = true;
      const speed = Math.hypot(drag.vx, drag.vy);
      // 最後に動かしてから少し止まっていたら、勢いはつけない
      if (!reduced() && speed > 0.05 && performance.now() - drag.t < 80) {
        spin = { ax: -drag.vy / speed, ay: drag.vx / speed, az: 0, w: Math.min(speed, 3) * DRAG_RAD_PER_PX };
      }
    }
    drag = null;
    aim(0.5, 0.5);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  stage.addEventListener('dblclick', (event) => { event.stopPropagation(); goHome(); });
  resetBtn.addEventListener('click', (event) => { event.stopPropagation(); goHome(); });
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
  dialog.addEventListener('click', (event) => {
    if (justDragged) { justDragged = false; return; }   // なぞって回したあと、外で指を離しても閉じない
    if (!event.target.closest('.zoom-stage, .zoom-text, .zoom-name, .zoom-hint, .zoom-sensor, .zoom-reset')) close();
  });
  const dropRelief = () => {
    relief?.destroy(); relief = null;
    card?.classList.remove('zoom-gl');
  };
  dialog.addEventListener('close', () => {
    window.removeEventListener('deviceorientation', orient);
    openId++; dropRelief();
    orienting = false; held = false; drag = null; spin = null; homing = false; justDragged = false; q = [1, 0, 0, 0];
    card = null; rect = null; slowFrames = 0; lastPaint = 0; lastStep = 0;
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
    // 裏：装備中のカードの裏（#app の --back-art。なければ標準の絵）。表が向こうを向いたときだけ見せる
    const back = span('zoom-back');
    const backImg = document.createElement('img');
    backImg.className = 'zoom-back-img'; backImg.src = 'assets/ui/card-back.png'; backImg.alt = ''; backImg.draggable = false;
    back.append(backImg);
    card.append(back);
    shadow.style.transform = '';
    stage.replaceChildren(shadow, card);
    nameEl.textContent = def.name ?? '';
    textEl.textContent = `${rarities?.[def.rarity]?.name ?? ''}　${cardDescription(def, rules)}`;
    target.x = target.y = now.x = now.y = 0.5;
    q = [1, 0, 0, 0]; spin = null; homing = false; resetBtn.hidden = true;
    if (!dialog.open) dialog.showModal();
    measure();
    if (canRequestFoilTilt() && !sensorAllowed) sensorBtn.hidden = reduced();
    else listenOrientation();
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
