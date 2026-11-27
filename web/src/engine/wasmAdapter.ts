import type { GameEngineAdapter } from './adapter';
import type { ActionResult, CpuLevel, GameEvent, GameState, LoadedGameData, PlayTarget } from './types';

interface WasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  cf_alloc(len: number): number;
  cf_dealloc(ptr: number, cap: number): void;
  cf_last_ptr(): number;
  cf_last_len(): number;
  cf_last_err_ptr(): number;
  cf_last_err_len(): number;
  cf_new(cfgPtr: number, cfgLen: number): number;
  cf_free(handle: number): void;
  cf_start(handle: number): number;
  cf_drain_events(handle: number): number;
  cf_get_state(handle: number, viewerPtr: number, viewerLen: number): number;
  cf_can_play_card(handle: number, cardPtr: number, cardLen: number, tgtPtr: number, tgtLen: number): number;
  cf_get_targets(handle: number, cardPtr: number, cardLen: number): number;
  cf_play_card(handle: number, cardPtr: number, cardLen: number, tgtPtr: number, tgtLen: number): number;
  cf_mulligan(handle: number, pidPtr: number, pidLen: number, idsPtr: number, idsLen: number): number;
  cf_discard(handle: number, idsPtr: number, idsLen: number): number;
  cf_can_buy_upgrade(handle: number, uidPtr: number, uidLen: number): number;
  cf_buy_upgrade(handle: number, uidPtr: number, uidLen: number): number;
  cf_can_defend(handle: number, cardPtr: number, cardLen: number, tgtPtr: number, tgtLen: number): number;
  cf_get_defense_targets(handle: number, cardPtr: number, cardLen: number): number;
  cf_defend(handle: number, cardPtr: number, cardLen: number, tgtPtr: number, tgtLen: number): number;
  cf_pass_defense(handle: number): number;
  cf_can_fuse(handle: number, aPtr: number, aLen: number, bPtr: number, bLen: number): number;
  cf_fuse(handle: number, aPtr: number, aLen: number, bPtr: number, bLen: number): number;
  cf_end_turn(handle: number): number;
  cf_surrender(handle: number, pidPtr: number, pidLen: number): number;
  cf_run_cpu_turn(handle: number, pidPtr: number, pidLen: number, lvPtr: number, lvLen: number): number;
  cf_run_benchmark(cfgPtr: number, cfgLen: number, games: number, seed: number): number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let wasmInstancePromise: Promise<WasmExports> | null = null;

