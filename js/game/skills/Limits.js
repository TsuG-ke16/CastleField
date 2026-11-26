// スキルの安全上限（仕様 5.1・5.5。暫定値）

export const LIMITS = {
  /** 1原アクションの派生深度 */
  depth: 8,
  /** 1原アクションの派生イベント数 */
  derived: 128,
  /** 1プレイヤー・1区間（自ターン開始〜次の自ターン開始）の新規スキル成功イベント数 */
  successPerInterval: 128,
};

/** 新規リソースの上限 */
export const RESOURCE_CAPS = {
  soul: 6,
  storedMp: 5,
  blood: 8,
  healStore: 5,
  /** SP（クラシックに既存の SP がないので、スキルを持つ試合だけで使う最小の追加。初期0） */
  sp: 30,
};

/** 既存の上限がない新規の城壁・シールド生成の上限（既存の値は削らない） */
export const NEW_DEFENSE_CAP = 10;

/** 確率の上限 */
export const PROB_CAPS = { crit: 0.8, other: 0.95 };
/** 会心倍率の上限 */
export const CRIT_MULTIPLIER_CAP = 3.0;

/** トークン：同時に場にいる数・各自ターンに生成する数 */
export const TOKEN_LIMITS = { alive: 3, perTurn: 2 };
/** 使い魔（クラシック専用の兵士） */
export const FAMILIAR = { hp: 2, attack: 1, speed: 1, range: 1, name: '使い魔' };
/** 蘇生：1インスタンスの自動蘇生・合計の回数 */
export const REVIVE_LIMITS = { auto: 1, total: 2 };
