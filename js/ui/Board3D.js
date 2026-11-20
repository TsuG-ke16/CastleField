// 盤面の地形（地面・道・飛び石・真ん中の石の台・木や岩）を three.js で立体に描く（段階1）。
// 兵士・魔物・城は今までどおり DOM の絵のまま。ここは「その下に敷く地形」と「平らな盤面の座標 → 画面の座標」の変換だけを持つ。
//
// 座標の決まり：
//   平らな盤面（今の 2D の #unit-layer）の位置 (xPct, yPct) を、3D の地面 (x, 0, z) に置きかえる。
//   x は左右（レーンの並び）、z は奥行き（yPct=0 が相手の城側＝奥＝ -z）。
//   カメラで写した位置を #unit-layer の中の % に戻せば、兵士・魔物の DOM をその位置に置ける（project）。
// three.js は動的 import で読む（3D を使わないとき・使えない端末では読み込まない）。
// ゲームの状態は持たない・書き換えない。Renderer が「何をどこに描くか」を渡す。

import { UI_CONFIG } from './config.js';

/** ステージごとの色（明るいカートゥーン調。assets/STYLE.md）。deco は道のわきの飾りの種類 */
const PALETTES = {
  meadow: { ground: 0x86c25e, ground2: 0x6fae4c, road: 0xe2c48a, edge: 0x8a6238, stone: 0xd8cfb6, mid: 0xcdbf9e, rune: 0xb48cff, fog: 0xd7efc4, sky: 0xfff6dc, under: 0x5d8a44, sun: 0xfff0c8, deco: 'meadow', leaf: 0x4f9e43, trunk: 0x7a5230 },
  lava: { ground: 0x6a2a1c, ground2: 0x4a1a12, road: 0x4a3530, edge: 0x1d0e0a, stone: 0x6f5850, mid: 0x5e4740, rune: 0xff7a2a, fog: 0x8a3a22, sky: 0xffc89a, under: 0x5a1a10, sun: 0xffb070, deco: 'lava', leaf: 0x3a2a26, trunk: 0x2a1c18, glow: 0xff6a1a },
  ice: { ground: 0xe4f5ff, ground2: 0xc8e6f8, road: 0xb4dcf2, edge: 0x5b8fb4, stone: 0xf4fbff, mid: 0xdff1fb, rune: 0x7fd6ff, fog: 0xeaf7ff, sky: 0xffffff, under: 0x9cc8e6, sun: 0xf4fbff, deco: 'ice', leaf: 0x2f6f6a, trunk: 0x5d4a3a },
  ruins: { ground: 0xd5bf8f, ground2: 0xc2a874, road: 0xc4b089, edge: 0x6e5f43, stone: 0xb3aa95, mid: 0xa9a08c, rune: 0xb9a2ff, fog: 0xeadcba, sky: 0xfff4d6, under: 0x9c8a64, sun: 0xffeccc, deco: 'ruins', leaf: 0x7f9a52, trunk: 0x7a6a50 },
  darkForest: { ground: 0x2f5e4a, ground2: 0x24493a, road: 0x456555, edge: 0x13281f, stone: 0x667d70, mid: 0x5a6f63, rune: 0x3fe0c4, fog: 0x1f4234, sky: 0xb7d8ff, under: 0x14281f, sun: 0xd8e4ff, deco: 'darkForest', leaf: 0x1e4a36, trunk: 0x3a2c24, glow: 0xc77dff },
  desert: { ground: 0xf0cd84, ground2: 0xe2b469, road: 0xdcae68, edge: 0x8a5a2a, stone: 0xcfa874, mid: 0xc49a62, rune: 0xffb43d, fog: 0xf8e2aa, sky: 0xfff6dc, under: 0xc98a4a, sun: 0xfff0c0, deco: 'desert', leaf: 0x5f9a4a, trunk: 0xb98252 },
};

/** カメラ：見下ろす角度（度）の探す範囲と、画角（度）。地形の奥行き（道1本の幅に対して何倍か） */
const CAMERA = { fov: 34, minPitch: 18, maxPitch: 72, distance: 2.4 };
/** 兵士・魔物の大きさ（奥ほど小さい）の範囲。1 は今の 2D と同じ大きさ */
const DEPTH_SCALE = { min: 0.66, max: 1.08, ref: 0.82 };

let threePromise = null;
function loadThree() {
  threePromise ??= import('./vendor/three.module.min.js');
  return threePromise;
}

