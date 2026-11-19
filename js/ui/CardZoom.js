// デッキ編成・図鑑でカードを長押しすると、カードを大きく出す。押してなぞると、どの向きにも360度回せる（裏は装備中のカードの裏）。
// マウスを乗せる・端末を傾けると、カードが小さく傾いて、偏光（Hologram.js の光）が動く。タップ・Esc・×で閉じる。
// 長押ししたカードには data-zoom="<カード種類>" を付けておく（付けた所だけが対象）。
import { mountMiniCard } from './cardView.js';
import { cardDescription } from './text.js';
import { cardMotionReduced as reduced, createCard3D } from './Card3D.js';
import { canRequestFoilTilt, enableFoilTilt } from './Hologram.js';

const HOLD_MS = 420;       // 長押しと見なす時間
const MOVE_LIMIT = 10;     // これ以上動いたら、長押しではなくスクロール
const MAX_TILT = 18;       // 傾きの最大（度）。マウスを乗せる・端末を傾けるとき
const DRAG_RAD_PER_PX = 0.012; // なぞったときの回り方（1px で約0.7度。カードの幅をなぞると、ほぼ半回転）

export function initCardZoom({ root = document.getElementById('app'), cards, rarities, rules }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'card-zoom';
  dialog.setAttribute('aria-label', 'カードの拡大表示');
  dialog.innerHTML = `
    <button type="button" class="zoom-close" aria-label="閉じる">×</button>
    <div class="zoom-stage"></div>
    <div class="zoom-details">
      <p class="zoom-name"></p>
      <p class="zoom-text"></p>
      <p class="zoom-hint">なぞると回せます（裏も見られます）。ダブルタップで正面へ。外をタップで閉じる</p>
      <div class="zoom-actions">
        <button type="button" class="zoom-reset" hidden>正面に戻す</button>
        <button type="button" class="zoom-sensor" hidden>傾きセンサーを使う</button>
      </div>
    </div>`;
  root.append(dialog);
  const stage = dialog.querySelector('.zoom-stage');
  const nameEl = dialog.querySelector('.zoom-name');
  const textEl = dialog.querySelector('.zoom-text');
  const sensorBtn = dialog.querySelector('.zoom-sensor');
  const resetBtn = dialog.querySelector('.zoom-reset');
  const shadow = document.createElement('span');
  shadow.className = 'zoom-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  let card = null;
  let card3D = null;

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
  const measure = () => { rect = stage.getBoundingClientRect(); card3D?.resize(); };

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
  const rotated = () => Math.abs(q[0]) < 0.9995;
  const paint = () => {
    card3D?.render({ quaternion: q, tiltX: (0.5 - now.y) * 2 * MAX_TILT, tiltY: (now.x - 0.5) * 2 * MAX_TILT });
    const showReset = rotated();
    if (resetBtn.hidden === showReset) resetBtn.hidden = !showReset;
  };
  const step = (time) => {
    frame = 0;
    if (!card) return;
    const dt = lastStep ? Math.min(50, time - lastStep) : 16;
    lastStep = time;
    const k = held ? 0.28 : 0.12;           // 触れているあいだは素早く、戻るときはゆっくり
    now.x += (target.x - now.x) * k;
    now.y += (target.y - now.y) * k;
    if (reduced()) spin = null;
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
      lastStep = 0;
      return;
    }
    frame = requestAnimationFrame(step);
  };
  const kick = () => { if (!frame) frame = requestAnimationFrame(step); };
  const aim = (px, py) => {
    target.x = Math.min(1, Math.max(0, px));
    target.y = Math.min(1, Math.max(0, py));
    kick();
  };
  const hoverAim = (event) => {
    if (!rect || !rect.width) measure();
    if (!rect.width || !rect.height) return;
    aim((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  const orient = (event) => {
    if (reduced() || event.gamma == null || event.beta == null || !dialog.open || held) return;
    aim(0.5 + event.gamma / 60, 0.5 + (event.beta - 40) / 60);
  };
  const goHome = () => {
    spin = null;
    if (reduced()) { q = [1, 0, 0, 0]; homing = false; paint(); return; }
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
    } else if (event.pointerType === 'mouse' && !reduced()) hoverAim(event);
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
  const refresh = () => { if (dialog.open) { measure(); paint(); } };
  window.addEventListener('resize', refresh);
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', refresh);
  else motionPreference.addListener(refresh);
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
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
  dialog.addEventListener('close', () => {
    window.removeEventListener('deviceorientation', orient);
    card3D?.destroy(); card3D = null;
    orienting = false; held = false; drag = null; spin = null; homing = false; justDragged = false; q = [1, 0, 0, 0];
    card = null; rect = null; lastStep = 0;
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    stage.replaceChildren();
  });

  const open = (type) => {
    const def = cards?.[type];
    if (!def) return;
    card = document.createElement('div');
    card.className = 'zoom-card';
    mountMiniCard(card, type, def, rarities);
    const fx = new URLSearchParams(location.search).get('fx');
    card3D = createCard3D(card, {
      rarityColor: rarities?.[def.rarity]?.color,
      shadow,
      quality: fx === 'full' || fx === 'lite' ? fx : 'auto',
    });
    stage.replaceChildren(shadow, card);
    nameEl.textContent = def.name ?? '';
    textEl.textContent = `${rarities?.[def.rarity]?.name ?? ''}　${cardDescription(def, rules)}`;
    target.x = target.y = now.x = now.y = 0.5;
    q = [1, 0, 0, 0]; spin = null; homing = false; resetBtn.hidden = true;
    if (!dialog.open) dialog.showModal();
    measure();
    paint();
    if (canRequestFoilTilt() && !sensorAllowed) sensorBtn.hidden = reduced();
    else listenOrientation();
  };

  // ---------- 長押しの検出（まとめて受ける） ----------
  let hold = null;
  let swallowReleaseClick = false;
  const cancel = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
  document.addEventListener('pointerdown', (event) => {
    swallowReleaseClick = false; // 次に押した操作は、新しいタップとして扱う
    if (dialog.open || event.button > 0) return;
    const source = event.target.closest?.('[data-zoom]');
    if (!source) return;
    cancel();
    const { clientX: x0, clientY: y0 } = event;
    hold = {
      x0, y0,
      timer: setTimeout(() => {
        hold = null;
        swallowReleaseClick = true;
        open(source.dataset.zoom);
      }, HOLD_MS),
    };
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (hold && Math.hypot(event.clientX - hold.x0, event.clientY - hold.y0) > MOVE_LIMIT) cancel();
  }, { passive: true, capture: true });
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(type, cancel, true);
  document.addEventListener('click', (event) => {
    // 長押しを離すと、端末によっては元のカードや開いたダイアログに click が届く。
    if (!swallowReleaseClick || !event.detail) return;
    swallowReleaseClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);
  // 長押しで出るメニュー（コピー・画像を保存）を出さない
  document.addEventListener('contextmenu', (event) => { if (event.target.closest?.('[data-zoom]') || dialog.open) event.preventDefault(); }, true);

  return { open, close };
}
