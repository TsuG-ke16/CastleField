// 戦い方（シミュレーションと、ひとりで遊ぶモードの CPU が使う）。
// Game の公開メソッド（getState / canPlayCard / playCard / discard）だけを使う。DOM は使わない。
// CPU は自分の手札だけを見る（相手の手札は getState(自分) では null）。
// カードとルールの数値は、呼ぶ側から渡される ctx（{ cards, rules, upgrades, discardCount }）で読む。
// どの戦い方も「出せるカード」は canPlayCard で確かめるので、ルールが変わっても動く。
//   takeTurn(game, pid, rng, ctx)      … メインでカードを出す（出さなくてもよい）
//   chooseDiscard(game, pid, rng, ctx) … ctx.discardCount 枚の cardId を返す
//   react(game, pid, rng, ctx)         … 相手に攻撃されたとき（phase "reaction"）、防御に使う cardId の配列を返す（[] なら受ける）

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function view(game, pid) {
  const state = game.getState(pid);
  const me = state.players[pid];
  const enemies = Object.keys(state.players).filter((id) => id !== pid).map((id) => ({ id, ...state.players[id] }));
  const playable = me.hand.filter((c) => game.canPlayCard(c.cardId).ok);
  return { state, me, enemies, playable };
}


/** 対象を選んで出す。chooseTarget を省略すると最初の対象 */
function playWith(game, cardId, chooseTarget) {
  const targets = game.getTargets(cardId);
  if (targets.length === 0) return false;
  // 省略したら、いちばん城HPの割合が少ない相手（魔物は選ばない）
  const t = chooseTarget ? chooseTarget(targets) : weakest(game, targets);
  return t ? game.playCard(cardId, t).ok : false;
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
function playFirst(game, playable, typesInOrder) {
  for (const t of typesInOrder) {
    const c = playable.find((x) => x.type === t);
    if (c && playWith(game, c.cardId)) return true;
  }
  return false;
}

const ELEMENT_BEATS = { water: 'fire', fire: 'wood', wood: 'water' };

/**
 * メイン以外（付加・防御）のカードを、役に立つときに出す（ほどよく考える戦い方で使う）
 *   武器：まだ武器のない、いちばん前の兵士に。近くの相手の属性に強い属性を選ぶ
 *   盾：いちばん前の兵士に
 *   城壁：城HPが半分以下のときだけ（使い切りで、手札も1枚減るため）
 */
function playSupports(game, pid, ctx) {
  for (let guard = 0; guard < 20; guard++) {
    const { me, enemies, playable } = view(game, pid);
    const support = playable.filter((c) => ctx.cards[c.type].kind !== 'soldier' && ctx.cards[c.type].kind !== 'spell');
    if (support.length === 0) return;
    const front = [...me.soldiers].sort((a, b) => b.position - a.position);
    const enemySoldiers = enemies.flatMap((e) => e.soldiers);
    let played = false;
    for (const c of support) {
      const def = ctx.cards[c.type];
      if (def.kind === 'weapon') {
        const nearElements = new Set(enemySoldiers.map((s) => s.element).filter(Boolean));
        // 近くの相手の属性に負ける属性は避ける
        const bad = [...nearElements].some((e) => ELEMENT_BEATS[e] === def.element);
        const target = front.find((s) => !s.weapon);
        if (!bad && target) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === target.soldierId));
      } else if (def.effect === 'shieldSoldier') {
        if (front.length) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === front[0].soldierId));
      } else if (def.effect === 'armorCastle') {
        // 城壁は使い切りで手札も1枚減るので、城HPが半分以下のときだけ出す
        if (me.castleHp * 2 <= me.castleMaxHp) played = playWith(game, c.cardId);
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

const RAW_STRATEGIES = {
  /** 出せるカードからランダムに1枚 */
  random: {
    react: (game, pid, rng) => randomReact(game, pid, rng),
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
    chooseDiscard: randomDiscard,
  },

  /** 攻撃だけ：城を直接たたく魔法 → 兵士 */
  aggro: {
    takeTurn(game, pid, rng, ctx) {
      const { playable } = view(game, pid);
      playFirst(game, playable, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
    },
    chooseDiscard: randomDiscard,
  },

  /** ほどよく考える */
  smart: {
    react: (game, pid, rng, ctx) => smartReact(game, pid, ctx),
    takeTurn(game, pid, rng, ctx) {
      buyUpgrades(game, pid, ctx);
      smartTurn(game, pid, ctx);
      playSupports(game, pid, ctx);
    },
    chooseDiscard: randomDiscard,
  },

  /** 守り優先：回復 → 兵士への魔法 → 兵士 → 城への魔法 */
  defensive: {
    react: (game, pid) => defensiveReact(game, pid),
    takeTurn(game, pid, rng, ctx) {
      const { playable } = view(game, pid);
      playSupports(game, pid, ctx);
      const after = view(game, pid).playable;
      playFirst(game, after, [
        ...typesWithEffect(ctx, 'healOwnCastle'),
        ...typesWithEffect(ctx, 'damageEnemySoldiers'),
        ...soldierTypes(ctx),
        ...typesWithEffect(ctx, 'damageEnemyCastle'),
      ]);
    },
    chooseDiscard: randomDiscard,
  },

  /** 攻め重視：城への魔法 → 兵士。回復はしない。武器・盾・強化は使う（aggro は付加・防御・強化を使わない素朴な型） */
  rush: {
    takeTurn(game, pid, rng, ctx) {
      buyUpgrades(game, pid, ctx);
      const { playable } = view(game, pid);
      playFirst(game, playable, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
      playSupports(game, pid, ctx);
    },
    chooseDiscard: randomDiscard,
  },

  /** 何も出さない */
  pass: {
    takeTurn() {},
    chooseDiscard: randomDiscard,
  },

  /** 兵士で守る：相手の兵士が自分の城から2マス以内に来たら兵士を出す。それ以外は smart */
  guard: {
    react: (game, pid, rng, ctx) => smartReact(game, pid, ctx),
    takeTurn(game, pid, rng, ctx) {
      const { playable, enemies } = view(game, pid);
      const L = ctx.rules.laneLength;
      const near = enemies.some((e) => e.soldiers.some((s) => s.position >= L - 3));
      buyUpgrades(game, pid, ctx);
      if (!(near && playFirst(game, playable, soldierTypes(ctx)))) smartTurn(game, pid, ctx);
      playSupports(game, pid, ctx);
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
      ...by('drawCards'),
    ];
    const id = order.find((u) => game.canBuyUpgrade(u).ok);
    if (!id) return;
    game.buyUpgrade(id);
  }
}

function smartTurn(game, pid, ctx) {
  const { me, enemies, playable } = view(game, pid);
  const enemy = enemies[0];
  const castleSpells = typesWithEffect(ctx, 'damageEnemyCastle');
  // 自分の道の、ごほうびの多い魔物（5コイン以上）にとどめを刺せるなら、魔物を狙う
  // （ファイアボールは城を削るいちばんの手段なので、小さな魔物には使わない）
  for (const c of playable.filter((x) => castleSpells.includes(x.type))) {
    const ms = game.getTargets(c.cardId).filter((t) => t.monsterId);
    const st = game.getState(pid);
    const kill = ms.find((t) => {
      const m = st.monsters.find((x) => x.monsterId === t.monsterId);
      return m.hp <= ctx.cards[c.type].amount && m.reward >= 5;
    });
    if (kill && game.playCard(c.cardId, kill).ok) return;
  }
  // とどめになるなら城への魔法
  for (const t of castleSpells) {
    if (enemy && ctx.cards[t].amount >= enemy.castleHp && playFirst(game, playable, [t])) return;
  }
  if (me.castleHp < me.castleMaxHp / 2 && playFirst(game, playable, typesWithEffect(ctx, 'healOwnCastle'))) return;
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'damageEnemySoldiers'))) return;
  // 次の進軍で城に着きそうな相手の兵士がいれば、凍結で止める
  const L = ctx.rules.laneLength;
  const threat = enemy && enemy.soldiers.some((s) => s.position + ctx.cards[s.type].speed >= L);
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'freezeEnemySoldiers'))) return;
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'poisonEnemySoldiers'))) return;
  playFirst(game, playable, [
    ...soldierTypes(ctx),
    ...castleSpells,
    ...typesWithEffect(ctx, 'damageEnemySoldiers'),
    ...typesWithEffect(ctx, 'healOwnCastle'),
  ]);
}

