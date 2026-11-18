// カード1枚。数値は data/cards.json の定義から受け取る（コードに数値を書かない）。
// DOM は使わない（後でサーバーに移すため）。

export const CARD_KINDS = ['soldier', 'spell', 'weapon', 'defense'];
/** 兵士の役割：melee（進んで戦う）・archer（弓兵：動かず、射程の中の1体を撃つ）・mage（魔法使い：動かず、兵士がいなければ城を撃つ） */
export const SOLDIER_ROLES = ['melee', 'archer', 'mage', 'ninja'];
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
    redrawHand: [], // 天の恵み：手札を全部引き直す
    randomEffect: [], // 神頼み：山札の上の1枚を、タダで出す（対象はランダム）
    stealCard: [], // 盗賊：相手の手札から1枚ランダムに奪う
    gainCoins: ['amount'], // コインを増やす
    gainMp: ['amount'], // マナ回復：MP を増やす（上限を超えたぶんは捨てる）
    changeWeather: [], // 天候の呪文：天候をランダムに変える
    wild: [], // 適応：どのカードとでも合成できる（出せない。合成専用）
    summonSpirit: ['amount', 'turns'], // 精霊：数ターンのあいだ続く効果（1人1体まで）
  },
  defense: {
    shieldSoldier: ['amount'],
    armorCastle: ['amount'],
    reflectSpell: [], // 反射：城に当たる魔法を、相手の城に返す（攻撃を受けたときだけ）
    nullifySoldier: [], // 身代わり：城に着いた兵士1体のダメージを無効にする（攻撃を受けたときだけ）
  },
};

/** scope（レーンを選ぶか）を書ける effect。lane なら選んだ1レーンの相手の兵士だけに効く */
export const LANE_SCOPE_EFFECTS = ['damageEnemySoldiers', 'poisonEnemySoldiers', 'freezeEnemySoldiers'];

/** 攻撃ではない魔法（精霊・コイン）。メインを使わず、何枚でも出せる（slot は "support"） */
export const SUPPORT_EFFECTS = ['summonSpirit', 'gainCoins', 'gainMp', 'curePoison'];

/** MP を使う魔法（攻撃の魔法と精霊）。コストはレアリティ（rarities.json の mpCost）か、カードの mpCost。rules.maxMp が 0 のときは MP を使わない */
export const MP_EFFECTS = ['damageEnemyCastle', 'damageEnemySoldiers', 'poisonEnemySoldiers', 'poisonEnemy', 'freezeEnemySoldiers', 'summonSpirit'];

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
    return { cardId: this.cardId, type: this.type };
  }

  /**
   * cards.json の中身をチェックする。書き間違いがあれば、どこが悪いかを書いた Error を投げる。
   * （不正な「操作」は例外にしない約束だが、データの書き間違いは起動時に気づけるよう例外にする）
   */
  static validateDefinitions(cards, rarities = null) {
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
        } else if (next === undefined) {
          if (def.fuseTo !== undefined) throw new Error(`${where}: いちばん上のレアリティのカードに fuseTo は書けません`);
        } else {
          if (typeof def.fuseTo !== 'string' || !Object.hasOwn(cards, def.fuseTo)) throw new Error(`${where}: fuseTo に、合成してできるカード種類を書いてください`);
          if (cards[def.fuseTo].rarity !== next) throw new Error(`${where}: fuseTo は1つ上のレアリティ（${next}）のカードにしてください`);
        }
      }
      if (def.mpCost !== undefined && !isCount(def.mpCost)) throw new Error(`${where}: mpCost は0以上の整数にしてください（書かなければレアリティで決まる）`);
      if (def.exhaust !== undefined && typeof def.exhaust !== 'boolean') {
        throw new Error(`${where}: exhaust は true か false にしてください（書かなければ false）`);
      }
      if (def.element !== undefined && def.kind !== 'weapon') {
        throw new Error(`${where}: element を書けるのは武器（kind: "weapon"）だけです`);
      }
      if (def.element !== undefined && def.element !== null && !ELEMENTS.includes(def.element)) {
        throw new Error(`${where}: element は ${ELEMENTS.join(' / ')} のどれかにしてください（書かなければ属性なし）`);
      }

      if (def.effect === 'summonSpirit') {
        if (!SPIRIT_KINDS.includes(def.spirit)) throw new Error(`${where}: spirit は ${SPIRIT_KINDS.join(' / ')} のどれかにしてください`);
      } else if (def.spirit !== undefined) {
        throw new Error(`${where}: spirit を書けるのは effect が summonSpirit の魔法だけです`);
      }

      if (def.scope !== undefined) {
        if (def.scope !== 'all' && def.scope !== 'lane') throw new Error(`${where}: scope は "all"（相手の全レーン）か "lane"（選んだ1レーン）にしてください（書かなければ "all"）`);
        if (!LANE_SCOPE_EFFECTS.includes(def.effect)) {
          throw new Error(`${where}: scope を書けるのは ${LANE_SCOPE_EFFECTS.join(' / ')} の魔法だけです`);
        }
      }

      if (def.monster !== undefined && (typeof def.monster !== 'string' || def.kind !== 'soldier')) {
        throw new Error(`${where}: monster（魔物の種類）を書けるのは兵士カード（kind: "soldier"）だけです`);
      }

      if (def.kind === 'soldier') {
        // role：兵士の役割。省略すると "melee"（進んで城を攻める）。"archer"（弓兵）・"mage"（魔法使い）は動かずに撃つ
        const role = def.role ?? 'melee';
        if (!SOLDIER_ROLES.includes(role)) throw new Error(`${where}: role は ${SOLDIER_ROLES.join(' / ')} のどれかにしてください（書かなければ melee）`);
        const moving = MOVING_ROLES.includes(role);
        const keys = moving ? ['hp', 'attack', 'speed'] : ['hp', 'attack', 'range', 'stay'];
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
          if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
        }
      }
    }
  }
}
