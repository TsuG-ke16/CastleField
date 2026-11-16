// 人数を変えたときのシミュレーション（STEP 5）。
//   node tests/sim/multi.js [--games 300]
// 2人・4人・8人で、道の形（広場／輪）と勝利条件を変えて比べる。
// - all smart：全員が smart。席ごとの勝率の幅（先の席が有利か）
// - 1 smart：席1だけ smart、ほかは random。smart の勝率（考える人が勝てるか。人数ぶんの1より大きければよい）
import { buildData, loadOptionalData } from '../helpers.js';
import { runMany } from './sim.js';

const args = process.argv.slice(2);
const games = Number(args[args.indexOf('--games') + 1] || 300);
const gameOptions = loadOptionalData();
const pct = (x) => `${Math.round(x * 100)}%`;

const VARIANTS = [
  { label: '広場・最初に落とした人（data/ の値）', rules: { roadLayout: 'plaza', winCondition: 'firstDestroy', castleSpellRange: 'any' } },
  { label: '広場・最後の1人', rules: { roadLayout: 'plaza', winCondition: 'lastStanding', castleSpellRange: 'any' } },
  { label: '輪・最初に落とした人・誰にでも', rules: { roadLayout: 'ring', winCondition: 'firstDestroy', castleSpellRange: 'any' } },
  { label: '輪・最後の1人・誰にでも', rules: { roadLayout: 'ring', winCondition: 'lastStanding', castleSpellRange: 'any' } },
];

console.log(`各 ${games} 試合・シード 1。手番は通算ターン数、周回は全員が1回ずつ手番を終えた数`);
console.log('| 人数 | 勝利条件・魔法の届く相手 | 決着 | 平均手番（中央値・最大） | 平均周回 | 上限で決着 | 席ごとの勝率（全員 smart） | 席1の smart が random に勝つ |');
console.log('|---|---|---|---|---|---|---|---|');
for (const n of [2, 4, 8]) {
  for (const v of VARIANTS) {
    if (n === 2 && v !== VARIANTS[0]) continue; // 2人ならどれも同じ
    const { rules, cards } = buildData({ rules: { ...v.rules, playerCount: n } });
    const all = runMany({ games, seed: 1, cards, rules, gameOptions, strategies: Array(n).fill('smart') });
    const one = runMany({ games, seed: 2, cards, rules, gameOptions, strategies: ['smart', ...Array(n - 1).fill('random')] });
    const seatRates = Array.from({ length: n }, (_, i) => all.winRate[`p${i + 1}`] || 0);
    console.log(
      `| ${n} | ${v.label} | ${all.decided}/${all.games} | ${all.avgTurns.toFixed(0)}（${all.medianTurns}・${all.maxTurns}） | ${all.avgRounds.toFixed(1)} | ${pct(all.roundLimitRate)} | ${pct(Math.min(...seatRates))}〜${pct(Math.max(...seatRates))}（平均 ${pct(1 / n)}） | ${pct(one.winRate.p1 || 0)} |`,
    );
  }
}
