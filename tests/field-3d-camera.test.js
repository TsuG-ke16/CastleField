// 第1任務〜第4任務：3D カメラシステム・Raycaster 空間選択・3D→2D 座標射影・階層アニメーションの単体テスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three/three.module.min.js';
import { FieldGL, CAMERA_MODES, CAM_BOUNDS } from '../js/ui/FieldGL.js';

function createTestFieldGL(width = 1280, height = 800) {
  const appEl = { dataset: {} };
  const hostEl = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    appendChild: () => {},
  };
  const fg = new FieldGL(appEl, hostEl);
  fg.THREE = THREE;
  fg.scene = new THREE.Scene();
  fg.camera = new THREE.PerspectiveCamera(34, width / height, 0.5, 95);
  fg.stageGroup = new THREE.Group();
  fg.stoneGroup = new THREE.Group();
  fg.entityGroup = new THREE.Group();
  fg.fxGroup = new THREE.Group();
  fg.scene.add(fg.stageGroup, fg.stoneGroup, fg.entityGroup, fg.fxGroup);
  fg.raycaster = new THREE.Raycaster();
  fg.ndcVec = new THREE.Vector2();
  fg.projVec = new THREE.Vector3();
  fg.renderer = {
    domElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    },
    setSize: () => {},
    setPixelRatio: () => {},
    render: () => {},
    info: { render: { calls: 24, triangles: 18500 }, memory: { geometries: 18, textures: 2 } },
  };
  fg.laneCount = 3;
  fg.laneLength = 5;

  // Build 15 stepping stone pick colliders
  const hitGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.28, 12);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (let lane = 0; lane < 3; lane++) {
    for (let row = 0; row < 5; row++) {
      const pos = fg.cellWorldPos(lane, row);
      const isMid = row === 2;
      const pickInfo = { kind: 'stone', lane, row, isMid };
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.12, 12), new THREE.MeshStandardMaterial());
      st.position.set(pos.x, 0.01, pos.z);
      st.userData.pickInfo = pickInfo;
      const ringMat = new THREE.MeshBasicMaterial();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 16), ringMat);
      ring.position.set(pos.x, 0.05, pos.z);
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.set(pos.x, 0.12, pos.z);
      hitMesh.userData.pickInfo = pickInfo;
      fg.stoneGroup.add(st, ring, hitMesh);
      fg.stoneMeshes.push({ mesh: st, ring, ringMat, hitMesh, lane, row, isMid });
    }
  }

  // Add castles (me & opp) with hierarchical sub-nodes
  for (const side of ['me', 'opp']) {
    const pos = fg.castleWorldPos(side);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    group.rotation.y = side === 'opp' ? Math.PI : 0;
    const sc = side === 'opp' ? 0.88 : 0.80;
    group.scale.set(sc, sc, sc);
    const pickInfo = { kind: 'castle', side, playerId: side === 'me' ? 'p1' : 'p2' };
    group.userData.pickInfo = pickInfo;
    const hitMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.1, 2.5, 14), hitMat);
    hitMesh.position.y = 1.25;
    hitMesh.userData.pickInfo = pickInfo;
    group.add(hitMesh);

    const model = new THREE.Group();
    for (const partName of ['Castle_Base', 'Castle_Walls', 'Castle_Keep', 'Castle_Tower_FL', 'Castle_Tower_FR', 'Castle_Tower_BL', 'Castle_Tower_BR', 'Castle_Flag_Main']) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshStandardMaterial());
      mesh.name = partName;
      mesh.userData.pickInfo = pickInfo;
      model.add(mesh);
    }
    group.add(model);
    const spiritOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial());
    spiritOrb.visible = false;
    const armorDome = new THREE.Mesh(new THREE.SphereGeometry(2.8, 12, 8), new THREE.MeshBasicMaterial());
    armorDome.visible = false;
    const overdriveRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 16), new THREE.MeshBasicMaterial());
    overdriveRing.visible = false;
    group.add(spiritOrb, armorDome, overdriveRing);
    fg.entityGroup.add(group);
    fg.castleEntries.set(side, {
      group,
      model,
      rig: fg.bindModelRig(model),
      materials: [],
      hitMesh,
      armorDome,
      overdriveRing,
      spiritOrb,
      type: 'standard',
      color: side === 'me' ? 'blue' : 'orange',
      hpRatio: 1,
      recoilTime: 0,
      collapseProgress: 0,
      isCollapsed: false,
      hitFlash: 0,
    });
  }

  // Add sample soldiers with hierarchical animation nodes
  const addTestSoldier = (id, type, side, lane, row) => {
    const base = fg.cellWorldPos(lane, row);
    const targetPos = { x: base.x + (side === 'me' ? 0.52 : -0.52), y: 0.16, z: base.z };
    const group = new THREE.Group();
    group.position.set(targetPos.x, targetPos.y, targetPos.z);
    const pickInfo = { kind: 'soldier', soldierId: id, lane, row, side };
    group.userData.pickInfo = pickInfo;
    const hitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.9, 10), hitMat);
    hitMesh.position.y = 0.92;
    hitMesh.userData.pickInfo = pickInfo;
    group.add(hitMesh);

    const model = new THREE.Group();
    for (const nodeName of [
      'Anim_Body', 'Anim_Head', 'Anim_ArmL', 'Anim_ArmR', 'Anim_LegL', 'Anim_LegR',
      'Anim_Cape', 'Anim_Plume', 'Anim_StaffOrb',
      'Anim_MountBody', 'Anim_MountHead', 'Anim_MountLegFL', 'Anim_MountLegFR', 'Anim_MountLegBL', 'Anim_MountLegBR', 'Anim_MountTail',
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), new THREE.MeshStandardMaterial());
      m.name = nodeName;
      m.userData.pickInfo = pickInfo;
      model.add(m);
    }
    group.add(model);
    fg.entityGroup.add(group);
    const iceCage = new THREE.Mesh();
    iceCage.visible = false;
    const shieldRing = new THREE.Mesh();
    shieldRing.visible = false;
    fg.soldierEntries.set(id, {
      id,
      group,
      model,
      rig: fg.bindModelRig(model),
      materials: [],
      hitMesh,
      auraRing: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()),
      iceCage,
      shieldRing,
      type,
      rawType: type,
      color: side === 'me' ? 'blue' : 'orange',
      side,
      lane,
      row,
      curPos: { ...targetPos },
      targetPos: { ...targetPos },
      phase: 0,
      action: null,
      hitFlash: 0,
      dustTimer: 0,
    });
  };
  addTestSoldier('s1', 'infantry', 'me', 0, 3);
  addTestSoldier('s2', 'knight', 'me', 1, 2);
  addTestSoldier('s3', 'mage', 'opp', 2, 1);

  // Add sample monster at center cell (lane 1, row 2)
  const mBase = fg.cellWorldPos(1, 2);
  const mPos = { x: mBase.x, y: 0.22, z: mBase.z };
  const mGroup = new THREE.Group();
  mGroup.position.set(mPos.x, mPos.y, mPos.z);
  const mPick = { kind: 'monster', monsterId: 'm1', lane: 1, row: 2 };
  mGroup.userData.pickInfo = mPick;
  const mHit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 10), hitMat);
  mHit.position.y = 1.0;
  mHit.userData.pickInfo = mPick;
  mGroup.add(mHit);
  fg.entityGroup.add(mGroup);
  fg.monsterEntries.set('m1', {
    id: 'm1',
    group: mGroup,
    model: new THREE.Group(),
    materials: [],
    hitMesh: mHit,
    type: 'golem',
    lane: 1,
    row: 2,
    targetPos: { ...mPos },
    curPos: { ...mPos },
    phase: 0,
    hitFlash: 0,
  });

  fg.resize(true);
  fg.applyCameraTransform(0.016);
  return fg;
}

