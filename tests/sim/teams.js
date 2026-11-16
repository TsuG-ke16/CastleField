// チーム戦のシミュレーション。全員 smart で、チームの分け方ごとに勝率と長さを比べる。
//   node tests/sim/teams.js [--games 200]
import { buildData, loadOptionalData } from '../helpers.js';
import { runMatch } from './sim.js';

const args = process.argv.slice(2);
const games = Number(args[args.indexOf('--games') + 1] || 200);
const pct = (x) => `${Math.round(x * 100)}%`;
// --rules '{"teamTurns":"all"}' で、data/rules.json の一部だけ変えて試せる
const extra = args.includes('--rules') ? JSON.parse(args[args.indexOf('--rules') + 1]) : {};

const SETUPS = [
  { label: '2対2', teams: ['t1', 't2', 't1', 't2'] },
  { label: '4対4', teams: ['t1', 't2', 't1', 't2', 't1', 't2', 't1', 't2'] },
  { label: '3対5', teams: ['t1', 't2', 't1', 't2', 't1', 't2', 't2', 't2'] },
  { label: '1対7', teams: ['t1', 't2', 't2', 't2', 't2', 't2', 't2', 't2'] },
  { label: '2人×4チーム', teams: ['t1', 't2', 't3', 't4', 't1', 't2', 't3', 't4'] },
];

console.log(`各 ${games} 試合・全員 smart。勝率はチームごと（t1, t2, …）`);
console.log('| 分け方 | 勝ち方 | 平均手番 | 周回の上限で決着 | チームの勝率 |');
console.log('|---|---|---|---|---|');
for (const s of SETUPS) {
  for (const winCondition of ['firstDestroy', 'lastStanding']) {
    if (winCondition === 'lastStanding' && new Set(s.teams).size === 2) continue; // 2チームならどちらも同じ
    const { rules, cards } = buildData({ rules: { playerCount: s.teams.length, roadLayout: 'plaza', winCondition, ...extra } });
    const gameOptions = { ...loadOptionalData(), setup: { teams: s.teams } };
    const wins = {};
    let turns = 0;
    let limit = 0;
    for (let i = 0; i < games; i++) {
      const r = runMatch({ cards, rules, gameOptions, strategies: s.teams.map(() => 'smart'), seed: 7 * 100003 + i });
      const team = s.teams[Number(r.winner.slice(1)) - 1];
      wins[team] = (wins[team] || 0) + 1;
      turns += r.turns;
      if (r.reason === 'roundLimit') limit += 1;
    }
    const rates = [...new Set(s.teams)].map((t) => `${t} ${pct((wins[t] || 0) / games)}`).join('・');
    console.log(`| ${s.label} | ${winCondition === 'firstDestroy' ? '最初に落とした' : '最後の1チーム'} | ${(turns / games).toFixed(0)} | ${pct(limit / games)} | ${rates} |`);
  }
}
