// カード1枚。数値は data/cards.json の定義から受け取る（コードに数値を書かない）。
// DOM は使わない（後でサーバーに移すため）。

export const CARD_KINDS = ['soldier', 'spell', 'weapon', 'defense'];
/** 兵士の役割：melee（進んで戦う）・archer（弓兵：動かず、射程の中の1体を撃つ）・mage（魔法使い：動かず、兵士がいなければ城を撃つ） */
/** guard（護衛）：自分の城の前から動かず、左右のとなりの道の城の前も守る。stay ターンで帰る */
export const SOLDIER_ROLES = ['melee', 'archer', 'mage', 'ninja', 'guard'];
/** 進んで城を攻める役割（speed を書く）。ninja（忍者）は進むが、相手から見えず、相手の兵士とは戦わずにすり抜ける */
export const MOVING_ROLES = ['melee', 'ninja'];
export const ELEMENTS = ['fire', 'water', 'wind', 'earth'];
/** 精霊の種類：fire=毎ターン敵の城を攻める／water=毎ターン城を回復／wind=兵士の速さの最低値／earth=受けるダメージを軽くする */
export const SPIRIT_KINDS = ['fire', 'water', 'wind', 'earth'];

/** effect ごとに、必要な数値のキー */
export const EFFECTS = {
  spell: {
    damageEnemyCastle: ['amount'],
    damageEnemySoldiers: ['amount'],
    healOwnCastle: ['amount'],
    poisonEnemySoldiers: ['amount', 'turns'], // 毒（ターン数つき。兵士だけ。テスト・互換用）
    poisonEnemy: ['amount'], // 毒：選んだ相手の兵士と城を、永続の毒状態にする（毎ターン amount ダメージ。盾・城壁は効かない）
    curePoison: [], // 解毒薬：自分の毒状態（兵士・城）をすべて治す
    freezeEnemySoldiers: ['turns'],
    singleDamage: ['amount'], // 敵兵士1体に amount ダメージ（対象 { soldierId }。盾が先に受ける）
    weakenAttack: ['amount', 'turns'], // 呪い：敵兵士1体の攻撃力を amount 下げる（最低1）。持ち主の進軍 turns 回ぶん続く。soldiers を書くと、相手を選んで手前の soldiers 体（4陣営の呪いの印）
    randomElementDamage: ['amount'], // 敵兵士1体に amount ダメージ。火・水・風・土のうちランダムな属性で撃ち、強い属性なら elementBonus 増える
    reviveFallen: [], // 蘇生：最後に倒れた自分の兵士1体を、HP を最大HPの amount 倍（0より大きく1以下の数。下でチェック）で生き返らせる
    chainBlast: ['amount'], // チェーン・ブラスト：相手の兵士1体に amount、まわり（同じ道の前後1マス・となりの道の同じマス）に半分（切り上げ）
    ignitionBurst: ['amount', 'selfDamage'], // イグニッション・バースト：自分の城に selfDamage、相手の兵士全員と城に amount
    armorBlast: [], // シールド・ブラスト：自分の城壁の値ぶん相手の城にダメージ。城壁は0になる
    purifyFlare: ['amount'], // ピュリファイ・フレア：自分の毒・やけど・凍結を治し、相手の兵士全員に amount
    pushBackEnemySoldiers: ['amount'], // ゲイルフォース：相手の兵士を amount マス押し戻す（自分の城の前＝マス0より後ろには下がらない）
    redrawHand: [], // 天の恵み：手札を全部引き直す
    randomEffect: [], // 神頼み：山札の上の1枚を、タダで出す（対象はランダム）
    stealCard: [], // 盗賊：相手の手札から1枚ランダムに奪う
    gainCoins: ['amount'], // コインを増やす
    gainMp: ['amount'], // マナ回復：MP を増やす（上限を超えたぶんは捨てる）
    changeWeather: [], // 天候の呪文：天候をランダムに変える
    setTime: [], // 刻の魔法：time（"night" か "day"）にする（ムーンライズ・ドーンブレイク）
    wild: [], // 適応：どのカードとでも合成できる（出せない。合成専用）
    summonSpirit: ['amount', 'turns'], // 精霊：数ターンのあいだ続く効果（1人1体まで）
    drainMp: ['amount'], // MPドレイン：相手の MP を amount 奪って自分の MP にする（MP は使わない）
    drainCastle: ['amount'], // 生命吸収：相手の城に amount ダメージ。城HPを実際に減らしたぶん自分の城を回復
    sacrificeAttack: ['amount', 'selfDamage'], // 捨て身：自分の城HPを selfDamage 払って、相手の城に amount ダメージ
    damageAllSoldiers: ['amount'], // 爆発：場にいる兵士全員（自分の兵士も）に amount ダメージ
    damageCastleAndHeal: ['amount', 'heal'], // 吸血（ヴァンパイアのカード）：相手の城に amount ダメージ、自分の城を heal 回復
    healCastleOrMp: ['amount'], // スライムのカード：城HPか MP のどちらかをランダムに amount 回復
    healAndArmor: ['amount', 'armor'], // トレントのカード：自分の城HPを amount 回復し、城壁を armor 置く
    stealCoins: ['amount'], // ミミックのカード：相手のコインを amount 枚まで奪う
    // 段階A1：経済のカード（クラシック・4陣営。slot は "support"＝攻撃の魔法の回数に数えない。1ターンの枚数は rules.coinCardsPerTurn）
    plunderCoins: ['amount'], // 略奪：相手のコインを amount 枚まで奪う（コインを持っている相手だけ）
    coinMine: ['amount', 'turns'], // 金鉱：次の自分のターンから turns 回、自分のターンの始めにコイン amount
    investCoins: ['amount', 'cost', 'turns'], // 投資：コイン cost を払い、turns 回あとの自分のターンの始めにコイン amount
    damageEnemyAll: ['amount'], // 魔王のカード：相手の城と、相手の兵士全員に amount ダメージ
    dice: [], // サイコロ：1〜6の目 × per の効果（dice で種類を決める。下の DICE_KINDS）
    // 4陣営モード（CLAUDE.md「4陣営モード」）
    healCastleAndSoldiers: ['amount', 'soldierHeal'], // 生命の雫：自分の城HPを amount、傷ついた自分の兵士全員のHPを soldierHeal 回復
    healSoldier: ['amount'], // 竜血の雫：傷ついた自分の兵士1体のHPを amount 回復（対象 { soldierId }）
    breathAttack: ['amount', 'castleAmount'], // 火炎の吐息：選んだ道の相手の兵士全員に amount、相手の城に城壁を無視して castleAmount
    vulnerableCastle: ['turns'], // 脆弱（魔族）：相手の城が受ける攻撃のダメージが ratio の割合だけ増える（turns。重ねがけは回数だけ延びる（maxTurns まで）。増える量は maxRatio まで）
    poisonEnemyCastle: ['amount', 'turns'], // 毒の霧（魔族）：相手の城だけを毒にする（毎ターン amount・turns 回。重ねがけは量を増やさず、残りを maxTurns まで戻す・延ばす）
    sealMp: ['amount', 'turns'], // 封魔（魔族）：相手の、自分のターンの始めの MP 回復を amount 減らす（turns 回。重ねがけは回数だけ延びる（maxTurns まで））
    bloodPact: ['amount', 'selfDamage', 'soldiers'], // 血の契約（魔族）：自分の城HPを selfDamage 払って、自分の城に近い自分の兵士 soldiers 体の攻撃を amount 上げる（その兵士が消えるまで）
  },
  defense: {
    shieldSoldier: ['amount'],
    armorCastle: ['amount'],
    reflectSpell: [], // 反射：城に当たる魔法を、相手の城に返す（攻撃を受けたときだけ）
    nullifySoldier: [], // 身代わり：城に着いた兵士1体のダメージを無効にする（攻撃を受けたときだけ）
    guardCastle: [], // 身代わり（4陣営）：自分の兵士1体を選ぶ。次に城が受ける攻撃を、その兵士が代わりに受ける
  },
};

