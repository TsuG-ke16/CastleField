// ゲーム全体の進行。山札（2人共通）・ターン順・カード効果・勝敗を管理する。
//
// - DOM もファイルも使わない。cards.json / rules.json の中身と乱数は外から受け取る
//     const game = new Game({ cards, rules, rng });
// - 何が起きたかは game.on(type, handler) で受け取る（同期的に、起きた順に発行）
// - 不正な操作は例外を投げず { ok: false, reason } を返す。成功したら { ok: true }
//
// 流れ:
//   new Game() … phase "ready"。初期手札を配った状態（イベントは出ない）
//   start()    … p1 のターン1を始める（turnStarted → ドロー → 進軍）
//
// 何人でも扱えるように作っている（CLAUDE.md「全体の設計」）。
//   - 席順は this.playerOrder。手番はこの順
//   - 道（Road）は、となりの席どうしをつなぐ。2人なら1本
//   - 兵士は roadId（どの道か）と targetId（道の向こうの人）を持つ
//   playCard() … メインでカードを1枚使う（使わなくてもよい）
//   endTurn()  … 手札が上限を超えていたら phase "discard" → discard() で捨てる
//                超えていなければ（または捨て終わったら）次の人のターンが始まる
//   城HPが0以下になった瞬間に phase "gameOver"

import { Card, ELEMENTS, LANE_SCOPE_EFFECTS } from './Card.js';
import { Monster, validateUpgrades } from './Monster.js';
import { Pile, validateCastles, validateDecks, validateRarities, sampleDeckTypes, sampleType, sampleTypeOfRarity, nextRarityWithCards, dropRates, rewardOdds } from './Setup.js';
import { Soldier } from './Soldier.js';
import { Player } from './Player.js';
import { Road } from './Road.js';
import { Castle } from './Castle.js';

/** 2人のときのプレイヤーID（人数は rules.playerCount。3人以上は p3〜p8 が続く） */
export const PLAYER_IDS = ['p1', 'p2'];

/** Game が出すイベントの名前（CLAUDE.md「Gameが出すイベント」の表と同じ） */
export const EVENT_TYPES = [
  'turnStarted',
  'cardDrawn',
  'deckShuffled',
  'cardPlayed',
  'cardsFused',
  'discardRequired',
  'cardDiscarded',
  'soldierDeployed',
  'soldierMoved',
  'soldiersClashed',
  'soldierDamaged',
  'soldierDestroyed',
  'spellCast',
  'castleDamaged',
  'castleHealed',
  'weaponEquipped',
  'shieldAdded',
  'castleArmored',
  'armorExpired',
  'statusApplied',
  'statusCleared',
  'roundStarted',
  'monsterAppeared',
  'monsterAttackedCastle',
  'monsterClashed',
  'monsterDamaged',
  'monsterDefeated',
  'coinsChanged',
  'upgradeBought',
  'soldierBuffed',
  'playerEliminated',
  'roadClosed',
  'roadOpened',
  'defenseRequested',
  'defenseEnded',
  'spellReflected',
  'soldierDecoyed',
  'cardStolen',
  'spiritSummoned',
  'spiritTriggered',
  'spiritEnded',
  'soldierShot',
  'gameOver',
];

/** 属性の強い・弱い：キーの属性は、値の属性に強い（水は火に強い、火は風に強い、風は土に強い、土は水に強い） */
export const ELEMENT_BEATS = { water: 'fire', fire: 'wind', wind: 'earth', earth: 'water' };

/** rules.json に必要な項目と、許される最小値 */
const RULE_KEYS = {
  castleMaxHp: 1,
  initialHand: 0,
  drawPerTurn: 0,
  firstTurnDraw: 0,
  maxHand: 0,
  laneLength: 1,
  secondPlayerCastleBonus: 0,
};

/** rules.json の省略できる項目と、省略したときの値 */
const OPTIONAL_RULES = {
  elementBonus: 0, // 属性が強いときに増えるダメージ
  monsterFirstRound: 3, // 魔物が出はじめる周回
  monsterCooldownRounds: 0, // 魔物を倒した道に、次の魔物が出ない周回の数
  maxRounds: 0, // 周回の上限（0 なら上限なし）
  // 戦いで相手だけが消えたら、残りの歩数を進み続ける（false なら、そのターンはその場で止まる）
  advanceAfterWin: false,
  // 城に着いた兵士が与えるダメージ ＝ 攻撃力 × この値
  soldierCastleDamageMultiplier: 1,
  // 同じ2人の間の道の本数（兵士を出すとき、どの道に出すかを選ぶ）
  laneCount: 1,
  // 攻撃を受けた人が、その場で防御カードを出せる（城に着いた兵士・城に当たる魔法・兵士に当たる魔法）
  defenseReaction: false,
  // 0 より大きいと、毎ターンのドローは「手札がこの枚数になるまで」（drawPerTurn は最低枚数）
  drawUntilHand: 0,
  // レアリティを使うとき、全員共通の山札に入る枚数（排出率で引き当てる）
  deckSize: 100,
  // true なら、毎ターンのドローが「前のターンに出したカードの枚数」以上になる（出した分を引き直す）
  drawPerPlayed: false,
  // 1ターンに出せる兵士の枚数（攻撃の魔法は別に1枚。精霊・コイン・武器・防御は何枚でも）
  soldiersPerTurn: 1,
  // 試合の最初に持っているコインと、自分のターンの始めにもらえるコイン
  initialCoins: 0,
  coinPerTurn: 0,
  // 放置された魔物が城を攻めるたびに、ダメージが増える量（1回目は castleAttack、2回目は +growth、…）
  monsterAttackGrowth: 0,
};
/** 文字列で選ぶ項目と、選べる値（最初の値が省略したときの値） */
const CHOICE_RULES = {
  winCondition: ['firstDestroy', 'lastStanding'],
  castleSpellRange: ['any', 'neighbors'],
  deckMode: ['shared', 'own'],
  // 3人以上の道の形："ring"（となりの席どうし）か "plaza"（真ん中の広場を通って、だれの城へも行ける）。2人ならどちらも同じ
  roadLayout: ['ring', 'plaza'],
  // チーム戦の手番："rotate"（チームを交互に、1回の手番はメンバー1人。A1 → B1 → A2 → B2 …）か
  // "all"（チームの手番でメンバー全員が順に動く。A1 → A2 → B1 → B2 …）
  teamTurns: ['rotate', 'all'],
};
/** 0以上1以下の数（整数でなくてよい）の省略できる項目 */
const OPTIONAL_RATE_RULES = {
  monsterSpawnChance: 0, // 周回の始めに、魔物がいない道ごとに魔物が出る確率
  rewardLuckyChance: 0, // 魔物のごほうびが、1つ上のレアリティになる確率（ラッキー）
  // チーム戦の城HP ＝ 代表の城HP ＋ この割合 × ほかのメンバーの城HPの合計（1 なら人数ぶん、0 なら1人ぶん）
  teamCastleHpShare: 1,
};

/** チームのID（最大4チーム） */
export const TEAM_IDS = ['t1', 't2', 't3', 't4'];
/** 1チームの最大人数 */
export const MAX_TEAM_SIZE = 7;

/** 広場の魔物の roadId */
export const PLAZA = 'plaza';
/** 兵士IDの番号（"s12" → 12）。先に出された兵士ほど小さい */
const soldierNumber = (s) => Number(s.soldierId.slice(1));

const ok = () => ({ ok: true });
const fail = (reason) => ({ ok: false, reason });

export class Game {
  /**
   * @param {object} options
   * @param {object} options.cards data/cards.json の中身
   * @param {object} options.rules data/rules.json の中身
   * @param {() => number} [options.rng] 0以上1未満を返す乱数。省略すると Math.random
   * @param {object} [options.monsters] data/monsters.json の中身。省略すると魔物は出ない
   * @param {object} [options.upgrades] data/upgrades.json の中身。省略すると強化は買えない
   * @param {object} [options.castles] data/castles.json の中身。省略すると城の種類なし
   * @param {object} [options.decks] data/decks.json の中身（deckMode "own" のときに使う）
   * @param {{castles?: string[], decks?: string[]}} [options.setup] 席ごとの城の種類・デッキ
   */
  constructor({ cards, rules, rng = Math.random, monsters = null, upgrades = null, castles = null, decks = null, rarities = null, setup: setupArg = {} } = {}) {
    const setup = setupArg ?? {};
    if (rarities !== null) validateRarities(rarities);
    Card.validateDefinitions(cards, rarities);
    Game.validateRules(rules);
    if (typeof rng !== 'function') throw new Error('rng は 0以上1未満の数を返す関数にしてください');
    if (monsters !== null) {
      Monster.validateDefinitions(monsters, ELEMENTS);
      if (rules.laneLength % 2 === 0) throw new Error('魔物を使うときは、真ん中のマスがひとつに決まるよう rules.json の laneLength を奇数にしてください');
    }
    if (upgrades !== null) validateUpgrades(upgrades);
    if (castles !== null) validateCastles(castles);
    if (decks !== null) validateDecks(decks, cards);

    this.cardDefs = cards;
    this.rarityDefs = rarities;
    this.monsterDefs = monsters;
    this.upgradeDefs = upgrades || {};
    this.rules = {
      ...OPTIONAL_RULES,
      ...OPTIONAL_RATE_RULES,
      ...Object.fromEntries(Object.entries(CHOICE_RULES).map(([k, v]) => [k, v[0]])),
      playerCount: 2,
      ...rules,
    };
    this.castleDefs = castles;
    this.deckDefs = decks;
    this.rng = rng;

    this.nextCardNumber = 1;
    this.nextSoldierNumber = 1;
    this.nextMonsterNumber = 1;
    /** @type {Monster[]} */
    this.monsters = [];
    /** 2人の組（道の pairId）→ この周回より前には魔物が出ない */
    this.monsterCooldown = new Map();
    this.round = 0;
    /** 攻撃を受けた人の防御を待っているとき（phase "defend"）：{ defenderId, attackerId, kind, amount, soldierIds, apply, after } */
    this.pending = null;
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map(EVENT_TYPES.map((type) => [type, new Set()]));

    /** 席順（手番の順） */
    const n = this.rules.playerCount;
    this.playerOrder = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    this.players = {};
    const castleTypes = this.resolveSetupList(setup.castles, castles, this.rules.defaultCastle, '城の種類', 'castles');
    this.playerOrder.forEach((id, seat) => {
      // 後ろの席ほど城HPが少し多い（先攻有利をやわらげるため）
      const castleType = castleTypes ? castleTypes[seat] : null;
      const cdef = castleType ? castles[castleType] : {};
      const maxHp = Math.max(1, this.rules.castleMaxHp + this.seatBonus(seat) + (cdef.hpBonus ?? 0));
      const player = new Player(id, maxHp);
      player.coins = this.rules.initialCoins;
      player.castleType = castleType;
      player.castleDef = cdef;
      player.maxHand = Math.max(0, this.rules.maxHand + (cdef.maxHandBonus ?? 0));
      this.players[id] = player;
    });
    // チーム戦：setup.teams（席ごとのチームID）。チームの城はメンバー全員で1つ（代表＝チームでいちばん前の席の人の城）
    /** @type {Map<string, string>|null} プレイヤーID → チームID */
    this.teamOf = null;
    /** @type {string[]|null} チームの順（代表の席順）。手番はこの順にチームを回す */
    this.teamOrder = null;
    /** @type {Map<string, string[]>} チームID → メンバー（席順） */
    this.teamMembers = new Map();
    /** @type {Map<string, number>} チームID → 最後に手番だったメンバーの番号（members の何番目か） */
    this.teamCursor = new Map();
    if (setup.teams !== undefined) this.setupTeams(setup.teams, castles);

    /** 真ん中の広場を通る道か（城が3つ以上で roadLayout が "plaza" のとき）。広場では道（レーン）は1本 */
    this.plaza = this.rules.roadLayout === 'plaza' && this.aliveSides().length >= 3;
    if (this.plaza) this.rules.laneCount = 1;
    /** @type {Road[]} */
    this.roads = [];
    this.rebuildRoads();

    // 山札：deckMode "shared" は全員で1組、"own" は1人1組（data/decks.json のデッキ）
    // カードIDはシャッフルしたあとの順に振る（IDから種類が分からないように）
    /** @type {Map<string, Pile>} プレイヤーID → その人が使う山札 */
    this.piles = new Map();
    if (this.rules.deckMode === 'own') {
      const deckIds = this.resolveSetupList(setup.decks, decks, this.rules.defaultDeck, 'デッキ', 'decks');
      if (!deckIds) throw new Error('deckMode が "own" のときは decks（data/decks.json）を渡してください');
      this.playerOrder.forEach((id, seat) => {
        const pile = new Pile(id);
        const types = Object.entries(decks[deckIds[seat]].cards).flatMap(([t, k]) => Array(k).fill(t));
        pile.deck = this.shuffle(types).map((type) => this.createCard(type));
        this.players[id].deckId = deckIds[seat];
        this.piles.set(id, pile);
      });
    } else {
      if (setup.decks !== undefined) throw new Error('setup.decks を使うときは、rules.json の deckMode を "own" にしてください');
      const pile = new Pile(null);
      pile.deck = this.shuffle(this.buildDeckTypes()).map((type) => this.createCard(type));
      for (const id of this.playerOrder) this.piles.set(id, pile);
    }

    this.turn = 0;
    this.currentPlayer = this.playerOrder[0];
    this.phase = 'ready';
    this.winner = null;
    this.winnerTeam = null;
    this.discardCount = 0; // phase "discard" のときに捨てる必要がある枚数

    // 初期手札（ゲーム開始前なのでイベントは出さない）
    for (const id of this.playerOrder) {
      const pile = this.piles.get(id);
      for (let i = 0; i < this.rules.initialHand; i++) {
        const card = pile.deck.shift();
        if (!card) break;
        this.players[id].hand.push(card);
      }
    }
  }

