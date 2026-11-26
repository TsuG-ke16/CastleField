// 兵士の配置・移動・追加の通常攻撃まわりの補助（段階C：系統 U・K・F・A と横断 X06/X10/X25/X39〜X43 が使う）。
// 既存の盤面ルールに従う：
// - 隣接＝縦横1枠（同じ道の前後1マス、となりのレーンの同じマス。斜めなし）。SkillApi.adjacentSoldiers と同じ
// - 道（レーン）は同じ2人の間に rules.laneCount 本。兵士の位置 position は自分の城から数えたマス（0＝自分の城の前）
// - 進む兵士は進軍で1マスずつ進み、同じマスか1つ先に相手の兵士がいると止まって戦う（findClashTarget）。
//   弓兵・魔法使いは動かずに range マス先まで撃つ（shoot）。護衛・忍者は戦う側にならない
// - 空き枠：盤面に枠の上限はないので、「その道のそのマスに（自分も相手も）兵士・魔物がいない」を空き枠とする
// - 追加の通常攻撃は反撃なしの1回の攻撃（origin "extraAttack"）。回避→基礎威力補正→会心→軽減は skillRt.hit、
//   あとは shoot と同じ処理（ダメージ・吸命・付着・休ませる・afterHit）

import { ratioAmount } from './Crit.js';

export const soldierNumber = (s) => Number(String(s.soldierId).slice(1));

/** 兵士の持ち主（プレイヤーID）。いなければ null */
export function ownerIdOf(game, soldier) {
  return game.playerOrder.find((id) => game.players[id].soldiers.includes(soldier)) ?? null;
}

// ================= 射程・対象 =================

/** 通常攻撃で届く最大距離（マス）。護衛・忍者は0 */
export function attackRange(game, soldier) {
  if (soldier.isGuard || soldier.stealth) return 0;
  if (soldier.isRanged) return Math.max(1, soldier.range + soldier.rangeBonus - (game.stageDef()?.rangePenalty ?? 0));
  return soldier.rangeBonus > 0 ? 1 + soldier.rangeBonus : 1;
}

/**
 * 今の位置から通常攻撃で届く敵兵士（近い順。同じ近さなら先に出した方）。
 * 進む兵士は findClashTarget と同じ（同じマスか1つ先。射程+の武器なら先まで。すぐ前に魔物がいれば飛び越えない）、弓兵・魔法使いは shoot と同じ
 * @returns {{owner: object, soldier: object, q: number}[]}
 */
export function attackTargets(game, player, soldier) {
  if (!player.soldiers.includes(soldier) || soldier.frozen > 0) return [];
  const max = attackRange(game, soldier);
  if (max <= 0) return [];
  const here = soldier.position;
  let reach = max;
  if (!soldier.isRanged && soldier.rangeBonus > 0 && game.findMonsterInRange(soldier, player)) reach = 1;
  const foes = game.foesOf(soldier, player).filter((c) => c.q >= here && c.q <= here + reach);
  // 進む兵士は findClashTarget と同じ「近さ」（1つ先までは同じ近さ）、弓兵・魔法使いは shoot と同じ距離順
  const near = (c) => (soldier.isRanged ? c.q : c.q <= here + 1 ? 0 : c.q - here);
  return foes.sort((a, b) => near(a) - near(b) || soldierNumber(a.soldier) - soldierNumber(b.soldier));
}

// ================= 追加の通常攻撃 =================

/**
 * 追加の通常攻撃（反撃なし・1回）。呼ぶ前に api.spawnExtra('extraAttack') で許可を取ること。
 * ratio < 1 なら基礎威力を ratio 倍（切り捨て・最低1）してから会心などを判定する
 * @returns {{hit: boolean, killed: boolean}}
 */
export function strike(api, attacker, victimEntry, { ratio = 1 } = {}) {
  const game = api.game;
  const player = api.player;
  const { owner, soldier: victim } = victimEntry;
  const kind = attacker.isRanged ? 'shot' : 'fight';
  return api.as('extraAttack', () => {
    let miss = game.rollMiss() || game.rollBlind(attacker);
    const base = () => {
      const full = game.fightDamage(attacker, victim);
      return ratio < 1 ? ratioAmount(full, ratio, { directExtra: true }) : full;
    };
    const sk = !miss && game.skillRt ? game.skillRt.hit({ kind, attackerOwner: player, attacker, victimOwner: owner, victim, amount: base() }) : null;
    if (sk?.evaded) miss = true;
    const amount = miss ? 0 : sk ? sk.amount : base();
    if (attacker.isRanged) {
      game.emit('soldierShot', {
        playerId: player.id, soldierId: attacker.soldierId, role: attacker.role, target: { kind: 'soldier', playerId: owner.id, soldierId: victim.soldierId }, amount,
      });
    }
    const hp0 = victim.hp;
    let killed = false;
    if (miss) {
      game.emitMiss(player.id, kind, { soldierId: attacker.soldierId });
    } else if (game.damageSoldier(owner, victim, amount, kind)) {
      killed = true;
      game.raiseOnKill(player, attacker);
      game.lifestealBy(player, attacker, hp0);
    } else {
      game.lifestealBy(player, attacker, hp0 - victim.hp);
      game.elementHit(owner, victim, attacker.element, { damage: amount, by: player });
      if (attacker.attachRandomElement) game.attachRandomBasic(owner, victim);
      game.freezeOnHitBy(attacker, owner, victim);
    }
    if (sk && !miss) game.skillRt.afterHit(sk, { dealt: hp0 - victim.hp, killed: !owner.soldiers.includes(victim) });
    game.checkGameOver();
    return { hit: !miss, killed };
  });
}

