// バランス確認用のシミュレーション。Game を画面なしで最後まで動かし、数字を集める。
// 乱数はすべてシード付きなので、同じ引数なら誰が回しても同じ結果になる。
import { Game, EVENT_TYPES } from '../../js/game/Game.js';
import { seededRng } from '../helpers.js';
import { STRATEGIES, mulliganChoice, chooseSkillBuild } from './strategies.js';
import { observe as qaObserve } from '../../js/game/skills/qa.js';

/**
 * 1試合を回す。
 * @param {object} o
 * @param {object} o.cards  cards.json の中身
 * @param {object} o.rules  rules.json の中身
 * @param {string[]} o.strategies 席順（p1, p2, ...）ごとの戦い方の名前
 * @param {number} o.seed
 * @param {number} [o.maxTurns] これを超えたら「決着しない」とする（通算ターン数）
 * @param {object} [o.gameOptions] new Game() に追加で渡すもの
 * @param {string[]} [o.skills] 席ごとのスキルのビルドの選び方（chooseSkillBuild の style：none / random / プリセットのID / 戦い方の名前）。
 *   gameOptions.skillTree があるときだけ使う。省略するとスキルなし（今までと同じ）
 * @param {boolean} [o.tempo] true なら、席ごとのテンポの数字（stats.tempo。下の newTempo）も集める（段階A1。読むだけで乱数は使わない）
 */
