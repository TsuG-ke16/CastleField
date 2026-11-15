// 道。となりの席の2人の城をつなぐ（2人なら1本）。
// players[0] は席順が前の人。道のマス番号は players[0] の城側が 0、players[1] の城側が length - 1。

export class Road {
  /**
   * @param {string} a 席順が前の人
   * @param {string} b 席順が後ろの人
   * @param {number} length マスの数（rules.laneLength）
   * @param {number} [lane] 同じ2人の間の何本目か（0から）
   * @param {number} [laneCount] 同じ2人の間の道の本数（rules.laneCount）。2本以上なら roadId は "p1-p2#1" のように番号がつく
   */
  constructor(a, b, length, lane = 0, laneCount = 1) {
    this.pairId = `${a}-${b}`;
    this.roadId = laneCount === 1 ? this.pairId : `${this.pairId}#${lane + 1}`;
    this.lane = lane;
    this.players = [a, b];
    this.length = length;
  }

  has(playerId) {
    return this.players.includes(playerId);
  }

  /** playerId から見た、道の向こうの人 */
  otherSide(playerId) {
    return this.players[0] === playerId ? this.players[1] : this.players[0];
  }

  /** ownerId の兵士の位置（自分の城から数えたマス）→ 道のマス番号 */
  toSquare(ownerId, position) {
    return ownerId === this.players[0] ? position : this.length - 1 - position;
  }

  /** 道のマス番号 → ownerId から数えた位置 */
  toPosition(ownerId, square) {
    return ownerId === this.players[0] ? square : this.length - 1 - square;
  }

  toState() {
    return { roadId: this.roadId, players: [...this.players], length: this.length, lane: this.lane };
  }
}
