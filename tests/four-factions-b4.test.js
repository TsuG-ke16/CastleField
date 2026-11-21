// 四大陣営 PR-B4：台帳の取り込み（竜族帝国：新規59＋既存11＝70行）。
// 新規59のうち true は 15（竜人5・武器10）、false は 44（竜騎兵4・竜術師5・炎竜5・雷竜5・ブレス5・竜威覚醒5・城防御5・兵士防御5・回復5）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { factionPool, isLegalForFaction } from '../js/game/Factions.js';
import { sampleDeckTypes, sampleType, sampleTypeOfRarity, dropRates, isDeckable, isDrawable } from '../js/game/Setup.js';
import { loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';
import { buildAll, formatCards, newCardId, FACTION_IDS, ELEMENT_IDS } from '../docs/four-factions/import/build.mjs';
import { ROWS } from '../docs/four-factions/import/mapping.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = JSON.parse(readFileSync(join(ROOT, 'docs', 'four-factions', 'CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json'), 'utf8'));
const CARDS = loadJson('cards.json');
const rarities = loadJson('rarities.json');
const factions = loadJson('factions.json');
const reactions = loadJson('reactions.json');
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const ofType = (log, t) => log.filter((e) => e.event === t);

const DRAGON = LEDGER.cards.filter((r) => r.faction === '竜族帝国');
const idOfRow = (row) => (row.status === '新規案' ? newCardId(row) : ROWS.find((r) => r.name === row.name).id);
const B4_NEW = DRAGON.filter((r) => r.status === '新規案').map(idOfRow);
const chainIds = (chain) => ORDER.map((r) => `${chain}_${r}`);

const TRUES = [...chainIds('dragonborn'), ...chainIds('dragon_fire_weapon'), ...chainIds('dragon_lightning_weapon')].sort();
const FALSES = [
  ...chainIds('dragon_rider').slice(0, 4), ...chainIds('dragon_mage'), ...chainIds('fire_dragon'), ...chainIds('lightning_dragon'),
  ...chainIds('dragon_breath'), ...chainIds('dragon_awakening'), ...chainIds('dragon_wall'), ...chainIds('dragon_armor'), ...chainIds('dragon_regen'),
].sort();
const EXISTING_IDS = ['dragonKnight', 'fireball', 'inferno', 'meteor', 'starfall', 'apocalypse', 'bolt', 'thunder', 'bigThunder', 'raijin', 'judgment'];

// ================= 台帳との一致 =================

test('竜族帝国は台帳で70行（新規59・既存11）。区分ごとの件数が合い、すべて cards.json に 名前・レアリティ・faction・属性・合成先で入っている', () => {
  assert.equal(DRAGON.length, 70);
  assert.equal(B4_NEW.length, 59);
  assert.equal(DRAGON.filter((r) => r.status === '既存').length, 11);
  const bySection = {};
  for (const r of DRAGON.filter((x) => x.status === '新規案')) bySection[r.section] = (bySection[r.section] ?? 0) + 1;
  assert.deepEqual(bySection, { 兵士: 24, 武器: 10, 竜のブレス: 5, '竜威・覚醒': 5, 城防御: 5, 兵士防御: 5, 回復魔法: 5 });
  assert.equal(Object.values(CARDS).filter((d) => d.faction === 'dragon').length, 70);
  for (const row of DRAGON) {
    const id = idOfRow(row);
    const def = CARDS[id];
    assert.ok(def, `${row.name}（${id}）がない`);
    assert.equal(def.name, row.name, id);
    assert.equal(def.rarity, row.rarity, id);
    assert.equal(def.faction, 'dragon', id);
    assert.equal(def.faction, FACTION_IDS[row.faction]);
    if (row.status === '新規案' && (def.kind === 'weapon' || def.kind === 'spell') && Object.hasOwn(ELEMENT_IDS, row.attribute)) assert.equal(def.element ?? null, ELEMENT_IDS[row.attribute], `${id} の属性`);
    if (row.status === '新規案' && (def.kind === 'soldier' || row.attribute.includes('・'))) assert.equal(def.element, undefined, `${id} は属性を持たない`);
    if (row.next_name) assert.equal(def.fuseTo, idOfRow(DRAGON.find((r) => r.name === row.next_name)), `${id} の合成先（台帳：${row.next_name}）`);
    else assert.ok(def.fuseTo == null, `${id} は合成先なし`);
  }
});

test('既存の11枚（竜騎士・火の魔法5・雷の魔法5）は、台帳と名前・陣営・レアリティ・合成先が一致し、効果・数値は今のまま（B4 では1文字も変えていない）', () => {
  const ids = DRAGON.filter((r) => r.status === '既存').map(idOfRow).sort();
  assert.deepEqual(ids, [...EXISTING_IDS].sort());
  for (const id of ids) assert.equal(CARDS[id].factionOnly, undefined, `${id} は新規ではない`);
  assert.deepEqual(
    Object.fromEntries(ids.map((id) => [id, [CARDS[id].kind, CARDS[id].effect ?? null, CARDS[id].amount ?? CARDS[id].hp]])),
    {
      dragonKnight: ['soldier', null, 10],
      fireball: ['spell', 'damageEnemyCastle', 5], inferno: ['spell', 'damageEnemyCastle', 9], meteor: ['spell', 'damageEnemyCastle', 14], starfall: ['spell', 'damageEnemyCastle', 19], apocalypse: ['spell', 'damageEnemyCastle', 25],
      bolt: ['spell', 'damageEnemySoldiers', 2], thunder: ['spell', 'damageEnemySoldiers', 3], bigThunder: ['spell', 'damageEnemySoldiers', 5], raijin: ['spell', 'damageEnemySoldiers', 8], judgment: ['spell', 'damageEnemySoldiers', 14],
    },
  );
  assert.deepEqual([CARDS.dragonKnight.hp, CARDS.dragonKnight.attack, CARDS.dragonKnight.speed], [10, 10, 5]);
  // 竜騎士へは台帳の竜騎将（B4 の新規）から合成する（これまでは合成してくる前の段がなかった）
  assert.equal(CARDS.dragon_rider_epic.fuseTo, 'dragonKnight');
  assert.deepEqual(Object.entries(CARDS).filter(([, d]) => d.fuseTo === 'dragonKnight').map(([id]) => id), ['dragon_rider_epic']);
});

test('取り込み前の290枚（B3 まで）は1文字も変わっていない（B4 は末尾に足しただけ。付けかえなし）', () => {
  const before = Object.fromEntries(Object.entries(CARDS).filter(([id]) => !B4_NEW.includes(id)).map(([id, d]) => [id, { ...d }]));
  assert.equal(Object.keys(before).length, 290);
  assert.equal(createHash('sha256').update(JSON.stringify(before)).digest('hex'), '0d60b4fed7a15c59f53efdd4c02d3240fcf432e4101417b43cbce33d7467e6f6');
  assert.equal(Object.keys(CARDS).length, 349);
  // 人間が決めた過去の付けかえは、そのまま
  assert.equal(CARDS.paladin.fuseTo, 'king_cavalry_legendary');
  assert.equal(CARDS.lifeSteal.fuseTo, 'demon_drain_epic');
  assert.equal(CARDS.flameSword.fuseTo, 'forest_fire_sword_uncommon');
});

test('陣営なしの山札は B4 の前後で同じシードなら同じ並び（B4 の新規59枚を取り除いても変わらない）。ゲーム開始時の手札・山札も同じ', () => {
  const legacy = Object.fromEntries(Object.entries(CARDS).filter(([id]) => !B4_NEW.includes(id)));
  for (const seed of [1, 2, 9, 33]) {
    assert.deepEqual(sampleDeckTypes(CARDS, rarities, 300, seededRng(seed)), sampleDeckTypes(legacy, rarities, 300, seededRng(seed)));
  }
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  for (const seed of [5, 6]) {
    const g1 = new Game({ cards: CARDS, rules, rarities, rng: seededRng(seed) });
    const g2 = new Game({ cards: legacy, rules, rarities, rng: seededRng(seed) });
    const ids = (g) => [...g.pileOf('p1').deck, ...g.players.p1.hand, ...g.players.p2.hand].map((c) => `${c.cardId}:${c.type}`);
    assert.deepEqual(ids(g1), ids(g2));
  }
});

test('ID・名前の衝突がない。新しいIDは chain_id_rarity。生成スクリプトは冪等で、衝突したら止まる', () => {
  const names = Object.values(CARDS).map((d) => d.name);
  assert.equal(new Set(names).size, names.length, '名前の重複');
  for (const id of B4_NEW) assert.match(id, /^[a-z_]+_(common|uncommon|rare|epic|legendary)$/);
  const shopText = readFileSync(join(ROOT, 'data', 'shop.json'), 'utf8');
  const cardsText = readFileSync(join(ROOT, 'data', 'cards.json'), 'utf8');
  const out = buildAll({ ledger: LEDGER, cards: JSON.parse(cardsText), shop: JSON.parse(shopText) });
  assert.equal(formatCards(out.cards), cardsText);
  assert.equal(`${JSON.stringify(out.shop, null, 2)}\n`, shopText);
  assert.equal(out.storiesJs, readFileSync(join(ROOT, 'js', 'ui', 'stories-factions.js'), 'utf8'));
  assert.equal(out.table, readFileSync(join(ROOT, 'docs', 'four-factions', 'import', 'table.md'), 'utf8'));
  assert.equal(out.plan.length, 295, '台帳の295行すべてが対応表にある');
  const clash = JSON.parse(cardsText);
  delete clash.dragonborn_common;
  clash.dragonborn_common = { ...CARDS.infantry };
  assert.throws(() => buildAll({ ledger: LEDGER, cards: clash, shop: JSON.parse(shopText) }), /ぶつかります/);
});

test('implemented：竜人5・武器10＝15枚が true、竜騎兵・竜術師・炎竜・雷竜・ブレス・竜威覚醒・城防御・兵士防御・回復＝44枚が false（理由・effectPlan つき）', () => {
  const falses = B4_NEW.filter((id) => CARDS[id].implemented === false).sort();
  const trues = B4_NEW.filter((id) => CARDS[id].implemented === true).sort();
  assert.deepEqual(falses, FALSES);
  assert.deepEqual(trues, TRUES);
  assert.equal(falses.length, 44);
  assert.equal(trues.length, 15);
  for (const id of falses) {
    assert.equal(CARDS[id].effect, undefined, `${id} に効果はまだない`);
    assert.ok(CARDS[id].effectPlan, `${id} の effectPlan`);
    assert.ok(CARDS[id].implementationNote, `${id} の implementationNote`);
    assert.ok(CARDS[id].description.startsWith('【準備中】'), id);
  }
  for (const id of B4_NEW) { assert.equal(CARDS[id].factionOnly, true); assert.equal(CARDS[id].count, 0); }
});

// ================= 引き当て・陣営モード =================

test('陣営なしのモード：B4 の新規カードは、山札・ドローの引き当て・入手券・魔物のごほうびに出ない。false はデッキ編成にも入れられない', () => {
  const rng = seededRng(22);
  assert.equal(sampleDeckTypes(CARDS, rarities, 4000, rng).filter((t) => B4_NEW.includes(t)).length, 0);
  for (let i = 0; i < 1500; i++) assert.ok(!B4_NEW.includes(sampleType(CARDS, rarities, rng, { from: 'rare', multiplier: 4 })));
  for (const r of ORDER) for (let i = 0; i < 300; i++) assert.ok(!B4_NEW.includes(sampleTypeOfRarity(CARDS, r, rng)));
  const rates = dropRates(CARDS, rarities);
  for (const id of B4_NEW) assert.equal(rates[id], 0, id);
  for (const id of B4_NEW) assert.equal(isDeckable(CARDS[id]), CARDS[id].implemented !== false, id);
  for (const id of B4_NEW) assert.equal(isDrawable(CARDS[id]), false, id);
  assert.equal(isDrawable(CARDS.dragonborn_common, true), true);
  assert.equal(isDrawable(CARDS.fire_dragon_common, true), false);
});

test('竜族の陣営モード：候補は 竜族＋共通 の implemented: true だけ。B4 の true の15枚が入り、false の44枚は出ない（複数シード・全経路）', () => {
  const pool = factionPool(CARDS, 'dragon');
  for (const id of B4_NEW) assert.equal(pool.has(id), CARDS[id].implemented !== false, id);
  for (const t of pool) {
    assert.ok(['dragon', 'common'].includes(CARDS[t].faction), t);
    assert.notEqual(CARDS[t].implemented, false, t);
  }
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = new Game({ cards: CARDS, rules, rarities, factions, rng: seededRng(seed), setup: { faction: 'dragon' } });
    const pile = g.pileOf('p1');
    for (const x of [...pile.deck, ...pile.discard, ...g.players.p1.hand, ...g.players.p2.hand]) {
      assert.ok(isLegalForFaction(CARDS[x.type], 'dragon'), `${seed}: ${x.type}`);
      assert.notEqual(CARDS[x.type].implemented, false, x.type);
      seen.add(x.type);
    }
  }
  for (const t of ['dragonborn_common', 'dragon_fire_weapon_common', 'dragon_lightning_weapon_common', 'fireball', 'bolt']) assert.ok(seen.has(t), `${t} が山札に入る`);
  for (const id of FALSES) {
    assert.equal(pool.has(id), false, `${id} は候補に出ない`);
    assert.equal(isDrawable(CARDS[id], true), false, id);
  }
  for (let seed = 1; seed <= 20; seed++) for (const t of sampleDeckTypes(CARDS, rarities, 300, seededRng(seed), pool)) assert.equal(FALSES.includes(t), false, `${seed}: ${t}`);
  const rng = seededRng(9);
  for (const r of ORDER) for (let i = 0; i < 200; i++) assert.notEqual(CARDS[sampleTypeOfRarity(CARDS, r, rng, pool)].implemented, false);
});

