import { cardTypeToImagePath } from '../engine/dataLoader';
import type { MonsterState } from '../engine/types';
import type { BattleFieldSceneProps } from './BattleFieldView';

const STAGE_BG: Record<string, string> = {
  meadow: 'linear-gradient(180deg, #87cb54 0%, #68ae3b 100%)',
  lava: 'linear-gradient(180deg, #4b2019 0%, #8f311d 55%, #c55324 100%)',
  ice: 'linear-gradient(180deg, #b8ecff 0%, #7cc4ea 100%)',
  ruins: 'linear-gradient(180deg, #7987a6 0%, #556077 100%)',
  darkForest: 'linear-gradient(180deg, #2b503f 0%, #193428 100%)',
  desert: 'linear-gradient(180deg, #f3cd7e 0%, #cf9545 100%)',
};

const STAGE_RENDER_MAP: Record<string, string> = {
  meadow: '/assets/v2/renders/battle-meadow.webp',
  lava: '/assets/v2/renders/battle-lava.webp',
  ice: '/assets/v2/renders/battle-ice.webp',
  ruins: '/assets/v2/renders/battle-ruins.webp',
  darkForest: '/assets/v2/renders/battle-darkForest.webp',
  desert: '/assets/v2/renders/battle-desert.webp',
};

