// 戦い方（シミュレーションと、ひとりで遊ぶモードの CPU が使う）。
// Game の公開メソッド（getState / canPlayCard / playCard / discard）だけを使う。DOM は使わない。
// CPU は自分の手札だけを見る（相手の手札は getState(自分) では null）。
// カードとルールの数値は、呼ぶ側から渡される ctx（{ cards, rules, upgrades, discardCount }）で読む。
// どの戦い方も「出せるカード」は canPlayCard で確かめるので、ルールが変わっても動く。
//   takeTurn(game, pid, rng, ctx)      … メインでカードを出す（出さなくてもよい）
//   chooseDiscard(game, pid, rng, ctx) … ctx.discardCount 枚の cardId を返す

import { acquirableIds, normalizeBuild } from './SkillTree.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function view(game, pid) {
  const state = game.getState(pid);
  const me = state.players[pid];
  // チーム戦では、同じ城（castleOwner）の味方は相手に数えない
  const sideOf = (id) => state.players[id].castleOwner ?? id;
  const enemies = Object.keys(state.players).filter((id) => sideOf(id) !== sideOf(pid)).map((id) => ({ id, ...state.players[id] }));
  const playable = me.hand.filter((c) => game.canPlayCard(c.cardId).ok && cpuAffordable(game, pid, c.cardId));
  return { state, me, enemies, playable };
}


/** 今のターンのカード定義（レーンの選び方で、兵士か魔法かを見分けるのに使う） */
let curCards = {};
/** 今のターンの ctx（ctx.onDefense があれば、攻撃が防御待ちになったとき、続きを進める前に呼ぶ） */
let curCtx = null;

/**
 * 道（レーン）を選ぶ（targets の中に roadId があるとき）。
 *   兵士：相手の兵士が来ている道へ迎え撃ちに行く（いなければ魔物のいる道。ごほうびと、城を攻められる前に倒すため）
 *   魔法：相手の兵士がいちばん多い道へ
 * 同点のときは乱数で選ぶ。
 */
function pickLane(game, pid, cardId, targets) {
  const withRoad = targets.filter((t) => t.roadId);
  if (withRoad.length < 2) return withRoad[0] ?? targets[0];
  const st = game.getState(pid);
  const type = st.players[pid].hand.find((c) => c.cardId === cardId)?.type;
  const isSoldier = curCards[type]?.kind === 'soldier';
  // 城への魔法が先頭の兵士に当たるルール（castleSpellHitsFront）：相手の兵士がいちばん先頭（自分の城の近く）まで来ている道へ。
  // だれもいなければ最初の道（城に当たる）。ふつうのルールでは城への魔法に道はないので、ここには来ない
  if (curCards[type]?.effect === 'damageEnemyCastle') {
    const me = st.players[pid].castleOwner ?? pid;
    const front = (roadId) => Math.max(-1, ...Object.entries(st.players)
      .filter(([id, p]) => (p.castleOwner ?? id) !== me)
      .flatMap(([, p]) => p.soldiers.filter((x) => x.roadId === roadId).map((x) => x.position)));
    const best = Math.max(...withRoad.map((t) => front(t.roadId)));
    return best < 0 ? withRoad[0] : withRoad.find((t) => front(t.roadId) === best);
  }
  const enemyCount = (roadId) => Object.entries(st.players)
    .filter(([id, p]) => (p.castleOwner ?? id) !== (st.players[pid].castleOwner ?? pid))
    .reduce((n, [, p]) => n + p.soldiers.filter((x) => x.roadId === roadId).length, 0);
  const score = (t) => {
    const monster = st.monsters.some((m) => m.roadId === t.roadId) ? 1 : 0;
    // 兵士：相手の兵士が来ている道に出して迎え撃つ（いなければ、魔物のいない道）
    return isSoldier ? enemyCount(t.roadId) * 2 + monster : enemyCount(t.roadId);
  };
  const best = Math.max(...withRoad.map(score));
  const ties = withRoad.filter((t) => score(t) === best);
  return ties[Math.floor(tieRng() * ties.length)];
}

/** 対象を選んで出す。chooseTarget を省略すると、いちばん城HPの割合が少ない相手（道は pickLane で選ぶ） */
function playWith(game, cardId, chooseTarget) {
  const targets = game.getTargets(cardId);
  if (targets.length === 0) return false;
  let t;
  if (chooseTarget) t = chooseTarget(targets);
  else {
    // 省略したら、いちばん城HPの割合が少ない相手（魔物は選ばない）。道が何本かあるときは、その相手の道から選ぶ
    t = weakest(game, targets);
    if (t?.playerId) {
      const lanes = targets.filter((x) => x.playerId === t.playerId && x.roadId);
      if (lanes.length) t = pickLane(game, game.getState(null).currentPlayer, cardId, lanes);
    }
  }
  if (!t) return false;
  const res = cpuPlay(game, cardId, t);
  // 相手が防御を選ぶ場面になったら、(シミュレーションなどでは) その場で相手に返事をしてもらう
  if (res.ok && curCtx?.onDefense && game.getState(null).phase === 'defend') curCtx.onDefense(game);
  return res.ok;
}

/** 同じくらいのときに、いつも同じ相手を選ばないための乱数（takeTurn の最初に入れる） */
let tieRng = Math.random;

function weakest(game, targets) {
  const players = targets.filter((t) => t.playerId);
  if (!players.length) return targets[0];
  const st = game.getState(null).players;
  const ratio = (t) => st[t.playerId].castleHp / st[t.playerId].castleMaxHp;
  const min = Math.min(...players.map(ratio));
  const ties = players.filter((t) => ratio(t) - min < 0.1); // 1割以内の差は同じくらいとみなす
  return ties.length === 1 ? ties[0] : ties[Math.floor(tieRng() * ties.length)];
}

/** 種類の優先順に、出せる最初のカードを出す */
/** 出せる順の優先度に従って、出せなくなるまで続けて出す（何枚でも出せるカード用） */
function playRepeat(game, pid, typesInOrder) {
  for (let i = 0; i < 15; i++) {
    if (!playFirst(game, view(game, pid).playable, typesInOrder)) return;
  }
}

function playFirst(game, playable, typesInOrder) {
  for (const t of typesInOrder) {
    const c = playable.find((x) => x.type === t);
    if (c && playWith(game, c.cardId)) return true;
  }
  return false;
}

const ELEMENT_BEATS = { water: 'fire', fire: 'wind', wind: 'earth', earth: 'water' };

/**
 * 属性 element の攻撃が、相手の兵士 s（getState の形）に当たったら反応するか。
 * reactions は getState().reactions（反応の定義。ゲームの内部は読まない）。Game.findReaction と同じ決まり：
 *   当たったあとの属性（武器の属性＋付着＋element）に混沌が入っていて3種以上 → 混沌反応／表で element と組になる属性が付いている → その反応
 */
export function canReact(reactions, element, s) {
  if (!element || !reactions) return false;
  const on = [...new Set([s.element, ...(s.attachments ?? []).map((a) => a.element)].filter(Boolean))];
  // 4陣営の frozenCountsAsIce：凍結中の兵士は氷が付いている扱い（getState().reactions.frozenCountsAsIce）
  if (reactions.frozenCountsAsIce && (s.statuses?.frozen ?? 0) > 0 && !on.includes('ice')) on.push('ice');
  const all = on.includes(element) ? on : [...on, element];
  const chaos = reactions.chaos;
  if (chaos && all.includes(chaos.element) && all.length >= chaos.minElements) return true;
  return Object.values(reactions.reactions).some((r) => r.elements.includes(element) && on.includes(r.elements.find((e) => e !== element)));
}

