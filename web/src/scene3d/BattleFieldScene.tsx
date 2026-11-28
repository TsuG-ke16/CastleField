import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { GameState, MonsterState, RoadState, SoldierState } from '../engine/types';
import { cardTypeToImagePath } from '../engine/dataLoader';
import { DRACO_PATH } from './dracoPath';
import type { BattleFieldSceneProps } from './BattleFieldView';

const LANE_X = [-2.8, 0, 2.8];
const SQUARE_Z_FROM_ME = [5.0, 2.5, 0.0, -2.5, -5.0];

const STAGE_THEMES: Record<
  string,
  { bg2d: string; roadBg: string; hemiTop: string; hemiBottom: string; ambient: string; tint: number }
> = {
  meadow: {
    bg2d: 'linear-gradient(180deg, #87cb54 0%, #71b842 100%)',
    roadBg: 'linear-gradient(180deg, #ebd29d 0%, #dfc084 100%)',
    hemiTop: '#a9dcff',
    hemiBottom: '#6aa93d',
    ambient: '#fff7e2',
    tint: 1.25,
  },
  lava: {
    bg2d: 'linear-gradient(180deg, #5d2921 0%, #9b3722 55%, #cf5a28 100%)',
    roadBg: 'linear-gradient(180deg, #745149 0%, #583a34 100%)',
    hemiTop: '#ffae70',
    hemiBottom: '#8c2d19',
    ambient: '#ffd2b3',
    tint: 1.35,
  },
  ice: {
    bg2d: 'linear-gradient(180deg, #b8ecff 0%, #7cc4ea 100%)',
    roadBg: 'linear-gradient(180deg, #e7f6ff 0%, #c1e4f7 100%)',
    hemiTop: '#e3f7ff',
    hemiBottom: '#6ea8cc',
    ambient: '#edfaff',
    tint: 1.3,
  },
  ruins: {
    bg2d: 'linear-gradient(180deg, #7987a6 0%, #58637a 100%)',
    roadBg: 'linear-gradient(180deg, #d7d0be 0%, #afa793 100%)',
    hemiTop: '#c9d7ff',
    hemiBottom: '#5a5f75',
    ambient: '#f2edff',
    tint: 1.2,
  },
  darkForest: {
    bg2d: 'linear-gradient(180deg, #2d5543 0%, #1d3c2e 100%)',
    roadBg: 'linear-gradient(180deg, #988b6d 0%, #6d614a 100%)',
    hemiTop: '#7db59b',
    hemiBottom: '#1c3528',
    ambient: '#cbe3d4',
    tint: 1.05,
  },
  desert: {
    bg2d: 'linear-gradient(180deg, #f3cd7e 0%, #d49b4b 100%)',
    roadBg: 'linear-gradient(180deg, #faecc4 0%, #e1c07b 100%)',
    hemiTop: '#fff0c4',
    hemiBottom: '#c2883f',
    ambient: '#fff1d1',
    tint: 1.35,
  },
};

function laneXOf(roadId: string, roads: RoadState[]): number {
  const idx = roads.findIndex((r) => r.roadId === roadId);
  if (idx >= 0 && idx < LANE_X.length) return LANE_X[idx];
  return 0;
}

function squareZ(roadSquare: number, laneLen: number): number {
  if (laneLen <= 1) return 0;
  if (laneLen === 5 && roadSquare >= 0 && roadSquare < SQUARE_Z_FROM_ME.length) {
    return SQUARE_Z_FROM_ME[roadSquare];
  }
  const t = Math.max(0, Math.min(1, roadSquare / Math.max(1, laneLen - 1)));
  return 5.0 - t * 10.0;
}

function projectWorld(cam: THREE.PerspectiveCamera, x: number, y: number, z: number): { left: number; top: number } {
  const v = new THREE.Vector3(x, y, z).project(cam);
  return {
    left: (v.x * 0.5 + 0.5) * 100,
    top: (-v.y * 0.5 + 0.5) * 100,
  };
}

const STAGE_GLB_MAP: Record<string, string> = {
  meadow: '/assets/v2/models/field-meadow-v2.glb',
  lava: '/assets/v2/models/field-lava-v2.glb',
  ice: '/assets/v2/models/field-ice-v2.glb',
  ruins: '/assets/v2/models/field-ruins-v2.glb',
  darkForest: '/assets/v2/models/field-darkForest-v2.glb',
  desert: '/assets/v2/models/field-desert-v2.glb',
};