export function runMatch({ cards, rules, strategies, seed, maxTurns = 3000, gameOptions = {}, skills = null, tempo = false }) {
  if (skills && gameOptions.skillTree) {
    // ビルドの乱数は試合の乱数と別にする（スキルを選んでも山札の並びは同じシードで同じ）
    const buildRng = seededRng(seed ^ 0x5bd1e995);
    gameOptions = { ...gameOptions, setup: { ...(gameOptions.setup ?? {}), skills: skills.map((style) => chooseSkillBuild(gameOptions.skillTree, buildRng, style)) } };
  }
  const game = new Game({ cards, rules, rng: seededRng(seed), ...gameOptions });
  const playerCount = game.getState(null).playerOrder.length;
  if (strategies.length !== playerCount) throw new Error(`戦い方は人数ぶん（${playerCount}個）必要です`);
  const aiRng = seededRng(seed ^ 0x9e3779b9);
  const stats = {
    winner: null,
    turns: 0,
    castleDamage: { soldier: 0, spell: 0, other: 0 },
    monstersDefeated: 0,
    monsterCastleDamage: 0,
    endedByMonster: false, // 魔物に城を落とされて決着したか
    spellDamageByType: {},
    clashes: 0,
    discardTurns: 0,
    choiceTurns: 0, // 出せるカードが2種類以上あったターン（「迷う場面」そのものではない。目安）
    mainTurns: 0,
    played: {},
    raised: 0, // 死者を従える（魔族のパッシブ）で骸骨兵が生まれた回数
    raisedCastleDamage: 0, // 骸骨兵が敵の城に与えたダメージ（城壁が受けたぶんは除く）
    reactions: {}, // 属性の反応（reactionTriggered）の回数。反応のID → 回数
    // 4陣営（試作）：城の付着と反応。castleReactions は城に起きた反応のID → 回数、castleReactionDamage は城に起きた反応で城HPに入ったダメージ、
    // castleHpDamage は城HPに入ったダメージの合計（城壁が受けたぶん・自分で払ったコストは含まない）。firstReactionBy / firstCastleReactionBy は最初の反応を起こした人（2人のとき。当たった側の相手）
    castleReactions: {},
    castleReactionDamage: 0,
    castleHpDamage: 0,
    firstReactionBy: null,
    firstCastleReactionBy: null,
    errors: 0,
    events: {},
  };
  const order = game.getState(null).playerOrder;
  // テンポの数字（tempo: true のときだけ）。turnPid は今メインの手番の人（その人のターンの中で起きたことだけ数える）
  let turnPid = null;
  let turnKinds = null;
  if (tempo) stats.tempo = Object.fromEntries(order.map((pid) => [pid, newTempo()]));
  const otherOf = (pid) => (order.length === 2 ? order.find((x) => x !== pid) : null);
  let castleReactionPending = false;
  const raisedIds = new Set();
  for (const type of EVENT_TYPES) {
    game.on(type, (e) => {
      if (type === 'soldierDeployed' && e.raised) {
        stats.raised += 1;
        raisedIds.add(e.soldierId);
      }
      if (type === 'castleDamaged' && e.source?.kind === 'soldier' && raisedIds.has(e.source.soldierId)) stats.raisedCastleDamage += e.amount - (e.blocked ?? 0);
      stats.events[type] = (stats.events[type] || 0) + 1;
      if (tempo) tempoEvent(stats.tempo, type, e, turnPid, turnKinds, cards);
      if (type === 'castleReactionTriggered') {
        stats.castleReactions[e.reaction] = (stats.castleReactions[e.reaction] || 0) + 1;
        stats.firstReactionBy ??= otherOf(e.playerId);
        stats.firstCastleReactionBy ??= otherOf(e.playerId);
        castleReactionPending = e.damage > 0;
      }
      if (type === 'reactionTriggered') stats.firstReactionBy ??= otherOf(e.playerId);
      if (type === 'castleDamaged') {
        const hpLoss = e.amount - (e.blocked ?? 0);
        if (!['self', 'sacrifice'].includes(e.source?.kind)) stats.castleHpDamage += hpLoss;
        if (castleReactionPending && e.source?.kind === 'reaction') {
          stats.castleReactionDamage += hpLoss;
          castleReactionPending = false;
        }
      }
      if (type === 'castleDamaged') {
        const kind = e.source?.kind ?? 'other';
        const key = kind in stats.castleDamage ? kind : 'other';
        stats.castleDamage[key] += e.amount - (e.blocked ?? 0);
        if (kind === 'spell') stats.spellDamageByType[e.source.type] = (stats.spellDamageByType[e.source.type] || 0) + e.amount - (e.blocked ?? 0);
      }
      if (type === 'soldiersClashed') stats.clashes += 1;
      if (type === 'monsterDefeated') stats.monstersDefeated += 1;
      if (type === 'gameOver') stats.reason = e.reason ?? null;
      if (type === 'monsterAttackedCastle') {
        stats.monsterCastleDamage += e.amount;
        if (e.hp <= 0) stats.endedByMonster = true;
      }
      if (type === 'reactionTriggered') stats.reactions[e.reaction] = (stats.reactions[e.reaction] || 0) + 1;
      if (type === 'cardPlayed') stats.played[e.type] = (stats.played[e.type] || 0) + 1;
    });
  }
  const players = strategies.map((name) => {
    const s = STRATEGIES[name];
    if (!s) throw new Error(`戦い方 "${name}" はありません。${Object.keys(STRATEGIES).join(', ')}`);
    return s;
  });
  const strategyOf = (pid) => players[Number(pid.slice(1)) - 1];
  const ctx = { cards, rules, discardCount: 0, upgrades: gameOptions.upgrades || {} };
  game.on('discardRequired', (e) => { ctx.discardCount = e.count; });
  // 攻撃を受けた人の防御：その人の戦い方が返事をする
  const settleDefense = () => {
    for (let i = 0; i < 50 && game.getState(null).phase === 'defend'; i++) {
      const defender = game.getState(null).defense.defenderId;
      strategyOf(defender).respond(game, defender, aiRng, ctx);
    }
  };
  ctx.onDefense = settleDefense;

  game.start();
  // マリガン：全員が選ぶ（席順に）
  for (const pid of game.getState(null).mulligan?.pending ?? []) {
    const r = game.mulligan(pid, mulliganChoice(game, pid, ctx));
    if (!r.ok) throw new Error(`mulligan が失敗: ${r.reason}`);
  }
  let guard = 0;
  for (;;) {
    const now = game.getState(null);
    if (now.phase === 'gameOver' || now.turn > maxTurns) break;
    if (++guard > maxTurns * 20) throw new Error('シミュレーションが進まなくなりました');
    if (now.phase === 'defend') {
      settleDefense();
      continue;
    }
    const pid = now.currentPlayer;
    const strat = strategyOf(pid);
    if (now.phase === 'discard') {
      stats.discardTurns += 1;
      const r = game.discard(strat.chooseDiscard(game, pid, aiRng, ctx));
      if (!r.ok) throw new Error(`discard が失敗: ${r.reason}`);
      continue;
    }
    stats.mainTurns += 1;
    const playable = new Set(
      game.getState(pid).players[pid].hand.filter((c) => game.canPlayCard(c.cardId).ok).map((c) => c.type),
    );
    if (playable.size >= 2) stats.choiceTurns += 1;
    if (tempo) {
      turnPid = pid;
      turnKinds = new Set();
    }
    strat.takeTurn(game, pid, aiRng, ctx);
    if (tempo) {
      tempoTurnEnd(game, stats.tempo[pid], pid, turnKinds);
      turnPid = null;
    }
    if (game.getState(null).phase === 'gameOver') break;
    const r = game.endTurn();
    if (!r.ok) throw new Error(`endTurn が失敗: ${r.reason}`);
  }
  stats.finalState = game.getState(null);
  stats.winner = stats.finalState.winner;
  stats.turns = stats.finalState.turn;
  return stats;
}

