// 場に出た兵士1体。道（roadId）を相手（targetId）の城に向かって進む。
// position: 自分の城から数えたマス。0 = 自分の城の前（出した直後）、laneLength - 1 = 相手の城の前。
// laneLength 以上になったら相手の城に着く。
// 1マスずつ進める（相手の兵士とぶつかるかは Game が1マスごとに確かめる）。

export class Soldier {
  /**
   * @param {string} soldierId 例: "s03"
   * @param {import('./Card.js').Card} card 兵士カード
   * @param {string} roadId どの道を進むか
   * @param {string} targetId 道の向こうの人（攻める相手）
   */
  constructor(soldierId, card, roadId, targetId) {
    this.soldierId = soldierId;
    this.roadId = roadId;
    this.targetId = targetId;
    this.type = card.type;
    this.hp = card.def.hp;
    /** HPの上限（体力ゲージの満タン。鍛錬で増える。回復はないので、HPがこれを超えることはない） */
    this.maxHp = card.def.hp;
    this.baseAttack = card.def.attack;
    this.speed = card.def.speed ?? 0;
    /** 役割（"melee" | "archer" | "mage" | "ninja"）。弓兵・魔法使いは動かずに撃つ。忍者は進むが、相手から見えず、相手の兵士とは戦わない */
    this.role = card.def.role ?? 'melee';
    /** 撃てる距離（自分のマスから何マス先まで。弓兵・魔法使いだけ） */
    this.range = card.def.range ?? 0;
    /** あと何ターン残るか（弓兵・魔法使いだけ。自分のターンごとに1減り、0で帰る） */
    this.turnsLeft = card.def.stay ?? 0;
    this.position = 0;
    /** 持っている武器のカード種類（なければ null） */
    this.weapon = null;
    this.weaponBonus = 0;
    /** 属性（武器でつく。4陣営モードでは兵士のカードの innateElement＝生まれつきの属性。なければ null） */
    this.element = card.def.innateElement ?? null;
    /** 武器の射程+（rangeBonus の合計。弓兵・魔法使いは撃てる距離がのび、進む兵士は離れた相手を突ける） */
    this.rangeBonus = 0;
    /** 武器の「当たった相手を休ませる」回数（freezeOnHit。いちばん大きいもの。0 ならなし） */
    this.freezeOnHit = 0;
    /** 当たった相手に、属性に加えて火・水・風・土のどれか1つも付ける（武器か兵士の attachRandomElement。4陣営の混沌） */
    this.attachRandomElement = Boolean(card.def.attachRandomElement);
    /** 武器の吸命（lifesteal。いちばん大きいもの。0 ならなし）：当たって与えたダメージ × lifesteal（切り捨て）だけ持ち主の城が回復する */
    this.lifesteal = 0;
    /** 鈍足 { amount, turns }（泥の反応。速さが amount 下がる。最低1）か null */
    this.slowed = null;
    /** 目くらまし { chance, turns }（霧・砂嵐の反応。攻撃が chance の確率で外れる）か null */
    this.blinded = null;
    /** 継続ダメージ（4陣営の反応）：砂（砂嵐）・凍傷（黒氷）{ amount, turns } か null。持ち主の進軍の前にダメージ（盾は効かない） */
    this.sand = null;
    this.frostbite = null;
    /** 盾の残り。ダメージは先に盾が受ける */
    this.shield = 0;
    /** 4陣営の神盾：true なら、盾が残っている間は状態異常を受けない */
    this.statusWard = false;
    /** 毒 { amount, turns }（なければ null） */
    this.poison = null;
    /** 凍結の残り回数（0 なら凍結していない） */
    this.frozen = 0;
    /** やけど { amount, turns }（溶岩のステージ。なければ null） */
    this.burn = null;
    /** 呪い { amount, turns }（攻撃力が amount 下がる。最低1。なければ null） */
    this.weakened = null;
    /** 付着している属性 [{ element, turns }]（種類ごとに1つ。reactions を渡したゲームだけで使う。武器の属性は element に別に持つ） */
    this.attachments = [];
    /** トークン（魔族の「死者を従える」で生まれた骸骨兵）。カードではない。tokenName は表示名（なければ null） */
    this.token = false;
    // 段階A1：撃破報酬（rules.killCoins）の対象外（蘇生した兵士）。トークン（token）も対象外
    this.noBounty = false;
    this.tokenName = null;
  }

  /** 弓兵・魔法使い（動かずに撃つ） */
  get isRanged() {
    return this.role === 'archer' || this.role === 'mage';
  }

  /** 護衛（ゴーレム）：動かず、自分の道と左右のとなりの道の城の前を守る（相手の兵士はぶつかって戦う） */
  get isGuard() {
    return this.role === 'guard';
  }

  /** 動かずに、stay ターンで帰る兵士（弓兵・魔法使い・護衛） */
  get isStationary() {
    return this.isRanged || this.isGuard;
  }

  /** 忍者：相手から見えない（getState・イベントで隠す）。相手の兵士と戦わず、撃たれず、妖術（魔法）の的にもならない */
  get stealth() {
    return this.role === 'ninja';
  }

  get attack() {
    return this.baseAttack + this.weaponBonus;
  }

  /** 1マス進む */
  moveForward() {
    this.position += 1;
  }

  hasReachedCastle(laneLength) {
    return this.position >= laneLength;
  }

  /**
   * ダメージを受ける。盾が先に受ける（ignoreShield なら盾を使わない）。HPは0未満にしない
   * @returns {number} 盾が受けた量
   */
  takeDamage(amount, { ignoreShield = false } = {}) {
    const blocked = ignoreShield ? 0 : Math.min(this.shield, amount);
    this.shield -= blocked;
    this.hp = Math.max(0, this.hp - (amount - blocked));
    return blocked;
  }

  get isDead() {
    return this.hp <= 0;
  }

  toState() {
    return {
      ...(this.token ? { token: true, name: this.tokenName, speed: this.speed } : {}),
      soldierId: this.soldierId,
      type: this.type,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      position: this.position,
      role: this.role,
      range: this.range,
      turnsLeft: this.isStationary ? this.turnsLeft : null,
      roadId: this.roadId,
      targetId: this.targetId,
      weapon: this.weapon,
      element: this.element,
      shield: this.shield,
      statuses: { poison: this.poison ? { ...this.poison } : null, frozen: this.frozen, burn: this.burn ? { ...this.burn } : null, weakened: this.weakened ? { ...this.weakened } : null },
    };
  }
}