/** scope（レーンを選ぶか）を書ける effect。lane なら選んだ1レーンの相手の兵士だけに効く */
export const LANE_SCOPE_EFFECTS = ['damageEnemySoldiers', 'poisonEnemySoldiers', 'freezeEnemySoldiers', 'pushBackEnemySoldiers'];

/** 攻撃ではない魔法（精霊・コイン）。メインを使わず、何枚でも出せる（slot は "support"） */
export const SUPPORT_EFFECTS = ['summonSpirit', 'gainCoins', 'gainMp', 'curePoison', 'plunderCoins', 'coinMine', 'investCoins'];

/** MP を使う魔法（攻撃の魔法と精霊）。コストはレアリティ（rarities.json の mpCost）か、カードの mpCost。rules.maxMp が 0 のときは MP を使わない */
/**
 * サイコロの種類（cards.json の dice）。効果は「出た目 × per」（端数は切り上げ）。random は per を書かない
 *   attack：相手の城にダメージ（MP を使う。メイン）／heal：自分の城を回復（メイン）／mana：MP 回復／coin：コイン
 *   shield：城壁／buff：選んだ自分の兵士1体の攻撃力を上げる／random：ほかのサイコロのどれか（目は4〜6）（メイン）
 *   god：1回振って、その目で6つのサイコロの効果が全部起きる（バフは兵士全員）（メイン）
 */
