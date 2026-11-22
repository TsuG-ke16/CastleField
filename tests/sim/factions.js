// 4陣営モード（data/factions/）のシミュレーション。陣営の組み合わせごとに、席を入れかえて回す（先攻・後攻の差を消すため）。
//   node tests/sim/factions.js [--games 100] [--seed 1] [--strategy smart] [--json]
//   … 陣営A × 陣営B（同じ陣営どうしも）を games 試合ずつ、席を入れかえてもう games 試合。陣営A の勝率・平均手番・決着の理由・反応の回数を出す
//   --with kingdom：その陣営と、ほかの陣営との組み合わせだけ（同じ陣営どうしは回さない）
//   --rules '{"lightFirstStrike":false}'・--cards '{"fac_king_god_sword":{"attackBonus":6}}'：data/ を書き換えずに一部の値だけ試す（run.js と同じ）
//   --decks '{"kingdom":{"fac_king_hero":0}}'：陣営のデッキの枚数だけ変える（0 で抜く）
//   --spirit-every 2：森の常時の精霊の動く間隔（passiveSpirits.everyTurns）だけ変える
//   表の下に、切り札（カードの trump）の1試合あたりの使用回数と、光の先制が起きた回数を出す
// 同じ引数なら、誰が回しても同じ結果になる。
import { buildData, loadOptionalData } from '../helpers.js';
import { runMatch } from './sim.js';
import { Game } from '../../js/game/Game.js';

// 光の先制（Game.firstStrikes が true を返した回数。攻める側だけを調べるので、1回の戦いで1回まで）
let firstStrikeCount = 0;
if (Game.prototype.firstStrikes) {
  const orig = Game.prototype.firstStrikes;
  Game.prototype.firstStrikes = function (...a) {
    const r = orig.apply(this, a);
    if (r) firstStrikeCount += 1;
    return r;
  };
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const games = Number(opt('games', 100));
const seed = Number(opt('seed', 1));
const strategy = opt('strategy', 'smart');
const MODE = 'factions';
const json = (name) => JSON.parse(opt(name, '{}'));
const { rules, cards } = buildData({ mode: MODE, rules: json('rules'), cards: json('cards') });
const opts = loadOptionalData(MODE);
for (const [f, patch] of Object.entries(json('decks'))) {
  const deck = { ...opts.decks[f].cards };
  for (const [t, n] of Object.entries(patch)) {
    if (n > 0) deck[t] = n;
    else delete deck[t];
  }
  opts.decks = { ...opts.decks, [f]: { ...opts.decks[f], cards: deck } };
}
if (opt('spirit-every', null)) {
  for (const [f, d] of Object.entries(opts.decks)) {
    if (d.passiveSpirits) opts.decks = { ...opts.decks, [f]: { ...d, passiveSpirits: { ...d.passiveSpirits, everyTurns: Number(opt('spirit-every')) } } };
  }
}
const factions = Object.keys(opts.decks);
const trumps = Object.keys(cards).filter((t) => cards[t].trump);
const only = opt('with', null);

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
    if (only && (a === b || (a !== only && b !== only))) continue;
    firstStrikeCount = 0;
    const ab = play(a, b, seed);
    const ba = play(b, a, seed + 1);
    const firstStrikes = firstStrikeCount;
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
      reactionsPerGame: Object.values(reactions).reduce((x, y) => x + y, 0) / all.length,
      reactions,
      trumpsPerGame: Object.fromEntries(trumps.map((t) => [t, all.reduce((x, r) => x + (r.played[t] || 0), 0) / all.length])),
      firstStrikesPerGame: firstStrikes / all.length,
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
  console.log('\n切り札（1試合あたりの使用回数）・光の先制（1試合あたり）');
  for (const r of rows) console.log(`- ${name(r.a)} × ${name(r.b)}：${Object.entries(r.trumpsPerGame).map(([k, v]) => `${cards[k].name} ${v.toFixed(2)}`).join('・') || '切り札なし'}・先制 ${r.firstStrikesPerGame.toFixed(2)}`);
  console.log('\n反応の回数（全試合）');
  for (const r of rows) console.log(`- ${name(r.a)} × ${name(r.b)}：${Object.entries(r.reactions).map(([k, v]) => `${k} ${v}`).join('・') || 'なし'}`);
}
