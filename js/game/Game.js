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

import { Card, ELEMENTS, LANE_SCOPE_EFFECTS, MP_EFFECTS, BASIC_DICE } from './Card.js';
import { validateElements, elementIds, beatsElement, validateReactions } from './Elements.js';
import { Monster, validateUpgrades } from './Monster.js';
import { Pile, validatePassiveSpirits, validatePassive, checkCostDeck, DECK_COST_DEFAULTS, chainOrder, validateCastles, validateDecks, validateRarities, sampleDeckTypes, sampleType, sampleTypeOfRarity, nextRarityWithCards, dropRates, rewardOdds } from './Setup.js';
import { Soldier } from './Soldier.js';
import { Player } from './Player.js';
import { Road } from './Road.js';
import { Castle } from './Castle.js';
import { validateWeather } from './Weather.js';
import { validateStages, pickStage } from './Stage.js';

/** 身代わり（guardCastle）が代わりに受ける、城へのダメージの出どころ（相手からの攻撃）。自分で払うコスト・崩壊・天候・毒は受けない */
/** 4陣営の反応の継続ダメージ（reactions.json の dot.status） */
export const DOT_STATUSES = ['sand', 'frostbite'];
const GUARDED_SOURCES = ['soldier', 'spell', 'spirit', 'reaction', 'passiveSpirit'];
/** ドルイド・呪術師（spellBoost）で強くなる、ダメージの魔法 */
const BOOSTED_EFFECTS = ['damageEnemyCastle', 'damageEnemySoldiers', 'breathAttack'];

/** 2人のときのプレイヤーID（人数は rules.playerCount。3人以上は p3〜p8 が続く） */
export const PLAYER_IDS = ['p1', 'p2'];

/** Game が出すイベントの名前（CLAUDE.md「Gameが出すイベント」の表と同じ） */
export const EVENT_TYPES = [
  'turnStarted',
  'overdriveChanged',
  'mulliganStarted',
  'mulliganDone',
  'timeChanged',
  'stageEruption',
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
  'castlePoisoned',
  'castleCured',
  'roundStarted',
  'monsterAppeared',
  'monsterAttackedCastle',
  'monsterClashed',
  'monsterDamaged',
  'monsterDefeated',
  'coinsChanged',
  'mpChanged',
  'monsterEvolved',
  'upgradeBought',
  'soldierBuffed',
  'diceRolled',
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
  'passiveSpiritActed',
  'spiritEnded',
  'soldierShot',
  'weatherChanged',
  'weatherLightning',
  'attackMissed',
  'collapseAnnounced',
  'collapseStarted',
  'elementAttached',
  'elementCleared',
  'reactionTriggered',
  // 4陣営モード（CLAUDE.md「4陣営モード」）
  'soldierHealed',
  'castleGuardSet',
  'castleGuarded',
  'shieldBroken',
  'castleHealCut',
  'castleHealCutEnded',
  'castleVulnerable',
  'castleVulnerableEnded',
  // 4陣営：城の付着と反応（rules.castleAttach。試作）
  'castleElementAttached',
  'castleElementCleared',
  'castleReactionTriggered',
  'gameOver',
];

