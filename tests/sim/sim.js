// バランス確認用のシミュレーション。Game を画面なしで最後まで動かし、数字を集める。
// 乱数はすべてシード付きなので、同じ引数なら誰が回しても同じ結果になる。
import { Game, EVENT_TYPES } from '../../js/game/Game.js';
import { seededRng } from '../helpers.js';
import { STRATEGIES } from './strategies.js';
import { analyzeReact } from '../../js/game/strategies.js';

/**
 * 1試合を回す。
 * @param {object} o
 * @param {object} o.cards  cards.json の中身
 * @param {object} o.rules  rules.json の中身
 * @param {string[]} o.strategies 席順（p1, p2, ...）ごとの戦い方の名前
 * @param {number} o.seed
 * @param {number} [o.maxTurns] これを超えたら「決着しない」とする（通算ターン数）
 * @param {object} [o.gameOptions] new Game() に追加で渡すもの
 */
export function runMatch({ cards, rules, strategies, seed, maxTurns = 3000, gameOptions = {} }) {
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
    errors: 0,
    events: {},
    reactionWindows: 0, // 防御の場面が開いた回数
    reactionsUsed: 0, // 防御カードを使った回数（場面ごとに1回と数える）
    reactionCards: {}, // 防御カードの種類ごとの使用枚数
    intercepts: 0, // 迎撃で兵士を倒した回数
    counterDamage: 0,
    reducedDamage: 0, // 防御で減らしたダメージの合計
    attackDamageSeen: 0, // 防御の場面の攻撃ダメージの合計
    // 「迷う場面」の目安（採点が近い選び方が2つ以上ある場面）。人が本当に迷うかは、人が遊んで確かめる
    closeCalls: 0,
    heldBack: 0, // 使えるカードがあるのに、あえて使わなかった場面（温存）
    lethalWindows: 0, // 防御しないと城が落ちる場面
  };
  for (const type of EVENT_TYPES) {
    game.on(type, (e) => {
      stats.events[type] = (stats.events[type] || 0) + 1;
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
      if (type === 'cardPlayed') stats.played[e.type] = (stats.played[e.type] || 0) + 1;
      if (type === 'reactionRequested') {
        stats.reactionWindows += 1;
        stats.attackDamageSeen += e.damage;
      }
      if (type === 'reactionResolved') {
        if (!e.passed) stats.reactionsUsed += 1;
        for (const t of e.types) stats.reactionCards[t] = (stats.reactionCards[t] || 0) + 1;
        if (e.intercepted) stats.intercepts += 1;
        stats.counterDamage += e.counterDamage;
        stats.reducedDamage += e.reduced;
      }
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

  game.start();
  let guard = 0;
  let lastCounted = -1;
  for (;;) {
    const now = game.getState(null);
    if (now.phase === 'gameOver' || now.turn > maxTurns) break;
    if (++guard > maxTurns * 20) throw new Error('シミュレーションが進まなくなりました');
    // 防御の場面：攻撃された側が、防御に使うカードを選ぶ
    if (now.phase === 'reaction') {
      const defender = now.reaction.defenderId;
      {
        const a = analyzeReact(game, defender);
        const second = a.plans.find((pl) => pl !== a.best);
        if (second && a.best.score - second.score < 2.5) stats.closeCalls += 1;
        if (a.lethal) stats.lethalWindows += 1;
        stats.reactionWindowsSeen = (stats.reactionWindowsSeen || 0) + 1;
      }
      const cardIds = strategyOf(defender).react(game, defender, aiRng, ctx);
      const res = game.react(cardIds);
      if (!res.ok) throw new Error(`react が失敗: ${res.reason}`);
      if (cardIds.length === 0) stats.heldBack += 1;
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
    const firstLook = lastCounted !== now.turn; // 防御の場面をはさんで同じターンに戻ってきたときは、数え直さない
    lastCounted = now.turn;
    if (firstLook) stats.mainTurns += 1;
    const playable = new Set(
      game.getState(pid).players[pid].hand.filter((c) => game.canPlayCard(c.cardId).ok).map((c) => c.type),
    );
    if (firstLook && playable.size >= 2) stats.choiceTurns += 1;
    strat.takeTurn(game, pid, aiRng, ctx);
    if (game.getState(null).phase === 'gameOver') break;
    if (game.getState(null).phase === 'reaction') continue; // 防御が終わってから、同じ人の続き
    const r = game.endTurn();
    if (!r.ok) throw new Error(`endTurn が失敗: ${r.reason}`);
  }
  stats.finalState = game.getState(null);
  stats.winner = stats.finalState.winner;
  stats.turns = stats.finalState.turn;
  return stats;
}

/** 何試合も回してまとめる */
export function runMany({ games, seed = 1, ...rest }) {
  const results = [];
  for (let i = 0; i < games; i++) results.push(runMatch({ ...rest, seed: seed * 100003 + i }));
  return summarize(results, rest.strategies);
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
  return {
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
    // 防御（リアクション）：1試合あたりの回数と、使った割合・温存した割合・迷う場面の目安
    reactionWindowsPerGame: sum((r) => r.reactionWindows) / results.length,
    reactionUseRate: sum((r) => r.reactionsUsed) / (sum((r) => r.reactionWindows) || 1),
    heldBackRate: sum((r) => r.heldBack) / (sum((r) => r.reactionWindows) || 1),
    closeCallRate: sum((r) => r.closeCalls) / (sum((r) => r.reactionWindows) || 1),
    lethalWindowRate: sum((r) => r.lethalWindows) / (sum((r) => r.reactionWindows) || 1),
    reducedShare: sum((r) => r.reducedDamage) / (sum((r) => r.attackDamageSeen) || 1),
    interceptsPerGame: sum((r) => r.intercepts) / results.length,
    counterDamagePerGame: sum((r) => r.counterDamage) / results.length,
    reactionCardsPerGame: Object.fromEntries(
      Object.entries(
        results.reduce((acc, r) => {
          for (const [k, v] of Object.entries(r.reactionCards)) acc[k] = (acc[k] || 0) + v;
          return acc;
        }, {}),
      ).map(([k, v]) => [k, v / results.length]),
    ),
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
