// 戦い方（シミュレーションと、ひとりで遊ぶモードの CPU が使う）。
// Game の公開メソッド（getState / canPlayCard / playCard / discard）だけを使う。DOM は使わない。
// CPU は自分の手札だけを見る（相手の手札は getState(自分) では null）。
// カードとルールの数値は、呼ぶ側から渡される ctx（{ cards, rules, upgrades, discardCount }）で読む。
// どの戦い方も「出せるカード」は canPlayCard で確かめるので、ルールが変わっても動く。
//   takeTurn(game, pid, rng, ctx)      … メインでカードを出す（出さなくてもよい）
//   chooseDiscard(game, pid, rng, ctx) … ctx.discardCount 枚の cardId を返す

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function view(game, pid) {
  const state = game.getState(pid);
  const me = state.players[pid];
  // チーム戦では、同じ城（castleOwner）の味方は相手に数えない
  const sideOf = (id) => state.players[id].castleOwner ?? id;
  const enemies = Object.keys(state.players).filter((id) => sideOf(id) !== sideOf(pid)).map((id) => ({ id, ...state.players[id] }));
  const playable = me.hand.filter((c) => game.canPlayCard(c.cardId).ok);
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
  const res = game.playCard(cardId, t);
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
    if (kill && game.playCard(c.cardId, kill).ok) return true;
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
  const threat = enemy && enemy.soldiers.some((s) => s.position + ctx.cards[s.type].speed >= L);
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'freezeEnemySoldiers'))) return true;
  // 魔族の氷の息：脅威がなくても、敵の兵士が自分の城の手前2マス以内まで来ていれば、凍結で進軍を1回止める
  const closeIn = enemy && enemy.soldiers.some((s) => s.position >= L - 2);
  if (closeIn && playFirst(game, playable, demonTypes(ctx, 'freezeEnemySoldiers'))) return true;
  // 凍結がなければ、突風で押し戻す
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'pushBackEnemySoldiers'))) return true;
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'poisonEnemySoldiers'))) return true;
  // 魔族の毒の霧：1体でも、HPが高く（4以上）まだ進軍で城に届かない兵士がいれば、毒を入れる（長く効く）
  const lasting = enemy && enemy.soldiers.some((s) => s.hp + s.shield >= 4 && s.position + ctx.cards[s.type].speed < L);
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
    ...(lasting ? demonTypes(ctx, 'poisonEnemySoldiers') : []),
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
  const maxMp = game.getState(null).maxMp;
  if (!maxMp) return;
  const types = typesWithEffect(ctx, 'gainMp').sort((a, b) => ctx.cards[a].amount - ctx.cards[b].amount);
  if (!types.length) return;
  for (let i = 0; i < 6; i++) {
    const me = game.getState(pid).players[pid];
    if (me.mp > maxMp / 2) return;
    const room = maxMp - me.mp;
    const hand = me.hand.filter((c) => types.includes(c.type) && game.canPlayCard(c.cardId).ok);
    // 入りきる最大のカード。なければ、いちばん小さいカード
    const fits = hand.filter((c) => ctx.cards[c.type].amount <= room).sort((a, b) => ctx.cards[b.type].amount - ctx.cards[a.type].amount);
    const card = fits[0] ?? hand.sort((a, b) => ctx.cards[a.type].amount - ctx.cards[b.type].amount)[0];
    if (!card || !game.playCard(card.cardId).ok) return;
  }
}

/** どの戦い方も、ターンの最初に同点の選び方の乱数を入れる */
/**
 * マリガン（最初の手札の引き直し）で戻すカード。兵士が1枚もない手札なら全部、それ以外は戻さない（どの戦い方も同じ）。
 * 自分の手札しか見ない
 */
export function mulliganChoice(game, pid, ctx) {
  const hand = game.getState(pid).players[pid].hand ?? [];
  return hand.some((c) => ctx.cards[c.type]?.kind === 'soldier') ? [] : hand.map((c) => c.cardId);
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
        if (name !== 'pass') refillMp(game, pid, ctx);
        return st.takeTurn(game, pid, rng, ctx);
      },
    },
  ]),
);
