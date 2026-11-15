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

export class LocalSession {
  /** @param {import('../game/Game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.online = false;
  }

  getState(viewerId) {
    return this.game.getState(viewerId);
  }

  canPlayCard(cardId) {
    return this.game.canPlayCard(cardId);
  }

  getTargets(cardId) {
    return this.game.getTargets(cardId);
  }

  canBuyUpgrade(upgradeId) {
    return this.game.canBuyUpgrade(upgradeId);
  }

  async playCard(cardId, target) {
    return target ? this.game.playCard(cardId, target) : this.game.playCard(cardId);
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
