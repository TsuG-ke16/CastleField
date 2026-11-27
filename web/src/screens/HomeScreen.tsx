import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '../stores/useAppStore';
import type { CpuLevel, ModeId, PlayMode } from '../engine/types';
import { cardTypeToImagePath } from '../engine/dataLoader';
import { checkServerHealth } from '../engine/onlineClient';
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
    selectedStageId,
    setSelectedStageId,
    customDeck,
    onlinePassphrase,
    setOnlinePassphrase,
    onlineServerUrl,
    setOnlineServerUrl,
    unlockedSkills,
    data,
    startBattle,
    setTab,
  } = useAppStore();

  const [sheet, setSheet] = useState<'none' | 'deck' | 'match'>('none');
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  const handleCheckServer = async () => {
    setServerStatus('接続確認中…');
    const ok = await checkServerHealth(onlineServerUrl);
    setServerStatus(ok ? 'Rustサーバー接続OK' : 'サーバー未接続（ローカルCPUで遊べます）');
  };

  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const deckEntry = selectedDeckId === 'custom' ? null : data?.decks?.[selectedDeckId];
  const deckName = selectedDeckId === 'custom' ? '★ オリジナル' : (deckEntry?.name || 'バランス（コスト制）');
  const deckPreviewCards =
    selectedDeckId === 'custom'
      ? Object.keys(customDeck).slice(0, 2)
      : Object.keys(deckEntry?.cards || { starfall: 1, giant: 1 }).slice(0, 2);

  const stageLabel =
    selectedStageId === 'random'
      ? 'ランダム'
      : (data?.stages?.[selectedStageId]?.name || '草原').split('（')[0];

  const matchLabel =
    playMode === 'cpu'
      ? `CPU(${CPU_LABELS[cpuLevel]})・${stageLabel}`
      : `${PLAY_MODES.find((p) => p.id === playMode)?.label || '対戦'}・${stageLabel}`;

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
                      <GameButton
                        size="sm"
                        variant={selectedDeckId === 'custom' ? 'selected-royal' : 'normal-stone'}
                        onClick={() => {
                          setSelectedDeckId('custom');
                          setSheet('none');
                        }}
                      >
                        ★ オリジナル
                      </GameButton>
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

                    {playMode === 'casual' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 800 }}>
                          合言葉（ルームID）
                          <input
                            type="text"
                            value={onlinePassphrase}
                            onChange={(e) => setOnlinePassphrase(e.target.value)}
                            placeholder="例: castle-777"
                            style={{
                              padding: '8px 10px',
                              borderRadius: 10,
                              border: '2px solid #c9b075',
                              background: '#fffdf7',
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          />
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 800 }}>
                          サーバーURL（同一オリジンなら空欄）
                          <input
                            type="url"
                            value={onlineServerUrl}
                            onChange={(e) => setOnlineServerUrl(e.target.value)}
                            placeholder="http://127.0.0.1:8787"
                            style={{
                              padding: '8px 10px',
                              borderRadius: 10,
                              border: '2px solid #c9b075',
                              background: '#fffdf7',
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          />
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <GameButton size="sm" variant="normal-stone" onClick={handleCheckServer}>
                            サーバー接続テスト
                          </GameButton>
                          {serverStatus && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)' }}>
                              {serverStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {playMode !== 'cpu' && playMode !== 'casual' && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--cf-ink-muted)', fontWeight: 700 }}>
                        {playMode === 'local'
                          ? '端末1台で交互に手札を隠して対戦できます（受け渡し画面つき）。'
                          : '※ ランクマッチ・フレンド部屋はオンラインサーバー接続時に対戦できます。'}
                      </p>
                    )}

                    {data?.stages && (
                      <>
                        <div className={styles.chipLabel}>戦場ステージ</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          <GameButton
                            size="sm"
                            variant={selectedStageId === 'random' ? 'selected-royal' : 'normal-stone'}
                            onClick={() => setSelectedStageId('random')}
                          >
                            🎲 ランダム
                          </GameButton>
                          {Object.entries(data.stages).map(([sid, st]) => (
                            <GameButton
                              key={sid}
                              size="sm"
                              variant={selectedStageId === sid ? 'selected-royal' : 'normal-stone'}
                              onClick={() => setSelectedStageId(sid)}
                            >
                              {(st.icon || '🌿')} {st.name.split('（')[0]}
                            </GameButton>
                          ))}
                        </div>
                      </>
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