/** 城壁をぶつける魔法（armorBlast）を持っているとき、CPU が城壁を貯める目安（castleSpellHitsFront のルールだけ） */
const ARMOR_CHARGE = 15;

/**
 * メイン以外（付加・防御）のカードを、役に立つときに出す（ほどよく考える戦い方で使う）
 *   武器：まだ武器のない、いちばん前の兵士に。近くの相手の属性に強い属性を選ぶ
 *   盾：いちばん前の兵士に
 *   城壁：城HPが半分以下のときだけ（手札が1枚減り、MP を使うルールでは MP も使うため）。
 *         chargeArmor が true なら、castleSpellHitsFront のルールで城壁をぶつける魔法を持っているとき、ARMOR_CHARGE まで貯める（smart・guard だけ）
 */
function playSupports(game, pid, ctx, { chargeArmor = false } = {}) {
  // 属性の付着と反応（クラシック）があるゲームだけ、反応を起こせる武器を先に選ぶ（ないゲームでは今までどおり）
  for (let guard = 0; guard < 20; guard++) {
    const { state, me, enemies, playable } = view(game, pid);
    const reactions = state.reactions ?? null; // getState の公開データ（付着と反応のないゲームでは null）
    let support = playable.filter((c) => ctx.cards[c.type].kind !== 'soldier' && ctx.cards[c.type].kind !== 'spell');
    if (support.length === 0) return;
    const front = [...me.soldiers].sort((a, b) => b.position - a.position);
    const enemySoldiers = enemies.flatMap((e) => e.soldiers);
    // 武器ごとに、反応を起こせる相手の兵士（いなければ null）
    const reactTarget = (def) => (reactions && def.kind === 'weapon' ? enemySoldiers.find((s) => canReact(reactions, def.element, s)) ?? null : null);
    if (reactions) support = [...support].sort((a, b) => Number(Boolean(reactTarget(ctx.cards[b.type]))) - Number(Boolean(reactTarget(ctx.cards[a.type]))));
    let played = false;
    for (const c of support) {
      const def = ctx.cards[c.type];
      if (def.kind === 'weapon') {
        const nearElements = new Set(enemySoldiers.map((s) => s.element).filter(Boolean));
        // 近くの相手の属性に負ける属性は避ける
        const bad = [...nearElements].some((e) => ELEMENT_BEATS[e] === def.element);
        // 反応を起こせる相手がいれば、その相手と同じ道の、まだ武器のない兵士に持たせる（いなければ、いちばん前の兵士）
        const foe = reactTarget(def);
        const target = (foe && front.find((s) => !s.weapon && s.roadId === foe.roadId)) || front.find((s) => !s.weapon);
        if (!bad && target) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === target.soldierId));
      } else if (def.effect === 'guardCastle') {
        // 身代わり（4陣営）：相手の兵士が自分の城の近く（あと2マス以内）まで来ていて、まだ身代わりがいなければ、HPのいちばん多い兵士に
        const L = ctx.rules?.laneLength ?? 5;
        const near = enemySoldiers.some((s) => s.position >= L - 2);
        const sturdy = [...me.soldiers].sort((a, b) => b.hp + b.shield - (a.hp + a.shield))[0];
        if (near && !me.castleGuard && sturdy) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === sturdy.soldierId));
      } else if (def.effect === 'shieldSoldier') {
        if (front.length) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === front[0].soldierId));
      } else if (def.effect === 'armorCastle') {
        // 城壁は手札が1枚減る（MP を使うルールでは MP も使う）ので、城HPが半分以下のときだけ出す。
        // ただし chargeArmor（smart・guard）で、城への魔法が兵士に止められるルール（castleSpellHitsFront）のとき、城壁をぶつける魔法（armorBlast）を持っていれば、
        // 城壁を弾として貯める（ARMOR_CHARGE まで。ぶつけるのは smartStep：城壁10以上か、相手の城を落とせるとき）
        const charging = chargeArmor && Boolean(ctx.rules?.castleSpellHitsFront) && me.armor < ARMOR_CHARGE && me.hand.some((h) => ctx.cards[h.type]?.effect === 'armorBlast');
        // 魔族の血の膜：敵の兵士が城の手前2マス以内まで来ていて、城壁が薄い（8未満）ときも出す（削られたぶん城が回復する）
        const L2 = ctx.rules?.laneLength ?? 5;
        const bloodNear = Boolean(def.bloodArmor) && isDemonCard(c.type) && me.armor < 8 && enemySoldiers.some((s) => s.position >= L2 - 2);
        if (me.castleHp * 2 <= me.castleMaxHp || charging || bloodNear) played = playWith(game, c.cardId);
      }
      if (played) break;
    }
    if (!played) return;
  }
}

/**
 * 切り札（カードの trump。4陣営の王国の勇者・神剣・神盾）を、MP が足りるうちに先に出す（smart・guard）。
 * trump のカードがないモードでは何もしない（乱数も使わない）。
 *   勇者：兵士としていちばん先に出す
 *   神剣：武器を持っていても重ねて持たせる。進む兵士（勇者があれば勇者）のうち、いちばん前の兵士
 *   神盾：次の進軍で城に着きそうな兵士か、近くの相手の兵士に倒されそうな兵士（攻撃力のいちばん高い兵士）
 */
function playTrumps(game, pid, ctx) {
  for (let guard = 0; guard < 5; guard++) {
    const { me, enemies, playable } = view(game, pid);
    const trumps = playable.filter((c) => ctx.cards[c.type]?.trump);
    if (trumps.length === 0) return;
    const L = ctx.rules?.laneLength ?? 5;
    let played = false;
    for (const c of trumps) {
      const def = ctx.cards[c.type];
      if (def.kind === 'soldier') {
        played = playFirst(game, [c], [c.type]);
      } else if (def.kind === 'weapon') {
        const melee = me.soldiers.filter((x) => x.role === 'melee');
        const pool = melee.length ? melee : me.soldiers;
        const target = [...pool].sort((a, b) => Number(Boolean(ctx.cards[b.type]?.trump)) - Number(Boolean(ctx.cards[a.type]?.trump)) || b.position - a.position || b.hp - a.hp)[0];
        if (target) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === target.soldierId));
      } else if (def.effect === 'shieldSoldier') {
        const foes = enemies.flatMap((e) => e.soldiers);
        const reaching = (x) => x.role === 'melee' && x.position + (ctx.cards[x.type]?.speed ?? 0) >= L;
        // 同じ道で、2マス以内にいて、HP＋盾を削り切れる相手の兵士がいる
        const endangered = (x) => foes.some((f) => f.roadId === x.roadId && Math.abs(L - 1 - f.position - x.position) <= 2 && f.attack >= x.hp + x.shield);
        const target = me.soldiers.filter((x) => reaching(x) || endangered(x)).sort((a, b) => b.attack - a.attack || b.position - a.position)[0];
        if (target) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === target.soldierId));
      }
      if (played) break;
    }
    if (!played) return;
  }
}

function randomDiscard(game, pid, rng, ctx) {
  const hand = [...game.getState(pid).players[pid].hand];
  const out = [];
  for (let i = 0; i < ctx.discardCount; i++) out.push(hand.splice(Math.floor(rng() * hand.length), 1)[0].cardId);
  return out;
}

/** 兵士カードを「強い順」に並べる（攻撃力＋速さ。速くて強い騎士が先） */
function soldierTypes(ctx) {
  return Object.entries(ctx.cards)
    .filter(([, d]) => d.kind === 'soldier')
    .sort((a, b) => b[1].attack + b[1].speed - (a[1].attack + a[1].speed))
    .map(([t]) => t);
}
const typesWithEffect = (ctx, effect) =>
  Object.entries(ctx.cards).filter(([, d]) => d.effect === effect).map(([t]) => t);

