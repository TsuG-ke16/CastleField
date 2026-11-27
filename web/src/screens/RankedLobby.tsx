import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '../stores/useAppStore';
import { rankedApi, type LeaderboardEntry, type RankedStatus, type SeasonReward } from '../engine/rankedClient';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import styles from './RankedLobby.module.css';

const POLL_MS = 2000;

/** ランクマッチの待合室：今のランク・相手を探す・ランキング */
export function RankedLobby({ onClose }: { onClose: () => void }) {
  const {
    mode,
    setMode,
    setPlayMode,
    playerName,
    onlineServerUrl,
    rankedSummary,
    setRankedSummary,
    startRankedBattle,
    data,
    grantOwnedItems,
  } = useAppStore();
  const [rewards, setRewards] = useState<SeasonReward[]>([]);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<RankedStatus['state'] | 'loading' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [waitedSec, setWaitedSec] = useState(0);
  const [range, setRange] = useState<number | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  const pollRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  const stopPoll = () => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleStatus = useCallback(
    (st: RankedStatus) => {
      if (!aliveRef.current) return;
      if (!st.ok && st.reason) setMessage(st.reason);
      if (st.state === 'matched') {
        stopPoll();
        if (st.finished) {
          // 前の試合の知らせが残っていた：探し直せるようにする
          setStatus('idle');
          return;
        }
        startRankedBattle({ token: st.token, playerId: st.playerId, opponentName: st.opponentName, state: st.gameState });
        return;
      }
      setStatus(st.state);
      if (st.state === 'queued') {
        setWaitedSec(Math.floor(st.waitedMs / 1000));
        setRange(st.range);
      }
      if (st.state === 'timeout') {
        setMessage('近い強さの相手が見つかりませんでした。時間をおいて、もう一度探してください');
      }
    },
    [startRankedBattle]
  );

  const poll = useCallback(() => {
    stopPoll();
    pollRef.current = window.setTimeout(async () => {
      try {
        const st = await rankedApi.status(onlineServerUrl, playerName);
        handleStatus(st);
        if (st.state === 'queued') poll();
      } catch (err) {
        if (!aliveRef.current) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : String(err));
      }
    }, POLL_MS);
  }, [handleStatus, onlineServerUrl, playerName]);

  // 開いたとき：今のランクと、待ち行列の状態を読む
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      try {
        const sum = await rankedApi.summary(onlineServerUrl, playerName);
        if (!aliveRef.current) return;
        if (sum.ok) setRankedSummary(sum);
        rankedApi
          .seasonRewards(onlineServerUrl, playerName)
          .then((r) => {
            if (!aliveRef.current || !r.ok) return;
            setRewards(r.rewards || []);
            // サーバーで受け取り済みなのに、この端末の所持品にない品を入れる（端末を変えたときなど）
            const got = (r.rewards || []).filter((x) => x.claimed).flatMap((x) => x.items);
            if (got.length) grantOwnedItems(got);
          })
          .catch(() => {});
        const st = await rankedApi.status(onlineServerUrl, playerName);
        handleStatus(st);
        if (st.state === 'queued') poll();
      } catch (err) {
        if (!aliveRef.current) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      aliveRef.current = false;
      stopPoll();
    };
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFind = async () => {
    setMessage(null);
    setStatus('loading');
    try {
      const st = await rankedApi.queue(onlineServerUrl, playerName);
      handleStatus(st);
      if (st.state === 'queued') poll();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = async () => {
    stopPoll();
    try {
      const r = await rankedApi.leave(onlineServerUrl, playerName);
      if (!r.ok) {
        // もう成立していた：その試合へ
        const st = await rankedApi.status(onlineServerUrl, playerName);
        handleStatus(st);
        return;
      }
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClose = async () => {
    if (status === 'queued') await handleCancel();
    onClose();
  };

  const toggleBoard = async () => {
    const next = !showBoard;
    setShowBoard(next);
    if (next && !board) {
      try {
        const r = await rankedApi.leaderboard(onlineServerUrl, 20);
        setBoard(r.entries || []);
      } catch {
        setBoard([]);
      }
    }
  };

  const itemName = (id: string) => {
    const items = (data?.shop as { items?: Record<string, { name?: string }> } | undefined)?.items;
    return (items && !Array.isArray(items) && items[id]?.name) || id;
  };
  const claimable = rewards.filter((r) => r.eligible && !r.claimed);

  const handleClaim = async (season: number) => {
    try {
      const r = await rankedApi.claimSeason(onlineServerUrl, playerName, season);
      if (!r.ok) {
        setRewardMsg(r.reason || '受け取れませんでした');
        return;
      }
      grantOwnedItems(r.items || []);
      setRewards((prev) => prev.map((x) => (x.season === season ? { ...x, claimed: true } : x)));
      setRewardMsg(`受け取りました：${(r.items || []).map(itemName).join('・')}（ショップで装備できます）`);
    } catch (err) {
      setRewardMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const wrongMode = mode !== 'kingdom';
  const s = rankedSummary;
  const placementDone = s ? s.placementTotal - s.placementLeft : 0;
  const rank = s?.rank;
  const progress = rank && rank.rpForNext ? Math.min(1, (rank.rpIntoDivision ?? 0) / rank.rpForNext) : rank ? 1 : 0;

  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => void handleClose()}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className={styles.wrap}
      >
        <ParchmentSheet className={styles.sheet}>
          <div className={styles.header}>
            <h2 className={styles.title}>ランクマッチ</h2>
            <RoundButton onClick={() => void handleClose()} aria-label="閉じる">
              <PaintedIcon name="close" size={18} />
            </RoundButton>
          </div>

          <div className={styles.rankCard} style={{ borderColor: rank?.color || '#8a562d' }}>
            <PaintedIcon name={rank ? 'rank' : 'rank-unranked'} size={44} />
            <div className={styles.rankTexts}>
              <span className={styles.season}>シーズン{s?.season ?? 1}</span>
              <strong className={styles.rankName} style={{ color: rank?.color }}>
                {rank ? rank.divisionLabel : s && placementDone > 0 ? '認定戦の途中' : 'ランク未参加'}
              </strong>
              {rank ? (
                <>
                  <div className={styles.bar} aria-label="次の段までの進み具合">
                    <div className={styles.barFill} style={{ width: `${Math.round(progress * 100)}%`, background: rank.color }} />
                  </div>
                  <span className={styles.small}>
                    {rank.rp}RP
                    {rank.rpForNext ? `（次の段まで あと${rank.rpForNext - (rank.rpIntoDivision ?? 0)}）` : ''}
                    {s?.position ? `・${s.position}位` : ''}
                  </span>
                </>
              ) : (
                <span className={styles.small}>
                  認定戦 {placementDone}/{s?.placementTotal ?? 5}（終わるとランクが決まります）
                </span>
              )}
              {s && s.matches > 0 && (
                <span className={styles.small}>
                  {s.matches}戦{s.wins}勝
                </span>
              )}
            </div>
          </div>

          {claimable.map((r) => (
            <div key={r.season} className={styles.reward} style={{ borderColor: r.peak?.color || '#c9a227' }}>
              <PaintedIcon name="crown" size={30} />
              <div className={styles.rankTexts}>
                <strong>シーズン{r.season}の報酬（最高 {r.peak?.divisionLabel}）</strong>
                <span className={styles.small}>{r.items.map(itemName).join('・')}</span>
              </div>
              <GameButton size="sm" variant="primary-gold" onClick={() => void handleClaim(r.season)}>
                受け取る
              </GameButton>
            </div>
          ))}
          {rewardMsg && <p className={styles.rewardMsg}>{rewardMsg}</p>}

          {wrongMode ? (
            <div className={styles.notice}>
              <p>ランクマッチは「通常モード」で遊びます。</p>
              <GameButton variant="primary-gold" fullWidth onClick={() => setMode('kingdom')}>
                通常モードに切り替える
              </GameButton>
            </div>
          ) : status === 'queued' ? (
            <div className={styles.searching} role="status" aria-live="polite">
              <motion.div
                className={styles.spinner}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
              >
                <PaintedIcon name="battle" size={40} />
              </motion.div>
              <strong>相手を探しています… {waitedSec}秒</strong>
              <span className={styles.small}>近い強さの相手から探します{range ? `（探す範囲 ±${range}）` : ''}。待つほど範囲が広がります</span>
              <GameButton variant="normal-stone" fullWidth onClick={() => void handleCancel()}>
                探すのをやめる
              </GameButton>
            </div>
          ) : (
            <GameButton
              variant="primary-gold"
              size="lg"
              fullWidth
              crown
              disabled={status === 'loading' || status === 'error'}
              onClick={() => void handleFind()}
            >
              {status === 'loading' ? '確認中…' : '相手を探す'}
            </GameButton>
          )}

          {message && <p className={styles.message}>{message}</p>}

          {status === 'error' && (
            <div className={styles.notice}>
              <p>ランクマッチは、オンラインサーバー（Rust サーバー）につながっているときに遊べます。</p>
              <GameButton
                variant="normal-stone"
                fullWidth
                onClick={() => {
                  setPlayMode('cpu');
                  onClose();
                }}
              >
                CPU対戦にする
              </GameButton>
            </div>
          )}

          <GameButton variant="normal-stone" size="sm" fullWidth onClick={() => void toggleBoard()} disabled={status === 'error'}>
            <PaintedIcon name="ranking" size={18} />
            {showBoard ? 'ランキングを閉じる' : 'ランキングを見る'}
          </GameButton>
          {showBoard && (
            <ol className={styles.board}>
              {board === null ? (
                <li className={styles.small}>読み込み中…</li>
              ) : board.length === 0 ? (
                <li className={styles.small}>まだランクの決まった人がいません</li>
              ) : (
                board.map((e) => (
                  <li key={e.position} className={styles.boardRow}>
                    <span className={styles.pos}>{e.position}</span>
                    <span className={styles.boardName}>{e.name}</span>
                    <span className={styles.boardRank} style={{ color: e.rank.color }}>
                      {e.rank.divisionLabel}
                    </span>
                    <span className="tabular">{e.rp}RP</span>
                  </li>
                ))
              )}
            </ol>
          )}
          <p className={styles.footnote}>
            成績はこの端末のゲスト登録にひもづきます。点数はサーバーが試合の結果から決めます。
          </p>
        </ParchmentSheet>
      </motion.div>
    </motion.div>
  );
}