// ---------- 防御（リアクション） ----------

/** 今の攻撃に使える防御カード */
function reactOptions(game, pid) {
  const me = game.getState(pid).players[pid];
  return me.hand.filter((c) => game.canReact(c.cardId).ok);
}

/** 使えるカードから、使える組み合わせ（0〜2枚）をすべて作って、見積もりをつける */
function reactCombos(game, options, max) {
  const combos = [[]];
  for (let i = 0; i < options.length; i++) {
    combos.push([options[i]]);
    if (max >= 2) for (let j = i + 1; j < options.length; j++) combos.push([options[i], options[j]]);
  }
  return combos
    .map((cards) => ({ cards, pv: game.previewReaction(cards.map((c) => c.cardId)) }))
    .filter((c) => c.pv.ok);
}

/**
 * ほどよく考える防御：
 *   防いだダメージ ＋ 反撃のダメージ × 0.8 から、カードを使う代わりを引く（手札が多いときは安く、少ないときは高く）。
 *   城が落ちそうなら、生き残る組み合わせをいちばん優先する。相手の城を落とせる反撃は大きく評価する
 */
function smartReact(game, pid) {
  return analyzeReact(game, pid).best.cards.map((c) => c.cardId);
}

/**
 * 防御の選び方を採点する（smartReact の中身。シミュレーションが「迷う場面だったか」を数えるためにも使う）
 * @returns {{ best: {score: number, cards: object[]}, plans: {score: number, cards: object[]}[], lethal: boolean }}
 *   plans：「使わない」を含む、すべての組み合わせの点数（高い順）。lethal：防御しないと城が落ちる場面
 */
