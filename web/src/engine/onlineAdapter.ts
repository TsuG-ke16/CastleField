import type { GameEngineAdapter } from './adapter';
import { joinOnlineRoom, OnlineRoomSocket, sendOnlineAction } from './onlineClient';
import type { ActionResult, CpuLevel, GameEvent, GameState, LoadedGameData, PlayTarget } from './types';

export type OnlineConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'waiting';

export class OnlineEngineAdapter implements GameEngineAdapter {
  private listeners = new Set<(event: GameEvent) => void>();
  private stateListeners = new Set<(state: GameState) => void>();
  private socket: OnlineRoomSocket | null = null;
  private cachedState: GameState;
  public readonly seatId: 'p1' | 'p2';

  private constructor(
    private data: LoadedGameData,
    private token: string,
    seatId: string,
    initialState: GameState,
    private serverUrl?: string,
    private onStatus?: (status: OnlineConnStatus) => void
  ) {
    this.seatId = seatId === 'p2' ? 'p2' : 'p1';
    this.cachedState = initialState;
  }

  static async connect(
    data: LoadedGameData,
    passphrase: string,
    options: {
      serverUrl?: string;
      name?: string;
      onStatus?: (status: OnlineConnStatus) => void;
    } = {}
  ): Promise<OnlineEngineAdapter> {
    options.onStatus?.('connecting');
    const joined = await joinOnlineRoom(passphrase, {
      name: options.name || 'プレイヤー',
      serverUrl: options.serverUrl,
    });
    if (!joined.ok || !joined.token || !joined.state || !joined.playerId) {
      throw new Error(joined.reason || 'ルーム参加に失敗しました');
    }
    const adapter = new OnlineEngineAdapter(
      data,
      joined.token,
      joined.playerId,
      joined.state,
      options.serverUrl,
      options.onStatus
    );
    if (!joined.started && joined.state.phase === 'ready') {
      options.onStatus?.('waiting');
    }
    return adapter;
  }

  /** サーバーが決めた席の鍵（ランクマッチ）でつなぐ。部屋に入る手続きはいらない */
  static attach(
    data: LoadedGameData,
    token: string,
    playerId: string,
    initialState: GameState,
    options: { serverUrl?: string; onStatus?: (status: OnlineConnStatus) => void } = {}
  ): OnlineEngineAdapter {
    options.onStatus?.('connecting');
    return new OnlineEngineAdapter(data, token, playerId, initialState, options.serverUrl, options.onStatus);
  }

  get roomToken(): string {
    return this.token;
  }