/** WebGL が使えるか（使えなければ 2D のまま） */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function reducedMotion() {
  return Boolean(UI_CONFIG.reducedMotion) || document.documentElement.classList.contains('reduced-motion')
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 同じ並びの飾りを毎回同じ場所に置くための、決まった乱数 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class Board3D {
  /** 3D にしてよい状態か（?flat=1・UI_CONFIG.board3d === false・WebGL なし のどれかなら false） */
  static wanted() {
    if (new URLSearchParams(location.search).get('flat') === '1') return false;
    if (UI_CONFIG.board3d === false) return false;
    return webglAvailable();
  }

  /**
   * @param {{ field: HTMLElement, layer: HTMLElement, onLayout: () => void }} opts
   *   field：canvas を敷く箱（#field）／layer：兵士・魔物を置く箱（#unit-layer。平らな盤面の % の基準）
   *   onLayout：大きさが変わって写り方が変わったら呼ぶ（Renderer が兵士・魔物を置き直す）
   * @returns {Promise<Board3D|null>} 使えなければ null
   */
  static async create(opts) {
    if (!Board3D.wanted()) return null;
    try {
      const THREE = await loadThree();
      return new Board3D(THREE, opts);
    } catch (error) {
      console.warn('[board3d] 3D の盤面を使えないので、2D で描きます', error);
      return null;
    }
  }

  constructor(THREE, { field, layer, onLayout }) {
    this.T = THREE;
    this.field = field;
    this.layer = layer;
    this.onLayout = onLayout;
    this.active = false;
    this.stageId = 'meadow';
    this.night = false;
    this.targetLanes = null;
    this.focusLane = null;
    this.layout = { laneCount: 3, rows: [], laneX: [50] };

    // WebGL の canvas。#field の一番下に敷く（兵士・魔物の DOM はこの上）
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board3d-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    field.prepend(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, 20000);
    // トゥーン調の3段の陰（写実にしない）
    const tones = new Uint8Array([90, 180, 255]);
    this.toon = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
    this.toon.minFilter = this.toon.magFilter = THREE.NearestFilter;
    this.toon.needsUpdate = true;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(512, 512); // 影は軽く（解像度は控えめ）
    this.sun.shadow.bias = -0.002;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.size = { w: 0, h: 0 };
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(field);
    this.onVisibility = () => { if (document.hidden) this.stopLoop(); else { this.render(); this.updateLoop(); } };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  // ---------- Renderer から呼ぶもの ----------

  /** 3D を見せるか（広場のときは false にして、今の 2D に戻す） */
  setActive(on) {
    this.active = Boolean(on);
    this.canvas.hidden = !this.active;
    if (this.active) { this.resize(true); this.updateLoop(); } else this.stopLoop();
  }

  /**
   * 道の形を決める。rows は道のマスの、上から順の { yPct, mid }（Renderer.rowCenter と同じ値）。
   * laneX はレーンの中心（#unit-layer の幅に対する %）
   */
  setLayout(layout) {
    this.layout = layout;
    this.rebuild();
  }

  setStage(id) {
    const next = PALETTES[id] ? id : 'meadow';
    if (next === this.stageId && this.built) return;
    this.stageId = next;
    this.rebuild();
  }

  setNight(on) {
    if (this.night === Boolean(on)) return;
    this.night = Boolean(on);
    this.applyLight();
    this.render();
  }

  /** 対象に選べるレーン（番号の Set）を光らせる。null で消す */
  setTargetLanes(lanes) {
    this.targetLanes = lanes?.size ? lanes : null;
    if (!this.targetLanes) this.focusLane = null;
    this.paintLanes(0);
    this.render();
    this.updateLoop();
  }

  /** キーボードで選んでいるレーン（さらに強く光らせる） */
  setFocusLane(lane) {
    this.focusLane = lane;
    this.paintLanes(this.pulse ?? 0);
    this.render();
  }

  /**
   * 平らな盤面の位置（#unit-layer の %）→ カメラで写した位置（同じく #unit-layer の %）と、奥行きの縮尺
   * @returns {{ xPct: number, yPct: number, scale: number }}
   */
  project(xPct, yPct) {
    if (!this.fit) return { xPct, yPct, scale: 1 };
    const v = this.toWorld(xPct, yPct);
    const p = v.clone().project(this.camera);
    // 奥行きの縮尺：その場所の「地面の横1単位」が画面で何 px になるか（基準の位置に対する比）
    const q = v.clone().add(new this.T.Vector3(1, 0, 0)).project(this.camera);
    const px = Math.abs(q.x - p.x);
    const scale = Math.min(DEPTH_SCALE.max, Math.max(DEPTH_SCALE.min, px / this.fit.refPx));
    const f = this.fit;
    const cx = (p.x + 1) / 2 * f.cw - f.lx;
    const cy = (1 - p.y) / 2 * f.ch - f.ly;
    return { xPct: (cx / f.lw) * 100, yPct: (cy / f.lh) * 100, scale };
  }

  /** 画面の位置（clientX, clientY）→ その下にあるレーンの番号（道の外なら null）。光っている道のタップの当たり判定 */
  laneAt(clientX, clientY) {
    if (!this.fit) return null;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const ndc = new this.T.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height * 2 - 1));
    const ray = new this.T.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new this.T.Vector3();
    if (!ray.ray.intersectPlane(new this.T.Plane(new this.T.Vector3(0, 1, 0), 0), hit)) return null;
    const xPct = (hit.x / this.W + 0.5) * 100;
    const yPct = (hit.z / this.D + 0.5) * 100;
    if (yPct < -4 || yPct > 104 || xPct < 0 || xPct > 100) return null;
    const { laneCount } = this.layout;
    return Math.min(laneCount - 1, Math.max(0, Math.floor((xPct / 100) * laneCount)));
  }

  dispose() {
    this.stopLoop();
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearWorld();
    this.gl.dispose();
    this.canvas.remove();
  }

  // ---------- 中身 ----------

  get palette() { return PALETTES[this.stageId] ?? PALETTES.meadow; }

  /** 平らな盤面の % → 3D の地面の点 */
  toWorld(xPct, yPct) {
    return new this.T.Vector3((xPct / 100 - 0.5) * this.W, 0, (yPct / 100 - 0.5) * this.D);
  }

  mat(color, extra = {}) {
    return new this.T.MeshToonMaterial({ color, gradientMap: this.toon, ...extra });
  }

  clearWorld() {
    this.world.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) { m.map?.dispose(); m.dispose(); }
    });
    this.world.clear();
  }

  /** 地形を作り直す（道の形・ステージが変わったとき） */
  rebuild() {
    const T = this.T;
    const pal = this.palette;
    const { laneCount, rows, laneX } = this.layout;
    this.clearWorld();
    this.built = true;
    // 地形の大きさ（ワールドの単位）。横は1レーン 100、縦はマスがだいたい正方形に見える長さ
    const laneW = 100;
    this.W = laneW * laneCount;
    const units = rows.reduce((n, r) => n + (r.mid ? (UI_CONFIG.midCellScale ?? 1) : 1), 0) || 5;
    this.D = Math.max(this.W * 0.9, units * laneW * 0.5);
    const rowDepth = this.D / Math.max(1, units);

    // 地面：道より十分に広い板。ふちは霧で消える
    const groundTex = this.groundTexture(pal);
    const ground = new T.Mesh(new T.PlaneGeometry(this.W * 7, this.D * 7), this.mat(pal.ground, { map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.world.add(ground);

    // 道：レーンごとに、少し盛り上がった帯（こげ茶のふちを下に敷いて、太めの輪郭線に見せる）
    this.laneMeshes = [];
    const roadLen = this.D * 1.04;
    for (let n = 0; n < laneCount; n++) {
      const x = (laneX[n] / 100 - 0.5) * this.W;
      const edge = new T.Mesh(new T.BoxGeometry(laneW * 0.9, 5, roadLen + 6), this.mat(pal.edge));
      edge.position.set(x, 2.5, 0);
      edge.receiveShadow = true;
      const road = new T.Mesh(new T.BoxGeometry(laneW * 0.82, 7, roadLen), this.mat(pal.road, { emissive: 0x000000 }));
      road.position.set(x, 3.5, 0);
      road.receiveShadow = true;
      this.world.add(edge, road);
      this.laneMeshes.push(road);
      // 飛び石：各マスの真ん中。真ん中のマスは大きな石の台（魔物の居場所）
      rows.forEach((row, i) => {
        const z = (row.yPct / 100 - 0.5) * this.D;
        if (row.mid) {
          const r = Math.min(laneW * 0.4, rowDepth * (UI_CONFIG.midCellScale ?? 1) * 0.42);
          const base = new T.Mesh(new T.CylinderGeometry(r, r * 1.08, 10, 10), this.mat(pal.mid, { flatShading: true }));
          base.position.set(x, 12, z);
          base.castShadow = base.receiveShadow = true;
          const top = new T.Mesh(new T.CylinderGeometry(r * 0.78, r * 0.86, 4, 10), this.mat(pal.stone, { flatShading: true }));
          top.position.set(x, 19, z);
          top.receiveShadow = true;
          const rune = new T.Mesh(new T.TorusGeometry(r * 0.6, 1.6, 4, 24), new T.MeshBasicMaterial({ color: pal.rune, transparent: true, opacity: 0.75 }));
          rune.rotation.x = Math.PI / 2;
          rune.position.set(x, 21.2, z);
          this.world.add(base, top, rune);
        } else {
          const rnd = seeded(n * 31 + i * 7 + 3);
          const r = Math.min(laneW * 0.23, rowDepth * 0.36);
          const stone = new T.Mesh(new T.CylinderGeometry(r, r * 1.12, 6, 7), this.mat(pal.stone, { flatShading: true }));
          stone.position.set(x + (rnd() - 0.5) * 6, 9, z);
          stone.rotation.y = rnd() * Math.PI;
          stone.castShadow = stone.receiveShadow = true;
          this.world.add(stone);
        }
      });
    }
    this.addDecorations(pal);

    // 霧：奥のふちを地面の色へなじませる
    this.scene.fog = new T.Fog(pal.fog, 1, 2);
    this.applyLight();
    this.paintLanes(0);
    this.resize(true);
  }

  /** 地面の模様（草のつぶ・砂の波など）を小さな canvas で描いたテクスチャ */
  groundTexture(pal) {
    const T = this.T;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    const rnd = seeded(7);
    g.fillStyle = hex(pal.ground2);
    // 地面の色そのものは material の color。ここは明るさのむらだけ（白＝そのまま、色＝少し暗い）
    g.globalAlpha = 0.35;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * 6;
      g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); g.fill();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.colorSpace = T.SRGBColorSpace;
    // 地面の色をかけ算で使うので、白っぽい模様＋ material の色
    return tex;
  }

  /** 道の両わきの木・岩など（低ポリの簡単な形）。ステージごとに形と色を変える */
  addDecorations(pal) {
    const T = this.T;
    const rnd = seeded(this.stageId.length * 97 + 11);
    const flat = (color, extra) => this.mat(color, { flatShading: true, ...extra });
    const half = this.W / 2;
    const spots = [];
    // 道の左右に、奥から手前まで並べる（手前のふちは画面の外になる）
    // 手前は道が画面の横幅いっぱいなので、見えるのは奥の左右。奥に寄せて、道のすぐわきから並べる
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const z = (-1.1 + rnd() * 1.25) * this.D * 0.75;
      const x = side * (half + 14 + rnd() * this.W * 0.3);
      spots.push([x, z, 0.7 + rnd() * 0.6]);
    }
    for (const [x, z, s] of spots) {
      const g = new T.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = rnd() * Math.PI * 2;
      const kind = rnd();
      switch (pal.deco) {
        case 'lava': {
          if (kind < 0.55) {
            const rock = new T.Mesh(new T.DodecahedronGeometry(18, 0), flat(pal.leaf));
            rock.position.y = 10; rock.scale.set(1, 0.8, 1.1);
            g.add(rock);
          } else {
            const pool = new T.Mesh(new T.CircleGeometry(20, 9), new T.MeshBasicMaterial({ color: pal.glow }));
            pool.rotation.x = -Math.PI / 2; pool.position.y = 0.6;
            g.add(pool);
          }
          break;
        }
        case 'ice': {
          if (kind < 0.7) this.pine(g, pal.leaf, pal.trunk, 0xffffff);
          else {
            const crystal = new T.Mesh(new T.OctahedronGeometry(14, 0), flat(0xbfe8ff, { transparent: true, opacity: 0.9 }));
            crystal.position.y = 16; crystal.scale.set(0.7, 1.6, 0.7);
            g.add(crystal);
          }
          break;
        }
        case 'ruins': {
          if (kind < 0.55) {
            const h = 30 + rnd() * 40;
            const pillar = new T.Mesh(new T.CylinderGeometry(8, 9, h, 8), flat(0xdcd2ba));
            pillar.position.y = h / 2;
            g.add(pillar);
          } else {
            const block = new T.Mesh(new T.BoxGeometry(26, 12, 18), flat(0xcfc4a8));
            block.position.y = 6; block.rotation.z = 0.2;
            g.add(block);
          }
          break;
        }
        case 'darkForest': {
          if (kind < 0.75) this.pine(g, pal.leaf, pal.trunk);
          else {
            const cap = new T.Mesh(new T.SphereGeometry(7, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: pal.glow }));
            cap.position.y = 8;
            const stem = new T.Mesh(new T.CylinderGeometry(2, 2.5, 8, 6), flat(0xe8e0f0));
            stem.position.y = 4;
            g.add(stem, cap);
          }
          break;
        }
        case 'desert': {
          if (kind < 0.5) {
            const body = new T.Mesh(new T.CylinderGeometry(6, 7, 40, 7), flat(pal.leaf));
            body.position.y = 20;
            const arm = new T.Mesh(new T.CylinderGeometry(4, 4, 18, 6), flat(pal.leaf));
            arm.position.set(9, 24, 0);
            g.add(body, arm);
          } else {
            const rock = new T.Mesh(new T.DodecahedronGeometry(14, 0), flat(pal.trunk));
            rock.position.y = 7; rock.scale.set(1.3, 0.7, 1);
            g.add(rock);
          }
          break;
        }
        default: {
          if (kind < 0.7) {
            const trunk = new T.Mesh(new T.CylinderGeometry(4, 5, 20, 6), flat(pal.trunk));
            trunk.position.y = 10;
            const crown = new T.Mesh(new T.IcosahedronGeometry(20, 0), flat(pal.leaf));
            crown.position.y = 34;
            g.add(trunk, crown);
          } else {
            const rock = new T.Mesh(new T.DodecahedronGeometry(10, 0), flat(0xb9b2a0));
            rock.position.y = 5;
            g.add(rock);
          }
        }
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.world.add(g);
    }
  }

  /** とがった木（雪をかぶせることもできる） */
  pine(g, leaf, trunk, snow = null) {
    const T = this.T;
    const flat = (color) => this.mat(color, { flatShading: true });
    const stem = new T.Mesh(new T.CylinderGeometry(3, 4, 14, 6), flat(trunk));
    stem.position.y = 7;
    g.add(stem);
    [[22, 26, 22], [17, 22, 38], [11, 18, 52]].forEach(([r, h, y]) => {
      const cone = new T.Mesh(new T.ConeGeometry(r, h, 7), flat(leaf));
      cone.position.y = y;
      g.add(cone);
      if (snow) {
        const cap = new T.Mesh(new T.ConeGeometry(r * 0.55, h * 0.45, 7), flat(snow));
        cap.position.y = y + h * 0.3;
        g.add(cap);
      }
    });
  }

  /** 光：昼はやわらかい日ざし、夜は暗く青く */
  applyLight() {
    const pal = this.palette;
    const C = (n) => new this.T.Color(n);
    if (this.night) {
      this.hemi.color = C(0x8fa4ff); this.hemi.groundColor = C(0x1a1f44); this.hemi.intensity = 0.9;
      this.sun.color = C(0x9fb4ff); this.sun.intensity = 0.9;
      if (this.scene.fog) this.scene.fog.color = C(pal.fog).lerp(C(0x101a44), 0.65);
    } else {
      this.hemi.color = C(pal.sky); this.hemi.groundColor = C(pal.under); this.hemi.intensity = 1.6;
      this.sun.color = C(pal.sun); this.sun.intensity = 2.2;
      if (this.scene.fog) this.scene.fog.color = C(pal.fog);
    }
  }

  /** 対象に選べるレーンを光らせる（pulse は 0〜1 のゆらぎ） */
  paintLanes(pulse) {
    if (!this.laneMeshes) return;
    const pal = this.palette;
    this.laneMeshes.forEach((m, n) => {
      const on = this.targetLanes?.has(n);
      const focus = on && this.focusLane === n;
      m.material.color.set(on ? 0xfff0b0 : pal.road);
      m.material.emissive.set(on ? 0xffb800 : 0x000000);
      m.material.emissiveIntensity = on ? (focus ? 0.5 : 0.12 + 0.22 * pulse) : 0;
    });
  }

  /** #field の大きさに合わせて、カメラと「道がちょうど収まる写し方」を決め直す */
  resize(force = false) {
    const r = this.field.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || !this.built) return;
    if (!force && w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    this.fitCamera(r);
    this.render();
    this.onLayout?.();
  }

  /**
   * 道（平らな盤面の長方形）が、#unit-layer の横幅いっぱい・#field の高さいっぱいの台形に写るようにする。
   * 見下ろす角度をいくつか試して、縦横の比がいちばん合う角度を選び、最後に画面の上で拡大・移動して合わせる
   */
  fitCamera(fieldRect) {
    const T = this.T;
    const lr = this.layer.getBoundingClientRect();
    const cw = fieldRect.width, ch = fieldRect.height;
    const lx = lr.left - fieldRect.left, ly = lr.top - fieldRect.top, lw = lr.width || cw, lh = lr.height || ch;
    const cam = this.camera;
    cam.aspect = cw / ch;
    cam.fov = CAMERA.fov;
    const dist = this.D * CAMERA.distance;
    const corners = [[0, 0], [100, 0], [0, 100], [100, 100]].map(([x, y]) => this.toWorld(x, y));
    // 写したい箱（canvas の NDC）：横は #unit-layer の幅、縦は上下に少しの余白
    const margin = 0.04;
    const want = {
      x0: (lx / cw) * 2 - 1, x1: ((lx + lw) / cw) * 2 - 1,
      y0: -1 + margin * 2, y1: 1 - margin * 2,
    };
    const wantAspect = ((want.x1 - want.x0) * cw) / ((want.y1 - want.y0) * ch);
    const place = (pitch) => {
      const a = (pitch * Math.PI) / 180;
      cam.position.set(0, Math.sin(a) * dist, this.D * 0.08 + Math.cos(a) * dist);
      cam.lookAt(0, 0, this.D * 0.08);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      const pts = corners.map((v) => v.clone().project(cam));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      return { box, aspect: ((box.x1 - box.x0) * cw) / ((box.y1 - box.y0) * ch) };
    };
    let best = null;
    for (let p = CAMERA.minPitch; p <= CAMERA.maxPitch; p += 0.5) {
      const got = place(p);
      const err = Math.abs(Math.log(got.aspect / wantAspect));
      if (!best || err < best.err) best = { p, err };
    }
    const { box } = place(best.p);
    // 画面の上で拡大・移動（クリップ座標にかける。透視の形は変えない）
    const kx = (want.x1 - want.x0) / (box.x1 - box.x0);
    const ky = (want.y1 - want.y0) / (box.y1 - box.y0);
    const tx = want.x0 - box.x0 * kx;
    const ty = want.y0 - box.y0 * ky;
    const m = new T.Matrix4().set(kx, 0, 0, tx, 0, ky, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.premultiply(m);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.pitch = best.p;

    // 霧：手前は晴れ、奥の地面のふちで地面の色に溶ける
    const camZ = cam.position.z, camY = cam.position.y;
    const near = Math.hypot(camY, camZ + this.D * 0.5);
    if (this.scene.fog) { this.scene.fog.near = near * 1.05; this.scene.fog.far = near * 2.4; }

    // 影を落とす光：左上の手前から。影のカメラは道のまわりだけ
    this.sun.position.set(-this.W * 0.8, this.D * 1.6, this.D * 0.9);
    this.sun.target.position.set(0, 0, 0);
    const s = this.sun.shadow.camera;
    s.left = -this.W * 1.3; s.right = this.W * 1.3; s.top = this.D * 1.2; s.bottom = -this.D * 1.2;
    s.near = 1; s.far = this.D * 6;
    s.updateProjectionMatrix();

    this.fit = { cw, ch, lx, ly, lw, lh, refPx: 1 };
    // 縮尺の基準：手前から DEPTH_SCALE.ref の深さの、道のまん中で 1
    const ref = this.toWorld(50, DEPTH_SCALE.ref * 100);
    const a = ref.clone().project(cam), b = ref.clone().add(new T.Vector3(1, 0, 0)).project(cam);
    this.fit.refPx = Math.abs(b.x - a.x) || 1;
  }

  render() {
    if (!this.active || !this.fit || document.hidden) return;
    this.gl.render(this.scene, this.camera);
  }

  /** 光る道をゆらす間だけ、毎フレーム描く（動きを減らす設定・タブが隠れているときは描かない） */
  updateLoop() {
    const need = this.active && this.targetLanes && !reducedMotion() && !document.hidden;
    if (!need) { this.stopLoop(); return; }
    if (this.raf) return;
    const tick = (t) => {
      this.raf = requestAnimationFrame(tick);
      this.pulse = (Math.sin(t / 260) + 1) / 2;
      this.paintLanes(this.pulse);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}
