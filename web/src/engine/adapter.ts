import type { ActionResult, GameEvent, GameState, PlayTarget } from './types';

export interface GameEngineAdapter {
  start(): void;
  getState(viewerId: string | null): GameState;
  canPlayCard(cardId: string, target?: PlayTarget): ActionResult;
  getTargets(cardId: string): PlayTarget[];
  playCard(cardId: string, target?: PlayTarget): ActionResult;
  mulligan(playerId: string, cardIds: string[]): ActionResult;
  discard(cardIds: string[]): ActionResult;
  canBuyUpgrade(upgradeId: string): ActionResult;
  buyUpgrade(upgradeId: string): ActionResult;
  canDefend(cardId: string, target?: PlayTarget): ActionResult;
  getDefenseTargets(cardId: string): PlayTarget[];
  defend(cardId: string, target?: PlayTarget): ActionResult;
  passDefense(): ActionResult;
  canFuse(cardIdA: string, cardIdB: string): ActionResult;
  fuse(cardIdA: string, cardIdB: string): ActionResult;
  endTurn(): ActionResult;
  surrender(playerId: string): ActionResult;
  runCpuTurn(playerId: string, level: 'easy' | 'normal' | 'hard'): void;
  onEvent(handler: (event: GameEvent) => void): () => void;
  dispose(): void;
}