test('B4 は王国・森・魔族の陣営モードの候補を変えない', () => {
  for (const f of ['kingdom', 'forest', 'demon']) {
    const pool = factionPool(CARDS, f);
    for (const id of B4_NEW) assert.equal(pool.has(id), false, `${f}: ${id}`);
  }
});

// ================= 効果（実際に動かす） =================

function newGame(rules = {}) {
  const cards = { ...CARDS, post: { name: '杭', kind: 'soldier', hp: 100, attack: 1, speed: 1, count: 1, rarity: 'common', fuseTo: null, weight: 0 } };
  const game = new Game({ cards, rules: { ...loadJson('rules.json'), ...PLAIN_START, laneLength: 5, laneCount: 3, defenseReaction: false, ...rules }, reactions, rarities, rng: seededRng(1) });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  return { game, log };
}
function play(game, type, target) {
  const p = game.players[game.currentPlayer];
  p.playedThisTurn = false; p.soldiersPlayedThisTurn = 0; p.mp = 30;
  game.debugSetHand(p.id, [type]);
  const r = game.playCard(p.hand[0].cardId, target);
  assert.equal(r.ok, true, `${type}: ${r.reason}`);
  return p.soldiers.at(-1);
}
function pass(game) {
  game.endTurn();
  if (game.phase === 'discard') {
    const me = game.currentPlayer;
    const hand = game.getState(me).players[me].hand;
    game.discard(hand.slice(0, game.discardCount ?? hand.length).map((c) => c.cardId));
  }
}
const lanes = (game) => game.getState('p1').roads.map((r) => r.roadId);

