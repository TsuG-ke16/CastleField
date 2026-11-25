// 4陣営モード（data/factions/）のシミュレーション。陣営の組み合わせごとに、席を入れかえて回す（先攻・後攻の差を消すため）。
//   node tests/sim/factions.js [--games 100] [--seed 1] [--strategy smart] [--json]
//   … 陣営A × 陣営B（同じ陣営どうしも）を games 試合ずつ、席を入れかえてもう games 試合。陣営A の勝率・平均手番・決着の理由・反応の回数を出す
// 同じ引数なら、誰が回しても同じ結果になる。
import { buildData, loadOptionalData } from '../helpers.js';
import { runMatch } from './sim.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const games = Number(opt('games', 100));
const seed = Number(opt('seed', 1));
const strategy = opt('strategy', 'smart');
const MODE = 'factions';
const { rules, cards } = buildData({ mode: MODE });
const opts = loadOptionalData(MODE);
const factions = Object.keys(opts.decks);

/** a（席1）と b（席2）で games 試合。結果の一覧 */
function play(a, b, s) {
  const out = [];
  for (let i = 0; i < games; i++) {
    out.push(runMatch({ cards, rules, strategies: [strategy, strategy], seed: s * 100003 + i, gameOptions: { ...opts, setup: { decks: [a, b] } } }));
  }
  return out;
}

const rows = [];
for (let i = 0; i < factions.length; i++) {
  for (let j = i; j < factions.length; j++) {
    const a = factions[i];
    const b = factions[j];
    const ab = play(a, b, seed);
    const ba = play(b, a, seed + 1);
    const all = [...ab, ...ba];
    const decided = all.filter((r) => r.winner);
    // a の勝ち：ab では p1、ba では p2
    const aWins = ab.filter((r) => r.winner === 'p1').length + ba.filter((r) => r.winner === 'p2').length;
    const firstWins = all.filter((r) => r.winner && r.winner === r.finalState.firstPlayer).length;
    const reasons = {};
    for (const r of all) reasons[r.reason ?? 'none'] = (reasons[r.reason ?? 'none'] || 0) + 1;
    const reactions = {};
    for (const r of all) for (const [k, v] of Object.entries(r.reactions)) reactions[k] = (reactions[k] || 0) + v;
    const turns = decided.map((r) => r.turns);
    rows.push({
      a, b, games: all.length, decided: decided.length,
      aWinRate: aWins / (decided.length || 1),
      firstPlayerWinRate: firstWins / (decided.length || 1),
      avgTurns: turns.length ? turns.reduce((x, y) => x + y, 0) / turns.length : null,
      maxTurns: turns.length ? Math.max(...turns) : null,
      reasons,
      raisedPerGame: all.reduce((x, r) => x + r.raised, 0) / all.length,
      raisedCastleDamage: all.reduce((x, r) => x + r.raisedCastleDamage, 0),
      castleDamageTotal: all.reduce((x, r) => x + r.castleDamage.soldier + r.castleDamage.spell + r.castleDamage.other, 0),
      reactionsPerGame: Object.values(reactions).reduce((x, y) => x + y, 0) / all.length,
      reactions,
    });
  }
}

const pct = (x) => `${Math.round(x * 100)}%`;
if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`4陣営モード・${strategy} 同士・各組み合わせ ${games}×2 試合（席を入れかえ）・シード ${seed}`);
  console.log('| 陣営A × 陣営B | 決着 | A の勝率 | 先攻の勝率 | 平均手番（最大） | 決着の理由 | 反応/試合 |');
  console.log('|---|---|---|---|---|---|---|');
  const name = (f) => opts.decks[f].name;
  for (const r of rows) {
    const reasons = Object.entries(r.reasons).map(([k, v]) => `${k} ${v}`).join('・');
    console.log(`| ${name(r.a)} × ${name(r.b)} | ${r.decided}/${r.games} | ${r.a === r.b ? '—' : pct(r.aWinRate)} | ${pct(r.firstPlayerWinRate)} | ${r.avgTurns?.toFixed(1)}（${r.maxTurns}） | ${reasons} | ${r.reactionsPerGame.toFixed(2)} |`);
  }
  console.log('\n骸骨兵（死者を従える）');
  for (const r of rows) if (r.raisedPerGame > 0) console.log(`- ${name(r.a)} × ${name(r.b)}：生まれた回数 ${r.raisedPerGame.toFixed(2)}/試合・骸骨兵が城に与えたダメージ ${pct(r.raisedCastleDamage / (r.castleDamageTotal || 1))}（全員が城に与えたダメージに対する割合）`);
  console.log('\n反応の回数（全試合）');
  for (const r of rows) console.log(`- ${name(r.a)} × ${name(r.b)}：${Object.entries(r.reactions).map(([k, v]) => `${k} ${v}`).join('・') || 'なし'}`);
}
