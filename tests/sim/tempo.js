// 段階A1（戦闘テンポ）の小規模比較：ビルド（クラシック）／陣営（4陣営）ごとの「使用感」の数字を出す。
//   node tests/sim/tempo.js                          … クラシック：ビルド一覧 × none（席を入れかえて）・各100試合・シード 1,2
//   node tests/sim/tempo.js --games 150 --seeds 1,2  … 1つの向きの試合数とシード（複数はカンマ区切り）
//   node tests/sim/tempo.js --builds none,mpLine     … 比べるビルド（none / random / presets のID / 下の EXTRA_BUILDS / "P01+P02" の取得順）
//   node tests/sim/tempo.js --mode factions          … 4陣営：陣営ごとに、ほかの3陣営と席を入れかえて回す（スキルなし）
//   node tests/sim/tempo.js --rules '{"mpPerTurn":3}' … data/ を書き換えずにルールの一部だけ試す
//   node tests/sim/tempo.js --json
// 出す数字（ビルド側・陣営側の席だけを数える。sim.js の newTempo）：
//   勝率・平均手番（決着した試合）・1ターンのカード枚数・攻撃魔法/ターン・MP余剰（ターン終了時 MP≧上限の50% の割合）・MP満タン終了率・
//   MP不足率（MP だけが足りずに出せないカードが残ったターン）・コンボ率（兵士・武器・魔法・属性反応のうち2種類以上）・
//   コイン獲得/消費（1試合）・魔物討伐（1試合）
// 大規模な勝率測定はしない（QA ツールの担当）。1回の実行が10分を超えない大きさで使う。
import { buildData, loadOptionalData } from '../helpers.js';
import { runMatch, summarize, summarizeTempo } from './sim.js';

/** プリセットにない比較用ビルド（予算12pt 以内・取得順） */
export const EXTRA_BUILDS = {
  mpLine: 'P01+P02+P03+P04+P05+P06+P07+P08', // MP系統だけ
  bloodLine: 'B01+B02+B03+B04+B05+B06+B07+B08', // 血魔術だけ
  economy: 'P01+P03+P02+P04+X16', // コイン関連（等価交換・魔物狩り・黄金の祝福）
};

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
const seeds = String(opt('seeds', '1,2')).split(',').map(Number);
const strategy = opt('strategy', 'smart');
const mode = opt('mode', 'classic');
if (!Number.isInteger(games) || games < 1) die('--games は1以上の整数にしてください');
if (seeds.some((s) => !Number.isInteger(s))) die('--seeds は整数のカンマ区切りにしてください');
let rulesPatch;
try {
  rulesPatch = JSON.parse(opt('rules', '{}'));
} catch (err) {
  die(`--rules は JSON で書いてください（${err.message}）`);
}
const { rules, cards } = buildData({ mode, rules: rulesPatch });
const gameOptions = loadOptionalData(mode);

/** 試合をまとめて回す（試合ごとの結果の配列） */
function play({ seed, skills = null, decks = null }) {
  const out = [];
  for (let i = 0; i < games; i++) {
    const s = seed * 100003 + i;
    const go = decks ? { ...gameOptions, setup: { ...(gameOptions.setup ?? {}), decks } } : gameOptions;
    out.push(runMatch({ cards, rules, gameOptions: go, strategies: [strategy, strategy], seed: s, skills, tempo: true }));
  }
  return out;
}

/** side の席（p1/p2）を返す関数を渡して、勝率・手番・テンポをまとめる */
function row(name, results, seatOf) {
  const decided = results.filter((r) => r.winner);
  const wins = decided.filter((r) => r.winner === seatOf(r)).length;
  const base = summarize(results, [strategy, strategy]);
  return {
    name,
    games: results.length,
    decided: decided.length,
    winRate: wins / (decided.length || 1),
    avgTurns: base.avgTurns,
    ...summarizeTempo(results, seatOf),
  };
}

const rows = [];
if (mode === 'factions') {
  const factions = Object.keys(gameOptions.decks ?? {});
  for (const f of factions) {
    const results = [];
    for (const seed of seeds) {
      for (const g of factions.filter((x) => x !== f)) {
        for (const r of play({ seed, decks: [f, g] })) results.push({ ...r, side: 'p1' });
        for (const r of play({ seed: seed + 7919, decks: [g, f] })) results.push({ ...r, side: 'p2' });
      }
    }
    rows.push(row(f, results, (r) => r.side));
  }
} else {
  if (!gameOptions.skillTree) die(`モード ${mode} にはスキルツリーがありません`);
  const builds = (opt('builds', null) ?? ['none', 'critMagicLuck', 'bloodHealDefense', 'elementManaMagic', 'graveTroopsSummon', ...Object.keys(EXTRA_BUILDS)].join(',')).split(',');
  const vs = opt('vs', 'none');
  const styleOf = (b) => EXTRA_BUILDS[b] ?? b;
  for (const b of builds) {
    const results = [];
    for (const seed of seeds) {
      for (const r of play({ seed, skills: [styleOf(b), styleOf(vs)] })) results.push({ ...r, side: 'p1' });
      for (const r of play({ seed: seed + 7919, skills: [styleOf(vs), styleOf(b)] })) results.push({ ...r, side: 'p2' });
    }
    rows.push(row(b, results, (r) => r.side));
  }
}

const pct = (x) => (x === null || x === undefined ? 'null' : `${Math.round(x * 100)}%`);
const f1 = (x) => (x === null || x === undefined ? 'null' : x.toFixed(1));
const f2 = (x) => (x === null || x === undefined ? 'null' : x.toFixed(2));
if (args.includes('--json')) {
  console.log(JSON.stringify({ mode, games, seeds, strategy, rulesPatch, rows }, null, 2));
} else {
  console.log(`モード ${mode}・戦い方 ${strategy} 同士・1つの向きに ${games} 試合 × シード ${seeds.join(',')}（席を入れかえて）`);
  console.log('| ビルド/陣営 | 試合 | 決着 | 勝率 | 平均手番 | 自ターン/試合 | カード/ターン | 攻撃魔法/ターン | MP≧50%で終了 | MP満タン終了 | MP不足 | コンボ | コイン獲得/試合 | コイン消費/試合 | 魔物討伐/試合 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.name} | ${r.games} | ${r.decided} | ${pct(r.winRate)} | ${f1(r.avgTurns)} | ${f1(r.turnsPerGame)} | ${f2(r.cardsPerTurn)} | ${f2(r.attackSpellsPerTurn)} | ${pct(r.mpHighEndRate)} | ${pct(r.mpFullEndRate)} | ${pct(r.mpShortRate)} | ${pct(r.comboRate)} | ${f1(r.coinsGainedPerGame)} | ${f1(r.coinsSpentPerGame)} | ${f2(r.monsterKillsPerGame)} |`);
  }
  console.log('\nコイン獲得の内訳（1試合あたり。reason ごと）');
  for (const r of rows) console.log(`- ${r.name}：${Object.entries(r.coinsByReasonPerGame).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('・')}`);
}