test('竜人（竜人の新兵〜竜帝近衛）：進む重装前衛。出して進軍し、相手の城に 攻撃力×2 のダメージ。王国の同レアの兵士とは HP と攻撃の差し引きが逆（上位互換・下位互換にならない）', () => {
  const STATS = { common: [6, 4, 2], uncommon: [6, 6, 2], rare: [10, 7, 2], epic: [12, 10, 2], legendary: [15, 13, 3] };
  const KINGDOM = { common: 'infantry', uncommon: 'spearman', rare: 'heavy', epic: 'giant', legendary: 'hero' };
  const UNDEAD = { common: 'demon_undead_common', uncommon: 'demon_undead_uncommon', rare: 'demon_undead_rare', epic: 'demon_undead_epic', legendary: 'demon_undead_legendary' };
  for (const [r, [hp, atk, speed]] of Object.entries(STATS)) {
    const id = `dragonborn_${r}`;
    assert.equal(CARDS[id].role, undefined, '進む兵士');
    // 王国・魔族の同レアと、HP・攻撃の少なくとも片方が勝ち、もう片方が負ける（どれにも完全に勝たず、完全に負けない）
    for (const other of [CARDS[KINGDOM[r]], CARDS[UNDEAD[r]]]) {
      const better = [hp > other.hp, atk > other.attack, speed > other.speed].filter(Boolean).length;
      const worse = [hp < other.hp, atk < other.attack, speed < other.speed].filter(Boolean).length;
      assert.ok(better >= 1 && worse >= 1, `${id} は ${other.name} の上位互換でも下位互換でもない`);
    }
    const { game, log } = newGame({ monsterSpawnChance: 0 });
    const s = play(game, id, { playerId: 'p2', roadId: lanes(game)[2] });
    assert.equal(s.hp, hp); assert.equal(game.attackOf(s), atk); assert.equal(s.speed ?? CARDS[id].speed, speed);
    const before = game.players.p2.castle.hp;
    for (let i = 0; i < 12 && !ofType(log, 'castleDamaged').some((e) => e.source?.soldierId === s.soldierId); i++) { pass(game); pass(game); }
    const dmg = ofType(log, 'castleDamaged').find((e) => e.source?.soldierId === s.soldierId);
    assert.ok(dmg, `${id} が城に着いた`);
    assert.equal(dmg.amount, atk * loadJson('rules.json').soldierCastleDamageMultiplier);
    assert.ok(game.players.p2.castle.hp < before);
  }
});