  /**
   * チームを作る。teams は席ごとのチームID（"t1"〜"t4"）。2チーム以上・1チーム7人まで。
   * 城HPは、メンバーそれぞれの城HP（castleMaxHp ＋ 自分の城の種類の hpBonus）の合計。席ごとの城ボーナスは使わない。
   * 城の種類のほかの効果（城への魔法・兵士の攻撃・手札の上限）は、メンバーごとに自分が選んだ城のもの。
   */
  setupTeams(teams, castles) {
    const n = this.rules.playerCount;
    if (!Array.isArray(teams) || teams.length !== n) throw new Error(`setup.teams は人数ぶん（${n}個）の配列にしてください`);
    for (const t of teams) if (!TEAM_IDS.includes(t)) throw new Error(`setup.teams：チームは ${TEAM_IDS.join(' / ')} のどれかにしてください`);
    const order = [...new Set(teams)];
    if (order.length < 2) throw new Error('setup.teams：チームは2つ以上にしてください');
    this.teamOf = new Map();
    for (const t of order) {
      const members = this.playerOrder.filter((_, seat) => teams[seat] === t);
      if (members.length > MAX_TEAM_SIZE) throw new Error(`setup.teams：1チームは${MAX_TEAM_SIZE}人までです`);
      this.teamMembers.set(t, members);
      this.teamCursor.set(t, -1);
      for (const id of members) this.teamOf.set(id, t);
      const hpOf = (id) => Math.max(1, this.rules.castleMaxHp + (this.players[id].castleDef.hpBonus ?? 0));
      const others = members.slice(1).reduce((sum, id) => sum + hpOf(id), 0);
      const hp = Math.max(1, Math.round(hpOf(members[0]) + this.rules.teamCastleHpShare * others));
      const leader = this.players[members[0]];
      leader.castle = new Castle(hp);
      for (const id of members) this.players[id].castle = leader.castle;
    }
    this.teamOrder = order;
  }

  /** 城の持ち主（盤面の上の「陣地」）。チーム戦ならチームの代表、そうでなければ本人 */
  side(playerId) {
    if (!this.teamOf) return playerId;
    return this.teamMembers.get(this.teamOf.get(playerId))[0];
  }

  /** まだ負けていない陣地（城の持ち主のID。席順） */
  aliveSides() {
    return [...new Set(this.alivePlayerIds().map((id) => this.side(id)))];
  }

  /** playerId から見た、まだ負けていない相手の陣地（城の持ち主の Player。席順） */
  enemySides(playerId) {
    const me = this.side(playerId);
    return this.aliveSides().filter((id) => id !== me).map((id) => this.players[id]);
  }

  /** 席ごとの城ボーナス */
  seatBonus(seat) {
    const n = this.rules.playerCount;
    if (this.rules.seatCastleBonus) return this.rules.seatCastleBonus[seat];
    if (n === 2) return seat === 1 ? this.rules.secondPlayerCastleBonus : 0;
    return Math.round((this.rules.secondPlayerCastleBonus * seat) / (n - 1));
  }

  /** setup.castles / setup.decks を席ごとの配列にする（defs がなければ null）。間違いは例外 */
  resolveSetupList(list, defs, fallback, label, key) {
    if (!defs) {
      if (list !== undefined) throw new Error(`setup.${key} を使うときは ${key}（data/${key}.json）も渡してください`);
      return null;
    }
    const n = this.rules.playerCount;
    const first = fallback ?? Object.keys(defs)[0];
    const result = list === undefined ? Array(n).fill(first) : list;
    if (!Array.isArray(result) || result.length !== n) throw new Error(`setup.${key} は人数ぶん（${n}個）の配列にしてください`);
    for (const id of result) {
      if (!Object.hasOwn(defs, id)) throw new Error(`setup.${key}：「${id}」という${label}はありません`);
    }
    return result;
  }

  /** その人が使う山札 */
  pileOf(playerId) {
    return this.piles.get(playerId);
  }