export function BattleFieldLite(props: BattleFieldSceneProps) {
  const activeStage = props.state.stage || props.stageId || 'meadow';
  const bg = STAGE_BG[activeStage] || STAGE_BG.meadow;
  const boardImg = STAGE_RENDER_MAP[activeStage] || STAGE_RENDER_MAP.meadow;
  const isNight = props.state.time === 'night';
  const mySide: 'p1' | 'p2' = props.viewerSide || 'p1';
  const oppSide: 'p1' | 'p2' = mySide === 'p1' ? 'p2' : 'p1';
  const roads = props.state.roads;
  const laneLen = roads[0]?.length || 3;
  const myCastleImg = mySide === 'p1' ? '/assets/castles/castle-blue.png' : '/assets/castles/castle-orange.png';
  const oppCastleImg = oppSide === 'p1' ? '/assets/castles/castle-blue.png' : '/assets/castles/castle-orange.png';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: isNight ? 'linear-gradient(180deg, #1b274b 0%, #314275 55%, #274435 100%)' : bg,
        transform: props.shakePower > 0.05 ? `translate(${Math.round(props.shakePower * 3)}px, -2px)` : undefined,
      }}
    >
      {/* Blender 2D Prerendered Stage Diorama */}
      <img
        src={boardImg}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 52%',
          filter: isNight ? 'brightness(0.78) saturate(0.95)' : undefined,
          pointerEvents: 'none',
        }}
      />

      {/* Interactive Overlay: Castles + 3 Lanes */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 18px 14px',
        }}
      >
        {/* Opponent Castle */}
        <button
          type="button"
          onClick={() => props.highlightEnemyCastle && props.onSelectEnemyCastle()}
          style={{
            background: 'none',
            border: props.highlightEnemyCastle ? '3px solid #ffe37a' : 'none',
            borderRadius: 16,
            padding: 0,
            pointerEvents: props.highlightEnemyCastle ? 'auto' : 'none',
            cursor: props.highlightEnemyCastle ? 'pointer' : 'default',
            flexShrink: 0,
          }}
        >
          <img
            src={oppCastleImg}
            alt="相手の城"
            style={{
              width: 60,
              height: 60,
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 8px rgba(34, 20, 8, 0.38))',
            }}
          />
        </button>

        {/* 3 Lanes Grid */}
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, roads.length)}, 1fr)`,
            gap: 10,
            padding: '4px 6px',
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
                  borderRadius: 14,
                  background: isTarget ? 'rgba(255, 227, 122, 0.34)' : 'rgba(255, 248, 226, 0.16)',
                  border: isTarget ? '3px solid #ffe37a' : '1.5px solid rgba(74, 46, 26, 0.34)',
                  boxShadow: isTarget
                    ? 'inset 0 0 18px rgba(255, 227, 122, 0.45), 0 0 12px rgba(255, 214, 102, 0.5)'
                    : 'inset 0 1px 0 rgba(255, 255, 255, 0.22)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 4px',
                  cursor: isTarget ? 'pointer' : 'default',
                }}
              >
                {Array.from({ length: laneLen }).map((_, sqIdx) => {
                  const sqFromTop = sqIdx;
                  const sqFromBottom = laneLen - 1 - sqIdx;
                  const oppHere = oppSoldiers.filter((s) => s.position === sqFromTop);
                  const myHere = mySoldiers.filter((s) => s.position === sqFromBottom);
                  const monSquare = mySide === 'p1' ? sqFromBottom : sqFromTop;
                  const monHere = monsters.filter((m: MonsterState) => m.square === monSquare);

                  return (
                    <div
                      key={sqIdx}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'rgba(255, 248, 226, 0.2)',
                        border: '1.5px dashed rgba(74, 46, 26, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                      }}
                    >
                      {[...oppHere, ...myHere].map((s) => {
                        const pid = props.state.players.p1?.soldiers.some((ps) => ps.soldierId === s.soldierId) ? 'p1' : 'p2';
                        const isSolTarget = props.highlightSoldierIds.includes(s.soldierId);
                        return (
                          <button
                            key={s.soldierId}
                            type="button"
                            onClick={(e) => {
                              if (isSolTarget) {
                                e.stopPropagation();
                                props.onSelectSoldier(s.soldierId);
                              }
                            }}
                            style={{
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: isSolTarget ? 'pointer' : 'default',
                            }}
                          >
                            <img
                              src={cardTypeToImagePath(s.type)}
                              alt={s.name || s.type}
                              style={{
                                width: 38,
                                height: 38,
                                objectFit: 'contain',
                                borderRadius: 8,
                                border: `2px solid ${isSolTarget ? '#ffe37a' : pid === 'p1' ? '#2a6cab' : '#c05a1c'}`,
                                background: '#fffaf0',
                                boxShadow: isSolTarget
                                  ? '0 0 10px rgba(255, 227, 122, 0.85), 0 3px 5px rgba(74, 46, 26, 0.35)'
                                  : '0 2px 4px rgba(74, 46, 26, 0.3)',
                                filter: pid === mySide ? props.mySoldierFilter : undefined,
                              }}
                            />
                            <span
                              style={{
                                marginTop: -5,
                                background:
                                  pid === 'p1'
                                    ? 'linear-gradient(180deg, #3b6fd4 0%, #234799 100%)'
                                    : 'linear-gradient(180deg, #e06d26 0%, #a84210 100%)',
                                color: '#fffaf0',
                                fontSize: 9,
                                fontWeight: 900,
                                padding: '0 4px',
                                borderRadius: 999,
                                border: '1px solid #4a2e1a',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ⚔{s.attack} ❤{s.hp}{s.shield > 0 ? ` 🛡${s.shield}` : ''}
                            </span>
                          </button>
                        );
                      })}
                      {monHere.map((m) => {
                        const isMonTarget = props.highlightMonsterIds.includes(m.monsterId);
                        return (
                          <button
                            key={m.monsterId}
                            type="button"
                            onClick={(e) => {
                              if (isMonTarget) {
                                e.stopPropagation();
                                props.onSelectMonster(m.monsterId);
                              }
                            }}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: isMonTarget ? 'pointer' : 'default',
                            }}
                          >
                            <img
                              src={`/assets/cards/card-beast-${m.type.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.png`}
                              alt={m.type}
                              style={{
                                width: 42,
                                height: 42,
                                objectFit: 'contain',
                                borderRadius: 10,
                                border: `2.5px solid ${isMonTarget ? '#ffe37a' : '#a82a24'}`,
                                background: '#fff2ee',
                                boxShadow: isMonTarget
                                  ? '0 0 12px rgba(255, 227, 122, 0.85), 0 3px 6px rgba(74, 46, 26, 0.35)'
                                  : '0 2px 5px rgba(74, 46, 26, 0.32)',
                              }}
                            />
                            <span
                              style={{
                                marginTop: -5,
                                background: 'linear-gradient(180deg, #cf3a32 0%, #8f1d17 100%)',
                                color: '#fffaf0',
                                fontSize: 9,
                                fontWeight: 900,
                                padding: '0 4px',
                                borderRadius: 999,
                                border: '1px solid #4a2e1a',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              魔物 ❤{m.hp}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Viewer Castle */}
        <img
          src={myCastleImg}
          alt="自分の城"
          style={{
            width: 64,
            height: 64,
            objectFit: 'contain',
            flexShrink: 0,
            filter: [props.myCastleFilter, 'drop-shadow(0 4px 8px rgba(34, 20, 8, 0.38))'].filter(Boolean).join(' '),
          }}
        />
      </div>
    </div>
  );
}
