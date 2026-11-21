// テスト用の共通部品。Node.js だけで動く（外部パッケージなし）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** data/ の JSON を読む（毎回新しいオブジェクトを返すので、書き換えても他のテストに影響しない） */
export function loadJson(name) {
  return JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'));
}

/** data/modes.json の1モードぶん（既定のモードや、cardSet のないモードは null） */
function modeEntry(mode) {
  if (!mode) return null;
  const modes = loadJson('modes.json');
  if (mode === modes.default) return null;
  const entry = modes.modes[mode];
  if (!entry?.cardSet) throw new Error(`モード "${mode}" は data/modes.json にないか、cardSet がありません`);
  return entry;
}

/** modes.json の "data/classic/cards.json" のような書き方で JSON を読む */
function loadModeFile(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
}

/** tests/fixtures/ の固定データを読む（data/ の調整でテストが落ちないように） */
export function loadFixture(name) {
  return JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', name), 'utf8'));
}

/**
 * data/ の rules / cards に、一部だけ上書きしたものを返す。
 * cards はカードごとに中身をまぜる（null を渡したカードは消す）。
 * mode を渡すと、そのモード（data/modes.json）のカード・ルールを土台にする（省略すると今まで通り）。
 * @param {{rules?: object, cards?: object, source?: 'data' | 'fixture', mode?: string|null}} [patch]
 */
export function buildData({ rules: rulesPatch = {}, cards: cardsPatch = {}, source = 'data', mode = null } = {}) {
  const load = source === 'fixture' ? loadFixture : loadJson;
  const entry = source === 'fixture' ? null : modeEntry(mode);
  const rules = { ...(entry?.rulesSet ? loadModeFile(entry.rulesSet) : load('rules.json')), ...rulesPatch };
  const cards = entry ? loadModeFile(entry.cardSet) : load('cards.json');
  for (const [k, v] of Object.entries(cardsPatch)) {
    if (v === null) delete cards[k];
    else cards[k] = { ...(cards[k] || {}), ...v };
  }
  return { rules, cards };
}

/**
 * 試合の始めの決まり（マリガン・後攻の補正）を切るルールの上書き。
 * それとは関係のない仕組みを、本物の data/rules.json で確かめるテストで使う（start() のあとすぐ先攻のターン1になる）
 */
export const PLAIN_START = { mulligan: false, secondPlayerHandBonus: 0, secondPlayerArmor: 0 };

/**
 * data/ の魔物と強化（STEP 3）。ファイルがなければ null
 * mode を渡して、そのモードがレアリティを使わない（useRarities: false）なら、rarities と decks は null にする
 */
export function loadOptionalData(mode = null) {
  const read = (name) => {
    try {
      return loadJson(name);
    } catch {
      return null;
    }
  };
  const data = { monsters: read('monsters.json'), upgrades: read('upgrades.json'), castles: read('castles.json'), decks: read('decks.json'), rarities: read('rarities.json'), weather: read('weather.json'), stages: read('stages.json') };
  if (modeEntry(mode)?.useRarities === false) { data.rarities = null; data.decks = null; }
  return data;
}

/** シード付きの乱数（mulberry32）。同じシードなら同じ並びになる */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Game が出すイベントを全部ためる */
export function recordEvents(game, types) {
  const log = [];
  for (const type of types) game.on(type, (payload) => log.push({ ...payload, event: type }));
  return log;
}
