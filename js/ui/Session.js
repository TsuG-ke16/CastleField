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
//   canReact(cardId)          … 防御の場面で、そのカードを防御に使えるか（読むだけ）
//   playCard / discard / endTurn / buyUpgrade / react … Promise<{ ok, reason }>

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

  /** 防御の場面で、そのカードを防御に使えるか（読むだけ） */
  canReact(cardId) {
    return this.game.canReact(cardId);
  }

  /** 防御する（空の配列なら、防御せずに受ける） */
  async react(cardIds) {
    return this.game.react(cardIds);
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
