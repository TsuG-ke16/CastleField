import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '../stores/useAppStore';
import { getShopItemMap, getSkinFilter, getSkinPreviewImage } from '../engine/skinUtils';
import { GachaChestView } from '../scene3d/GachaChestView';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet, RibbonBanner } from '../components/ui/Surfaces';
import { iconFrameImage } from '../components/ui/FramedAvatar';
import styles from './GachaScreen.module.css';

type GachaRewardItem = { id: string; name: string; rarity: string; isNew: boolean };

const RARITY_LABEL: Record<string, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンド',
};

const SHOWCASE_FILTERS: Array<{ id: 'all' | 'legendary' | 'epic' | 'rare' | 'uncommon'; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'legendary', label: 'UR' },
  { id: 'epic', label: 'SR' },
  { id: 'rare', label: 'R' },
  { id: 'uncommon', label: 'UC' },
];

export function GachaScreen() {
  const {
    data,
    coins,
    points,
    pityCount,
    quality,
    gachaHistory,
    ownedSkins,
    selectedCastleSkin,
    selectedSoldierSkin,
    selectedBackSkin,
    selectedIconFrame,
    equipSkin,
    rollGacha,
    walletMode,
  } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [rewards, setRewards] = useState<GachaRewardItem[] | null>(null);
  const [subModal, setSubModal] = useState<'none' | 'showcase' | 'rates' | 'history'>('none');
  const [showcaseRarity, setShowcaseRarity] = useState<'all' | 'legendary' | 'epic' | 'rare' | 'uncommon'>('all');
  const openTimerRef = useRef<number | null>(null);
  const pendingRewardsRef = useRef<GachaRewardItem[] | null>(null);

  const shopMap = useMemo(() => getShopItemMap(data), [data]);

  const gachaPool = useMemo(
    () => Object.entries(shopMap).filter(([, it]) => !it.rankReward),
    [shopMap]
  );

  const ownedInPool = useMemo(
    () => gachaPool.filter(([id]) => ownedSkins.includes(id)).length,
    [gachaPool, ownedSkins]
  );

  const filteredShowcase = useMemo(
    () => gachaPool.filter(([, it]) => showcaseRarity === 'all' || (it.rarity || 'common') === showcaseRarity),
    [gachaPool, showcaseRarity]
  );

  const getEquipKind = (id: string): 'castle' | 'soldier' | 'back' | 'frame' | null => {
    const slot = String(shopMap[id]?.slot || shopMap[id]?.category || '');
    if (iconFrameImage(id) !== null || slot === 'iconFrame' || id.startsWith('frame_')) return 'frame';
    if (slot === 'castle' || id.startsWith('castle')) return 'castle';
    if (slot === 'cardBack' || id.includes('back')) return 'back';
    if (slot === 'unit' || id.startsWith('unit')) return 'soldier';
    return null;
  };

  const isSkinEquipped = (id: string, kind: 'castle' | 'soldier' | 'back' | 'frame' | null): boolean => {
    if (!kind) return false;
    if (kind === 'castle') return selectedCastleSkin === id;
    if (kind === 'soldier') return selectedSoldierSkin === id;
    if (kind === 'back') return selectedBackSkin === id;
    return selectedIconFrame === id;
  };

  const finishOpening = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (pendingRewardsRef.current) {
      setRewards(pendingRewardsRef.current);
      pendingRewardsRef.current = null;
    }
    setOpening(false);
  };

  const triggerRoll = async (count: 1 | 10) => {
    if (busy) return;
    setBusy(true);
    const rolled = await rollGacha(count);
    setBusy(false);
    if (!rolled) return;
    pendingRewardsRef.current = rolled;
    setOpening(true);
    openTimerRef.current = window.setTimeout(finishOpening, 680);
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
            {walletMode === 'server' ? '（サーバー）' : ''}
          </div>
        </div>
        <div className={styles.utilIcons}>
          <RoundButton onClick={() => setSubModal('showcase')} aria-label="見本">
            <PaintedIcon name="catalog" size={20} />
          </RoundButton>
          <RoundButton onClick={() => setSubModal('rates')} aria-label="排出率">
            <PaintedIcon name="help" size={20} />
          </RoundButton>
          <RoundButton onClick={() => setSubModal('history')} aria-label="履歴">
            <PaintedIcon name="mission" size={20} />
          </RoundButton>
        </div>
      </div>

      <div
        className={styles.stageBox}
        onClick={() => opening && finishOpening()}
        style={{ cursor: opening ? 'pointer' : 'default' }}
      >
        <GachaChestView opening={opening} quality={quality} />
        {opening && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              padding: '3px 12px',
              borderRadius: 999,
              background: 'rgba(74, 46, 26, 0.86)',
              color: '#ffe37a',
              fontSize: 11,
              fontWeight: 900,
              pointerEvents: 'none',
            }}
          >
            タップでスキップ
          </div>
        )}
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

        <div className={styles.tenWrap}>
          <span className={styles.guaranteeTag}>R以上1枠確定</span>
          <GameButton
            variant="primary-gold"
            size="md"
            fullWidth
            crown
            disabled={opening || coins < 900}
            onClick={() => triggerRoll(10)}
          >
            <span>10連</span>
            <PaintedIcon name="coin" size={16} />
            <span className="tabular">900</span>
          </GameButton>
        </div>
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
                {rewards.map((r, i) => {
                  const rarityCls = styles[`rarity-${r.rarity}`] || '';
                  const equipKind = getEquipKind(r.id);
                  const equipped = isSkinEquipped(r.id, equipKind);
                  return (
                    <motion.div
                      key={`${r.id}-${i}`}
                      initial={{ scale: 0.72, opacity: 0, y: 12 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, type: 'spring', stiffness: 360, damping: 24 }}
                      className={`${styles.rewardTile} ${rarityCls}`}
                    >
                      <img
                        src={iconFrameImage(r.id) ?? getSkinPreviewImage(shopMap[r.id]?.slot || r.id)}
                        alt={r.name}
                        style={{
                          width: 42,
                          height: 42,
                          objectFit: 'contain',
                          filter: getSkinFilter(data, r.id, 'blue'),
                        }}
                      />
                      <span>{r.name}</span>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{RARITY_LABEL[r.rarity] || r.rarity.toUpperCase()}</span>
                      <span style={{ fontSize: 10, color: r.isNew ? '#de4f46' : '#7a5638' }}>
                        {r.isNew ? 'NEW!' : '交換pt +25'}
                      </span>
                      {equipKind && (
                        <button
                          type="button"
                          className={`${styles.equipMiniBtn} ${equipped ? styles.equipMiniBtnActive : ''}`}
                          onClick={() =>
                            equipKind === 'frame' && equipped ? equipSkin('frame', null) : equipSkin(equipKind, r.id)
                          }
                        >
                          {equipped ? '装備中' : '装備する'}
                        </button>
                      )}
                    </motion.div>
                  );
                })}
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
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>
                    {subModal === 'showcase' ? '排出スキン見本' : subModal === 'rates' ? '提供割合' : '最近の獲得履歴'}
                  </h2>
                  {subModal === 'showcase' && (
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)' }} className="tabular">
                      所持 {ownedInPool} / {gachaPool.length} 種
                    </div>
                  )}
                </div>
                <RoundButton onClick={() => setSubModal('none')} aria-label="閉じる">
                  <PaintedIcon name="close" size={18} />
                </RoundButton>
              </div>
              {subModal === 'showcase' ? (
                <>
                  <div className={styles.showcaseFilters}>
                    {SHOWCASE_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`${styles.filterChip} ${showcaseRarity === f.id ? styles.filterChipActive : ''}`}
                        onClick={() => setShowcaseRarity(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    {filteredShowcase.map(([id, it]) => {
                      const rk = it.rarity || 'common';
                      const owned = ownedSkins.includes(id);
                      return (
                        <div
                          key={id}
                          className={`${styles.rewardTile} ${styles[`rarity-${rk}`] || ''}`}
                          style={{ padding: 6, position: 'relative' }}
                        >
                          {owned && <span className={styles.ownedBadge}>所持済</span>}
                          <img
                            src={iconFrameImage(id) ?? getSkinPreviewImage(it.slot || id)}
                            alt={it.name || id}
                            style={{
                              width: 38,
                              height: 38,
                              objectFit: 'contain',
                              filter: getSkinFilter(data, id, 'blue'),
                            }}
                          />
                          <span style={{ fontSize: 11 }}>{it.name || id}</span>
                          <span style={{ fontSize: 9, opacity: 0.75 }}>{RARITY_LABEL[rk] || rk.toUpperCase()}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : subModal === 'rates' ? (
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.7 }}>
                  <div>レジェンド：3% / エピック：12% / レア：35% / コモン：50%</div>
                  <div>10連はレア以上1つ確定。40回エピック以上未排出で次回確定。</div>
                </div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto', fontSize: 13, fontWeight: 700 }}>
                  {gachaHistory.length === 0 ? 'まだ履歴がありません' : gachaHistory.map((h, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #d9c48a' }}>
                      {h.name}（{RARITY_LABEL[h.rarity] || h.rarity}）
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