function StageBiomeModel({ stageId, shakePower }: { stageId: string; shakePower: number }) {
  const glbUrl = STAGE_GLB_MAP[stageId] || STAGE_GLB_MAP.meadow;
  const { scene } = useGLTF(glbUrl, DRACO_PATH);
  const cloned = useMemo(() => scene.clone(), [scene]);
  const rootRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!rootRef.current) return;
    if (shakePower > 0.05) {
      const t = clock.getElapsedTime() * 55;
      rootRef.current.position.x = Math.sin(t) * shakePower * 0.12;
      rootRef.current.position.z = Math.cos(t * 1.3) * shakePower * 0.08;
    } else {
      rootRef.current.position.set(0, 0, 0);
    }
  });

  return (
    <group ref={rootRef}>
      <primitive object={cloned} />
    </group>
  );
}

function BoardMeshes({
  state,
  viewerSide = 'p1',
  highlightRoadIds,
  highlightSoldierIds,
  highlightEnemyCastle,
  onSelectRoad,
  onSelectSoldier,
  onSelectEnemyCastle,
}: {
  state: GameState;
  viewerSide: 'p1' | 'p2';
  highlightRoadIds: string[];
  highlightSoldierIds: string[];
  highlightEnemyCastle: boolean;
  onSelectRoad: (roadId: string) => void;
  onSelectSoldier: (soldierId: string) => void;
  onSelectEnemyCastle: () => void;
}) {
  const roads = state.roads;
  const mySide: 'p1' | 'p2' = viewerSide;
  const oppSide: 'p1' | 'p2' = mySide === 'p1' ? 'p2' : 'p1';
  const laneLen = roads[0]?.length || 3;

  const roadSquareOf = (s: SoldierState, side: 'p1' | 'p2') =>
    side === mySide ? s.position : laneLen - 1 - s.position;

  return (
    <group>
      {/* Opponent Castle Pedestal */}
      <group position={[0, 0.35, -8.4]}>
        <mesh
          onClick={(e) => {
            if (highlightEnemyCastle) {
              e.stopPropagation();
              onSelectEnemyCastle();
            }
          }}
        >
          <cylinderGeometry args={[1.6, 1.8, 0.3, 18]} />
          <meshStandardMaterial
            color={highlightEnemyCastle ? '#ffbf52' : oppSide === 'p2' ? '#f28b38' : '#4da3e8'}
            emissive={highlightEnemyCastle ? '#ff9900' : '#000000'}
            emissiveIntensity={0.6}
          />
        </mesh>
      </group>

      {/* Viewer Castle Pedestal */}
      <group position={[0, 0.35, 8.4]}>
        <mesh>
          <cylinderGeometry args={[1.6, 1.8, 0.3, 18]} />
          <meshStandardMaterial color={mySide === 'p1' ? '#4da3e8' : '#f28b38'} />
        </mesh>
      </group>

      {/* Clickable Target Lane Pads */}
      {roads.map((road, idx) => {
        const isTarget = highlightRoadIds.includes(road.roadId);
        const x = LANE_X[idx] ?? 0;
        return (
          <mesh
            key={road.roadId}
            position={[x, 0.28, 3.2]}
            onClick={(e) => {
              if (isTarget) {
                e.stopPropagation();
                onSelectRoad(road.roadId);
              }
            }}
          >
            <boxGeometry args={[1.65, 0.08, 12.2]} />
            <meshStandardMaterial
              color={isTarget ? '#ffe37a' : '#ffffff'}
              transparent
              opacity={isTarget ? 0.45 : 0.0}
              emissive={isTarget ? '#ffb833' : '#000000'}
              emissiveIntensity={0.6}
            />
          </mesh>
        );
      })}

      {/* Soldier Bases */}
      {(['p1', 'p2'] as const).map((pid) => {
        const ps = state.players[pid];
        if (!ps) return null;
        return ps.soldiers.map((s) => {
          const x = laneXOf(s.roadId, roads) + (pid === mySide ? -0.15 : 0.15);
          const z = squareZ(roadSquareOf(s, pid), laneLen);
          const isTarget = highlightSoldierIds.includes(s.soldierId);
          return (
            <mesh
              key={s.soldierId}
              position={[x, 0.45, z]}
              onClick={(e) => {
                if (isTarget) {
                  e.stopPropagation();
                  onSelectSoldier(s.soldierId);
                }
              }}
            >
              <cylinderGeometry args={[0.55, 0.55, 0.1, 16]} />
              <meshStandardMaterial
                color={isTarget ? '#ffe37a' : pid === 'p1' ? '#4da3e8' : '#f5923e'}
                emissive={isTarget ? '#ffaa00' : '#000000'}
                emissiveIntensity={0.6}
              />
            </mesh>
          );
        });
      })}
    </group>
  );
}