/** 魔族（4陣営モード）のカードか。カードの種類（キー）が fac_demon_ で始まるものだけ。通常モード・クラシック・ほかの陣営のカードには当たらない */
const isDemonCard = (type) => type.startsWith('fac_demon_');
const demonTypes = (ctx, effect) => typesWithEffect(ctx, effect).filter(isDemonCard);

/**
 * 攻撃を受けたときの返事（防御カードを出す。出さなくてもよい）。
 *   never：防御しない／always：出せるなら出す／smart：守る価値があるときだけ出す／random：半分の確率で出す
 * 自分の手札しか見ない。Game の公開メソッド（getState / canDefend / defend / passDefense）だけを使う。
 */
function respondDefense(game, pid, rng, ctx, policy) {
  for (let guard = 0; guard < 20; guard++) {
    const st = game.getState(pid);
    if (st.phase !== 'defend' || st.defense.defenderId !== pid) return;
    if (policy === 'never') break;
    const me = st.players[pid];
    const d = st.defense;
    const amountOf = (c) => ctx.cards[c.type].amount ?? 0;
    const options = me.hand.filter((c) => game.canDefend(c.cardId).ok).sort((a, b) => amountOf(b) - amountOf(a));
    if (options.length === 0) break;
    let card = null;
    let target;
    if (policy === 'random') {
      if (rng() >= 0.5) break;
      card = pick(options, rng);
      target = pick(game.getDefenseTargets(card.cardId), rng);
    } else if (d.kind === 'castle') {
      // 城：城HPが半分を切りそうなとき、または大きなダメージのときに城壁を出す
      const worth = policy === 'always' || d.amount >= 6 || me.castleHp - d.amount <= me.castleMaxHp / 2;
      if (!worth) break;
      // 反射・身代わりは、攻撃そのものを止める（使えるなら城壁より先に出す）
      const counter = options.find((c) => ['reflectSpell', 'nullifySoldier'].includes(ctx.cards[c.type].effect));
      card = counter ?? options[0];
    } else {
      // 兵士：やられそうな兵士（いちばん強いもの）に、それを守れる盾を出す
      const victims = me.soldiers.filter((x) => d.soldierIds.includes(x.soldierId)).sort((a, b) => b.attack - a.attack);
      const dying = victims.find((x) => x.hp + x.shield <= d.amount);
      const v = policy === 'always' ? victims[0] : dying;
      if (!v) break;
      const saves = options.filter((c) => v.hp + v.shield + amountOf(c) > d.amount);
      card = saves.at(-1) ?? options[0]; // 足りる中でいちばん小さい盾（なければいちばん大きい盾）
      target = { soldierId: v.soldierId };
    }
    if (!card || !game.defend(card.cardId, target).ok) break;
  }
  if (game.getState(null).phase === 'defend') game.passDefense();
}

const RAW_STRATEGIES = {
  /** 出せるカードからランダムに1枚 */
  random: {
    takeTurn(game, pid, rng) {
      // 出せるカードからランダムに出す。メインを出したら、あとは半分の確率で続ける
      for (let i = 0; i < 10; i++) {
        const { playable } = view(game, pid);
        if (!playable.length) return;
        const c = pick(playable, rng);
        playWith(game, c.cardId, (ts) => pick(ts, rng));
        if (game.getState(pid).players[pid].playedThisTurn && rng() < 0.5) return;
      }
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'random');
    },
    chooseDiscard: randomDiscard,
  },

  /** 攻撃だけ：城を直接たたく魔法 → 兵士 */
  aggro: {
    takeTurn(game, pid, rng, ctx) {
      playRepeat(game, pid, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'never');
    },
    chooseDiscard: randomDiscard,
  },

  /** ほどよく考える */
  smart: {
    takeTurn(game, pid, rng, ctx) {
      buyUpgrades(game, pid, ctx);
      playTrumps(game, pid, ctx);
      smartTurn(game, pid, ctx);
      playTrumps(game, pid, ctx); // 神剣・神盾は、出した兵士にも
      playSupports(game, pid, ctx, { chargeArmor: true });
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'smart');
    },
    chooseDiscard: randomDiscard,
  },

  /** 守り優先：回復 → 兵士への魔法 → 兵士 → 城への魔法 */
  defensive: {
    takeTurn(game, pid, rng, ctx) {
      playSupports(game, pid, ctx);
      playRepeat(game, pid, [
        ...typesWithEffect(ctx, 'healOwnCastle'),
        ...typesWithEffect(ctx, 'damageEnemySoldiers'),
        ...soldierTypes(ctx),
        ...typesWithEffect(ctx, 'damageEnemyCastle'),
      ]);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'always');
    },
    chooseDiscard: randomDiscard,
  },

  /** 攻め重視：城への魔法 → 兵士。回復はしない。武器・盾・強化は使う（aggro は付加・防御・強化を使わない素朴な型） */
  rush: {
    takeTurn(game, pid, rng, ctx) {
      buyUpgrades(game, pid, ctx);
      playRepeat(game, pid, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
      playSupports(game, pid, ctx);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'never');
    },
    chooseDiscard: randomDiscard,
  },

  /** 何も出さない */
  pass: {
    takeTurn() {},
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'never');
    },
    chooseDiscard: randomDiscard,
  },

  /** 兵士で守る：相手の兵士が自分の城から2マス以内に来たら兵士を出す。それ以外は smart */
  guard: {
    takeTurn(game, pid, rng, ctx) {
      const { playable, enemies } = view(game, pid);
      const L = ctx.rules.laneLength;
      const near = enemies.some((e) => e.soldiers.some((s) => s.position >= L - 3));
      buyUpgrades(game, pid, ctx);
      playTrumps(game, pid, ctx);
      if (!(near && playFirst(game, playable, soldierTypes(ctx)))) smartTurn(game, pid, ctx);
      playTrumps(game, pid, ctx);
      playSupports(game, pid, ctx, { chargeArmor: true });
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'smart');
    },
    chooseDiscard: randomDiscard,
  },
};

/** コインで強化を買う：城HPが半分より少なければ修理、兵士がいればとぎ石、余れば補充 */
function buyUpgrades(game, pid, ctx) {
  const ids = Object.keys(ctx.upgrades);
  if (!ids.length) return;
  const by = (effect) => ids.filter((id) => ctx.upgrades[id].effect === effect);
  for (let i = 0; i < 10; i++) {
    const me = game.getState(pid).players[pid];
    const order = [
      ...(me.castleHp < me.castleMaxHp / 2 ? by('repairCastle') : []),
      ...by('sharpenSoldiers'),
      ...by('trainArmy'),
      ...by('fortifyArmy'),
      ...by('gainCard').sort((a, b) => ctx.upgrades[b].cost - ctx.upgrades[a].cost),
      ...by('permanentLuck'),
      ...by('boostDrops'),
      ...by('drawCards'),
    ];
    const id = order.find((u) => game.canBuyUpgrade(u).ok);
    if (!id) return;
    game.buyUpgrade(id);
  }
}

/**
 * 手札に同じカードが2枚あれば合成する（1つ上のレアリティになる。レジェンドは合成できない）。
 * そのあと、適応（どのカードとでも合成できる）は、合成先がある中でいちばん高いレアリティのカードと合成する
 */