test('竜族の武器10枚：攻撃補正 +1/+2/+4/+6/+9 と属性（竜牙剣系＝火・雷牙槍系＝雷）が実際に付く', () => {
  const BONUS = [1, 2, 4, 6, 9];
  for (const [chain, el] of [['dragon_fire_weapon', 'fire'], ['dragon_lightning_weapon', 'thunder']]) {
    ORDER.forEach((r, i) => {
      const id = `${chain}_${r}`;
      assert.equal(CARDS[id].attackBonus, BONUS[i]);
      assert.equal(CARDS[id].element, el);
      const { game, log } = newGame();
      const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
      play(game, id, { soldierId: mine.soldierId });
      const e = ofType(log, 'weaponEquipped').at(-1);
      assert.equal(e.type, id);
      assert.equal(e.attack, 1 + BONUS[i], `${id} の攻撃力`);
      assert.equal(e.element, el);
      assert.equal(mine.element, el);
    });
  }
});

test('既存の火・雷の魔法（竜族の既存10枚）は、今までどおり出せる（火＝城に、雷＝相手の兵士に）', () => {
  const { game, log } = newGame();
  const foe = game.players.p2.castle.hp;
  play(game, 'meteor', { playerId: 'p2' });
  assert.equal(ofType(log, 'castleDamaged').at(-1).amount, 14);
  assert.equal(game.players.p2.castle.hp, foe - 14);
  const g2 = newGame();
  g2.game.endTurn();
  const target = play(g2.game, 'post', { playerId: 'p1', roadId: g2.game.getState('p2').roads[0].roadId });
  g2.game.endTurn();
  play(g2.game, 'bigThunder', { playerId: 'p2' });
  assert.ok(ofType(g2.log, 'soldierDamaged').some((e) => e.soldierId === target.soldierId && e.amount === 5));
});

