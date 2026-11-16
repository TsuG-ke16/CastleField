// 同じ端末の対戦で、Game を「セッション」として包む。
// main.js は、同じ端末でもオンラインでも同じ呼び方（下のメソッド）でゲームを操作する。
// オンラインのセッションは OnlineClient.js。操作の返事は、どちらも Promise で受け取る。
//
// セッションの形：
//   online                    … オンラインなら true
//   getState(viewerId)        … 今の状態
//   canPlayCard(cardId)       … { ok, reason, needsTarget }（読むだけ）
//   getTargets(cardId)        … 出せる対象の一覧（読むだけ）
//   canBuyUpgrade(upgradeId)  … { ok, reason }（読むだけ）
//   playCard / discard / endTurn / buyUpgrade … Promise<{ ok, reason }>
//   defend / passDefense      … 攻撃を受けたとき（phase "defend"）の防御。canPlayCard / getTargets も、そのときは防御カードについて答える

export class LocalSession {
  /** @param {import('../game/Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.online = false;
  }

  /** 降参する（ひとりで遊ぶとき） */
  async surrender(playerId) {
    return this.game.surrender(playerId);
  }

  async fuse(a, b) { return this.game.fuse(a, b); }

  getState(viewerId) {
    return this.game.getState(viewerId);
  }

  // 攻撃を受けて防御を選んでいるとき（phase "defend"）は、防御カードを出せるかを返す
  canPlayCard(cardId) {
    return this.game.phase === 'defend' ? this.game.canDefend(cardId) : this.game.canPlayCard(cardId);
  }

  getTargets(cardId) {
    return this.game.phase === 'defend' ? this.game.getDefenseTargets(cardId) : this.game.getTargets(cardId);
  }

  canBuyUpgrade(upgradeId) {
    return this.game.canBuyUpgrade(upgradeId);
  }

  async playCard(cardId, target) {
    return target ? this.game.playCard(cardId, target) : this.game.playCard(cardId);
  }

  /** 攻撃を受けたとき、防御カードを出す */
  async defend(cardId, target) {
    return target ? this.game.defend(cardId, target) : this.game.defend(cardId);
  }

  /** 防御しないで、攻撃を受ける */
  async passDefense() {
    return this.game.passDefense();
  }

  async discard(cardIds) {
    return this.game.discard(cardIds);
  }

  async endTurn() {
    return this.game.endTurn();
  }

  async buyUpgrade(upgradeId) {
    return this.game.buyUpgrade(upgradeId);
  }

  close() {}
}
