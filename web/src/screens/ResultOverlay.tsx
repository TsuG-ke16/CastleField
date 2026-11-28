import { useState } from 'react';
import { motion } from 'motion/react';
import { GameButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet, RibbonBanner } from '../components/ui/Surfaces';
import type { RankedChange } from '../engine/rankedClient';

interface ResultOverlayProps {
  won: boolean;
  turns: number;
  damageDealt: number;
  cardsPlayed: number;
  monstersDefeated: number;
  onRematch: () => void;
  onHome: () => void;
  /** 「もう1回」の文字を変えるとき（ランクマッチは「次の相手を探す」） */
  rematchLabel?: string;
  /** ランクマッチのとき：サーバーが決めたランクの変化（届くまでは null） */
  rankedChange?: RankedChange | null;
  /** 獲得コイン（null は計算中）。省略すると勝ち150・負け40 */
  coinReward?: number | null;
  progression?: {
    level: number;
    title: string;
    xp: number;
    currentLevelXp: number;
    nextLevelXp: number;
  };
  battleLog?: string[];
}

function RankedPanel({ change }: { change: RankedChange | null }) {
  if (!change) {
    return <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>ランクを計算中…</div>;
  }
  const after = change.rankAfter;
  let headline: string;
  if (change.placement) {
    headline = change.placedNow
      ? `認定戦が終わりました！ ランクは ${after?.divisionLabel ?? '―'}`
      : `認定戦 あと${change.placementLeft}試合`;
  } else {
    const d = change.rpDelta ?? 0;
    headline = `${d >= 0 ? '+' : ''}${d} RP`;
  }
  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: change.promoted ? [0.7, 1.15, 1] : 1, opacity: 1 }}
      transition={{ delay: 0.25, duration: 0.5 }}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 12px',
        borderRadius: 12,
        border: `3px solid ${after?.color || '#8a562d'}`,
        background: '#fff6dc',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 900 }}>
        <PaintedIcon name="rank" size={22} />
        {headline}
      </span>
      {after && !change.placedNow && (
        <span style={{ fontSize: 13, fontWeight: 800, color: after.color, textShadow: '0 1px 0 rgba(74,46,26,0.45)' }}>
          {after.divisionLabel}・{after.rp}RP
        </span>
      )}
      {change.promoted && <strong style={{ fontSize: 15, color: '#b8860b' }}>昇格！ おめでとう！</strong>}
      {change.demoted && <span style={{ fontSize: 12, fontWeight: 800 }}>降格…次でとり返そう</span>}
      {change.scaled && (
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
          同じ相手と続けて戦ったので、もらえる RP が減りました
        </span>
      )}
    </motion.div>
  );
}

export function ResultOverlay({
  won,
  turns,
  damageDealt,
  cardsPlayed,
  monstersDefeated,
  onRematch,
  onHome,
  rematchLabel,
  rankedChange,
  coinReward,
  progression,
  battleLog,
}: ResultOverlayProps) {
  const [showLog, setShowLog] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: won ? 'radial-gradient(circle, rgba(255,227,122,0.85) 0%, rgba(74,46,26,0.72) 100%)' : 'rgba(24, 34, 62, 0.78)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.84, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        style={{ width: '100%', maxWidth: 400 }}
      >
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxHeight: '92dvh', overflowY: 'auto' }}>
          <RibbonBanner tone={won ? 'victory' : 'defeat'} label={won ? 'あなたの勝ち！' : '敗北…'} />

          <div
            style={{
              width: 148,
              height: 148,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: won
                ? 'radial-gradient(circle, rgba(255, 232, 136, 0.82) 0%, rgba(255, 246, 224, 0.16) 72%, transparent 100%)'
                : 'radial-gradient(circle, rgba(110, 138, 208, 0.42) 0%, rgba(255, 246, 224, 0.08) 72%, transparent 100%)',
              border: won ? '2px solid rgba(242, 183, 40, 0.55)' : '2px solid rgba(74, 96, 154, 0.35)',
              boxShadow: won ? 'inset 0 2px 8px rgba(255, 255, 255, 0.75)' : 'inset 0 2px 6px rgba(20, 34, 72, 0.18)',
              flexShrink: 0,
            }}
          >
            <img
              src={won ? '/assets/ui/result-victory.png' : '/assets/ui/result-defeat.png'}
              alt=""
              style={{ width: 130, height: 130, objectFit: 'contain' }}
            />
          </div>

          {rankedChange !== undefined && <RankedPanel change={rankedChange} />}

          <div
            style={{
              width: '100%',
              background: 'linear-gradient(180deg, #fffdf5 0%, #f6e4ba 100%)',
              border: '2px solid #8a562d',
              borderRadius: 12,
              boxShadow: 'inset 0 1.5px 0 #ffffff, 0 2px 0 rgba(74, 46, 26, 0.2)',
              padding: '10px 14px',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              rowGap: 6,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <span>経過ターン数</span><span className="tabular">{turns}</span>
            <span>城に与えたダメージ</span><span className="tabular">{damageDealt}</span>
            <span>使ったカード</span><span className="tabular">{cardsPlayed}</span>
            <span>倒した魔物</span><span className="tabular">{monstersDefeated}</span>
            <span>獲得コイン</span>
            <span className="tabular" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PaintedIcon name="coin" size={14} />{coinReward === null ? '…' : `+${coinReward ?? (won ? 150 : 40)}`}
            </span>
            <span>獲得経験値</span>
            <span className="tabular">+{won ? 85 : 25} XP</span>
          </div>

          {progression && (
            <div
              style={{
                width: '100%',
                background: '#fbf3dc',
                border: '1.5px solid #c9b075',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Lv.{progression.level} {progression.title}</span>
                <span className="tabular" style={{ fontSize: 11, color: 'var(--cf-ink-muted)' }}>
                  XP {progression.currentLevelXp}/{progression.nextLevelXp}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: '#dfca9f', border: '1.5px solid #4a2e1a', boxShadow: 'inset 0 1px 2px rgba(74, 46, 26, 0.22)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.round((progression.currentLevelXp / Math.max(1, progression.nextLevelXp)) * 100))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #5b8ef2 0%, #3465cc 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.55)',
                  }}
                />
              </div>
            </div>
          )}

          {battleLog && battleLog.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 900,
                  color: '#24479b',
                  cursor: 'pointer',
                }}
              >
                {showLog ? '▲ バトルログを閉じる' : `▼ バトルログを見る (${battleLog.length}件)`}
              </button>
              {showLog && (
                <div
                  style={{
                    width: '100%',
                    maxHeight: 110,
                    overflowY: 'auto',
                    background: '#fbf3dc',
                    border: '1.5px solid #d4bc7d',
                    borderRadius: 8,
                    padding: '6px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {battleLog.map((line, i) => (
                    <div key={i}>• {line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <GameButton variant="primary-gold" size="lg" fullWidth crown onClick={onRematch}>
            {rematchLabel || 'もう1回'}
          </GameButton>
          <GameButton variant="normal-stone" size="sm" fullWidth onClick={onHome}>
            ホームへ
          </GameButton>
        </ParchmentSheet>
      </motion.div>
    </div>
  );
}
