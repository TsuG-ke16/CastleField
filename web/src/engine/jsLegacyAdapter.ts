import type { GameEngineAdapter } from './adapter';
import type { ModeBundle } from './dataLoader';
import type { ActionResult, CpuLevel, GameEvent, GameState, LoadedGameData, PlayTarget } from './types';
// Direct browser-safe ES module import from existing pure game logic
// @ts-ignore - vanilla JS game engine module
import { Game, EVENT_TYPES } from '@game/Game.js';
// @ts-ignore - vanilla JS strategy module
import { STRATEGIES } from '@game/strategies.js';

const CPU_STRATEGY_MAP: Record<CpuLevel, string> = {
  easy: 'defensive',
  normal: 'rush',
  hard: 'smart',
};

function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class JsLegacyAdapter implements GameEngineAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private game: any;
  private listeners = new Set<(event: GameEvent) => void>();
  private unsubs: Array<() => void> = [];
  private data: { cards: Record<string, unknown>; rules: Record<string, unknown>; upgrades?: Record<string, unknown> };
  private cpuRng: () => number;

  static forMode(
    bundle: ModeBundle,
    baseData: LoadedGameData,
    opts: { factionId?: string; skills?: string[]; stage?: string; seed?: number; mulligan?: boolean } = {}
  ): JsLegacyAdapter {
    const seed = opts.seed ?? Date.now();
    const rng = makeMulberry32(seed);
    const rules = structuredClone(bundle.rules) as Record<string, unknown>;
    rules.mulligan = Boolean(opts.mulligan);

    const stageKeys = Object.keys(baseData.stages || { meadow: {} });
    const stageArg = opts.stage || 'meadow';
    const resolvedStage =
      stageArg === 'random' && stageKeys.length > 0
        ? stageKeys[(seed >>> 0) % stageKeys.length]
        : stageKeys.includes(stageArg)
          ? stageArg
          : stageKeys[0] || 'meadow';

    const setup: Record<string, unknown> = {
      stage: resolvedStage,
      firstPlayer: 'p1',
      castles: ['standard', 'standard'],
    };

    if (bundle.mode === 'factions' && bundle.decks) {
      const fKeys = Object.keys(bundle.decks);
      const myFac = opts.factionId && bundle.decks[opts.factionId] ? opts.factionId : fKeys[0];
      const oppFac = fKeys.find((k) => k !== myFac) || myFac;
      setup.decks = [myFac, oppFac];
    } else if (bundle.mode === 'classic' && opts.skills && opts.skills.length > 0) {
      setup.skills = [opts.skills, []];
    }

    const game = new Game({
      cards: structuredClone(bundle.cards),
      rules,
      monsters: structuredClone(baseData.monsters),
      upgrades: structuredClone(baseData.upgrades),
      castles: structuredClone(baseData.castles),
      decks: bundle.decks ? structuredClone(bundle.decks) : null,
      stages: structuredClone(baseData.stages),
      rarities: bundle.useRarities ? structuredClone(baseData.rarities) : null,
      weather: structuredClone(baseData.weather),
      elements: bundle.elements ? structuredClone(bundle.elements) : undefined,
      reactions: bundle.reactions ? structuredClone(bundle.reactions) : undefined,
      skillTree: bundle.skillTree ? structuredClone(bundle.skillTree) : undefined,
      setup,
      rng,
    });

    const adapter = Object.create(JsLegacyAdapter.prototype) as JsLegacyAdapter;
    adapter.game = game;
    adapter.listeners = new Set();
    adapter.unsubs = [];
    adapter.data = { cards: bundle.cards, rules, upgrades: baseData.upgrades };
    adapter.cpuRng = makeMulberry32(seed ^ 0x51ed270b);
    adapter.bindEvents();
    return adapter;
  }

  private bindEvents(): void {
    for (const evType of EVENT_TYPES as string[]) {
      const fn = (payload: Record<string, unknown>) => {
        const evt: GameEvent = { type: evType, ...(payload || {}) };
        for (const listener of this.listeners) listener(evt);
      };
      this.game.on(evType, fn);
      this.unsubs.push(() => this.game.off(evType, fn));
    }
  }

  constructor(
    data: LoadedGameData,
    deckId: string,
    stage = 'meadow',
    seed = Date.now(),
    customDeck?: Record<string, number>,
    mulliganEnabled = false
  ) {
    this.data = data;
    const rng = makeMulberry32(seed);
    this.cpuRng = makeMulberry32(seed ^ 0x51ed270b);

    const rules = structuredClone(data.rules) as Record<string, unknown>;
    rules.mulligan = Boolean(mulliganEnabled);
    const decks = structuredClone(data.decks) as Record<string, { name: string; cards: Record<string, number>; costDeck?: boolean }>;
    if (deckId === 'custom' && customDeck && Object.keys(customDeck).length > 0) {
      decks.custom = { name: 'オリジナルデッキ', cards: { ...customDeck }, costDeck: true };
    }
    const stageKeys = Object.keys(data.stages || { meadow: {} });
    const resolvedStage =
      stage === 'random' && stageKeys.length > 0
        ? stageKeys[(seed >>> 0) % stageKeys.length]
        : stageKeys.includes(stage)
          ? stage
          : stageKeys[0] || 'meadow';

    const deckKeys = Object.keys(decks || {});
    const myDeck = decks[deckId] ? deckId : (decks['costBalance'] ? 'costBalance' : deckKeys[0]);
    const oppDeck = decks['costAssault'] ? 'costAssault' : (decks['assault'] ? 'assault' : deckKeys[0]);
    const isCost = Boolean(decks[myDeck]?.costDeck);
    if (isCost) rules.deckMode = 'cost';
    else if (decks[myDeck]) rules.deckMode = 'own';

    this.game = new Game({
      cards: structuredClone(data.cards),
      rules,
      monsters: structuredClone(data.monsters),
      upgrades: structuredClone(data.upgrades),
      castles: structuredClone(data.castles),
      decks,
      stages: structuredClone(data.stages),
      rarities: structuredClone(data.rarities),
      weather: structuredClone(data.weather),
      setup: {
        stage: resolvedStage,
        firstPlayer: 'p1',
        castles: ['standard', 'standard'],
        decks: [myDeck, oppDeck],
      },
      rng,
    });

    this.bindEvents();
  }

  start(): void {
    this.game.start();
  }

  getState(viewerId: string | null): GameState {
    return this.game.getState(viewerId) as GameState;
  }

  canPlayCard(cardId: string, target?: PlayTarget): ActionResult {
    return this.game.phase === 'defend'
      ? (this.game.canDefend(cardId, target) as ActionResult)
      : (this.game.canPlayCard(cardId, target) as ActionResult);
  }

  getTargets(cardId: string): PlayTarget[] {
    return this.game.phase === 'defend'
      ? (this.game.getDefenseTargets(cardId) as PlayTarget[])
      : (this.game.getTargets(cardId) as PlayTarget[]);
  }

  playCard(cardId: string, target?: PlayTarget): ActionResult {
    return target ? (this.game.playCard(cardId, target) as ActionResult) : (this.game.playCard(cardId) as ActionResult);
  }

  mulligan(playerId: string, cardIds: string[]): ActionResult {
    return this.game.mulligan(playerId, cardIds) as ActionResult;
  }

  discard(cardIds: string[]): ActionResult {
    return this.game.discard(cardIds) as ActionResult;
  }

  canBuyUpgrade(upgradeId: string): ActionResult {
    return this.game.canBuyUpgrade(upgradeId) as ActionResult;
  }

  buyUpgrade(upgradeId: string): ActionResult {
    return this.game.buyUpgrade(upgradeId) as ActionResult;
  }

  canDefend(cardId: string, target?: PlayTarget): ActionResult {
    return this.game.canDefend(cardId, target) as ActionResult;
  }

  getDefenseTargets(cardId: string): PlayTarget[] {
    return this.game.getDefenseTargets(cardId) as PlayTarget[];
  }

  defend(cardId: string, target?: PlayTarget): ActionResult {
    return target ? (this.game.defend(cardId, target) as ActionResult) : (this.game.defend(cardId) as ActionResult);
  }

  passDefense(): ActionResult {
    return this.game.passDefense() as ActionResult;
  }

  canFuse(cardIdA: string, cardIdB: string): ActionResult {
    return this.game.canFuse(cardIdA, cardIdB) as ActionResult;
  }

  fuse(cardIdA: string, cardIdB: string): ActionResult {
    return this.game.fuse(cardIdA, cardIdB) as ActionResult;
  }

  endTurn(): ActionResult {
    return this.game.endTurn() as ActionResult;
  }

  surrender(playerId: string): ActionResult {
    return this.game.surrender(playerId) as ActionResult;
  }

  runCpuTurn(playerId: string, level: CpuLevel): void {
    const strategyKey = CPU_STRATEGY_MAP[level] || 'smart';
    const strategy = STRATEGIES[strategyKey] || STRATEGIES.smart;
    const ctx = {
      cards: this.data.cards,
      rules: this.data.rules,
      upgrades: this.data.upgrades,
      onDefense: () => {
        // If CPU triggers player defense, pause until human responds; if CPU is defending, auto-defend
        const st = this.getState(null);
        if (st.phase === 'defend' && st.defense?.defenderId === playerId) {
          this.game.passDefense();
        }
      },
    };

    const st = this.getState(null);
    if (st.phase === 'defend' && st.defense?.defenderId === playerId) {
      this.game.passDefense();
      return;
    }

    if (st.phase === 'main' && st.currentPlayer === playerId) {
      strategy.takeTurn(this.game, playerId, this.cpuRng, ctx);
    }

    const after = this.getState(null);
    if (after.phase === 'main' && after.currentPlayer === playerId) {
      const endRes = this.game.endTurn();
      if (!endRes.ok) {
        const stDisc = this.getState(playerId);
        if (stDisc.phase === 'discard') {
          const hand = stDisc.players[playerId]?.hand || [];
          const maxH = stDisc.players[playerId]?.maxHand || 8;
          const need = Math.max(0, hand.length - maxH);
          const chosen = strategy.chooseDiscard
            ? strategy.chooseDiscard(this.game, playerId, this.cpuRng, { ...ctx, discardCount: need })
            : hand.slice(0, need).map((c) => c.cardId);
          this.game.discard(chosen);
        }
      }
    } else if (after.phase === 'discard' && after.currentPlayer === playerId) {
      const stDisc = this.getState(playerId);
      const hand = stDisc.players[playerId]?.hand || [];
      const maxH = stDisc.players[playerId]?.maxHand || 8;
      const need = Math.max(0, hand.length - maxH);
      this.game.discard(hand.slice(0, need).map((c) => c.cardId));
    }
  }

  onEvent(handler: (event: GameEvent) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.listeners.clear();
  }
}