test('第1任務：カメラモード切替（battle / appreciation / overhead）、回転・ズーム・フォーカス・即時リセット・衝突境界制御', () => {
  const fg = createTestFieldGL(1280, 800);

  // 1. Default mode is battle
  assert.equal(fg.getCameraMode(), 'battle');

  // 2. Appreciation mode lowers pitch and brings camera closer
  fg.setCameraMode('appreciation', { instant: true });
  assert.equal(fg.getCameraMode(), 'appreciation');
  assert.ok(fg.camState.pitch < 0.55, '鑑賞モードは低角度になる');

  // 3. Overhead mode raises pitch to high angle
  fg.setCameraMode('overhead', { instant: true });
  assert.equal(fg.getCameraMode(), 'overhead');
  assert.ok(fg.camState.pitch > 0.9, '俯瞰モードは高角度になる');

  // 4. Orbit, zoom, pan within bounds
  fg.setCameraMode('battle', { instant: true });
  fg.orbitBy(0.45, -0.15);
  fg.zoomBy(0.85);
  fg.panBy(1.2, -0.8);
  for (let i = 0; i < 60; i++) fg.applyCameraTransform(0.016);
  assert.ok(Math.abs(fg.camState.yaw - 0.45) < 0.05, 'カメラが滑らかに回転する');
  assert.ok(fg.camState.pitch >= CAM_BOUNDS.minPitch && fg.camState.pitch <= CAM_BOUNDS.maxPitch);
  assert.ok(fg.camState.dist >= CAM_BOUNDS.minDist && fg.camState.dist <= CAM_BOUNDS.maxDist);

  // 5. Extreme orbit/zoom/pan clamping & anti-clipping collision repulsion
  fg.orbitBy(10.0, -10.0);
  fg.zoomBy(0.01);
  fg.panBy(100.0, 100.0);
  for (let i = 0; i < 60; i++) fg.applyCameraTransform(0.016);
  assert.ok(fg.camera.position.y >= CAM_BOUNDS.minCamY, 'カメラが地面の下へ入り込まない');

  // Direct anti-clipping test against castle & unit bounding spheres
  const castlePos = fg.castleWorldPos('me');
  const clamped = fg.clampCameraWorldPosition({ x: castlePos.x + 0.1, y: 1.0, z: castlePos.z - 0.1 }, castlePos);
  const distToCastle = Math.hypot(clamped.x - castlePos.x, clamped.y - 1.65, clamped.z - castlePos.z);
  assert.ok(distToCastle >= CAM_BOUNDS.castleRadius - 0.01, 'カメラが城モデルの内部へめり込まない');

  // 6. Focus on arbitrary target (soldier, castle, stone, monster) & cycleFocusTarget
  const focused = fg.focusOnTarget({ kind: 'soldier', soldierId: 's1' });
  assert.equal(focused, true);
  for (let i = 0; i < 60; i++) fg.applyCameraTransform(0.016);
  const s1Pos = fg.soldierEntries.get('s1').curPos;
  assert.ok(Math.hypot(fg.camState.look.x - s1Pos.x, fg.camState.look.z - s1Pos.z) < 0.25, '対象兵士にフォーカスできる');

  const cycled = fg.cycleFocusTarget();
  assert.ok(cycled, 'フォーカス対象を順番に切り替えられる');

  // 7. Instant reset returns to default viewpoint
  fg.resetCamera({ instant: true });
  assert.equal(fg.camState.focusTarget, null);
  assert.equal(fg.camState.userCustomized, false);
  assert.ok(Math.abs(fg.camState.yaw) < 0.001, '元の視点に即時復帰する');
});

