// 城。HPが0以下になったら持ち主の負け。チーム戦では、チームのメンバーが同じ城を共有する。

export class Castle {
  constructor(maxHp) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    /** 城壁の残り（Player.armor から読み書きする） */
    this.armor = 0;
    /** 毒の量（毎ターン、持ち主のターンの始めに受けるダメージ。永続）。毒でなければ null */
    this.poison = null;
    /** 毒の残りターン（null は永続）。rules.poisonTurns があるときだけ数える */
    this.poisonTurns = null;
    /** 4陣営：身代わり（次に城が受ける攻撃を代わりに受ける兵士のID）か null */
    this.guard = null;
    /** 4陣営：城壁のうち血の膜のぶん（削れると城HPが回復する） */
    this.bloodArmor = 0;
    /** 4陣営：回復量減少（深淵侵食）{ ratio, turns } か null。回復が ratio の割合だけ減る（切り捨て） */
    this.healCut = null;
  }

  /** ダメージを受ける。HPは0未満にしない */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  /** 回復する（上限 maxHp。回復量減少のときは減らす）。実際に増えたHPを返す */
  heal(amount) {
    if (this.healCut) amount = Math.floor(amount * (1 - this.healCut.ratio));
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  get isFull() {
    return this.hp >= this.maxHp;
  }

  get isDestroyed() {
    return this.hp <= 0;
  }
}