  onStateUpdate(handler: (state: GameState) => void): () => void {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  private emitState(st: GameState): void {
    this.cachedState = st;
    if (st.phase !== 'ready') {
      this.onStatus?.('open');
    }
    for (const fn of this.stateListeners) fn(st);
  }

  start(): void {
    this.socket = new OnlineRoomSocket(
      this.token,
      (pkt) => {
        if (pkt.state) {
          this.emitState(pkt.state);
        }
        if (pkt.event) {
          for (const listener of this.listeners) listener(pkt.event);
        }
      },
      (st) => {
        if (st === 'open' && this.cachedState.phase === 'ready') {
          this.onStatus?.('waiting');
        } else {
          this.onStatus?.(st);
        }
      },
      this.serverUrl
    );
    this.socket.connect();
  }

  getState(_viewerId: string | null): GameState {
    return this.cachedState;
  }

  canPlayCard(cardId: string, _target?: PlayTarget): ActionResult {
    const st = this.cachedState;
    const me = st.players[this.seatId];
    if (!me) return { ok: false, reason: 'プレイヤー情報待機中' };
    const card = me.hand?.find((c) => c.cardId === cardId);
    if (!card) return { ok: false, reason: '手札にありません' };
    const def = this.data.cards[card.type];
    if (!def) return { ok: false, reason: '不明なカード' };

    if (st.phase === 'defend') {
      if (st.defense?.defenderId !== this.seatId) return { ok: false, reason: '相手の防御判定中です' };
      return def.kind === 'defense' ? { ok: true } : { ok: false, reason: '防御カードのみ出せます' };
    }
    if (st.phase !== 'main' || st.currentPlayer !== this.seatId) {
      return { ok: false, reason: '相手のターンです' };
    }
    if (def.effect === 'wild') return { ok: false, reason: '適応は合成専用です' };
    const free = (def.mpCost ?? 0) === 0 && (def.effect === 'gainMp' || def.effect === 'gainCoins' || def.dice === 'coin');
    if (!free && me.playedThisTurn) return { ok: false, reason: 'このターンはメインを出しました' };
    if ((def.mpCost ?? 0) > (me.mp ?? 0)) return { ok: false, reason: 'MPが足りません' };
    return { ok: true };
  }

  getTargets(cardId: string): PlayTarget[] {
    const st = this.cachedState;
    const me = st.players[this.seatId];
    const oppId = this.seatId === 'p1' ? 'p2' : 'p1';
    const opp = st.players[oppId];
    const card = me?.hand?.find((c) => c.cardId === cardId);
    const def = card ? this.data.cards[card.type] : undefined;
    if (!def) return [];

    if (st.phase === 'defend') {
      if (def.effect === 'shieldSoldier') {
        return (me?.soldiers || []).map((s) => ({ soldierId: s.soldierId }));
      }
      return [];
    }

    if (def.kind === 'soldier') {
      return st.roads.map((r) => ({ roadId: r.roadId }));
    }
    if (def.kind === 'weapon' || def.effect === 'shieldSoldier' || def.effect === 'buffSoldier') {
      return (me?.soldiers || []).map((s) => ({ soldierId: s.soldierId }));
    }
    if (def.scope === 'lane') {
      return st.roads.map((r) => ({ roadId: r.roadId }));
    }
    if (def.effect === 'damageEnemyCastle') {
      return [{ playerId: oppId }];
    }
    if (def.effect === 'damageEnemySoldiers' && !def.scope) {
      return [
        ...(opp?.soldiers || []).map((s) => ({ soldierId: s.soldierId })),
        ...st.monsters.map((m) => ({ monsterId: m.monsterId })),
      ];
    }
    return [];
  }

  private fire(method: string, args: unknown[] = []): ActionResult {
    void sendOnlineAction(this.token, method, args, this.serverUrl)
      .then((resp) => {
        if (resp.state) {
          this.emitState(resp.state);
        }
      })
      .catch(() => {
        // 回線が切れた：盤面はつなぎ直したときに届く
        this.onStatus?.('reconnecting');
      });
    return { ok: true };
  }

  playCard(cardId: string, target?: PlayTarget): ActionResult {
    return this.fire('playCard', target ? [cardId, target] : [cardId]);
  }

  mulligan(playerId: string, cardIds: string[]): ActionResult {
    return this.fire('mulligan', [playerId, cardIds]);
  }

  discard(cardIds: string[]): ActionResult {
    return this.fire('discard', [cardIds]);
  }

  canBuyUpgrade(upgradeId: string): ActionResult {
    const me = this.cachedState.players[this.seatId];
    const u = this.data.upgrades[upgradeId];
    if (!me || !u) return { ok: false };
    return me.coins >= u.cost ? { ok: true } : { ok: false, reason: 'コイン不足' };
  }

  buyUpgrade(upgradeId: string): ActionResult {
    return this.fire('buyUpgrade', [upgradeId]);
  }

  canDefend(cardId: string, target?: PlayTarget): ActionResult {
    return this.canPlayCard(cardId, target);
  }

  getDefenseTargets(cardId: string): PlayTarget[] {
    return this.getTargets(cardId);
  }

  defend(cardId: string, target?: PlayTarget): ActionResult {
    return this.fire('defend', target ? [cardId, target] : [cardId]);
  }

  passDefense(): ActionResult {
    return this.fire('passDefense', []);
  }

  canFuse(cardIdA: string, cardIdB: string): ActionResult {
    return cardIdA !== cardIdB ? { ok: true } : { ok: false };
  }

  fuse(cardIdA: string, cardIdB: string): ActionResult {
    return this.fire('fuse', [cardIdA, cardIdB]);
  }

  endTurn(): ActionResult {
    return this.fire('endTurn', []);
  }

  surrender(_playerId: string): ActionResult {
    return this.fire('surrender', []);
  }

  sendStamp(stampId: string): void {
    void sendOnlineAction(this.token, 'stamp', [stampId], this.serverUrl).catch(() => {});
  }

  runCpuTurn(_playerId: string, _level: CpuLevel): void {
    // Handled authoritatively on the Rust server
  }

  onEvent(handler: (event: GameEvent) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  dispose(): void {
    this.listeners.clear();
    this.stateListeners.clear();
    this.socket?.dispose();
    this.socket = null;
  }
}