test('第2任務：カメラ回転・低角度鑑賞モードでも Raycaster で 15 マスの踏み石・兵士・城・魔物を正確に選択でき、3D→2D 座標射影が追従する', () => {
  const fg = createTestFieldGL(1280, 800);

  const verifyAllPicksAtCurrentCamera = (label) => {
    fg.applyCameraTransform(0.016);
    fg.scene.updateMatrixWorld(true);

    // 1. All 15 stepping stones project onto screen and can be raycast-picked
    for (let lane = 0; lane < 3; lane++) {
      for (let row = 0; row < 5; row++) {
        const worldPos = fg.cellWorldPos(lane, row);
        const screenPt = fg.projectWorldToScreen({ x: worldPos.x, y: 0.12, z: worldPos.z });
        assert.ok(screenPt && screenPt.visible, `${label}: 踏み石(${lane},${row})が画面内に射影される`);
        const res = fg.pickAtScreen(screenPt.x, screenPt.y);
        assert.ok(res.hits.length > 0, `${label}: 踏み石(${lane},${row})のスクリーン座標で3Dピックできる`);
      }
    }

    // 2. Soldiers can be picked at their projected 3D position even after camera rotation
    for (const [id, s] of fg.soldierEntries) {
      const pt = fg.projectWorldToScreen({ x: s.curPos.x, y: 1.0, z: s.curPos.z });
      assert.ok(pt && pt.visible, `${label}: 兵士 ${id} が画面内に射影される`);
      const res = fg.pickAtScreen(pt.x, pt.y);
      assert.ok(res.primary && res.primary.kind === 'soldier' && res.primary.soldierId === id, `${label}: 兵士 ${id} を3Dレイキャストで正確に選択できる (got ${JSON.stringify(res.primary)})`);
    }

    // 3. Castles (me & opp) can be picked at their projected 3D position
    for (const side of ['me', 'opp']) {
      const cPos = fg.castleWorldPos(side);
      const pt = fg.projectWorldToScreen({ x: cPos.x, y: 1.2, z: cPos.z });
      assert.ok(pt && pt.visible, `${label}: 城 ${side} が画面内に射影される`);
      const res = fg.pickAtScreen(pt.x, pt.y);
      assert.ok(res.hits.some((h) => h.kind === 'castle' && h.side === side), `${label}: 城 ${side} を3Dレイキャストで選択できる`);
    }
  };

  // Default battle camera
  verifyAllPicksAtCurrentCamera('標準3Dカメラ');

  // Rotated & zoomed camera (+28 deg yaw)
  fg.orbitBy(0.48, -0.10);
  fg.zoomBy(0.90);
  for (let i = 0; i < 60; i++) fg.applyCameraTransform(0.016);
  verifyAllPicksAtCurrentCamera('カメラ回転・ズーム後');

  // Low-angle appreciation mode rotated the opposite way (-25 deg yaw)
  fg.setCameraMode('appreciation', { instant: true });
  fg.orbitBy(-0.42, 0.05);
  for (let i = 0; i < 60; i++) fg.applyCameraTransform(0.016);
  verifyAllPicksAtCurrentCamera('低角度鑑賞モード回転後');
});

