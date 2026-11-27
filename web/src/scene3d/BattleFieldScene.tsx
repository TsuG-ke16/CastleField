import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { GameState, MonsterState, RoadState, SoldierState } from '../engine/types';
import { cardTypeToImagePath } from '../engine/dataLoader';

interface BattleFieldSceneProps {
  state: GameState;
  quality: '3d' | '2d';
  shakePower: number;
  highlightRoadIds: string[];
  highlightSoldierIds: string[];
  highlightMonsterIds: string[];
  highlightEnemyCastle: boolean;
  onSelectRoad: (roadId: string) => void;
  onSelectSoldier: (soldierId: string) => void;
  onSelectMonster: (monsterId: string) => void;
  onSelectEnemyCastle: () => void;
}

const LANE_X = [-2.8, 0, 2.8];
const SQUARE_Z_FROM_ME = [5.0, 2.5, 0.0, -2.5, -5.0];

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

function MeadowModel({ shakePower }: { shakePower: number }) {
  const { scene } = useGLTF('/assets/v2/models/field-meadow-v2.glb');
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

function BoardEntities({
  state,
  highlightRoadIds,
  highlightSoldierIds,
  highlightMonsterIds,
  highlightEnemyCastle,
  onSelectRoad,
  onSelectSoldier,
  onSelectMonster,
  onSelectEnemyCastle,
}: Omit<BattleFieldSceneProps, 'quality' | 'shakePower'>) {
  const roads = state.roads;
  const p1 = state.players['p1'];
  const p2 = state.players['p2'];
  const laneLen = roads[0]?.length || 3;

  const roadSquareOf = (s: SoldierState, side: 'p1' | 'p2') => {
    return side === 'p1' ? s.position : laneLen - 1 - s.position;
  };

  return (
    <group>
      {/* Opponent Castle (North, Z = -8.4) */}
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
          <meshStandardMaterial color={highlightEnemyCastle ? '#ffbf52' : '#f28b38'} emissive={highlightEnemyCastle ? '#ff9900' : '#000000'} emissiveIntensity={0.6} />
        </mesh>
        <Html position={[0, 1.3, 0]} center distanceFactor={14}>
          <button
            type="button"
            onClick={() => highlightEnemyCastle && onSelectEnemyCastle()}
            style={{
              background: 'none',
              border: highlightEnemyCastle ? '3px solid #ffe37a' : 'none',
              borderRadius: 16,
              padding: 0,
              cursor: highlightEnemyCastle ? 'pointer' : 'default',
            }}
          >
            <img src="/assets/castles/castle-orange.png" alt="相手の城" style={{ width: 76, height: 76, objectFit: 'contain' }} />
          </button>
        </Html>
      </group>

      {/* Player Castle (South, Z = +8.4) */}
      <group position={[0, 0.35, 8.4]}>
        <mesh>
          <cylinderGeometry args={[1.6, 1.8, 0.3, 18]} />
          <meshStandardMaterial color="#4da3e8" />
        </mesh>
        <Html position={[0, 1.3, 0]} center distanceFactor={14}>
          <img src="/assets/castles/castle-blue.png" alt="自分の城" style={{ width: 80, height: 80, objectFit: 'contain', pointerEvents: 'none' }} />
        </Html>
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

      {/* Soldiers (p1 & p2) */}
      {(['p1', 'p2'] as const).map((pid) => {
        const ps = pid === 'p1' ? p1 : p2;
        if (!ps) return null;
        return ps.soldiers.map((s) => {
          const x = laneXOf(s.roadId, roads) + (pid === 'p1' ? -0.15 : 0.15);
          const z = squareZ(roadSquareOf(s, pid), laneLen);
          const isTarget = highlightSoldierIds.includes(s.soldierId);
          return (
            <group key={s.soldierId} position={[x, 0.45, z]}>
              <mesh
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
              <Html position={[0, 0.9, 0]} center distanceFactor={14}>
                <button
                  type="button"
                  onClick={() => isTarget && onSelectSoldier(s.soldierId)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: isTarget ? 'pointer' : 'default',
                  }}
                >
                  <img
                    src={cardTypeToImagePath(s.type)}
                    alt={s.name || s.type}
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: 'contain',
                      borderRadius: 10,
                      border: `2.5px solid ${isTarget ? '#ffe37a' : pid === 'p1' ? '#2a6cab' : '#c05a1c'}`,
                      background: '#fffaf0',
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
              </Html>
            </group>
          );
        });
      })}

      {/* Monsters */}
      {state.monsters.map((m: MonsterState) => {
        const x = laneXOf(m.roadId, roads);
        const z = squareZ(m.square, laneLen);
        const isTarget = highlightMonsterIds.includes(m.monsterId);
        return (
          <group key={m.monsterId} position={[x, 0.5, z]}>
            <Html position={[0, 0.95, 0]} center distanceFactor={14}>
              <button
                type="button"
                onClick={() => isTarget && onSelectMonster(m.monsterId)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: isTarget ? 'pointer' : 'default',
                }}
              >
                <img
                  src={`/assets/cards/card-beast-${m.type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.png`}
                  alt={m.type}
                  style={{
                    width: 54,
                    height: 54,
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
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export function BattleFieldScene(props: BattleFieldSceneProps) {
  if (props.quality === '2d') {
    const roads = props.state.roads;
    const laneLen = roads[0]?.length || 3;
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, #87cb54 0%, #71b842 100%)',
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, roads.length)}, 1fr)`,
          gap: 10,
          padding: '44px 14px 44px',
        }}
      >
        {roads.map((road) => {
          const isTarget = props.highlightRoadIds.includes(road.roadId);
          const mySoldiers = (props.state.players.p1?.soldiers || []).filter((s) => s.roadId === road.roadId);
          const oppSoldiers = (props.state.players.p2?.soldiers || []).filter((s) => s.roadId === road.roadId);
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
                  : 'linear-gradient(180deg, #ebd29d 0%, #dfc084 100%)',
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
                const monHere = monsters.filter((m) => m.square === sqFromBottom);
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
                        style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }}
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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 18.2, 16.5], fov: 44, near: 0.2, far: 100 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.25} color="#fff7e2" />
        <hemisphereLight args={['#a9dcff', '#6aa93d', 1.0]} />
        <directionalLight position={[8, 18, 10]} intensity={2.0} color="#fff6de" />
        <Suspense fallback={null}>
          <MeadowModel shakePower={props.shakePower} />
          <BoardEntities
            state={props.state}
            highlightRoadIds={props.highlightRoadIds}
            highlightSoldierIds={props.highlightSoldierIds}
            highlightMonsterIds={props.highlightMonsterIds}
            highlightEnemyCastle={props.highlightEnemyCastle}
            onSelectRoad={props.onSelectRoad}
            onSelectSoldier={props.onSelectSoldier}
            onSelectMonster={props.onSelectMonster}
            onSelectEnemyCastle={props.onSelectEnemyCastle}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