export const DICE_KINDS = ['attack', 'heal', 'mana', 'coin', 'shield', 'buff', 'random', 'god'];
/** 効果が1つのサイコロ（ランダム・ゴッドが使う種類） */
export const BASIC_DICE = ['attack', 'heal', 'mana', 'coin', 'shield', 'buff'];
/** メインを使わず何枚でも出せるサイコロ（ほかはメイン） */
export const SUPPORT_DICE = ['mana', 'coin', 'shield', 'buff'];

export const MP_EFFECTS = ['damageEnemyCastle', 'damageEnemySoldiers', 'poisonEnemySoldiers', 'poisonEnemy', 'freezeEnemySoldiers', 'pushBackEnemySoldiers', 'chainBlast', 'singleDamage', 'weakenAttack', 'randomElementDamage', 'ignitionBurst', 'armorBlast', 'purifyFlare', 'summonSpirit', 'drainCastle', 'sacrificeAttack', 'damageAllSoldiers', 'breathAttack', 'poisonEnemyCastle', 'vulnerableCastle', 'bloodPact', 'sealMp'];

/**
 * kind → 出し方（slot）。soldier は1ターン rules.soldiersPerTurn 枚、main（攻撃の魔法など）は1ターン1枚、
 * addon・defense・support は何枚でも
 */
export const SLOT_OF_KIND = {
  soldier: 'soldier',
  spell: 'main',
  weapon: 'addon',
  defense: 'defense',
};

export class Card {
  /**
   * @param {string} cardId 山札の1枚ごとの一意なID（例: "c07"）
   * @param {string} type   cards.json のキー（例: "infantry"）
   * @param {object} def    cards.json の type に対応する定義
   */
  constructor(cardId, type, def) {
    this.cardId = cardId;
    this.type = type;
    this.def = def;
  }

  get kind() {
    return this.def.kind;
  }

  /** "soldier" | "main" | "addon" | "defense" | "support" */
  get slot() {
    if (this.def.kind === 'spell' && SUPPORT_EFFECTS.includes(this.def.effect)) return 'support';
    if (this.def.effect === 'dice' && SUPPORT_DICE.includes(this.def.dice)) return 'support';
    return SLOT_OF_KIND[this.def.kind];
  }

