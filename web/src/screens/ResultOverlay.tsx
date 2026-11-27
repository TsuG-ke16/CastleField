import { motion } from 'motion/react';
import { GameButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet, RibbonBanner } from '../components/ui/Surfaces';

interface ResultOverlayProps {
  won: boolean;
  turns: number;
  damageDealt: number;
  cardsPlayed: number;
  monstersDefeated: number;
  onRematch: () => void;
  onHome: () => void;
}

export function ResultOverlay({
  won,
  turns,
  damageDealt,
  cardsPlayed,
  monstersDefeated,
  onRematch,
  onHome,
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
              <PaintedIcon name="coin" size={14} />+{won ? 150 : 40}
            </span>
            <span>獲得経験値</span>
            <span className="tabular">+{won ? 85 : 25} XP</span>
          </div>

          <GameButton variant="primary-gold" size="lg" fullWidth crown onClick={onRematch}>
            もう1回
          </GameButton>
          <GameButton variant="normal-stone" size="sm" fullWidth onClick={onHome}>
            ホームへ
          </GameButton>
        </ParchmentSheet>
      </motion.div>
    </div>
  );
}