// ================= テンポの数字（段階A1。tempo: true のときだけ集める） =================
// どれも「その人のメインのターン」単位。乱数は使わず、Game の読むだけのメソッドとイベントだけを使う。
// コイン・MP の増減は QA 契約（js/game/skills/qa.js の observe("coinsChanged" / "mpChanged")）の metric をそのまま足す。

/** 1人ぶんの入れ物 */
export function newTempo() {
  return {
    turns: 0, // メインのターンの数
    cards: 0, // 自分のターンに手札から出したカードの枚数（防御・スキルの無料の発動は数えない）
    attackSpells: 0, // そのうち攻撃の魔法（slot "main"）
    maxAttackSpellsInTurn: 0,
    mpEndRatio: 0, // ターン終了時の MP ÷ 上限 の合計
    mpHighEnd: 0, // ターン終了時に MP が上限の50%以上残っていたターン
    mpFullEnd: 0, // ターン終了時に MP が上限だったターン
    mpShort: 0, // ターン終了時に「MP だけが足りなくて出せない」カードが手札にあったターン
    combo: 0, // 同じターンに 兵士・武器・魔法・属性反応 のうち2種類以上
    coinsGained: 0,
    coinsSpent: 0,
    coinsByReason: {},
    monsterKills: 0,
    mpGained: 0,
    mpSpent: 0,
  };
}

function tempoEvent(t, type, e, turnPid, turnKinds, cards) {
  if (type === 'coinsChanged' || type === 'mpChanged') {
    for (const m of qaObserve(type, e) ?? []) {
      const s = t[m.playerId];
      if (!s || !m.value) continue;
      const key = m.metric === 'coins' ? 'coins' : 'mp';
      if (m.value > 0) s[`${key}Gained`] += m.value;
      else s[`${key}Spent`] -= m.value;
      if (key === 'coins') s.coinsByReason[m.reason ?? 'other'] = (s.coinsByReason[m.reason ?? 'other'] || 0) + m.value;
    }
    return;
  }
  if (type === 'monsterDefeated' && t[e.playerId]) t[e.playerId].monsterKills += 1;
  if (!turnPid) return;
  if (type === 'cardPlayed' && e.playerId === turnPid && !e.free) {
    const def = cards[e.type];
    t[turnPid].cards += 1;
    if (def?.kind) turnKinds.add(def.kind === 'defense' ? 'defense' : def.kind);
    if (def?.kind === 'spell') turnKinds.attack = (turnKinds.attack ?? 0) + 1;
  }
  if (type === 'reactionTriggered') turnKinds.add('reaction');
}

function tempoTurnEnd(game, s, pid, kinds) {
  s.turns += 1;
  const me = game.getState(null).players[pid];
  const maxMp = me.maxMp ?? game.getState(null).maxMp ?? 0;
  if (maxMp > 0) {
    s.mpEndRatio += me.mp / maxMp;
    if (me.mp * 2 >= maxMp) s.mpHighEnd += 1;
    if (me.mp >= maxMp) s.mpFullEnd += 1;
  }
  const spells = kinds.attack ?? 0;
  s.attackSpells += spells;
  s.maxAttackSpellsInTurn = Math.max(s.maxAttackSpellsInTurn, spells);
  if (['soldier', 'weapon', 'spell', 'reaction'].filter((k) => kinds.has(k)).length >= 2) s.combo += 1;
  // MP 不足：対象はあるのに、MP だけが足りなくて出せないカード（ゲームが終わっていれば数えない）
  if (game.phase === 'main' && game.currentPlayer === pid) {
    const player = game.players[pid];
    const short = player.hand.some((c) => {
      const r = game.canPlayCard(c.cardId);
      return !r.ok && String(r.reason).startsWith('MPが足りません') && game.listTargets(player, c).targets.length > 0;
    });
    if (short) s.mpShort += 1;
  }
}

