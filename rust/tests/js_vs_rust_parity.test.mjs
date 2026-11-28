import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../../js/game/Game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WASM_PATH = path.join(REPO_ROOT, 'web/public/wasm/castlefield_wasm.wasm');
const DATA_DIR = path.join(REPO_ROOT, 'data');

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildConfig(overrides = {}) {
  const rules = { ...readJson('rules.json'), deckMode: 'cost', mulligan: false, ...(overrides.rules || {}) };
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

function createJsGame(cfg) {
  return new Game({
    cards: cfg.cards,
    rules: cfg.rules,
    monsters: cfg.monsters,
    upgrades: cfg.upgrades,
    castles: cfg.castles,
    decks: cfg.decks,
    rarities: cfg.rarities,
    stages: cfg.stages,
    weather: cfg.weather,
    setup: cfg.setup,
    rng: mulberry32(cfg.seed),
  });
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
}

const wasmBytes = fs.readFileSync(WASM_PATH);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const wasm = new WasmHarness(instance);

test('JS Game.js and Rust WASM match initial battlefield layout, stats, and hidden hand visibility', () => {
  const cfg = buildConfig({ seed: 42 });
  assert.equal(Object.keys(cfg.cards).length, 122);

  const jsGame = createJsGame(cfg);
  jsGame.start();
  const jsSt = jsGame.getState('p1');

  const h = wasm.newGame(cfg);
  try {
    wasm.callStr((x) => wasm.e.cf_start(x), h);
    const rsSt = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');

    assert.equal(rsSt.phase, jsSt.phase);
    assert.equal(rsSt.turn, jsSt.turn);
    assert.equal(rsSt.currentPlayer, jsSt.currentPlayer);

    assert.equal(rsSt.players.p1.castleHp, jsSt.players.p1.castleHp);
    assert.equal(rsSt.players.p1.castleMaxHp, jsSt.players.p1.castleMaxHp);
    assert.equal(rsSt.players.p1.mp, jsSt.players.p1.mp);
    assert.equal(rsSt.players.p1.maxMp, cfg.rules.maxMp);
    assert.equal(rsSt.players.p1.hand.length, jsSt.players.p1.hand.length);

    assert.equal(rsSt.players.p2.armor, jsSt.players.p2.armor);
    assert.equal(jsSt.players.p2.hand, null);
    assert.equal(rsSt.players.p2.hand, null);

    assert.equal(rsSt.roads.length, jsSt.roads.length);
    assert.equal(rsSt.roads[0].length, jsSt.roads[0].length);
    assert.equal(rsSt.roads[0].roadId, jsSt.roads[0].roadId);
  } finally {
    wasm.e.cf_free(h);
  }
});

test('JS Game.js and Rust WASM execute mulligan swap and enter Turn 1 identically', () => {
  const cfg = buildConfig({ rules: { mulligan: true }, seed: 77 });

  const jsGame = createJsGame(cfg);
  jsGame.start();
  const jsInit = jsGame.getState('p1');
  assert.equal(jsInit.phase, 'mulligan');
  const jsSwapIds = jsInit.players.p1.hand.slice(0, 2).map((c) => c.cardId);
  assert.equal(jsGame.mulligan('p1', jsSwapIds).ok, true);
  assert.equal(jsGame.mulligan('p2', []).ok, true);
  const jsMain = jsGame.getState('p1');

  const h = wasm.newGame(cfg);
  try {
    wasm.callStr((x) => wasm.e.cf_start(x), h);
    const rsInit = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');
    assert.equal(rsInit.phase, 'mulligan');
    const rsSwapIds = rsInit.players.p1.hand.slice(0, 2).map((c) => c.cardId);

    const m1 = wasm.callStr(
      (x, pp, pl, cp, cl) => wasm.e.cf_mulligan(x, pp, pl, cp, cl),
      h,
      'p1',
      JSON.stringify(rsSwapIds)
    );
    const m2 = wasm.callStr(
      (x, pp, pl, cp, cl) => wasm.e.cf_mulligan(x, pp, pl, cp, cl),
      h,
      'p2',
      '[]'
    );
    assert.equal(m1.ok, true);
    assert.equal(m2.ok, true);

    const rsMain = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');
    assert.equal(rsMain.phase, jsMain.phase);
    assert.equal(rsMain.turn, jsMain.turn);
    assert.equal(rsMain.currentPlayer, jsMain.currentPlayer);
    assert.equal(rsMain.players.p1.hand.length, jsMain.players.p1.hand.length);
  } finally {
    wasm.e.cf_free(h);
  }
});

test('JS Game.js and Rust WASM match defense reflection damage and surrender resolution', () => {
  const decks = readJson('decks.json');
  decks.testP1 = { name: 'p1', cards: { reflect: 10 }, costDeck: false };
  decks.testP2 = { name: 'p2', cards: { fireball: 10 }, costDeck: false };
  const cfg = buildConfig({
    decks,
    rules: { deckMode: 'own', defenseReaction: true, mulligan: false },
    setup: { decks: ['testP1', 'testP2'] },
    seed: 101,
  });

  // JS run
  const jsGame = createJsGame(cfg);
  const jsEvents = [];
  jsGame.on('spellReflected', (data) => jsEvents.push({ type: 'spellReflected', ...data }));
  jsGame.start();
  assert.equal(jsGame.endTurn().ok, true);
  const jsP2 = jsGame.getState('p2').players.p2;
  assert.equal(jsGame.playCard(jsP2.hand[0].cardId, { playerId: 'p1' }).ok, true);
  assert.equal(jsGame.getState('p1').phase, 'defend');
  const jsP1 = jsGame.getState('p1').players.p1;
  assert.equal(jsGame.defend(jsP1.hand[0].cardId).ok, true);
  const jsAfter = jsGame.getState('');

  // Rust WASM run
  const h = wasm.newGame(cfg);
  try {
    wasm.callStr((x) => wasm.e.cf_start(x), h);
    assert.equal(wasm.callStr((x) => wasm.e.cf_end_turn(x), h).ok, true);
    const rsP2 = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p2').players.p2;
    assert.equal(
      wasm.callStr(
        (x, cp, cl, tp, tl) => wasm.e.cf_play_card(x, cp, cl, tp, tl),
        h,
        rsP2.hand[0].cardId,
        JSON.stringify({ playerId: 'p1' })
      ).ok,
      true
    );
    const rsDef = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, 'p1');
    assert.equal(rsDef.phase, 'defend');
    assert.equal(
      wasm.callStr(
        (x, cp, cl, tp, tl) => wasm.e.cf_defend(x, cp, cl, tp, tl),
        h,
        rsDef.players.p1.hand[0].cardId,
        ''
      ).ok,
      true
    );
    const rsEvents = wasm.callStr((x) => wasm.e.cf_drain_events(x), h);
    const rsAfter = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '');

    assert.equal(
      jsEvents.some((e) => e.type === 'spellReflected'),
      rsEvents.some((e) => e.type === 'spellReflected')
    );
    assert.equal(rsAfter.players.p1.castleHp, jsAfter.players.p1.castleHp);
    assert.equal(
      rsAfter.players.p2.castleHp + rsAfter.players.p2.armor,
      jsAfter.players.p2.castleHp + jsAfter.players.p2.armor
    );

    assert.equal(jsGame.surrender('p1').ok, true);
    assert.equal(wasm.callStr((x, p, l) => wasm.e.cf_surrender(x, p, l), h, 'p1').ok, true);
    assert.equal(jsGame.getState('').winner, wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '').winner);
  } finally {
    wasm.e.cf_free(h);
  }
});

