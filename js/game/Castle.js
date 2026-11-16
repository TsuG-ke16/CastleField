// 城。HPが0以下になったら持ち主の負け。チーム戦では、チームのメンバーが同じ城を共有する。

export class Castle {
  constructor(maxHp) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    /** 城壁の残り（Player.armor から読み書きする） */
    this.armor = 0;
  }

  /** ダメージを受ける。HPは0未満にしない */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  /** 回復する（上限 maxHp）。実際に増えたHPを返す */
  heal(amount) {
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
