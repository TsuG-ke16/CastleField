// 排出率の一覧を表で出す：node tests/sim/droprates.js
// カードごとの排出率（山札に入る確率）と、魔物のごほうびの内訳（ラッキー込み）
import { Game } from '../../js/game/Game.js';
import { buildData, loadOptionalData, seededRng } from '../helpers.js';

const { cards, rules } = buildData();
const opts = loadOptionalData();
const game = new Game({ cards, rules, rng: seededRng(1), ...opts });
const info = game.getDropRates();
const name = (id) => info.rarities.find((r) => r.id === id).name;

console.log('## レアリティごとの排出率');
for (const r of info.rarities) console.log(`- ${r.name}：${r.dropRate}%`);
console.log('\n## カードごとの排出率（山札のカード1枚が、そのカードである確率）');
for (const r of info.rarities) {
  console.log(`\n### ${r.name}`);
  for (const c of Object.values(info.cards).filter((c) => c.rarity === r.id)) console.log(`- ${c.name}：${c.rate.toFixed(2)}%`);
}
console.log(`\n## 魔物のごほうび（ラッキー ${(rules.rewardLuckyChance ?? 0) * 100}% で1つ上）`);
for (const m of Object.values(info.monsters)) {
  console.log(`- ${m.name}：${m.odds.map((o) => `${name(o.rarity)} ${o.rate.toFixed(0)}%${o.lucky ? '（ラッキー）' : ''}`).join(' / ')}`);
}
