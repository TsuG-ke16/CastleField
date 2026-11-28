import { Suspense, lazy } from 'react';
import type { GameState } from '../engine/types';
import { BattleFieldLite } from './BattleFieldLite';

export interface BattleFieldSceneProps {
  state: GameState;
  quality: '3d' | '2d';
  shakePower: number;
  stageId?: string;
  viewerSide?: 'p1' | 'p2';
  myCastleFilter?: string;
  mySoldierFilter?: string;
  highlightRoadIds: string[];
  highlightSoldierIds: string[];
  highlightMonsterIds: string[];
  highlightEnemyCastle: boolean;
  onSelectRoad: (roadId: string) => void;
  onSelectSoldier: (soldierId: string) => void;
  onSelectMonster: (monsterId: string) => void;
  onSelectEnemyCastle: () => void;
}

const LazyBattleFieldScene = lazy(() =>
  import('./BattleFieldScene').then((m) => ({ default: m.BattleFieldScene }))
);

export function BattleFieldView(props: BattleFieldSceneProps) {
  if (props.quality === '2d') {
    return <BattleFieldLite {...props} />;
  }
  return (
    <Suspense fallback={<BattleFieldLite {...props} />}>
      <LazyBattleFieldScene {...props} />
    </Suspense>
  );
}
