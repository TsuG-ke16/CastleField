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

  getDropRates() { return this.game.getDropRates(); }
  canFuse(a, b) { return this.game.canFuse(a, b); }
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

  /** skillOptions：クラシックのスキルの任意の選択（HP置換の量など）。渡さなければ今までと同じ呼び方 */
  async playCard(cardId, target, skillOptions) {
    if (skillOptions !== undefined) return this.game.playCard(cardId, target, skillOptions);
    return target ? this.game.playCard(cardId, target) : this.game.playCard(cardId);
  }

  /** スキルの任意アクションの一覧（Game.listSkillActions） */
  listSkillActions(playerId) {
    return this.game.listSkillActions(playerId);
  }

  /** スキルの任意アクションを使う（Game.skillAction） */
  async skillAction(playerId, actionId, args) {
    return this.game.skillAction(playerId, actionId, args);
  }

  /**
   * 手札のカードの実際の支払い（MP・城HP）の見積もり。Game の費用計画（スキルの MP軽減→HP置換）を乱数なしで呼ぶだけ。
   * スキルのないゲームでは null。{ ok, mp, hp, reason }
   */
  previewCardCost(cardId, skillOptions = {}) {
    const g = this.game;
    if (!g.skillRt) return null;
    const player = g.players[g.currentPlayer];
    const card = player?.hand.find((c) => c.cardId === cardId);
    if (!card) return { ok: false, reason: 'そのカードは手札にありません' };
    return g.skillRt.planCardCost(player, card, g.mpCostOf(card), skillOptions, { preview: true }) ?? null;
  }

  async setSkillPrefs(playerId,prefs) { return this.game.setSkillPrefs(playerId,prefs); }

  /** 攻撃を受けたとき、防御カードを出す */
  async defend(cardId, target) {
    return target ? this.game.defend(cardId, target) : this.game.defend(cardId);
  }

  /** 防御しないで、攻撃を受ける */
  async passDefense() {
    return this.game.passDefense();
  }

  /** マリガン：playerId（ひとりで遊ぶなら自分）の最初の手札から cardIds を引き直す */
  async mulligan(cardIds, playerId) {
    return this.game.mulligan(playerId, cardIds);
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