test('implemented: false（竜騎兵・竜術師・炎竜・雷竜・ブレス・竜威覚醒・城防御・兵士防御・回復）は、手札に来ても出せない・合成できない', () => {
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const types = ['dragon_rider_common', 'dragon_mage_common', 'fire_dragon_common', 'lightning_dragon_common', 'dragon_breath_common', 'dragon_awakening_common', 'dragon_wall_common', 'dragon_armor_common', 'dragon_regen_common'];
  const g = new Game({ cards: CARDS, rules, rarities, rng: seededRng(2) });
  g.debugSetHand('p1', [...types, 'dragon_regen_common']);
  g.start();
  const hand = g.players.p1.hand.map((x) => x.cardId).slice(0, types.length + 1);
  for (const c of hand) assert.equal(g.canPlayCard(c).reason, 'このカードの効果はまだありません');
  assert.equal(g.canFuse(hand[8], hand.at(-1)).reason, 'このカードの効果はまだありません');
  assert.equal(g.playCard(hand[0]).ok, false);
});

// ================= 合成 =================

function fuseOnce(type, other = type) {
  const { game, log } = newGame();
  game.debugSetHand('p1', [type, other]);
  const [a, b] = game.players.p1.hand.map((x) => x.cardId);
  const r = game.fuse(a, b);
  assert.equal(r.ok, true, `${type}: ${r.reason}`);
  return ofType(log, 'cardsFused').at(-1).to;
}