function fuseAll(game, pid, ctx) {
  const isWild = (c) => ctx.cards[c.type]?.effect === 'wild';
  for (let i = 0; i < 20; i++) {
    const hand = game.getState(pid).players[pid].hand;
    let done = false;
    for (let a = 0; a < hand.length && !done; a++) {
      if (isWild(hand[a])) continue;
      const b = hand.findIndex((c, j) => j > a && c.type === hand[a].type);
      if (b >= 0 && game.fuse(hand[a].cardId, hand[b].cardId).ok) done = true;
    }
    if (done) continue;
    const wild = hand.find(isWild);
    if (!wild) return;
    const order = Object.keys(ctx.rarities ?? { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 });
    const rank = (c) => order.indexOf(ctx.cards[c.type].rarity);
    const partners = hand.filter((c) => !isWild(c) && ctx.cards[c.type].fuseTo).sort((x, y) => rank(y) - rank(x));
    if (!partners.length || !game.fuse(wild.cardId, partners[0].cardId).ok) return;
  }
}

function smartStep(game, pid, ctx) {
  fuseAll(game, pid, ctx);
  const { me, enemies, playable } = view(game, pid);
  const enemy = enemies[0];
  const castleSpells = typesWithEffect(ctx, 'damageEnemyCastle');
  // 自分の道の、ごほうびの多い魔物（5コイン以上か、レア以上のカード）にとどめを刺せるなら、魔物を狙う
  // （ファイアボールは城を削るいちばんの手段なので、小さな魔物には使わない）
  for (const c of playable.filter((x) => castleSpells.includes(x.type))) {
    const ms = game.getTargets(c.cardId).filter((t) => t.monsterId);
    const st = game.getState(pid);
    const kill = ms.find((t) => {
      const m = st.monsters.find((x) => x.monsterId === t.monsterId);
      return m.hp <= ctx.cards[c.type].amount && (m.reward >= 5 || ['rare', 'epic', 'legendary'].includes(m.rewardRarity));
    });
    if (kill && cpuPlay(game, c.cardId, kill).ok) return true;
  }
  // とどめになるなら城への魔法
  for (const t of castleSpells) {
    if (enemy && ctx.cards[t].amount >= enemy.castleHp && playFirst(game, playable, [t])) return true;
  }
  // 毒にかかっていれば、解毒薬で治す（毒は永続なので、放っておくと削られ続ける）
  if (playFirst(game, playable, typesWithEffect(ctx, 'curePoison'))) return true;
  if (me.castleHp < me.castleMaxHp / 2 && playFirst(game, playable, [...typesWithEffect(ctx, 'healOwnCastle'), ...typesWithEffect(ctx, 'healCastleAndSoldiers')])) return true;
  // 魔族（4陣営。数値は仮）：魂の欠片（敵城に当てて自城を回復）。相手の城を落とせるときだけ先に出す
  // （それ以外は、下の最後の優先リストの最後に出す。自城HPが低いときに先に出す形は、ほかの魔法の MP とメインの枠を食って勝率が下がった）。防御・反射は playWith → onDefense の今までの扱いのまま
  const soulShards = demonTypes(ctx, 'damageCastleAndHeal');
  if (enemy && soulShards.length) {
    const lethal = soulShards.some((t) => ctx.cards[t].amount >= enemy.castleHp);
    if (lethal && playFirst(game, playable, soulShards)) return true;
  }
  // 永続の毒は早く入れるほど効く。強い毒から
  const toxins = typesWithEffect(ctx, 'poisonEnemy').sort((a, b) => ctx.cards[b].amount - ctx.cards[a].amount);
  if (enemy && playFirst(game, playable, toxins)) return true;
  // 自分の兵士・城が毒・やけど・凍結なら、浄化の炎で治す
  const ailing = me.castlePoison || me.soldiers.some((s) => s.statuses?.poison || s.statuses?.burn || s.statuses?.frozen > 0);
  if (ailing && playFirst(game, playable, typesWithEffect(ctx, 'purifyFlare'))) return true;
  // シールド・ブラスト：城壁が10以上か、相手の城を落とせるなら
  if (enemy && (me.armor >= 10 || me.armor >= enemy.castleHp) && playFirst(game, playable, typesWithEffect(ctx, 'armorBlast'))) return true;
  // イグニッション・バースト：自分の城に余裕があり、相手の兵士が2体以上か、相手の城を落とせるなら
  for (const t of typesWithEffect(ctx, 'ignitionBurst')) {
    const roomy = me.castleHp > me.castleMaxHp / 2;
    if (enemy && roomy && (enemy.soldiers.length >= 2 || ctx.cards[t].amount >= enemy.castleHp) && playFirst(game, playable, [t])) return true;
  }
  // チェーン・ブラスト：いちばん前まで来ている相手の兵士を狙う
  if (enemy && enemy.soldiers.length > 0) {
    const front = (targets) => {
      const byId = new Map(enemies.flatMap((e) => e.soldiers).map((s) => [s.soldierId, s]));
      return [...targets].sort((a, b) => (byId.get(b.soldierId)?.position ?? -1) - (byId.get(a.soldierId)?.position ?? -1))[0];
    };
    for (const c of playable.filter((x) => ctx.cards[x.type].effect === 'chainBlast')) if (playWith(game, c.cardId, front)) return true;
  }
  // 敵兵士1体へのダメージ（singleDamage）：倒せる兵士のうちいちばん前の兵士、倒せなければいちばん前の兵士
  // 呪い（weakenAttack）：攻撃力がいちばん高い兵士（同じなら前の兵士）
  if (enemy && enemy.soldiers.length > 0) {
    const byId = new Map(enemies.flatMap((e) => e.soldiers).map((s) => [s.soldierId, s]));
    // ランダム属性ダメージ（randomElementDamage）も同じ選び方（属性の上乗せは数えない）
    for (const c of playable.filter((x) => ['singleDamage', 'randomElementDamage'].includes(ctx.cards[x.type].effect))) {
      const amount = ctx.cards[c.type].amount;
      const pickFront = (targets) => {
        // 先頭の兵士に当たる魔法（target "front"。4陣営）は相手・道を選ぶ：相手の兵士がいちばん多い道（pickLane）
        if (!targets.some((t) => t.soldierId)) return targets.some((t) => t.roadId) ? pickLane(game, pid, c.cardId, targets) : targets[0];
        const list = targets.map((t) => ({ t, s: byId.get(t.soldierId) })).filter((x) => x.s);
        const kills = list.filter((x) => x.s.hp + x.s.shield <= amount);
        const pool = kills.length ? kills : list;
        return pool.sort((a, b) => b.s.position - a.s.position)[0]?.t;
      };
      if (playWith(game, c.cardId, pickFront)) return true;
    }
    for (const c of playable.filter((x) => ctx.cards[x.type].effect === 'weakenAttack')) {
      // 魔族の呪いの印（soldiers：手前の何体か）：呪われていない相手の兵士が2体以上か、攻撃4以上の兵士がいれば、その数がいちばん多い相手に
      if (ctx.cards[c.type].soldiers) {
        const fresh = (pidT) => enemies.find((e) => e.id === pidT)?.soldiers.filter((s) => !s.statuses?.weakened) ?? [];
        const best = (targets) => [...targets].sort((a, b) => fresh(b.playerId).length - fresh(a.playerId).length)[0];
        const ts = game.getTargets(c.cardId);
        const t = ts.length ? best(ts) : null;
        const worth = t && (fresh(t.playerId).length >= 2 || fresh(t.playerId).some((s) => s.attack >= 4));
        if (worth && playWith(game, c.cardId, () => t)) return true;
        continue;
      }
      const strongest = (targets) => targets
        .map((t) => ({ t, s: byId.get(t.soldierId) })).filter((x) => x.s)
        .sort((a, b) => b.s.attack - a.s.attack || b.s.position - a.s.position)[0]?.t;
      if (playWith(game, c.cardId, strongest)) return true;
    }
  }
  // 竜血の雫（healSoldier。4陣営）：回復量ぶん以上減っている自分の兵士のうち、いちばん前の兵士
  for (const c of playable.filter((x) => ctx.cards[x.type].effect === 'healSoldier')) {
    const amount = ctx.cards[c.type].amount;
    const hurt = me.soldiers.filter((x) => x.maxHp - x.hp >= amount).sort((a, b) => b.position - a.position)[0];
    if (hurt && playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === hurt.soldierId))) return true;
  }
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'damageEnemySoldiers'))) return true;
  // 次の進軍で城に着きそうな相手の兵士がいれば、凍結で止める
  const L = ctx.rules.laneLength;
  const threat = enemy && enemy.soldiers.some((s) => s.position + (ctx.cards[s.type]?.speed ?? s.speed ?? 0) >= L);
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'freezeEnemySoldiers'))) return true;
  // 魔族の氷の息：脅威がなくても、敵の兵士が自分の城の手前2マス以内まで来ていれば、凍結で進軍を1回止める
  const closeIn = enemy && enemy.soldiers.some((s) => s.position >= L - 2);
  if (closeIn && playFirst(game, playable, demonTypes(ctx, 'freezeEnemySoldiers'))) return true;
  // 凍結がなければ、突風で押し戻す
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'pushBackEnemySoldiers'))) return true;
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'poisonEnemySoldiers'))) return true;
  const vulnTime = enemy && (me.soldiers.some((s) => s.role === 'melee' && s.position >= L - 2) || enemy.castleHp * 2 <= enemy.castleMaxHp);
  // 魔族の残響の魂：MP に余裕（コスト＋3）があれば、最後の手段にせず出す（倒れた兵士がいなければ playable に入らない）
  const revives = demonTypes(ctx, 'reviveFallen').filter((t) => me.mp >= (ctx.cards[t].mpCost ?? 0) + 3);
  const played = playFirst(game, playable, [
    ...soldierTypes(ctx),
    ...castleSpells,
    ...typesWithEffect(ctx, 'breathAttack'), // 火炎の吐息（4陣営）：相手の兵士がいちばん多い道へ（pickLane）
    ...typesWithEffect(ctx, 'damageEnemySoldiers'),
    ...typesWithEffect(ctx, 'healOwnCastle'),
    ...revives,
    // 魔族：兵士・ほかの魔法を出したあと、MP が余っていれば出す（先に出すと、ほかの魔法の MP とメインの枠を食う）
    // 魔族の血の契約：自分の城HPが半分より多く、自分の兵士が2体以上いれば（城HPを払うので、守りが苦しいときは出さない）
    ...(enemy && me.castleHp * 2 > me.castleMaxHp && me.soldiers.length >= 2 ? demonTypes(ctx, 'bloodPact') : []),
    // 魔族の脆弱：自分の兵士が相手の城の手前2マス以内にいるか、相手の城HPが半分以下なら（城に当たるダメージが増える）
    ...(vulnTime ? demonTypes(ctx, 'vulnerableCastle') : []),
    // 魔族の毒の霧（城の毒）：防げない継続ダメージ。相手の城の毒が切れそう（残り1回以下）なら出す（重ねても量は増えず、回数が延びるだけ）
    ...(enemy && (enemy.castlePoisonTurns ?? 0) <= 1 ? demonTypes(ctx, 'poisonEnemyCastle') : []),
    // 魔族の封魔：まだ封じていない相手に
    ...(enemy && !enemy.mpSeal ? demonTypes(ctx, 'sealMp') : []),
    ...soulShards,
  ]);
  if (played) return true;
  // 蘇生：ほかに出す兵士がないとき、最後に倒れた兵士を生き返らせる（出せないときは playable に入らない）
  if (playFirst(game, playable, typesWithEffect(ctx, 'reviveFallen'))) return true;
  // 出すものがないとき、コインを増やすカード
  if (playFirst(game, playable, typesWithEffect(ctx, 'gainCoins'))) return true;
  // 出すものがないとき：相手の手札が多ければ盗賊、自分の手札が弱ければ天の恵み、最後に神頼み
  // 精霊：今いなければ、1体呼ぶ（大精霊は使い切りなので、城HPが半分を切ったときだけ）
  // 刻の魔法：自分に獣（魔物の駒）・暗殺者がいれば夜に。夜で相手に獣が見えるか、魔物がいれば昼に戻す
  {
    const { state } = view(game, pid);
    const nightLover = (s) => ctx.cards[s.type]?.monster !== undefined || ctx.cards[s.type]?.beast || ctx.cards[s.type]?.role === 'ninja';
    const timeSpells = typesWithEffect(ctx, 'setTime');
    if (state.time === 'day' && me.soldiers.some(nightLover)) {
      if (playFirst(game, playable, timeSpells.filter((t) => ctx.cards[t].time === 'night'))) return true;
    }
    if (state.time === 'night' && !me.soldiers.some(nightLover) && (enemies.some((e) => e.soldiers.some(nightLover)) || state.monsters.length > 0)) {
      if (playFirst(game, playable, timeSpells.filter((t) => ctx.cards[t].time === 'day'))) return true;
    }
  }
  if (!me.spirit) {
    const spirits = typesWithEffect(ctx, 'summonSpirit').filter((t) => !ctx.cards[t].exhaust || me.castleHp * 2 < me.castleMaxHp);
    if (playFirst(game, playable, spirits)) return true;
  }
  if (enemy && enemy.handCount >= 3 && playFirst(game, playable, typesWithEffect(ctx, 'stealCard'))) return true;
  if (me.hand.length >= 4 && playFirst(game, playable, typesWithEffect(ctx, 'redrawHand'))) return true;
  return playFirst(game, playable, typesWithEffect(ctx, 'randomEffect'));
}