export function analyzeReact(game, pid) {
  const st = game.getState(pid);
  const info = st.reaction;
  const me = st.players[pid];
  const enemy = st.players[info.attackerId];
  const options = reactOptions(game, pid);
  const combos = reactCombos(game, options, info.maxCards);
  const armor = info.armor ?? 0;
  const effective = (damage) => Math.max(0, damage - armor);
  const none = combos.find((c) => c.cards.length === 0);
  const hit = effective(none.pv.damage);
  const lethal = me.castleHp - hit <= 0;
  // カードを使うことの重み：城に余裕があるうちは大きく（温存する）、城が危なくなるほど小さく（使う）。
  // 手札があふれそうなときも小さくなる
  const ratio = me.castleHp / me.castleMaxHp;
  let cost = ratio > 0.6 ? 5 : ratio > 0.35 ? 3.5 : 1.5;
  if (me.handCount >= 8) cost -= 1.5;
  const plans = combos.map(({ cards, pv }) => {
    if (cards.length === 0) return { score: 0, cards };
    const dealt = effective(pv.damage);
    const prevented = hit - dealt;
    const survive = me.castleHp - dealt > 0;
    const kills = pv.counterDamage > 0 && enemy.castleHp - pv.counterDamage <= 0;
    const score = prevented + pv.counterDamage * 0.8 + (kills ? 20 : 0) + (lethal && survive ? 30 : 0) - cards.length * cost;
    return { score, cards };
  }).sort((x, y) => y.score - x.score);
  // 城壁が全部受けてくれるなら、何も使わない
  const best = hit === 0 ? plans.find((p) => p.cards.length === 0) : plans[0];
  return { best, plans, lethal };
}

/** 守り優先の防御：3ダメージ以上防げるなら、いちばん防げる組み合わせを使う */
function defensiveReact(game, pid) {
  const info = game.getState(pid).reaction;
  const armor = info.armor ?? 0;
  const combos = reactCombos(game, reactOptions(game, pid), info.maxCards);
  let best = { prevented: 2, cards: [] };
  const base = Math.max(0, info.damage - armor);
  for (const { cards, pv } of combos) {
    const prevented = base - Math.max(0, pv.damage - armor);
    // 同じくらい防げるなら、少ない枚数で
    if (prevented > best.prevented || (prevented === best.prevented && cards.length > 0 && cards.length < best.cards.length)) {
      best = { prevented, cards };
    }
  }
  return best.cards.map((c) => c.cardId);
}

/** ランダムに防御：使えるカードがあれば、半分の確率で1枚使う */
function randomReact(game, pid, rng) {
  const options = reactOptions(game, pid);
  return options.length && rng() < 0.5 ? [pick(options, rng).cardId] : [];
}

/** どの戦い方も、ターンの最初に同点の選び方の乱数を入れる */
export const STRATEGIES = Object.fromEntries(
  Object.entries(RAW_STRATEGIES).map(([name, st]) => [
    name,
    {
      ...st,
      react: st.react ?? (() => []), // 防御しない戦い方（aggro・rush・pass）
      takeTurn(game, pid, rng, ctx) {
        tieRng = rng;
        return st.takeTurn(game, pid, rng, ctx);
      },
    },
  ]),
);
