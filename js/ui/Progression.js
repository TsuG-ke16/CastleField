// 試合のあとの「経験値とレベルアップ」の表示。値はサーバーが決めたものを読むだけ。
import { account } from './Account.js';
import { rankEmblem } from './RankEmblem.js';

let shownMatch = null;

export async function showMatchProgress(root, { reducedMotion = false, ranked = false } = {}) {
  root.querySelector('.match-progress')?.remove();
  if (!account.enabled || !account.user) return;
  let last;
  try { last = (await account.api('GET', '/api/history?limit=1')).json?.last; } catch { return; }
  if (!last || last.matchId === shownMatch) return;
  shownMatch = last.matchId;
  const card = document.createElement('div');
  card.className = 'match-progress'; card.setAttribute('role', 'status');
  const gain = document.createElement('p');
  gain.className = 'mp-gain';
  gain.textContent = last.counted ? (last.xpGained > 0 ? `+${last.xpGained} EXP` : 'この試合は経験値の対象外です（短すぎる・途中で抜けた など）') : 'この試合は戦績・経験値の対象外です';
  const lv = document.createElement('p');
  lv.className = 'mp-level';
  lv.textContent = `Lv.${last.level}${last.maxed ? '（最大）' : `　次まで ${last.xpForNext - last.xpIntoLevel}`}`;
  const bar = document.createElement('span'); bar.className = 'home-xp';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', '次のレベルまで');
  const fill = document.createElement('i'); bar.append(fill);
  const earnings = document.createElement('div');
  earnings.className = 'match-earnings';
  earnings.append(gain);
  card.append(earnings, lv, bar);
  if (last.coinsGained > 0) { const c = document.createElement('p'); c.className = 'mp-coins'; c.textContent = `+${last.coinsGained} コイン`; earnings.append(c); }
  if (ranked) {
    try {
      const rc = (await account.api('GET', '/api/ranked/last')).json?.last;
      if (rc) {
        const line = document.createElement('p');
        line.className = `rank-change ${rc.promoted ? 'up' : rc.demoted ? 'down' : ''}`;
        line.textContent = rc.placement
          ? (rc.rankAfter ? `認定戦が終わりました：${rc.rankAfter.divisionLabel}` : `認定戦（あと${rc.placementLeft}試合でランクが決まります）`)
          : `${rc.rpDelta >= 0 ? '+' : ''}${rc.rpDelta} RP　${rc.rankAfter.divisionLabel}${rc.promoted ? '　昇格！' : rc.demoted ? '　降格…' : ''}${rc.scaled ? '（同じ相手と続けて対戦したため、増え方を減らしました）' : ''}`;
        if (rc.rankAfter) line.insertAdjacentHTML('afterbegin', rankEmblem(rc.rankAfter, 32));
        card.append(line);
        const highlight = rc.placement && rc.rankAfter ? '認定戦完了' : rc.promoted ? '昇格！' : rc.demoted ? 'ランク降格' : '';
        if (highlight && !reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const burst = document.createElement('button');
          burst.type = 'button';
          burst.className = `rank-result-burst${rc.demoted ? ' down' : ''}`;
          burst.textContent = highlight;
          burst.setAttribute('aria-label', `${highlight}の演出を閉じる`);
          burst.addEventListener('click', () => burst.remove(), { once: true });
          card.append(burst);
          setTimeout(() => burst.remove(), 1500);
        }
      }
    } catch { /* ランクの表示だけ出せない */ }
  }
  const anchor = root.querySelector('.result-actions') ?? root.lastElementChild;
  anchor.before(card);
  const pct = last.maxed ? 100 : Math.round((last.xpIntoLevel / Math.max(1, last.xpForNext)) * 100);
  bar.setAttribute('aria-valuenow', String(pct));
  requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  if (last.level > last.levelBefore) levelUp(card, last.level, reducedMotion);
}

function levelUp(card, level, reduced) {
  const burst = document.createElement('button');
  burst.type = 'button';
  burst.className = `levelup${reduced ? ' still' : ''}`;
  burst.setAttribute('aria-label', `レベル${level}にアップ。タップで閉じる`);
  const t = document.createElement('strong'); t.textContent = 'レベルアップ！';
  const n = document.createElement('span'); n.textContent = `Lv.${level}`;
  const hint = document.createElement('small'); hint.textContent = 'プロフィールでレベル報酬を受け取れます';
  burst.append(t, n, hint);
  burst.addEventListener('click', () => burst.remove()); // タップで消せる
  card.append(burst);
  setTimeout(() => burst.remove(), 1800);
}
