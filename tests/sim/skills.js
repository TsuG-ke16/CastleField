// クラシックのスキルツリー：ビルドどうしの勝率と長さ（docs/classic-skilltree.md の「バランスの測り方」）。
//   node tests/sim/skills.js                         … プリセット全部＋none＋random の総当たり（席を入れかえて各100試合ずつ）
//   node tests/sim/skills.js --games 200 --seed 7    … 1つの向きの試合数とシード
//   node tests/sim/skills.js --builds blade,shield   … 比べるビルド（none / random / skilltree.json の presets のID）
//   node tests/sim/skills.js --strategy smart        … 両者の戦い方（省略すると smart）
//   node tests/sim/skills.js --vs none               … 総当たりではなく、どのビルドもこの1つとだけ比べる（ノード1つの強さを測る）
//   ビルドは「+」でつないだノードのIDでも書ける（例：keenBlade+siegecraft）
//   node tests/sim/skills.js --tree '{"nodes":{"keenBlade":{"effects":{"soldierAttack":1,"castleHp":-8}}}}'
//       … skilltree.json を書き換えずに、一部のノードだけ試す（ノードごとに中身をまぜる）
//   node tests/sim/skills.js --json
// 同じ引数なら、誰が回しても同じ結果になる（乱数はシード付き）。
import { buildData, loadOptionalData } from '../helpers.js';
import { runMany } from './sim.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};
const games = Number(opt('games', 100));
const seed = Number(opt('seed', 1));
const strategy = opt('strategy', 'smart');
if (!Number.isInteger(games) || games < 1) die('--games は1以上の整数にしてください');
if (!Number.isInteger(seed)) die('--seed は整数にしてください');

const { rules, cards } = buildData({ mode: 'classic' });
const gameOptions = loadOptionalData('classic');
if (!gameOptions.skillTree) die('data/modes.json のクラシックに skillTreeSet がありません');
try {
  const patch = JSON.parse(opt('tree', '{}'));
  const tree = gameOptions.skillTree;
  if (patch.points !== undefined) tree.points = patch.points;
  for (const [id, n] of Object.entries(patch.nodes ?? {})) tree.nodes[id] = { ...(tree.nodes[id] ?? {}), ...n };
} catch (err) {
  die(`--tree は JSON で書いてください（${err.message}）`);
}
const builds = (opt('builds', null) ?? ['none', 'random', ...Object.keys(gameOptions.skillTree.presets ?? {})].join(',')).split(',');

const pct = (x) => `${Math.round(x * 100)}%`;
/** a が p1・b が p2 の試合と、入れかえた試合 */
const cell = (a, b) => {
  const fwd = runMany({ games, seed, cards, rules, gameOptions, strategies: [strategy, strategy], skills: [a, b] });
  const rev = runMany({ games, seed: seed + 7919, cards, rules, gameOptions, strategies: [strategy, strategy], skills: [b, a] });
  const winsA = (fwd.winRate.p1 ?? 0) * fwd.decided + (rev.winRate.p2 ?? 0) * rev.decided;
  const winsP1 = (fwd.winRate.p1 ?? 0) * fwd.decided + (rev.winRate.p1 ?? 0) * rev.decided;
  const decided = fwd.decided + rev.decided;
  return {
    a, b, games: games * 2, decided,
    winA: winsA / (decided || 1),
    p1: winsP1 / (decided || 1),
    avgTurns: ((fwd.avgTurns ?? 0) * fwd.decided + (rev.avgTurns ?? 0) * rev.decided) / (decided || 1),
    reactionsPerGame: ((fwd.reactionsPerGame ?? 0) + (rev.reactionsPerGame ?? 0)) / 2,
  };
};

const rows = [];
const vs = opt('vs', null);
if (vs) for (const b of builds) rows.push(cell(b, vs));
else for (let i = 0; i < builds.length; i++) for (let j = i; j < builds.length; j++) rows.push(cell(builds[i], builds[j]));
// ビルドごとの平均の勝率（自分以外のビルドとの対戦の平均）
const overall = Object.fromEntries(builds.map((b) => {
  const rs = rows.filter((r) => r.a !== r.b && (r.a === b || r.b === b)).map((r) => (r.a === b ? r.winA : 1 - r.winA));
  return [b, rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : null];
}));

if (args.includes('--json')) {
  console.log(JSON.stringify({ games, seed, strategy, rows, overall }, null, 2));
} else {
  console.log(`戦い方 ${strategy} 同士・1つの向きに ${games} 試合（席を入れかえて ${games * 2} 試合）・シード ${seed}`);
  console.log('| A vs B | 決着 | A の勝率 | 先攻(p1)の勝率 | 平均手番 | 反応/試合 |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.a} vs ${r.b} | ${r.decided}/${r.games} | ${pct(r.winA)} | ${pct(r.p1)} | ${r.avgTurns.toFixed(1)} | ${r.reactionsPerGame.toFixed(2)} |`);
  console.log('\nビルドごとの平均の勝率（ほかのビルドとの対戦の平均。50% に近いほどよい）');
  for (const [b, w] of Object.entries(overall)) console.log(`- ${b}：${w === null ? '-' : pct(w)}`);
}
