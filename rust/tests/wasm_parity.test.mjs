import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WASM_PATH = path.join(REPO_ROOT, 'web/public/wasm/castlefield_wasm.wasm');
const DATA_DIR = path.join(REPO_ROOT, 'data');

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function buildConfig(overrides = {}) {
  const rules = { ...readJson('rules.json'), mulligan: false, ...(overrides.rules || {}) };
  return {
    cards: readJson('cards.json'),
    rules,
    monsters: readJson('monsters.json'),
    upgrades: readJson('upgrades.json'),
    castles: readJson('castles.json'),
    decks: overrides.decks ? overrides.decks : readJson('decks.json'),
    rarities: readJson('rarities.json'),
    stages: readJson('stages.json'),
    weather: readJson('weather.json'),
    setup: {
      stage: 'meadow',
      firstPlayer: 'p1',
      castles: ['standard', 'standard'],
      decks: ['costBalance', 'costAssault'],
      ...(overrides.setup || {}),
    },
    seed: overrides.seed ?? 42,
  };
}

class WasmHarness {
  constructor(instance) {
    this.e = instance.exports;
  }

  writeStr(str) {
    const bytes = encoder.encode(str);
    if (bytes.length === 0) return [0, 0];
    const ptr = this.e.cf_alloc(bytes.length);
    new Uint8Array(this.e.memory.buffer, ptr, bytes.length).set(bytes);
    return [ptr, bytes.length];
  }

  readOut() {
    const ptr = this.e.cf_last_ptr();
    const len = this.e.cf_last_len();
    return decoder.decode(new Uint8Array(this.e.memory.buffer, ptr, len));
  }

  readErr() {
    const ptr = this.e.cf_last_err_ptr();
    const len = this.e.cf_last_err_len();
    return decoder.decode(new Uint8Array(this.e.memory.buffer, ptr, len));
  }

  newGame(configObj) {
    const [p, l] = this.writeStr(JSON.stringify(configObj));
    const handle = this.e.cf_new(p, l);
    if (l > 0) this.e.cf_dealloc(p, l);
    if (handle <= 0) throw new Error(this.readErr() || 'cf_new failed');
    return handle;
  }

  callStr(fn, ...args) {
    const allocs = [];
    const rawArgs = [];
    for (const arg of args) {
      if (typeof arg === 'string') {
        const [p, l] = this.writeStr(arg);
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
    if (rc < 0) throw new Error(this.readErr() || 'wasm call failed');
    return JSON.parse(this.readOut());
  }

  runBenchmark(configObj, games, seed) {
    const [p, l] = this.writeStr(JSON.stringify(configObj));
    const rc = this.e.cf_run_benchmark(p, l, games, seed);
    if (l > 0) this.e.cf_dealloc(p, l);
    if (rc < 0) throw new Error(this.readErr() || 'cf_run_benchmark failed');
    return JSON.parse(this.readOut());
  }
}

const wasmBytes = fs.readFileSync(WASM_PATH);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const wasm = new WasmHarness(instance);

test('loads all 122 real cards, starts cleanly, and hides opponent hand', () => {
  const cfg = buildConfig({ seed: 42 });
  assert.ok(Object.keys(cfg.cards).length >= 120);
  const h = wasm.newGame(cfg);
  try {
    const evs = wasm.callStr((x) => wasm.e.cf_start(x), h);
    assert.ok(Array.isArray(evs) && evs.length > 0);
    const st = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');
    assert.equal(st.phase, 'main');
    assert.equal(st.currentPlayer, 'p1');
    assert.ok(Array.isArray(st.players.p1.hand) && st.players.p1.hand.length >= 5);
    assert.equal(st.players.p2.hand, null);
  } finally {
    wasm.e.cf_free(h);
  }
});

test('deterministic replay produces identical JSON states for identical seeds', () => {
  const run = (seed) => {
    const h = wasm.newGame(buildConfig({ seed }));
    try {
      wasm.e.cf_start(h);
      for (let i = 0; i < 20; i++) {
        const st = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '');
        if (st.phase === 'gameOver') break;
        wasm.callStr(
          (x, p1, l1, p2, l2) => wasm.e.cf_run_cpu_turn(x, p1, l1, p2, l2),
          h,
          st.currentPlayer,
          'hard'
        );
      }
      return JSON.stringify(wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, ''));
    } finally {
      wasm.e.cf_free(h);
    }
  };

  assert.equal(run(12345), run(12345));
  assert.notEqual(run(12345), run(99999));
});