test('第4任務：兵士（歩兵・騎士・魔法使い）の3D階層アニメーションと落城崩壊・カメラ演出・スキップ対応', () => {
  const fg = createTestFieldGL(1280, 800);

  // 1. Marching & Knight mounted gallop animation
  const s1 = fg.soldierEntries.get('s1');
  const s2 = fg.soldierEntries.get('s2');
  const s3 = fg.soldierEntries.get('s3');
  s1.targetPos.z -= 1.8;
  s2.targetPos.z -= 1.8;
  fg.updateSoldierAnimation(s1, 1.0, 0.05, false);
  fg.updateSoldierAnimation(s2, 1.0, 0.05, false);
  assert.notEqual(s1.rig.nodes.Anim_LegL.rotation.x, 0, '歩兵の進軍アニメーション（脚スイング）が稼働する');
  assert.notEqual(s2.rig.nodes.Anim_MountLegFL.rotation.x, 0, '騎士の軍馬の脚がギャロップ動作する');

  // 2. Melee attack & Mage casting motion
  fg.playUnitAction('s1', 'attack');
  fg.playUnitAction('s3', 'cast');
  fg.updateSoldierAnimation(s1, 1.2, 0.15, false);
  fg.updateSoldierAnimation(s3, 1.2, 0.15, false);
  assert.notEqual(s1.rig.nodes.Anim_ArmR.rotation.x, 0, '歩兵の武器スイングが動作する');
  assert.ok(s3.rig.nodes.Anim_StaffOrb.scale.x > 1.0, '魔法使いの詠唱で杖の宝玉が膨張・発光する');

  // 3. Hit reaction & Defeat knockout animation
  fg.playUnitAction('s1', 'hit', { power: 1.4 });
  assert.ok(s1.hitFlash > 0.8, '被弾時に発光フラッシュが入る');
  const fxBefore = fg.activeEffects.length;
  fg.playUnitAction('s1', 'defeat');
  assert.ok(fg.activeEffects.length > fxBefore, '撃破時に3D退場アニメーションが生成される');

  // 4. Castle collapse structural animation
  fg.playCastleCollapse('opp');
  const oppCastle = fg.castleEntries.get('opp');
  oppCastle.isCollapsed = true;
  fg.updateCastleAnimation(oppCastle, 2.0, 0.4, false);
  assert.ok(oppCastle.rig.nodes.Castle_Keep.position.y < 0, '落城時に中央天守と塔が崩壊沈下する');

  // 5. Skip clears cinematic cues and camera shake immediately without blocking game flow
  fg.playCinematicCue({ look: { x: 0, y: 1, z: -5.5 }, dist: 10, dur: 0.8 });
  fg.addCameraShake(0.5, 0.5);
  assert.ok(fg.camState.cinematic !== null);
  fg.skipAnimations();
  assert.equal(fg.camState.cinematic, null, 'スキップ時にカメラ演出が即時解除される');
  assert.equal(fg.shakeTime, 0, 'スキップ時にカメラシェイクが即時停止する');
});
