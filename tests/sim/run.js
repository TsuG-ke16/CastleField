// バランス確認のシミュレーションを回して表を出す。
//   node tests/sim/run.js                       … 決まった組み合わせを各1000試合
//   node tests/sim/run.js --games 200 --seed 7  … 試合数とシードを変える
//   node tests/sim/run.js --match smart,random  … 1つの組み合わせだけ
//   node tests/sim/run.js --rules '{"castleMaxHp":30}' --cards '{"fireball":{"count":3}}'
//   node tests/sim/run.js --stage lava（ステージを1つに決める）／--no-stages（ステージなし）
//       … data/ の値を一部だけ上書きして試す（cards はカードごとに中身をまぜる）
//   node tests/sim/run.js --json                … 結果を JSON で出す
//   node tests/sim/run.js --no-monsters         … 魔物と強化なしで回す
//   node tests/sim/run.js --mode classic        … クラシックモードのカード・ルールで回す（省略すると通常モード）
//   node tests/sim/run.js --mode classic --skills blade,shield … 席ごとのスキルのビルド（none / random / プリセットのID / auto＝戦い方のおすすめ）
// 同じ引数なら、誰が回しても同じ結果になる。
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
const games = Number(opt('games', 1000));
const seed = Number(opt('seed', 1));
if (!Number.isInteger(games) || games < 1) die('--games は1以上の整数にしてください');
if (!Number.isInteger(seed)) die('--seed は整数にしてください');
let rulesPatch;
let cardsPatch;
try {
  rulesPatch = JSON.parse(opt('rules', '{}'));
  cardsPatch = JSON.parse(opt('cards', '{}'));
} catch (err) {
  die(`--rules / --cards は JSON で書いてください（${err.message}）`);
}

const DEFAULT_MATCHES = [
  'random,random', 'aggro,aggro', 'smart,smart', 'defensive,defensive', 'guard,guard',
  'defensive,aggro', 'aggro,defensive', 'random,smart', 'smart,random', 'random,pass',
];

const matches = opt('match', null) ? [opt('match')] : DEFAULT_MATCHES;
const mode = opt('mode', null);
let rules, cards, gameOptions;
try {
  ({ rules, cards } = buildData({ rules: rulesPatch, cards: cardsPatch, mode }));
  gameOptions = args.includes('--no-monsters') ? {} : loadOptionalData(mode);
} catch (err) {
  die(err.message);
}
// --stage lava：ステージを1つに決める（省略すると毎試合ランダム。--no-stages でステージなし）
if (args.includes('--no-stages')) delete gameOptions.stages;
else if (opt('stage', null)) gameOptions.setup = { ...(gameOptions.setup ?? {}), stage: opt('stage') };
// --skills blade,shield：席ごとのスキルのビルド（スキルツリーのあるモードだけ）。auto は戦い方ごとのおすすめ
const skillsOpt = opt('skills', null);
if (skillsOpt && !gameOptions.skillTree) die('--skills は、スキルツリーのあるモード（--mode classic）で使ってください');
const skillsFor = (strategies) => {
  if (!skillsOpt) return null;
  const list = skillsOpt.split(',');
  return strategies.map((s, i) => (list[i] ?? list[0]) === 'auto' ? s : list[i] ?? list[0]);
};
let rows;
try {
  rows = matches.map((m) => runMany({ games, seed, cards, rules, gameOptions, strategies: m.split(','), skills: skillsFor(m.split(',')) }));
} catch (err) {
  die(err.message);
}

const pct = (x) => `${Math.round(x * 100)}%`;
if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`試合数 ${games}・シード ${seed}`);
  console.log('「決着」は3000手番までに決着した試合数。手番は決着した試合だけで数える。');
  console.log('| 組み合わせ | 決着 | 平均手番（中央値・最大） | p1 の勝率 | 兵士からの城ダメージ | 戦い/試合 | 魔物を倒す/試合 | 魔物の城ダメージ/試合 | 魔物で決着 | 捨てる場面 | 出せる種類が2以上 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.strategies.join(' vs ')} | ${r.decided}/${r.games} | ${r.avgTurns?.toFixed(1)}（${r.medianTurns}・${r.maxTurns}） | ${pct(r.winRate.p1 || 0)}±${pct(r.p1Margin ?? 0)} | ${pct(r.soldierDamageShare)} | ${r.clashesPerGame.toFixed(1)} | ${r.monstersDefeatedPerGame.toFixed(1)} | ${r.monsterCastleDamagePerGame.toFixed(1)} | ${pct(r.endedByMonsterRate)} | ${pct(r.discardRate)} | ${pct(r.choiceRate)} |`,
    );
  }
}
// クラシック：属性の反応（対消滅・黒氷・砕氷・混沌反応）の回数。反応が起きたときだけ出す
if (!args.includes('--json') && rows.some((r) => r.reactionsPerGame !== undefined)) {
  console.log('\n属性の反応（全試合の回数。「/試合」は1試合の平均、「あり」は反応が1回以上あった試合の割合）');
  for (const r of rows) {
    if (r.reactionsPerGame === undefined) continue;
    const counts = Object.entries(r.reactionCounts).map(([k, v]) => `${k} ${v}`).join('・');
    console.log(`- ${r.strategies.join(' vs ')}：${r.reactionsPerGame.toFixed(2)}/試合・あり ${pct(r.reactionGameRate)}（${counts}）`);
  }
}