export function BattleFieldScene(props: BattleFieldSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 480 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) {
        setSize({ w: r.width, h: r.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeStage = props.state.stage || props.stageId || 'meadow';
  const theme = STAGE_THEMES[activeStage] || STAGE_THEMES.meadow;
  const isNight = props.state.time === 'night';
  const mySide: 'p1' | 'p2' = props.viewerSide || 'p1';
  const oppSide: 'p1' | 'p2' = mySide === 'p1' ? 'p2' : 'p1';

  const cam = useMemo(() => {
    const aspect = Math.max(0.4, size.w / Math.max(1, size.h));
    const c = new THREE.PerspectiveCamera(44, aspect, 0.2, 100);
    c.position.set(0, 18.2, 16.5);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    return c;
  }, [size.w, size.h]);

  if (props.quality === '2d') {
    const roads = props.state.roads;
    const laneLen = roads[0]?.length || 3;
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: theme.bg2d,
          filter: isNight ? 'brightness(0.82) saturate(0.95)' : undefined,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, roads.length)}, 1fr)`,
          gap: 10,
          padding: '44px 14px 44px',
        }}
      >
        {roads.map((road) => {
          const isTarget = props.highlightRoadIds.includes(road.roadId);
          const mySoldiers = (props.state.players[mySide]?.soldiers || []).filter((s) => s.roadId === road.roadId);
          const oppSoldiers = (props.state.players[oppSide]?.soldiers || []).filter((s) => s.roadId === road.roadId);
          const monsters = props.state.monsters.filter((m) => m.roadId === road.roadId);
          return (
            <div
              key={road.roadId}
              onClick={() => isTarget && props.onSelectRoad(road.roadId)}
              style={{
                position: 'relative',
                borderRadius: 14,
                background: isTarget
                  ? 'linear-gradient(180deg, #fff0ad 0%, #f0c965 100%)'
                  : theme.roadBg,
                border: isTarget ? '3px solid #3465cc' : '2.5px solid #7a5638',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 4px',
                cursor: isTarget ? 'pointer' : 'default',
              }}
            >
              {Array.from({ length: laneLen }).map((_, sqIdx) => {
                const sqFromTop = sqIdx;
                const sqFromBottom = laneLen - 1 - sqIdx;
                const oppHere = oppSoldiers.filter((s) => s.position === sqFromTop);
                const myHere = mySoldiers.filter((s) => s.position === sqFromBottom);
                const monSquare = mySide === 'p1' ? sqFromBottom : sqFromTop;
                const monHere = monsters.filter((m) => m.square === monSquare);
                return (
                  <div
                    key={sqIdx}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: '#f2ead9',
                      border: '2px solid #b09567',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    {[...oppHere, ...myHere].map((s) => (
                      <img
                        key={s.soldierId}
                        src={cardTypeToImagePath(s.type)}
                        alt={s.type}
                        onClick={(e) => {
                          if (props.highlightSoldierIds.includes(s.soldierId)) {
                            e.stopPropagation();
                            props.onSelectSoldier(s.soldierId);
                          }
                        }}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          objectFit: 'contain',
                          filter: props.state.players[mySide]?.soldiers.some((ps) => ps.soldierId === s.soldierId)
                            ? props.mySoldierFilter
                            : undefined,
                        }}
                      />
                    ))}
                    {monHere.map((m) => (
                      <span key={m.monsterId} style={{ fontSize: 10, fontWeight: 900, color: '#a82a24' }}>
                        👾{m.hp}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  const roads = props.state.roads;
  const laneLen = roads[0]?.length || 3;
  const oppCastlePos = projectWorld(cam, 0, 1.5, -8.4);
  const myCastlePos = projectWorld(cam, 0, 1.5, 8.4);
  const myCastleImg = mySide === 'p1' ? '/assets/castles/castle-blue.png' : '/assets/castles/castle-orange.png';
  const oppCastleImg = oppSide === 'p1' ? '/assets/castles/castle-blue.png' : '/assets/castles/castle-orange.png';

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: isNight ? 'linear-gradient(180deg, #1b274b 0%, #314275 55%, #274435 100%)' : theme.bg2d,
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 18.2, 16.5], fov: 44, near: 0.2, far: 100 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={isNight ? 0.72 : theme.tint} color={isNight ? '#a7bfff' : theme.ambient} />
        <hemisphereLight args={[isNight ? '#6078c9' : theme.hemiTop, theme.hemiBottom, isNight ? 0.65 : 1.0]} />
        <directionalLight position={[8, 18, 10]} intensity={isNight ? 1.15 : 2.0} color={isNight ? '#c8d6ff' : '#fff6de'} />
        <Suspense fallback={null}>
          <StageBiomeModel key={activeStage} stageId={activeStage} shakePower={props.shakePower} />
          <BoardMeshes
            state={props.state}
            viewerSide={mySide}
            highlightRoadIds={props.highlightRoadIds}
            highlightSoldierIds={props.highlightSoldierIds}
            highlightEnemyCastle={props.highlightEnemyCastle}
            onSelectRoad={props.onSelectRoad}
            onSelectSoldier={props.onSelectSoldier}
            onSelectEnemyCastle={props.onSelectEnemyCastle}
          />
        </Suspense>
      </Canvas>

      {/* Projected 2D Sprite Overlay inside local stacking context (zero <Html> React portals) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
        {/* Opponent Castle */}
        <button
          type="button"
          onClick={() => props.highlightEnemyCastle && props.onSelectEnemyCastle()}
          style={{
            position: 'absolute',
            left: `${oppCastlePos.left}%`,
            top: `${oppCastlePos.top}%`,
            transform: 'translate(-50%, -50%)',
            background: 'none',
            border: props.highlightEnemyCastle ? '3px solid #ffe37a' : 'none',
            borderRadius: 16,
            padding: 0,
            pointerEvents: props.highlightEnemyCastle ? 'auto' : 'none',
            cursor: props.highlightEnemyCastle ? 'pointer' : 'default',
          }}
        >
          <img
            src={oppCastleImg}
            alt="相手の城"
            style={{
              width: 68,
              height: 68,
              objectFit: 'contain',
            }}
          />
        </button>

        {/* Viewer Castle */}
        <img
          src={myCastleImg}
          alt="自分の城"
          style={{
            position: 'absolute',
            left: `${myCastlePos.left}%`,
            top: `${myCastlePos.top}%`,
            transform: 'translate(-50%, -50%)',
            width: 72,
            height: 72,
            objectFit: 'contain',
            filter: props.myCastleFilter,
          }}
        />

        {/* Soldiers */}
        {(['p1', 'p2'] as const).map((pid) => {
          const ps = props.state.players[pid];
          if (!ps) return null;
          return ps.soldiers.map((s) => {
            const x = laneXOf(s.roadId, roads) + (pid === mySide ? -0.15 : 0.15);
            const sq = pid === mySide ? s.position : laneLen - 1 - s.position;
            const z = squareZ(sq, laneLen);
            const pos = projectWorld(cam, x, 1.35, z);
            const isTarget = props.highlightSoldierIds.includes(s.soldierId);
            return (
              <button
                key={s.soldierId}
                type="button"
                onClick={() => isTarget && props.onSelectSoldier(s.soldierId)}
                style={{
                  position: 'absolute',
                  left: `${pos.left}%`,
                  top: `${pos.top}%`,
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  pointerEvents: isTarget ? 'auto' : 'none',
                  cursor: isTarget ? 'pointer' : 'default',
                }}
              >
                <img
                  src={cardTypeToImagePath(s.type)}
                  alt={s.name || s.type}
                  style={{
                    width: 44,
                    height: 44,
                    objectFit: 'contain',
                    borderRadius: 10,
                    border: `2.5px solid ${isTarget ? '#ffe37a' : pid === 'p1' ? '#2a6cab' : '#c05a1c'}`,
                    background: '#fffaf0',
                    filter: pid === mySide ? props.mySoldierFilter : undefined,
                  }}
                />
                <span
                  style={{
                    marginTop: -6,
                    background: pid === 'p1' ? '#234799' : '#c05a1c',
                    color: '#fffaf0',
                    fontSize: 10,
                    fontWeight: 900,
                    padding: '1px 6px',
                    borderRadius: 999,
                    border: '1.5px solid #4a2e1a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⚔{s.attack} ❤{s.hp}{s.shield > 0 ? ` 🛡${s.shield}` : ''}
                </span>
              </button>
            );
          });
        })}

        {/* Monsters */}
        {props.state.monsters.map((m: MonsterState) => {
          const x = laneXOf(m.roadId, roads);
          const sq = mySide === 'p1' ? m.square : laneLen - 1 - m.square;
          const z = squareZ(sq, laneLen);
          const pos = projectWorld(cam, x, 1.45, z);
          const isTarget = props.highlightMonsterIds.includes(m.monsterId);
          return (
            <button
              key={m.monsterId}
              type="button"
              onClick={() => isTarget && props.onSelectMonster(m.monsterId)}
              style={{
                position: 'absolute',
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                padding: 0,
                pointerEvents: isTarget ? 'auto' : 'none',
                cursor: isTarget ? 'pointer' : 'default',
              }}
            >
              <img
                src={`/assets/cards/card-beast-${m.type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.png`}
                alt={m.type}
                style={{
                  width: 50,
                  height: 50,
                  objectFit: 'contain',
                  borderRadius: 12,
                  border: `3px solid ${isTarget ? '#ffe37a' : '#a82a24'}`,
                  background: '#fff2ee',
                }}
              />
              <span
                style={{
                  marginTop: -6,
                  background: '#a82a24',
                  color: '#fffaf0',
                  fontSize: 10,
                  fontWeight: 900,
                  padding: '1px 6px',
                  borderRadius: 999,
                  border: '1.5px solid #4a2e1a',
                }}
              >
                魔物 ❤{m.hp} (あと{m.attackIn})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
