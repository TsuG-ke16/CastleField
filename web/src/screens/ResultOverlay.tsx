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
}: ResultOverlayProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: won ? 'radial-gradient(circle, rgba(255,227,122,0.85) 0%, rgba(74,46,26,0.72) 100%)' : 'rgba(24, 34, 62, 0.78)',
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
        <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <RibbonBanner tone={won ? 'victory' : 'defeat'} label={won ? 'あなたの勝ち！' : '敗北…'} />

          <img
            src={won ? '/assets/ui/result-victory.png' : '/assets/ui/result-defeat.png'}
            alt=""
            style={{ width: 136, height: 136, objectFit: 'contain' }}
          />

          {rankedChange !== undefined && <RankedPanel change={rankedChange} />}

          <div
            style={{
              width: '100%',
              background: '#f6e4ba',
              border: '2px solid #8a562d',
              borderRadius: 12,
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
