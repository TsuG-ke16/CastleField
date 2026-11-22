// 盤面全体（フィールド・踏み石・城・兵士・魔物・シールド・精霊・魔法＆戦闘エフェクト）を
// Blender 製 GLB モデルと three.js でリアルタイム 3D 描画する。
// WebGL 不可時や ?field3d=2d / ?fx=lite 指定時は既存の 2D 表示へ安全にフォールバックする。

const STAGE_SLUGS = {
  meadow: 'meadow',
  lava: 'lava',
  ice: 'ice',
  ruins: 'ruins',
  darkForest: 'dark-forest',
  desert: 'desert',
};

const STAGE_LOOK = {
  meadow:     { bg: '#9eb018', sun: '#fff8e2', sunInt: 2.45, hemiSky: '#d8f0ff', hemiGnd: '#7a8e22', hemiInt: 1.25 },
  lava:       { bg: '#533a3e', sun: '#ffd8b8', sunInt: 2.25, hemiSky: '#b58a8c', hemiGnd: '#4d322e', hemiInt: 1.35 },
  ice:        { bg: '#80c9ec', sun: '#f5fbff', sunInt: 2.35, hemiSky: '#e8f7ff', hemiGnd: '#4e9ad4', hemiInt: 1.30 },
  ruins:      { bg: '#ecb25f', sun: '#fff2d0', sunInt: 2.45, hemiSky: '#fff0cc', hemiGnd: '#ad7c42', hemiInt: 1.25 },
  darkForest: { bg: '#15644d', sun: '#c4f0df', sunInt: 1.95, hemiSky: '#529c8c', hemiGnd: '#164236', hemiInt: 1.25 },
  desert:     { bg: '#f6a139', sun: '#fff2ca', sunInt: 2.55, hemiSky: '#ffe8be', hemiGnd: '#c46f2c', hemiInt: 1.25 },
};

const TEAM_COLORS = {
  blue:   { main: '#2f95ff', roof: '#3492ff', cape: '#1d6fe0', glow: '#5cc2ff' },
  orange: { main: '#ff7a24', roof: '#ff7220', cape: '#d95314', glow: '#ffaa44' },
  green:  { main: '#32b85c', roof: '#2ea852', cape: '#1d823c', glow: '#66ee88' },
  purple: { main: '#9b52ff', roof: '#8c42f5', cape: '#6824c4', glow: '#c488ff' },
};

const ELEMENT_COLORS = {
  fire:  '#ff5a1f',
  water: '#38c8ff',
  wind:  '#48e898',
  earth: '#e8a838',
  light: '#ffe666',
  dark:  '#a844ff',
};

const EMISSIVE_NAMES = new Set([
  'Mat_Lava_Glow', 'Mat_DF_Lantern', 'Mat_DF_MushCap', 'Mat_DF_Crystal',
  'Mat_Ice_Crystal', 'Mat_Ruins_Crystal', 'Castle_Window', 'Castle_Arcane',
  'Stone_Rune', 'Unit_GlowBlue', 'Unit_GlowGold', 'Unit_GlowRed',
  'Mon_GolemCore', 'Mon_DemonEye',
]);

let libs;
const modelLoads = new Map();