/** 出せるカードがなくなる（または役に立つ手がなくなる）まで、1枚ずつ出す。兵士・回復・精霊などは1ターンに何枚でも出せる */
function smartTurn(game, pid, ctx) {
  for (let i = 0; i < 15; i++) {
    if (!smartStep(game, pid, ctx)) return;
  }
}

/**
 * MP が少ないとき、マナ回復のカードを出す（MP を使う魔法が撃てなくなるのを防ぐ）。
 * 上限を超えて無駄にしないよう、回復量が入る分だけの余裕があるカードを、小さいものから出す
 */
function refillMp(game, pid, ctx) {
  const state = game.getState(null);
  // スキル（maxMp）で上限が人ごとに違うときは、その人の上限（getState の players[pid].maxMp）
  const maxMp = state.players[pid].maxMp ?? state.maxMp;
  if (!maxMp) return;
  const types = typesWithEffect(ctx, 'gainMp').sort((a, b) => ctx.cards[a].amount - ctx.cards[b].amount);
  if (!types.length) return;
  for (let i = 0; i < 6; i++) {
    const me = game.getState(pid).players[pid];
    if (me.mp > maxMp / 2) return;
    const room = maxMp - me.mp;
    const hand = me.hand.filter((c) => types.includes(c.type) && game.canPlayCard(c.cardId).ok && cpuAffordable(game, pid, c.cardId));
    // 入りきる最大のカード。なければ、いちばん小さいカード
    const fits = hand.filter((c) => ctx.cards[c.type].amount <= room).sort((a, b) => ctx.cards[b.type].amount - ctx.cards[a.type].amount);
    const card = fits[0] ?? hand.sort((a, b) => ctx.cards[a.type].amount - ctx.cards[b.type].amount)[0];
    if (!card || !cpuPlay(game, card.cardId).ok) return;
  }
}

/** どの戦い方も、ターンの最初に同点の選び方の乱数を入れる */
/**
 * マリガン（最初の手札の引き直し）で戻すカード。兵士が1枚もない手札なら全部、それ以外は戻さない（どの戦い方も同じ）。
 * 自分の手札しか見ない
 */
