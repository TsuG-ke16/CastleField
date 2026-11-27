import { useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '../stores/useAppStore';
import { GachaChestScene } from '../scene3d/GachaChestScene';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet, RibbonBanner } from '../components/ui/Surfaces';
import styles from './GachaScreen.module.css';

export function GachaScreen() {
  const { coins, points, pityCount, quality, gachaHistory, spendCoinsAndRollGacha } = useAppStore();
  const [opening, setOpening] = useState(false);
  const [rewards, setRewards] = useState<Array<{ id: string; name: string; rarity: string; isNew: boolean }> | null>(null);
  const [subModal, setSubModal] = useState<'none' | 'rates' | 'history'>('none');

  const triggerRoll = (count: 1 | 10) => {
    const rolled = spendCoinsAndRollGacha(count);
    if (!rolled) return;
    setOpening(true);
    setTimeout(() => {
      setRewards(rolled);
      setOpening(false);
    }, 680);
  };

  const remainingPity = Math.max(1, 40 - pityCount);
  const pityPct = Math.min(100, (pityCount / 40) * 100);

  return (
    <section className={styles.page} aria-label="王国の宝箱ガチャ">
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>王国の宝箱</h1>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--cf-ink-muted)' }} className="tabular">
            コイン {coins.toLocaleString()} ・ 交換pt {points.toLocaleString()}
          </div>
        </div>
        <div className={styles.utilIcons}>
          <RoundButton onClick={() => setSubModal('rates')} aria-label="排出率">
            <PaintedIcon name="help" size={20} />
          </RoundButton>
          <RoundButton onClick={() => setSubModal('history')} aria-label="履歴">
            <PaintedIcon name="mission" size={20} />
          </RoundButton>
        </div>
      </div>

      <div className={styles.stageBox}>
        <GachaChestScene opening={opening} quality={quality} />
      </div>

      <div className={styles.pityBox}>
        <div className={styles.pityHeader}>
          <span>エピック以上確定天井</span>
          <span className="tabular">あと {remainingPity} 回</span>
        </div>
        <div className={styles.pityTrack}>
          <div className={styles.pityFill} style={{ width: `${pityPct}%` }} />
        </div>
      </div>

      <div className={styles.rollRow}>
        <GameButton
          variant="normal-stone"
          size="md"
          disabled={opening || coins < 100}
          onClick={() => triggerRoll(1)}
        >
          <span>1回</span>
          <PaintedIcon name="coin" size={16} />
          <span className="tabular">100</span>
        </GameButton>

        <GameButton
          variant="primary-gold"
          size="md"
          crown
          disabled={opening || coins < 900}
          onClick={() => triggerRoll(10)}
        >
          <span>10連</span>
          <PaintedIcon name="coin" size={16} />
          <span className="tabular">900</span>
        </GameButton>
      </div>

      {rewards && (
        <div className={styles.modalBackdrop} onClick={() => setRewards(null)}>
          <motion.div
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ width: '100%', maxWidth: 620 }}
            onClick={(e) => e.stopPropagation()}
          >
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <RibbonBanner tone="victory" label="宝箱オープン！" />
              <div className={styles.rewardGrid}>
                {rewards.map((r, i) => (
                  <div key={`${r.id}-${i}`} className={styles.rewardTile}>
                    <PaintedIcon name={r.rarity === 'legendary' || r.rarity === 'epic' ? 'crown' : 'skin'} size={34} />
                    <span>{r.name}</span>
                    <span style={{ fontSize: 10, color: r.isNew ? '#de4f46' : '#7a5638' }}>
                      {r.isNew ? 'NEW!' : '交換pt +25'}
                    </span>
                  </div>
                ))}
              </div>
              <GameButton variant="primary-gold" fullWidth onClick={() => setRewards(null)}>
                受け取る
              </GameButton>
            </ParchmentSheet>
          </motion.div>
        </div>
      )}

      {subModal !== 'none' && (
        <div className={styles.modalBackdrop} onClick={() => setSubModal('none')}>
          <div style={{ width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={styles.headerRow}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>
                  {subModal === 'rates' ? '提供割合' : '最近の獲得履歴'}
                </h2>
                <RoundButton onClick={() => setSubModal('none')} aria-label="閉じる">
                  <PaintedIcon name="close" size={18} />
                </RoundButton>
              </div>
              {subModal === 'rates' ? (
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
                  <div>レジェンド：3% / エピック：12% / レア：35% / コモン：50%</div>
                  <div>10連はレア以上1つ確定。40回エピック以上未排出で次回確定。</div>
                </div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto', fontSize: 13, fontWeight: 700 }}>
                  {gachaHistory.length === 0 ? 'まだ履歴がありません' : gachaHistory.map((h, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #d9c48a' }}>
                      {h.name}（{h.rarity}）
                    </div>
                  ))}
                </div>
              )}
            </ParchmentSheet>
          </div>
        </div>
      )}
    </section>
  );
}