function isDisabledByQuery() {
  try {
    const q = new URLSearchParams(location.search);
    return q.get('field3d') === '2d' || q.get('fx') === 'lite';
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

const loadLibs = () => (libs ??= Promise.all([
  import('../vendor/three/three.module.min.js'),
  import('../vendor/three/GLTFLoader.js'),
]).then(([THREE, { GLTFLoader }]) => ({ THREE, GLTFLoader })));

function loadGlb(GLTFLoader, path) {
  if (!modelLoads.has(path)) {
    const p = new GLTFLoader()
      .loadAsync(new URL(path, document.baseURI).href)
      .catch((err) => {
        modelLoads.delete(path);
        throw err;
      });
    modelLoads.set(path, p);
  }
  return modelLoads.get(path);
}

/** カード種類文字列から 3D 兵士アーキタイプを決める */
function soldierModelKey(type = '') {
  const t = String(type).toLowerCase();
  if (/dragon|wyvern|drake|wyrm/.test(t)) return 'dragon';
  if (/hero|paladin|king|lord|champion|saint|valkyrie/.test(t)) return 'hero';
  if (/mage|wizard|sorcerer|archmage|sage|witch|druid|priest|shaman|necromancer|warlock/.test(t)) return 'mage';
  if (/archer|bow|sniper|ranger|elf|hunter|crossbow/.test(t)) return 'archer';
  if (/assassin|ninja|rogue|thief|shadow|imp/.test(t)) return 'assassin';
  if (/knight|cavalry|scout|rider|horse|lancer/.test(t)) return 'knight';
  if (/giant|heavy|golem|titan|ogre|troll|behemoth|guard|shield|tank|treant/.test(t)) return 'heavy';
  if (/spear|pike|halberd/.test(t)) return 'spearman';
  return 'infantry';
}

/** 魔物種類文字列から 3D 魔物モデルを決める */
function monsterModelKey(type = '') {
  const t = String(type).toLowerCase();
  if (/dragon/.test(t)) return 'dragon';
  if (/golem|treant/.test(t)) return 'golem';
  if (/demon|vampire|bat/.test(t)) return 'demon';
  if (/mimic|ghost/.test(t)) return 'mimic';
  if (/goblin|skeleton/.test(t)) return 'goblin';
  return 'slime';
}

function castleModelKey(type = '') {
  if (type === 'fortress' || type === 'tower' || type === 'barracks') return type;
  return 'standard';
}

export class FieldGL {
  constructor(appEl, hostEl) {
    this.appEl = appEl;
    this.hostEl = hostEl;
    this.disabled = isDisabledByQuery();
    this.stageId = null;
    this.timeOfDay = 'day';
    this.hidden = false;
    this.disposed = false;
    this.loadSeq = 0;

    this.THREE = null;
    this.GLTFLoader = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.sun = null;
    this.hemi = null;
    this.fxLight = null;

    this.stageGroup = null;
    this.stoneGroup = null;
    this.entityGroup = null;
    this.fxGroup = null;

    this.swayNodes = [];
    this.smokeNodes = [];
    this.glowMats = [];

    // 3D Entities
    this.castleEntries = new Map();  // side ('me'|'opp') -> { group, type, color, shieldMesh, overdriveRing, spiritOrb, hitFlash, damageSmoke }
    this.soldierEntries = new Map(); // soldierId -> { group, type, color, targetPos, curPos, facing, phase, iceCage, shieldRing, auraRing, hitFlash, lunge }
    this.monsterEntries = new Map(); // monsterId -> { group, type, targetPos, curPos, phase, hitFlash }
    this.stoneMeshes = [];           // { mesh, lane, row, isMid, ringMat }
    this.activeEffects = [];         // running 3D VFX animations

    this.laneCount = 3;
    this.laneLength = 5;
    this.viewerId = 'p1';
    this.lastSync = null;
    this.shakeTime = 0;
    this.shakeAmp = 0;
    this.baseCamPos = { x: 0, y: 18, z: 12 };
    this.baseCamLook = { x: 0, y: 0, z: 2.2 };

    this.rafId = 0;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;

    this._onResize = () => this.resize();
    this._onVisibility = () => {
      if (document.hidden) this.stopLoop();
      else this.maybeStartLoop();
    };
  }

  async ensureReady() {
    if (this.disabled || this.disposed) return false;
    if (this.renderer) return true;
    try {
      const { THREE, GLTFLoader } = await loadLibs();
      if (this.disposed) return false;
      this.THREE = THREE;
      this.GLTFLoader = GLTFLoader;

      const canvas = document.createElement('canvas');
      canvas.className = 'field-gl';
      canvas.setAttribute('aria-hidden', 'true');

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.5, 140);

      const hemi = new THREE.HemisphereLight('#ffffff', '#666666', 1.25);
      scene.add(hemi);

      const sun = new THREE.DirectionalLight('#fff6dd', 2.4);
      sun.position.set(10, 24, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 2;
      sun.shadow.camera.far = 65;
      const d = 15;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0006;
      scene.add(sun);

      // Dynamic flash light for spells & impacts
      const fxLight = new THREE.PointLight('#ffaa44', 0, 18, 1.5);
      fxLight.position.set(0, 3, 0);
      scene.add(fxLight);

      this.stoneGroup = new THREE.Group();
      this.entityGroup = new THREE.Group();
      this.fxGroup = new THREE.Group();
      scene.add(this.stoneGroup);
      scene.add(this.entityGroup);
      scene.add(this.fxGroup);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.sun = sun;
      this.hemi = hemi;
      this.fxLight = fxLight;

      this.hostEl.prepend(canvas);
      window.addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', this._onVisibility);
      this.resize();
      return true;
    } catch {
      this.disabled = true;
      return false;
    }
  }

  /** レーン番号と行（0=相手城側, laneLength-1=自分城側）から 3D ワールド座標を返す */
  cellWorldPos(lane, row) {
    const lc = Math.max(1, this.laneCount);
    const ll = Math.max(2, this.laneLength);
    const x = lc === 1 ? 0 : ((lane + 0.5) / lc - 0.5) * 6.8;
    const t = Math.max(-0.35, Math.min(1.35, row / (ll - 1)));
    const z = -3.4 + t * 6.8;
    return { x, y: 0, z };
  }

  castleWorldPos(side) {
    return side === 'opp' ? { x: 0, y: 0, z: -5.5 } : { x: 0, y: 0, z: 5.5 };
  }

  async setStage(stageId) {
    this.stageId = stageId && STAGE_SLUGS[stageId] ? stageId : null;
    const seq = ++this.loadSeq;

    if (!this.stageId || this.disabled || this.hidden) {
      this.setVisible(false);
      return;
    }

    const ok = await this.ensureReady();
    if (!ok || seq !== this.loadSeq || this.disposed) return;

    const slug = STAGE_SLUGS[this.stageId];
    try {
      const gltf = await loadGlb(this.GLTFLoader, `assets/models/field-${slug}.glb`);
      if (seq !== this.loadSeq || this.disposed) return;
      this.mountFieldModel(gltf.scene, this.stageId);
      await this.rebuildStones();
      this.applyLighting();
      this.resize();
      this.setVisible(!this.hidden);
      if (this.lastSync) this.syncBoard(this.lastSync);
      this.renderFrame(performance.now());
      this.maybeStartLoop();
    } catch {
      if (seq === this.loadSeq) this.setVisible(false);
    }
  }

  setTime(timeOfDay) {
    this.timeOfDay = timeOfDay === 'night' ? 'night' : 'day';
    if (!this.renderer || !this.stageId) return;
    this.applyLighting();
    this.renderFrame(performance.now());
  }

  setHidden(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) {
      this.setVisible(false);
    } else if (this.stageId && this.stageGroup) {
      this.setVisible(true);
      this.resize();
      this.renderFrame(performance.now());
      this.maybeStartLoop();
    }
  }

  setVisible(visible) {
    if (this.renderer?.domElement) {
      this.renderer.domElement.hidden = !visible;
    }
    if (visible) {
      this.appEl.dataset.stage3d = '1';
    } else {
      delete this.appEl.dataset.stage3d;
      this.stopLoop();
    }
  }

  mountFieldModel(sourceScene, stageId) {
    if (this.stageGroup) this.scene.remove(this.stageGroup);
    this.swayNodes = [];
    this.smokeNodes = [];
    this.glowMats = [];

    const group = sourceScene.clone(true);
    const seenMats = new Set();

    group.traverse((obj) => {
      if (!obj.isMesh) return;
      const isGround = obj.name.includes('Ground') || obj.name.includes('Lava_River') || obj.name.includes('Lava_Crack');
      obj.castShadow = !isGround;
      obj.receiveShadow = true;

      if (/Tree|Pine|Bush|Fern|Tuft/i.test(obj.name)) {
        this.swayNodes.push({ obj, baseRotZ: obj.rotation.z, phase: obj.position.x * 1.3 + obj.position.z * 0.7 });
      }
      if (/Smoke/i.test(obj.name)) {
        this.smokeNodes.push({ obj, baseY: obj.position.y, phase: obj.position.x * 0.9 });
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || seenMats.has(m)) continue;
        seenMats.add(m);
        if (obj.geometry?.attributes?.color) m.vertexColors = true;
        if (EMISSIVE_NAMES.has(m.name) || (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05)) {
          this.glowMats.push({ mat: m, baseIntensity: m.emissiveIntensity ?? 1.0 });
        }
      }
    });

    this.stageGroup = group;
    this.scene.add(group);
    this.stageId = stageId;
  }

  async rebuildStones() {
    if (!this.THREE || !this.stoneGroup) return;
    const THREE = this.THREE;
    while (this.stoneGroup.children.length) this.stoneGroup.remove(this.stoneGroup.children[0]);
    this.stoneMeshes = [];

    let stoneProto = null;
    try {
      const gltf = await loadGlb(this.GLTFLoader, 'assets/models/field-stone.glb');
      stoneProto = gltf.scene;
    } catch {
      return;
    }

    const midRow = this.laneLength % 2 === 1 ? Math.floor(this.laneLength / 2) : -1;
    for (let lane = 0; lane < this.laneCount; lane++) {
      for (let row = 0; row < this.laneLength; row++) {
        const isMid = row === midRow;
        const pos = this.cellWorldPos(lane, row);
        const st = stoneProto.clone(true);
        const sc = isMid ? 1.24 : 0.88;
        st.scale.set(sc, sc, sc);
        st.position.set(pos.x, 0.01, pos.z);
        st.traverse((m) => {
          if (!m.isMesh) return;
          m.receiveShadow = true;
          m.castShadow = false;
          if (m.material) {
            m.material = m.material.clone();
            if (m.material.name === 'Stone_Rune') {
              m.material.emissiveIntensity = isMid ? 1.35 : 0.15;
            }
          }
        });
        // Subtle glowing ring for targetable / mid highlight
        const ringGeo = new THREE.RingGeometry(0.72 * sc, 0.88 * sc, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: isMid ? '#ffd95a' : '#5ce8ff',
          transparent: true,
          opacity: isMid ? 0.35 : 0.0,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos.x, 0.05, pos.z);
        this.stoneGroup.add(st);
        this.stoneGroup.add(ring);
        this.stoneMeshes.push({ mesh: st, ring, ringMat, lane, row, isMid });
      }
    }
  }

  /** Renderer から盤面全体の最新状態を受け取り、城・兵士・魔物を 3D 同期する */
  syncBoard(snapshot) {
    this.lastSync = snapshot;
    if (!this.renderer || !this.THREE || this.hidden || this.disabled) return;

    const lc = snapshot.laneCount ?? 3;
    const ll = snapshot.laneLength ?? 5;
    if (lc !== this.laneCount || ll !== this.laneLength) {
      this.laneCount = lc;
      this.laneLength = ll;
      this.rebuildStones();
    }

    // 1. Castles (me & opp)
    for (const side of ['me', 'opp']) {
      const info = snapshot.castles?.[side];
      if (info) this.syncCastle(side, info);
    }

    // 2. Soldiers
    const seenSoldiers = new Set();
    const stackCounts = new Map();
    for (const s of snapshot.soldiers ?? []) {
      const key = `${s.lane}:${s.row}:${s.side}`;
      const idx = stackCounts.get(key) ?? 0;
      stackCounts.set(key, idx + 1);
      seenSoldiers.add(s.id);
      this.syncSoldier(s, idx);
    }
    for (const [id, entry] of this.soldierEntries) {
      if (!seenSoldiers.has(id)) {
        this.entityGroup.remove(entry.group);
        this.soldierEntries.delete(id);
      }
    }

    // 3. Monsters
    const seenMonsters = new Set();
    for (const m of snapshot.monsters ?? []) {
      seenMonsters.add(m.id);
      this.syncMonster(m);
    }
    for (const [id, entry] of this.monsterEntries) {
      if (!seenMonsters.has(id)) {
        this.entityGroup.remove(entry.group);
        this.monsterEntries.delete(id);
      }
    }

    // 4. Targetable lane highlights
    const targetLanes = new Set(snapshot.targetLanes ?? []);
    for (const st of this.stoneMeshes) {
      if (targetLanes.has(st.lane)) {
        st.ringMat.color.set('#5cf2ff');
        st.ringMat.opacity = 0.72;
      } else {
        st.ringMat.color.set(st.isMid ? '#ffd95a' : '#5ce8ff');
        st.ringMat.opacity = st.isMid ? 0.32 : 0.0;
      }
    }
  }

  tintTeamMaterials(root, colorKey) {
    const pal = TEAM_COLORS[colorKey] ?? TEAM_COLORS.blue;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (c.name === 'TeamRoof') c.color.set(pal.roof);
        else if (c.name === 'TeamBanner' || c.name === 'TeamAccent') c.color.set(pal.main);
        else if (c.name === 'TeamCape') c.color.set(pal.cape);
        return c;
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    });
  }

  async syncCastle(side, info) {
    const THREE = this.THREE;
    const cType = castleModelKey(info.castleType);
    const colorKey = info.color || (side === 'me' ? 'blue' : 'orange');
    let entry = this.castleEntries.get(side);

    if (!entry || entry.type !== cType || entry.color !== colorKey) {
      if (entry) this.entityGroup.remove(entry.group);
      const group = new THREE.Group();
      const pos = this.castleWorldPos(side);
      group.position.set(pos.x, pos.y, pos.z);
      // Castle model faces +Y in Blender -> -Z in glTF. 'me' faces -Z (0), 'opp' faces +Z (Math.PI)
      group.rotation.y = side === 'opp' ? Math.PI : 0;
      const sc = side === 'opp' ? 0.88 : 0.78;
      group.scale.set(sc, sc, sc);

      // 3D Energy Shield Dome (for armor > 0)
      const shieldGeo = new THREE.SphereGeometry(2.85, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: '#4cd6ff',
        emissive: '#22aaff',
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.28,
        roughness: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
      shieldMesh.position.y = 0.05;
      shieldMesh.visible = false;
      group.add(shieldMesh);

      // Overdrive fiery ring (背水の陣)
      const odGeo = new THREE.TorusGeometry(2.65, 0.14, 8, 28);
      odGeo.rotateX(Math.PI / 2);
      const odMat = new THREE.MeshStandardMaterial({
        color: '#ff4810',
        emissive: '#ff3200',
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.85,
      });
      const overdriveRing = new THREE.Mesh(odGeo, odMat);
      overdriveRing.position.y = 0.25;
      overdriveRing.visible = false;
      group.add(overdriveRing);

      // Orbiting Spirit Orb
      const spGeo = new THREE.OctahedronGeometry(0.45, 0);
      const spMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffaa22',
        emissiveIntensity: 2.0,
        roughness: 0.15,
      });
      const spiritOrb = new THREE.Mesh(spGeo, spMat);
      spiritOrb.position.set(2.4, 3.6, 0);
      spiritOrb.visible = false;
      group.add(spiritOrb);

      entry = { group, model: null, type: cType, color: colorKey, shieldMesh, overdriveRing, spiritOrb, hitFlash: 0, baseScale: sc };
      this.castleEntries.set(side, entry);
      this.entityGroup.add(group);

      try {
        const gltf = await loadGlb(this.GLTFLoader, `assets/models/castle-${cType}.glb`);
        if (this.castleEntries.get(side) !== entry || this.disposed) return;
        const model = gltf.scene.clone(true);
        this.tintTeamMaterials(model, colorKey);
        group.add(model);
        entry.model = model;
      } catch {
        return;
      }
    }

    // Update live visual states
    entry.shieldMesh.visible = (info.armor ?? 0) > 0;
    entry.overdriveRing.visible = Boolean(info.overdrive);
    if (info.spirit) {
      const scol = ELEMENT_COLORS[info.spirit] ?? '#ffd85a';
      entry.spiritOrb.material.color.set(scol);
      entry.spiritOrb.material.emissive.set(scol);
      entry.spiritOrb.visible = true;
    } else {
      entry.spiritOrb.visible = false;
    }

    // Damage squash / tilt when destroyed
    if (entry.model) {
      const ratio = info.maxHp > 0 ? info.hp / info.maxHp : 1;
      if (ratio <= 0) {
        entry.model.scale.set(1.05, 0.32, 1.05);
        entry.model.rotation.z = 0.14;
      } else if (ratio <= 0.35) {
        entry.model.scale.set(1, 0.92, 1);
        entry.model.rotation.z = 0.04;
      } else {
        entry.model.scale.set(1, 1, 1);
        entry.model.rotation.z = 0;
      }
    }
  }

  async syncSoldier(s, stackIdx) {
    const THREE = this.THREE;
    const mKey = soldierModelKey(s.type);
    const colorKey = s.color || (s.side === 'me' ? 'blue' : 'orange');
    const base = this.cellWorldPos(s.lane, s.row);
    const sideOffset = s.side === 'me' ? 0.52 : -0.52;
    const stackOffX = (stackIdx % 2) * (s.side === 'me' ? 0.28 : -0.28);
    const stackOffZ = Math.floor(stackIdx / 2) * 0.34;
    const targetPos = { x: base.x + sideOffset + stackOffX, y: 0.16, z: base.z + stackOffZ };

    let entry = this.soldierEntries.get(s.id);
    if (!entry) {
      const group = new THREE.Group();
      group.position.set(targetPos.x, targetPos.y, targetPos.z);
      group.rotation.y = s.side === 'opp' ? Math.PI : 0;

      // Team / Elemental base ring
      const pal = TEAM_COLORS[colorKey] ?? TEAM_COLORS.blue;
      const ringGeo = new THREE.RingGeometry(0.42, 0.56, 20);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
      const auraRing = new THREE.Mesh(ringGeo, ringMat);
      auraRing.position.y = 0.03;
      group.add(auraRing);

      // Frozen 3D ice crystal cage
      const iceGeo = new THREE.CylinderGeometry(0.52, 0.62, 1.45, 6);
      const iceMat = new THREE.MeshStandardMaterial({
        color: '#88eeff', emissive: '#22b8ff', emissiveIntensity: 0.8,
        transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false,
      });
      const iceCage = new THREE.Mesh(iceGeo, iceMat);
      iceCage.position.y = 0.72;
      iceCage.visible = false;
      group.add(iceCage);

      // Shield buckler aura
      const shGeo = new THREE.TorusGeometry(0.55, 0.06, 8, 20);
      const shMat = new THREE.MeshStandardMaterial({
        color: '#55d8ff', emissive: '#30b8ff', emissiveIntensity: 1.5, transparent: true, opacity: 0.75,
      });
      const shieldRing = new THREE.Mesh(shGeo, shMat);
      shieldRing.position.set(0, 0.75, -0.45);
      shieldRing.visible = false;
      group.add(shieldRing);

      entry = {
        group, model: null, type: mKey, color: colorKey, side: s.side,
        targetPos, curPos: { ...targetPos }, phase: Math.random() * Math.PI * 2,
        auraRing, iceCage, shieldRing, hitFlash: 0, lunge: 0,
      };
      this.soldierEntries.set(s.id, entry);
      this.entityGroup.add(group);

      try {
        const gltf = await loadGlb(this.GLTFLoader, `assets/models/unit-${mKey}.glb`);
        if (this.soldierEntries.get(s.id) !== entry || this.disposed) return;
        const model = gltf.scene.clone(true);
        const sc = 0.78;
        model.scale.set(sc, sc, sc);
        this.tintTeamMaterials(model, colorKey);
        group.add(model);
        entry.model = model;
      } catch {
        return;
      }
    } else {
      entry.targetPos = targetPos;
      entry.group.rotation.y = s.side === 'opp' ? Math.PI : 0;
    }

    // Live status visuals
    entry.iceCage.visible = (s.statuses?.frozen ?? 0) > 0;
    entry.shieldRing.visible = (s.shield ?? 0) > 0;
    if (s.element && ELEMENT_COLORS[s.element]) {
      entry.auraRing.material.color.set(ELEMENT_COLORS[s.element]);
    } else {
      entry.auraRing.material.color.set((TEAM_COLORS[colorKey] ?? TEAM_COLORS.blue).glow);
    }
  }

  async syncMonster(m) {
    const THREE = this.THREE;
    const mKey = monsterModelKey(m.type);
    const pos = this.cellWorldPos(m.lane, m.row);
    const targetPos = { x: pos.x, y: 0.22, z: pos.z };

    let entry = this.monsterEntries.get(m.id);
    if (!entry) {
      const group = new THREE.Group();
      group.position.set(targetPos.x, targetPos.y, targetPos.z);
      group.rotation.y = Math.PI; // Face toward player camera

      // Menacing boss aura ring
      const ringGeo = new THREE.RingGeometry(0.75, 0.95, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ff4466', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.03;
      group.add(ring);

      entry = { group, model: null, type: mKey, targetPos, curPos: { ...targetPos }, phase: Math.random() * 6, hitFlash: 0 };
      this.monsterEntries.set(m.id, entry);
      this.entityGroup.add(group);

      try {
        const gltf = await loadGlb(this.GLTFLoader, `assets/models/monster-${mKey}.glb`);
        if (this.monsterEntries.get(m.id) !== entry || this.disposed) return;
        const model = gltf.scene.clone(true);
        const sc = 0.85;
        model.scale.set(sc, sc, sc);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        group.add(model);
        entry.model = model;
      } catch {
        return;
      }
    } else {
      entry.targetPos = targetPos;
    }
  }

  // ===========================================================================
  // 3D MAGIC & COMBAT VFX ENGINE
  // ===========================================================================
  addCameraShake(amp = 0.25, dur = 0.28) {
    if (prefersReducedMotion()) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, dur);
  }

  flashLight(hex, intensity = 6.0, pos = { x: 0, y: 3, z: 0 }, dur = 0.35) {
    if (!this.fxLight) return;
    this.fxLight.color.set(hex);
    this.fxLight.position.set(pos.x, Math.max(2.0, pos.y + 2.5), pos.z);
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t) => {
        this.fxLight.intensity = intensity * Math.pow(1 - t, 1.8);
      },
      cleanup: () => {
        this.fxLight.intensity = 0;
      },
    });
  }

  spawnRing(pos, colorHex, maxScale = 2.6, dur = 0.42, y = 0.25) {
    const THREE = this.THREE;
    const geo = new THREE.RingGeometry(0.35, 0.65, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, y, pos.z);
    this.fxGroup.add(mesh);
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t) => {
        const s = 0.4 + t * maxScale;
        mesh.scale.set(s, s, s);
        mat.opacity = (1 - t) * 0.9;
      },
      cleanup: () => {
        this.fxGroup.remove(mesh);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  spawnBurst(pos, colorHex, count = 18, speed = 4.5, dur = 0.55, upBias = 3.2) {
    const THREE = this.THREE;
    const geo = new THREE.OctahedronGeometry(0.16, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 2.2, roughness: 0.2, transparent: true, opacity: 1,
    });
    const particles = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pos.x, pos.y + 0.6, pos.z);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random() * 0.8) * speed;
      const vx = Math.cos(a) * sp;
      const vz = Math.sin(a) * sp;
      const vy = upBias * (0.5 + Math.random() * 0.9);
      this.fxGroup.add(m);
      particles.push({ m, vx, vy, vz });
    }
    this.activeEffects.push({
      age: 0,
      dur,
      update: (t, dt) => {
        mat.opacity = 1 - t;
        for (const p of particles) {
          p.vy -= 9.5 * dt;
          p.m.position.x += p.vx * dt;
          p.m.position.y = Math.max(0.1, p.m.position.y + p.vy * dt);
          p.m.position.z += p.vz * dt;
          p.m.rotation.x += 6 * dt;
          p.m.rotation.y += 5 * dt;
          const s = 1 - t * 0.7;
          p.m.scale.set(s, s, s);
        }
      },
      cleanup: () => {
        for (const p of particles) this.fxGroup.remove(p.m);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /**
   * 外部（Animations.js）から呼ばれる 3D エフェクト発火窓口
   * @param {'fire'|'lightning'|'ice'|'heal'|'poison'|'wind'|'shot'|'clash'|'eruption'|'castleHit'} kind
   * @param {{ from?: {x,y,z}, to?: {x,y,z}, side?: 'me'|'opp', soldierId?: string, color?: string, power?: number }} opts
   */
  triggerEffect(kind, opts = {}) {
    if (!this.renderer || !this.THREE || this.hidden || this.disabled) return;
    const THREE = this.THREE;

    const to = opts.to
      ?? (opts.soldierId && this.soldierEntries.get(opts.soldierId)?.curPos)
      ?? (opts.side ? this.castleWorldPos(opts.side) : { x: 0, y: 0.5, z: 0 });
    const from = opts.from ?? (opts.fromSide ? this.castleWorldPos(opts.fromSide) : { x: 0, y: 1.5, z: to.z > 0 ? -6.5 : 6.5 });

    if (kind === 'fire') {
      // High-arc blazing 3D fireball -> explosion + shockwave + camera shake
      const geo = new THREE.IcosahedronGeometry(0.48, 1);
      const mat = new THREE.MeshStandardMaterial({ color: '#ff8818', emissive: '#ff4400', emissiveIntensity: 3.0, roughness: 0.2 });
      const orb = new THREE.Mesh(geo, mat);
      this.fxGroup.add(orb);
      const dur = 0.36;
      this.activeEffects.push({
        age: 0,
        dur,
        update: (t) => {
          orb.position.set(
            from.x + (to.x - from.x) * t,
            1.4 + Math.sin(t * Math.PI) * 4.2,
            from.z + (to.z - from.z) * t,
          );
          orb.rotation.x += 0.25;
          orb.rotation.y += 0.3;
        },
        cleanup: () => {
          this.fxGroup.remove(orb);
          geo.dispose();
          mat.dispose();
          this.spawnRing(to, '#ff6a14', 3.4, 0.45);
          this.spawnBurst(to, '#ff7a18', 24, 5.8, 0.62, 4.5);
          this.flashLight('#ff5a00', 8.0, to, 0.42);
          this.addCameraShake(0.32, 0.30);
        },
      });
      return;
    }

    if (kind === 'lightning') {
      // Jagged 3D lightning bolt descending from sky
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const f = i / 7;
        const jitter = i === 0 || i === 7 ? 0 : 0.65;
        pts.push(new THREE.Vector3(
          to.x + (Math.random() - 0.5) * jitter,
          12.5 * (1 - f) + 0.2,
          to.z + (Math.random() - 0.5) * jitter,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 18, 0.14, 6, false);
      const mat = new THREE.MeshStandardMaterial({ color: '#e8fbff', emissive: '#66d8ff', emissiveIntensity: 4.0, transparent: true, opacity: 1 });
      const bolt = new THREE.Mesh(geo, mat);
      this.fxGroup.add(bolt);
      this.spawnRing(to, '#66e0ff', 3.0, 0.38);
      this.spawnBurst(to, '#99eeff', 18, 5.2, 0.45, 3.6);
      this.flashLight('#66ddff', 9.0, to, 0.32);
      this.addCameraShake(0.30, 0.26);
      this.activeEffects.push({
        age: 0,
        dur: 0.28,
        update: (t) => { mat.opacity = 1 - t; },
        cleanup: () => { this.fxGroup.remove(bolt); geo.dispose(); mat.dispose(); },
      });
      return;
    }

    if (kind === 'ice') {
      // Erupting ring of 3D ice crystals
      const geo = new THREE.ConeGeometry(0.34, 1.85, 5);
      const mat = new THREE.MeshStandardMaterial({
        color: '#99eeff', emissive: '#22aaff', emissiveIntensity: 1.4, roughness: 0.1, transparent: true, opacity: 0.88,
      });
      const spikes = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(to.x + Math.cos(a) * 1.15, -0.8, to.z + Math.sin(a) * 1.15);
        m.rotation.z = -Math.cos(a) * 0.28;
        m.rotation.x = Math.sin(a) * 0.28;
        this.fxGroup.add(m);
        spikes.push(m);
      }
      this.spawnRing(to, '#55d8ff', 2.8, 0.55);
      this.flashLight('#44ccff', 5.5, to, 0.45);
      this.activeEffects.push({
        age: 0,
        dur: 0.72,
        update: (t) => {
          const rise = t < 0.25 ? t / 0.25 : 1;
          const fade = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
          mat.opacity = 0.88 * fade;
          for (const m of spikes) m.position.y = -0.8 + rise * 1.55;
        },
        cleanup: () => { for (const m of spikes) this.fxGroup.remove(m); geo.dispose(); mat.dispose(); },
      });
      return;
    }

    if (kind === 'heal') {
      // Ascending golden-emerald 3D light pillar
      const geo = new THREE.CylinderGeometry(1.45, 1.65, 5.5, 18, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: '#66ffaa', transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false,
      });
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(to.x, 2.75, to.z);
      this.fxGroup.add(pillar);
      this.spawnRing(to, '#77ffbb', 2.4, 0.55);
      this.spawnBurst(to, '#ffe877', 16, 2.2, 0.68, 5.5);
      this.flashLight('#55ff99', 5.0, to, 0.48);
      this.activeEffects.push({
        age: 0,
        dur: 0.62,
        update: (t) => {
          pillar.rotation.y += 0.08;
          mat.opacity = 0.48 * (1 - t);
          pillar.scale.set(1 + t * 0.3, 1 + t * 0.2, 1 + t * 0.3);
        },
        cleanup: () => { this.fxGroup.remove(pillar); geo.dispose(); mat.dispose(); },
      });
      return;
    }

    if (kind === 'poison') {
      this.spawnRing(to, '#9c44ff', 2.8, 0.60);
      this.spawnBurst(to, '#66dd44', 20, 3.0, 0.72, 3.8);
      this.flashLight('#9038ff', 4.5, to, 0.45);
      return;
    }

    if (kind === 'wind') {
      this.spawnRing(to, '#77ffdd', 3.4, 0.48, 0.8);
      this.spawnBurst(to, '#aaffee', 18, 6.0, 0.50, 2.5);
      return;
    }

    if (kind === 'shot') {
      const col = opts.color ?? '#ffe066';
      const geo = new THREE.SphereGeometry(0.22, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 3.0 });
      const proj = new THREE.Mesh(geo, mat);
      this.fxGroup.add(proj);
      this.activeEffects.push({
        age: 0,
        dur: 0.24,
        update: (t) => {
          proj.position.set(
            from.x + (to.x - from.x) * t,
            1.1 + Math.sin(t * Math.PI) * 1.8,
            from.z + (to.z - from.z) * t,
          );
        },
        cleanup: () => {
          this.fxGroup.remove(proj);
          geo.dispose();
          mat.dispose();
          this.spawnBurst(to, col, 12, 3.6, 0.35, 2.2);
          this.spawnRing(to, col, 1.6, 0.28);
        },
      });
      return;
    }

    if (kind === 'eruption') {
      this.spawnRing(to, '#ff4800', 3.5, 0.55);
      this.spawnBurst(to, '#ff6810', 26, 5.2, 0.72, 6.5);
      this.flashLight('#ff4400', 7.5, to, 0.5);
      this.addCameraShake(0.30, 0.30);
      return;
    }

    // Default: clash / castleHit
    const col = opts.color ?? '#ffd94a';
    this.spawnRing(to, col, kind === 'castleHit' ? 3.2 : 1.8, 0.34);
    this.spawnBurst(to, col, kind === 'castleHit' ? 20 : 14, 4.6, 0.42, 3.4);
    if (kind === 'castleHit') {
      this.flashLight('#ff7733', 6.5, to, 0.30);
      this.addCameraShake(0.28, 0.26);
    }
  }

  applyLighting() {
    if (!this.THREE || !this.sun || !this.hemi) return;
    const look = STAGE_LOOK[this.stageId] ?? STAGE_LOOK.meadow;
    const isNight = this.timeOfDay === 'night';

    this.scene.background = new this.THREE.Color(look.bg);
    if (isNight) {
      this.scene.background.multiplyScalar(0.38);
      this.sun.color.set('#6d92e8');
      this.sun.intensity = look.sunInt * 0.45;
      this.hemi.color.set('#385599');
      this.hemi.groundColor.set('#0e162e');
      this.hemi.intensity = look.hemiInt * 0.55;
    } else {
      this.sun.color.set(look.sun);
      this.sun.intensity = look.sunInt;
      this.hemi.color.set(look.hemiSky);
      this.hemi.groundColor.set(look.hemiGnd);
      this.hemi.intensity = look.hemiInt;
    }
  }

  resize() {
    if (!this.renderer || !this.camera || !this.hostEl) return;
    const rect = this.hostEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    const vFovRad = (this.camera.fov * Math.PI) / 180;
    const tanHalfV = Math.tan(vFovRad / 2);
    const targetHalfW = aspect < 0.78 ? 6.35 : 6.10;
    const distForWidth = targetHalfW / (tanHalfV * aspect);
    const distForHeight = 9.4 / tanHalfV;
    const dist = Math.max(15.0, Math.min(distForWidth, distForHeight * 1.22));

    const pitch = (61 * Math.PI) / 180;
    const zShift = aspect < 0.78 ? 2.8 : 0.8;
    this.baseCamPos = { x: 0, y: Math.sin(pitch) * dist, z: Math.cos(pitch) * dist + zShift };
    this.baseCamLook = { x: 0, y: 0, z: zShift };
    this.camera.position.set(this.baseCamPos.x, this.baseCamPos.y, this.baseCamPos.z);
    this.camera.lookAt(this.baseCamLook.x, this.baseCamLook.y, this.baseCamLook.z);
    this.camera.updateProjectionMatrix();

    if (this.stageGroup && !this.hidden) {
      this.renderFrame(performance.now());
    }
  }

  maybeStartLoop() {
    if (this.rafId || this.disposed || this.hidden || document.hidden || !this.stageGroup) return;
    this.lastFrameTime = performance.now();
    const tick = (now) => {
      this.rafId = 0;
      if (this.disposed || this.hidden || document.hidden || !this.stageGroup) return;
      this.renderFrame(now);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  renderFrame(now) {
    if (!this.renderer || !this.scene || !this.camera) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) * 0.001));
    this.lastFrameTime = now;
    const t = (now - this.startTime) * 0.001;
    const reduced = prefersReducedMotion();

    // 1. Environment sway & glow pulse
    if (!reduced) {
      for (const item of this.swayNodes) {
        item.obj.rotation.z = item.baseRotZ + Math.sin(t * 1.45 + item.phase) * 0.025;
      }
      for (const item of this.smokeNodes) {
        item.obj.position.y = item.baseY + Math.sin(t * 1.2 + item.phase) * 0.14;
      }
      const nightBoost = this.timeOfDay === 'night' ? 1.35 : 1.0;
      for (const item of this.glowMats) {
        item.mat.emissiveIntensity = item.baseIntensity * nightBoost * (0.92 + 0.12 * Math.sin(t * 2.2));
      }
    }

    // 2. Smooth 3D soldier marching & idle bob
    const lerpSpeed = Math.min(1, dt * 8.5);
    for (const s of this.soldierEntries.values()) {
      s.curPos.x += (s.targetPos.x - s.curPos.x) * lerpSpeed;
      s.curPos.z += (s.targetPos.z - s.curPos.z) * lerpSpeed;
      const dist = Math.hypot(s.targetPos.x - s.curPos.x, s.targetPos.z - s.curPos.z);
      const bob = reduced ? 0 : (dist > 0.05 ? Math.abs(Math.sin(t * 14 + s.phase)) * 0.22 : Math.sin(t * 3.2 + s.phase) * 0.04);
      s.group.position.set(s.curPos.x, s.targetPos.y + bob, s.curPos.z);
    }

    // 3. Monster idle breathing & hover
    for (const m of this.monsterEntries.values()) {
      const bob = reduced ? 0 : Math.sin(t * 2.6 + m.phase) * 0.08;
      m.group.position.set(m.targetPos.x, m.targetPos.y + bob, m.targetPos.z);
      if (m.model && !reduced) {
        const s = 0.85 * (1 + Math.sin(t * 2.8 + m.phase) * 0.03);
        m.model.scale.set(0.85, s, 0.85);
      }
    }

    // 4. Castle spirit orbits & overdrive pulse
    for (const c of this.castleEntries.values()) {
      if (c.spiritOrb.visible && !reduced) {
        c.spiritOrb.position.set(Math.cos(t * 1.8) * 2.5, 3.6 + Math.sin(t * 3.2) * 0.25, Math.sin(t * 1.8) * 2.5);
        c.spiritOrb.rotation.y += dt * 2.5;
      }
      if (c.overdriveRing.visible && !reduced) {
        const p = 1 + Math.sin(t * 5.0) * 0.05;
        c.overdriveRing.scale.set(p, p, 1);
      }
    }

    // 5. Active 3D Magic & Combat VFX
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      fx.age += dt;
      const progress = Math.min(1, fx.age / fx.dur);
      fx.update(progress, dt);
      if (fx.age >= fx.dur) {
        fx.cleanup();
        this.activeEffects.splice(i, 1);
      }
    }

    // 6. Camera trauma shake
    if (this.shakeTime > 0 && !reduced) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const decay = this.shakeTime > 0 ? this.shakeAmp * (this.shakeTime / 0.3) : 0;
      this.camera.position.set(
        this.baseCamPos.x + (Math.random() - 0.5) * decay,
        this.baseCamPos.y + (Math.random() - 0.5) * decay,
        this.baseCamPos.z + (Math.random() - 0.5) * decay,
      );
      this.camera.lookAt(this.baseCamLook.x, this.baseCamLook.y, this.baseCamLook.z);
    } else if (this.camera.position.x !== this.baseCamPos.x) {
      this.camera.position.set(this.baseCamPos.x, this.baseCamPos.y, this.baseCamPos.z);
      this.camera.lookAt(this.baseCamLook.x, this.baseCamLook.y, this.baseCamLook.z);
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.disposed = true;
    this.stopLoop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this.renderer) {
      this.renderer.domElement?.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
    delete this.appEl.dataset.stage3d;
  }
}