  static validateRules(rules) {
    if (!rules || typeof rules !== 'object') throw new Error('rules.json の中身を渡してください');
    for (const key of ['elementBonus', 'monsterFirstRound', 'monsterCooldownRounds', 'maxRounds', 'drawUntilHand', 'initialCoins', 'coinPerTurn', 'monsterAttackGrowth']) {
      const v = rules[key];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
        throw new Error(`rules.json の ${key} は 0 以上の整数にしてください（書かなければ ${OPTIONAL_RULES[key]}）`);
      }
    }
    for (const [key, values] of Object.entries(CHOICE_RULES)) {
      if (rules[key] !== undefined && !values.includes(rules[key])) {
        throw new Error(`rules.json の ${key} は ${values.map((v) => `"${v}"`).join(' / ')} のどれかにしてください`);
      }
    }
    if (rules.playerCount !== undefined && (!Number.isInteger(rules.playerCount) || rules.playerCount < 2 || rules.playerCount > 8)) {
      throw new Error('rules.json の playerCount は 2〜8 の整数にしてください');
    }
    if (rules.seatCastleBonus !== undefined
      && (!Array.isArray(rules.seatCastleBonus) || !rules.seatCastleBonus.every((v) => Number.isInteger(v) && v >= 0)
        || rules.seatCastleBonus.length < (rules.playerCount ?? 2))) {
      throw new Error('rules.json の seatCastleBonus は、人数ぶん以上の0以上の整数の配列にしてください');
    }
    for (const key of Object.keys(OPTIONAL_RATE_RULES)) {
      const v = rules[key];
      if (v !== undefined && (typeof v !== 'number' || !(v >= 0 && v <= 1))) {
        throw new Error(`rules.json の ${key} は 0 以上 1 以下の数にしてください`);
      }
    }
    if (rules.soldiersPerTurn !== undefined && !(Number.isInteger(rules.soldiersPerTurn) && rules.soldiersPerTurn >= 1)) {
      throw new Error('rules.json の soldiersPerTurn は1以上の整数にしてください（書かなければ 1）');
    }
    if (rules.drawPerPlayed !== undefined && typeof rules.drawPerPlayed !== 'boolean') {
      throw new Error('rules.json の drawPerPlayed は true か false にしてください（書かなければ false）');
    }
    if (rules.advanceAfterWin !== undefined && typeof rules.advanceAfterWin !== 'boolean') {
      throw new Error('rules.json の advanceAfterWin は true か false にしてください（書かなければ false）');
    }
    if (rules.defenseReaction !== undefined && typeof rules.defenseReaction !== 'boolean') {
      throw new Error('rules.json の defenseReaction は true か false にしてください（書かなければ false）');
    }
    if (rules.laneCount !== undefined && (!Number.isInteger(rules.laneCount) || rules.laneCount < 1 || rules.laneCount > 5)) {
      throw new Error('rules.json の laneCount は 1〜5 の整数にしてください（書かなければ 1）');
    }
    const m = rules.soldierCastleDamageMultiplier;
    if (m !== undefined && (!Number.isInteger(m) || m < 1)) {
      throw new Error('rules.json の soldierCastleDamageMultiplier は 1 以上の整数にしてください（書かなければ 1）');
    }
    for (const [key, min] of Object.entries(RULE_KEYS)) {
      const v = rules[key];
      if (!Number.isInteger(v) || v < min) {
        throw new Error(`rules.json の ${key} は ${min} 以上の整数にしてください`);
      }
    }
  }

  // ================= イベント =================

  /** イベントを購読する。handler はペイロードのオブジェクトを1つ受け取る */
  on(type, handler) {
    if (!this.listeners.has(type)) return fail(`"${type}" というイベントはありません`);
    if (typeof handler !== 'function') return fail('handler には関数を渡してください');
    this.listeners.get(type).add(handler);
    return ok();
  }

  /** 購読を解除する */
  off(type, handler) {
    if (!this.listeners.has(type)) return fail(`"${type}" というイベントはありません`);
    this.listeners.get(type).delete(handler);
    return ok();
  }

  emit(type, payload) {
    for (const handler of [...this.listeners.get(type)]) {
      try {
        handler(payload);
      } catch (err) {
        // 画面側のエラーでゲームの状態が途中で止まらないようにする
        console.error(`イベント "${type}" の処理中にエラー:`, err);
      }
    }
  }

  // ================= 山札 =================

  createCard(type) {
    const cardId = `c${String(this.nextCardNumber++).padStart(2, '0')}`;
    return new Card(cardId, type, this.cardDefs[type]);
  }

  /**
   * 山札に入るカード種類の並び。
   * rarities を渡したときは、排出率（レアリティの割合 × 同じレアリティ内の weight）で rules.deckSize 枚を引き当てる。
   * 渡さないときは、count 枚ずつ。
   */
  buildDeckTypes() {
    if (this.rarityDefs) return sampleDeckTypes(this.cardDefs, this.rarityDefs, this.rules.deckSize, this.rng);
    const types = [];
    for (const [type, def] of Object.entries(this.cardDefs)) {
      for (let i = 0; i < def.count; i++) types.push(type);
    }
    return types;
  }

  /** Fisher-Yates シャッフル（rng を使うので、rng を固定すれば順番も固定できる） */
  shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  /** count 枚引く。山札が尽きたら捨て札をシャッフルし直す。両方空なら引けたぶんだけ */
  drawCards(player, count) {
    const cardIds = [];
    const pile = this.pileOf(player.id);
    for (let i = 0; i < count; i++) {
      // 運命の祈り：山札からではなく、排出率を上げて引き当てる
      if (player.luck && this.rarityDefs) {
        const type = sampleType(this.cardDefs, this.rarityDefs, this.rng, { from: player.luck.from, multiplier: player.luck.boost });
        const lucky = this.createCard(type);
        player.hand.push(lucky);
        cardIds.push(lucky.cardId);
        if (--player.luck.draws <= 0) player.luck = null;
        continue;
      }
      if (pile.deck.length === 0) {
        if (pile.discard.length === 0) break;
        pile.deck = this.shuffle(pile.discard);
        pile.discard = [];
        this.emit('deckShuffled', { deckCount: pile.deck.length, playerId: pile.owner });
      }
      const card = pile.deck.shift();
      player.hand.push(card);
      cardIds.push(card.cardId);
    }
    if (cardIds.length > 0) this.emit('cardDrawn', { playerId: player.id, cardIds });
  }

  // ================= 席と道 =================

  /** まだ負けていないプレイヤーのID（席順） */
  alivePlayerIds() {
    return this.playerOrder.filter((id) => !this.players[id].eliminated);
  }

  /** playerId から見た、まだ負けていない相手全員（席順） */
  opponentsOf(playerId) {
    const me = this.side(playerId);
    return this.alivePlayerIds().filter((id) => this.side(id) !== me).map((id) => this.players[id]);
  }

  /** playerId と道でつながっている相手（となりの席） */
  neighborsOf(playerId) {
    const me = this.side(playerId);
    const ids = new Set(this.roads.filter((r) => r.has(me)).map((r) => r.otherSide(me)));
    return [...ids].map((id) => this.players[id]);
  }

  /** 2人の間の道（なければ null）。道が何本かあるときは最初の1本 */
  roadBetween(a, b) {
    const [x, y] = [this.side(a), this.side(b)];
    return this.roads.find((r) => r.has(x) && r.has(y)) || null;
  }

  /** 2人の間の道すべて（rules.laneCount 本。つながっていなければ空） */
  roadsBetween(a, b) {
    const [x, y] = [this.side(a), this.side(b)];
    return this.roads.filter((r) => r.has(x) && r.has(y));
  }

  /** そのカードが「選んだ1レーンだけに効く」魔法か（道が1本のときはふつうの魔法と同じ） */
  isLaneScoped(def) {
    return def.scope === 'lane' && this.rules.laneCount > 1;
  }

  findRoad(roadId) {
    return this.roads.find((r) => r.roadId === roadId) || null;
  }

  /**
   * まだ負けていない人を輪にならべ、となりどうしを道でつなぐ。2人なら1本。今ある道はそのまま残す。
   * 負けた人が出たとき（lastStanding）は eliminate() から呼び、なくなった道の兵士・魔物・トラップは eliminate() が消す。
   * @returns {{opened: Road[], closed: Road[]}}
   */
  rebuildRoads() {
    const alive = this.aliveSides();
    const pairs = [];
    if (this.plaza) {
      // 広場：だれの城へも行けるので、まだ負けていない2人ずつの組すべてに「通り道」がある（広場で重なっている）
      for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) pairs.push([alive[i], alive[j]]);
    } else if (alive.length === 2) pairs.push([alive[0], alive[1]]);
    else if (alive.length > 2) {
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i];
        const b = alive[(i + 1) % alive.length];
        // 道のIDは席順が前の人を先に
        pairs.push(this.playerOrder.indexOf(a) < this.playerOrder.indexOf(b) ? [a, b] : [b, a]);
      }
    }
    const opened = [];
    const { laneCount } = this.rules;
    const next = pairs.flatMap(([a, b]) =>
      Array.from({ length: laneCount }, (_, lane) => {
        const existing = this.roads.find((r) => r.players[0] === a && r.players[1] === b && r.lane === lane);
        if (existing) return existing;
        const road = new Road(a, b, this.rules.laneLength, lane, laneCount);
        opened.push(road);
        return road;
      }),
    );
    const closed = this.roads.filter((r) => !next.includes(r));
    this.roads = next;
    return { opened, closed };
  }

  /** 席順で次の手番の人（負けた人は飛ばす） */
  nextPlayerAfter(playerId) {
    if (this.teamOrder) {
      // チーム戦：チームを順に回す（A → B → A …）。チームの中は、前に手番だった人の次のメンバー
      const teams = this.aliveTeams();
      const mine = this.teamOf.get(playerId);
      // "all"：チームのメンバーがまだ残っていれば、同じチームの次の人
      if (this.rules.teamTurns === 'all') {
        const members = this.teamMembers.get(mine);
        const rest = members.slice(members.indexOf(playerId) + 1).find((id) => !this.players[id].eliminated);
        if (rest) return rest;
        this.teamCursor.set(mine, -1);
      }
      const at = teams.indexOf(mine);
      const team = teams[(at + 1) % teams.length];
      return this.nextMemberOf(team);
    }
    const n = this.playerOrder.length;
    const start = this.playerOrder.indexOf(playerId);
    for (let i = 1; i <= n; i++) {
      const id = this.playerOrder[(start + i) % n];
      if (!this.players[id].eliminated) return id;
    }
    return playerId;
  }

  /** まだ負けていないメンバーがいるチーム（チームの順） */
  aliveTeams() {
    return this.teamOrder.filter((t) => this.teamMembers.get(t).some((id) => !this.players[id].eliminated));
  }

  /** そのチームで、次に手番になるメンバー（前に手番だった人の次。負けた人は飛ばす） */
  nextMemberOf(team) {
    const members = this.teamMembers.get(team);
    const last = this.teamCursor.get(team);
    for (let i = 1; i <= members.length; i++) {
      const id = members[(last + i) % members.length];
      if (!this.players[id].eliminated) return id;
    }
    return members[0];
  }

  // ================= ターン進行 =================

  /** ゲームを始める（席順の最初の人のターン1）。UI が on() で購読してから呼ぶ */
  start() {
    if (this.phase !== 'ready') return fail('ゲームはもう始まっています');
    this.beginTurn(this.playerOrder[0]);
    return ok();
  }

  /** ターン開始：（城壁が消える）→ ドロー → 進軍 → メインへ */
  beginTurn(playerId, { continueRound = false } = {}) {
    // 周回の上限：その周回を全員が終えたら、城HPの割合で決着
    // continueRound：周回の始めに手番の人が抜けて、同じ周回のまま次の人に回すとき
    // チーム戦は、最初のチームの手番が来るたびに周回が変わる
    const isRoundStart = !continueRound && (this.teamOrder
      ? this.teamOf.get(playerId) === this.aliveTeams()[0] && (this.rules.teamTurns === 'rotate' || this.teamCursor.get(this.teamOf.get(playerId)) === -1)
      : playerId === this.alivePlayerIds()[0]);
    if (isRoundStart && this.rules.maxRounds > 0 && this.round >= this.rules.maxRounds) {
      this.finishByRoundLimit();
      return;
    }
    const player = this.players[playerId];
    this.currentPlayer = playerId;
    if (this.teamOrder) this.teamCursor.set(this.teamOf.get(playerId), this.teamMembers.get(this.teamOf.get(playerId)).indexOf(playerId));
    this.turn += 1;
    this.phase = 'main';
    player.playedThisTurn = false;
    player.soldiersPlayedThisTurn = 0;
    const playedLastTurn = player.cardsPlayedThisTurn;
    player.cardsPlayedThisTurn = 0;
    this.emit('turnStarted', { playerId, turn: this.turn });

    // 周回の始め（席順の最初の人のターン）：魔物が城を攻める → 魔物が出る
    if (isRoundStart) {
      this.round += 1;
      this.emit('roundStarted', { round: this.round });
      this.monstersAttackCastles();
      // 魔物に城を落とされたら、そこで止める（魔物の出現・ドロー・進軍はしない）
      if (this.checkGameOver()) return;
      // lastStanding（3人以上・試作）で手番の人が魔物に落とされて抜けたら、次の人の番にする
      if (player.eliminated) {
        this.spawnMonsters();
        this.beginTurn(this.nextPlayerAfter(playerId), { continueRound: true });
        return;
      }
      this.spawnMonsters();
    }

    // 城壁は、自分の次のターンの始めに消える
    if (player.armor > 0) {
      player.armor = 0;
      this.emit('armorExpired', { playerId });
    }

    // コイン：自分のターンの始めに coinPerTurn 枚もらえる
    if (this.rules.coinPerTurn > 0) this.changeCoins(player, this.rules.coinPerTurn, 'turn');

    // 1. ドロー（先攻の最初のターンだけ firstTurnDraw 枚。ほかは毎ターン drawPerTurn 枚に固定）
    const baseDraw = this.turn === 1 ? this.rules.firstTurnDraw : this.rules.drawPerTurn;
    const drawCount = Math.max(baseDraw, this.rules.drawUntilHand - player.hand.length, this.rules.drawPerPlayed ? playedLastTurn : 0);
    this.drawCards(player, drawCount);
    if (this.triggerSpirit(player)) return;

    // 2. 進軍
    this.advanceSoldiers(player);
  }

  /**
   * 進軍：出した順に1体ずつ、1マスずつ進める。
   * 1体ごとに：毒のダメージ →（凍結なら休む）→ 動く。
   * 1マス進むごとに、トラップ → 「同じマスか1つ先のマス」の相手の兵士 の順に確かめる。
   * 戦ったら（相手だけが消えても）そのターンはその場で止まる。トラップにかかっても止まる。
   * 城に着いたら 移動 → 城にダメージ → 消える。城が落ちたらその場でゲームを止める。
   */
  advanceSoldiers(player, queue = [...player.soldiers]) {
    const { laneLength } = this.rules;

    while (queue.length > 0) {
      const soldier = queue.shift();
      if (!player.soldiers.includes(soldier)) continue; // 念のため
      const enemy = this.players[soldier.targetId];
      const road = this.findRoad(soldier.roadId);

      // 毒（盾は効かない）
      if (soldier.poison) {
        const { amount } = soldier.poison;
        soldier.takeDamage(amount, { ignoreShield: true });
        this.emit('soldierDamaged', {
          playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: 'poison', blocked: 0,
        });
        soldier.poison.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.poison.turns <= 0) {
          soldier.poison = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'poison' });
        }
      }
      // 凍結：この進軍は休む
      if (soldier.frozen > 0) {
        soldier.frozen -= 1;
        if (soldier.frozen === 0) {
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'frozen' });
        }
        // 凍った弓兵・魔法使いは撃てないが、ターンは過ぎる
        if (soldier.role !== 'melee') this.tickRanged(player, soldier);
        continue;
      }

      // 弓兵・魔法使いは動かずに撃つ
      if (soldier.role !== 'melee') {
        if (this.shoot(player, soldier)) return;
        continue;
      }

      let steps = 0;
      let reached = false;
      let monster = null;
      // advanceAfterWin のときは、戦って相手だけが消えたら、残りの歩数でもう一度進む
      for (;;) {
        const from = soldier.position;
        let opponent = this.findClashTarget(soldier, player);
        monster = opponent ? null : this.findMonsterInRange(soldier, player);
        let moved = 0;
        const speed = this.speedOf(player, soldier);
      while (!opponent && !monster && steps < speed) {
          soldier.moveForward();
          steps += 1;
          moved += 1;
          if (soldier.hasReachedCastle(laneLength)) break;
          opponent = this.findClashTarget(soldier, player);
          if (!opponent) monster = this.findMonsterInRange(soldier, player);
        }
        reached = soldier.hasReachedCastle(laneLength);
        if (moved > 0) {
          // 城に着いた兵士は城の位置（laneLength）まで動いたことにする
          this.emit('soldierMoved', {
            playerId: player.id,
            soldierId: soldier.soldierId,
            roadId: road.roadId,
            from,
            to: reached ? laneLength : soldier.position,
          });
        }
        if (!opponent) break;
        this.fight(player, soldier, opponent.owner, opponent.soldier);
        const keepGoing = this.rules.advanceAfterWin && opponent.soldier.isDead && !soldier.isDead && steps < speed;
        if (!keepGoing) break;
      }
      if (monster) {
        this.fightMonster(player, soldier, monster);
        continue;
      }
      if (!reached) continue;

      const damage = soldier.attack * this.rules.soldierCastleDamageMultiplier;
      const hit = () => {
        this.damageCastle(enemy, damage, { kind: 'soldier', soldierId: soldier.soldierId });
        player.removeSoldier(soldier.soldierId);
        this.emit('soldierDestroyed', {
          playerId: player.id,
          soldierId: soldier.soldierId,
          reason: 'reachedCastle',
        });
      };
      // 城を攻められる人は、ここで防御カード（城壁など）を出せる。待つときは、返事が来てから続きを進める
      const waiting = this.requestDefense(
        {
          kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'soldier', soldierId: soldier.soldierId,
          // 身代わり：ダメージを受けずに、兵士だけが消える
          onNullify: () => {
            player.removeSoldier(soldier.soldierId);
            this.emit('soldierDestroyed', { playerId: player.id, soldierId: soldier.soldierId, reason: 'reachedCastle' });
          },
        },
        hit,
        () => {
          if (!this.checkGameOver()) this.advanceSoldiers(player, queue);
        },
      );
      if (waiting) return;

      // 城が落ちた瞬間にゲームを止める（残りの兵士は動かさない）
      if (this.checkGameOver()) return;
    }
  }

  /** 城にダメージ。城壁が先に受ける。castleDamaged を出す */
  damageCastle(owner, amount, source) {
    amount = this.reduceDamage(owner, amount);
    const blocked = Math.min(owner.armor, amount);
    owner.armor -= blocked;
    owner.castle.takeDamage(amount - blocked);
    this.emit('castleDamaged', { playerId: owner.id, amount, blocked, hp: owner.castle.hp, source });
  }

  /** 兵士にダメージ（盾が先に受ける）。soldierDamaged を出し、HPが0なら消す。消えたら true */
  damageSoldier(owner, soldier, amount, cause) {
    amount = this.reduceDamage(owner, amount);
    const blocked = soldier.takeDamage(amount);
    this.emit('soldierDamaged', {
      playerId: owner.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause, blocked,
    });
    if (!soldier.isDead) return false;
    this.removeSoldier(owner, soldier, 'killed');
    return true;
  }

  removeSoldier(owner, soldier, reason) {
    owner.removeSoldier(soldier.soldierId);
    this.emit('soldierDestroyed', { playerId: owner.id, soldierId: soldier.soldierId, reason });
  }

  /**
   * owner の兵士 soldier の「同じマスか1つ先のマス」にいて、戦う相手の兵士のうち、先に出された1体。
   * いなければ null。見つかったら { owner, soldier }（相手の兵士とその持ち主）。
   *   となりの道（ring）：道の向こうの人の兵士で、同じ道の上にいるもの
   *   広場（plaza）：自分の方に向かってくる兵士（相手が自分の城を狙っている）か、自分が狙っている人の兵士。
   *                  それ以外の人の兵士は関係ないので、同じマスにいても戦わずにすれちがう
   */
  findClashTarget(soldier, owner) {
    const here = soldier.position;
    let best = null;
    for (const c of this.foesOf(soldier, owner)) {
      if (c.q !== here && c.q !== here + 1) continue;
      if (!best || soldierNumber(c.soldier) < soldierNumber(best.soldier)) best = { owner: c.owner, soldier: c.soldier };
    }
    return best;
  }

  /**
   * owner の兵士 soldier が戦う（撃つ）相手の兵士すべてと、その場所（soldier から数えた位置 q）。
   *   となりの道：道の向こうの陣地（チーム戦ならそのチームのメンバー全員）の兵士で、同じ道の上にいるもの
   *   広場：自分の陣地に向かってくる兵士と、自分が狙っている陣地の兵士（味方とは戦わない）
   * @returns {{owner: Player, soldier: Soldier, q: number}[]}
   */
  foesOf(soldier, owner) {
    const { laneLength } = this.rules;
    const mine = this.side(owner.id);
    const found = [];
    for (const id of this.alivePlayerIds()) {
      const theirs = this.side(id);
      if (theirs === mine) continue;
      const other = this.players[id];
      for (const e of other.soldiers) {
        let q;
        if (!this.plaza) {
          if (theirs !== soldier.targetId || e.roadId !== soldier.roadId) continue;
          q = laneLength - 1 - e.position; // 相手の兵士の位置を、soldier から数えた位置に直す
        } else {
          if (e.targetId !== mine && soldier.targetId !== theirs) continue;
          q = this.coordOnPath(mine, soldier.targetId, this.placeOf(id, e));
          if (q === null) continue;
        }
        found.push({ owner: other, soldier: e, q });
      }
    }
    return found;
  }

  /**
   * 弓兵・魔法使い：動かずに撃つ。自分のマスから range マス先までの
   *   1. 相手の兵士（いちばん近い1体。同じ近さなら先に出された方）→ 2. 魔物 → 3.（魔法使いだけ）狙った相手の城
   * の順に1つを撃つ。反撃は受けない。撃つ相手がいなければ待つ。どちらでも turnsLeft が1減り、0で帰る（soldierDestroyed の reason は "returned"）。
   * 城が落ちて決着したら true
   */
  shoot(player, soldier) {
    const here = soldier.position;
    const inRange = (q) => q !== null && q >= here && q <= here + soldier.range;
    const foes = this.foesOf(soldier, player).filter((c) => inRange(c.q));
    foes.sort((a, b) => a.q - b.q || soldierNumber(a.soldier) - soldierNumber(b.soldier));
    const shot = { playerId: player.id, soldierId: soldier.soldierId, role: soldier.role };
    let over = false;
    if (foes.length > 0) {
      const { owner, soldier: victim } = foes[0];
      const amount = this.fightDamage(soldier, victim);
      this.emit('soldierShot', { ...shot, target: { kind: 'soldier', playerId: owner.id, soldierId: victim.soldierId }, amount });
      this.damageSoldier(owner, victim, amount, 'shot');
    } else {
      const road = this.findRoad(soldier.roadId);
      const monster = this.monsters.find((m) =>
        inRange(m.roadId === PLAZA ? m.square : m.roadId === soldier.roadId ? road.toPosition(this.side(player.id), m.square) : null));
      if (monster) {
        const amount = this.fightDamage(soldier, monster);
        this.emit('soldierShot', { ...shot, target: { kind: 'monster', monsterId: monster.monsterId }, amount });
        this.damageMonster(monster, amount, { playerId: player.id, soldierId: soldier.soldierId });
        this.defeatMonsterIfDead(monster, player.id);
      } else if (soldier.role === 'mage') {
        const enemy = this.players[soldier.targetId];
        this.emit('soldierShot', { ...shot, target: { kind: 'castle', playerId: enemy.id }, amount: soldier.attack });
        this.damageCastle(enemy, soldier.attack, { kind: 'soldier', soldierId: soldier.soldierId });
        over = this.checkGameOver();
      }
      // 撃つ相手がいないときは、撃たずに待つ（ターンは過ぎる）
    }
    if (over) return true;
    this.tickRanged(player, soldier);
    return false;
  }

  /** 弓兵・魔法使いの残りターンを1減らし、0なら帰る */
  tickRanged(player, soldier) {
    if (!player.soldiers.includes(soldier)) return;
    soldier.turnsLeft -= 1;
    if (soldier.turnsLeft <= 0) this.removeSoldier(player, soldier, 'returned');
  }

  /**
   * 広場のとき、ownerId の兵士がいる場所。{ at: "spoke", playerId, square }（playerId の城から広場への道。
   * square は その城から数えたマス）か { at: "plaza" }。城に着いていれば null
   */
  placeOf(ownerId, soldier) {
    const { laneLength } = this.rules;
    const mid = this.middleSquare();
    const p = soldier.position;
    if (p >= laneLength) return null;
    if (p < mid) return { at: 'spoke', playerId: this.side(ownerId), square: p };
    if (p === mid) return { at: 'plaza' };
    return { at: 'spoke', playerId: soldier.targetId, square: laneLength - 1 - p };
  }

  /** 場所 place を、from の城から to の城への通り道の上の位置（from から数えたマス）に直す。通り道の上になければ null */
  coordOnPath(from, to, place) {
    if (!place) return null;
    if (place.at === 'plaza') return this.middleSquare();
    if (place.playerId === from) return place.square;
    if (place.playerId === to) return this.rules.laneLength - 1 - place.square;
    return null;
  }

  // ================= 魔物 =================

  /** 道の真ん中のマス番号 */
  middleSquare() {
    return Math.floor(this.rules.laneLength / 2);
  }

  /** owner の兵士 soldier の「同じマスか1つ先のマス」にいる魔物（同じ道の上だけ） */
  findMonsterInRange(soldier, owner) {
    const road = this.findRoad(soldier.roadId);
    return (
      this.monsters.find((m) => {
        // 広場の魔物は、どの通り道からも真ん中のマスにいる
        if (m.roadId === PLAZA) return soldier.position === m.square || soldier.position + 1 === m.square;
        if (m.roadId !== road.roadId) return false;
        const q = road.toPosition(this.side(owner.id), m.square);
        return q === soldier.position || q === soldier.position + 1;
      }) || null
    );
  }

  findMonster(monsterId) {
    return this.monsters.find((m) => m.monsterId === monsterId) || null;
  }

  /** 周回の始め：attackIn が0になった魔物が、道の両はしのどちらかの城を攻める（城を落としてもよい。落ちたらそこで止める） */
  monstersAttackCastles() {
    for (const m of [...this.monsters]) {
      m.attackIn -= 1;
      if (m.attackIn > 0) continue;
      m.attackIn = m.def.attackEvery;
      // 攻める城：道の両はしのどちらか1つ。広場の魔物は、人数の半分（切り上げ）の城をランダムに選ぶ（2人のときの「2人に1人」と同じ割合）
      let victims;
      if (m.roadId === PLAZA) {
        const pool = this.aliveSides();
        victims = [];
        for (let k = Math.ceil(pool.length / 2); k > 0 && pool.length > 0; k--) victims.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
        victims.sort((a, b) => this.playerOrder.indexOf(a) - this.playerOrder.indexOf(b));
      } else {
        const road = this.findRoad(m.roadId);
        victims = [road.players[Math.floor(this.rng() * 2)]];
      }
      // 放置するほど攻撃が重くなる（同じ回に攻める城には、同じダメージ）
      const damage = m.nextCastleAttack;
      m.attackCount += 1;
      for (const id of victims) {
        const victim = this.players[id];
        const before = victim.castle.hp;
        victim.castle.takeDamage(damage);
        this.emit('monsterAttackedCastle', {
          monsterId: m.monsterId, playerId: victim.id, amount: before - victim.castle.hp, hp: victim.castle.hp,
        });
        if (victim.castle.isDestroyed) return;
      }
    }
  }

  /** 周回の始め：魔物がいない道ごとに、monsterSpawnChance の確率で1体出る */
  spawnMonsters() {
    if (!this.monsterDefs || this.round < this.rules.monsterFirstRound || this.rules.monsterSpawnChance === 0) return;
    const types = Object.keys(this.monsterDefs);
    if (types.length === 0) return;
    // 魔物は、同じ2人の間の道すべてで1体まで（道が何本あっても、出るのは1本だけ）。広場なら広場に1体だけ
    const pairIds = this.plaza ? [PLAZA] : [...new Set(this.roads.map((r) => r.pairId))];
    for (const pairId of pairIds) {
      const lanes = this.plaza ? [] : this.roads.filter((r) => r.pairId === pairId);
      if (this.plaza ? this.monsters.length > 0 : this.monsters.some((m) => lanes.some((r) => r.roadId === m.roadId))) continue;
      // 魔物を倒したところには、しばらく出ない（魔物が道をふさぎ続けないように）
      if ((this.monsterCooldown.get(pairId) ?? 0) > this.round) continue;
      if (this.rng() >= this.rules.monsterSpawnChance) continue;
      const total = types.reduce((a, t) => a + this.monsterDefs[t].weight, 0);
      let r = this.rng() * total;
      const type = types.find((t) => (r -= this.monsterDefs[t].weight) < 0) ?? types.at(-1);
      const monsterId = `m${String(this.nextMonsterNumber++).padStart(2, '0')}`;
      // 出る道はランダム（道が1本のときは乱数を使わない）
      const roadId = this.plaza ? PLAZA : (lanes.length === 1 ? lanes[0] : lanes[Math.floor(this.rng() * lanes.length)]).roadId;
      const m = new Monster(monsterId, type, this.monsterDefs[type], roadId, this.middleSquare());
      m.growth = this.rules.monsterAttackGrowth;
      // 広場の魔物の HP は人数に比例（2人のときの HP が基準。出た時点の残りの人数で決める）
      if (this.plaza) m.maxHp = m.hp = Math.max(1, Math.round((m.hp * this.alivePlayerIds().length) / 2));
      this.monsters.push(m);
      this.emit('monsterAppeared', {
        monsterId, type, roadId, square: m.square, hp: m.hp, attack: m.attack, element: m.element,
      });
    }
  }

  /** 魔物にダメージ。0になったら、by.playerId がとどめボーナスをもらう */
  damageMonster(monster, amount, by) {
    monster.takeDamage(amount);
    this.emit('monsterDamaged', { monsterId: monster.monsterId, amount, hp: monster.hp, by });
  }

  defeatMonsterIfDead(monster, playerId) {
    if (!monster.isDead) return;
    this.monsters = this.monsters.filter((m) => m !== monster);
    const slot = monster.roadId === PLAZA ? PLAZA : this.findRoad(monster.roadId).pairId;
    this.monsterCooldown.set(slot, this.round + this.rules.monsterCooldownRounds + 1);
    const { reward } = monster.def;
    const baseRarity = monster.def.rewardRarity ?? null;
    // ラッキー：rewardLuckyChance の確率で、1つ上のレアリティが出る（確率が0のときは乱数を使わない）
    let rewardRarity = baseRarity;
    let lucky = false;
    if (baseRarity && this.rarityDefs && this.rules.rewardLuckyChance > 0) {
      const next = nextRarityWithCards(this.cardDefs, this.rarityDefs, baseRarity);
      if (next && this.rng() < this.rules.rewardLuckyChance) {
        rewardRarity = next;
        lucky = true;
      }
    }
    this.emit('monsterDefeated', { monsterId: monster.monsterId, playerId, reward: reward ?? 0, rewardRarity, baseRarity, lucky });
    if (reward) this.changeCoins(this.players[playerId], reward, 'reward');
    // ごほうびのカード：そのレアリティのカードが1枚、手札に入る（カードがなければ何も起きない）
    if (rewardRarity) {
      const type = sampleTypeOfRarity(this.cardDefs, rewardRarity, this.rng);
      if (type) {
        const card = this.createCard(type);
        this.players[playerId].hand.push(card);
        this.emit('cardDrawn', { playerId, cardIds: [card.cardId] });
      }
    }
  }

  changeCoins(player, delta, reason) {
    player.coins += delta;
    this.emit('coinsChanged', { playerId: player.id, delta, coins: player.coins, reason });
  }

  /** 進軍中の兵士が魔物と戦う（お互いに同時に与える。属性も効く） */
  fightMonster(player, soldier, monster) {
    const road = this.findRoad(soldier.roadId);
    this.emit('monsterClashed', {
      attacker: { playerId: player.id, soldierId: soldier.soldierId },
      monsterId: monster.monsterId,
      roadId: road.roadId,
      square: road.toSquare(this.side(player.id), soldier.position),
    });
    const toMonster = this.fightDamage(soldier, monster);
    const toSoldier = this.reduceDamage(player, this.fightDamage(monster, soldier));
    this.damageMonster(monster, toMonster, { playerId: player.id, soldierId: soldier.soldierId });
    const blocked = soldier.takeDamage(toSoldier);
    this.emit('soldierDamaged', {
      playerId: player.id, soldierId: soldier.soldierId, amount: toSoldier, hp: soldier.hp, cause: 'fight', blocked,
    });
    this.defeatMonsterIfDead(monster, player.id);
    if (soldier.isDead) this.removeSoldier(player, soldier, 'killed');
  }

  // ================= コインと強化 =================

  /** 強化を買えるか（読むだけ） */
  canBuyUpgrade(upgradeId) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase !== 'main') return fail('今は買えません');
    // Object のプロトタイプのキー（"constructor" など）を強化と取り違えないように
    if (typeof upgradeId !== 'string' || !Object.hasOwn(this.upgradeDefs, upgradeId)) return fail('その強化はありません');
    const def = this.upgradeDefs[upgradeId];
    const player = this.players[this.currentPlayer];
    const bought = player.upgradesBought[upgradeId] ?? 0;
    if (def.limit !== undefined && bought >= def.limit) return fail(`この強化は1試合に${def.limit}回までです`);
    if (player.coins < def.cost) return fail(`コインが足りません（あと${def.cost - player.coins}枚）`);
    if (def.effect === 'repairCastle' && player.castle.isFull) return fail('城のHPが満タンです');
    const pile = this.pileOf(player.id);
    if (def.effect === 'drawCards' && pile.deck.length + pile.discard.length === 0) return fail('山札も捨て札もありません');
    if (def.effect === 'gainCard') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      if (!Object.values(this.cardDefs).some((d) => d.rarity === def.rarity && (d.weight ?? 1) > 0)) return fail('その強化はありません');
    }
    if (def.effect === 'boostDrops') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      if (!Object.hasOwn(this.rarityDefs, def.fromRarity)) return fail('その強化はありません');
      if (player.luck) return fail('運命の祈りがもう効いています');
    }
    if (def.effect === 'sharpenSoldiers' && player.soldiers.length === 0) return fail('道の上に自分の兵士がいません');
    return ok();
  }

  /** 強化を買う（自分のメインの場面で、何回でも） */
  buyUpgrade(upgradeId) {
    const check = this.canBuyUpgrade(upgradeId);
    if (!check.ok) return check;
    const def = this.upgradeDefs[upgradeId];
    const player = this.players[this.currentPlayer];
    player.upgradesBought[upgradeId] = (player.upgradesBought[upgradeId] ?? 0) + 1;
    this.changeCoins(player, -def.cost, 'upgrade');
    this.emit('upgradeBought', { playerId: player.id, upgradeId, cost: def.cost });
    if (def.effect === 'repairCastle') {
      const healed = player.castle.heal(def.amount);
      this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
    } else if (def.effect === 'drawCards') {
      this.drawCards(player, def.amount);
    } else if (def.effect === 'trainArmy') {
      player.armyAttack += def.amount;
      for (const s of player.soldiers) {
        s.baseAttack += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack });
      }
    } else if (def.effect === 'fortifyArmy') {
      player.armyHp += def.amount;
      for (const s of player.soldiers) {
        s.hp += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack, hp: s.hp });
      }
    } else if (def.effect === 'gainCard') {
      const cardIds = [];
      for (let i = 0; i < def.amount; i++) {
        const card = this.createCard(sampleTypeOfRarity(this.cardDefs, def.rarity, this.rng));
        player.hand.push(card);
        cardIds.push(card.cardId);
      }
      this.emit('cardDrawn', { playerId: player.id, cardIds });
    } else if (def.effect === 'boostDrops') {
      player.luck = { draws: def.amount, boost: def.boost, from: def.fromRarity };
    } else if (def.effect === 'sharpenSoldiers') {
      for (const s of player.soldiers) {
        s.baseAttack += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack });
      }
    }
    return ok();
  }

  // ================= 合成 =================

  /**
   * 排出率の一覧（読むだけ。UI が「排出率を見る」画面に使う）
   * @returns {{rarities: object[], cards: object, monsters: object}|null} rarities を渡していなければ null
   */
  getDropRates() {
    if (!this.rarityDefs) return null;
    const rates = dropRates(this.cardDefs, this.rarityDefs);
    const rarities = Object.entries(this.rarityDefs).map(([id, r]) => ({ id, name: r.name, dropRate: r.dropRate }));
    const cards = {};
    for (const [type, def] of Object.entries(this.cardDefs)) cards[type] = { name: def.name, rarity: def.rarity, rate: rates[type] };
    const monsters = {};
    for (const [type, def] of Object.entries(this.monsterDefs || {})) {
      if (def.rewardRarity) monsters[type] = { name: def.name, odds: rewardOdds(this.cardDefs, this.rarityDefs, def.rewardRarity, this.rules.rewardLuckyChance) };
    }
    return { rarities, cards, monsters };
  }

  /** 手札の同じカード2枚を合成できるか（読むだけ） */
  canFuse(cardIdA, cardIdB) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase !== 'main') return fail('今は合成できません');
    const player = this.players[this.currentPlayer];
    if (typeof cardIdA !== 'string' || typeof cardIdB !== 'string' || cardIdA === cardIdB) return fail('別々のカードを2枚選んでください');
    const a = player.hand.find((c) => c.cardId === cardIdA);
    const b = player.hand.find((c) => c.cardId === cardIdB);
    if (!a || !b) return fail('そのカードは手札にありません');
    const wildA = a.def.effect === 'wild';
    const wildB = b.def.effect === 'wild';
    if (wildA && wildB) return fail('適応どうしは合成できません');
    // 適応は、どのカードとでも合成できる（相手のカードを2枚合成したのと同じ結果）
    const base = wildA ? b : a;
    if (!wildA && !wildB && a.type !== b.type) return fail('同じ種類のカードどうしでないと合成できません');
    if (!base.def.fuseTo) return fail('レジェンドはこれ以上合成できません');
    return { ok: true, player, a, b, base };
  }

  /** 手札の同じカード2枚を、1つ上のレアリティのカード1枚にする（メインの1枚には数えない。何回でもできる） */
  fuse(cardIdA, cardIdB) {
    const check = this.canFuse(cardIdA, cardIdB);
    if (!check.ok) return check;
    const { player, a, b, base } = check;
    player.hand = player.hand.filter((c) => c !== a && c !== b);
    const card = this.createCard(base.def.fuseTo);
    player.hand.push(card);
    this.emit('cardsFused', { playerId: player.id, cardIds: [a.cardId, b.cardId], cardId: card.cardId, from: base.type, to: card.type });
    return ok();
  }

  /** a が b に与えるダメージ（攻撃力 ＋ 属性が強ければ elementBonus） */
  fightDamage(a, b) {
    const strong = a.element && b.element && ELEMENT_BEATS[a.element] === b.element;
    return a.attack + (strong ? this.rules.elementBonus : 0);
  }

  /** 進軍中の attacker と、相手の defender が戦う。お互いに攻撃力ぶんのダメージを同時に与える */
  fight(player, attacker, enemy, defender) {
    const road = this.findRoad(attacker.roadId);
    this.emit('soldiersClashed', {
      attacker: { playerId: player.id, soldierId: attacker.soldierId },
      defender: { playerId: enemy.id, soldierId: defender.soldierId },
      roadId: road.roadId,
      square: road.toSquare(this.side(player.id), attacker.position), // 攻める側が止まったマス
    });

    const toDefender = this.reduceDamage(enemy, this.fightDamage(attacker, defender));
    const toAttacker = this.reduceDamage(player, this.fightDamage(defender, attacker));
    const blockedD = defender.takeDamage(toDefender);
    const blockedA = attacker.takeDamage(toAttacker);
    this.emit('soldierDamaged', {
      playerId: enemy.id, soldierId: defender.soldierId, amount: toDefender, hp: defender.hp, cause: 'fight', blocked: blockedD,
    });
    this.emit('soldierDamaged', {
      playerId: player.id, soldierId: attacker.soldierId, amount: toAttacker, hp: attacker.hp, cause: 'fight', blocked: blockedA,
    });

    // 消える順番は soldierDamaged と同じ（守る側 → 攻める側）
    for (const [owner, s] of [[enemy, defender], [player, attacker]]) {
      if (s.isDead) this.removeSoldier(owner, s, 'killed');
    }
  }

  // ================= カードを出す =================

  /**
   * そのカードを出せる対象の一覧（プレイヤーの番・手札にあるかなどは見ない）。
   * 形は { playerId } / { soldierId } / { roadId, square } のどれか（CLAUDE.md「対象の選び方」）。
   * @returns {{targets: object[], reason: string}} 対象がないときの理由も返す
   */
  listTargets(player, card) {
    const def = card.def;
    const playerTargets = (players) => players.map((p) => ({ playerId: p.id }));
    const ownSoldiers = () => player.soldiers.map((x) => ({ soldierId: x.soldierId }));
    switch (def.kind) {
      case 'soldier': {
        // 道が何本かあるときは、どの道に出すかも選ぶ（{ playerId, roadId }）
        const targets = this.neighborsOf(player.id).flatMap((p) => {
          const roads = this.roadsBetween(player.id, p.id);
          return roads.length === 1 ? [{ playerId: p.id }] : roads.map((r) => ({ playerId: p.id, roadId: r.roadId }));
        });
        return { targets, reason: '兵士を送れる相手がいません' };
      }
      case 'weapon': {
        // 同じ武器をもう一度持たせても何も起きないので、その兵士は対象にしない
        const targets = player.soldiers.filter((x) => x.weapon !== card.type).map((x) => ({ soldierId: x.soldierId }));
        return { targets, reason: player.soldiers.length ? 'もう同じ武器を持っています' : '道の上に自分の兵士がいません' };
      }
      default:
        break;
    }
    const hasSoldiers = (p) => p.soldiers.length > 0;
    // 選んだ1レーンだけに効く魔法：自分の道ごとに、相手の兵士がいる（効き目が変わる兵士がいる）道が対象
    if (this.isLaneScoped(def) && LANE_SCOPE_EFFECTS.includes(def.effect)) {
      const changes = this.changesSoldier(def);
      // 道の向こうの陣地の人（チーム戦ならメンバーごと）×道。その道にその人の兵士がいるもの
      const me = this.side(player.id);
      const pairs = this.roads.filter((r) => r.has(me)).flatMap((r) =>
        this.opponentsOf(player.id).filter((p) => this.side(p.id) === r.otherSide(me)).map((p) => ({ p, r, on: p.soldiers.filter((x) => x.roadId === r.roadId) })),
      );
      const withSoldiers = pairs.filter((x) => x.on.length > 0);
      const targets = withSoldiers.filter((x) => x.on.some(changes)).map((x) => ({ playerId: x.p.id, roadId: x.r.roadId }));
      return { targets, reason: withSoldiers.length ? 'もう同じ状態になっています' : '道の上に相手の兵士がいません' };
    }
    switch (def.effect) {
      case 'wild':
        return { targets: [], reason: '適応は合成に使うカードです（出せません）' };
      case 'damageEnemyCastle':
        return {
          targets: [
            // 城は陣地ごとに1つ（チーム戦ならチームの代表）
            ...playerTargets(this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id)),
            // 魔物は、自分の道（自分が両はしのどちらか）にいるものだけ。広場の魔物はだれからでも狙える
            ...this.monsters.filter((m) => m.roadId === PLAZA || this.findRoad(m.roadId).has(this.side(player.id))).map((m) => ({ monsterId: m.monsterId })),
          ],
          reason: '相手がいません',
        };
      case 'damageEnemySoldiers':
        return {
          targets: playerTargets(this.opponentsOf(player.id).filter(hasSoldiers)),
          reason: '道の上に相手の兵士がいません',
        };
      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers': {
        // 効き目が変わる兵士がいる相手だけ（全員もう同じかそれ以上の状態なら、出しても何も起きない）
        const changes = this.changesSoldier(def);
        const withSoldiers = this.opponentsOf(player.id).filter(hasSoldiers);
        return {
          targets: playerTargets(withSoldiers.filter((p) => p.soldiers.some(changes))),
          reason: withSoldiers.length ? 'もう同じ状態になっています' : '道の上に相手の兵士がいません',
        };
      }
      case 'gainCoins':
        return { targets: [{ playerId: player.id }], reason: '' };
      case 'redrawHand':
        return {
          targets: player.hand.some((c) => c.cardId !== card.cardId) ? [{ playerId: player.id }] : [],
          reason: '引き直す手札がありません',
        };
      case 'randomEffect': {
        const pile = this.pileOf(player.id);
        return {
          targets: pile.deck.length + pile.discard.length > 0 ? [{ playerId: player.id }] : [],
          reason: '山札も捨て札もありません',
        };
      }
      case 'stealCard':
        return {
          targets: this.opponentsOf(player.id).filter((p) => p.hand.length > 0).map((p) => ({ playerId: p.id })),
          reason: '手札を持っている相手がいません',
        };
      case 'summonSpirit': {
        if (player.spirit?.type === card.type) return { targets: [], reason: '同じ精霊がもう来ています' };
        // 火の精霊は、毎ターン城を攻める相手を選ぶ。ほかは自分
        if (def.spirit === 'fire') {
          const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
          return { targets: playerTargets(foes), reason: '相手がいません' };
        }
        return { targets: [{ playerId: player.id }], reason: '' };
      }
      case 'reflectSpell':
      case 'nullifySoldier':
        return { targets: [], reason: '攻撃を受けたときにだけ使えます' };
      case 'healOwnCastle':
        return { targets: player.castle.isFull ? [] : [{ playerId: player.id }], reason: '城のHPが満タンです' };
      case 'shieldSoldier':
        return { targets: ownSoldiers(), reason: '道の上に自分の兵士がいません' };
      case 'armorCastle':
        return {
          targets: player.armor >= def.amount ? [] : [{ playerId: player.id }],
          reason: '同じか、より強い城壁がもう置いてあります',
        };
      default:
        return { targets: [], reason: 'このカードは出せません' };
    }
  }

  /** その魔法で、兵士 x の状態が変わるか（毒・凍結：もう同じかそれ以上なら変わらない。サンダーはいつも変わる） */
  changesSoldier(def) {
    if (def.effect === 'poisonEnemySoldiers') return (x) => !x.poison || x.poison.turns < def.turns || x.poison.amount < def.amount;
    if (def.effect === 'freezeEnemySoldiers') return (x) => x.frozen < def.turns;
    return () => true;
  }

  /** 手番・手札・枚数の決まりを確かめる。出せるならカードを返す */
  checkPlayable(cardId) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('手札を捨てているところです');
    if (this.phase === 'defend') return fail('相手が防御を選んでいます');

    const player = this.players[this.currentPlayer];
    const card = player.findInHand(cardId);
    if (!card) {
      if (this.opponentsOf(player.id).some((p) => p.findInHand(cardId))) return fail('あなたの番ではありません');
      return fail('そのカードは手札にありません');
    }
    // 兵士は1ターン soldiersPerTurn 枚、メイン（攻撃の魔法）は1枚。付加（武器）・防御・回復や精霊などは何枚でも
    if (card.slot === 'soldier' && player.soldiersPlayedThisTurn >= this.rules.soldiersPerTurn) {
      return fail(`このターンに出せる兵士は${this.rules.soldiersPerTurn}枚までです`);
    }
    if (card.slot === 'main' && player.playedThisTurn) return fail('このターンはもうメインのカードを出しました');
    return { ok: true, player, card };
  }

  /**
   * 対象を決める。target を省略して、対象が1つならそれを使う。
   * @returns {{ok: true, target: object, needsTarget?: boolean} | {ok: false, reason: string}}
   */
  resolveTarget(player, card, target) {
    const { targets, reason } = this.listTargets(player, card);
    if (targets.length === 0) return fail(reason);
    if (target === undefined || target === null) {
      if (targets.length === 1) return { ok: true, target: targets[0] };
      return { ok: true, target: null, needsTarget: true };
    }
    // 値が undefined のキーは無いものとして比べる（UI がオブジェクトを組み立てて渡しても困らないように）
    const keys = (o) => Object.keys(o).filter((k) => o[k] !== undefined);
    const same = (a, b) => keys(a).length === keys(b).length && keys(b).every((k) => a[k] === b[k]);
    const found = typeof target === 'object' ? targets.find((t) => same(t, target)) : null;
    if (!found) return fail('そこには出せません');
    return { ok: true, target: found };
  }

  /**
   * そのカードを今出せるか（読むだけ）。出せないときは理由を返す（UIが前もって表示するため）。
   * target を省略して、対象が2つ以上あるときは { ok: true, needsTarget: true }（出せるけど選ぶ必要がある）
   * @returns {{ok: true, needsTarget?: true} | {ok: false, reason: string}}
   */
  canPlayCard(cardId, target) {
    const check = this.checkPlayable(cardId);
    if (!check.ok) return check;
    const t = this.resolveTarget(check.player, check.card, target);
    if (!t.ok) return t;
    return t.needsTarget ? { ok: true, needsTarget: true } : ok();
  }

  /**
   * そのカードを今出せる対象の一覧（読むだけ）。出せないときは空の配列
   * @returns {object[]}
   */
  getTargets(cardId) {
    const check = this.checkPlayable(cardId);
    if (!check.ok) return [];
    return this.listTargets(check.player, check.card).targets.map((t) => ({ ...t }));
  }

  /**
   * メイン：カードを1枚使う。
   * @param {string} cardId
   * @param {object} [target] 対象（{ playerId } など）。対象が1つしかないときは省略できる
   */
  playCard(cardId, target) {
    const check = this.checkPlayable(cardId);
    if (!check.ok) return check;
    const { player } = check;
    const resolved = this.resolveTarget(player, check.card, target);
    if (!resolved.ok) return resolved;
    if (resolved.needsTarget) return { ok: false, reason: '対象を選んでください', needsTarget: true };

    const card = player.takeFromHand(cardId);
    if (card.slot === 'main') player.playedThisTurn = true;
    if (card.slot === 'soldier') player.soldiersPlayedThisTurn += 1;
    player.cardsPlayedThisTurn += 1;
    // 使ったカードは（兵士も）すぐ捨て札へ。使い切りのカードは、二度と山札に戻らない置き場へ
    if (card.isExhaust) this.pileOf(player.id).exhausted.push(card);
    else this.pileOf(player.id).discard.push(card);
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.type });

    this.applyCard(player, card, resolved.target);

    this.checkGameOver();
    return ok();
  }

  /** 出したカードの効果を起こす（神頼みでタダで出すときにも使う） */
  applyCard(player, card, target) {
    if (card.isSoldier) {
      const targetId = target.playerId;
      const road = target.roadId ? this.findRoad(target.roadId) : this.roadBetween(player.id, targetId);
      const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
      const soldier = new Soldier(soldierId, card, road.roadId, targetId);
      soldier.baseAttack += player.castleDef.soldierAttackBonus ?? 0; // 兵舎
      soldier.baseAttack += player.armyAttack; // 訓練（コインで買う）
      soldier.hp += player.armyHp;
      player.soldiers.push(soldier);
      this.emit('soldierDeployed', {
        playerId: player.id,
        soldierId,
        type: card.type,
        roadId: road.roadId,
        targetId,
        position: soldier.position,
        hp: soldier.hp,
        attack: soldier.attack,
      });
    } else if (card.isSpell && target.monsterId) {
      const monster = this.findMonster(target.monsterId);
      this.emit('spellCast', { playerId: player.id, type: card.type, target: monster.monsterId, targetKind: 'monster' });
      this.damageMonster(monster, card.def.amount, { playerId: player.id, type: card.type });
      this.defeatMonsterIfDead(monster, player.id);
    } else if (card.isSpell) {
      this.castSpell(player, card, this.players[target.playerId], target.roadId);
    } else {
      this.playSupport(player, card, target);
    }

  }

  castSpell(player, card, targetPlayer, roadId) {
    const enemy = targetPlayer;
    const { effect, amount } = card.def;
    // レーンを選んだ魔法は、その道の兵士だけに効く（spellCast にも roadId を入れる）
    const lane = roadId === undefined ? {} : { roadId };
    const victims = () => enemy.soldiers.filter((x) => roadId === undefined || x.roadId === roadId);

    switch (effect) {
      case 'damageEnemyCastle':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        // 魔法の塔は城への魔法が強い
        {
          const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
          this.requestDefense(
            { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
            () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
            () => this.checkGameOver(),
          );
        }
        break;

      case 'damageEnemySoldiers':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        {
          const hit = victims();
          // 兵士を狙われた人は、当たる前に盾を出せる
          this.requestDefense(
            { kind: 'soldiers', defenderId: enemy.id, attackerId: player.id, amount, soldierIds: hit.map((x) => x.soldierId) },
            () => {
              for (const soldier of hit) if (enemy.soldiers.includes(soldier)) this.damageSoldier(enemy, soldier, amount, 'spell');
            },
            () => this.checkGameOver(),
          );
        }
        break;

      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        const status = effect === 'poisonEnemySoldiers' ? 'poison' : 'frozen';
        for (const soldier of victims()) {
          // 重ねがけでは増えない：残りの回数を長い方にそろえる
          if (status === 'poison') {
            const turns = Math.max(card.def.turns, soldier.poison?.turns ?? 0);
            soldier.poison = { amount: Math.max(amount, soldier.poison?.amount ?? 0), turns };
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns });
          } else {
            soldier.frozen = Math.max(card.def.turns, soldier.frozen);
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns: soldier.frozen });
          }
        }
        break;
      }

      case 'healOwnCastle': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }

      case 'gainCoins': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.changeCoins(player, amount, 'card');
        break;
      }

      case 'redrawHand': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        // 先に同じ枚数を引いてから、元の手札を捨てる（捨てたカードをすぐ引き戻さないように）
        const old = [...player.hand];
        this.drawCards(player, old.length);
        const cardIds = old.map((c) => c.cardId);
        for (const c of old) this.pileOf(player.id).discard.push(player.takeFromHand(c.cardId));
        this.emit('cardDiscarded', { playerId: player.id, cardIds });
        break;
      }

      case 'summonSpirit': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        this.summonSpirit(player, card, enemy);
        break;
      }

      case 'randomEffect': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.prayCard(player);
        break;
      }

      case 'stealCard': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const stolen = enemy.hand[enemy.hand.length === 1 ? 0 : Math.floor(this.rng() * enemy.hand.length)];
        enemy.takeFromHand(stolen.cardId);
        player.hand.push(stolen);
        this.emit('cardStolen', { playerId: player.id, victimId: enemy.id, cardId: stolen.cardId });
        break;
      }

      default:
        // Card.validateDefinitions で弾いているので、ここには来ない
        break;
    }
  }

  // ================= 精霊 =================
  // 1人1体まで。新しく呼ぶと入れ替わる（強すぎないように、1種類だけ選ぶ形）。
  // 呼んだターンは効かない。次の自分のターンから `turns` 回、効く。自分のターンの終わりに残りが1つ減り、0で消える。
  //   fire：自分のターンの始めに、選んだ相手の城に amount ダメージ（城壁は受ける）
  //   water：自分のターンの始めに、自分の城を amount 回復
  //   wind：自分の兵士の速さが、最低でも amount になる
  //   earth：自分の城と兵士が受けるダメージが amount 軽くなる（ただし1より小さくはならない）

  summonSpirit(player, card, target) {
    const def = card.def;
    if (player.spirit) this.emit('spiritEnded', { playerId: player.id, type: player.spirit.type, reason: 'replaced' });
    player.spirit = {
      type: card.type,
      spirit: def.spirit,
      amount: def.amount,
      turns: def.turns,
      targetId: def.spirit === 'fire' ? target.id : null,
      fresh: true, // 呼んだターンの終わりには減らさない
    };
    this.emit('spiritSummoned', {
      playerId: player.id, type: card.type, spirit: def.spirit, amount: def.amount, turns: def.turns, targetId: player.spirit.targetId,
    });
  }

  /** ターンの始め：火・水の精霊が効く。城が落ちて決着したら true */
  triggerSpirit(player) {
    const sp = player.spirit;
    if (!sp || sp.fresh) return false;
    if (sp.spirit === 'water') {
      const healed = player.castle.heal(sp.amount);
      if (healed > 0) {
        this.emit('spiritTriggered', { playerId: player.id, type: sp.type, spirit: 'water', amount: healed });
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
      }
    } else if (sp.spirit === 'fire') {
      const foes = this.enemySides(player.id);
      const target = foes.find((p) => p.id === sp.targetId) ?? foes[0];
      if (!target) return false;
      this.emit('spiritTriggered', { playerId: player.id, type: sp.type, spirit: 'fire', amount: sp.amount, targetId: target.id });
      this.damageCastle(target, sp.amount, { kind: 'spirit', type: sp.type });
      return this.checkGameOver();
    }
    return false;
  }

  /** 自分のターンの終わり：精霊の残りを1つ減らす。0で消える */
  tickSpirit(player) {
    const sp = player.spirit;
    if (!sp) return;
    if (sp.fresh) {
      sp.fresh = false;
      return;
    }
    sp.turns -= 1;
    if (sp.turns <= 0) {
      player.spirit = null;
      this.emit('spiritEnded', { playerId: player.id, type: sp.type, reason: 'expired' });
    }
  }

  /** 兵士 soldier の今の速さ（風の精霊は、最低でも amount にする） */
  speedOf(player, soldier) {
    const sp = player.spirit;
    return sp && sp.spirit === 'wind' ? Math.max(soldier.speed, sp.amount) : soldier.speed;
  }

  /** 土の精霊：owner が受けるダメージを軽くする（0のダメージはそのまま。1より小さくはならない） */
  reduceDamage(owner, amount) {
    const sp = owner.spirit;
    if (!sp || sp.spirit !== 'earth' || amount <= 0) return amount;
    return Math.max(1, amount - sp.amount);
  }

  /**
   * 神頼み：山の上の1枚をめくって、出せるならタダで出す（対象は出せる中からランダム）。
   * 出せなければ（神頼み自身・対象がないカード）、そのまま捨て札へ。
   */
  prayCard(player) {
    const pile = this.pileOf(player.id);
    if (pile.deck.length === 0) {
      pile.deck = this.shuffle(pile.discard);
      pile.discard = [];
      this.emit('deckShuffled', { deckCount: pile.deck.length, playerId: pile.owner });
    }
    const card = pile.deck.shift();
    if (!card) return;
    (card.isExhaust ? pile.exhausted : pile.discard).push(card);
    const { targets } = card.def.effect === 'randomEffect' ? { targets: [] } : this.listTargets(player, card);
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.type, free: true });
    if (targets.length === 0) return;
    const target = targets.length === 1 ? targets[0] : targets[Math.floor(this.rng() * targets.length)];
    this.applyCard(player, card, target);
  }

  /** 付加（武器）・防御・トラップのカードを使う */
  playSupport(player, card, target) {
    const def = card.def;
    if (def.kind === 'weapon' || def.effect === 'shieldSoldier') {
      const soldier = player.soldiers.find((x) => x.soldierId === target.soldierId);
      if (def.kind === 'weapon') {
        // 1体に1つ。新しく持たせると前の武器は消える
        soldier.weapon = card.type;
        soldier.weaponBonus = def.attackBonus;
        soldier.element = def.element ?? null;
        this.emit('weaponEquipped', {
          playerId: player.id, soldierId: soldier.soldierId, type: card.type, attack: soldier.attack, element: soldier.element,
        });
      } else {
        soldier.shield += def.amount;
        this.emit('shieldAdded', { playerId: player.id, soldierId: soldier.soldierId, amount: def.amount, shield: soldier.shield });
      }
      return;
    }
    if (def.effect === 'armorCastle') {
      player.armor = def.amount; // 重ならない（今より多いときだけ出せる）
      this.emit('castleArmored', { playerId: player.id, armor: player.armor });
      return;
    }
  }

  /** ターン終了。手札が上限を超えていたら phase "discard" にして、捨て終わるまで待つ */
  endTurn() {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('先に手札を捨ててください');
    if (this.phase === 'defend') return fail('相手が防御を選んでいます');

    const player = this.players[this.currentPlayer];
    const over = player.hand.length - player.maxHand;
    if (over > 0) {
      this.phase = 'discard';
      this.discardCount = over;
      this.emit('discardRequired', { playerId: player.id, count: over });
      return ok();
    }
    this.passTurn();
    return ok();
  }

  /**
   * 手札を捨てる（phase "discard" のときだけ）。
   * 捨てる必要がある枚数ちょうどを1回で渡す。捨て終わったら次の人のターンが始まる。
   * @param {string[]} cardIds
   */
  discard(cardIds) {
    if (this.phase !== 'discard') return fail('今は手札を捨てる場面ではありません');
    if (!Array.isArray(cardIds)) return fail('捨てるカードのIDを配列で渡してください');
    if (new Set(cardIds).size !== cardIds.length) return fail('同じカードが2回選ばれています');
    if (cardIds.length !== this.discardCount) {
      return fail(`${this.discardCount}枚選んでください（今は${cardIds.length}枚）`);
    }
    const player = this.players[this.currentPlayer];
    if (!cardIds.every((id) => player.findInHand(id))) return fail('手札にないカードが選ばれています');

    for (const id of cardIds) this.pileOf(player.id).discard.push(player.takeFromHand(id));
    this.discardCount = 0;
    this.emit('cardDiscarded', { playerId: player.id, cardIds: [...cardIds] });
    this.passTurn();
    return ok();
  }

  // ================= 防御（攻撃を受けたときの反応） =================
  // rules.defenseReaction が true のとき、攻撃が当たる前に、受ける人が防御カードを何枚でも出せる。
  //   城に着いた兵士・ファイアボールや隕石 → 城壁・土嚢（城を守る）
  //   サンダー・大雷 → 盾・大盾（当たる兵士に盾をつける）
  //   毒・凍結は、防御カードで防げないので聞かない
  // 出せるカードが手札になければ、止まらない。待つときは phase が "defend" になり、
  // defend() で防御カードを出す → passDefense() で受ける（出せるカードがなくなったら自動で受ける）。

  /** 攻撃 pending に対して、そのカードをどこに出せるか */
  defenseTargetsFor(pending, card) {
    const def = card.def;
    const defender = this.players[pending.defenderId];
    if (def.kind !== 'defense') return { targets: [], reason: '防御カードだけ出せます' };
    if (pending.kind === 'castle') {
      if (def.effect === 'reflectSpell') {
        return pending.from === 'spell'
          ? { targets: [{ playerId: defender.id }], reason: '' }
          : { targets: [], reason: '反射は魔法にしか使えません' };
      }
      if (def.effect === 'nullifySoldier') {
        return pending.from === 'soldier'
          ? { targets: [{ playerId: defender.id }], reason: '' }
          : { targets: [], reason: '身代わりは城に着いた兵士にしか使えません' };
      }
      if (def.effect !== 'armorCastle') return { targets: [], reason: '城が攻められています。城を守るカードを出してください' };
      if (defender.armor >= def.amount) return { targets: [], reason: '同じか、より強い城壁がもう置いてあります' };
      return { targets: [{ playerId: defender.id }], reason: '' };
    }
    if (def.effect !== 'shieldSoldier') return { targets: [], reason: '兵士が攻められています。盾のカードを出してください' };
    const targets = defender.soldiers.filter((x) => pending.soldierIds.includes(x.soldierId)).map((x) => ({ soldierId: x.soldierId }));
    return { targets, reason: '守れる兵士がいません' };
  }

  /**
   * 攻撃が当たる前に、受ける人に防御を聞く。防御できるカードが手札になければ聞かずに apply() する。
   * 聞くとき（true を返す）は phase が "defend" になり、返事が来たら apply() → after() を呼ぶ。
   * @returns {boolean} 返事を待っているなら true（呼び出した側は、そこで止める）
   */
  requestDefense(spec, apply, after) {
    const defender = this.players[spec.defenderId];
    const pending = { ...spec, apply, after };
    const canDefend = this.rules.defenseReaction
      && !defender.eliminated
      && defender.hand.some((card) => this.defenseTargetsFor(pending, card).targets.length > 0);
    if (!canDefend) {
      apply();
      return false;
    }
    this.pending = pending;
    this.phase = 'defend';
    this.emit('defenseRequested', {
      defenderId: spec.defenderId,
      attackerId: spec.attackerId,
      kind: spec.kind,
      amount: spec.amount,
      ...(spec.soldierIds ? { soldierIds: [...spec.soldierIds] } : {}),
    });
    return true;
  }

  /** 防御を終えて、攻撃を当てる */
  resolveDefense() {
    const p = this.pending;
    this.pending = null;
    this.phase = 'main';
    this.emit('defenseEnded', { defenderId: p.defenderId });
    if (p.outcome === 'reflect') {
      // 魔法を、撃った人の城にそのまま返す（撃った人の城壁は先に受ける）
      this.emit('spellReflected', { defenderId: p.defenderId, attackerId: p.attackerId, amount: p.amount });
      this.damageCastle(this.players[p.attackerId], p.amount, { kind: 'spell', type: p.spellType });
    } else if (p.outcome === 'nullify') {
      this.emit('soldierDecoyed', { defenderId: p.defenderId, attackerId: p.attackerId, soldierId: p.soldierId });
      p.onNullify();
    } else {
      p.apply();
    }
    p.after?.();
  }

  /** 防御カードを今出せるか（読むだけ）。phase が "defend" のときだけ。出せる人は pending.defenderId */
  canDefend(cardId, target) {
    if (this.phase !== 'defend') return fail('今は防御する場面ではありません');
    const card = this.players[this.pending.defenderId].findInHand(cardId);
    if (!card) return fail('そのカードは手札にありません');
    const { targets, reason } = this.defenseTargetsFor(this.pending, card);
    if (targets.length === 0) return fail(reason);
    if (target === undefined || target === null) return targets.length === 1 ? ok() : { ok: true, needsTarget: true };
    const keys = (o) => Object.keys(o).filter((k) => o[k] !== undefined);
    const same = (a, b) => keys(a).length === keys(b).length && keys(b).every((k) => a[k] === b[k]);
    return typeof target === 'object' && targets.some((t) => same(t, target)) ? ok() : fail('そこには出せません');
  }

  /** 防御カードを出せる対象の一覧（読むだけ） */
  getDefenseTargets(cardId) {
    if (this.phase !== 'defend') return [];
    const card = this.players[this.pending.defenderId].findInHand(cardId);
    return card ? this.defenseTargetsFor(this.pending, card).targets.map((t) => ({ ...t })) : [];
  }

  /** 防御カードを出す（攻撃を受ける人が、何枚でも）。出せるカードがなくなったら、自動で攻撃を受ける */
  defend(cardId, target) {
    const check = this.canDefend(cardId, target);
    if (!check.ok) return check;
    if (check.needsTarget) return { ok: false, reason: '対象を選んでください', needsTarget: true };
    const defender = this.players[this.pending.defenderId];
    const card = defender.findInHand(cardId);
    const targets = this.defenseTargetsFor(this.pending, card).targets;
    const chosen = target ? targets.find((t) => Object.keys(target).every((k) => target[k] === undefined || t[k] === target[k])) : targets[0];

    defender.takeFromHand(cardId);
    if (card.isExhaust) this.pileOf(defender.id).exhausted.push(card);
    else this.pileOf(defender.id).discard.push(card);
    this.emit('cardPlayed', { playerId: defender.id, cardId: card.cardId, type: card.type });
    if (card.def.effect === 'reflectSpell' || card.def.effect === 'nullifySoldier') {
      // 攻撃そのものを変えるカード：これで防御は終わり
      this.pending.outcome = card.def.effect === 'reflectSpell' ? 'reflect' : 'nullify';
      this.resolveDefense();
      return ok();
    }
    this.playSupport(defender, card, chosen);

    // まだ出せるカードがあれば待つ。なければ、そのまま攻撃を受ける
    const more = defender.hand.some((c) => this.defenseTargetsFor(this.pending, c).targets.length > 0);
    if (!more) this.resolveDefense();
    return ok();
  }

  /** 防御しないで（これ以上出さずに）攻撃を受ける */
  passDefense() {
    if (this.phase !== 'defend') return fail('今は防御する場面ではありません');
    this.resolveDefense();
    return ok();
  }

  passTurn() {
    const player = this.players[this.currentPlayer];
    player.playedThisTurn = false;
    player.soldiersPlayedThisTurn = 0;
    this.tickSpirit(player);
    this.beginTurn(this.nextPlayerAfter(this.currentPlayer));
  }

  /**
   * 城HPが0以下の人がいたら、勝利条件（rules.winCondition）に従って決着させる。決着したら true
   *   firstDestroy：城を落とした人（＝手番の人）の勝ち
   *   lastStanding：城が落ちた人は抜ける。残りが1人になったら、その人の勝ち
   */
  checkGameOver() {
    if (this.phase === 'gameOver') return true;
    const fallen = this.alivePlayerIds().filter((id) => this.players[id].castle.isDestroyed);
    if (fallen.length === 0) return false;
    if (this.rules.winCondition === 'firstDestroy') {
      // 手番の人の城が残っていれば手番の人の勝ち。魔物に手番の人の城が落とされたら、
      // 席順で手番の人の次から数えて、城が残っている最初の人の勝ち（2人なら相手）。
      // 3人以上で魔物が城を落としたときの扱いは STEP 5 で遊んでから決める（今は仮）
      const standing = (id) => !this.players[id].castle.isDestroyed;
      if (standing(this.currentPlayer)) {
        this.finish(this.currentPlayer, 'castleDestroyed');
      } else {
        const order = this.alivePlayerIds();
        const start = order.indexOf(this.currentPlayer);
        const next = [...order.slice(start + 1), ...order.slice(0, start)].find(standing);
        this.finish(next, 'castleDestroyed');
      }
      return true;
    }
    for (const id of fallen) this.eliminate(this.players[id], this.currentPlayer);
    const alive = this.alivePlayerIds();
    if (this.aliveSides().length <= 1) {
      // 残った陣地の勝ち（チーム戦なら、手番の人が残っていれば手番の人、そうでなければいちばん前の席の人）
      this.finish(alive.includes(this.currentPlayer) ? this.currentPlayer : alive[0] ?? this.currentPlayer, 'lastStanding');
      return true;
    }
    return false;
  }

  /**
   * 降参する。2人のときだけ使える（3人以上の降参は、まだ決めていない）。相手の勝ちで、すぐ終わる。
   * 自分の番でなくても使える（オンラインで、相手の番を待たずに終われるように）。
   * @param {string} playerId 降参する人
   */
  surrender(playerId) {
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'ready') return fail('まだゲームが始まっていません');
    const alive = this.alivePlayerIds();
    if (!alive.includes(playerId)) return fail('そのプレイヤーはいません');
    if (alive.length !== 2) return fail('3人以上のときは降参できません');
    this.finish(alive.find((id) => id !== playerId), 'surrender');
    return { ok: true };
  }

  finish(winner, reason) {
    this.winner = winner;
    this.winnerTeam = this.teamOf?.get(winner) ?? null;
    this.pending = null;
    this.phase = 'gameOver';
    // チーム戦のときだけ、勝ったチーム（winnerTeam）を付ける
    this.emit('gameOver', { winner, reason, ...(this.teamOf ? { winnerTeam: this.winnerTeam } : {}) });
  }

  /** 城が落ちた人を抜けさせる（lastStanding）。兵士は消え、手札は捨て札へ。道をつなぎ直す */
  eliminate(player, by) {
    player.eliminated = true;
    this.emit('playerEliminated', { playerId: player.id, by });
    for (const s of [...player.soldiers]) this.removeSoldier(player, s, 'eliminated');
    const pile = this.pileOf(player.id);
    pile.discard.push(...player.hand);
    player.hand = [];
    const { opened, closed } = this.rebuildRoads();
    for (const road of closed) {
      const monsterIds = this.monsters.filter((m) => m.roadId === road.roadId).map((m) => m.monsterId);
      this.monsters = this.monsters.filter((m) => m.roadId !== road.roadId);
      this.emit('roadClosed', { roadId: road.roadId, monsterIds });
      for (const id of this.alivePlayerIds()) {
        const p = this.players[id];
        for (const s of p.soldiers.filter((x) => x.roadId === road.roadId)) this.removeSoldier(p, s, 'roadClosed');
      }
    }
    for (const road of opened) this.emit('roadOpened', { roadId: road.roadId, players: [...road.players] });
  }

  /** 周回の上限：城HPの割合 → 城HP → 席順が後ろ、の順にいちばんの人の勝ち */
  finishByRoundLimit() {
    const alive = this.alivePlayerIds().map((id) => this.players[id]);
    const seat = (p) => this.playerOrder.indexOf(p.id);
    alive.sort((a, b) => {
      const ra = a.castle.hp / a.castle.maxHp;
      const rb = b.castle.hp / b.castle.maxHp;
      if (ra !== rb) return rb - ra;
      if (a.castle.hp !== b.castle.hp) return b.castle.hp - a.castle.hp;
      return seat(b) - seat(a);
    });
    this.finish(alive[0].id, 'roundLimit');
  }

  // ================= 状態 =================

  /**
   * 今の状態をただのオブジェクトで返す。viewerId の手札は中身まで、相手の手札は枚数だけ。
   * @param {string|null} viewerId "p1"〜"p8"（それ以外なら全員の手札が null）
   */
  getState(viewerId) {
    const players = {};
    const own = this.rules.deckMode === 'own';
    for (const id of this.playerOrder) {
      const p = this.players[id];
      const pile = this.pileOf(id);
      const base = p.toState(id === viewerId);
      // 広場のとき、兵士がいる場所（どの城の道か・広場か）。となりの道のときは null
      for (const st of base.soldiers) {
        const soldier = p.soldiers.find((x) => x.soldierId === st.soldierId);
        st.place = this.plaza ? this.placeOf(id, soldier) : null;
      }
      players[id] = {
        ...base,
        team: this.teamOf?.get(id) ?? null,
        castleOwner: this.side(id),
        castleType: p.castleType,
        maxHand: p.maxHand,
        deckId: p.deckId ?? null,
        deckCount: own ? pile.deck.length : null,
        discardCount: own ? pile.discard.length : null,
        exhaustedCount: own ? pile.exhausted.length : null,
      };
    }
    // いちばん上の山札の数：shared は共通の山札、own は viewer 本人の山札（viewer がいなければ null）
    const topPile = own ? (this.piles.has(viewerId) ? this.pileOf(viewerId) : null) : this.pileOf(this.playerOrder[0]);
    return {
      deckMode: this.rules.deckMode,
      layout: this.plaza ? 'plaza' : 'lanes',
      // チーム戦のとき { t1: { members, castleOwner, size } … }（チームの順）。チーム戦でなければ null
      teams: this.teamOrder
        ? Object.fromEntries(this.teamOrder.map((t) => [t, { members: [...this.teamMembers.get(t)], castleOwner: this.teamMembers.get(t)[0], size: this.teamMembers.get(t).length }]))
        : null,
      winnerTeam: this.winnerTeam,
      playerOrder: [...this.playerOrder],
      round: this.round,
      monsters: this.monsters.map((m) => m.toState()),
      roads: this.roads.map((r) => r.toState()),
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      phase: this.phase,
      winner: this.winner,
      defense: this.pending
        ? {
            defenderId: this.pending.defenderId,
            attackerId: this.pending.attackerId,
            kind: this.pending.kind,
            amount: this.pending.amount,
            soldierIds: this.pending.soldierIds ? [...this.pending.soldierIds] : [],
          }
        : null,
      deckCount: topPile ? topPile.deck.length : null,
      discardCount: topPile ? topPile.discard.length : null,
      exhaustedCount: topPile ? topPile.exhausted.length : null,
      players,
    };
  }

  // ================= デバッグ用（?debug=1 の画面から呼ぶ） =================
  // どれもイベントは出さない。呼んだあとは getState() を読み直して画面を描き直す。
  // start() の前に呼べば、開始時の状態を作れる。

  /** 城HPを変える（1〜その城の上限） */
  debugSetCastleHp(playerId, hp) {
    if (!this.players[playerId]) return fail('そのプレイヤーはいません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    const max = this.players[playerId].castle.maxHp;
    if (!Number.isInteger(hp) || hp < 1 || hp > max) return fail(`HPは1〜${max}の整数にしてください`);
    this.players[playerId].castle.hp = hp;
    return ok();
  }

  /** 手札をカード種類の並びで作り直す（例: ["infantry", "fireball"]）。カードIDは新しく振る */
  debugSetHand(playerId, types) {
    if (!this.players[playerId]) return fail('そのプレイヤーはいません');
    if (this.phase === 'discard') return fail('手札を捨てている途中は変えられません');
    const bad = this.findUnknownType(types);
    if (bad !== null) return fail(bad);
    this.players[playerId].hand = types.map((type) => this.createCard(type));
    return ok();
  }

  /** 山札をカード種類の並びで作り直す。配列の先頭から順に引かれる。カードIDは新しく振る */
  debugSetDeck(types, playerId) {
    const bad = this.findUnknownType(types);
    if (bad !== null) return fail(bad);
    // deckMode "own" のときは playerId の山札（省略すると手番の人）
    const owner = playerId ?? this.currentPlayer;
    if (!this.piles.has(owner)) return fail('そのプレイヤーはいません');
    this.pileOf(owner).deck = types.map((type) => this.createCard(type));
    return ok();
  }

  findUnknownType(types) {
    if (!Array.isArray(types)) return 'カード種類を配列で渡してください';
    const unknown = types.find((t) => !Object.hasOwn(this.cardDefs, t));
    return unknown === undefined ? null : `"${unknown}" というカードはありません`;
  }
}
