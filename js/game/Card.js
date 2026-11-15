// カード1枚。数値は data/cards.json の定義から受け取る（コードに数値を書かない）。
// DOM は使わない（後でサーバーに移すため）。

export const CARD_KINDS = ['soldier', 'spell', 'weapon', 'defense', 'reaction'];
export const ELEMENTS = ['fire', 'water', 'wood'];

/** effect ごとに、必要な数値のキー */
export const EFFECTS = {
  spell: {
    damageEnemyCastle: ['amount'],
    damageEnemySoldiers: ['amount'],
    healOwnCastle: ['amount'],
    poisonEnemySoldiers: ['amount', 'turns'],
    freezeEnemySoldiers: ['turns'],
  },
  defense: {
    shieldSoldier: ['amount'],
    armorCastle: ['amount'],
  },
  // 相手に攻撃されたときだけ使う（自分の番には出せない。js/game/Reaction.js）
  reaction: {
    guard: ['amount'], // 受け流し：この攻撃のダメージを amount 減らす
    intercept: ['amount'], // 迎撃：攻撃してくる兵士に amount ダメージ。倒せれば攻撃は無効（魔法には使えない）
    counter: ['amount', 'block'], // カウンター：ダメージを block 減らし、相手の城に amount ダメージ
  },
};

/** kind → 出し方（slot）。main は1ターン1枚、addon と defense は何枚でも。reaction は相手の攻撃を受けたときだけ */
export const SLOT_OF_KIND = {
  soldier: 'main',
  spell: 'main',
  weapon: 'addon',
  defense: 'defense',
  reaction: 'reaction',
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

  /** "main" | "addon" | "defense" | "reaction" */
  get slot() {
    return SLOT_OF_KIND[this.def.kind];
  }

  get isSoldier() {
    return this.def.kind === 'soldier';
  }

  get isSpell() {
    return this.def.kind === 'spell';
  }

  get isReaction() {
    return this.def.kind === 'reaction';
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
  static validateDefinitions(cards) {
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
      if (def.exhaust !== undefined && typeof def.exhaust !== 'boolean') {
        throw new Error(`${where}: exhaust は true か false にしてください（書かなければ false）`);
      }
      if (def.element !== undefined && def.kind !== 'weapon') {
        throw new Error(`${where}: element を書けるのは武器（kind: "weapon"）だけです`);
      }
      if (def.element !== undefined && def.element !== null && !ELEMENTS.includes(def.element)) {
        throw new Error(`${where}: element は ${ELEMENTS.join(' / ')} のどれかにしてください（書かなければ属性なし）`);
      }

      if (def.unblockable !== undefined) {
        if (def.kind !== 'spell' || def.effect !== 'damageEnemyCastle') {
          throw new Error(`${where}: unblockable を書けるのは、城に直接ダメージを与える魔法（effect: "damageEnemyCastle"）だけです`);
        }
        if (typeof def.unblockable !== 'boolean') throw new Error(`${where}: unblockable は true か false にしてください`);
      }

      if (def.kind === 'soldier') {
        for (const key of ['hp', 'attack', 'speed']) {
          if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
        }
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