/** 席 pid（または pid を返す関数）のテンポの数字を、試合をまたいでまとめる */
export function summarizeTempo(results, seatOf) {
  const acc = newTempo();
  let games = 0;
  for (const r of results) {
    const pid = typeof seatOf === 'function' ? seatOf(r) : seatOf;
    const t = r.tempo?.[pid];
    if (!t) continue;
    games += 1;
    for (const [k, v] of Object.entries(t)) {
      if (k === 'coinsByReason') for (const [rk, rv] of Object.entries(v)) acc.coinsByReason[rk] = (acc.coinsByReason[rk] || 0) + rv;
      else if (k === 'maxAttackSpellsInTurn') acc[k] = Math.max(acc[k], v);
      else acc[k] += v;
    }
  }
  const per = (x) => x / (acc.turns || 1);
  return {
    games,
    cardsPerTurn: per(acc.cards),
    attackSpellsPerTurn: per(acc.attackSpells),
    maxAttackSpellsInTurn: acc.maxAttackSpellsInTurn,
    mpEndRatio: per(acc.mpEndRatio),
    mpHighEndRate: per(acc.mpHighEnd),
    mpFullEndRate: per(acc.mpFullEnd),
    mpShortRate: per(acc.mpShort),
    comboRate: per(acc.combo),
    coinsGainedPerGame: acc.coinsGained / (games || 1),
    coinsSpentPerGame: acc.coinsSpent / (games || 1),
    coinsByReasonPerGame: Object.fromEntries(Object.entries(acc.coinsByReason).map(([k, v]) => [k, v / (games || 1)])),
    monsterKillsPerGame: acc.monsterKills / (games || 1),
    turnsPerGame: acc.turns / (games || 1),
  };
}

/** 何試合も回してまとめる */
export function runMany({ games, seed = 1, ...rest }) {
  const results = [];
  for (let i = 0; i < games; i++) results.push(runMatch({ ...rest, seed: seed * 100003 + i }));
  const out = summarize(results, rest.strategies);
  // tempo: true のときだけ、席ごとのテンポの数字（JSON の形は tempo なしなら今までと同じ）
  if (rest.tempo) out.tempo = Object.fromEntries(results[0].finalState.playerOrder.map((pid) => [pid, summarizeTempo(results, pid)]));
  return out;
}

export function summarize(results, strategies) {
  const decided = results.filter((r) => r.winner);
  const turns = decided.map((r) => r.turns).sort((a, b) => a - b);
  const wins = {};
  for (const r of decided) wins[r.winner] = (wins[r.winner] || 0) + 1;
  const dmg = { soldier: 0, spell: 0, other: 0 };
  const spellBy = {};
  for (const r of results) {
    for (const k of Object.keys(dmg)) dmg[k] += r.castleDamage[k];
    for (const [k, v] of Object.entries(r.spellDamageByType)) spellBy[k] = (spellBy[k] || 0) + v;
  }
  const totalDmg = dmg.soldier + dmg.spell + dmg.other || 1;
  const sum = (f) => results.reduce((a, r) => a + f(r), 0);
  // 属性の反応（クラシック）。反応が1回も起きていない（通常モード）ときはキーごと出さない
  const reactionTotals = {};
  for (const r of results) for (const [k, v] of Object.entries(r.reactions)) reactionTotals[k] = (reactionTotals[k] || 0) + v;
  const reactionTotal = Object.values(reactionTotals).reduce((a, b) => a + b, 0);
  return {
    ...(reactionTotal > 0
      ? {
          reactionsPerGame: reactionTotal / results.length,
          reactionCounts: reactionTotals,
          reactionGameRate: results.filter((r) => Object.keys(r.reactions).length > 0).length / results.length,
        }
      : {}),
    strategies,
    games: results.length,
    decided: decided.length,
    avgTurns: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null,
    medianTurns: turns.length ? turns[Math.floor(turns.length / 2)] : null,
    maxTurns: turns.length ? turns.at(-1) : null,
    // p1 勝率の誤差の目安（±2σ）。1000試合で約 ±3%
    p1Margin: decided.length ? 2 * Math.sqrt(0.25 / decided.length) : null,
    winRate: Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, v / (decided.length || 1)])),
    soldierDamageShare: dmg.soldier / totalDmg,
    spellDamageByType: Object.fromEntries(Object.entries(spellBy).map(([k, v]) => [k, v / totalDmg])),
    clashesPerGame: sum((r) => r.clashes) / results.length,
    avgRounds: results.reduce((a, r) => a + r.finalState.round, 0) / results.length,
    roundLimitRate: results.filter((r) => r.reason === 'roundLimit').length / results.length,
    monstersDefeatedPerGame: sum((r) => r.monstersDefeated) / results.length,
    monsterCastleDamagePerGame: sum((r) => r.monsterCastleDamage) / results.length,
    endedByMonsterRate: decided.filter((r) => r.endedByMonster).length / (decided.length || 1),
    discardRate: sum((r) => r.discardTurns) / (sum((r) => r.mainTurns) || 1),
    choiceRate: sum((r) => r.choiceTurns) / (sum((r) => r.mainTurns) || 1),
    playedPerGame: Object.fromEntries(
      Object.entries(
        results.reduce((acc, r) => {
          for (const [k, v] of Object.entries(r.played)) acc[k] = (acc[k] || 0) + v;
          return acc;
        }, {}),
      ).map(([k, v]) => [k, v / results.length]),
    ),
  };
}