  get isSoldier() {
    return this.def.kind === 'soldier';
  }

  get isSpell() {
    return this.def.kind === 'spell';
  }

  /** 使い切り（使ったら山札に戻らない）か */
  get isExhaust() {
    return this.def.exhaust === true;
  }

  toState() {
    // スキルの一時コピー（js/game/skills/Cards.js）だけ copy: true を足す（ほかのカードの形は変えない）
    return this.skillCopy ? { cardId: this.cardId, type: this.type, copy: true } : { cardId: this.cardId, type: this.type };
  }

  /**
   * cards.json の中身をチェックする。書き間違いがあれば、どこが悪いかを書いた Error を投げる。
   * （不正な「操作」は例外にしない約束だが、データの書き間違いは起動時に気づけるよう例外にする）
   * @param {string[]} [elements] 使える属性ID（new Game({ elements }) の表のキー。省略すると今までの4つ）
   */
  static validateDefinitions(cards, rarities = null, elements = ELEMENTS) {
    if (!cards || typeof cards !== 'object' || Array.isArray(cards)) {
      throw new Error('cards.json はカード種類をキーにしたオブジェクトにしてください');
    }
    const types = Object.keys(cards);
    if (types.length === 0) throw new Error('cards.json にカードがありません');

    const isCount = (v) => Number.isInteger(v) && v >= 0;
    const isPositive = (v) => Number.isInteger(v) && v > 0;

    for (const type of types) {
      const def = cards[type];
      const where = `cards.json の "${type}"`;
      if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
      if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
      if (!CARD_KINDS.includes(def.kind)) throw new Error(`${where}: kind は ${CARD_KINDS.join(' / ')} のどれかです`);
      if (!isCount(def.count)) throw new Error(`${where}: count は0以上の整数にしてください`);
      if (rarities) {
        if (!Object.hasOwn(rarities, def.rarity)) throw new Error(`${where}: rarity は ${Object.keys(rarities).join(' / ')} のどれかにしてください`);
        if (def.weight !== undefined && !(typeof def.weight === 'number' && def.weight >= 0)) throw new Error(`${where}: weight は0以上の数にしてください（書かなければ 1）`);
        const order = Object.keys(rarities).filter((id) => !rarities[id].special);
        const next = order[order.indexOf(def.rarity) + 1];
        if (def.monster !== undefined) {
          // 倒した魔物の兵士カード：合成しない（魔物を倒したごほうびだけで手に入る）
          if (def.fuseTo !== undefined) throw new Error(`${where}: 魔物の兵士カード（monster）に fuseTo は書けません`);
        } else if (def.effect === 'wild' || rarities[def.rarity].special) {
          if (def.fuseTo !== undefined) throw new Error(`${where}: 適応（effect: "wild"）やスペシャルのカードに fuseTo は書けません（合成の結果は相手のカードで決まる）`);
        } else if (def.fuseTo === null) {
          // fuseTo: null … 合成できないカード（はっきり書いたときだけ。書き忘れは下で弾く）
        } else if (next === undefined) {
          if (def.fuseTo !== undefined) throw new Error(`${where}: いちばん上のレアリティのカードに fuseTo は書けません`);
        } else {
          if (typeof def.fuseTo !== 'string' || !Object.hasOwn(cards, def.fuseTo)) throw new Error(`${where}: fuseTo に、合成してできるカード種類を書いてください`);
          if (cards[def.fuseTo].rarity !== next) throw new Error(`${where}: fuseTo は1つ上のレアリティ（${next}）のカードにしてください`);
        }
      }
      if (def.deckAs !== undefined && (typeof def.deckAs !== 'string' || (rarities && (!Object.hasOwn(rarities, def.deckAs) || rarities[def.deckAs].special)))) {
        throw new Error(`${where}: deckAs（デッキ編成で数えるレアリティ）は、スペシャル以外のレアリティにしてください`);
      }
      if (def.mpCost !== undefined && !isCount(def.mpCost)) throw new Error(`${where}: mpCost は0以上の整数にしてください（書かなければレアリティで決まる）`);
      if (def.exhaust !== undefined && typeof def.exhaust !== 'boolean') {
        throw new Error(`${where}: exhaust は true か false にしてください（書かなければ false）`);
      }
      // 魔法の element はデータとして持つだけ（効果・ダメージは変わらない。のちの付着・反応で使う）
      if (def.element !== undefined && def.kind !== 'weapon' && def.kind !== 'spell') {
        throw new Error(`${where}: element を書けるのは武器（kind: "weapon"）と魔法（kind: "spell"）だけです`);
      }
      // 兵士の innateElement は生まれつきの属性（4陣営モード。武器の属性と同じに扱い、武器を持つと上書きされる）
      if (def.innateElement !== undefined && (def.kind !== 'soldier' || !elements.includes(def.innateElement))) {
        throw new Error(`${where}: innateElement（生まれつきの属性）は兵士にだけ、${elements.join(' / ')} のどれかで書けます`);
      }
      if (def.element !== undefined && def.element !== null && !elements.includes(def.element)) {
        throw new Error(`${where}: element は ${elements.join(' / ')} のどれかにしてください（書かなければ属性なし）`);
      }

      if (def.effect === 'dice') {
        if (!DICE_KINDS.includes(def.dice)) throw new Error(`${where}: dice は ${DICE_KINDS.join(' / ')} のどれかにしてください`);
        if (def.dice === 'random' || def.dice === 'god') {
          if (def.per !== undefined) throw new Error(`${where}: ランダム・ゴッドのサイコロに per は書けません`);
          // randomCost：振る前に、このうち払えるものを1つランダムに払う（{ hp?, coins?, mp? }。省略するとコストなし）
          if (def.randomCost !== undefined) {
            const keys = Object.keys(def.randomCost ?? {});
            if (!def.randomCost || typeof def.randomCost !== 'object' || keys.length === 0
              || !keys.every((k) => ['hp', 'coins', 'mp'].includes(k) && Number.isInteger(def.randomCost[k]) && def.randomCost[k] > 0)) {
              throw new Error(`${where}: randomCost は { hp, coins, mp } のうち1つ以上を、1以上の整数で書いてください`);
            }
          }
        } else if (!(typeof def.per === 'number' && def.per > 0)) {
          throw new Error(`${where}: per（出た目に掛ける数）は 0 より大きい数にしてください`);
        }
      } else if (def.dice !== undefined) {
        throw new Error(`${where}: dice を書けるのは effect が dice の魔法だけです`);
      }

      if (def.effect === 'summonSpirit') {
        if (!SPIRIT_KINDS.includes(def.spirit)) throw new Error(`${where}: spirit は ${SPIRIT_KINDS.join(' / ')} のどれかにしてください`);
      } else if (def.spirit !== undefined) {
        throw new Error(`${where}: spirit を書けるのは effect が summonSpirit の魔法だけです`);
      }

      // 蘇生：amount は割合（0より大きく1以下の数。整数でなくてよい）
      if (def.effect === 'reviveFallen' && !(typeof def.amount === 'number' && def.amount > 0 && def.amount <= 1)) {
        throw new Error(`${where}: amount（生き返ったときのHPの割合）は 0 より大きく 1 以下の数にしてください（例：0.5）`);
      }

      if (def.effect === 'setTime' && def.time !== 'night' && def.time !== 'day') {
        throw new Error(`${where}: time は "night"（夜にする）か "day"（昼にする）にしてください`);
      }
      if (def.beast !== undefined && (def.kind !== 'soldier' || typeof def.beast !== 'boolean')) {
        throw new Error(`${where}: beast（獣）は兵士にだけ、true か false で書けます`);
      }

      // 4陣営モードの追加のキー（書かなければ今までどおり）
      if (def.rangeBonus !== undefined && (def.kind !== 'weapon' || !isPositive(def.rangeBonus))) {
        throw new Error(`${where}: rangeBonus（射程+）は武器にだけ、1以上の整数で書けます`);
      }
      if (def.attachRandomElement !== undefined && ((def.kind !== 'weapon' && def.kind !== 'soldier') || typeof def.attachRandomElement !== 'boolean')) {
        throw new Error(`${where}: attachRandomElement（当たった相手に火・水・風・土のどれかも付ける）は武器か兵士に書ける true / false です`);
      }
      if (def.keepElement !== undefined && (def.kind !== 'weapon' || def.element !== undefined || typeof def.keepElement !== 'boolean')) {
        throw new Error(`${where}: keepElement（持たせても兵士の今の属性を消さない）は、element のない武器だけに書ける true / false です`);
      }
      if (def.lifesteal !== undefined && (def.kind !== 'weapon' || !(typeof def.lifesteal === 'number' && def.lifesteal > 0 && def.lifesteal <= 1))) {
        throw new Error(`${where}: lifesteal（与えたダメージのうち自分の城を回復する割合）は武器だけに書ける、0より大きく1以下の数です`);
      }
      if (def.freezeOnHit !== undefined && (def.kind !== 'weapon' || !isPositive(def.freezeOnHit))) {
        throw new Error(`${where}: freezeOnHit（当たった相手を休ませる回数）は武器にだけ、1以上の整数で書けます`);
      }
      if (def.spellBoost !== undefined) {
        const b = def.spellBoost;
        if (def.kind !== 'soldier' || !b || typeof b !== 'object' || !Array.isArray(b.elements) || b.elements.length === 0
          || !b.elements.every((e) => elements.includes(e)) || !isPositive(b.amount)) {
          throw new Error(`${where}: spellBoost は兵士にだけ { elements: [属性…], amount: 1以上の整数 } で書けます`);
        }
      }
      if (def.attachTurns !== undefined && (def.kind !== 'spell' || !isPositive(def.attachTurns))) {
        throw new Error(`${where}: attachTurns（付着が残る回数）は魔法にだけ、1以上の整数で書けます`);
      }
      if (def.freezeTurns !== undefined && (def.effect !== 'singleDamage' || !isPositive(def.freezeTurns))) {
        throw new Error(`${where}: freezeTurns（当たった兵士を休ませる回数）は singleDamage の魔法にだけ、1以上の整数で書けます`);
      }
      // 4陣営：target "front" は、敵兵士1体を選ばずに、選んだ道（相手）の先頭の兵士（自分の城にいちばん近い見える兵士）に当てる
      if (def.target !== undefined && (def.target !== 'front' || !['singleDamage', 'randomElementDamage'].includes(def.effect))) {
        throw new Error(`${where}: target は singleDamage / randomElementDamage の魔法にだけ "front"（先頭の兵士に当たる）と書けます`);
      }
      if (def.spiritScope !== undefined && (def.spirit !== 'earth' || (def.spiritScope !== 'all' && def.spiritScope !== 'soldiers'))) {
        throw new Error(`${where}: spiritScope は土の精霊にだけ、"all"（城と兵士）か "soldiers"（兵士だけ）で書けます`);
      }
      if (def.spiritMode !== undefined && (def.spirit !== 'wind' || (def.spiritMode !== 'min' && def.spiritMode !== 'add'))) {
        throw new Error(`${where}: spiritMode は風の精霊にだけ、"min"（速さの最低値）か "add"（速さに足す）で書けます`);
      }
      if (def.turns !== undefined && def.effect === 'poisonEnemy' && !isPositive(def.turns)) {
        throw new Error(`${where}: 毒（poisonEnemy）の turns は1以上の整数にしてください（書かなければ rules.poisonTurns）`);
      }
      if (def.maxTurns !== undefined && (!['poisonEnemyCastle', 'vulnerableCastle', 'sealMp'].includes(def.effect) || !isPositive(def.maxTurns) || def.maxTurns < def.turns)) {
        throw new Error(`${where}: maxTurns（重ねがけで延びる回数の上限）は poisonEnemyCastle などに書ける、turns 以上の整数です`);
      }
      if (def.effect === 'vulnerableCastle') {
        const rate = (v) => typeof v === 'number' && v > 0 && v <= 1;
        if (!rate(def.ratio) || !rate(def.maxRatio ?? def.ratio) || def.ratio > (def.maxRatio ?? def.ratio)) {
          throw new Error(`${where}: 脆弱（vulnerableCastle）の ratio・maxRatio は0より大きく1以下で、ratio は maxRatio 以下にしてください`);
        }
      }
      if (def.soldiers !== undefined && (!['weakenAttack', 'bloodPact'].includes(def.effect) || !isPositive(def.soldiers))) {
        throw new Error(`${where}: soldiers（効く兵士の数）は weakenAttack などに書ける1以上の整数です`);
      }
      if (def.clearEnemyAttachments !== undefined && (def.effect !== 'purifyFlare' || typeof def.clearEnemyAttachments !== 'boolean')) {
        throw new Error(`${where}: clearEnemyAttachments は浄化（purifyFlare）にだけ、true か false で書けます`);
      }
      if (def.bloodArmor !== undefined && (def.effect !== 'armorCastle' || typeof def.bloodArmor !== 'boolean')) {
        throw new Error(`${where}: bloodArmor は城壁（armorCastle）にだけ、true か false で書けます`);
      }

      if (def.scope !== undefined) {
        if (def.scope !== 'all' && def.scope !== 'lane') throw new Error(`${where}: scope は "all"（相手の全レーン）か "lane"（選んだ1レーン）にしてください（書かなければ "all"）`);
        if (!LANE_SCOPE_EFFECTS.includes(def.effect)) {
          throw new Error(`${where}: scope を書けるのは ${LANE_SCOPE_EFFECTS.join(' / ')} の魔法だけです`);
        }
      }

      if (def.monster !== undefined && (typeof def.monster !== 'string' || (def.kind !== 'soldier' && def.kind !== 'spell'))) {
        throw new Error(`${where}: monster（魔物の種類）を書けるのは兵士か魔法のカード（kind: "soldier" / "spell"）だけです`);
      }

      if (def.kind === 'soldier') {
        // role：兵士の役割。省略すると "melee"（進んで城を攻める）。"archer"（弓兵）・"mage"（魔法使い）は動かずに撃つ
        const role = def.role ?? 'melee';
        if (!SOLDIER_ROLES.includes(role)) throw new Error(`${where}: role は ${SOLDIER_ROLES.join(' / ')} のどれかにしてください（書かなければ melee）`);
        const moving = MOVING_ROLES.includes(role);
        const keys = moving ? ['hp', 'attack', 'speed'] : role === 'guard' ? ['hp', 'attack', 'stay'] : ['hp', 'attack', 'range', 'stay'];
        for (const key of keys) {
          if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
        }
        if (!moving && def.speed !== undefined) throw new Error(`${where}: 弓兵・魔法使い（role: ${role}）は動かないので speed は書けません`);
      } else if (def.kind === 'weapon') {
        if (!isCount(def.attackBonus)) throw new Error(`${where}: attackBonus は0以上の整数にしてください`);
      } else {
        const effects = EFFECTS[def.kind];
        if (!Object.hasOwn(effects, def.effect)) {
          throw new Error(`${where}: effect は ${Object.keys(effects).join(' / ')} のどれかです`);
        }
        for (const key of effects[def.effect]) {
          // 浄化は、相手の付着を消すだけ（clearEnemyAttachments）なら、ダメージ0でもよい
          if (def.effect === 'purifyFlare' && key === 'amount' && def.clearEnemyAttachments === true && def.amount === 0) continue;
          if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
        }
      }
    }
  }
}