/**
 * 属性の強い・弱い：キーの属性は、値の属性に強い（水は火に強い、火は風に強い、風は土に強い、土は水に強い）。
 * 表（new Game({ elements })）を渡さないときの決まり。Game の中の判定は Elements.js の beatsElement を使う（画面が読むので残す）
 */
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
  // 城壁：0 は従来どおり（重ならず、次の自分のターンの始めに消える）。1以上なら永続で、足し算、この値が上限
  armorMax: 0,
  // 毒（永続の毒の魔法）：毒が続くターン数（0 は永続）と、毒の量の上限（0 は上限なし）
  poisonTurns: 0,
  poisonMax: 0,
  // コインを増やすカードを1ターンに出せる枚数（0 は無制限）
  coinCardsPerTurn: 0,
  // 試合の最初に持っているコインと、自分のターンの始めにもらえるコイン
  initialCoins: 0,
  coinPerTurn: 0,
  // 放置された魔物が城を攻めるたびに、ダメージが増える量（1回目は castleAttack、2回目は +growth、…）
  monsterAttackGrowth: 0,
  // MP：試合の最初に持っている量と上限（maxMp が 0 のときは MP を使わない＝コストなし）
  initialMp: 0,
  maxMp: 0,
  // MP：true なら、兵士・武器・防御・回復などのカードも、カードの mpCost（書かなければ0）だけ MP を使う。false なら攻撃の魔法と精霊だけ
  mpAllCards: false,
  // MP：自分のターンの始めに増える量（0 なら自然には増えない）
  mpPerTurn: 0,
  // 後攻（先攻以外の人）の補正：最初の MP がこれだけ多い（チーム戦では使わない）
  secondPlayerMp: 0,
  // 後半ほど強い魔物が出やすくなる：魔物の重み × (1 + この値 × ごほうびの段階 × 出はじめてからの周回の数)。0 なら重みは変わらない
  monsterLateBias: 0,
  // 魔物を放置すると、この周回ごとにレアリティが1つ上がって強くなる（0 なら強くならない）。強くなる倍率は monsterEvolveMultiplier
  monsterEvolveEvery: 0,
  monsterEvolveMultiplier: 1,
  // デッキ編成（deckMode "cost"）：合計コストの範囲と、何も選ばなかった席が使う decks.json のデッキ
  ...DECK_COST_DEFAULTS,
  defaultCostDeck: null,
  // 天候（weather.json を渡したとき）：出はじめる周回と、天候が切り替わるときに新しい天候になる確率（0 ならずっと天候なし）
  weatherFirstRound: 2,
  weatherChangeChance: 0,
  // 昼と夜：出はじめる周回・夜が続く周回の数・夜に強くなる量（獣＝魔物の駒、暗殺者・忍者、魔物の城への攻撃）
  nightFirstRound: 2,
  nightRounds: 2,
  nightBeastAttack: 0,
  nightStealthAttack: 0,
  nightMonsterAttack: 0,
  // 後攻（先攻以外の人）の補正：初期手札に足す枚数と、最初から持っている城壁（チーム戦では使わない）
  secondPlayerHandBonus: 0,
  secondPlayerArmor: 0,
  // マリガン：true なら、start() のあと全員が1回だけ手札を引き直せる（phase "mulligan"）
  mulligan: false,
  // 背水の陣：城HPが上限 × overdriveHpRatio（四捨五入）以下になると、その城の兵士全員の攻撃 +overdriveAttack（0 なら使わない）
  overdriveAttack: 0,
  // 城への魔法（damageEnemyCastle）を、選んだレーンの相手の先頭の兵士に当てる（いなければ城に当たる）。false なら今までどおり城に当たる
  castleSpellHitsFront: false,
  // 属性の付着（reactions を渡したゲームだけ）：true なら、自分のターンの始めに、敵の見える兵士1体にランダムな属性を付着させる（反応は起こさない）
  randomAttachTurnStart: false,
  // 4陣営：光の先制。光属性の兵士が兵士と戦うとき、自分の攻撃で相手を倒せるなら、相手の反撃を受けない
  lightFirstStrike: false,
  // 4陣営（実験用）：光の触媒。光の攻撃が、属性の付いた敵兵士に当たると、その属性（光以外）を消して、1種類ごとに追加ダメージ（0 なら使わない）
  lightCatalyst: 0,
  // 4陣営（試作）：城の付着と反応（reactions を渡したゲームだけ）。true なら、属性つきの魔法・兵士・射撃が城に当たると城に属性が付き、
  // 別の属性が当たると反応する。castleAttachTurns は付着の残り（城の持ち主のターンの終わりに1減る）、castleReactionPerRound は同じ城で1周回に起きる反応の上限
  castleAttach: false,
  castleAttachTurns: 4,
  castleReactionPerRound: 1,
  // 4陣営：true なら、凍結中（frozen > 0）の兵士は氷（ice）が付着している扱いで反応を判定する（実際の付着は足さない）。false なら今までどおり
  frozenCountsAsIce: false,
  // 崩壊の刻：collapseStartRound（0 なら使わない）の周回から、周回の始めに全員の城に collapseDamage × (始まってからの周回の数) のダメージ。
  // collapseAnnounceRound（0 なら予告しない）の周回で予告する
  collapseStartRound: 0,
  collapseAnnounceRound: 0,
  collapseDamage: 1,
};
/** 文字列で選ぶ項目と、選べる値（最初の値が省略したときの値） */
const CHOICE_RULES = {
  winCondition: ['firstDestroy', 'lastStanding'],
  castleSpellRange: ['any', 'neighbors'],
  // "cost"：1人1つのデッキを、コスト（rarities.json の deckCost）で編成する（setup.deckLists か、decks.json の costDeck: true のデッキ）
  deckMode: ['shared', 'own', 'cost'],
  // 3人以上の道の形："ring"（となりの席どうし）か "plaza"（真ん中の広場を通って、だれの城へも行ける）。2人ならどちらも同じ
  roadLayout: ['ring', 'plaza'],
  // チーム戦の手番："rotate"（チームを交互に、1回の手番はメンバー1人。A1 → B1 → A2 → B2 …）か
  // "all"（チームの手番でメンバー全員が順に動く。A1 → A2 → B1 → B2 …）
  teamTurns: ['rotate', 'all'],
};
/** 0以上1以下の数（整数でなくてよい）の省略できる項目 */
const OPTIONAL_RATE_RULES = {
  monsterSpawnChance: 0, // 周回の始めに、魔物がいない道ごとに魔物が出る確率
  overdriveHpRatio: 0, // 背水の陣になる城HPの割合（上限に対して。0 なら使わない）
  nightChance: 0, // 昼のとき、周回の始めに夜になる確率（0 なら夜にならない。ステージの nightChance が優先）
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

/** 忍者（見えない兵士）について、相手に隠すイベント。城・魔物へのダメージ（castleDamaged・monsterDamaged）は見せる */
/** コインのカード（1ターンに coinCardsPerTurn 枚まで）：コインを増やすカードとコインサイコロ */
const isCoinCard = (def) => def.effect === 'gainCoins' || (def.effect === 'dice' && def.dice === 'coin');

/** 城HPが変わるイベント（このあと背水の陣を確かめる） */
const CASTLE_HP_EVENTS = new Set(['castleDamaged', 'castleHealed', 'monsterAttackedCastle']);
/** 死者を従える（魔族のパッシブ）で生まれた骸骨兵の type（カードではない。cardDefs にはない） */
const RAISED_TYPE = 'raisedSoldier';

const STEALTH_EVENTS = new Set([
  'soldierDeployed', 'soldierMoved', 'soldierDamaged', 'soldierDestroyed', 'statusApplied', 'statusCleared',
  'weaponEquipped', 'shieldAdded', 'soldierBuffed', 'monsterClashed',
  // 4陣営
  'soldierHealed', 'castleGuardSet', 'shieldBroken',
]);
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
   * @param {object} [options.elements] 属性の強弱の表（data/classic/elements.json の中身）。省略すると今までの4属性の輪
   * @param {object} [options.reactions] 属性の付着と反応（data/classic/reactions.json の中身）。省略すると付着・反応は起きない
   * @param {{castles?: string[], decks?: string[]}} [options.setup] 席ごとの城の種類・デッキ
   */
  constructor({ cards, rules, rng = Math.random, monsters = null, upgrades = null, castles = null, decks = null, rarities = null, weather = null, stages = null, elements = null, reactions = null, setup: setupArg = {} } = {}) {
    const setup = setupArg ?? {};
    // elements（data/classic/elements.json の中身）：属性の強弱の表。省略すると今までの4属性の輪
    if (elements !== null) validateElements(elements);
    const allowedElements = elementIds(elements);
    // reactions（data/classic/reactions.json の中身）：属性の付着と反応。省略すると付着・反応は起きない（通常モード）
    if (reactions !== null) validateReactions(reactions, allowedElements);
    if (rarities !== null) validateRarities(rarities);
    Card.validateDefinitions(cards, rarities, allowedElements);
    Game.validateRules(rules);
    if (typeof rng !== 'function') throw new Error('rng は 0以上1未満の数を返す関数にしてください');
    if (monsters !== null) {
      Monster.validateDefinitions(monsters, allowedElements);
      if (rules.laneLength % 2 === 0) throw new Error('魔物を使うときは、真ん中のマスがひとつに決まるよう rules.json の laneLength を奇数にしてください');
    }
    if (weather !== null) validateWeather(weather, allowedElements);
    if (stages !== null) validateStages(stages, allowedElements);
    if (upgrades !== null) validateUpgrades(upgrades);
    if (castles !== null) validateCastles(castles);
    if (decks !== null) {
      validateDecks(decks, cards);
      for (const [id, d] of Object.entries(decks)) if (d.passiveSpirits !== undefined) validatePassiveSpirits(d.passiveSpirits, allowedElements, `decks の "${id}"`);
      for (const [id, d] of Object.entries(decks)) if (d.passive !== undefined) validatePassive(d.passive, allowedElements, `decks の "${id}"`);
    }

    this.cardDefs = cards;
    /** 属性の強弱の表（null なら今までの4属性の輪） */
    this.elementDefs = elements;
    /** 属性の付着と反応（null なら付着も反応もしない） */
    this.reactionDefs = reactions;
    // 4陣営モードの状態を getState に出すか（使うデータのときだけキーを足す。今までのモードの getState の形は変えない）
    const reactionList = Object.values(reactions?.reactions ?? {});
    const cardList = Object.values(cards);
    this.extState = {
      slowBlind: reactionList.some((r) => r.slow || r.blind),
      healCut: reactionList.some((r) => r.healCut),
      guard: cardList.some((d) => d.effect === 'guardCastle'),
      blood: cardList.some((d) => d.bloodArmor),
      dots: [...new Set(reactionList.filter((r) => r.dot).map((r) => r.dot.status))],
      vulnerable: cardList.some((d) => d.effect === 'vulnerableCastle'),
    };
    this.rarityDefs = rarities;
    this.monsterDefs = monsters;
    this.weatherDefs = weather;
    /** 今の天候 { type, roundsLeft }（なければ null＝ふつうの天気） */
    this.weather = null;
    this.stageDefs = stages;
    /** ステージのID（stages を渡さなければ null）。試合の最初に決まり、変わらない */
    this.stage = null;
    /** 夜なら { roundsLeft }（昼なら null） */
    this.night = null;
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
    /** 崩壊の刻（rules.collapseStartRound が 0 なら使わない）：予告したか・始まったか */
    this.collapseAnnounced = false;
    this.collapseActive = false;
    /** 人ごとの「相手の城に与えたダメージの合計」（崩壊の刻で同時に城が落ちたときの決め手） */
    this.castleDamageDealt = new Map();
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
      player.mp = Math.min(this.rules.initialMp, this.rules.maxMp);
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
        // 4陣営：陣営の特性（森の常時の精霊）
        this.players[id].passiveSpirits = decks[deckIds[seat]].passiveSpirits ?? null;
        this.players[id].passive = decks[deckIds[seat]].passive ?? null;
        this.piles.set(id, pile);
      });
      // getState に常時の精霊のキーを足すのは、だれかが常時の精霊を持つゲームだけ
      this.extState.passiveSpirits = this.playerOrder.some((id) => this.players[id].passiveSpirits);
    } else if (this.rules.deckMode === 'cost') {
      // デッキ編成：席ごとに、編成した deckLists[席]（{ 種類: 枚数 }）か、decks.json の costDeck のデッキ（setup.decks[席] / rules.defaultCostDeck）
      if (!rarities) throw new Error('deckMode が "cost" のときは rarities（data/rarities.json）を渡してください');
      const n = this.rules.playerCount;
      const lists = setup.deckLists ?? [];
      if (!Array.isArray(lists) || lists.length > n) throw new Error(`setup.deckLists は人数ぶん（${n}個）までの配列にしてください`);
      this.playerOrder.forEach((id, seat) => {
        let list = lists[seat];
        let deckId = 'custom';
        if (list === undefined || list === null) {
          deckId = setup.decks?.[seat] ?? this.rules.defaultCostDeck;
          if (!decks || !Object.hasOwn(decks, deckId) || !decks[deckId].costDeck) throw new Error(`席${seat + 1}のデッキがありません（setup.deckLists か、decks.json の costDeck のデッキを選んでください）`);
          list = decks[deckId].cards;
        }
        const check = checkCostDeck(list, cards, rarities, this.rules);
        if (!check.ok) throw new Error(`席${seat + 1}のデッキが決まりに合いません：${check.reason}`);
        const pile = new Pile(id);
        const types = Object.entries(list).flatMap(([t, k]) => Array(k).fill(t));
        pile.deck = this.shuffle(types).map((type) => this.createCard(type));
        this.players[id].deckId = deckId;
        this.piles.set(id, pile);
      });
    } else {
      if (setup.decks !== undefined || setup.deckLists !== undefined) throw new Error('setup.decks / setup.deckLists を使うときは、rules.json の deckMode を "own" か "cost" にしてください');
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

    // 先攻：setup.firstPlayer（省略すると席順の最初の人）。コイントスの結果を画面・サーバーが渡す。チーム戦では席順のまま
    const first = setup.firstPlayer ?? this.playerOrder[0];
    if (!this.playerOrder.includes(first)) throw new Error(`setup.firstPlayer は ${this.playerOrder.join(' / ')} のどれかにしてください`);
    if (first !== this.playerOrder[0] && this.teamOrder) throw new Error('チーム戦では setup.firstPlayer を使えません（チームの順で始まります）');
    this.firstPlayer = first;
    this.currentPlayer = first;
    // 後攻の補正：先攻以外の人は、初期手札が secondPlayerHandBonus 枚多く、最初から城壁 secondPlayerArmor を持つ
    if (!this.teamOrder) {
      for (const id of this.playerOrder) {
        if (id === first) continue;
        const pile = this.piles.get(id);
        for (let i = 0; i < this.rules.secondPlayerHandBonus; i++) {
          const card = pile.deck.shift();
          if (!card) break;
          this.players[id].hand.push(card);
        }
        if (this.rules.secondPlayerArmor > 0) {
          this.players[id].armor = this.rules.armorMax ? Math.min(this.rules.armorMax, this.rules.secondPlayerArmor) : this.rules.secondPlayerArmor;
        }
        // 後攻のマナ：最初の MP が secondPlayerMp だけ多い（上限まで。イベントは出さない）
        if (this.rules.secondPlayerMp > 0) {
          this.players[id].mp = Math.min(this.rules.maxMp, this.players[id].mp + this.rules.secondPlayerMp);
        }
      }
    }
    /** 背水の陣になっている城（城の持ち主のID） */
    this.overdrive = new Set();
    /** マリガン（phase "mulligan"）で、まだ選んでいない人 */
    this.mulliganPending = new Set();

    // ステージ：setup.stage（ID か "random"。省略すると "random"）。山札を作ったあとに選ぶ（ステージを使わないときの山札の並びを変えないため）
    if (stages !== null) {
      const want = setup.stage ?? 'random';
      if (want !== 'random' && !Object.hasOwn(stages, want)) throw new Error(`setup.stage は stages.json のステージか "random" にしてください（"${want}"）`);
      this.stage = want === 'random' ? pickStage(stages, this.rng) : want;
    } else if (setup.stage !== undefined && setup.stage !== null) {
      throw new Error('setup.stage を使うときは stages（data/stages.json）を渡してください');
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
    for (const key of ['elementBonus', 'monsterFirstRound', 'monsterCooldownRounds', 'maxRounds', 'drawUntilHand', 'initialCoins', 'coinPerTurn', 'monsterAttackGrowth', 'initialMp', 'maxMp', 'monsterEvolveEvery', 'nightFirstRound', 'nightBeastAttack', 'nightStealthAttack', 'nightMonsterAttack', 'secondPlayerHandBonus', 'secondPlayerArmor', 'overdriveAttack', 'collapseStartRound', 'collapseAnnounceRound', 'mpPerTurn', 'secondPlayerMp']) {
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
    if (rules.nightRounds !== undefined && (!Number.isInteger(rules.nightRounds) || rules.nightRounds < 1)) throw new Error('rules.json の nightRounds は 1 以上の整数にしてください');
    if (rules.collapseDamage !== undefined && (!Number.isInteger(rules.collapseDamage) || rules.collapseDamage < 1)) throw new Error('rules.json の collapseDamage は 1 以上の整数にしてください（書かなければ 1）');
    if (rules.collapseAnnounceRound > 0 && rules.collapseStartRound > 0 && rules.collapseAnnounceRound > rules.collapseStartRound) {
      throw new Error('rules.json の collapseAnnounceRound は collapseStartRound 以下にしてください');
    }
    if (rules.castleSpellHitsFront !== undefined && typeof rules.castleSpellHitsFront !== 'boolean') throw new Error('rules.json の castleSpellHitsFront は true か false にしてください');
    if (rules.randomAttachTurnStart !== undefined && typeof rules.randomAttachTurnStart !== 'boolean') throw new Error('rules.json の randomAttachTurnStart は true か false にしてください（書かなければ false）');
    if (rules.lightFirstStrike !== undefined && typeof rules.lightFirstStrike !== 'boolean') throw new Error('rules.json の lightFirstStrike は true か false にしてください（書かなければ false）');
    if (rules.lightCatalyst !== undefined && (!Number.isInteger(rules.lightCatalyst) || rules.lightCatalyst < 0)) throw new Error('rules.json の lightCatalyst は 0 以上の整数にしてください（書かなければ 0）');
    if (rules.castleAttach !== undefined && typeof rules.castleAttach !== 'boolean') throw new Error('rules.json の castleAttach は true か false にしてください（書かなければ false）');
    if (rules.castleAttachTurns !== undefined && (!Number.isInteger(rules.castleAttachTurns) || rules.castleAttachTurns < 1)) throw new Error('rules.json の castleAttachTurns は 1 以上の整数にしてください（書かなければ 4）');
    if (rules.castleReactionPerRound !== undefined && (!Number.isInteger(rules.castleReactionPerRound) || rules.castleReactionPerRound < 0)) throw new Error('rules.json の castleReactionPerRound は 0 以上の整数にしてください（0 は上限なし。書かなければ 1）');
    if (rules.frozenCountsAsIce !== undefined && typeof rules.frozenCountsAsIce !== 'boolean') throw new Error('rules.json の frozenCountsAsIce は true か false にしてください（書かなければ false）');
    if (rules.mpAllCards !== undefined && typeof rules.mpAllCards !== 'boolean') throw new Error('rules.json の mpAllCards は true か false にしてください（書かなければ false）');
    for (const key of ['monsterLateBias', 'monsterEvolveMultiplier']) {
      const v = rules[key];
      if (v !== undefined && (typeof v !== 'number' || !(v >= 0))) throw new Error(`rules.json の ${key} は 0 以上の数にしてください（書かなければ ${OPTIONAL_RULES[key]}）`);
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
    for (const key of ['armorMax', 'poisonTurns', 'poisonMax', 'coinCardsPerTurn']) {
      if (rules[key] !== undefined && !(Number.isInteger(rules[key]) && rules[key] >= 0)) {
        throw new Error(`rules.json の ${key} は0以上の整数にしてください（書かなければ 0）`);
      }
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
    // 忍者（見えない兵士）に関わるイベントには、持ち主の陣地（stealth）を付ける。
    // 相手には visibility.js（filterEventFor）がこのイベントを隠す（城・魔物へのダメージは見える）
    const sid = payload?.soldierId ?? payload?.attacker?.soldierId;
    if (sid && this.stealthSides?.has(sid) && STEALTH_EVENTS.has(type)) payload = { ...payload, stealth: this.stealthSides.get(sid) };
    // 忍者が身代わりになったときの castleGuarded：城が攻撃を受けなかったことは相手にも伝える。隠すのは soldierId だけ
    // （stealthSoldier に忍者の持ち主の陣地を入れ、visibility.js が同じ陣地でない人には soldierId を消す）
    else if (type === 'castleGuarded' && sid && this.stealthSides?.has(sid)) payload = { ...payload, stealthSoldier: this.stealthSides.get(sid) };
    for (const handler of [...this.listeners.get(type)]) {
      try {
        handler(payload);
      } catch (err) {
        // 画面側のエラーでゲームの状態が途中で止まらないようにする
        console.error(`イベント "${type}" の処理中にエラー:`, err);
      }
    }
    // 崩壊の刻を使うときだけ、相手の城に与えたダメージを数える
    if (type === 'castleDamaged' && this.rules.collapseStartRound > 0) this.countCastleDamage(payload);
    // 城HPが変わったら、背水の陣になったか（終わったか）を確かめる
    if (CASTLE_HP_EVENTS.has(type)) this.updateOverdrive();
  }

  /**
   * castleDamaged の「実際に城HPに入った量（amount − blocked）」を、与えた人に数える。
   * 数えないもの：自分で払うコスト（sacrifice / self）・崩壊・降参・天候・城の毒（だれのものか分からない）。
   * 兵士はその兵士の持ち主、反射は反射した人（creditTo）、ほかは手番の人。自分の陣地の城に入ったぶんは数えない
   */
  countCastleDamage({ playerId, amount, blocked, source }) {
    if (!source || ['sacrifice', 'self', 'collapse', 'surrender', 'weather', 'poison'].includes(source.kind)) return;
    let by = this.creditTo ?? this.currentPlayer;
    if (source.kind === 'soldier') by = this.playerOrder.find((id) => this.players[id].soldiers.some((x) => x.soldierId === source.soldierId)) ?? by;
    if (!by || this.side(by) === this.side(playerId)) return;
    const dealt = Math.max(0, amount - (blocked ?? 0));
    this.castleDamageDealt.set(by, (this.castleDamageDealt.get(by) ?? 0) + dealt);
  }

  /**
   * 崩壊の刻（周回の始め、天候のあと・魔物の城への攻撃の前）。予告 → 開始 → 全員の城に同じダメージ。
   * ダメージは collapseDamage × (始まってからの周回の数。始まった周回が1)。城壁が先に受ける（土の精霊は効かない）。
   * 城が落ちた人がいたら決着して true（reason "collapse"）
   */
  collapseRound() {
    const start = this.rules.collapseStartRound;
    if (!(start > 0)) return false;
    const announce = this.rules.collapseAnnounceRound;
    if (!this.collapseAnnounced && announce > 0 && this.round >= announce && this.round < start) {
      this.collapseAnnounced = true;
      this.emit('collapseAnnounced', { round: this.round, startRound: start });
    }
    if (this.round < start) return false;
    if (!this.collapseActive) {
      this.collapseActive = true;
      this.collapseAnnounced = true;
      this.emit('collapseStarted', { round: this.round });
    }
    const damage = this.rules.collapseDamage * (this.round - start + 1);
    for (const id of this.aliveSides()) {
      const owner = this.players[id];
      const blocked = Math.min(owner.armor, damage);
      owner.armor -= blocked;
      owner.castle.takeDamage(damage - blocked);
      this.emit('castleDamaged', { playerId: id, amount: damage, blocked, hp: owner.castle.hp, source: { kind: 'collapse' } });
    }
    const sides = this.aliveSides();
    const fallen = sides.filter((id) => this.players[id].castle.isDestroyed);
    if (fallen.length === 0) return false;
    const standing = sides.filter((id) => !fallen.includes(id));
    // バトルロイヤルで2つ以上の城が残っていれば、落ちた人だけ抜けて続ける
    if (this.rules.winCondition === 'lastStanding' && standing.length >= 2) {
      for (const id of this.alivePlayerIds().filter((x) => fallen.includes(this.side(x)))) this.eliminate(this.players[id], null);
      return false;
    }
    // 残った城があれば、その中から。全部落ちたら全員の中から、相手の城に与えたダメージの合計が大きい陣地（同じなら席順が後ろ）
    const pool = standing.length > 0 ? standing : fallen;
    const dealtBy = (side) => this.playerOrder.filter((x) => this.side(x) === side).reduce((n, x) => n + (this.castleDamageDealt.get(x) ?? 0), 0);
    const seat = (side) => this.playerOrder.indexOf(side);
    const winner = [...pool].sort((a, b) => dealtBy(b) - dealtBy(a) || seat(b) - seat(a))[0];
    this.finish(winner, 'collapse');
    return true;
  }

  /** 背水の陣になる城HP（上限 × overdriveHpRatio を四捨五入）。使わないなら -1 */
  overdriveLine(owner) {
    if (!this.rules.overdriveAttack || !this.rules.overdriveHpRatio) return -1;
    return Math.round(owner.castle.maxHp * this.rules.overdriveHpRatio);
  }

  /** 城ごとに背水の陣かを確かめ、変わったら overdriveChanged を出す */
  updateOverdrive() {
    if (!this.rules.overdriveAttack || !this.rules.overdriveHpRatio) return;
    for (const id of this.aliveSides()) {
      const owner = this.players[id];
      const on = owner.castle.hp > 0 && owner.castle.hp <= this.overdriveLine(owner);
      if (on === this.overdrive.has(id)) continue;
      if (on) this.overdrive.add(id);
      else this.overdrive.delete(id);
      this.emit('overdriveChanged', { playerId: id, active: on, hp: owner.castle.hp, attack: this.rules.overdriveAttack });
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
      // 排出率の恒久強化：chance の確率で、山札からではなく、排出率を上げて引き当てる（山札は減らない）
      if (player.permLuck && this.rarityDefs && this.rng() < player.permLuck.chance) {
        const type = sampleType(this.cardDefs, this.rarityDefs, this.rng, { from: player.permLuck.from, multiplier: player.permLuck.boost });
        const lucky = this.createCard(type);
        player.hand.push(lucky);
        cardIds.push(lucky.cardId);
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
    // マリガン：全員が手札を引き直すか選んでから、先攻のターン1が始まる
    if (this.rules.mulligan) {
      this.phase = 'mulligan';
      this.mulliganPending = new Set(this.alivePlayerIds());
      this.emit('mulliganStarted', { playerIds: [...this.mulliganPending], firstPlayer: this.firstPlayer });
      return ok();
    }
    this.beginTurn(this.firstPlayer);
    return ok();
  }

  /** 周回を始める人（先攻から席順に数えて、まだ負けていない最初の人） */
  roundLeader() {
    const order = this.playerOrder;
    const start = order.indexOf(this.firstPlayer);
    for (let i = 0; i < order.length; i++) {
      const id = order[(start + i) % order.length];
      if (!this.players[id].eliminated) return id;
    }
    return null;
  }

  /**
   * マリガン：最初の手札から cardIds（0枚でもよい）を山札に戻してシャッフルし、同じ枚数を引き直す。1人1回だけ。
   * 全員が選び終わったら、先攻のターン1が始まる。自分の番でなくても送れる
   */
  mulligan(playerId, cardIds = []) {
    if (this.phase !== 'mulligan') return fail('今は手札を引き直す場面ではありません');
    if (!this.mulliganPending.has(playerId)) return fail('手札の引き直しはもう選びました');
    if (!Array.isArray(cardIds)) return fail('引き直すカードのIDを配列で渡してください');
    const player = this.players[playerId];
    if (new Set(cardIds).size !== cardIds.length) return fail('同じカードを2回選んでいます');
    const cards = cardIds.map((id) => player.findInHand(id));
    if (cards.some((c) => !c)) return fail('そのカードは手札にありません');
    const pile = this.pileOf(playerId);
    player.hand = player.hand.filter((c) => !cardIds.includes(c.cardId));
    pile.deck.push(...cards);
    pile.deck = this.shuffle(pile.deck);
    const drawn = [];
    for (let i = 0; i < cards.length; i++) {
      const card = pile.deck.shift();
      if (!card) break;
      player.hand.push(card);
      drawn.push(card.cardId);
    }
    this.mulliganPending.delete(playerId);
    this.emit('mulliganDone', { playerId, count: cards.length, returnedIds: [...cardIds], cardIds: drawn });
    if (this.mulliganPending.size === 0) this.beginTurn(this.firstPlayer);
    return ok();
  }

  /** ターン開始：（城壁が消える）→ ドロー → 進軍 → メインへ */
  beginTurn(playerId, { continueRound = false } = {}) {
    // 周回の上限：その周回を全員が終えたら、城HPの割合で決着
    // continueRound：周回の始めに手番の人が抜けて、同じ周回のまま次の人に回すとき
    // チーム戦は、最初のチームの手番が来るたびに周回が変わる
    const isRoundStart = !continueRound && (this.teamOrder
      ? this.teamOf.get(playerId) === this.aliveTeams()[0] && (this.rules.teamTurns === 'rotate' || this.teamCursor.get(this.teamOf.get(playerId)) === -1)
      : playerId === this.roundLeader());
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
    player.coinCardsPlayedThisTurn = 0;
    const playedLastTurn = player.cardsPlayedThisTurn;
    player.cardsPlayedThisTurn = 0;
    this.emit('turnStarted', { playerId, turn: this.turn });

    // 周回の始め（席順の最初の人のターン）：魔物が城を攻める → 魔物が出る
    if (isRoundStart) {
      this.round += 1;
      this.emit('roundStarted', { round: this.round });
      this.tickWeather();
      this.tickNight();
      // 天候の雷・砂嵐で城が落ちたら、そこで止める
      if (this.weatherRoundEffects() && this.checkGameOver()) return;
      this.stageEruption();
      // 崩壊の刻：全員の城にダメージ。城が落ちたら、そこで決着
      if (this.collapseRound()) return;
      // （バトルロイヤルで）手番の人が崩壊で抜けたら、次の人の番にする
      if (this.rules.collapseStartRound > 0 && player.eliminated) {
        this.spawnMonsters();
        this.beginTurn(this.nextPlayerAfter(playerId), { continueRound: true });
        return;
      }
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

    // 城壁は、自分の次のターンの始めに消える（armorMax があるときは永続）
    if (player.armor > 0 && !this.rules.armorMax) {
      player.armor = 0;
      this.emit('armorExpired', { playerId });
    }

    // 毒の城：自分のターンの始めに毒のダメージ（城壁は効かない。城が落ちたら、そこで止める）
    if (this.tickCastlePoison(player)) return;
    // 回復量減少（深淵侵食）：城の持ち主のターンの始めに残りを1減らす
    this.tickHealCut(player);
    // 脆弱（魔族）：同じく、城の持ち主のターンの始めに残りを1減らす
    this.tickVulnerable(player);
    if (player.eliminated) {
      this.beginTurn(this.nextPlayerAfter(playerId), { continueRound: true });
      return;
    }

    // コイン：自分のターンの始めに coinPerTurn 枚もらえる
    if (this.rules.coinPerTurn > 0) this.changeCoins(player, this.rules.coinPerTurn, 'turn');
    // コインの雨：自分のターンの始めにコインがもらえる
    const rainCoins = this.weatherDef()?.coinPerTurn ?? 0;
    if (rainCoins > 0) this.changeCoins(player, rainCoins, 'weather');
    // MP の自然回復：自分のターンの始めに mpPerTurn 増える（上限まで）
    // 魔族の魔の血：MP の回復が mpBonus 多い
    if (this.rules.mpPerTurn > 0 && this.rules.maxMp > 0) this.changeMp(player, this.rules.mpPerTurn + (player.passive?.magicBlood?.mpBonus ?? 0), 'turn');
    // 古代遺跡：自分のターンの始めに MP が増える
    const stageMp = this.stageDef()?.mpPerTurn ?? 0;
    if (stageMp > 0 && this.rules.maxMp > 0) this.changeMp(player, stageMp, 'stage');

    // 属性のランダム付着：コイン・MP のあと、ドローの前（手札を引く前に盤面の状態が決まる）。
    // 自分の進軍の前なので、そのターンのうちに自分の武器・魔法で反応を起こせる
    this.randomAttachAtTurnStart(player);
    // 4陣営の森：常時の精霊が1体動く（randomAttach と同じ位置）。城が落ちて決着したら、そこで止める
    if (this.actPassiveSpirit(player)) return;

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
        // turns が null の毒は永続（解毒薬か、兵士が倒れるまで続く）
        if (soldier.poison.turns !== null) soldier.poison.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.poison.turns !== null && soldier.poison.turns <= 0) {
          soldier.poison = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'poison' });
        }
      }
      // やけど（盾は効かない。毒と同じく、回数が来たら治る）
      if (soldier.burn) {
        const { amount } = soldier.burn;
        soldier.takeDamage(amount, { ignoreShield: true });
        this.emit('soldierDamaged', {
          playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: 'burn', blocked: 0,
        });
        soldier.burn.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.burn.turns <= 0) {
          soldier.burn = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'burn' });
        }
      }
      // 4陣営の継続ダメージ（砂・凍傷。反応の dot）：やけどと同じく盾は効かず、回数が来たら治る
      let dotKilled = false;
      for (const status of DOT_STATUSES) {
        if (!soldier[status]) continue;
        const { amount } = soldier[status];
        soldier.takeDamage(amount, { ignoreShield: true });
        this.emit('soldierDamaged', { playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: status, blocked: 0 });
        soldier[status].turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          dotKilled = true;
          break;
        }
        if (soldier[status].turns <= 0) {
          soldier[status] = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status });
        }
      }
      if (dotKilled) continue;
      // 凍結：この進軍は休む
      if (soldier.frozen > 0) {
        soldier.frozen -= 1;
        if (soldier.frozen === 0) {
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'frozen' });
        }
        // 凍った弓兵・魔法使いは撃てないが、ターンは過ぎる
        if (soldier.isStationary) this.tickRanged(player, soldier);
        continue;
      }

      // 嵐：進む兵士は動かない（弓兵・魔法使いは撃てる）
      if (!soldier.isStationary && this.weatherDef()?.stopMarch) continue;

      // 弓兵・魔法使いは動かずに撃つ
      if (soldier.isRanged) {
        if (this.shoot(player, soldier)) return;
        continue;
      }
      // 護衛（ゴーレム）は動かずに守る。自分から戦いには行かず、ターンが過ぎるだけ
      if (soldier.isGuard) {
        this.tickRanged(player, soldier);
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
        // 氷のステージ：止められずに歩き切ったら、滑って1マス余分に進むことがある
        let slipped = false;
        const slip = this.stageDef()?.slipChance ?? 0;
        if (slip > 0 && moved > 0 && steps >= speed && !opponent && !monster && !soldier.hasReachedCastle(laneLength) && this.rng() < slip) {
          soldier.moveForward();
          moved += 1;
          slipped = true;
          if (!soldier.hasReachedCastle(laneLength)) {
            opponent = this.findClashTarget(soldier, player);
            if (!opponent) monster = this.findMonsterInRange(soldier, player);
          }
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
            ...(slipped ? { slipped: true } : {}),
          });
        }
        if (!opponent) break;
        this.fight(player, soldier, opponent.owner, opponent.soldier, opponent.q - soldier.position > 1);
        // 反応（轟雷爆炎）は城にもダメージを与えるので、城が落ちたらここで止める（反応のないゲームでは城は減らない）
        if (this.reactionDefs && this.checkGameOver()) return;
        const keepGoing = this.rules.advanceAfterWin && opponent.soldier.isDead && !soldier.isDead && steps < speed;
        if (!keepGoing) break;
      }
      if (monster) {
        this.fightMonster(player, soldier, monster);
        continue;
      }
      if (!reached) continue;

      const damage = this.stageBoost(soldier, this.attackOf(soldier)) * this.rules.soldierCastleDamageMultiplier;
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
    // 呪い：進軍が終わったら残りを1減らす（防御待ちで止まったときは、続きの進軍が終わってから）
    this.tickWeakened(player);
    // 鈍足・目くらまし（4陣営の反応）も同じ
    this.tickReactionStatuses(player);
    // 付着も同じく、進軍が終わったら残りを1減らす
    this.tickAttachments(player);
  }

  /** 毒の量を上限（poisonMax。0 は上限なし）でおさえる */
  capPoison(amount) {
    return this.rules.poisonMax ? Math.min(this.rules.poisonMax, amount) : amount;
  }

  /** その城壁を今置いても、何も増えないか */
  armorFull(player, def) {
    return this.rules.armorMax ? player.armor >= this.rules.armorMax : player.armor >= def.amount;
  }

  /**
   * 城にダメージ。城壁が先に受ける（ignoreArmor なら城壁を通さない）。castleDamaged を出す。
   * 4陣営：身代わり（castle.guard）がいれば、相手からの攻撃（兵士・魔法・精霊・反応）はその兵士が代わりに受ける。
   * 血の膜（castle.bloodArmor）の城壁が受けたぶんは、城HPが回復する
   */
  damageCastle(owner, amount, source, { ignoreArmor = false, raw = false } = {}) {
    // raw：城に起きた反応のダメージ（身代わり・土の精霊を通さない。城壁は先に受ける）
    if (!raw && owner.castle.guard && GUARDED_SOURCES.includes(source?.kind) && this.guardCastleHit(owner, amount)) return;
    // 脆弱（魔族）：相手からの攻撃（兵士・魔法・精霊・反応）のダメージが増える（軽くする前に足す）
    const vulnerable = this.vulnerableBonus(owner, amount, source);
    amount += vulnerable;
    if (!raw) amount = this.reduceDamage(owner, amount, 'castle');
    if (source?.kind === 'spell') amount = this.magicBloodReduce(this.players[this.side(owner.id)], amount); // 魔族の魔の血
    const castle = owner.castle;
    const armorBefore = owner.armor;
    const blocked = ignoreArmor ? 0 : Math.min(owner.armor, amount);
    owner.armor -= blocked;
    castle.takeDamage(amount - blocked);
    this.emit('castleDamaged', { playerId: owner.id, amount, blocked, hp: castle.hp, source, ...(ignoreArmor ? { ignoreArmor: true } : {}), ...(vulnerable > 0 ? { vulnerable } : {}) });
    if (castle.bloodArmor > 0) {
      // 血の膜：城壁のうち血の膜のぶん（ほかの城壁より先に削れる）が受けた量だけ回復（城が落ちたら回復しない）
      castle.bloodArmor = Math.min(castle.bloodArmor, armorBefore);
      const blood = Math.min(blocked, castle.bloodArmor);
      castle.bloodArmor -= blood;
      if (blood > 0 && !castle.isDestroyed) {
        const healed = castle.heal(blood);
        if (healed > 0) this.emit('castleHealed', { playerId: owner.id, amount: healed, hp: castle.hp, source: { kind: 'bloodArmor' } });
      }
    }
    // 4陣営の魔族：闇の侵食（城壁が全部受けても起きる。城に付着・反応するより前）
    if (!raw) this.darkErosionHit(owner, source);
    // 4陣営（試作）：属性つきの攻撃が城に当たったら、城に付着か反応（城壁が全部受けても付く）
    if (!raw) this.castleElementHit(owner, this.castleHitElement(source), source);
  }

  /**
   * 城に当たった攻撃の、撃った側の兵士か魔法：{ attacker（プレイヤー）, element }。兵士（城に着いた・魔法使いの射撃）は兵士の持ち主と属性、
   * 魔法は手番の人とカードの属性。分からなければ null（castleAttach を使わないゲームでも使う）
   */
  castleHitBy(source) {
    if (source?.kind === 'soldier') {
      for (const p of Object.values(this.players)) {
        const x = p.soldiers.find((s) => s.soldierId === source.soldierId);
        if (x) return { attacker: p, soldier: x, element: x.element ?? null };
      }
      return null;
    }
    if (source?.kind === 'spell') return { attacker: this.players[this.currentPlayer], soldier: null, element: this.cardDefs[source.type]?.element ?? null };
    return null;
  }

  /**
   * 魔族の闇の侵食（席のデッキの passive.darkErosion）：その陣営の、element（闇）の兵士・魔法の攻撃が敵の城に当たると、城の回復量が ratio 減る
   * （深淵侵食と同じ castle.healCut。残りは城の持ち主のターンの始めに1減る）。重ねがけ：割合は増やさず、残りに turns を足す（maxTurns まで）。
   * もっと強い回復量減少（深淵侵食）がかかっていれば、割合はそのまま、残りは長い方にそろえる。castleHealCut（source "erosion"）を出す
   */
  darkErosionHit(owner, source) {
    const hit = this.castleHitBy(source);
    const def = hit?.attacker?.passive?.darkErosion;
    if (!def || hit.element !== def.element || this.side(hit.attacker.id) === this.side(owner.id)) return;
    const side = this.players[this.side(owner.id)];
    if (side.castle.isDestroyed) return;
    const cur = side.castle.healCut;
    if (cur && cur.ratio > def.ratio) cur.turns = Math.max(cur.turns, def.turns);
    else side.castle.healCut = { ratio: def.ratio, turns: Math.min(def.maxTurns ?? def.turns, (cur?.turns ?? 0) + def.turns) };
    this.emit('castleHealCut', { playerId: side.id, ratio: side.castle.healCut.ratio, turns: side.castle.healCut.turns, source: 'erosion' });
  }

  // ================= 城の付着と反応（4陣営・試作。rules.castleAttach と reactions を渡したゲームだけ） =================

  /** 城に当たった攻撃の属性：魔法はカードの element、兵士（城に着いた・魔法使いの射撃）はその兵士の属性（武器・生まれつき）。ほかは null */
  castleHitElement(source) {
    if (!this.reactionDefs || !this.rules.castleAttach || !source) return null;
    if (source.kind === 'spell') return this.cardDefs[source.type]?.element ?? null;
    if (source.kind === 'soldier') {
      for (const p of Object.values(this.players)) {
        const x = p.soldiers.find((s) => s.soldierId === source.soldierId);
        if (x) return x.element ?? null;
      }
    }
    return null;
  }

  /**
   * 属性 element の攻撃が owner の城（チーム戦は城の持ち主の城）に当たった。付いている属性と反応の表で組になれば反応
   * （同じ城で1周回に castleReactionPerRound 回まで。上限なら反応せずに付着）、ならなければ付着（同じ属性なら残りを長い方に）。
   * castleAttach でない・属性なし・城が落ちたなら何もしない
   */
  castleElementHit(owner, element, source, { turns, react = true } = {}) {
    if (!this.reactionDefs || !this.rules.castleAttach || !element) return;
    const side = this.players[this.side(owner.id)];
    const castle = side.castle;
    if (castle.isDestroyed || side.eliminated) return;
    if (react) {
      const limit = this.rules.castleReactionPerRound;
      const used = castle.reactionRound === this.round ? castle.reactionCount : 0;
      const reaction = limit === 0 || used < limit ? this.matchReaction(castle.attachments.map((a) => a.element), element) : null;
      if (reaction) {
        castle.reactionRound = this.round;
        castle.reactionCount = used + 1;
        this.triggerCastleReaction(side, reaction);
        return;
      }
    }
    const t = turns ?? this.rules.castleAttachTurns;
    const found = castle.attachments.find((a) => a.element === element);
    if (found) found.turns = Math.max(found.turns, t);
    else castle.attachments.push({ element, turns: t });
    this.emit('castleElementAttached', { playerId: side.id, element, turns: (found ?? castle.attachments.at(-1)).turns, source: source ?? null });
  }

  /**
   * 城に起きた反応：castleReactionTriggered → 消えた属性の castleElementCleared → （深淵侵食）castleHealCut → castleDamaged（source { kind: "reaction" }）。
   * ダメージは反応の castle.damage（混沌反応は chaos.castleDamagePerElement × 種類。書かなければ兵士用の damage）。城壁が先に受け、
   * 身代わり・土の精霊・防御カードは効かない。溶岩（castle.armorBreak）はその前に城壁を追加で削る。凍結・やけど等の状態は城には付けない
   */
  triggerCastleReaction(side, reaction) {
    const castle = side.castle;
    const { def } = reaction;
    const chaos = this.reactionDefs.chaos;
    const damage = reaction.id === 'chaos'
      ? (chaos.castleDamagePerElement ?? chaos.damagePerElement) * reaction.elements.length
      : (def.castle?.damage ?? def.damage);
    const armorBroken = Math.min(side.armor, def.castle?.armorBreak ?? 0);
    this.emit('castleReactionTriggered', {
      playerId: side.id, reaction: reaction.id, name: reaction.name, elements: [...reaction.elements], damage, consumed: [...reaction.consumed],
      ...(armorBroken > 0 ? { armorBroken } : {}),
    });
    for (const element of reaction.consumed) {
      castle.attachments = castle.attachments.filter((a) => a.element !== element);
      this.emit('castleElementCleared', { playerId: side.id, element, reason: 'reaction' });
    }
    if (armorBroken > 0) {
      side.armor -= armorBroken;
      castle.bloodArmor = Math.min(castle.bloodArmor, side.armor);
    }
    if (def.healCut) {
      castle.healCut = { ratio: Math.max(def.healCut.ratio, castle.healCut?.ratio ?? 0), turns: Math.max(def.healCut.turns, castle.healCut?.turns ?? 0) };
      this.emit('castleHealCut', { playerId: side.id, ratio: castle.healCut.ratio, turns: castle.healCut.turns });
    }
    if (damage > 0) this.damageCastle(side, damage, { kind: 'reaction', reaction: reaction.id }, { raw: true });
  }

  /** 城の付着：城の持ち主（チーム戦なら代表）のターンの終わりに残りを1減らす（0で消える） */
  tickCastleAttachments(player) {
    if (!this.reactionDefs || !this.rules.castleAttach || this.side(player.id) !== player.id) return;
    const castle = player.castle;
    for (const a of [...castle.attachments]) {
      a.turns -= 1;
      if (a.turns > 0) continue;
      castle.attachments = castle.attachments.filter((x) => x !== a);
      this.emit('castleElementCleared', { playerId: player.id, element: a.element, reason: 'expired' });
    }
  }

  /**
   * 身代わり：owner の城を守る兵士が、城へのダメージを代わりに受ける（盾は効く。城壁は使わない）。
   * 守る兵士がもういなければ身代わりは消え、false（城がそのまま受ける）
   */
  guardCastleHit(owner, amount) {
    const castle = owner.castle;
    const soldierId = castle.guard;
    castle.guard = null;
    const side = this.side(owner.id);
    const holder = this.alivePlayerIds().map((id) => this.players[id]).find((p) => this.side(p.id) === side && p.soldiers.some((x) => x.soldierId === soldierId));
    if (!holder) return false;
    const soldier = holder.soldiers.find((x) => x.soldierId === soldierId);
    this.emit('castleGuarded', { playerId: owner.id, soldierId, guardOwnerId: holder.id, amount });
    this.damageSoldier(holder, soldier, amount, 'guard');
    return true;
  }

  /**
   * 毒の城：持ち主（チーム戦なら代表）のターンの始めに、毒の量ぶんダメージ（城壁も、土の精霊も効かない）。
   * castleDamaged（source: { kind: "poison" }）を出す。城が落ちてゲームが終わったら true
   */
  tickCastlePoison(player) {
    const poison = player.castle.poison;
    if (!poison || this.side(player.id) !== player.id) return false;
    player.castle.takeDamage(poison);
    this.emit('castleDamaged', { playerId: player.id, amount: poison, blocked: 0, hp: player.castle.hp, source: { kind: 'poison' } });
    // 毒に期限があるときは、ダメージのたびに1減って、0で治る
    if (player.castle.poisonTurns != null) {
      player.castle.poisonTurns -= 1;
      if (player.castle.poisonTurns <= 0 && player.castle.hp > 0) {
        player.castle.poison = null;
        player.castle.poisonTurns = null;
        this.emit('castleCured', { playerId: player.id });
      }
    }
    return this.checkGameOver();
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

  /**
   * 魔法が兵士に当たった：ダメージ（damageSoldier）のあと、生きていれば魔法の属性（card.def.element）を付着させる（反応することもある）。
   * reactions を渡していないゲームでは damageSoldier と同じ。消えたら true
   */
  spellHit(owner, soldier, amount, card) {
    amount = this.magicBloodReduce(owner, amount); // 魔族の魔の血
    if (this.damageSoldier(owner, soldier, amount, 'spell')) return true;
    this.elementHit(owner, soldier, card.def?.element ?? null, { damage: amount, turns: card.def?.attachTurns });
    return !owner.soldiers.includes(soldier);
  }

  // ================= 属性の付着と反応（reactions を渡したときだけ。CLAUDE.md「クラシックの付着と反応」） =================

  /** 兵士に付いている属性（武器の属性 → 付着の順。重なりは1つ） */
  elementsOn(soldier) {
    const list = soldier.element ? [soldier.element] : [];
    for (const a of soldier.attachments) if (!list.includes(a.element)) list.push(a.element);
    return list;
  }

  /**
   * 属性 element の攻撃が、owner の兵士 soldier に当たった（ダメージのあと。外れた攻撃では呼ばない）。
   * 反応の表で組になる属性が付いていれば反応する（1回の攻撃で1つ。3種類以上で混沌が入っていれば混沌反応が先、次に表の順）。反応しなければ付着する。
   * reactions を渡していない・属性なし・忍者・もう場にいない兵士なら何もしない（乱数も使わない）
   */
  elementHit(owner, soldier, element, { damage = 0, turns: attachTurns } = {}) {
    const defs = this.reactionDefs;
    if (!defs || !element || soldier.stealth || !owner.soldiers.includes(soldier)) return;
    const reaction = this.findReaction(soldier, element);
    if (reaction) {
      reaction.hit = damage; // 蒸発（multiplier）が使う、当たった攻撃のダメージ
      this.triggerReaction(owner, soldier, reaction);
      return;
    }
    // 4陣営（実験用）：光の触媒（rules.lightCatalyst）。反応が起きなかった光の攻撃が、光以外の属性（武器・生まれつき・付着）を持つ兵士に当たると、
    // その属性を全部消して、1種類ごとに lightCatalyst の追加ダメージ（反応と同じイベント。reaction は "lightCatalyst"。光は付着しない）
    if (element === 'light' && this.rules.lightCatalyst > 0) {
      const consumed = [...new Set([soldier.element, ...soldier.attachments.map((a) => a.element)])].filter((e) => e && e !== 'light');
      if (consumed.length > 0) {
        this.triggerReaction(owner, soldier, {
          id: 'lightCatalyst', name: '光の触媒', def: {}, damage: this.rules.lightCatalyst * consumed.length, elements: [...consumed, 'light'], consumed,
        });
        return;
      }
    }
    // 付着が残る回数（水流のように、魔法の attachTurns で長くできる）
    const turns = attachTurns ?? defs.attachTurns;
    const found = soldier.attachments.find((a) => a.element === element);
    if (found) found.turns = turns; // 同じ属性がまた付いたら、残りを戻す
    else soldier.attachments.push({ element, turns });
    this.emit('elementAttached', { playerId: owner.id, soldierId: soldier.soldierId, element, turns });
  }

  /**
   * 自分のターンの始め：敵の見える兵士（忍者は除く）からランダムに1体を選び、ランダムな属性を1つ付着させる（反応は起こさない）。
   * rules.randomAttachTurnStart が true で reactions を渡したゲームだけ。敵の兵士がいなければ何もしない（乱数も使わない）。
   * 将来スキルツリーが入ったら、ここの先頭の条件を「player がこの能力を持っているか」に変える
   */
  randomAttachAtTurnStart(player) {
    const defs = this.reactionDefs;
    if (!defs || !this.rules.randomAttachTurnStart) return;
    const targets = [];
    for (const enemy of this.opponentsOf(player.id)) for (const s of enemy.visibleSoldiers) targets.push({ enemy, s });
    if (targets.length === 0) return;
    const { enemy, s } = targets[Math.floor(this.rng() * targets.length)];
    const ids = elementIds(this.elementDefs);
    const element = ids[Math.floor(this.rng() * ids.length)];
    const turns = defs.randomAttach?.turns ?? defs.attachTurns;
    const found = s.attachments.find((a) => a.element === element);
    // 同じ属性がもう付いていたら、残りは長い方にそろえる（武器・魔法で付いた長い残りを、短いランダム付着で縮めない）
    if (found) found.turns = Math.max(found.turns, turns);
    else s.attachments.push({ element, turns });
    this.emit('elementAttached', { playerId: enemy.id, soldierId: s.soldierId, element, turns: (found ?? s.attachments.at(-1)).turns, source: 'turnStart' });
  }

  /**
   * 4陣営の森：常時の精霊（席のデッキの passiveSpirits）。自分のターンの始めに、spirits の精霊が順に1体ずつ動く（1ターン目は先頭）。
   * everyTurns（省略すると1）なら、自分の everyTurns ターンに1回だけ動く（1ターン目に動き、間のターンは休む。順番は動いたときだけ進む）。
   * passiveSpiritActed → 効果（castleDamaged / soldierMoved（"pushed"）・soldierDamaged（cause "spirit"））→ 動いた精霊の属性を
   * 敵の見える兵士全員に付着（elementAttached。反応は起こさない。reactions を渡したゲームだけ）。
   * 城を攻める相手は、まだ負けていない相手の陣地のうち席順で最初の陣地。防御は聞かない（身代わりは受ける）。霧で外れない。
   * 敵の兵士がいなければ、兵士への精霊は何もしない（付着もなし。passiveSpiritActed は出す）。城が落ちて決着したら true
   */
  actPassiveSpirit(player) {
    const def = player.passiveSpirits;
    if (!def) return false;
    // 動く間隔（everyTurns。省略すると1＝毎ターン）：休むターンは何もしない（順番も進まない）
    if (player.passiveSpiritWait > 0) {
      player.passiveSpiritWait -= 1;
      return false;
    }
    player.passiveSpiritWait = (def.everyTurns ?? 1) - 1;
    const sp = def.spirits[player.passiveSpiritIndex % def.spirits.length];
    player.passiveSpiritIndex = (player.passiveSpiritIndex + 1) % def.spirits.length;
    const mySide = this.side(player.id);
    const foes = () => this.alivePlayerIds().filter((id) => this.side(id) !== mySide).flatMap((id) =>
      this.players[id].visibleSoldiers.map((soldier) => ({ owner: this.players[id], soldier })));
    const base = { playerId: player.id, spirit: sp.spirit, name: sp.name, element: sp.element, effect: sp.effect, amount: sp.amount };
    if (sp.effect === 'castleDamage') {
      const target = this.enemySides(player.id)[0];
      if (!target) return false;
      this.emit('passiveSpiritActed', { ...base, targetId: target.id, soldierIds: [] });
      this.damageCastle(target, sp.amount, { kind: 'passiveSpirit', spirit: sp.spirit }, { ignoreArmor: Boolean(sp.ignoreArmor) });
      if (this.checkGameOver()) return true;
    } else if (sp.effect === 'soldiersDamage') {
      const list = foes();
      this.emit('passiveSpiritActed', { ...base, targetId: null, soldierIds: list.map((x) => x.soldier.soldierId) });
      for (const x of list) if (x.owner.soldiers.includes(x.soldier)) this.damageSoldier(x.owner, x.soldier, sp.amount, 'spirit');
    } else if (sp.effect === 'pushFront') {
      // 先頭：自分の城にいちばん近い（position がいちばん大きい。同じなら先に出された方）。マス0より後ろには下がらない
      const list = foes().sort((a, b) => b.soldier.position - a.soldier.position || soldierNumber(a.soldier) - soldierNumber(b.soldier));
      const front = list[0] ?? null;
      this.emit('passiveSpiritActed', { ...base, targetId: null, soldierIds: front ? [front.soldier.soldierId] : [], push: sp.push });
      if (front) {
        const { owner, soldier } = front;
        const from = soldier.position;
        const to = Math.max(0, from - sp.push);
        if (to !== from) {
          soldier.position = to;
          this.emit('soldierMoved', { playerId: owner.id, soldierId: soldier.soldierId, roadId: soldier.roadId, from, to, cause: 'pushed' });
        }
        this.damageSoldier(owner, soldier, sp.amount, 'spirit');
      }
    }
    // 試作（spiritAttachTo: "castle"）：兵士ではなく、敵の城（席順で最初の陣地）に付着（反応は起こさない。rules.castleAttach のときだけ）
    if (def.spiritAttachTo === 'castle') {
      const target = this.enemySides(player.id)[0];
      if (target) this.castleElementHit(target, sp.element, { kind: 'passiveSpirit', spirit: sp.spirit }, { turns: def.attachTurns, react: false });
      return false;
    }
    // 動いた精霊の属性を、敵の見える兵士全員に付着（残りは長い方にそろえる。反応は起こさない）
    if (this.reactionDefs) {
      for (const { owner, soldier } of foes()) {
        const found = soldier.attachments.find((a) => a.element === sp.element);
        if (found) found.turns = Math.max(found.turns, def.attachTurns);
        else soldier.attachments.push({ element: sp.element, turns: def.attachTurns });
        this.emit('elementAttached', { playerId: owner.id, soldierId: soldier.soldierId, element: sp.element, turns: (found ?? soldier.attachments.at(-1)).turns, source: 'passiveSpirit' });
      }
    }
    return false;
  }

  /** getState の常時の精霊：{ next, name, element, effect, amount, order, everyTurns, turnsUntilAct } か null。turnsUntilAct は、自分のターンの始めがあと何回来たら動くか（1＝次の自分のターン） */
  passiveSpiritState(player) {
    const def = player.passiveSpirits;
    if (!def) return null;
    const sp = def.spirits[player.passiveSpiritIndex % def.spirits.length];
    return {
      next: sp.spirit, name: sp.name, element: sp.element, effect: sp.effect, amount: sp.amount, order: def.spirits.map((x) => x.spirit),
      everyTurns: def.everyTurns ?? 1, turnsUntilAct: player.passiveSpiritWait + 1,
    };
  }

  /** 起こる反応（なければ null）。{ id, name, elements（反応した属性）, consumed（兵士から消える属性）, damage, def } */
  findReaction(soldier, element) {
    const on = this.elementsOn(soldier);
    // frozenCountsAsIce：凍結中の兵士には、氷が付着している扱い（判定用の仮想の付着。実際の付着と重ねて数えない）
    if (this.rules.frozenCountsAsIce && soldier.frozen > 0 && !on.includes('ice')) on.push('ice');
    return this.matchReaction(on, element);
  }

  /** 付いている属性 on に、属性 element が当たったときに起こる反応（なければ null）。兵士にも城にも使う */
  matchReaction(on, element) {
    const defs = this.reactionDefs;
    const chaos = defs.chaos;
    // 混沌反応：この攻撃のあと、付いている属性（当たった攻撃の属性も数える）に混沌が入っていて、種類が minElements 以上。
    // 当たったのが混沌でなくてもよい（混沌が付いている・武器が混沌の兵士に、別の属性が当たって3種になったときも）。
    // 2種類のときはここに入らず、下の表の反応（砕氷など）を見る（2種類で表の反応が成り立つなら表が優先）
    const all = on.includes(element) ? on : [...on, element];
    if (chaos && all.includes(chaos.element) && all.length >= chaos.minElements) {
      return { id: 'chaos', name: chaos.name, elements: all, consumed: on, damage: chaos.damagePerElement * all.length, def: {} };
    }
    for (const [id, def] of Object.entries(defs.reactions)) {
      if (!def.elements.includes(element)) continue;
      const other = def.elements.find((e) => e !== element);
      if (on.includes(other)) return { id, name: def.name, elements: [element, other], consumed: [other], damage: def.damage, def };
    }
    return null;
  }

  /**
   * 反応を起こす：reactionTriggered → 消えた属性の elementCleared → 追加ダメージ（soldierDamaged、cause "reaction"。盾が先に受ける）。
   * 反応した属性は兵士から消える（付着も、武器の属性も。武器の攻撃ボーナスは残る）。当たった攻撃の属性は付着しない。
   * 砕氷（frozenBonus）：凍結中なら追加ダメージが増えて、凍結が解ける。黒氷（frozenTurns）：生き残れば凍結する
   */
  triggerReaction(owner, soldier, reaction) {
    const { def } = reaction;
    let damage = reaction.damage;
    const shatter = def.frozenBonus !== undefined && soldier.frozen > 0;
    if (shatter) damage += def.frozenBonus;
    // 4陣営：蒸発（multiplier）は当たった攻撃のダメージを倍に、溶岩（shieldBreak）は盾を全部壊して、壊した量＋bonus
    if (def.multiplier !== undefined) damage += Math.ceil((reaction.hit ?? 0) * (def.multiplier - 1));
    const broken = def.shieldBreak ? soldier.shield : 0;
    if (def.shieldBreak) damage += broken + def.shieldBreak.bonus;
    const playerId = owner.id;
    const { soldierId } = soldier;
    this.emit('reactionTriggered', {
      reaction: reaction.id, name: reaction.name, soldierId, playerId, elements: [...reaction.elements], damage, consumed: [...reaction.consumed],
    });
    for (const element of reaction.consumed) {
      // 凍結由来だけの氷（実際の付着も武器の属性もない）は、elementCleared を出さない（凍結は下で解く）
      if (element === 'ice' && soldier.element !== 'ice' && !soldier.attachments.some((a) => a.element === 'ice')) continue;
      // 武器の属性が反応で消えたときだけ weapon: true（生まれつきの属性＝武器を持っていない兵士の属性には付けない）
      const weapon = soldier.element === element && soldier.weapon !== null;
      if (soldier.element === element) soldier.element = null;
      soldier.attachments = soldier.attachments.filter((a) => a.element !== element);
      this.emit('elementCleared', { playerId, soldierId, element, reason: 'reaction', ...(weapon ? { weapon: true } : {}) });
    }
    // 氷が使われたら凍結も解ける（frozenCountsAsIce。凍結中の氷は反応で使われる）。砕氷は今までどおり解ける
    if (shatter || (this.rules.frozenCountsAsIce && reaction.consumed.includes('ice') && soldier.frozen > 0)) {
      soldier.frozen = 0;
      this.emit('statusCleared', { playerId, soldierId, status: 'frozen' });
    }
    if (def.shieldBreak && broken > 0) {
      soldier.shield = 0;
      this.emit('shieldBroken', { playerId, soldierId, amount: broken });
    }
    const alive = !(damage > 0 && this.damageSoldier(owner, soldier, damage, 'reaction'));
    if (alive && def.frozenTurns !== undefined && soldier.frozen < def.frozenTurns && !this.wardsStatus(soldier)) {
      soldier.frozen = def.frozenTurns;
      this.emit('statusApplied', { playerId, soldierId, status: 'frozen', turns: soldier.frozen });
    }
    this.reactionExtras(owner, soldier, reaction, alive);
  }

  /**
   * 4陣営の反応の追加の効果（reactions.json の burn / slow / blind / splash / healCut / castleDamage）。
   * 当たった兵士が生きていれば、やけど・鈍足・目くらまし。炎拡散（burn.scope "adjacent"）は、同じ道の前後1マスの同じ陣地の兵士にも。
   * splash は同じ道の、同じ陣地のほかの兵士にダメージ（cause "reaction"）。healCut は当たった兵士の陣地の城の回復量が減る。
   * castleDamage は当たった兵士の陣地の城にダメージ（城壁は受ける。source { kind: "reaction", reaction }）
   */
  reactionExtras(owner, soldier, reaction, alive) {
    const { def } = reaction;
    const side = this.side(owner.id);
    const sameSide = () => this.alivePlayerIds().filter((id) => this.side(id) === side).flatMap((id) =>
      this.players[id].visibleSoldiers.map((x) => ({ owner: this.players[id], soldier: x })));
    const road = this.findRoad(soldier.roadId);
    const sq = road?.toSquare(side, soldier.position);
    const onRoad = (x) => x.soldier !== soldier && x.soldier.roadId === soldier.roadId;
    if (def.burn) {
      const list = alive ? [{ owner, soldier }] : [];
      if (def.burn.scope === 'adjacent' && road) list.push(...sameSide().filter((x) => onRoad(x) && Math.abs(road.toSquare(side, x.soldier.position) - sq) <= 1));
      for (const x of list) this.burnSoldier(x.owner, x.soldier, def.burn);
    }
    // 継続ダメージ（砂・凍傷）：やけどとは別の状態。量・回数は大きい方にそろえる
    if (alive && def.dot && !this.wardsStatus(soldier)) {
      const { status } = def.dot;
      soldier[status] = { amount: Math.max(def.dot.amount, soldier[status]?.amount ?? 0), turns: Math.max(def.dot.turns, soldier[status]?.turns ?? 0) };
      this.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status, turns: soldier[status].turns, amount: soldier[status].amount });
    }
    if (alive && def.slow && !this.wardsStatus(soldier)) {
      soldier.slowed = { amount: Math.max(def.slow.amount, soldier.slowed?.amount ?? 0), turns: Math.max(def.slow.turns, soldier.slowed?.turns ?? 0) };
      this.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'slowed', turns: soldier.slowed.turns, amount: soldier.slowed.amount });
    }
    if (alive && def.blind && !this.wardsStatus(soldier)) {
      soldier.blinded = { chance: Math.max(def.blind.chance, soldier.blinded?.chance ?? 0), turns: Math.max(def.blind.turns, soldier.blinded?.turns ?? 0) };
      this.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'blinded', turns: soldier.blinded.turns, chance: soldier.blinded.chance });
    }
    if (def.splash) {
      for (const x of sameSide().filter(onRoad)) if (x.owner.soldiers.includes(x.soldier)) this.damageSoldier(x.owner, x.soldier, def.splash.amount, 'reaction');
    }
    const castleOwner = this.players[side];
    if (def.healCut && castleOwner) {
      const c = castleOwner.castle;
      c.healCut = { ratio: Math.max(def.healCut.ratio, c.healCut?.ratio ?? 0), turns: Math.max(def.healCut.turns, c.healCut?.turns ?? 0) };
      this.emit('castleHealCut', { playerId: side, ratio: c.healCut.ratio, turns: c.healCut.turns });
    }
    if (def.castleDamage && castleOwner && !castleOwner.eliminated) {
      this.damageCastle(castleOwner, def.castleDamage, { kind: 'reaction', reaction: reaction.id });
    }
  }

  /** やけど（量・回数を大きい方にそろえる。重ねがけで増えない）。statusApplied を出す */
  burnSoldier(owner, soldier, burn) {
    if (!owner.soldiers.includes(soldier) || this.wardsStatus(soldier)) return;
    const turns = Math.max(burn.turns, soldier.burn?.turns ?? 0);
    soldier.burn = { amount: Math.max(burn.amount, soldier.burn?.amount ?? 0), turns };
    this.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'burn', turns, amount: soldier.burn.amount });
  }

  /** 鈍足・目くらまし：持ち主の進軍が終わったら、残りを1減らす（0で治る） */
  tickReactionStatuses(player) {
    for (const soldier of player.soldiers) {
      for (const status of ['slowed', 'blinded']) {
        if (!soldier[status]) continue;
        soldier[status].turns -= 1;
        if (soldier[status].turns > 0) continue;
        soldier[status] = null;
        this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status });
      }
    }
  }

  /** 脆弱：owner の城が攻撃（GUARDED_SOURCES）を amount 受けるときに増える量（切り上げ。maxRatio の割合（切り捨て）まで）。脆弱でなければ0 */
  vulnerableBonus(owner, amount, source) {
    const v = this.players[this.side(owner.id)]?.castle.vulnerable;
    if (!v || amount <= 0 || !GUARDED_SOURCES.includes(source?.kind)) return 0;
    return Math.min(Math.ceil(amount * v.ratio), Math.floor(amount * v.maxRatio));
  }

  /** 脆弱：城の持ち主（チーム戦なら代表）のターンの始めに残りを1減らす（0で終わる） */
  tickVulnerable(player) {
    const c = player.castle;
    if (!c.vulnerable || this.side(player.id) !== player.id) return;
    c.vulnerable.turns -= 1;
    if (c.vulnerable.turns > 0) return;
    c.vulnerable = null;
    this.emit('castleVulnerableEnded', { playerId: player.id });
  }

  /** 回復量減少：城の持ち主（チーム戦なら代表）のターンの始めに残りを1減らす（0で終わる） */
  tickHealCut(player) {
    const c = player.castle;
    if (!c.healCut || this.side(player.id) !== player.id) return;
    c.healCut.turns -= 1;
    if (c.healCut.turns > 0) return;
    c.healCut = null;
    this.emit('castleHealCutEnded', { playerId: player.id });
  }

  /** 目くらまし：攻撃が外れるか（目くらましでなければ乱数を使わない） */
  rollBlind(soldier) {
    return Boolean(soldier?.blinded) && this.rng() < soldier.blinded.chance;
  }

  /** 4陣営：場にいる自分の兵士の spellBoost（ドルイド・呪術師）で、属性 element の魔法に足すダメージ（重ならない。いちばん大きいもの） */
  spellBonus(player, element) {
    if (!element) return 0;
    let best = 0;
    for (const x of player.soldiers) {
      const b = this.cardDefs[x.type]?.spellBoost;
      if (b && b.elements.includes(element)) best = Math.max(best, b.amount);
    }
    return best;
  }

  /** 付着：持ち主の進軍が終わったら、残りを1減らす（0で消える） */
  tickAttachments(player) {
    if (!this.reactionDefs) return;
    for (const soldier of player.soldiers) {
      for (const a of [...soldier.attachments]) {
        a.turns -= 1;
        if (a.turns > 0) continue;
        soldier.attachments = soldier.attachments.filter((x) => x !== a);
        this.emit('elementCleared', { playerId: player.id, soldierId: soldier.soldierId, element: a.element, reason: 'expired' });
      }
    }
  }

  removeSoldier(owner, soldier, reason) {
    owner.removeSoldier(soldier.soldierId);
    // 蘇生（reviveFallen）のために、HPが0になって倒れた（killed）兵士を持ち主ごとに1体だけ覚えておく（getState には出さない）。
    // 魔物のカードの駒は山札に戻らない特別なカードなので、生き返らせない
    // 4陣営の勇者（noRevive）も生き返らせない（記録しないので、前に倒れた兵士の記録はそのまま残る）
    // 骸骨兵（トークン）も記録に残さない（蘇生で骸骨兵が生き返らないように）
    if (reason === 'killed' && !soldier.token && this.cardDefs[soldier.type]?.monster === undefined && !this.cardDefs[soldier.type]?.noRevive) {
      owner.lastFallen = { type: soldier.type, roadId: soldier.roadId, targetId: soldier.targetId, maxHp: soldier.maxHp };
    }
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
    // 4陣営：射程+の武器（rangeBonus）を持つ進む兵士は、もっと先の相手も突ける（近い相手が先）
    // ただし、すぐ前（同じマスか1つ先）に魔物がいるときは、魔物を飛び越えて突けない
    const reach = soldier.rangeBonus > 0 && !this.findMonsterInRange(soldier, owner) ? 1 + soldier.rangeBonus : 1;
    let best = null;
    for (const c of this.foesOf(soldier, owner)) {
      if (c.q < here || c.q > here + reach) continue;
      const near = (x) => (x.q <= here + 1 ? 0 : x.q - here);
      if (!best || near(c) < near(best) || (near(c) === near(best) && soldierNumber(c.soldier) < soldierNumber(best.soldier))) best = { owner: c.owner, soldier: c.soldier, q: c.q };
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
    // 忍者は相手の兵士と戦わずにすり抜ける。相手の兵士も、見えない忍者とは戦わない（撃たない）
    if (soldier.stealth) return found;
    for (const id of this.alivePlayerIds()) {
      const theirs = this.side(id);
      if (theirs === mine) continue;
      const other = this.players[id];
      for (const e of other.soldiers) {
        if (e.stealth) continue;
        let q;
        if (!this.plaza) {
          // 護衛（ゴーレム）は、自分の道と左右のとなりの道（同じ2人の間で lane が1つ違う道）の城の前を守る
          if (theirs !== soldier.targetId || (e.roadId !== soldier.roadId && !this.guardCovers(e, soldier.roadId))) continue;
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
    // 砂漠のステージ：射程が短くなる（最低1）
    const range = Math.max(1, soldier.range + soldier.rangeBonus - (this.stageDef()?.rangePenalty ?? 0));
    const inRange = (q) => q !== null && q >= here && q <= here + range;
    const foes = this.foesOf(soldier, player).filter((c) => inRange(c.q));
    foes.sort((a, b) => a.q - b.q || soldierNumber(a.soldier) - soldierNumber(b.soldier));
    const shot = { playerId: player.id, soldierId: soldier.soldierId, role: soldier.role };
    let over = false;
    if (foes.length > 0) {
      const { owner, soldier: victim } = foes[0];
      const miss = this.rollMiss() || this.rollBlind(soldier);
      const amount = miss ? 0 : this.fightDamage(soldier, victim);
      this.emit('soldierShot', { ...shot, target: { kind: 'soldier', playerId: owner.id, soldierId: victim.soldierId }, amount });
      if (miss) this.emitMiss(player.id, 'shot', { soldierId: soldier.soldierId });
      else if (this.damageSoldier(owner, victim, amount, 'shot')) {
        this.raiseOnKill(player, soldier); // 魔族のパッシブ（死者を従える）
      } else {
        this.elementHit(owner, victim, soldier.element, { damage: amount });
        this.freezeOnHitBy(soldier, owner, victim);
        if (this.reactionDefs) over = this.checkGameOver();
      }
    } else {
      const road = this.findRoad(soldier.roadId);
      const monster = this.monsters.find((m) =>
        inRange(m.roadId === PLAZA ? m.square : m.roadId === soldier.roadId ? road.toPosition(this.side(player.id), m.square) : null));
      if (monster) {
        const miss = this.rollMiss();
        const amount = miss ? 0 : this.fightDamage(soldier, monster);
        this.emit('soldierShot', { ...shot, target: { kind: 'monster', monsterId: monster.monsterId }, amount });
        if (miss) {
          this.emitMiss(player.id, 'shot', { soldierId: soldier.soldierId });
        } else {
          this.damageMonster(monster, amount, { playerId: player.id, soldierId: soldier.soldierId });
          this.defeatMonsterIfDead(monster, player.id);
        }
      } else if (soldier.role === 'mage') {
        const enemy = this.players[soldier.targetId];
        const miss = this.rollMiss();
        // 城を撃つときも、天候の属性ボーナスは効く（兵士・魔物を撃つときと同じ）
        const amount = this.stageBoost(soldier, this.attackOf(soldier) + this.weatherElementBonus(soldier.element));
        this.emit('soldierShot', { ...shot, target: { kind: 'castle', playerId: enemy.id }, amount: miss ? 0 : amount });
        if (miss) {
          this.emitMiss(player.id, 'shot', { soldierId: soldier.soldierId });
        } else {
          this.damageCastle(enemy, amount, { kind: 'soldier', soldierId: soldier.soldierId });
          over = this.checkGameOver();
        }
      }
      // 撃つ相手がいないときは、撃たずに待つ（ターンは過ぎる）
    }
    if (over) return true;
    this.tickRanged(player, soldier);
    return false;
  }

  // ================= サイコロ =================

  /** サイコロの種類 kind を今使える対象（per は目に掛ける数。城壁が上限かどうかを見るのに使う） */
  diceTargets(player, kind, per, randomCost = null) {
    const self = [{ playerId: player.id }];
    switch (kind) {
      case 'attack': {
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: foes.map((p) => ({ playerId: p.id })), reason: '相手がいません' };
      }
      case 'heal':
        return { targets: player.castle.isFull ? [] : self, reason: '城のHPが満タンです' };
      case 'mana':
        return { targets: this.rules.maxMp > 0 && player.mp < this.rules.maxMp ? self : [], reason: this.rules.maxMp > 0 ? 'MPが満タンです' : 'このルールではMPを使いません' };
      case 'coin':
        return { targets: self, reason: '' };
      case 'shield':
        return {
          targets: this.armorFull(player, { amount: Math.ceil(6 * per) }) ? [] : self,
          reason: this.rules.armorMax ? `城壁がもう上限（${this.rules.armorMax}）まで積んであります` : '同じか、より強い城壁がもう置いてあります',
        };
      case 'buff':
        return { targets: player.soldiers.map((x) => ({ soldierId: x.soldierId })), reason: '道の上に自分の兵士がいません' };
      case 'god': {
        // ゴッドサイコロ：攻撃の相手を選ぶ（ほかの効果は自分）。相手がいれば出せる
        return this.diceTargets(player, 'attack', 0);
      }
      case 'random': {
        const usable = this.randomDiceKinds(player);
        if (usable.length === 0) return { targets: [], reason: '今使えるサイコロがありません' };
        return { targets: this.payableCosts(player, randomCost).length > 0 ? self : [], reason: '払えるコストがありません' };
      }
      default:
        return { targets: [], reason: 'このカードは出せません' };
    }
  }

  /** ランダムサイコロが選べる種類：cards.json にあるサイコロ（random 以外）のうち、今使えるもの。{ kind, per } の配列 */
  randomDiceKinds(player) {
    const out = [];
    for (const kind of BASIC_DICE) {
      const def = Object.values(this.cardDefs).find((d) => d.effect === 'dice' && d.dice === kind);
      if (def && this.diceTargets(player, kind, def.per).targets.length > 0) out.push({ kind, per: def.per });
    }
    return out;
  }

  /**
   * ランダムサイコロのコスト（randomCost）のうち、今払えるもの。{ kind: "hp" | "coins" | "mp", amount } の配列。
   * 城HPは払っても城が落ちないとき（HP が amount より多い）だけ。コストがなければ [{ kind: null }]（タダ）
   */
  payableCosts(player, randomCost) {
    if (!randomCost) return [{ kind: null, amount: 0 }];
    const out = [];
    if (randomCost.hp && player.castle.hp > randomCost.hp) out.push({ kind: 'hp', amount: randomCost.hp });
    if (randomCost.coins && player.coins >= randomCost.coins) out.push({ kind: 'coins', amount: randomCost.coins });
    if (randomCost.mp && this.rules.maxMp > 0 && player.mp >= randomCost.mp) out.push({ kind: 'mp', amount: randomCost.mp });
    return out;
  }

  /** 1〜6 の目 */
  rollDie() {
    return 1 + Math.floor(this.rng() * 6);
  }

  /**
   * サイコロを振る。diceRolled（{ playerId, type, dice, value, amount, rolls }）を出してから効果を起こす。
   * ランダムサイコロは、1回目の目で種類を選び（使えない種類は除く）、2回目の目は4〜6になる。対象はランダム
   */
  rollDice(player, card, target) {
    if (card.def.dice === 'god') {
      this.rollGodDice(player, card, target);
      return;
    }
    let kind = card.def.dice;
    let per = card.def.per;
    let value;
    let rolls;
    let cost = null;
    if (kind === 'random') {
      // 先にコストを払う（払えるものから1つランダム）。城HPは城壁を通さない
      const options = this.payableCosts(player, card.def.randomCost);
      cost = options[options.length === 1 ? 0 : Math.floor(this.rng() * options.length)];
      if (cost.kind === 'hp') {
        player.castle.takeDamage(cost.amount);
        this.emit('castleDamaged', { playerId: player.id, amount: cost.amount, blocked: 0, hp: player.castle.hp, source: { kind: 'sacrifice', type: card.type } });
      } else if (cost.kind === 'coins') {
        this.changeCoins(player, -cost.amount, 'cost');
      } else if (cost.kind === 'mp') {
        this.changeMp(player, -cost.amount, 'cast');
      } else {
        cost = null;
      }
      const usable = this.randomDiceKinds(player);
      const first = this.rollDie();
      ({ kind, per } = usable[(first - 1) % usable.length]);
      value = 4 + Math.floor(this.rng() * 3);
      rolls = [first, value];
      const targets = this.diceTargets(player, kind, per).targets;
      target = targets[targets.length === 1 ? 0 : Math.floor(this.rng() * targets.length)];
    } else {
      value = this.rollDie();
      rolls = [value];
    }
    const amount = Math.ceil(value * per);
    this.emit('diceRolled', { playerId: player.id, type: card.type, dice: kind, value, amount, rolls, ...(cost ? { cost } : {}) });
    this.applyDice(player, card, kind, amount, target);
  }

  /**
   * ゴッドサイコロ：1回振って、その目で6つのサイコロの効果を全部起こす（倍率はそれぞれのサイコロのカードの per）。
   * diceRolled は1回（dice: "god"、amount は種類ごとの量 { attack, heal, ... }）。今使えない効果は飛ばす。
   * 攻撃は相手が防御を選ぶと止まるので、いちばん最後。バフは自分の兵士全員
   */
  rollGodDice(player, card, target) {
    const value = this.rollDie();
    const pers = Object.fromEntries(BASIC_DICE.map((k) => [k, Object.values(this.cardDefs).find((d) => d.effect === 'dice' && d.dice === k)?.per ?? 0]));
    const amounts = Object.fromEntries(BASIC_DICE.map((k) => [k, Math.ceil(value * pers[k])]));
    this.emit('diceRolled', { playerId: player.id, type: card.type, dice: 'god', value, amount: amounts, rolls: [value] });
    for (const kind of ['heal', 'mana', 'coin', 'shield']) {
      if (amounts[kind] > 0 && this.diceTargets(player, kind, pers[kind]).targets.length > 0) this.applyDice(player, card, kind, amounts[kind], { playerId: player.id });
    }
    if (amounts.buff > 0) {
      for (const s of player.soldiers) this.applyDice(player, card, 'buff', amounts.buff, { soldierId: s.soldierId });
    }
    if (amounts.attack > 0) this.applyDice(player, card, 'attack', amounts.attack, target);
  }

  /** サイコロ1つぶんの効果を起こす（kind の種類、量 amount） */
  applyDice(player, card, kind, amount, target) {
    switch (kind) {
      case 'attack': {
        const enemy = this.players[target.playerId];
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, amount, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }
      case 'heal': {
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }
      case 'mana':
        this.changeMp(player, amount, 'card');
        break;
      case 'coin':
        this.changeCoins(player, amount, 'card');
        break;
      case 'shield':
        this.playSupport(player, { def: { kind: 'defense', effect: 'armorCastle', amount } }, { playerId: player.id });
        break;
      case 'buff': {
        const soldier = player.soldiers.find((x) => x.soldierId === target.soldierId);
        soldier.baseAttack += amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: soldier.soldierId, attack: soldier.attack });
        break;
      }
      default:
        break;
    }
  }

  /** 護衛の兵士 guard が、道 roadId の城の前も守っているか（同じ2人の間の道で、lane が1つ違う） */
  guardCovers(guard, roadId) {
    if (!guard.isGuard) return false;
    const a = this.findRoad(guard.roadId);
    const b = this.findRoad(roadId);
    if (!a || !b || a.players.join() !== b.players.join()) return false;
    return Math.abs((a.lane ?? 0) - (b.lane ?? 0)) <= 1;
  }

  /** 弓兵・魔法使い・護衛の残りターンを1減らし、0なら帰る */
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
      const damage = m.nextCastleAttack + (this.night ? this.rules.nightMonsterAttack : 0);
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
  /** 放置された魔物は、monsterEvolveEvery 周ごとにレアリティが1つ上がり、強くなる（レジェンドの上はないので、ごほうびはそのまま） */
  evolveMonsters() {
    const every = this.rules.monsterEvolveEvery;
    if (every <= 0) return;
    for (const m of this.monsters) {
      m.age += 1;
      if (m.age % every !== 0) continue;
      const next = m.rewardRarity && this.rarityDefs ? nextRarityWithCards(this.cardDefs, this.rarityDefs, m.rewardRarity) : null;
      m.evolve(this.rules.monsterEvolveMultiplier, next);
      this.emit('monsterEvolved', {
        monsterId: m.monsterId, rewardRarity: m.rewardRarity, hp: m.hp, maxHp: m.maxHp, attack: m.attack, castleAttack: m.nextCastleAttack, count: m.evolveCount,
      });
    }
  }

  /** 魔物の種類ごとの、今の出やすさ。後半（monsterFirstRound を過ぎた周回の数）ほど、ごほうびのレアリティが高い魔物が出やすくなる */
  monsterWeight(type) {
    const def = this.monsterDefs[type];
    const order = this.rarityDefs ? chainOrder(this.rarityDefs) : [];
    const rank = Math.max(0, order.indexOf(def.rewardRarity));
    const late = Math.max(0, this.round - this.rules.monsterFirstRound);
    return def.weight * (1 + this.rules.monsterLateBias * rank * late);
  }

  spawnMonsters() {
    this.evolveMonsters();
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
      const total = types.reduce((a, t) => a + this.monsterWeight(t), 0);
      let r = this.rng() * total;
      const type = types.find((t) => (r -= this.monsterWeight(t)) < 0) ?? types.at(-1);
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
    const baseRarity = monster.rewardRarity ?? monster.def.rewardRarity ?? null;
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
    // 倒した魔物は駒（兵士カード）になって、とどめを刺した人の手札に入る（cards.json に monster: 種類 のカードがあるとき）
    const pieceType = (monster.type && Object.keys(this.cardDefs).find((t) => this.cardDefs[t].monster === monster.type)) || null;
    this.emit('monsterDefeated', { monsterId: monster.monsterId, playerId, reward: reward ?? 0, rewardRarity, baseRarity, lucky, pieceType });
    if (pieceType) {
      const piece = this.createCard(pieceType);
      this.players[playerId].hand.push(piece);
      this.emit('cardDrawn', { playerId, cardIds: [piece.cardId] });
    }
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

  /**
   * 使った・捨てたカードを置き場へ。ふつうは捨て札（山札に戻る）。
   * 使い切りのカードを使ったときと、倒した魔物の駒（使っても捨てても）は、使い切り置き場へ行き、山札に戻らない
   * （駒は「山札では出ない」ので、シャッフルで山札に混ざらないように）
   * @param {{used?: boolean}} [opts] used：出して使ったか（false なら手札の上限・引き直しなどで捨てた）
   */
  throwAway(playerId, card, { used = true } = {}) {
    const pile = this.pileOf(playerId);
    if (card.def.monster !== undefined || (used && card.isExhaust)) pile.exhausted.push(card);
    else pile.discard.push(card);
  }

  /** そのカードを出すのに必要な MP。MP を使わない設定（maxMp が 0）や、MP を使わないカードは 0 */
  mpCostOf(card) {
    if (this.rules.maxMp <= 0) return 0;
    const def = card.def;
    if (def.monster !== undefined) return 0; // 魔物のカード（倒したごほうび）は MP を使わない
    const attackDice = def.effect === 'dice' && def.dice === 'attack'; // 攻撃サイコロは攻撃の魔法と同じく MP を使う
    const mpSpell = def.kind === 'spell' && (MP_EFFECTS.includes(def.effect) || attackDice);
    // mpAllCards：兵士・武器・防御・回復なども、カードの mpCost だけ MP を使う（サイコロ・マナ回復は今までどおり）
    if (this.rules.mpAllCards && !mpSpell && def.effect !== 'dice' && def.effect !== 'gainMp') return def.mpCost ?? 0;
    if (!mpSpell) return 0;
    return def.mpCost ?? this.rarityDefs?.[def.rarity]?.mpCost ?? 0;
  }

  changeMp(player, delta, reason) {
    const before = player.mp;
    player.mp = Math.max(0, Math.min(this.rules.maxMp, player.mp + delta));
    if (player.mp !== before) this.emit('mpChanged', { playerId: player.id, delta: player.mp - before, mp: player.mp, reason });
    return player.mp - before;
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
    const missM = this.rollMiss();
    const missS = this.rollMiss();
    if (missM) this.emitMiss(player.id, 'fight', { soldierId: soldier.soldierId });
    // 魔物の攻撃が外れたとき：外した側は魔物なので playerId は null
    if (missS) this.emitMiss(null, 'fight', { monsterId: monster.monsterId });
    const toMonster = missM ? 0 : this.fightDamage(soldier, monster);
    const toSoldier = missS ? 0 : this.reduceDamage(player, this.fightDamage(monster, soldier));
    this.damageMonster(monster, toMonster, { playerId: player.id, soldierId: soldier.soldierId });
    const blocked = soldier.takeDamage(toSoldier);
    this.emit('soldierDamaged', {
      playerId: player.id, soldierId: soldier.soldierId, amount: toSoldier, hp: soldier.hp, cause: 'fight', blocked,
    });
    this.defeatMonsterIfDead(monster, player.id);
    if (soldier.isDead) this.removeSoldier(player, soldier, 'killed');
  }

  // ================= コインと強化 =================

  /** その人が次にその強化を買うときの値段。costs があれば、買った回数で上がる（足りなければ最後の値段） */
  upgradeCostOf(player, upgradeId) {
    const def = this.upgradeDefs[upgradeId];
    if (!def.costs) return def.cost;
    const bought = player.upgradesBought[upgradeId] ?? 0;
    return def.costs[Math.min(bought, def.costs.length - 1)];
  }

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
    const cost = this.upgradeCostOf(player, upgradeId);
    if (player.coins < cost) return fail(`コインが足りません（あと${cost - player.coins}枚）`);
    if (def.effect === 'repairCastle' && player.castle.isFull) return fail('城のHPが満タンです');
    const pile = this.pileOf(player.id);
    if (def.effect === 'drawCards' && pile.deck.length + pile.discard.length === 0) return fail('山札も捨て札もありません');
    if (def.effect === 'gainCard') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      if (!Object.values(this.cardDefs).some((d) => d.rarity === def.rarity && (d.weight ?? 1) > 0)) return fail('その強化はありません');
    }
    if (def.effect === 'permanentLuck') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      if (!Object.hasOwn(this.rarityDefs, def.fromRarity)) return fail('その強化はありません');
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
    const cost = this.upgradeCostOf(player, upgradeId);
    player.upgradesBought[upgradeId] = (player.upgradesBought[upgradeId] ?? 0) + 1;
    this.changeCoins(player, -cost, 'upgrade');
    this.emit('upgradeBought', { playerId: player.id, upgradeId, cost });
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
        s.maxHp += def.amount;
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
    } else if (def.effect === 'permanentLuck') {
      // 買うたびに、引き当てる確率が amount%（最大100%）ずつ増える。倍率とレアリティは最後に買ったものになる
      const chance = Math.min(1, (player.permLuck?.chance ?? 0) + def.amount / 100);
      player.permLuck = { chance, boost: def.boost, from: def.fromRarity };
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
    if (!base.def.fuseTo) {
      if (base.def.monster) return fail('魔物のカードは合成できません');
      // いちばん上のレアリティ（スペシャルを除く）だけ「これ以上」。ほかは合成しないカード（fuseTo: null・スペシャル）
      const order = Object.keys(this.rarityDefs ?? {}).filter((id) => !this.rarityDefs[id].special);
      return fail(base.def.rarity === order.at(-1) ? 'レジェンドはこれ以上合成できません' : 'このカードは合成できません');
    }
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
    const strong = beatsElement(this.elementDefs, a.element, b.element);
    const attack = a instanceof Soldier ? this.attackOf(a) : a.attack;
    return this.stageBoost(a, attack + (strong ? this.rules.elementBonus : 0) + this.weatherElementBonus(a.element));
  }

  /** 兵士の今の攻撃力（夜は、獣＝魔物の駒と、暗殺者・忍者が強くなる） */
  attackOf(soldier) {
    let bonus = 0;
    // 背水の陣：自分の城が背水の陣なら、兵士全員の攻撃が上がる
    if (this.overdrive.size > 0) {
      const ownerId = this.playerOrder.find((id) => this.players[id].soldiers.includes(soldier));
      if (ownerId && this.overdrive.has(this.side(ownerId))) bonus += this.rules.overdriveAttack;
    }
    if (this.night) {
      const def = this.cardDefs[soldier.type] ?? {};
      if (def.monster !== undefined || def.beast) bonus += this.rules.nightBeastAttack;
      if (soldier.stealth) bonus += this.rules.nightStealthAttack;
    }
    // 呪い：攻撃力が下がる（最低1）
    if (soldier.weakened) return Math.max(1, soldier.attack + bonus - soldier.weakened.amount);
    return soldier.attack + bonus;
  }

  // ================= ステージ =================
  // data/stages.json のステージが、試合の最初に1つ決まる（setup.stage）。

  /** 今のステージの定義（ステージを使わないなら null） */
  stageDef() {
    return this.stage ? this.stageDefs[this.stage] : null;
  }

  /** ステージに合う属性の武器を持った兵士なら、ダメージを elementMultiplier 倍（小数は切り上げ） */
  stageBoost(x, amount) {
    const def = this.stageDef();
    if (!def?.element || !(x instanceof Soldier) || !x.weapon || x.element !== def.element || amount <= 0) return amount;
    return Math.ceil(amount * (def.elementMultiplier ?? 1));
  }

  /** ステージで、カードの効果の数値（amount。凍結は turns）に足す量 */
  stageEffectBonus(effect) {
    return this.stageDef()?.effectBonus?.[effect] ?? 0;
  }

  /** やけどにする（重ねがけでは増えない：量・残りの回数を大きい方にそろえる） */
  applyBurn(owner, soldier) {
    const burn = this.stageDef()?.burn;
    if (!burn || !owner.soldiers.includes(soldier) || this.wardsStatus(soldier)) return;
    const turns = Math.max(burn.turns, soldier.burn?.turns ?? 0);
    soldier.burn = { amount: Math.max(burn.amount, soldier.burn?.amount ?? 0), turns };
    this.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'burn', turns, amount: soldier.burn.amount });
  }

  /** 溶岩：ターンの終わりに、手番の人の兵士全員に灼熱のダメージ。溶岩マスにいる兵士はやけど */
  stageTurnEnd(player) {
    const def = this.stageDef();
    if (!def?.heat && !def?.lavaSquares) return;
    for (const soldier of [...player.soldiers]) {
      if (def.heat && this.damageSoldier(player, soldier, def.heat, 'heat')) continue;
      if (def.lavaSquares?.includes(soldier.position)) this.applyBurn(player, soldier);
    }
  }

  /** 溶岩：周回の始めに、eruption.chance の確率で、どこかの道の1マスが噴火する（そこにいる兵士に amount ダメージとやけど） */
  stageEruption() {
    const er = this.stageDef()?.eruption;
    if (!er || this.rng() >= er.chance) return;
    const { laneLength } = this.rules;
    const square = 1 + Math.floor(this.rng() * Math.max(1, laneLength - 2));
    let roadId;
    let here;
    if (this.plaza) {
      // 広場：噴火は広場（真ん中のマス）で起きる
      roadId = PLAZA;
      here = (id, x) => this.placeOf(id, x)?.at === 'plaza';
    } else {
      const road = this.roads[Math.floor(this.rng() * this.roads.length)];
      roadId = road.roadId;
      here = (id, x) => x.roadId === road.roadId && road.toSquare(this.side(id), x.position) === square;
    }
    this.emit('stageEruption', { roadId, square: this.plaza ? this.middleSquare() : square, amount: er.amount });
    for (const id of this.alivePlayerIds()) {
      const owner = this.players[id];
      for (const soldier of owner.soldiers.filter((x) => here(id, x))) {
        if (!this.damageSoldier(owner, soldier, er.amount, 'eruption')) this.applyBurn(owner, soldier);
      }
    }
  }

  // ================= 昼と夜 =================

  /** 夜になる確率（ステージの nightChance が優先） */
  nightChance() {
    return this.stageDef()?.nightChance ?? this.rules.nightChance;
  }

  /** 夜が続く周回の数（闇の森は長い） */
  nightLength() {
    return this.rules.nightRounds + (this.stageDef()?.nightRoundsBonus ?? 0);
  }

  /** 昼と夜を変える。timeChanged を出す */
  setTime(time, cause, playerId = null) {
    const previous = this.night ? 'night' : 'day';
    const rounds = time === 'night' ? this.nightLength() : 0;
    this.night = time === 'night' ? { roundsLeft: rounds } : null;
    this.emit('timeChanged', { time, previous, rounds, cause, playerId });
  }

  /** 周回の始め：夜の残りを1つ減らし、終わったら昼に。昼なら、確率で夜になる（確率が0なら乱数を使わない） */
  tickNight() {
    if (this.night) {
      this.night.roundsLeft -= 1;
      if (this.night.roundsLeft <= 0) this.setTime('day', 'natural');
      return;
    }
    if (this.round < this.rules.nightFirstRound) return;
    const chance = this.nightChance();
    if (chance > 0 && this.rng() < chance) this.setTime('night', 'natural');
  }

  // ================= 天候 =================
  // data/weather.json の天候が、周回の始めに切り替わる（天候の呪文でも変わる）。
  //   晴れ・雨・大雨：その属性のダメージ・回復が増える　大雨：周回の始めに雷（どちらかの城へ）
  //   霧：兵士の戦い・射撃・攻撃魔法が外れることがある　嵐：進む兵士が動かない
  //   砂嵐：周回の始めに全員の城と兵士に1ダメージ　コインの雨：ターンの始めにコイン

  /** 今の天候の定義（ふつうの天気なら null） */
  weatherDef() {
    return this.weather ? this.weatherDefs[this.weather.type] : null;
  }

  /** 今の天候で、その属性のダメージ・回復に足される量 */
  weatherElementBonus(element) {
    return element ? this.weatherDef()?.elementBonus?.[element] ?? 0 : 0;
  }

  /** 霧のとき、攻撃が外れるか（霧でなければ乱数を使わない） */
  rollMiss() {
    const chance = this.weatherDef()?.missChance ?? 0;
    return chance > 0 && this.rng() < chance;
  }

  /** 外れたことを知らせる。kind は "fight" / "shot" / "spell" */
  emitMiss(playerId, kind, extra = {}) {
    this.emit('attackMissed', { playerId, kind, ...extra });
  }

  /** 天候を変える（type が null ならふつうの天気に戻す）。weatherChanged を出す */
  setWeather(type, cause, playerId = null) {
    const previous = this.weather?.type ?? null;
    let rounds = 0;
    if (type !== null) {
      const [min, max] = this.weatherDefs[type].rounds;
      rounds = min === max ? min : min + Math.floor(this.rng() * (max - min + 1));
    }
    this.weather = type === null ? null : { type, roundsLeft: rounds };
    const def = type === null ? null : this.weatherDefs[type];
    this.emit('weatherChanged', {
      weather: type, previous, rounds, cause, playerId,
      name: def?.name ?? null, icon: def?.icon ?? null, description: def?.description ?? null,
      previousName: previous === null ? null : this.weatherDefs[previous].name,
    });
  }

  /** 重みで天候を1つ選ぶ（exclude は除く） */
  pickWeather(exclude = null) {
    const types = Object.keys(this.weatherDefs).filter((t) => t !== exclude);
    if (types.length === 0) return null;
    // 砂漠のステージ：砂嵐が起きやすい（weatherWeights の倍率）
    const w = (t) => this.weatherDefs[t].weight * (this.stageDef()?.weatherWeights?.[t] ?? 1);
    const total = types.reduce((a, t) => a + w(t), 0);
    let r = this.rng() * total;
    return types.find((t) => (r -= w(t)) < 0) ?? types.at(-1);
  }

  /** 周回の始め：天候の残りを1つ減らし、終わったらふつうの天気に。ふつうの天気なら、確率で新しい天候になる */
  tickWeather() {
    if (!this.weatherDefs) return;
    // 続いている天候は、weatherFirstRound より前でも減る（天候の呪文で早く始めた天候が、長く続きすぎないように）
    if (this.weather) {
      this.weather.roundsLeft -= 1;
      if (this.weather.roundsLeft > 0) return;
      this.setWeather(null, 'natural');
      return;
    }
    if (this.round < this.rules.weatherFirstRound) return;
    if (this.rules.weatherChangeChance > 0 && this.rng() < this.rules.weatherChangeChance) {
      this.setWeather(this.pickWeather(), 'natural');
    }
  }

  /** 周回の始め：大雨の雷・砂嵐のダメージ。何か起きたら true（城が落ちたかは checkGameOver で確かめる） */
  weatherRoundEffects() {
    const def = this.weatherDef();
    if (!def) return false;
    let acted = false;
    if (def.lightning) {
      const sides = this.aliveSides();
      const victim = this.players[sides[Math.floor(this.rng() * sides.length)]];
      this.emit('weatherLightning', { playerId: victim.id, amount: def.lightning });
      this.damageCastle(victim, def.lightning, { kind: 'weather', weather: this.weather.type });
      acted = true;
    }
    if (def.sandDamage) {
      for (const id of this.aliveSides()) {
        const owner = this.players[id];
        // 砂嵐では城を落とさない（HPは1で止まる。全員の城が同時に0になって勝者がいなくなるのを防ぐ）
        const amount = Math.min(def.sandDamage, owner.castle.hp - 1);
        if (amount <= 0) continue;
        owner.castle.takeDamage(amount);
        this.emit('castleDamaged', { playerId: id, amount, blocked: 0, hp: owner.castle.hp, source: { kind: 'weather', weather: this.weather.type } });
      }
      for (const id of this.alivePlayerIds()) {
        const owner = this.players[id];
        for (const soldier of [...owner.soldiers]) this.damageSoldier(owner, soldier, def.sandDamage, 'weather');
      }
      acted = true;
    }
    return acted;
  }

  /** 進軍中の attacker と、相手の defender が戦う。お互いに攻撃力ぶんのダメージを同時に与える */
  /**
   * 魔族のパッシブ「死者を従える」（席のデッキの passive.raiseOnKill）：owner の兵士 killer が、戦い・射撃で敵の兵士のHPを0にしたとき、
   * 骸骨兵（トークン）が killer の道の owner の城の前（マス0）に1体生まれる（soldierDeployed に raised: true）。
   * 歯止め：1ターン（通算 turn）に perTurn 回まで／骸骨兵（トークン）が倒したときは起きない／蘇生の記録には残さない／出したターンは動かない。
   * 魔法・毒・天候・反応などで倒れたときと、魔物を倒したときは呼ばれない。数値はデータ（factions.json）
   */
  raiseOnKill(owner, killer) {
    const def = owner.passive?.raiseOnKill;
    if (!def || killer.token || !owner.soldiers.includes(killer) || this.phase === 'gameOver') return;
    if (owner.lastRaiseTurn !== this.turn) {
      owner.lastRaiseTurn = this.turn;
      owner.raisedThisTurn = 0;
    }
    if (owner.raisedThisTurn >= def.perTurn) return;
    owner.raisedThisTurn += 1;
    const sdef = def.soldier;
    const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
    const soldier = new Soldier(soldierId, { type: RAISED_TYPE, def: { hp: sdef.hp, attack: sdef.attack, speed: sdef.speed, innateElement: sdef.element ?? null } }, killer.roadId, killer.targetId);
    soldier.token = true;
    soldier.tokenName = sdef.name;
    owner.soldiers.push(soldier);
    this.emit('soldierDeployed', {
      playerId: owner.id,
      soldierId,
      type: RAISED_TYPE,
      roadId: killer.roadId,
      targetId: killer.targetId,
      position: soldier.position,
      hp: soldier.hp,
      attack: soldier.attack,
      raised: true,
      name: sdef.name,
    });
  }

  /** 4陣営：武器の freezeOnHit（フロストブレード）。当たって生き残った相手を休ませる */
  freezeOnHitBy(hitter, owner, victim) {
    if (!hitter.freezeOnHit || !owner.soldiers.includes(victim) || victim.frozen >= hitter.freezeOnHit || this.wardsStatus(victim)) return;
    victim.frozen = hitter.freezeOnHit;
    this.emit('statusApplied', { playerId: owner.id, soldierId: victim.soldierId, status: 'frozen', turns: victim.frozen });
  }

  /** reach：攻める側が射程+の武器で、1マスより先の相手を突くとき（相手は届かないので反撃しない） */
  fight(player, attacker, enemy, defender, reach = false) {
    const road = this.findRoad(attacker.roadId);
    this.emit('soldiersClashed', {
      attacker: { playerId: player.id, soldierId: attacker.soldierId },
      defender: { playerId: enemy.id, soldierId: defender.soldierId },
      roadId: road.roadId,
      square: road.toSquare(this.side(player.id), attacker.position), // 攻める側が止まったマス
    });

    // 霧：攻撃が外れる（ダメージ0）。目くらまし（4陣営の反応）の兵士も外れることがある（目くらましでなければ乱数を使わない）
    const missD = this.rollMiss() || this.rollBlind(attacker);
    const missA = this.rollMiss() || reach || this.rollBlind(defender);
    // 付着・反応に使う、ぶつかる前の属性（反応で武器の属性が外れることがあるので、先に覚えておく）
    const elementA = attacker.element;
    const elementD = defender.element;
    if (missD) this.emitMiss(player.id, 'fight', { soldierId: attacker.soldierId });
    if (missA && !reach) this.emitMiss(enemy.id, 'fight', { soldierId: defender.soldierId });
    let toDefender = missD ? 0 : this.reduceDamage(enemy, this.fightDamage(attacker, defender));
    let toAttacker = missA ? 0 : this.reduceDamage(player, this.fightDamage(defender, attacker));
    // 4陣営：光の先制（rules.lightFirstStrike）。攻める側（進軍している側）の光の兵士の攻撃が当たり、相手の HP＋盾 以上なら、相手の反撃を受けない。
    // 守る側では効かない（人間の指示）
    const noCounterA = !missD && this.firstStrikes(attacker, defender, toDefender); // 攻める側が先に倒す：守る側の攻撃は当たらない
    if (noCounterA) toAttacker = 0;
    const blockedD = defender.takeDamage(toDefender);
    const blockedA = attacker.takeDamage(toAttacker);
    this.emit('soldierDamaged', {
      playerId: enemy.id, soldierId: defender.soldierId, amount: toDefender, hp: defender.hp, cause: 'fight', blocked: blockedD,
    });
    // 突き（reach）・光の先制：守る側の攻撃は当たらないので、攻める側の soldierDamaged は出さない
    if (!reach && !noCounterA) {
      this.emit('soldierDamaged', {
        playerId: player.id, soldierId: attacker.soldierId, amount: toAttacker, hp: attacker.hp, cause: 'fight', blocked: blockedA,
      });
    }

    // 消える順番は soldierDamaged と同じ（守る側 → 攻める側）
    const deadD = defender.isDead;
    const deadA = attacker.isDead;
    for (const [owner, s] of [[enemy, defender], [player, attacker]]) {
      if (s.isDead) this.removeSoldier(owner, s, 'killed');
    }
    // 魔族のパッシブ（死者を従える）：戦いで敵を倒した側（守る側 → 攻める側の順）
    if (deadD) this.raiseOnKill(player, attacker);
    if (deadA) this.raiseOnKill(enemy, defender);
    // 付着・反応（reactions を渡したときだけ）：当たった攻撃の属性（武器の属性）。外れた攻撃は付かない。同じ順番（守る側 → 攻める側）
    const hitD = !missD;
    const hitA = !missA && !noCounterA;
    if (hitD) this.elementHit(enemy, defender, elementA, { damage: toDefender });
    if (hitA) this.elementHit(player, attacker, elementD, { damage: toAttacker });
    // フロストブレード：当たって生き残った相手を休ませる
    if (hitD) this.freezeOnHitBy(attacker, enemy, defender);
    if (hitA) this.freezeOnHitBy(defender, player, attacker);
  }

  /** 神盾（shieldSoldier の statusWard）：盾が残っている間は、状態異常（毒・凍結・やけど・呪い・鈍足・目くらまし・砂・凍傷）を受けない */
  wardsStatus(soldier) {
    return Boolean(soldier.statusWard) && soldier.shield > 0;
  }

  /** 光の先制（rules.lightFirstStrike）：光の兵士 s の攻撃 amount で、相手 victim を倒せるか（盾も数える） */
  firstStrikes(s, victim, amount) {
    return Boolean(this.rules.lightFirstStrike) && s.element === 'light' && amount > 0 && amount >= victim.hp + victim.shield;
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
        // 武器は何本でも重ねられる（攻撃力は足し算。属性は最後に持たせた武器になる）
        const targets = player.soldiers.map((x) => ({ soldierId: x.soldierId }));
        return { targets, reason: '道の上に自分の兵士がいません' };
      }
      default:
        break;
    }
    // 見えない忍者は妖術（魔法）の的にならない（いるかどうかも相手に分からないように、数えない）
    const hasSoldiers = (p) => p.visibleSoldiers.length > 0;
    // 選んだ1レーンだけに効く魔法：自分の道ごとに、相手の兵士がいる（効き目が変わる兵士がいる）道が対象
    if (this.isLaneScoped(def) && LANE_SCOPE_EFFECTS.includes(def.effect)) {
      const changes = this.changesSoldier(def);
      // 道の向こうの陣地の人（チーム戦ならメンバーごと）×道。その道にその人の兵士がいるもの
      const me = this.side(player.id);
      const pairs = this.roads.filter((r) => r.has(me)).flatMap((r) =>
        this.opponentsOf(player.id).filter((p) => this.side(p.id) === r.otherSide(me)).map((p) => ({ p, r, on: p.visibleSoldiers.filter((x) => x.roadId === r.roadId) })),
      );
      const withSoldiers = pairs.filter((x) => x.on.length > 0);
      const targets = withSoldiers.filter((x) => x.on.some(changes)).map((x) => ({ playerId: x.p.id, roadId: x.r.roadId }));
      return { targets, reason: withSoldiers.length ? this.noChangeReason(def) : '道の上に相手の兵士がいません' };
    }
    switch (def.effect) {
      case 'wild':
        return { targets: [], reason: '適応は合成に使うカードです（出せません）' };
      case 'damageEnemyCastle':
        return {
          targets: [
            // 城は陣地ごとに1つ（チーム戦ならチームの代表）。castleSpellHitsFront のときは、レーンが2本以上なら道ごと（{ playerId, roadId }）
            ...(this.rules.castleSpellHitsFront
              ? this.frontSpellTargets(player, this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id))
              : playerTargets(this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id))),
            // 魔物は、自分の道（自分が両はしのどちらか）にいるものだけ。広場の魔物はだれからでも狙える
            ...this.monsters.filter((m) => m.roadId === PLAZA || this.findRoad(m.roadId).has(this.side(player.id))).map((m) => ({ monsterId: m.monsterId })),
          ],
          reason: '相手がいません',
        };
      case 'damageEnemyAll':
      case 'damageCastleAndHeal':
      case 'drainCastle': {
        // 生命吸収・吸血：城だけを狙う（魔物は狙えない）
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: playerTargets(foes), reason: '相手がいません' };
      }
      case 'sacrificeAttack': {
        // 捨て身：払うと自分の城が落ちるなら出せない
        if (player.castle.hp <= def.selfDamage) return { targets: [], reason: `城のHPが足りません（${def.selfDamage}より多く必要です）` };
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: playerTargets(foes), reason: '相手がいません' };
      }
      case 'dice':
        return this.diceTargets(player, def.dice, def.per, def.randomCost);
      case 'healCastleOrMp':
        // スライム：城HPと MP のどちらかがまだ増えるなら出せる（どちらになるかはランダム）
        return {
          targets: !player.castle.isFull || (this.rules.maxMp > 0 && player.mp < this.rules.maxMp) ? [{ playerId: player.id }] : [],
          reason: '城のHPもMPも満タンです',
        };
      case 'healAndArmor':
        // トレント：城の回復か城壁のどちらかが効くなら出せる
        return {
          targets: !player.castle.isFull || !this.armorFull(player, { amount: def.armor }) ? [{ playerId: player.id }] : [],
          reason: '城のHPが満タンで、城壁も上限です',
        };
      case 'stealCoins':
        // ミミック：コインを持っている相手だけ
        return { targets: playerTargets(this.opponentsOf(player.id).filter((p) => p.coins > 0)), reason: '相手のコインがありません' };
      case 'drainMp':
        // MPドレイン：MP を持っている相手だけ
        if (this.rules.maxMp <= 0) return { targets: [], reason: 'このルールではMPを使いません' };
        return { targets: playerTargets(this.opponentsOf(player.id).filter((p) => p.mp > 0)), reason: '相手のMPがありません' };
      case 'damageAllSoldiers':
        // 爆発：場に（見える）兵士がだれかいれば出せる。対象は自分（全員に効く）
        return {
          targets: this.alivePlayerIds().some((id) => this.players[id].visibleSoldiers.length > 0) ? [{ playerId: player.id }] : [],
          reason: '場に兵士がいません',
        };
      case 'damageEnemySoldiers':
        return {
          targets: playerTargets(this.opponentsOf(player.id).filter(hasSoldiers)),
          reason: '道の上に相手の兵士がいません',
        };
      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers':
      case 'pushBackEnemySoldiers': {
        // 効き目が変わる兵士がいる相手だけ（全員もう同じかそれ以上の状態・押し戻せないなら、出しても何も起きない）
        const changes = this.changesSoldier(def);
        const withSoldiers = this.opponentsOf(player.id).filter(hasSoldiers);
        return {
          targets: playerTargets(withSoldiers.filter((p) => p.visibleSoldiers.some(changes))),
          reason: withSoldiers.length ? this.noChangeReason(def) : '道の上に相手の兵士がいません',
        };
      }
      case 'poisonEnemy': {
        // 毒は足し算で、城はいつも毒にできる。相手がいればいつでも出せる
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: playerTargets(foes), reason: '相手がいません' };
      }
      case 'vulnerableCastle': {
        // 脆弱（魔族）：相手の城。もう上限の回数まで脆弱な城は選べない
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        const max = def.maxTurns ?? def.turns;
        return { targets: playerTargets(foes.filter((p) => (p.castle.vulnerable?.turns ?? 0) < max)), reason: foes.length ? 'その城はもう上限まで脆弱です' : '相手がいません' };
      }
      case 'poisonEnemyCastle': {
        // 毒の霧（魔族）：相手の城。もう上限の回数まで毒が続く城（と、永続の毒の城）は、出しても変わらないので選べない
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        const max = def.maxTurns ?? def.turns;
        const changes = (p) => !p.castle.poison || (p.castle.poisonTurns !== null && p.castle.poisonTurns < max) || p.castle.poison < def.amount;
        return { targets: playerTargets(foes.filter(changes)), reason: foes.length ? 'その城の毒はもう上限まで続きます' : '相手がいません' };
      }
      case 'curePoison':
        return {
          targets: player.castle.poison || player.soldiers.some((x) => x.poison) ? [{ playerId: player.id }] : [],
          reason: '毒にかかっているものがありません',
        };
      case 'singleDamage':
        if (def.target === 'front') return this.frontSoldierTargets(player);
        // 相手の兵士1体を選ぶ（見えない忍者・暗殺者は選べない）
        return {
          targets: this.opponentsOf(player.id).flatMap((p) => p.visibleSoldiers.map((x) => ({ soldierId: x.soldierId }))),
          reason: '道の上に相手の兵士がいません',
        };
      case 'randomElementDamage':
        if (def.target === 'front') return this.frontSoldierTargets(player);
        // 相手の兵士1体を選ぶ（見えない忍者・暗殺者は選べない）
        return {
          targets: this.opponentsOf(player.id).flatMap((p) => p.visibleSoldiers.map((x) => ({ soldierId: x.soldierId }))),
          reason: '道の上に相手の兵士がいません',
        };
      case 'reviveFallen': {
        // 蘇生：最後に倒れた自分の兵士がいて、その道がまだあるときだけ（対象は自分）
        const fallen = player.lastFallen;
        if (!fallen) return { targets: [], reason: '生き返らせる兵士がいません' };
        return { targets: this.findRoad(fallen.roadId) ? [{ playerId: player.id }] : [], reason: '倒れた兵士の道がもうありません' };
      }
      case 'weakenAttack': {
        // 呪いの印（4陣営の魔族。soldiers）：相手を選ぶ。まだ呪われていない見える兵士がいる相手だけ（同じ兵士に重ねがけしない）
        if (def.soldiers) {
          const withSoldiers = this.opponentsOf(player.id).filter(hasSoldiers);
          return {
            targets: playerTargets(withSoldiers.filter((p) => this.curseVictims(player, p, def.soldiers).length > 0)),
            reason: withSoldiers.length ? 'もう全員に呪いがかかっています' : '道の上に相手の兵士がいません',
          };
        }
        // 呪い：相手の兵士1体。もう同じか強い呪いがかかっている兵士は選べない（出しても何も変わらないため）
        const all = this.opponentsOf(player.id).flatMap((p) => p.visibleSoldiers);
        const changes = (x) => !x.weakened || x.weakened.amount < def.amount || x.weakened.turns < def.turns;
        return {
          targets: all.filter(changes).map((x) => ({ soldierId: x.soldierId })),
          reason: all.length ? 'もう同じ状態になっています' : '道の上に相手の兵士がいません',
        };
      }
      case 'chainBlast':
        // 相手の兵士1体を選ぶ（見えない忍者・暗殺者は選べない）
        return {
          targets: this.opponentsOf(player.id).flatMap((p) => p.visibleSoldiers.map((x) => ({ soldierId: x.soldierId }))),
          reason: '道の上に相手の兵士がいません',
        };
      case 'ignitionBurst': {
        // 自分の城が落ちるほどのときは出せない（自滅させない）
        if (player.castle.hp <= card.def.selfDamage + 1) return { targets: [], reason: `城のHPが足りません（${card.def.selfDamage + 2}以上必要）` };
        return { targets: playerTargets(this.enemySides(player.id)), reason: '相手がいません' };
      }
      case 'armorBlast':
        if (player.armor <= 0) return { targets: [], reason: '城壁がありません' };
        return { targets: playerTargets(this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id)), reason: '相手がいません' };
      case 'purifyFlare': {
        const cures = player.castle.poison || player.soldiers.some((x) => x.poison || x.burn || x.frozen > 0 || DOT_STATUSES.some((st) => x[st]));
        const foes = def.amount > 0 && this.opponentsOf(player.id).some(hasSoldiers);
        // 4陣営：相手の付着を消す浄化は、相手の兵士に付着があれば出せる
        const attached = def.clearEnemyAttachments && this.opponentsOf(player.id).some((p) => p.visibleSoldiers.some((x) => x.attachments.length > 0));
        return { targets: cures || foes || attached ? [{ playerId: player.id }] : [], reason: def.amount > 0 ? '治すものも、相手の兵士もいません' : '治すものも、相手の付着もありません' };
      }
      case 'setTime': {
        // 刻の魔法：ムーンライズは昼のとき（夜にする）、ドーンブレイクは夜のとき（昼にする）だけ出せる
        const now = this.night ? 'night' : 'day';
        return {
          targets: now !== card.def.time ? [{ playerId: player.id }] : [],
          reason: card.def.time === 'night' ? 'もう夜です' : 'もう昼です',
        };
      }
      case 'changeWeather': {
        // 今と違う天候に変える。変えられる天候がなければ出せない（出しても何も起きないので）
        if (!this.weatherDefs) return { targets: [], reason: 'このルールでは天候を使いません' };
        const others = Object.keys(this.weatherDefs).filter((t) => t !== this.weather?.type);
        return { targets: others.length > 0 ? [{ playerId: player.id }] : [], reason: 'ほかに変えられる天候がありません' };
      }
      case 'gainCoins':
        return { targets: [{ playerId: player.id }], reason: '' };
      case 'gainMp':
        return { targets: this.rules.maxMp > 0 && player.mp < this.rules.maxMp ? [{ playerId: player.id }] : [], reason: this.rules.maxMp > 0 ? 'MPが満タンです' : 'このルールではMPを使いません' };
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
      case 'guardCastle':
        // 身代わり（4陣営）：自分の兵士1体（もう身代わりの兵士は選べない）
        return {
          targets: player.soldiers.filter((x) => x.soldierId !== player.castle.guard).map((x) => ({ soldierId: x.soldierId })),
          reason: player.soldiers.length ? 'その兵士はもう身代わりです' : '道の上に自分の兵士がいません',
        };
      case 'healSoldier':
        // 竜血の雫：傷ついた自分の兵士1体
        return {
          targets: player.soldiers.filter((x) => x.hp < x.maxHp).map((x) => ({ soldierId: x.soldierId })),
          reason: player.soldiers.length ? '傷ついた兵士がいません' : '道の上に自分の兵士がいません',
        };
      case 'healCastleAndSoldiers':
        // 生命の雫：城HPか、傷ついた兵士のどちらかが回復できれば出せる
        return {
          targets: !player.castle.isFull || player.soldiers.some((x) => x.hp < x.maxHp) ? [{ playerId: player.id }] : [],
          reason: '城のHPが満タンで、傷ついた兵士もいません',
        };
      case 'breathAttack':
        // 火炎の吐息：道を選ぶ（相手の兵士がいなくても、城に届く）
        return { targets: this.frontSpellTargets(player, this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id)), reason: '相手がいません' };
      case 'healOwnCastle':
        return { targets: player.castle.isFull ? [] : [{ playerId: player.id }], reason: '城のHPが満タンです' };
      case 'shieldSoldier':
        return { targets: ownSoldiers(), reason: '道の上に自分の兵士がいません' };
      case 'armorCastle':
        return {
          targets: this.armorFull(player, def) ? [] : [{ playerId: player.id }],
          reason: this.rules.armorMax ? `城壁がもう上限（${this.rules.armorMax}）まで積んであります` : '同じか、より強い城壁がもう置いてあります',
        };
      default:
        return { targets: [], reason: 'このカードは出せません' };
    }
  }

  /** その魔法で、兵士 x の状態が変わるか（毒・凍結：もう同じかそれ以上なら変わらない。サンダーはいつも変わる） */
  changesSoldier(def) {
    if (def.effect === 'poisonEnemySoldiers') return (x) => !x.poison || x.poison.turns < def.turns || x.poison.amount < def.amount;
    if (def.effect === 'freezeEnemySoldiers') return (x) => x.frozen < def.turns + this.stageEffectBonus(def.effect);
    // 押し戻し：自分の城の前（マス0）にいる兵士は、それより後ろに下がれない
    if (def.effect === 'pushBackEnemySoldiers') return (x) => x.position > 0;
    return () => true;
  }

  /** 相手の兵士はいるが、出しても何も変わらないときの理由 */
  noChangeReason(def) {
    if (def.effect === 'pushBackEnemySoldiers') return '押し戻せる兵士がいません（みんな城の前にいます）';
    return 'もう同じ状態になっています';
  }

  /** 手番・手札・枚数の決まりを確かめる。出せるならカードを返す */
  checkPlayable(cardId) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('手札を捨てているところです');
    if (this.phase === 'defend') return fail('相手が防御を選んでいます');
    if (this.phase === 'mulligan') return fail('最初の手札を選んでいるところです');

    const player = this.players[this.currentPlayer];
    const card = player.findInHand(cardId);
    if (!card) {
      if (this.opponentsOf(player.id).some((p) => p.findInHand(cardId))) return fail('あなたの番ではありません');
      return fail('そのカードは手札にありません');
    }
    // 適応は合成専用。枠の決まりより先に答える（「もうメインを出しました」だと、次のターンなら出せるように読めてしまう）
    if (card.def.effect === 'wild') return fail('適応は合成に使うカードです（出せません）');
    // 兵士は1ターン soldiersPerTurn 枚、メイン（攻撃の魔法）は1枚。付加（武器）・防御・回復や精霊などは何枚でも
    if (card.slot === 'soldier' && player.soldiersPlayedThisTurn >= this.rules.soldiersPerTurn) {
      return fail(`このターンに出せる兵士は${this.rules.soldiersPerTurn}枚までです`);
    }
    if (card.slot === 'main' && player.playedThisTurn) return fail('このターンはもうメインのカードを出しました');
    if (isCoinCard(card.def) && this.rules.coinCardsPerTurn && player.coinCardsPlayedThisTurn >= this.rules.coinCardsPerTurn) {
      return fail(`コインのカードは1ターンに${this.rules.coinCardsPerTurn}枚までです`);
    }
    const cost = this.mpCostOf(card);
    if (cost > player.mp) return fail(`MPが足りません（${cost}必要・あと${cost - player.mp}）`);
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
    const mpCost = this.mpCostOf(card);
    if (mpCost > 0) this.changeMp(player, -mpCost, 'cast');
    if (card.slot === 'main') player.playedThisTurn = true;
    if (isCoinCard(card.def)) player.coinCardsPlayedThisTurn += 1;
    if (card.slot === 'soldier') player.soldiersPlayedThisTurn += 1;
    player.cardsPlayedThisTurn += 1;
    // 使ったカードは（兵士も）すぐ捨て札へ。使い切りのカードは、二度と山札に戻らない置き場へ
    this.throwAway(player.id, card);
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.type });

    this.applyCard(player, card, resolved.target);

    this.checkGameOver();
    return ok();
  }

  /** 出したカードの効果を起こす（神頼みでタダで出すときにも使う） */
  applyCard(player, card, target) {
    if (card.def.effect === 'dice') {
      this.rollDice(player, card, target);
      return;
    }
    if (card.isSoldier) {
      const targetId = target.playerId;
      const road = target.roadId ? this.findRoad(target.roadId) : this.roadBetween(player.id, targetId);
      const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
      const soldier = new Soldier(soldierId, card, road.roadId, targetId);
      soldier.baseAttack += player.castleDef.soldierAttackBonus ?? 0; // 兵舎
      soldier.baseAttack += player.armyAttack; // 訓練（コインで買う）
      soldier.hp += player.armyHp;
      soldier.maxHp += player.armyHp;
      player.soldiers.push(soldier);
      if (soldier.stealth) (this.stealthSides ??= new Map()).set(soldierId, this.side(player.id));
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
    } else if (card.isSpell && target.soldierId) {
      if (card.def.effect === 'singleDamage') this.singleDamage(player, card, target.soldierId);
      else if (card.def.effect === 'healSoldier') this.healSoldier(player, card, target.soldierId);
      else if (card.def.effect === 'randomElementDamage') this.randomElementDamage(player, card, target.soldierId);
      else if (card.def.effect === 'weakenAttack') this.weakenAttack(player, card, target.soldierId);
      else this.chainBlast(player, card, target.soldierId);
    } else if (card.isSpell && target.monsterId) {
      const monster = this.findMonster(target.monsterId);
      this.emit('spellCast', { playerId: player.id, type: card.type, target: monster.monsterId, targetKind: 'monster' });
      if (this.rollMiss()) {
        this.emitMiss(player.id, 'spell', { type: card.type });
      } else {
        this.damageMonster(monster, card.def.amount + this.stageEffectBonus(card.def.effect), { playerId: player.id, type: card.type });
        this.defeatMonsterIfDead(monster, player.id);
      }
    } else if (card.isSpell && card.def.effect === 'reviveFallen') {
      this.reviveFallen(player, card);
    } else if (card.isSpell) {
      this.castSpell(player, card, this.players[target.playerId], target.roadId);
    } else {
      this.playSupport(player, card, target);
    }

  }

  /**
   * チェーン・ブラスト：相手の兵士1体に amount、そのまわりの同じ陣地の兵士に半分（切り上げ）。
   * まわり＝同じ道の前後1マス（同じマスも）・となりの道（同じ2人の間のレーンが1つちがい）の同じマス。
   * 兵士に当たる魔法なので、相手は盾を出せる
   */
  chainBlast(player, card, soldierId) {
    const owner = this.opponentsOf(player.id).find((p) => p.soldiers.some((x) => x.soldierId === soldierId));
    const center = owner.soldiers.find((x) => x.soldierId === soldierId);
    const amount = card.def.amount;
    const half = Math.ceil(amount / 2);
    const road = this.findRoad(center.roadId);
    const side = this.side(owner.id);
    const sq = road.toSquare(side, center.position);
    const near = [];
    for (const id of this.alivePlayerIds().filter((id) => this.side(id) === side)) {
      for (const x of this.players[id].visibleSoldiers) {
        if (x === center) continue;
        const r = this.findRoad(x.roadId);
        const xsq = r.toSquare(side, x.position);
        const sameRoad = r.roadId === road.roadId && Math.abs(xsq - sq) <= 1;
        const nextLane = r.pairId === road.pairId && Math.abs(r.lane - road.lane) === 1 && xsq === sq;
        if (sameRoad || nextLane) near.push({ owner: this.players[id], soldier: x });
      }
    }
    this.emit('spellCast', { playerId: player.id, type: card.type, target: owner.id, targetKind: 'player', roadId: center.roadId, soldierId });
    if (this.rollMiss()) {
      this.emitMiss(player.id, 'spell', { type: card.type });
      return;
    }
    this.requestDefense(
      { kind: 'soldiers', defenderId: side, attackerId: player.id, amount, soldierIds: [soldierId, ...near.map((n) => n.soldier.soldierId)] },
      () => {
        if (owner.soldiers.includes(center)) this.spellHit(owner, center, amount, card);
        for (const n of near) if (n.owner.soldiers.includes(n.soldier)) this.spellHit(n.owner, n.soldier, half, card);
      },
      () => this.checkGameOver(),
    );
  }

  /**
   * ランダム属性ダメージ（randomElementDamage）：敵兵士1体に amount（ステージの魔法の増加は乗る）。
   * 火・水・風・土のうちランダムな1つの属性で撃ち、その属性が相手の兵士の属性に強ければ elementBonus 増える
   * （属性なしの相手・弱い側に当たったときは増減なし）。盾が先に受ける。霧で外れる。相手は盾を出せる
   */
  randomElementDamage(player, card, soldierId) {
    const owner = this.opponentsOf(player.id).find((p) => p.soldiers.some((x) => x.soldierId === soldierId));
    const soldier = owner.soldiers.find((x) => x.soldierId === soldierId);
    const element = ELEMENTS[Math.floor(this.rng() * ELEMENTS.length)];
    const strong = beatsElement(this.elementDefs, element, soldier.element);
    // 4陣営：呪術師（混沌）などの属性魔法の強化は、カードの属性で乗る（撃つランダムな属性ではない）
    const amount = card.def.amount + this.stageEffectBonus(card.def.effect) + (strong ? this.rules.elementBonus : 0) + this.spellBonus(player, card.def.element);
    this.emit('spellCast', { playerId: player.id, type: card.type, target: owner.id, targetKind: 'player', roadId: soldier.roadId, soldierId, element });
    if (this.rollMiss()) {
      this.emitMiss(player.id, 'spell', { type: card.type });
      return;
    }
    this.requestDefense(
      { kind: 'soldiers', defenderId: owner.id, attackerId: player.id, amount, soldierIds: [soldierId] },
      () => {
        if (owner.soldiers.includes(soldier)) this.spellHit(owner, soldier, amount, card);
      },
      () => this.checkGameOver(),
    );
  }

  /**
   * 蘇生（reviveFallen）：最後に倒れた自分の兵士1体を、倒れた道の自分の城の前（マス0）に生き返らせる。
   * HP は倒れたときの最大HPの amount 倍（切り上げ・最低1）。武器・盾・状態異常はなし。攻撃は新しく出した兵士と同じ決まり
   * （種類の値＋兵舎＋訓練）。出したターンには動かない
   */
  reviveFallen(player, card) {
    const fallen = player.lastFallen;
    player.lastFallen = null;
    // 忍者は相手から見えないので、どの道に生き返ったか（roadId）は spellCast に入れない（soldierDeployed は stealth 付きで出る）
    const hidden = this.cardDefs[fallen.type].role === 'ninja';
    this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player', ...(hidden ? {} : { roadId: fallen.roadId }) });
    const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
    const soldier = new Soldier(soldierId, { type: fallen.type, def: this.cardDefs[fallen.type] }, fallen.roadId, fallen.targetId);
    soldier.baseAttack += player.castleDef.soldierAttackBonus ?? 0; // 兵舎
    soldier.baseAttack += player.armyAttack; // 訓練（コインで買う）
    soldier.maxHp = fallen.maxHp;
    soldier.hp = Math.max(1, Math.ceil(fallen.maxHp * card.def.amount));
    player.soldiers.push(soldier);
    if (soldier.stealth) (this.stealthSides ??= new Map()).set(soldierId, this.side(player.id));
    this.emit('soldierDeployed', {
      playerId: player.id,
      soldierId,
      type: fallen.type,
      roadId: fallen.roadId,
      targetId: fallen.targetId,
      position: soldier.position,
      hp: soldier.hp,
      attack: soldier.attack,
      revived: true,
    });
  }

  /**
   * 敵兵士1体にダメージ（singleDamage）：amount（ステージの魔法の増加は乗る）。盾が先に受ける。霧で外れる。
   * 兵士に当たる魔法なので、相手は盾を出せる
   */
  singleDamage(player, card, soldierId) {
    const owner = this.opponentsOf(player.id).find((p) => p.soldiers.some((x) => x.soldierId === soldierId));
    const soldier = owner.soldiers.find((x) => x.soldierId === soldierId);
    const amount = card.def.amount + this.stageEffectBonus(card.def.effect) + this.spellBonus(player, card.def.element);
    this.emit('spellCast', { playerId: player.id, type: card.type, target: owner.id, targetKind: 'player', roadId: soldier.roadId, soldierId });
    if (this.rollMiss()) {
      this.emitMiss(player.id, 'spell', { type: card.type });
      return;
    }
    this.requestDefense(
      { kind: 'soldiers', defenderId: owner.id, attackerId: player.id, amount, soldierIds: [soldierId] },
      () => {
        if (!owner.soldiers.includes(soldier)) return;
        this.spellHit(owner, soldier, amount, card);
        // 地割れ（freezeTurns）：生き残れば休ませる
        const turns = card.def.freezeTurns;
        if (turns && owner.soldiers.includes(soldier) && soldier.frozen < turns && !this.wardsStatus(soldier)) {
          soldier.frozen = turns;
          this.emit('statusApplied', { playerId: owner.id, soldierId, status: 'frozen', turns });
        }
      },
      () => this.checkGameOver(),
    );
  }

  /** 竜血の雫（healSoldier）：傷ついた自分の兵士1体のHPを amount 回復（最大HPまで）。soldierHealed を出す */
  healSoldier(player, card, soldierId) {
    const soldier = player.soldiers.find((x) => x.soldierId === soldierId);
    this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player', roadId: soldier.roadId, soldierId });
    this.healOneSoldier(player, soldier, card.def.amount);
  }

  /** 兵士のHPを回復（最大HPまで）。増えたら soldierHealed を出す */
  healOneSoldier(owner, soldier, amount) {
    const healed = Math.min(amount, soldier.maxHp - soldier.hp);
    if (healed <= 0) return;
    soldier.hp += healed;
    this.emit('soldierHealed', { playerId: owner.id, soldierId: soldier.soldierId, amount: healed, hp: soldier.hp });
  }

  /**
   * 呪い（weakenAttack）：敵兵士1体の攻撃力を amount 下げる（最低1）。turns 回、持ち主の進軍が終わるたびに1減って0で治る。
   * 重ねがけは、量・回数を大きい方にそろえる。ダメージではないので、霧でも外れず、防御も聞かない（凍結と同じ）
   */
  weakenAttack(player, card, soldierId) {
    const owner = this.opponentsOf(player.id).find((p) => p.soldiers.some((x) => x.soldierId === soldierId));
    const soldier = owner.soldiers.find((x) => x.soldierId === soldierId);
    this.emit('spellCast', { playerId: player.id, type: card.type, target: owner.id, targetKind: 'player', roadId: soldier.roadId, soldierId });
    const amount = Math.max(card.def.amount, soldier.weakened?.amount ?? 0);
    const turns = Math.max(card.def.turns, soldier.weakened?.turns ?? 0);
    if (!this.wardsStatus(soldier)) {
      soldier.weakened = { amount, turns };
      this.emit('statusApplied', { playerId: owner.id, soldierId, status: 'weakened', turns, amount });
    }
    this.elementHit(owner, soldier, card.def.element);
  }

  /**
   * 呪いの印（weakenAttack の soldiers。4陣営の魔族）：enemy の、まだ呪われていない見える兵士のうち、撃った人の城に近い順（position が大きい順。
   * 同じなら先に出された方。道はまたぐ）に n 体。神盾で状態異常を受けない兵士は数えない
   */
  curseVictims(player, enemy, n) {
    return enemy.visibleSoldiers
      .filter((x) => !x.weakened && !this.wardsStatus(x))
      .sort((a, b) => b.position - a.position || soldierNumber(a) - soldierNumber(b))
      .slice(0, n);
  }

  /** 呪いの印：手前の兵士 soldiers 体の攻撃を amount 下げる（turns 回の進軍のあいだ）。spellCast は1回。霧で外れず、防御も聞かない */
  curseFront(player, card, enemy) {
    this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
    for (const soldier of this.curseVictims(player, enemy, card.def.soldiers)) {
      soldier.weakened = { amount: card.def.amount, turns: card.def.turns };
      this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status: 'weakened', turns: card.def.turns, amount: card.def.amount });
      this.elementHit(enemy, soldier, card.def.element);
    }
  }

  /** 呪い：持ち主の進軍が終わったら、残りを1減らす（0で治る） */
  tickWeakened(player) {
    for (const soldier of player.soldiers) {
      if (!soldier.weakened) continue;
      soldier.weakened.turns -= 1;
      if (soldier.weakened.turns <= 0) {
        soldier.weakened = null;
        this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'weakened' });
      }
    }
  }

  /**
   * 先頭の兵士に当たる1体への魔法（カードの target "front"。4陣営）の対象：相手ごと（レーンが2本以上なら道ごと）の { playerId } / { playerId, roadId }。
   * その道に相手の見える兵士がいるものだけ（当たるのは、撃った人の城にいちばん近い兵士＝frontSoldier）
   */
  frontSoldierTargets(player) {
    const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
    const targets = this.frontSpellTargets(player, foes).filter((t) => {
      const enemy = this.players[t.playerId];
      const road = this.frontRoad(player, enemy, t.roadId);
      return road && this.frontSoldier(player, enemy, road);
    });
    return { targets, reason: '道の上に相手の兵士がいません' };
  }

  /** castleSpellHitsFront の対象：相手ごとに、2人の間の道が2本以上なら { playerId, roadId }、そうでなければ { playerId } */
  frontSpellTargets(player, foes) {
    return foes.flatMap((p) => {
      const roads = this.roadsBetween(player.id, p.id);
      return roads.length > 1 ? roads.map((r) => ({ playerId: p.id, roadId: r.roadId })) : [{ playerId: p.id }];
    });
  }

  /** 城への魔法が通る道（roadId を選んでいなければ、2人の間の道が1本のときだけその道）。なければ null */
  frontRoad(player, enemy, roadId) {
    if (roadId !== undefined) return this.findRoad(roadId);
    const roads = this.roadsBetween(player.id, enemy.id);
    return roads.length === 1 ? roads[0] : null;
  }

  /**
   * 選んだ道の、相手の陣地の見える兵士のうち、撃った人の城にいちばん近い兵士（position がいちばん大きい。同じなら先に出された方）。
   * 忍者は見えないので数えない。いなければ null。見つかったら { owner, soldier }
   */
  frontSoldier(player, enemy, road) {
    const side = this.side(enemy.id);
    const list = this.alivePlayerIds().filter((id) => this.side(id) === side).flatMap((id) =>
      this.players[id].visibleSoldiers.filter((x) => x.roadId === road.roadId).map((soldier) => ({ owner: this.players[id], soldier })),
    );
    list.sort((a, b) => b.soldier.position - a.soldier.position || soldierNumber(a.soldier) - soldierNumber(b.soldier));
    return list[0] ?? null;
  }

  /**
   * 城への魔法を先頭の兵士に当てる（castleSpellHitsFront）。当てる兵士がいなければ何もせず false（城に当たる）。
   * ダメージは魔法の量そのまま（魔法の塔のボーナスは城だけ）。盾が先に受ける。防御は兵士に当たる魔法と同じ（盾だけ）
   */
  castFrontSpell(player, card, enemy, roadId, amount) {
    const road = this.frontRoad(player, enemy, roadId);
    const front = road && this.frontSoldier(player, enemy, road);
    if (!front) return false;
    const { owner, soldier } = front;
    this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', roadId: road.roadId, soldierId: soldier.soldierId });
    if (this.rollMiss()) {
      this.emitMiss(player.id, 'spell', { type: card.type });
      return true;
    }
    this.requestDefense(
      { kind: 'soldiers', defenderId: owner.id, attackerId: player.id, amount, soldierIds: [soldier.soldierId] },
      () => {
        if (owner.soldiers.includes(soldier)) this.spellHit(owner, soldier, amount, card);
      },
      () => this.checkGameOver(),
    );
    return true;
  }

  castSpell(player, card, targetPlayer, roadId) {
    const enemy = targetPlayer;
    const { effect } = card.def;
    // ステージで、魔法の数値が増える（溶岩・遺跡）
    const amount = card.def.amount === undefined ? undefined : card.def.amount + this.stageEffectBonus(effect)
      // 4陣営：ドルイド・呪術師がいれば、その属性のダメージの魔法が強くなる（兵士がいなければ0）
      + (BOOSTED_EFFECTS.includes(effect) ? this.spellBonus(player, card.def.element) : 0);
    // レーンを選んだ魔法は、その道の兵士だけに効く（spellCast にも roadId を入れる）
    const lane = roadId === undefined ? {} : { roadId };
    const victims = () => enemy.visibleSoldiers.filter((x) => roadId === undefined || x.roadId === roadId);

    switch (effect) {
      case 'weakenAttack':
        this.curseFront(player, card, enemy);
        break;

      case 'singleDamage':
      case 'randomElementDamage': {
        // 先頭の兵士に当たる1体への魔法（target "front"）：選んだ道の先頭の兵士に、1体への魔法と同じように当てる
        const front = this.frontSoldier(player, enemy, this.frontRoad(player, enemy, roadId));
        if (effect === 'singleDamage') this.singleDamage(player, card, front.soldier.soldierId);
        else this.randomElementDamage(player, card, front.soldier.soldierId);
        break;
      }

      case 'damageEnemyCastle':
        // castleSpellHitsFront：選んだレーンの相手の先頭の兵士に当てる（いなければ、下の城へのダメージ）
        if (this.rules.castleSpellHitsFront && this.castFrontSpell(player, card, enemy, roadId, amount)) break;
        this.emit('spellCast', {
          playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player',
          ...(this.rules.castleSpellHitsFront && this.frontRoad(player, enemy, roadId) ? { roadId: this.frontRoad(player, enemy, roadId).roadId } : {}),
        });
        // 魔法の塔は城への魔法が強い
        {
          const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
          if (this.rollMiss()) {
            this.emitMiss(player.id, 'spell', { type: card.type });
            break;
          }
          this.requestDefense(
            { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
            () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
            () => this.checkGameOver(),
          );
        }
        break;

      case 'drainCastle': {
        // 生命吸収：城にダメージ（城壁が先に受ける）。城HPを実際に減らしたぶん、自分の城を回復
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
          () => {
            const before = enemy.castle.hp;
            this.damageCastle(enemy, damage, { kind: 'spell', type: card.type });
            const taken = Math.max(0, before - Math.max(0, enemy.castle.hp));
            // 相手の城が落ちたら、回復せずに決着（gameOver）へ
            if (taken > 0 && !enemy.castle.isDestroyed) {
              const healed = player.castle.heal(taken);
              if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
            }
          },
          () => this.checkGameOver(),
        );
        break;
      }

      case 'damageCastleAndHeal': {
        // 吸血（ヴァンパイアのカード）：相手の城に amount ダメージ（防御を聞く）、そのあと自分の城を heal 回復。
        // 回復は、外れても・防がれても・反射されても起きる。相手の城が落ちたら回復せずに決着
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const heal = () => {
          if (this.checkGameOver()) return;
          const healed = player.castle.heal(card.def.heal);
          if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        };
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          heal();
          break;
        }
        // requestDefense は、防御を待ったときだけ after を呼ぶ。待たなかったときは、ここで回復する
        const waiting = this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, amount, { kind: 'spell', type: card.type }),
          heal,
        );
        if (!waiting) heal();
        break;
      }

      case 'sacrificeAttack': {
        // 捨て身：先に自分の城HPを払う（城壁・土の精霊は通さない。外れても払う）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        player.castle.takeDamage(card.def.selfDamage);
        this.emit('castleDamaged', {
          playerId: player.id, amount: card.def.selfDamage, blocked: 0, hp: player.castle.hp, source: { kind: 'sacrifice', type: card.type },
        });
        const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }

      case 'drainMp': {
        // MPドレイン：相手の MP を奪って自分の MP にする（自分の上限を超えたぶんは捨てる）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const taken = -this.changeMp(enemy, -amount, 'drained');
        this.changeMp(player, taken, 'drain');
        break;
      }

      case 'damageAllSoldiers': {
        // 爆発：場にいる兵士全員（席順。自分の兵士も）にダメージ。忍者には当たらない。防御は聞かない
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        for (const id of this.alivePlayerIds()) {
          const owner = this.players[id];
          for (const soldier of [...owner.visibleSoldiers]) {
            if (owner.soldiers.includes(soldier)) this.spellHit(owner, soldier, amount, card);
          }
        }
        this.checkGameOver();
        break;
      }

      case 'damageEnemySoldiers':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        {
          const hit = victims();
          if (this.rollMiss()) {
            this.emitMiss(player.id, 'spell', { type: card.type });
            break;
          }
          // 兵士を狙われた人は、当たる前に盾を出せる
          this.requestDefense(
            { kind: 'soldiers', defenderId: enemy.id, attackerId: player.id, amount, soldierIds: hit.map((x) => x.soldierId) },
            () => {
              for (const soldier of hit) if (enemy.soldiers.includes(soldier)) this.spellHit(enemy, soldier, amount, card);
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
          if (this.wardsStatus(soldier)) {
            // 神盾：盾が残っている間は状態異常を受けない（付着は下で付く）
          } else if (status === 'poison') {
            const turns = Math.max(card.def.turns, soldier.poison?.turns ?? 0);
            soldier.poison = { amount: Math.max(amount, soldier.poison?.amount ?? 0), turns };
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns });
          } else {
            soldier.frozen = Math.max(card.def.turns + this.stageEffectBonus(effect), soldier.frozen);
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns: soldier.frozen });
          }
          // ダメージのない魔法でも、当たれば魔法の属性が付着する（反応することもある）
          this.elementHit(enemy, soldier, card.def.element);
        }
        break;
      }

      case 'pushBackEnemySoldiers': {
        // ゲイルフォース：相手の兵士を amount マス押し戻す（出した順に。自分の城の前＝マス0で止まる）。
        // ダメージではないので、霧でも外れず、防御も聞かない（凍結と同じ）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        for (const soldier of victims()) {
          const from = soldier.position;
          const to = Math.max(0, from - amount);
          if (to === from) continue;
          soldier.position = to;
          this.emit('soldierMoved', { playerId: enemy.id, soldierId: soldier.soldierId, roadId: soldier.roadId, from, to, cause: 'pushed' });
          this.elementHit(enemy, soldier, card.def.element);
        }
        break;
      }

      case 'poisonEnemy': {
        // 選んだ相手の兵士全員と城を、永続の毒にする（重ねがけは足し算：毒の量が増える）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        // 毒の回数：カードの turns（4陣営の毒の霧）か rules.poisonTurns（0 は永続）
        const poisonTurns = card.def.turns ?? (this.rules.poisonTurns || null);
        for (const soldier of enemy.visibleSoldiers) {
          if (this.wardsStatus(soldier)) {
            this.elementHit(enemy, soldier, card.def.element);
            continue;
          }
          const total = this.capPoison(amount + (soldier.poison?.amount ?? 0));
          const turns = poisonTurns; // 重ねがけで残りターンも延びる
          soldier.poison = { amount: total, turns };
          this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status: 'poison', turns, amount: soldier.poison.amount });
          this.elementHit(enemy, soldier, card.def.element);
        }
        enemy.castle.poison = this.capPoison(amount + (enemy.castle.poison ?? 0));
        enemy.castle.poisonTurns = poisonTurns;
        this.emit('castlePoisoned', { playerId: enemy.id, amount: enemy.castle.poison });
        break;
      }

      case 'vulnerableCastle': {
        // 脆弱（魔族）：相手の城が受ける攻撃のダメージが増える。重ねがけは割合を増やさず、残りの回数に turns を足す（maxTurns まで。永続にしない）。
        // 霧で外れず、防御も聞かない（ダメージではないため）
        const side = this.players[this.side(enemy.id)];
        this.emit('spellCast', { playerId: player.id, type: card.type, target: side.id, targetKind: 'player' });
        const c = side.castle;
        const maxRatio = card.def.maxRatio ?? card.def.ratio;
        c.vulnerable = {
          ratio: Math.min(maxRatio, Math.max(card.def.ratio, c.vulnerable?.ratio ?? 0)),
          maxRatio,
          turns: Math.min(card.def.maxTurns ?? card.def.turns, (c.vulnerable?.turns ?? 0) + card.def.turns),
        };
        this.emit('castleVulnerable', { playerId: side.id, ratio: c.vulnerable.ratio, turns: c.vulnerable.turns });
        break;
      }

      case 'poisonEnemyCastle': {
        // 毒の霧（魔族）：相手の城だけを毒にする。城壁・土の精霊・盾・身代わりは効かない（毒のダメージは tickCastlePoison）。霧で外れず、防御も聞かない。
        // 重ねがけ：毎ターンの量は増やさず（大きい方）、残りの回数だけ turns 延びる（maxTurns まで。永続にはしない）
        const side = this.players[this.side(enemy.id)];
        this.emit('spellCast', { playerId: player.id, type: card.type, target: side.id, targetKind: 'player' });
        const c = side.castle;
        const max = card.def.maxTurns ?? card.def.turns;
        const permanent = Boolean(c.poison) && c.poisonTurns === null;
        const left = c.poison ? c.poisonTurns ?? 0 : 0;
        c.poison = Math.max(card.def.amount, c.poison ?? 0);
        if (!permanent) c.poisonTurns = Math.min(max, left + card.def.turns);
        this.emit('castlePoisoned', { playerId: side.id, amount: c.poison, turns: c.poisonTurns });
        break;
      }

      case 'curePoison': {
        // 自分の毒をすべて治す（兵士も城も）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        for (const soldier of player.soldiers) {
          if (!soldier.poison) continue;
          soldier.poison = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'poison' });
        }
        if (player.castle.poison) {
          player.castle.poison = null;
          player.castle.poisonTurns = null;
          this.emit('castleCured', { playerId: player.id });
        }
        break;
      }

      case 'healOwnCastle': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }

      case 'ignitionBurst': {
        // 先に自分の城が燃える（城壁が先に受ける）。そのあと相手の兵士全員と城に amount（防御は聞かない）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        this.damageCastle(player, card.def.selfDamage, { kind: 'self', type: card.type });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        for (const id of this.alivePlayerIds().filter((id) => this.side(id) === enemy.id)) {
          const owner = this.players[id];
          for (const soldier of [...owner.visibleSoldiers]) this.spellHit(owner, soldier, amount, card);
        }
        this.damageCastle(enemy, amount, { kind: 'spell', type: card.type });
        this.checkGameOver();
        break;
      }

      case 'armorBlast': {
        // 城壁を全部ぶつける（城壁は0になる）。城に当たる魔法なので、相手は防御（反射など）を出せる
        const damage = player.armor;
        player.armor = 0;
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        this.emit('castleArmored', { playerId: player.id, armor: 0 });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }

      case 'purifyFlare': {
        // 自分の毒・やけど・凍結（4陣営は砂・凍傷も）を治し、相手の兵士全員に amount
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        for (const soldier of player.soldiers) {
          for (const status of ['poison', 'burn', 'frozen', ...DOT_STATUSES]) {
            if (status === 'frozen' ? soldier.frozen <= 0 : !soldier[status]) continue;
            soldier[status] = status === 'frozen' ? 0 : null;
            this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status });
          }
        }
        if (player.castle.poison) {
          player.castle.poison = null;
          player.castle.poisonTurns = null;
          this.emit('castleCured', { playerId: player.id });
        }
        // 4陣営：相手の兵士の付着を消す（武器・生まれつきの属性は消えない）
        if (card.def.clearEnemyAttachments) {
          for (const foe of this.opponentsOf(player.id)) {
            for (const soldier of foe.visibleSoldiers) {
              for (const a of soldier.attachments) this.emit('elementCleared', { playerId: foe.id, soldierId: soldier.soldierId, element: a.element, reason: 'purified' });
              soldier.attachments = [];
            }
          }
        }
        if (amount > 0) {
          for (const foe of this.opponentsOf(player.id)) {
            for (const soldier of [...foe.visibleSoldiers]) this.spellHit(foe, soldier, amount, card);
          }
        }
        break;
      }

      case 'healCastleAndSoldiers': {
        // 生命の雫：自分の城と、傷ついた自分の兵士全員を回復
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        for (const soldier of player.soldiers) this.healOneSoldier(player, soldier, card.def.soldierHeal);
        break;
      }

      case 'breathAttack': {
        // 火炎の吐息：選んだ道の相手の兵士全員に amount（盾が先に受ける）、相手の城に城壁を無視して castleAmount。防御は聞かない
        const road = this.frontRoad(player, enemy, roadId);
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...(road ? { roadId: road.roadId } : {}) });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        const side = this.side(enemy.id);
        for (const id of this.alivePlayerIds().filter((x) => this.side(x) === side)) {
          const owner = this.players[id];
          for (const soldier of owner.visibleSoldiers.filter((x) => road && x.roadId === road.roadId)) {
            if (owner.soldiers.includes(soldier)) this.spellHit(owner, soldier, amount, card);
          }
        }
        if (!this.players[side].eliminated) this.damageCastle(this.players[side], card.def.castleAmount, { kind: 'spell', type: card.type }, { ignoreArmor: true });
        this.checkGameOver();
        break;
      }

      case 'setTime': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.setTime(card.def.time, 'card', player.id);
        break;
      }

      case 'changeWeather': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.setWeather(this.pickWeather(this.weather?.type ?? null), 'card', player.id);
        break;
      }

      case 'gainCoins': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.changeCoins(player, amount, 'card');
        break;
      }

      case 'gainMp': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.changeMp(player, amount, 'card'); // 上限を超えたぶんは捨てる
        break;
      }

      case 'redrawHand': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        // 先に同じ枚数を引いてから、元の手札を捨てる（捨てたカードをすぐ引き戻さないように）
        const old = [...player.hand];
        this.drawCards(player, old.length);
        const cardIds = old.map((c) => c.cardId);
        for (const c of old) this.throwAway(player.id, player.takeFromHand(c.cardId), { used: false });
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
        // amount 枚まで（省略すると1枚）。1枚ずつランダムに奪う（ゴーストのカードは2枚）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        for (let i = 0; i < (card.def.amount ?? 1) && enemy.hand.length > 0; i++) {
          const stolen = enemy.hand[enemy.hand.length === 1 ? 0 : Math.floor(this.rng() * enemy.hand.length)];
          enemy.takeFromHand(stolen.cardId);
          player.hand.push(stolen);
          this.emit('cardStolen', { playerId: player.id, victimId: enemy.id, cardId: stolen.cardId });
        }
        break;
      }

      case 'healCastleOrMp': {
        // スライム：城HPか MP のどちらかをランダムに回復（満タンの方は選ばない）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const options = [];
        if (!player.castle.isFull) options.push('hp');
        if (this.rules.maxMp > 0 && player.mp < this.rules.maxMp) options.push('mp');
        const pick = options.length === 1 ? options[0] : options[Math.floor(this.rng() * options.length)];
        if (pick === 'hp') {
          const healed = player.castle.heal(amount);
          this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        } else {
          this.changeMp(player, amount, 'card');
        }
        break;
      }

      case 'healAndArmor': {
        // トレント：城HPを回復し、城壁を置く（城壁の決まりは城壁のカードと同じ）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        if (!this.armorFull(player, { amount: card.def.armor })) this.playSupport(player, { def: { kind: 'defense', effect: 'armorCastle', amount: card.def.armor } }, { playerId: player.id });
        break;
      }

      case 'stealCoins': {
        // ミミック：相手のコインを amount 枚まで奪う（持っている分だけ）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const taken = Math.min(amount, enemy.coins);
        this.changeCoins(enemy, -taken, 'stolen');
        this.changeCoins(player, taken, 'steal');
        break;
      }

      case 'damageEnemyAll': {
        // 魔王：相手の兵士全員（忍者を除く）に amount、そのあと相手の城に amount（城は防御を聞く）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        for (const soldier of [...enemy.visibleSoldiers]) {
          if (enemy.soldiers.includes(soldier)) this.spellHit(enemy, soldier, amount, card);
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, amount, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
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
      mode: def.spiritMode ?? 'min',
      soldiersOnly: def.spiritScope === 'soldiers', // 土の精霊：兵士だけ軽くする（4陣営） // 風の精霊：min（速さの最低値）か add（速さに足す。4陣営）
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
      const healed = player.castle.heal(sp.amount + this.weatherElementBonus('water'));
      if (healed > 0) {
        this.emit('spiritTriggered', { playerId: player.id, type: sp.type, spirit: 'water', amount: healed });
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
      }
    } else if (sp.spirit === 'fire') {
      const foes = this.enemySides(player.id);
      const target = foes.find((p) => p.id === sp.targetId) ?? foes[0];
      if (!target) return false;
      const amount = sp.amount + this.weatherElementBonus('fire');
      this.emit('spiritTriggered', { playerId: player.id, type: sp.type, spirit: 'fire', amount, targetId: target.id });
      this.damageCastle(target, amount, { kind: 'spirit', type: sp.type });
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
    let speed = soldier.speed;
    if (sp && sp.spirit === 'wind') speed = sp.mode === 'add' ? speed + sp.amount : Math.max(speed, sp.amount);
    // 鈍足（泥の反応）：速さが下がる（最低1）
    if (soldier.slowed) speed = Math.max(1, speed - soldier.slowed.amount);
    return speed;
  }

  /** 魔族の魔の血（席のデッキの passive.magicBlood）：owner の兵士・城が攻撃魔法で受けるダメージを spellReduce 軽くする（0はそのまま。1より小さくはならない） */
  magicBloodReduce(owner, amount) {
    const r = owner?.passive?.magicBlood?.spellReduce ?? 0;
    return r > 0 && amount > 0 ? Math.max(1, amount - r) : amount;
  }

  /** 土の精霊：owner が受けるダメージを軽くする（0のダメージはそのまま。1より小さくはならない） */
  reduceDamage(owner, amount, target = 'soldier') {
    const sp = owner.spirit;
    if (!sp || sp.spirit !== 'earth' || amount <= 0) return amount;
    if (sp.soldiersOnly && target === 'castle') return amount; // 4陣営の土の精霊は城を軽くしない
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
        // 攻撃力は足し算（重ねるほど強くなる）。属性は上書き（最後の武器の属性。属性なしの武器なら属性が消える）
        soldier.weapon = card.type;
        soldier.weaponBonus += def.attackBonus;
        soldier.element = def.element ?? null;
        // 4陣営：射程+（重ねると足し算）と、当たった相手を休ませる（いちばん大きいもの）
        soldier.rangeBonus += def.rangeBonus ?? 0;
        soldier.freezeOnHit = Math.max(soldier.freezeOnHit, def.freezeOnHit ?? 0);
        this.emit('weaponEquipped', {
          playerId: player.id, soldierId: soldier.soldierId, type: card.type, attack: soldier.attack, element: soldier.element,
        });
      } else {
        // 氷のステージ：盾が厚くなる
        const amount = def.amount + this.stageEffectBonus(def.effect);
        soldier.shield += amount;
        // 4陣営の神盾（statusWard）：盾が残っている間、その兵士は状態異常を受けない
        if (def.statusWard) soldier.statusWard = true;
        this.emit('shieldAdded', { playerId: player.id, soldierId: soldier.soldierId, amount, shield: soldier.shield });
      }
      return;
    }
    if (def.effect === 'armorCastle') {
      // armorMax があれば永続で足し算（上限まで）。なければ重ならない（今より多いときだけ出せる）
      const before = player.armor;
      player.armor = this.rules.armorMax ? Math.min(this.rules.armorMax, player.armor + def.amount) : def.amount;
      // 血の膜：増えたぶんが血の膜（削れると城HPが回復する）
      if (def.bloodArmor) player.castle.bloodArmor = Math.min(player.armor, (player.castle.bloodArmor ?? 0) + Math.max(0, player.armor - before));
      this.emit('castleArmored', { playerId: player.id, armor: player.armor, ...(def.bloodArmor ? { bloodArmor: player.castle.bloodArmor } : {}) });
      return;
    }
    if (def.effect === 'guardCastle') {
      // 身代わり（4陣営）：次に城が受ける攻撃を、この兵士が代わりに受ける（城に1体だけ。入れかわる）
      player.castle.guard = target.soldierId;
      this.emit('castleGuardSet', { playerId: player.id, soldierId: target.soldierId });
      return;
    }
  }

  /** ターン終了。手札が上限を超えていたら phase "discard" にして、捨て終わるまで待つ */
  endTurn() {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('先に手札を捨ててください');
    if (this.phase === 'defend') return fail('相手が防御を選んでいます');
    if (this.phase === 'mulligan') return fail('最初の手札を選んでいるところです');

    const player = this.players[this.currentPlayer];
    // 溶岩のステージ：ターンの終わりの灼熱
    this.stageTurnEnd(player);
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

    for (const id of cardIds) this.throwAway(player.id, player.takeFromHand(id), { used: false });
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
    // mpAllCards のときは、防御カードも MP を使う（ふつうのルールでは防御カードの MP は0）
    const cost = this.mpCostOf(card);
    if (cost > defender.mp) return { targets: [], reason: `MPが足りません（${cost}必要・あと${cost - defender.mp}）` };
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
      if (this.armorFull(defender, def)) return { targets: [], reason: this.rules.armorMax ? `城壁がもう上限（${this.rules.armorMax}）まで積んであります` : '同じか、より強い城壁がもう置いてあります' };
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
      this.creditTo = p.defenderId; // 反射したダメージは、反射した人が与えたものとして数える
      this.damageCastle(this.players[p.attackerId], p.amount, { kind: 'spell', type: p.spellType });
      this.creditTo = null;
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
    const mpCost = this.mpCostOf(card);
    if (mpCost > 0) this.changeMp(defender, -mpCost, 'cast');
    this.throwAway(defender.id, card);
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
    player.coinCardsPlayedThisTurn = 0;
    this.tickSpirit(player);
    // 4陣営（試作）：城の付着は、城の持ち主のターンの終わりに1減る
    this.tickCastleAttachments(player);
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
    const mine = this.side(playerId);
    // 城が2つ（2人・2チーム）のときは、相手の勝ちですぐ終わる
    if (this.aliveSides().length <= 2) {
      this.finish(alive.find((id) => this.side(id) !== mine), 'surrender');
      return { ok: true };
    }
    // 3つ以上のときは、降参した人（チーム戦ならチーム全員）の城が壊れて抜け、残りの試合を見守る
    if (this.phase === 'defend') this.passDefense(); // 防御待ちだったら、先に攻撃を済ませる
    if (this.phase === 'gameOver') return { ok: true };
    const wasTurn = this.side(this.currentPlayer) === mine && this.phase !== 'mulligan';
    const members = alive.filter((id) => this.side(id) === mine);
    const castle = this.players[mine].castle;
    const lost = castle.hp;
    castle.takeDamage(lost);
    this.emit('castleDamaged', { playerId: mine, amount: lost, blocked: 0, hp: 0, source: { kind: 'surrender' } });
    for (const id of members) this.eliminate(this.players[id], playerId);
    if (this.aliveSides().length <= 1) {
      const left = this.alivePlayerIds();
      this.finish(left[0] ?? playerId, 'lastStanding');
      return { ok: true };
    }
    // マリガン中なら、降参した人は選ばなくてよい。残りが全員選び終わっていれば、先攻（から数えて残っている人）のターン1を始める
    if (this.phase === 'mulligan') {
      for (const id of members) this.mulliganPending.delete(id);
      if (this.mulliganPending.size === 0) this.beginTurn(this.roundLeader());
      return { ok: true };
    }
    // 降参した人の番だったら、次の人の番にする
    if (wasTurn) {
      this.pending = null;
      this.discardCount = 0;
      this.beginTurn(this.nextPlayerAfter(this.currentPlayer));
    }
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
    for (const c of player.hand) this.throwAway(player.id, c, { used: false });
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
    const own = this.rules.deckMode !== 'shared'; // 1人1つの山札（own・cost）
    for (const id of this.playerOrder) {
      const p = this.players[id];
      const pile = this.pileOf(id);
      const base = p.toState(id === viewerId);
      // 忍者（見えない兵士）は、味方（同じ陣地）にしか見せない
      if (!viewerId || !this.players[viewerId] || this.side(viewerId) !== this.side(id)) {
        base.soldiers = base.soldiers.filter((st) => !p.soldiers.find((x) => x.soldierId === st.soldierId)?.stealth);
      }
      // 広場のとき、兵士がいる場所（どの城の道か・広場か）。となりの道のときは null
      for (const st of base.soldiers) {
        const soldier = p.soldiers.find((x) => x.soldierId === st.soldierId);
        st.place = this.plaza ? this.placeOf(id, soldier) : null;
        // 付着（reactions を渡したゲームだけ。通常モードの getState にはキーを足さない）
        if (this.reactionDefs) st.attachments = soldier.attachments.map((a) => ({ ...a }));
        // 4陣営：鈍足・目くらまし（反応で使うときだけキーを足す）・射程+
        if (this.extState.slowBlind) {
          st.statuses.slowed = soldier.slowed ? { ...soldier.slowed } : null;
          st.statuses.blinded = soldier.blinded ? { ...soldier.blinded } : null;
        }
        // 4陣営：継続ダメージ（砂・凍傷。反応で使うときだけキーを足す）
        for (const status of this.extState.dots) st.statuses[status] = soldier[status] ? { ...soldier[status] } : null;
        if (soldier.rangeBonus > 0) st.rangeBonus = soldier.rangeBonus;
        // 4陣営の神盾：盾が残っている間は状態異常を受けない（そのときだけキーを足す）
        if (soldier.statusWard && soldier.shield > 0) st.statusWard = true;
      }
      players[id] = {
        ...base,
        team: this.teamOf?.get(id) ?? null,
        castleOwner: this.side(id),
        // 背水の陣（城を共有するチームは同じ値）
        overdrive: this.overdrive.has(this.side(id)),
        castleType: p.castleType,
        maxHand: p.maxHand,
        deckId: p.deckId ?? null,
        deckCount: own ? pile.deck.length : null,
        discardCount: own ? pile.discard.length : null,
        exhaustedCount: own ? pile.exhausted.length : null,
        // 4陣営：身代わりの兵士・血の膜の残り・回復量減少（使うデータのときだけキーを足す）
        ...(this.extState.guard ? { castleGuard: p.castle.guard ?? null } : {}),
        ...(this.extState.blood ? { bloodArmor: p.castle.bloodArmor ?? 0 } : {}),
        // 4陣営の森：常時の精霊（だれかが持つゲームだけキーを足す）。次に動く精霊と、動く順
        ...(this.extState.passiveSpirits ? { passiveSpirit: this.passiveSpiritState(p) } : {}),
        ...(this.extState.healCut ? { castleHealCut: p.castle.healCut ? { ...p.castle.healCut } : null } : {}),
        ...(this.extState.vulnerable ? { castleVulnerable: p.castle.vulnerable ? { ...p.castle.vulnerable } : null } : {}),
        // 4陣営（試作）：城に付いている属性（castleAttach のゲームだけキーを足す。チーム戦は城を共有）
        ...(this.rules.castleAttach && this.reactionDefs ? { castleAttachments: p.castle.attachments.map((a) => ({ ...a })) } : {}),
        // 強化の今の値段（costs で買うたびに上がる強化があるので、人ごと）
        upgradeCosts: Object.fromEntries(Object.keys(this.upgradeDefs).map((u) => [u, this.upgradeCostOf(p, u)])),
      };
    }
    // いちばん上の山札の数：shared は共通の山札、own は viewer 本人の山札（viewer がいなければ null）
    const topPile = own ? (this.piles.has(viewerId) ? this.pileOf(viewerId) : null) : this.pileOf(this.playerOrder[0]);
    return {
      deckMode: this.rules.deckMode,
      maxMp: this.rules.maxMp,
      // MP を使うカードの種類 → 必要な MP（UI が手札に表示する）
      mpCosts: Object.fromEntries(Object.entries(this.cardDefs).map(([t, d]) => [t, this.mpCostOf({ def: d })]).filter(([, c]) => c > 0)),
      // 属性の反応の定義（reactions を渡したゲームだけ。キーごと足さない）。CPU・画面が、ゲームの内部を読まずに反応を調べるため
      ...(this.reactionDefs ? { reactions: { ...structuredClone(this.reactionDefs), ...(this.rules.frozenCountsAsIce ? { frozenCountsAsIce: true } : {}) } } : {}),
      layout: this.plaza ? 'plaza' : 'lanes',
      // チーム戦のとき { t1: { members, castleOwner, size } … }（チームの順）。チーム戦でなければ null
      teams: this.teamOrder
        ? Object.fromEntries(this.teamOrder.map((t) => [t, { members: [...this.teamMembers.get(t)], castleOwner: this.teamMembers.get(t)[0], size: this.teamMembers.get(t).length }]))
        : null,
      winnerTeam: this.winnerTeam,
      playerOrder: [...this.playerOrder],
      // 先攻（コイントスで決まった人）と、マリガンで引き直しをまだ選んでいない人（phase "mulligan" のときだけ）
      firstPlayer: this.firstPlayer,
      mulligan: this.phase === 'mulligan' ? { pending: this.playerOrder.filter((id) => this.mulliganPending.has(id)) } : null,
      round: this.round,
      // 崩壊の刻（使わないルールなら null）：予告したか・始まったか・始まった周回（まだなら null）
      collapse: this.rules.collapseStartRound > 0
        ? { announced: this.collapseAnnounced, active: this.collapseActive, round: this.collapseActive ? this.rules.collapseStartRound : null }
        : null,
      weather: this.weather ? { type: this.weather.type, name: this.weatherDef().name, icon: this.weatherDef().icon ?? null, description: this.weatherDef().description ?? null, roundsLeft: this.weather.roundsLeft } : null,
      weatherEnabled: Boolean(this.weatherDefs),
      // ステージ（stages を渡さなければ null）
      stage: this.stage ? (({ name, icon, description, element, elementMultiplier }) => ({ id: this.stage, name, icon: icon ?? null, description: description ?? null, element: element ?? null, elementMultiplier: elementMultiplier ?? null }))(this.stageDef()) : null,
      // 昼と夜："day" か "night"。夜なら nightRoundsLeft に残りの周回
      time: this.night ? 'night' : 'day',
      nightRoundsLeft: this.night ? this.night.roundsLeft : 0,
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
    // 背水の陣も合わせる（デバッグなのでイベントは出さない）
    const side = this.side(playerId);
    const line = this.overdriveLine(this.players[side]);
    if (line >= 0 && this.players[side].castle.hp <= line) this.overdrive.add(side);
    else this.overdrive.delete(side);
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
