import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '../stores/useAppStore';
import type { CpuLevel, ModeId, PlayMode } from '../engine/types';
import { cardTypeToImagePath } from '../engine/dataLoader';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon, type PaintedIconName } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import styles from './HomeScreen.module.css';

const MODES: Array<{ id: ModeId; label: string; headline: string }> = [
  { id: 'kingdom', label: '通常モード', headline: '城を落とせ。' },
  { id: 'factions', label: '4陣営モード', headline: '陣営の誇りを懸けて。' },
  { id: 'classic', label: 'クラシック', headline: 'スキルを選んで、城を落とせ。' },
];

const PLAY_MODES: Array<{ id: PlayMode; label: string; icon: PaintedIconName }> = [
  { id: 'cpu', label: 'CPU対戦', icon: 'cpu' },
  { id: 'local', label: '同じ端末', icon: 'local' },
  { id: 'casual', label: '合言葉対戦', icon: 'online' },
  { id: 'ranked', label: 'ランクマッチ', icon: 'rank' },
];

const CPU_LABELS: Record<CpuLevel, string> = {
  easy: 'よわい',
  normal: 'ふつう',
  hard: 'つよい',
};

export function HomeScreen({ onOpenSkillTree }: { onOpenSkillTree: () => void }) {
  const {
    mode,
    setMode,
    playMode,
    setPlayMode,
    cpuLevel,
    setCpuLevel,
    selectedDeckId,
    setSelectedDeckId,
    unlockedSkills,
    data,
    startBattle,
    setTab,
  } = useAppStore();

  const [sheet, setSheet] = useState<'none' | 'deck' | 'match'>('none');

  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const deckEntry = data?.decks?.[selectedDeckId];
  const deckName = deckEntry?.name || 'バランス（コスト制）';
  const deckPreviewCards = Object.keys(deckEntry?.cards || { starfall: 1, giant: 1 }).slice(0, 2);

  const matchLabel =
    playMode === 'cpu'
      ? `CPU (${CPU_LABELS[cpuLevel]})`
      : PLAY_MODES.find((p) => p.id === playMode)?.label || 'CPU対戦';

  return (
    <section className={styles.homeRoot} aria-label="バトルホーム">
      <div className={styles.modeBarWrap}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`${styles.modePill} ${mode === m.id ? styles.modePillActive : ''}`}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className={styles.stageSpacer}>
        <div className={styles.heroTitle}>
          <span className={styles.brandSmall}>CASTLE FIELD</span>
          <h1 className={styles.heroHeading}>{activeMode.headline}</h1>
        </div>

        <button
          type="button"
          className={styles.seasonChip}
          onClick={() => setTab('menu')}
        >
          <PaintedIcon name="rank-unranked" size={20} />
          <span>シーズン1 ・ ランク未参加</span>
          <PaintedIcon name="arrow" size={14} />
        </button>
      </div>

      <div className={styles.thumbConsole}>
        <div className={styles.prepChips}>
          {mode === 'classic' ? (
            <button
              type="button"
              className={styles.prepChip}
              onClick={onOpenSkillTree}
            >
              <PaintedIcon name="crown" size={26} />
              <div className={styles.chipTexts}>
                <span className={styles.chipLabel}>スキルツリー</span>
                <span className={styles.chipValue}>取得 {unlockedSkills.length}/12</span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              className={styles.prepChip}
              onClick={() => setSheet('deck')}
            >
              <div className={styles.chipThumbs}>
                {deckPreviewCards.map((k) => (
                  <img
                    key={k}
                    src={cardTypeToImagePath(k)}
                    alt=""
                    className={styles.chipThumbImg}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/assets/cards/card-infantry.png';
                    }}
                  />
                ))}
              </div>
              <div className={styles.chipTexts}>
                <span className={styles.chipLabel}>使用デッキ</span>
                <span className={styles.chipValue}>{deckName}</span>
              </div>
            </button>
          )}

          <button
            type="button"
            className={styles.prepChip}
            onClick={() => setSheet('match')}
          >
            <PaintedIcon
              name={PLAY_MODES.find((p) => p.id === playMode)?.icon || 'cpu'}
              size={26}
            />
            <div className={styles.chipTexts}>
              <span className={styles.chipLabel}>対戦形式</span>
              <span className={styles.chipValue}>{matchLabel}</span>
            </div>
          </button>
        </div>

        <GameButton
          variant="primary-gold"
          size="lg"
          fullWidth
          crown
          onClick={startBattle}
        >
          出陣する！
        </GameButton>
      </div>

      <AnimatePresence>
        {sheet !== 'none' && (
          <motion.div
            className={styles.sheetBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheet('none')}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 460 }}
            >
              <ParchmentSheet className={styles.sheetCard}>
                <div className={styles.sheetHeader}>
                  <h2 className={styles.sheetTitle}>
                    {sheet === 'deck' ? 'デッキを選ぶ' : '対戦形式と強さ'}
                  </h2>
                  <RoundButton onClick={() => setSheet('none')} aria-label="閉じる">
                    <PaintedIcon name="close" size={18} />
                  </RoundButton>
                </div>

                {sheet === 'deck' && data?.decks && (
                  <>
                    <div className={styles.optionGrid}>
                      {Object.entries(data.decks).map(([id, deck]) => (
                        <GameButton
                          key={id}
                          size="sm"
                          variant={selectedDeckId === id ? 'selected-royal' : 'normal-stone'}
                          onClick={() => {
                            setSelectedDeckId(id);
                            setSheet('none');
                          }}
                        >
                          {deck.name}
                        </GameButton>
                      ))}
                    </div>
                    <GameButton
                      size="sm"
                      variant="primary-gold"
                      fullWidth
                      onClick={() => {
                        setSheet('none');
                        setTab('deck');
                      }}
                    >
                      デッキ編成画面を開く
                    </GameButton>
                  </>
                )}

                {sheet === 'match' && (
                  <>
                    <div className={styles.optionGrid}>
                      {PLAY_MODES.map((pm) => (
                        <GameButton
                          key={pm.id}
                          size="sm"
                          variant={playMode === pm.id ? 'selected-royal' : 'normal-stone'}
                          onClick={() => setPlayMode(pm.id)}
                        >
                          <PaintedIcon name={pm.icon} size={18} />
                          <span>{pm.label}</span>
                        </GameButton>
                      ))}
                    </div>

                    {playMode === 'cpu' && (
                      <>
                        <div className={styles.chipLabel}>CPUの強さ</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {(['easy', 'normal', 'hard'] as CpuLevel[]).map((lv) => (
                            <GameButton
                              key={lv}
                              size="sm"
                              variant={cpuLevel === lv ? 'selected-royal' : 'normal-stone'}
                              onClick={() => setCpuLevel(lv)}
                            >
                              {CPU_LABELS[lv]}
                            </GameButton>
                          ))}
                        </div>
                      </>
                    )}

                    {playMode !== 'cpu' && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--cf-ink-muted)', fontWeight: 700 }}>
                        ※ オンライン部屋（合言葉）／ローカル端末対戦は現行サーバー・セッション仕様と接続可能です。すぐに1人対戦を試す場合は「CPU対戦」から出陣できます。
                      </p>
                    )}
                  </>
                )}
              </ParchmentSheet>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