async function getWasmExports(): Promise<WasmExports> {
  if (!wasmInstancePromise) {
    wasmInstancePromise = (async () => {
      const url = '/wasm/castlefield_wasm.wasm';
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: ${resp.status}`);
      }
      const bytes = await resp.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      return instance.exports as WasmExports;
    })().catch((err) => {
      wasmInstancePromise = null;
      throw err;
    });
  }
  return wasmInstancePromise;
}

function buildConfigPayload(data: LoadedGameData, deckId: string, stage = 'meadow', seed = Date.now()) {
  const rules: Record<string, unknown> = { ...(data.rules as Record<string, unknown>), mulligan: false };
  const decks = data.decks || {};
  const deckKeys = Object.keys(decks);
  const myDeck = decks[deckId] ? deckId : (decks['costBalance'] ? 'costBalance' : deckKeys[0]);
  const oppDeck = decks['costAssault'] ? 'costAssault' : (decks['assault'] ? 'assault' : deckKeys[0]);
  const isCost = Boolean((decks[myDeck] as Record<string, unknown> | undefined)?.costDeck);
  if (isCost) rules.deckMode = 'cost';
  else if (decks[myDeck]) rules.deckMode = 'own';

  return {
    cards: data.cards,
    rules,
    monsters: data.monsters,
    upgrades: data.upgrades,
    castles: data.castles,
    decks,
    stages: data.stages,
    rarities: data.rarities,
    weather: data.weather,
    setup: {
      stage,
      firstPlayer: 'p1',
      castles: ['standard', 'standard'],
      decks: [myDeck, oppDeck],
    },
    seed: ((seed >>> 0) || 1),
  };
}

function writeWasmStr(e: WasmExports, str: string): [number, number] {
  if (!str) return [0, 0];
  const bytes = encoder.encode(str);
  if (bytes.length === 0) return [0, 0];
  const ptr = e.cf_alloc(bytes.length);
  new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
  return [ptr, bytes.length];
}

function readWasmOut(e: WasmExports): string {
  const ptr = e.cf_last_ptr();
  const len = e.cf_last_len();
  return decoder.decode(new Uint8Array(e.memory.buffer, ptr, len));
}

function readWasmErr(e: WasmExports): string {
  const ptr = e.cf_last_err_ptr();
  const len = e.cf_last_err_len();
  return decoder.decode(new Uint8Array(e.memory.buffer, ptr, len));
}

export interface RustBenchmarkResult {
  games: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  avgTurns: number;
  elapsedMs: number;
}

export async function runRustWasmBenchmark(
  data: LoadedGameData,
  games = 200,
  seed = 20261127
): Promise<RustBenchmarkResult> {
  const e = await getWasmExports();
  const cfg = buildConfigPayload(data, 'costBalance', 'meadow', seed);
  (cfg.rules as Record<string, unknown>).deckMode = 'cost';
  const [p, l] = writeWasmStr(e, JSON.stringify(cfg));
  const t0 = performance.now();
  const rc = e.cf_run_benchmark(p, l, games, seed >>> 0);
  const elapsedMs = performance.now() - t0;
  if (l > 0) e.cf_dealloc(p, l);
  if (rc < 0) {
    throw new Error(readWasmErr(e) || 'cf_run_benchmark failed');
  }
  const summary = JSON.parse(readWasmOut(e)) as Omit<RustBenchmarkResult, 'elapsedMs'>;
  return { ...summary, elapsedMs };
}

export class WasmEngineAdapter implements GameEngineAdapter {
  private e: WasmExports;
  private handle: number;
  private listeners = new Set<(event: GameEvent) => void>();
  private disposed = false;

  private constructor(exports: WasmExports, handle: number) {
    this.e = exports;
    this.handle = handle;
  }

  static async create(
    data: LoadedGameData,
    deckId: string,
    stage = 'meadow',
    seed = Date.now()
  ): Promise<WasmEngineAdapter> {
    const e = await getWasmExports();
    const cfg = buildConfigPayload(data, deckId, stage, seed);
    const [p, l] = writeWasmStr(e, JSON.stringify(cfg));
    const handle = e.cf_new(p, l);
    if (l > 0) e.cf_dealloc(p, l);
    if (handle <= 0) {
      throw new Error(readWasmErr(e) || 'cf_new failed');
    }
    return new WasmEngineAdapter(e, handle);
  }

  private callJson<T>(fn: (...rawArgs: number[]) => number, ...strArgs: Array<string | number>): T {
    const allocs: Array<[number, number]> = [];
    const rawArgs: number[] = [this.handle];
    for (const arg of strArgs) {
      if (typeof arg === 'string') {
        const [p, l] = writeWasmStr(this.e, arg);
        if (l > 0) allocs.push([p, l]);
        rawArgs.push(p, l);
      } else {
        rawArgs.push(arg);
      }
    }
    const rc = fn(...rawArgs);
    for (const [p, l] of allocs) {
      this.e.cf_dealloc(p, l);
    }
    if (rc < 0) {
      throw new Error(readWasmErr(this.e) || 'WASM call failed');
    }
    return JSON.parse(readWasmOut(this.e)) as T;
  }

  private flushEvents(): void {
    const events = this.callJson<GameEvent[]>((h) => this.e.cf_drain_events(h));
    for (const ev of events) {
      for (const listener of this.listeners) {
        listener(ev);
      }
    }
  }

  start(): void {
    const events = this.callJson<GameEvent[]>((h) => this.e.cf_start(h));
    for (const ev of events) {
      for (const listener of this.listeners) {
        listener(ev);
      }
    }
  }

  getState(viewerId: string | null): GameState {
    return this.callJson<GameState>((h, p, l) => this.e.cf_get_state(h, p, l), viewerId || '');
  }

  canPlayCard(cardId: string, target?: PlayTarget): ActionResult {
    const tgtStr = target ? JSON.stringify(target) : '';
    const res = this.callJson<ActionResult>(
      (h, cp, cl, tp, tl) => this.e.cf_can_play_card(h, cp, cl, tp, tl),
      cardId,
      tgtStr
    );
    if (!target && res.needsTarget) {
      return { ...res, ok: true };
    }
    return res;
  }

  getTargets(cardId: string): PlayTarget[] {
    return this.callJson<PlayTarget[]>((h, cp, cl) => this.e.cf_get_targets(h, cp, cl), cardId);
  }

  playCard(cardId: string, target?: PlayTarget): ActionResult {
    const res = this.callJson<ActionResult>(
      (h, cp, cl, tp, tl) => this.e.cf_play_card(h, cp, cl, tp, tl),
      cardId,
      target ? JSON.stringify(target) : ''
    );
    this.flushEvents();
    return res;
  }

  mulligan(playerId: string, cardIds: string[]): ActionResult {
    const res = this.callJson<ActionResult>(
      (h, pp, pl, ip, il) => this.e.cf_mulligan(h, pp, pl, ip, il),
      playerId,
      JSON.stringify(cardIds)
    );
    this.flushEvents();
    return res;
  }

  discard(cardIds: string[]): ActionResult {
    const res = this.callJson<ActionResult>(
      (h, ip, il) => this.e.cf_discard(h, ip, il),
      JSON.stringify(cardIds)
    );
    this.flushEvents();
    return res;
  }

  canBuyUpgrade(upgradeId: string): ActionResult {
    return this.callJson<ActionResult>((h, up, ul) => this.e.cf_can_buy_upgrade(h, up, ul), upgradeId);
  }

  buyUpgrade(upgradeId: string): ActionResult {
    const res = this.callJson<ActionResult>((h, up, ul) => this.e.cf_buy_upgrade(h, up, ul), upgradeId);
    this.flushEvents();
    return res;
  }

  canDefend(cardId: string, target?: PlayTarget): ActionResult {
    const res = this.callJson<ActionResult>(
      (h, cp, cl, tp, tl) => this.e.cf_can_defend(h, cp, cl, tp, tl),
      cardId,
      target ? JSON.stringify(target) : ''
    );
    if (!target && res.needsTarget) {
      return { ...res, ok: true };
    }
    return res;
  }

  getDefenseTargets(cardId: string): PlayTarget[] {
    return this.callJson<PlayTarget[]>(
      (h, cp, cl) => this.e.cf_get_defense_targets(h, cp, cl),
      cardId
    );
  }

  defend(cardId: string, target?: PlayTarget): ActionResult {
    const res = this.callJson<ActionResult>(
      (h, cp, cl, tp, tl) => this.e.cf_defend(h, cp, cl, tp, tl),
      cardId,
      target ? JSON.stringify(target) : ''
    );
    this.flushEvents();
    return res;
  }

  passDefense(): ActionResult {
    const res = this.callJson<ActionResult>((h) => this.e.cf_pass_defense(h));
    this.flushEvents();
    return res;
  }

  canFuse(cardIdA: string, cardIdB: string): ActionResult {
    return this.callJson<ActionResult>(
      (h, ap, al, bp, bl) => this.e.cf_can_fuse(h, ap, al, bp, bl),
      cardIdA,
      cardIdB
    );
  }

  fuse(cardIdA: string, cardIdB: string): ActionResult {
    const res = this.callJson<ActionResult>(
      (h, ap, al, bp, bl) => this.e.cf_fuse(h, ap, al, bp, bl),
      cardIdA,
      cardIdB
    );
    this.flushEvents();
    return res;
  }

  endTurn(): ActionResult {
    const res = this.callJson<ActionResult>((h) => this.e.cf_end_turn(h));
    this.flushEvents();
    return res;
  }

  surrender(playerId: string): ActionResult {
    const res = this.callJson<ActionResult>((h, pp, pl) => this.e.cf_surrender(h, pp, pl), playerId);
    this.flushEvents();
    return res;
  }

  runCpuTurn(playerId: string, level: CpuLevel): void {
    this.callJson<{ ok: boolean }>(
      (h, pp, pl, lp, ll) => this.e.cf_run_cpu_turn(h, pp, pl, lp, ll),
      playerId,
      level
    );
    this.flushEvents();
  }

  onEvent(handler: (event: GameEvent) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    if (this.handle > 0) {
      this.e.cf_free(this.handle);
      this.handle = 0;
    }
  }
}