// ================= 進軍（1マスの追加進軍） =================

/** 追加で1マス進軍できるか（既存の移動制約：進む兵士・凍っていない・嵐でない・相手と戦っていない・城に着かない） */
export function stepCheck(game, player, soldier, { needFree = false } = {}) {
  if (!player.soldiers.includes(soldier)) return { ok: false, reason: '兵士がいません' };
  if (soldier.isStationary) return { ok: false, reason: '弓兵・魔法使い・護衛は進軍しません' };
  if (soldier.frozen > 0) return { ok: false, reason: '凍結していて動けません' };
  if (game.weatherDef()?.stopMarch) return { ok: false, reason: '嵐で進めません' };
  if (soldier.position + 1 >= game.rules.laneLength) return { ok: false, reason: '敵の城の前なので、これ以上は進めません' };
  if (game.findClashTarget(soldier, player) || game.findMonsterInRange(soldier, player)) return { ok: false, reason: '相手と向かい合っていて進めません' };
  if (needFree && player.soldiers.some((s) => s !== soldier && s.roadId === soldier.roadId && s.position === soldier.position + 1)) {
    return { ok: false, reason: '前のマスが空いていません' };
  }
  return { ok: true };
}

/** 追加で1マス進軍する。進んだ先で相手の兵士とぶつかったら、進軍と同じように戦う（追加の攻撃として。魔物とは戦わない） */
export function stepForward(api, soldier) {
  const game = api.game;
  const player = api.player;
  const from = soldier.position;
  soldier.moveForward();
  game.emit('soldierMoved', { playerId: player.id, soldierId: soldier.soldierId, roadId: soldier.roadId, from, to: soldier.position, skillMove: 'step' });
  const opponent = game.findClashTarget(soldier, player);
  if (opponent) api.as('extraAttack', () => game.fight(player, soldier, opponent.owner, opponent.soldier, opponent.q - soldier.position > 1));
  game.checkGameOver();
  return { fought: Boolean(opponent) };
}

// ================= レーン・空き枠 =================

/** 隣接レーン（同じ2人の間で lane が1つちがう道）。lane 順 */
export function neighborRoads(game, soldier) {
  const road = game.findRoad(soldier.roadId);
  if (!road) return [];
  return game.roads.filter((r) => r.pairId === road.pairId && Math.abs((r.lane ?? 0) - (road.lane ?? 0)) === 1).sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0));
}

/** road のマス（持ち主 ownerId から数えた position）が空いているか（自分・相手の兵士も魔物もいない。ignore は数えない） */
export function slotFree(game, ownerId, road, position, ignore = null) {
  const sq = road.toSquare(game.side(ownerId), position);
  for (const id of game.playerOrder) {
    for (const s of game.players[id].soldiers) {
      if (s === ignore || s.roadId !== road.roadId) continue;
      if (road.toSquare(game.side(id), s.position) === sq) return false;
    }
  }
  return !game.monsters.some((m) => m.roadId === road.roadId && m.square === sq);
}

/** 隣接レーンの同じ進軍位置の空き枠へ移せる組み合わせ [{ soldier, road }]（兵士の安定順→レーン順） */
export function laneMoveCandidates(game, player) {
  const out = [];
  for (const soldier of [...player.soldiers].sort((a, b) => soldierNumber(a) - soldierNumber(b))) {
    for (const road of neighborRoads(game, soldier)) {
      if (slotFree(game, player.id, road, soldier.position, soldier)) out.push({ soldier, road });
    }
  }
  return out;
}

/** args { soldierId, roadId } のレーン移動が合法か */
export function checkLaneMove(game, player, args) {
  const soldier = player.soldiers.find((s) => s.soldierId === args?.soldierId);
  if (!soldier) return { ok: false, reason: '味方の兵士を選んでください' };
  const road = neighborRoads(game, soldier).find((r) => r.roadId === args?.roadId);
  if (!road) return { ok: false, reason: '隣のレーンを選んでください' };
  if (!slotFree(game, player.id, road, soldier.position, soldier)) return { ok: false, reason: '同じ位置の空き枠がありません' };
  return { ok: true, soldier, road };
}