export function mulliganChoice(game, pid, ctx) {
  const me = game.getState(pid).players[pid];
  const hand = me.hand ?? [];
  if (!hand.some((c) => ctx.cards[c.type]?.kind === 'soldier')) return hand.map((c) => c.cardId);
  // スキル H01（戦略的準備）を持つときだけ：最初の手番で撃てない重い魔法（MPコスト > 今のMP）を、重い順に最大2枚戻す（先に引いてから混ぜる）。
  // 乱数は使わない（決定論的なフォールバック）。H01 がなければ従来どおり戻さない
  if (!(me.skills ?? []).includes('H01')) return [];
  const real = game.players?.[pid]?.hand ?? [];
  const costOf = (cardId) => {
    const card = real.find((c) => c.cardId === cardId);
    return card && typeof game.mpCostOf === 'function' ? game.mpCostOf(card) : 0;
  };
  return hand
    .filter((c) => ctx.cards[c.type]?.kind !== 'soldier' && costOf(c.cardId) > (me.mp ?? 0))
    .sort((a, b) => costOf(b.cardId) - costOf(a.cardId) || (a.cardId < b.cardId ? -1 : 1))
    .slice(0, 2)
    .map((c) => c.cardId);
}

export const STRATEGIES = Object.fromEntries(
  Object.entries(RAW_STRATEGIES).map(([name, st]) => [
    name,
    {
      ...st,
      takeTurn(game, pid, rng, ctx) {
        tieRng = rng;
        curCards = ctx.cards;
        curCtx = ctx;
        // スキルの任意アクション（クラシックでノードを取った人だけ。スキルがなければ何もせず、乱数も使わない）
        if (name !== 'pass') takeSkillActions(game, pid, 'pre');
        if (name !== 'pass') refillMp(game, pid, ctx);
        const r = st.takeTurn(game, pid, rng, ctx);
        if (name !== 'pass' && game.getState(null).phase === 'main') takeSkillActions(game, pid, 'post');
        return r;
      },
    },
  ]),
);

// ================= スキルツリー（クラシック）：試合の前に CPU が選ぶビルド =================

/**
 * 戦い方ごとの、おすすめのビルド（skilltree.json の presets のID。仕様 第10章の4ビルド）。
 * aggro は会心＋魔法＋幸運、rush は墓地＋兵士＋召喚、smart は属性＋魔力＋魔法、defensive・guard は血魔術＋回復＋防御、
 * random はランダム、pass は何も取らない
 */
export const SKILL_STYLE_OF = {
  random: 'random', aggro: 'critMagicLuck', rush: 'graveTroopsSummon', smart: 'elementManaMagic', defensive: 'bloodHealDefense', guard: 'bloodHealDefense', pass: 'none',
};

/**
 * ビルドを選ぶ（スキルツリーのデータだけを使う。Game は使わない）。
 * style："none"（何も取らない）／"random"（取れるノードを安定順に並べ、注入した rng で1つずつ選ぶ。ポイントがなくなるまで。
 *   奥義は1個まで・横断も含む）／presets のID（おすすめ）／戦い方の名前（SKILL_STYLE_OF）／"C01+C02"（取得順のIDを + でつなぐ）
 * @param {number} [budget] 使えるポイント（省略するとツリーの budget）
 * @returns {{ids: string[], config: object}} 正規化したビルド（normalizeBuild に合う）
 */
export function chooseSkillBuild(tree, rng, style = 'random', budget = tree.budget) {
  const s = SKILL_STYLE_OF[style] ?? style;
  const done = (ids, config = {}) => {
    const n = normalizeBuild(tree, { ids, config }, budget);
    if (!n.ok) throw new Error(`スキルのビルド "${style}" が決まりに合いません：${n.reason}`);
    return n.build;
  };
  if (s === 'none') return done([]);
  if (s === 'random') {
    const ids = [];
    for (;;) {
      const next = acquirableIds(tree, ids, budget);
      if (next.length === 0) return done(ids);
      ids.push(pick(next, rng));
    }
  }
  const preset = tree.presets?.[s];
  if (preset) return done([...preset.ids], preset.config ?? {});
  if (s.includes('+') || tree.nodes.some((n) => n.id === s)) return done(s.split('+'));
  throw new Error(`スキルのビルド "${style}" はありません（none / random / ${Object.keys(tree.presets ?? {}).join(' / ')}）`);
}

// ================= スキルツリー（クラシック）：CPU の任意アクションと手札の選択（段階D2） =================
//
// 方針（仕様 5.5・6章）：既存の戦い方（上の STRATEGIES）はそのまま。スキルの任意アクションは Game.listSkillActions の合法手だけを
// Game.skillAction で使う（画面・headless と同じ API・同じルール）。「見送る」が既定で、使っても明らかに損でないものだけを、
// 資源（城HP・MP）に余裕があるときだけ使う。乱数は使わない（選び方はすべて決定論的）ので、スキルのない試合の乱数・結果は変わらない。
// 勝率は測っていない（未検証）。

/** CPU が城HPを使ってよい下限（最大HPに対する割合）。支払ったあとも、これ以上残るときだけ HP置換・血魔術の支払をする */
export const CPU_SKILL_SAFE_HP_RATIO = 0.5;

const maxBy = (key) => (options) => options.reduce((best, o) => (key(o) > key(best) ? o : best), options[0]);
const mpRoom = (me) => (me.maxMp ?? Infinity) - (me.mp ?? 0);

/** 点数が最大の選択肢（最低点 min 以上のものだけ。なければ null＝このアクションは見送る）。同点は一覧の先頭（安定順） */
const bestBy = (score, min = -Infinity) => (options, env) => {
  let best = null;
  let bestScore = -Infinity;
  for (const o of options) {
    const sc = score(o, env);
    if (sc > bestScore) {
      best = o;
      bestScore = sc;
    }
  }
  return bestScore >= min ? best : null;
};

/**
 * 対象を選ぶための見取り図（毎回 getState から作る。乱数なし）。soldiers は盤面の兵士（自分・相手）の soldierId → 状態、
 * laneEnemies(roadId) はそのレーンの相手の兵士、L はレーンの長さ（ctx.rules.laneLength。なければ 5）
 */
function skillEnv(game, pid) {
  const state = game.getState(pid);
  const me = state.players[pid];
  const side = (id) => state.players[id].castleOwner ?? id;
  const foes = Object.keys(state.players).filter((id) => side(id) !== side(pid));
  const foeSoldiers = foes.flatMap((id) => state.players[id].soldiers.map((s) => ({ ...s, ownerId: id })));
  const soldiers = new Map([...me.soldiers, ...foeSoldiers].map((s) => [s.soldierId, s]));
  return {
    state, me, foeSoldiers, soldiers,
    L: curCtx?.rules?.laneLength ?? 5,
    laneEnemies: (roadId) => foeSoldiers.filter((s) => s.roadId === roadId),
    laneScore: (roadId) => foeSoldiers.filter((s) => s.roadId === roadId).length * 2 + (state.monsters.some((m) => m.roadId === roadId) ? 1 : 0),
  };
}
const toughness = (s) => (s.hp ?? 0) + (s.shield ?? 0);
/** カードの使いやすさ（高いほど欲しい）：MP で出せる兵士 3・出せる魔法など 2・今の MP で出せない／不明 0 */
const cardWorth = (type, mp) => {
  const d = curCards[type];
  return !d || (d.mpCost ?? 0) > mp ? 0 : d.kind === 'soldier' ? 3 : 2;
};
/** 回収・蘇生で戻したいカードの強さ（兵士は体力＋攻撃×2。魔法などは MP コスト。兵士のほうを優先） */
const cardPower = (type) => {
  const d = curCards[type];
  return !d ? 0 : d.kind === 'soldier' ? 10 + (d.hp ?? 0) + (d.attack ?? 0) * 2 : d.mpCost ?? 0;
};
const typeOfLabel = (o) => String(o.label ?? '').split('（')[0]; // G04・G06 の一覧は「種類（履歴ID）」
const handType = (me, cardId) => me.hand.find((c) => c.cardId === cardId)?.type;
/** レーンを移すときの点数の差（移した先 − 今のレーン。相手の兵士 1体＝2・魔物＝1。pickLane と同じ考え方） */
const laneGain = (o, env) => env.laneScore(o.args.roadId) - env.laneScore(env.soldiers.get(o.args.soldierId)?.roadId);