test('20-game paired simulation completes cleanly on both JS Game.js and Rust WASM', () => {
  for (let i = 0; i < 20; i++) {
    const seed = 1000 + i;
    const cfg = buildConfig({ rules: { deckMode: 'cost', mulligan: false }, seed });

    // JS bot loop
    const jsGame = createJsGame(cfg);
    jsGame.start();
    for (let step = 0; step < 300; step++) {
      const st = jsGame.getState('');
      if (st.phase === 'gameOver') break;
      if (st.phase === 'defend') {
        jsGame.passDefense();
        continue;
      }
      if (st.phase === 'discard') {
        const pid = st.currentPlayer;
        const p = jsGame.getState(pid).players[pid];
        const n = p.hand.length - (cfg.rules.maxHand ?? 8);
        if (n > 0) jsGame.discard(p.hand.slice(0, n).map((c) => c.cardId));
        continue;
      }
      const pid = st.currentPlayer;
      const p = jsGame.getState(pid).players[pid];
      for (const c of p.hand) {
        const chk = jsGame.canPlayCard(c.cardId);
        if (chk.ok) {
          const tgts = chk.needsTarget ? jsGame.getTargets(c.cardId) : [];
          if (!chk.needsTarget || tgts.length > 0) {
            jsGame.playCard(c.cardId, tgts[0] ?? null);
          }
        }
      }
      if (jsGame.getState('').phase === 'main') {
        jsGame.endTurn();
      }
    }
    const jsEnd = jsGame.getState('');
    assert.ok(jsEnd.turn >= 1);

    // Rust WASM loop
    const h = wasm.newGame(cfg);
    try {
      wasm.callStr((x) => wasm.e.cf_start(x), h);
      for (let step = 0; step < 300; step++) {
        const st = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '');
        if (st.phase === 'gameOver') break;
        wasm.callStr(
          (x, pp, pl, lp, ll) => wasm.e.cf_run_cpu_turn(x, pp, pl, lp, ll),
          h,
          st.currentPlayer,
          'normal'
        );
      }
      const rsEnd = wasm.callStr((x, p, l) => wasm.e.cf_get_state(x, p, l), h, '');
      assert.ok(rsEnd.turn >= 1);
    } finally {
      wasm.e.cf_free(h);
    }
  }
});