test('合成の系統：B4 の各系統が コモンから レジェンドまで途切れず、すべて竜族帝国の中（竜騎兵は 竜騎将 → 竜騎士、炎竜と雷竜は別ルート）', () => {
  const chain = (id) => { const out = [id]; while (typeof CARDS[out.at(-1)].fuseTo === 'string') out.push(CARDS[out.at(-1)].fuseTo); return out; };
  const starts = ['dragonborn', 'dragon_rider', 'dragon_mage', 'fire_dragon', 'lightning_dragon', 'dragon_fire_weapon', 'dragon_lightning_weapon', 'dragon_breath', 'dragon_awakening', 'dragon_wall', 'dragon_armor', 'dragon_regen'].map((s) => `${s}_common`);
  for (const s of [...starts, 'fireball', 'bolt']) {
    const c = chain(s);
    assert.deepEqual(c.map((id) => CARDS[id].rarity), ORDER, `${s}: ${c.join(' → ')}`);
    for (const id of c) assert.equal(CARDS[id].faction, 'dragon', `${s} の系統の ${id}`);
  }
  assert.deepEqual(chain('dragon_rider_common').slice(-2), ['dragon_rider_epic', 'dragonKnight']);
  // 炎竜系と雷竜系は完全に別（途中で交わらない）
  const fire = chain('fire_dragon_common'); const lightning = chain('lightning_dragon_common');
  assert.equal(fire.filter((id) => lightning.includes(id)).length, 0);
  // 実際の合成（implemented: true の系統）
  assert.equal(fuseOnce('dragonborn_common'), 'dragonborn_uncommon');
  assert.equal(fuseOnce('dragon_fire_weapon_epic'), 'dragon_fire_weapon_legendary');
  assert.equal(fuseOnce('dragon_lightning_weapon_common'), 'dragon_lightning_weapon_uncommon');
  assert.equal(fuseOnce('adapt', 'dragon_lightning_weapon_uncommon'), 'dragon_lightning_weapon_rare');
});

test('スキン・ストーリー：新しい兵士・魔法にはスキン、B4 の新規59枚すべてにストーリー', async () => {
  const shop = loadJson('shop.json');
  const { CARD_STORIES } = await import('../js/ui/stories.js');
  for (const id of B4_NEW) {
    assert.ok(CARD_STORIES[id], `${id} のストーリー`);
    const def = CARDS[id];
    if (def.kind === 'soldier') assert.equal(shop.items[`skin_${id}`]?.target, id);
    if (def.kind === 'spell') assert.equal(shop.items[`fxskin_${id}`]?.target, id);
  }
});