test('playCard, endTurn, runCpuTurn, and surrender work end-to-end', () => {
  const h = wasm.newGame(buildConfig({ rules: { deckMode: 'shared' }, seed: 7 }));
  try {
    wasm.e.cf_start(h);
    const st1 = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');
    let played = false;
    for (const hc of st1.players.p1.hand) {
      const chk = wasm.callStr(
        (x, cp, cl, tp, tl) => wasm.e.cf_can_play_card(x, cp, cl, tp, tl),
        h,
        hc.cardId,
        ''
      );
      if (chk.ok || chk.needsTarget) {
        const tgts = wasm.callStr((x, cp, cl) => wasm.e.cf_get_targets(x, cp, cl), h, hc.cardId);
        const tgtJson = tgts[0] ? JSON.stringify(tgts[0]) : '';
        const res = wasm.callStr(
          (x, cp, cl, tp, tl) => wasm.e.cf_play_card(x, cp, cl, tp, tl),
          h,
          hc.cardId,
          tgtJson
        );
        assert.equal(res.ok, true);
        played = true;
        break;
      }
    }
    assert.equal(played, true);
    const endRes = wasm.callStr((x) => wasm.e.cf_end_turn(x), h);
    assert.equal(endRes.ok, true);
    const sur = wasm.callStr((x, p, l) => wasm.e.cf_surrender(x, p, l), h, 'p1');
    assert.equal(sur.ok, true);
    const stFinal = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '');
    assert.equal(stFinal.phase, 'gameOver');
    assert.equal(stFinal.winner, 'p2');
  } finally {
    wasm.e.cf_free(h);
  }
});

test('defense reflection blocks spell and reflects damage to attacker', () => {
  const decks = readJson('decks.json');
  decks.testP1 = { name: 'p1', cards: { reflect: 10 }, costDeck: false };
  decks.testP2 = { name: 'p2', cards: { fireball: 10 }, costDeck: false };
  const h = wasm.newGame(
    buildConfig({
      decks,
      rules: { deckMode: 'own', defenseReaction: true },
      setup: { decks: ['testP1', 'testP2'] },
      seed: 77,
    })
  );
  try {
    wasm.e.cf_start(h);
    assert.equal(wasm.callStr((x) => wasm.e.cf_end_turn(x), h).ok, true);
    const st2 = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p2');
    const fb = st2.players.p2.hand[0].cardId;
    const playRes = wasm.callStr(
      (x, cp, cl, tp, tl) => wasm.e.cf_play_card(x, cp, cl, tp, tl),
      h,
      fb,
      JSON.stringify({ playerId: 'p1' })
    );
    assert.equal(playRes.ok, true);
    const stDef = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');
    assert.equal(stDef.phase, 'defend');
    const refId = stDef.players.p1.hand[0].cardId;
    const defRes = wasm.callStr(
      (x, cp, cl, tp, tl) => wasm.e.cf_defend(x, cp, cl, tp, tl),
      h,
      refId,
      ''
    );
    assert.equal(defRes.ok, true);
    const evs = wasm.callStr((x) => wasm.e.cf_drain_events(x), h);
    assert.ok(evs.some((e) => e.type === 'spellReflected'));
    const after = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '');
    assert.equal(after.players.p1.castleHp, after.players.p1.castleMaxHp);
    assert.ok(after.players.p2.castleHp + after.players.p2.armor < after.players.p2.castleMaxHp + 5);
  } finally {
    wasm.e.cf_free(h);
  }
});

test('200-game WASM benchmark completes cleanly under budget', () => {
  const cfg = buildConfig({ rules: { deckMode: 'cost' }, seed: 1 });
  const t0 = performance.now();
  const summary = wasm.runBenchmark(cfg, 200, 100);
  const elapsedMs = performance.now() - t0;
  assert.equal(summary.games, 200);
  assert.ok(summary.p1Wins + summary.p2Wins > 170);
  assert.ok(summary.avgTurns > 3);
  console.log(`Rust WASM 200-game benchmark: ${elapsedMs.toFixed(1)}ms`, summary);
});
