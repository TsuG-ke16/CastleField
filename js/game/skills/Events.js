// スキルの共通イベントの定義（仕様 5.5）。Game の emit とは別の、スキル専用のイベント。
// - すべてのスキルイベントは makeEvent() で作る（eventId・rootActionId・parentEventId・ownerId・sourceSkillId・sourceCardId・targetId・origin・depth・量・成否）
// - ハンドラは handlers/<系統>.js に on: { <イベント名>: fn } で書く（Game.js は触らない）

/** ハンドラが購読できるイベントの名前（Game のどこから出るかは docs/skilltree-200-progress.md の「フック一覧」） */
export const SKILL_EVENTS = [
  'onTurnStart', // 自分のターン開始（回数リセット → HP債務 → 予約 → これ）。ev.playerId
  'onTurnEnd', // 自分のターン終了（endTurn の最初。手札の上限で捨てる前）
  'onCardPlayed', // 手札からカードを使った（実カード使用1回だけ。origin "hand"）。ev.card, ev.mpPaid, ev.hpPaid
  'onSpellCast', // 魔法の spellCast（対象が決まったあと）
  'onAttackResolve', // 直接命中の解決後（兵士の通常攻撃・射撃・魔法の命中）。ev.amount, ev.dealt, ev.crit, ev.killed, ev.direct
  'onDamageDealt', // 兵士への実ダメージ（soldierDamaged。cause つき）
  'onUnitDeath', // 非トークン兵士の死亡（removeSoldier の killed）。ev.snapshot（死亡時の攻撃力・位置・状態）
  'onTokenGone', // スキルのトークンが消えた（死亡扱いにしない）
  'onCastleDamage', // 城へのダメージ（castleDamaged。armorBefore・blocked・loss・prevented）
  'onWallBreak', // 城壁が攻撃で0になった
  'onHeal', // 実回復（castleHealed / soldierHealed）。ev.amount（実回復）, ev.overflow（分かるときだけ）
  'onReaction', // 属性反応（triggerReaction）。ev.reaction, ev.damage, ev.byId
  'onStatusApplied', // 状態異常の付与（statusApplied）。ev.sourceId（付与元が分かるとき）
  'onStatusTick', // 持続ダメージの tick（毒・やけど・出血・砂・凍傷）
  'onDraw', // ドロー（cardDrawn）。ev.kind "normal" | "extra" | "other"
  'onResourceChange', // MP・コイン（Game の mpChanged / coinsChanged）と、スキルの資源（魂・血気・貯蔵MP・余剰回復・SP）
  'onSummon', // 兵士が場に出た（soldierDeployed）。origin で手札・蘇生・トークンを区別
  'onRevive', // 蘇生（スキルの蘇生 API・蘇生の魔法）
  'onMonsterKill', // 魔物にとどめ（monsterDefeated）
  'onMiss', // 攻撃が外れた・回避した
  'onHpPayment', // 任意のHP支払（ダメージではない独立イベント）
  'onElementAttached', // 属性の付着（elementAttached）
  'onWeaponEquip', // 武器の装備（weaponEquipped）
  'onUnitMoved', // 兵士が動いた（soldierMoved。kind "march"＝進軍 / "lane"＝スキルのレーン移動 / "step"＝スキルの追加進軍・位置交換）
  'onEnemyCardPlayed', // 相手が手札からカードを使った（模倣系用。相手の手札は見せない）
  'onTrap', // 罠（js/game/Traps.js）：ev.phase "set" / "triggered" / "removed"（ev.reason）。ev.trapId・roadId・square・generated・fromHand・chained・victimOwnerId・targetId
  // 既存仕様に存在しないもの（発行されない。段階C で既存機能が追加されたときのために名前だけ予約）
  'onWeaponAttack', // 固定兵器の攻撃：クラシックに固定兵器がない（武器は兵士に付ける装備）
  'onDiagnostic', // 上限超過などの診断（ハンドラは購読しなくてよい）
];

/** origin（発生元）。最低限の14種＋細分化 */
export const ORIGINS = [
  'hand', 'normalAttack', 'echo', 'chain', 'reaction', 'dot', 'reflect', 'resurrection', 'token', 'copy',
  'scheduled', 'sacrifice', 'hpCost', 'skillActive',
  // 細分化
  'turnStart', 'turnEnd', 'system', 'monster', 'free', 'defense', 'extraAttack', 'trap',
];

/** 追加発動の origin（ここから新しい追加発動は原則生まれない） */
export const EXTRA_ORIGINS = new Set(['echo', 'chain', 'reflect', 'resurrection', 'token', 'copy', 'scheduled', 'extraAttack']);
/** 直接命中とみなす origin（C06・X01・B04 などの「直接会心時」誘発はこれだけ） */
export const DIRECT_ORIGINS = new Set(['hand', 'normalAttack']);

/** 同じイベントの複数ハンドラの段階（この順。同じ段階では安定ID順） */
export const STAGES = ['state', 'lethal', 'death', 'resource', 'extra'];

/**
 * 追加発動の例外（親 origin > 子 kind）。spawnExtra の allow に書いた例外だけ通す。
 * 回数の上限は Runtime が数える（M08 のやまびこ合計3回・未取得2回、X19 は1回、X18・X22 は1回）
 */
export const EXTRA_EXCEPTIONS = {
  'echo>echo': { needs: 'M08' },
  'token>token': { needs: 'X19', max: 1 },
  'scheduled>echo': { needs: 'X18', max: 1 },
  'copy>echo': { needs: 'X22', max: 1 },
};

/** 同種からの同種は禁止（例外は上の表だけ） */
export const SAME_KIND_BANNED = new Set(['reflect', 'resurrection', 'copy', 'token', 'scheduled']);

export function makeEvent(rt, type, fields = {}) {
  const parent = fields.parent ?? null;
  const ev = {
    eventId: rt.nextEventId(),
    type,
    rootActionId: rt.root?.id ?? null,
    parentEventId: parent?.eventId ?? null,
    ownerId: fields.ownerId ?? null,
    sourceSkillId: fields.sourceSkillId ?? null,
    sourceCardId: fields.sourceCardId ?? null,
    targetId: fields.targetId ?? null,
    origin: fields.origin ?? parent?.origin ?? rt.root?.origin ?? 'system',
    depth: parent ? (parent.depth ?? 0) + 1 : (fields.depth ?? 0),
    amount: fields.amount ?? null,
    ok: fields.ok ?? true,
    reason: fields.reason ?? null,
    turn: rt.game.turn,
  };
  for (const [k, v] of Object.entries(fields)) if (!(k in ev) && k !== 'parent') ev[k] = v;
  return ev;
}

export const isExtraOrigin = (origin) => EXTRA_ORIGINS.has(origin);
export const isDirect = (ev) => DIRECT_ORIGINS.has(ev?.origin) && !ev?.isExtra;