/**
 * CPU が使う任意アクション（actionId → { phase, when?, pick? }）。ここにないものは使わない（docs/skilltree-200-handoff.md の「CPU 未対応」）。
 *   phase "pre"：カードを出す前（ドロー・回収・MP回復）、"post"：出したあと（残った資源で召喚・シールド・追撃・移動）
 *   when(me, option)：資源の余裕の条件。pick(options, env)：対象・量の選び方（省略すると一覧の先頭＝安定順。null を返すとそのターンは見送る）
 */
export const CPU_SKILL_ACTIONS = {
  // ---- 先に（手札・MP を増やす）----
  P08: { phase: 'pre', pick: maxBy((o) => o.args.amount ?? 0) }, // 貯蔵MPを空きまで移す
  X04: { phase: 'pre' }, // 貯蔵MP2 → 1枚ドロー
  B06: { phase: 'pre', when: (me) => mpRoom(me) >= 1 }, // 血気3 → MP1
  P03: { phase: 'pre', when: (me) => mpRoom(me) >= 2 && (me.coins ?? 0) >= 2 }, // コイン1 → MP2（コインが2枚以上あるときだけ）
  H03: { phase: 'pre', pick: bestBy((o) => cardPower(o.preview?.type)) }, // 捨て札から1枚回収（試合中1回）：強い兵士を優先
  H04: { phase: 'pre' }, // 山札の最初の兵士を引く（試合中1回）
  H05: { phase: 'pre' }, // 山札の最初の魔法を引く（試合中1回）
  G04: { phase: 'pre', pick: bestBy((o) => cardPower(typeOfLabel(o))) }, // 墓地の兵士カードを手札へ（試合中1回）：強い兵士を優先
  T06: { phase: 'pre' }, // 次の自ターンに追加ドローを予約（試合中2回）
  I01: { phase: 'pre' }, // 相手の山札の先頭を見る（情報だけ）
  B02: { phase: 'pre', hp: true }, // 城HP3 → 1枚ドロー（城HPに余裕があるときだけ）
  // 運命操作：今の MP で出せない手札を、山札の上3枚のうち出せるカード（出せる兵士が最良）と交換（得点差2以上のときだけ）
  H08: {
    phase: 'pre',
    pick: bestBy((o, env) => {
      const mp = env.me.mp ?? 0;
      const mine = cardWorth(handType(env.me, o.args.handCardId), mp);
      return mine > 0 ? -Infinity : cardWorth(o.preview?.reveal?.[o.args.index], mp);
    }, 2),
  },
  // 再編成：手札が2枚以上で、今の MP より3以上重い魔法（兵士以外）があるとき、いちばん重いものを捨てて1枚引く
  H07: {
    phase: 'pre',
    pick: (options, env) => {
      if (env.me.hand.length < 2) return null;
      return bestBy((o) => {
        const d = curCards[o.preview?.type ?? handType(env.me, o.args.cardId)];
        return d && d.kind !== 'soldier' && (d.mpCost ?? 0) >= (env.me.mp ?? 0) + 3 ? d.mpCost : -Infinity;
      }, 0)(options, env);
    },
  },
  // ---- あとで（残った資源で）----
  // 送還：MP に空きがあるとき、体力が3分の1以下の（もうすぐ倒れる）トークンをMPに替える
  V05: { phase: 'post', when: (me) => mpRoom(me) >= 1, pick: bestBy((o, env) => { const s = env.soldiers.get(o.args.soldierId); return s && s.hp * 3 <= s.maxHp ? -s.hp / s.maxHp : -Infinity; }, -1) },
  // 生贄の儀式：城HPかMPが2以上回復できるとき、体力が3分の1以下で敵城に届かない兵士を生贄にする（死亡扱いにならない）
  X29: {
    phase: 'post',
    pick: (options, env) => {
      if (!(env.me.castleMaxHp - env.me.castleHp >= 2 || mpRoom(env.me) >= 2)) return null;
      return bestBy((o) => { const s = env.soldiers.get(o.args.soldierId); return s && s.hp * 3 <= s.maxHp && s.position < env.L - 1 ? -s.hp / s.maxHp : -Infinity; }, -1)(options, env);
    },
  },
  G06: { phase: 'post', pick: bestBy((o) => cardPower(typeOfLabel(o))) }, // 魂3で蘇生：強い兵士を優先
  I08: { phase: 'post', pick: bestBy((o, env) => { const s = env.soldiers.get(o.args.targetId); return s ? s.attack * 2 + s.maxHp : 0; }) }, // 敵兵士の弱体トークンを自陣に：強い敵の写し
  V07: { phase: 'post' }, // MP3で使い魔
  // 魔力装填：武器を持つ兵士のうち、次の通常攻撃で敵兵士を倒せる（+3込み）・敵がいるレーンの前の兵士を優先
  X43: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const s = env.soldiers.get(o.args.soldierId);
      if (!s) return 0;
      const foes = env.laneEnemies(s.roadId);
      const kill = foes.some((f) => toughness(f) <= s.attack + 3 && toughness(f) > s.attack);
      return (foes.length ? 5 : 0) + (kill ? 5 : 0) + s.position;
    }),
  },
  Q08: { phase: 'post' }, // SP10：攻撃力+3・シールド3
  Q06: { phase: 'post' }, // SP5：味方全員の攻撃力+1
  Q03: { phase: 'post' }, // SP3：シールド3
  Q05: { phase: 'post' }, // SP3：次の会心率+20pt
  // 守護の誓い：敵のいるレーンの、いちばん前の兵士（同じなら体力の少ない方）
  D07: { phase: 'post', pick: bestBy((o, env) => { const s = env.soldiers.get(o.args.soldierId); return s ? (env.laneEnemies(s.roadId).length ? 10 : 0) + s.position - s.hp / 100 : 0; }) },
  T04: { phase: 'post', pick: bestBy((o, env) => -(env.soldiers.get(o.args.soldierId)?.hp ?? 99)) }, // 持続ダメージの延期：体力がいちばん少ない兵士（倒れそうな順）
  // 疫病の即時精算：倒せる敵（即時ダメージ ≥ 体力＋シールド）を優先、なければいちばん前の敵
  S08: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const s = env.soldiers.get(o.args.soldierId);
      const dmg = typeof o.preview === 'object' && o.preview ? o.preview.damage ?? o.preview.amount ?? 0 : 0;
      return (s && dmg >= toughness(s) ? 100 : 0) + dmg + (s?.position ?? 0);
    }),
  },
  // 時の残響：倒せる敵（威力 ≥ 体力＋シールド）のうちいちばん前、倒せなければいちばん前で攻撃力の高い敵
  T08: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const s = env.soldiers.get(o.args.targetId);
      if (!s) return 0;
      const power = o.preview?.power ?? 0;
      return (power >= toughness(s) ? 100 : 0) + s.position * 2 + s.attack / 10;
    }),
  },
  // 血気の固定ダメージ：倒せる敵は、倒せるいちばん少ない量で（前の敵優先）。倒せないなら最大量でいちばん前の敵
  B07: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const s = env.soldiers.get(o.args.soldierId);
      const n = o.args.amount ?? 0;
      if (!s) return 0;
      return toughness(s) <= n ? 100 - n + s.position : n * 10 + s.position;
    }),
  },
  // 交代：敵のいるレーンの前後の近接兵士で、後ろの方が攻撃力が高く体力も下がらないとき、強い方を前に（差が2以上）
  K05: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const back = env.soldiers.get(o.args.backId);
      const front = env.soldiers.get(o.args.frontId);
      if (!back || !front || back.role !== 'melee' || front.role !== 'melee' || !env.laneEnemies(front.roadId).length) return -Infinity;
      if (back.attack < front.attack || toughness(back) < toughness(front)) return -Infinity;
      return (back.attack - front.attack) * 2 + (toughness(back) - toughness(front));
    }, 2),
  },
  // 戦術転換：敵のいないレーンにいる近接兵士（体力が半分以上）を、敵のいるレーンへ（点数差2以上）
  U06: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const s = env.soldiers.get(o.args.soldierId);
      if (!s || s.role !== 'melee' || s.hp * 2 < s.maxHp || env.laneEnemies(s.roadId).length) return -Infinity;
      return laneGain(o, env);
    }, 2),
  },
  K04: { phase: 'post', pick: bestBy((o, env) => laneGain(o, env)) }, // 隣のレーンへ移動＋シールド1：敵のいるレーンへ
  // 1マス進軍：敵のいないレーンで前にいる兵士を優先（敵がいるレーンは、倒せる相手がいるときだけ少し加点）
  K08: {
    phase: 'post',
    pick: bestBy((o, env) => {
      const s = env.soldiers.get(o.args.soldierId);
      if (!s) return 0;
      const foes = env.laneEnemies(s.roadId);
      if (!foes.length) return s.position + 1 >= env.L - 1 ? 20 + s.attack : s.position;
      return foes.some((f) => toughness(f) <= s.attack) ? s.position - 1 : -5 + s.position;
    }),
  },
  // 先読み：次の通常ドローの先頭2枚のうち、2枚目のほうが出しやすい（次ターンの最大MPで）ときだけ入れ替える
  X44: {
    phase: 'post',
    pick: (options, env) => {
      const top = options[0]?.preview?.top ?? [];
      const mp = env.me.maxMp ?? env.me.mp ?? 0;
      return top.length >= 2 && cardWorth(top[1], mp) > cardWorth(top[0], mp) ? options.find((o) => o.args.swap === true) ?? null : null;
    },
  },
};

