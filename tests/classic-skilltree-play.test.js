// クラシックのスキルツリー：試合を通して確かめるテスト（シミュレーション・オンラインの部屋）。
//   - skills を渡さなければ今までと同じ（イベントが完全に一致）
//   - スキルありの試合も決着する
//   - 部屋で席ごとにスキルを選べる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_STYLE_OF } from '../js/game/strategies.js';
import { Lobby } from '../server/rooms.js';
import { loadData, loadModeData } from '../server/server.js';
import { runMatch } from './sim/sim.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

const TREE = () => loadOptionalData('classic').skillTree;

test('skills を渡さなければ今までと同じ（skillTree なし／あり・全員なし で、試合のイベントが完全に一致）', () => {
  const { cards, rules } = buildData({ mode: 'classic' });
  const opts = loadOptionalData('classic');
  const { skillTree, ...without } = opts;
  for (const seed of [1, 2, 3]) {
    const a = runMatch({ cards, rules, strategies: ['smart', 'smart'], seed, gameOptions: without });
    const b = runMatch({ cards, rules, strategies: ['smart', 'smart'], seed, gameOptions: { ...without, skillTree } });
    const c = runMatch({ cards, rules, strategies: ['smart', 'smart'], seed, gameOptions: { ...without, skillTree }, skills: ['none', 'none'] });
    for (const x of [b, c]) {
      assert.equal(x.winner, a.winner);
      assert.equal(x.turns, a.turns);
      assert.deepEqual(x.events, a.events);
      assert.deepEqual(x.castleDamage, a.castleDamage);
    }
    // getState のキー：skillTree を渡したときだけ skills・maxMp が増える
    assert.equal(a.finalState.players.p1.skills, undefined);
    assert.deepEqual(b.finalState.players.p1.skills, []);
  }
});

test('シミュレーション：スキルありの試合も決着する（どのプリセットどうしでも）', () => {
  const { cards, rules } = buildData({ mode: 'classic' });
  const gameOptions = loadOptionalData('classic');
  const presets = Object.keys(gameOptions.skillTree.presets);
  presets.forEach((p, i) => {
    const r = runMatch({ cards, rules, strategies: ['smart', 'smart'], seed: 10 + i, gameOptions, skills: [p, presets[(i + 1) % presets.length]] });
    assert.ok(r.winner, p);
    assert.deepEqual(r.finalState.players.p1.skills, gameOptions.skillTree.presets[p].ids);
  });
});

test('部屋：クラシックでは席ごとにスキルを選べる（不正なら理由）。CPU はおすすめ。試合に渡る。通常モードでは選べない', () => {
  let seed = 1;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0, modeData: loadModeData() });
  const a = lobby.join('sk', 'A', null, 'classic');
  const { room, seat } = lobby.findSeat(a.token);
  assert.deepEqual(seat.skills, { ids: [], config: {} });
  assert.match(room.setSeat(seat, { skills: ['C02'] }).reason, /つながっていません/);
  assert.match(room.setSeat(seat, { skills: { ids: ['E01', 'E02', 'E04'], config: { E04: 'fire' } } }).reason, /選べません/);
  assert.equal(room.setSeat(seat, { skills: { ids: ['E01', 'E02', 'E04'], config: { E04: 'chaos' } } }).ok, true);
  const cpu = room.addCpu(seat, 'hard');
  assert.equal(cpu.ok, true);
  const info = room.roomInfo();
  const smart = TREE().presets[SKILL_STYLE_OF.smart];
  assert.deepEqual(info.players.map((p) => p.skills), [{ ids: ['E01', 'E02', 'E04'], config: { E04: 'chaos' } }, { ids: smart.ids, config: { E04: 'annihilation' } }]);
  assert.equal(info.choices.skillTree.budget, TREE().budget);
  assert.equal(info.choices.skillTree.nodes.length, 200);
  assert.deepEqual(info.choices.skillTree.nodes.find((n) => n.id === 'M08').requires, ['M02']);
  room.startGame();
  const st = room.game.getState(null).players.p1;
  assert.deepEqual(st.skills, ['E01', 'E02', 'E04']);
  assert.deepEqual(st.skillConfig, { E04: 'chaos' });
  // 通常モード
  const n = lobby.join('plain-sk', 'B');
  const r2 = lobby.findSeat(n.token);
  assert.equal(r2.seat.skills, null);
  assert.match(r2.room.setSeat(r2.seat, { skills: [] }).reason, /スキルを選べません/);
  assert.equal(r2.room.roomInfo().choices.skillTree, null);
});