/** 兵士を隣接レーンの同じ位置へ移す（soldierMoved に skillMove "lane" を付けて出す） */
export function moveLane(game, player, soldier, road) {
  const fromRoadId = soldier.roadId;
  soldier.roadId = road.roadId;
  game.emit('soldierMoved', {
    playerId: player.id, soldierId: soldier.soldierId, roadId: road.roadId, fromRoadId, from: soldier.position, to: soldier.position, skillMove: 'lane',
  });
}

/** 同じ道の前後に隣り合う味方兵士の組 [{ back, front }]（back の position が1小さい） */
export function columnPairs(player) {
  const out = [];
  for (const back of player.soldiers) {
    for (const front of player.soldiers) {
      if (front !== back && front.roadId === back.roadId && front.position === back.position + 1) out.push({ back, front });
    }
  }
  return out.sort((a, b) => soldierNumber(a.back) - soldierNumber(b.back) || soldierNumber(a.front) - soldierNumber(b.front));
}

/** 前後に隣接する味方が2体以上いる列の最後尾（いちばん後ろ＝position が最小）の兵士 */
export function columnRears(player) {
  const pairs = columnPairs(player);
  return player.soldiers.filter((s) => pairs.some((p) => p.back === s) && !pairs.some((p) => p.front === s));
}

/** 位置を入れ替える（前後に隣接する2体）。soldierMoved に skillMove "step" を付けて出す */
export function swapPositions(game, player, a, b) {
  const [pa, pb] = [a.position, b.position];
  a.position = pb;
  b.position = pa;
  for (const [s, from, to] of [[a, pa, pb], [b, pb, pa]]) {
    game.emit('soldierMoved', { playerId: player.id, soldierId: s.soldierId, roadId: s.roadId, from, to, skillMove: 'step' });
  }
}

/** 同じ進軍位置の全レーンに味方兵士が揃っているか（レーンは3本以上のゲームだけ。揃っていれば各レーンの兵士） */
export function formationAt(game, player, soldier) {
  const road = game.findRoad(soldier.roadId);
  if (!road) return null;
  const lanes = game.roads.filter((r) => r.pairId === road.pairId).sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0));
  if (lanes.length < 3) return null;
  const members = [];
  for (const r of lanes) {
    const m = player.soldiers.filter((s) => s.roadId === r.roadId && s.position === soldier.position).sort((x, y) => soldierNumber(x) - soldierNumber(y))[0];
    if (!m) return null;
    members.push(m);
  }
  return members;
}

/** 横隊が成り立っている位置（進軍位置が小さい順）の兵士たち [{ position, members }] */
export function formations(game, player) {
  const seen = new Set();
  const out = [];
  for (const s of [...player.soldiers].sort((a, b) => a.position - b.position || soldierNumber(a) - soldierNumber(b))) {
    const road = game.findRoad(s.roadId);
    const key = `${road?.pairId}@${s.position}`;
    if (!road || seen.has(key)) continue;
    const members = formationAt(game, player, s);
    if (members) {
      seen.add(key);
      out.push({ position: s.position, members });
    }
  }
  return out;
}

// ================= 射程の加算（K03・A02 など。soldier.rangeBonus に差分を足す） =================

/** key ごとの射程加算を設定（n=0 で外す）。rangeBonus には差分だけを足すので、武器・長弓の値は壊さない */
export function setRangeAdd(soldier, key, n) {
  soldier.skillRange ??= {};
  const sum = () => Object.values(soldier.skillRange).reduce((s, v) => s + v, 0);
  const before = sum();
  if (n > 0) soldier.skillRange[key] = n;
  else delete soldier.skillRange[key];
  soldier.rangeBonus += sum() - before;
}

// ================= 城 =================

/** 敵城へ到達した（城に着いた）自分の兵士。castleHit/castlePierce の ctx から。到達でなければ null */
export function arrivedSoldier(api, ctx) {
  if (ctx.source?.kind !== 'soldier') return null;
  const found = api.findSoldier(ctx.source.soldierId);
  if (!found || found.owner.id !== api.playerId) return null;
  return found.soldier.position >= api.game.rules.laneLength ? found.soldier : null;
}

/** 城への固定ダメージ（会心・基礎威力補正・城壁貫通・致死防止などの直接攻撃の補正を通さない。城壁は通る）。victimOwnerId の陣地の城。実際に与えたか */
export function fixedCastleDamage(api, victimOwnerId, amount, { ignoreArmor = false } = {}) {
  const game = api.game;
  const owner = game.players[game.side(victimOwnerId)];
  if (!owner || owner.castle.isDestroyed || owner.eliminated || !(amount > 0) || game.phase === 'gameOver') return false;
  api.as('chain', () => game.damageCastle(owner, amount, { kind: 'skill', skill: api.skillId }, { ignoreArmor }));
  game.checkGameOver();
  return true;
}