/** CPU が城HPを n 使ってよいか（債務がなく、払ったあとも最大HPの CPU_SKILL_SAFE_HP_RATIO 以上残る） */
function cpuHpOk(game, pid, n) {
  const me = game.getState(pid).players[pid];
  if (!me.skillState || (me.skillState.debt ?? 0) > 0) return false;
  if (!(n > 0)) return true;
  return me.castleHp - n >= Math.ceil(me.castleMaxHp * CPU_SKILL_SAFE_HP_RATIO);
}

/**
 * スキルの任意アクションを使う（phase "pre" / "post"）。使った [{ actionId, args }] を返す。
 * 合法手は Game.listSkillActions、実行は Game.skillAction（原子的。失敗しても何も消費しない）
 * ctx を渡すと、そのカード表・ルール（レーンの長さ）で対象を評価する（takeTurn の中では設定済み。単体で呼ぶテスト用）
 */
export function takeSkillActions(game, pid, phase, ctx = null) {
  if (ctx) {
    curCards = ctx.cards ?? curCards;
    curCtx = ctx;
  }
  const used = [];
  for (let guard = 0; guard < 40; guard++) {
    const st = game.getState(null);
    if (st.phase !== 'main' || st.currentPlayer !== pid) break;
    const list = game.listSkillActions(pid);
    if (!list.length) break;
    const me = game.getState(pid).players[pid];
    let chosen = null;
    for (const [actionId, rule] of Object.entries(CPU_SKILL_ACTIONS)) {
      if (rule.phase !== phase || used.some((u) => u.actionId === actionId)) continue;
      const a = list.find((x) => x.actionId === actionId && x.ok);
      if (!a) continue;
      const options = a.options.filter((o) => (!rule.when || rule.when(me, o)) && (!(o.cost?.hp > 0) || (rule.hp && cpuHpOk(game, pid, o.cost.hp))));
      if (!options.length) continue;
      const o = rule.pick ? rule.pick(options, skillEnv(game, pid)) : options[0];
      if (!o) continue; // 対象を評価して「今は見送る」
      chosen = { actionId, args: o.args };
      break;
    }
    if (!chosen) break;
    const r = game.skillAction(pid, chosen.actionId, chosen.args);
    used.push({ ...chosen, ok: r.ok });
    if (r.ok && curCtx?.onDefense && game.getState(null).phase === 'defend') curCtx.onDefense(game);
  }
  return used;
}

/**
 * 手札のカードを使うときのスキルの選択（playCard の第3引数 skillOptions）。スキルのない人・ゲームは undefined（従来の呼び方のまま）。
 * - hpForMp（B01/B08 の HP置換）：MP だけで払えるなら 0（置換しない）。足りないときは不足分だけ、城HPに余裕があるときだけ（1＝不足分）
 * - bloodBlade（B03）・bloodEcho（X27）：城HPに余裕があるときだけ true
 * - diceChoice（L06）："high"（大きい方）
 * - deferHp（X35）は渡さない（本人の設定 X35.autoDefer に従う。既定 OFF）
 * X15 の選び方・E04/X25 の設定・H01 の戻すカードは別（setSkillPrefs・ビルドの config・mulliganChoice）
 */
export function cpuSkillOptions(game, pid, cardId) {
  const base = typeof game.previewSkillCost === 'function' ? game.previewSkillCost(cardId, { hpForMp: 0 }) : null;
  if (!base) return undefined;
  const skills = game.getState(pid).players[pid].skills ?? [];
  const opts = { hpForMp: 0, diceChoice: 'high' };
  let hp = 0;
  if (!base.ok) {
    const p = game.previewSkillCost(cardId, { hpForMp: 1 });
    if (p?.ok && cpuHpOk(game, pid, p.hp)) {
      opts.hpForMp = 1;
      hp = p.hp;
    }
  }
  if (skills.includes('B03') && cpuHpOk(game, pid, hp + 2)) {
    opts.bloodBlade = true;
    hp += 2;
  }
  if (skills.includes('X27') && cpuHpOk(game, pid, hp + 2)) opts.bloodEcho = true;
  return opts;
}

/** CPU がそのカードを出してよいか（HP置換が要るのに城HPに余裕がなければ出さない）。スキルがなければ常に true */
function cpuAffordable(game, pid, cardId) {
  const base = typeof game.previewSkillCost === 'function' ? game.previewSkillCost(cardId, { hpForMp: 0 }) : null;
  if (!base || base.ok) return true;
  const p = game.previewSkillCost(cardId, { hpForMp: 1 });
  return Boolean(p?.ok) && cpuHpOk(game, pid, p.hp);
}

/** CPU のカードの使用（スキルがあれば cpuSkillOptions を第3引数に。なければ従来どおり2引数） */
function cpuPlay(game, cardId, target) {
  const pid = game.getState(null).currentPlayer;
  const opts = cpuSkillOptions(game, pid, cardId);
  return opts === undefined ? game.playCard(cardId, target) : game.playCard(cardId, target, opts);
}
