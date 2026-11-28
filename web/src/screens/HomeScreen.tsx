import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore, type FactionId } from '../stores/useAppStore';
import type { CpuLevel, ModeId, PlayMode } from '../engine/types';
import { cardTypeToImagePath } from '../engine/dataLoader';
import { checkServerHealth } from '../engine/onlineClient';
import { loadIdentity, rankedApi, rankLabel } from '../engine/rankedClient';
import { RankedLobby } from './RankedLobby';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { PaintedIcon, type PaintedIconName } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import styles from './HomeScreen.module.css';

const FACTIONS: Array<{ id: FactionId; label: string; desc: string; icon: PaintedIconName }> = [
  { id: 'kingdom', label: '王国', desc: '守りと回復で粘り、光の騎士で押し切る', icon: 'crown' },
  { id: 'forest', label: '森の同盟', desc: '4大精霊が毎ターン連動し元素反応を起こす', icon: 'wind' },
  { id: 'demon', label: '魔族軍', desc: '毒・闇侵食・骸骨兵の蘇生で守りを貫く', icon: 'fire' },
  { id: 'dragon', label: '竜族帝国', desc: '炎と雷の高火力竜で短期決戦を狙う', icon: 'fire' },
];

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
    selectedFactionId,
    setSelectedFactionId,
    customDeck,
    customDecks,
    activeCustomSlot,
    selectCustomSlot,
    onlinePassphrase,
    setOnlinePassphrase,
    onlineServerUrl,
    setOnlineServerUrl,
    unlockedSkills,
    data,
    startBattle,
    setTab,
    playerName,
    rankedSummary,
    setRankedSummary,
    rankedLobbyRequested,
    setRankedLobbyRequested,
  } = useAppStore();

  const [sheet, setSheet] = useState<'none' | 'deck' | 'match' | 'faction'>('none');
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [deckWarning, setDeckWarning] = useState<string | null>(null);
  const lobbyOpen = rankedLobbyRequested;
  const setLobbyOpen = setRankedLobbyRequested;

  useEffect(() => {
    setDeckWarning(null);
  }, [selectedDeckId, activeCustomSlot, mode, customDeck]);

  // 前にランクマッチを遊んだ端末なら、今のランクを静かに読む（つながらなければ何もしない）
  useEffect(() => {
    if (!loadIdentity(onlineServerUrl)) return;
    let alive = true;
    rankedApi
      .summary(onlineServerUrl, playerName)
      .then((sum) => {
        if (alive && sum.ok) setRankedSummary(sum);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onlineServerUrl, playerName, setRankedSummary]);

  const handleSortie = () => {
    if (playMode === 'ranked') {
      setLobbyOpen(true);
      return;
    }
    if (playMode === 'casual' && !onlinePassphrase.trim()) {
      // 合言葉がないと、だれとも対戦できない（押しても何も起きない状態にしない）
      setServerStatus('合言葉を入れるか「合言葉を自動生成」を押してください');
      setSheet('match');
      return;
    }
    if (mode === 'kingdom' && selectedDeckId === 'custom') {
      const cardsMap = data?.cards || {};
      const raritiesMap = data?.rarities || {};
      let totalCards = 0;
      let totalCost = 0;
      for (const [k, cnt] of Object.entries(customDeck || {})) {
        if (!cnt || cnt <= 0) continue;
        totalCards += cnt;
        const r = cardsMap[k]?.rarity || 'common';
        totalCost += (raritiesMap[r]?.deckCost ?? 1) * cnt;
      }
      if (totalCards === 0) {
        setDeckWarning('カスタムデッキが空です。デッキ画面でカードを1枚以上追加してください。');
        return;
      }
      if (totalCost > 100) {
        setDeckWarning(`カスタムデッキのコストが上限(100)を超えています（現在 ${totalCost}）。`);
        return;
      }
    }
    setDeckWarning(null);
    startBattle();
  };

  const handleCheckServer = async () => {
    setServerStatus('接続確認中…');
    const ok = await checkServerHealth(onlineServerUrl);
    setServerStatus(ok ? 'Rustサーバー接続OK' : 'サーバー未接続（ローカルCPUで遊べます）');
  };

  const handleGeneratePassphrase = () => {
    const num = 1000 + Math.floor(Math.random() * 9000);
    setOnlinePassphrase(`castle-${num}`);
    setServerStatus('新しい合言葉を作成しました');
  };

  const handleCopyInviteUrl = async () => {
    const pass = onlinePassphrase.trim() || 'castle-777';
    if (!onlinePassphrase.trim()) setOnlinePassphrase(pass);
    const url = `${window.location.origin}/?room=${encodeURIComponent(pass)}&stage=${encodeURIComponent(selectedStageId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setServerStatus(`招待URLをコピーしました: ${url}`);
    } catch {
      setServerStatus(`招待URL: ${url}`);
    }
  };

  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const deckEntry = selectedDeckId === 'custom' ? null : data?.decks?.[selectedDeckId];
  const activeCustomName = customDecks[activeCustomSlot]?.name || `デッキ${activeCustomSlot + 1}`;
  const deckName = selectedDeckId === 'custom' ? `★ ${activeCustomName}` : (deckEntry?.name || 'バランス（コスト制）');
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
          onClick={() => setLobbyOpen(true)}
        >
          <PaintedIcon name={rankedSummary?.placed ? 'rank' : 'rank-unranked'} size={20} />
          <span>シーズン{rankedSummary?.season ?? 1} ・ {rankLabel(rankedSummary)}</span>
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
          ) : mode === 'factions' ? (
            <button
              type="button"
              className={styles.prepChip}
              onClick={() => setSheet('faction')}
            >
              <PaintedIcon name={FACTIONS.find((f) => f.id === selectedFactionId)?.icon || 'crown'} size={26} />
              <div className={styles.chipTexts}>
                <span className={styles.chipLabel}>使用陣営</span>
                <span className={styles.chipValue}>{FACTIONS.find((f) => f.id === selectedFactionId)?.label || '王国'}</span>
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

        {deckWarning && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 12,
              border: '2px solid #de4f46',
              background: 'rgba(255, 240, 238, 0.96)',
              color: '#8c1d18',
              fontSize: 11,
              fontWeight: 900,
              boxShadow: '0 3px 0 rgba(74, 46, 26, 0.25)',
            }}
          >
            <span style={{ flex: 1, lineHeight: 1.35 }}>{deckWarning}</span>
            <GameButton size="sm" variant="normal-stone" onClick={() => setTab('deck')}>
              デッキを編集
            </GameButton>
          </div>
        )}

        <GameButton
          variant="primary-gold"
          size="lg"
          fullWidth
          crown
          onClick={handleSortie}
        >
          {playMode === 'ranked' ? 'ランクマッチへ' : '出陣する！'}
        </GameButton>
      </div>

      <AnimatePresence>{lobbyOpen && <RankedLobby onClose={() => setLobbyOpen(false)} />}</AnimatePresence>

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
                    {sheet === 'deck' ? 'デッキを選ぶ' : sheet === 'faction' ? '陣営を選ぶ（4陣営）' : '対戦形式と強さ'}
                  </h2>
                  <RoundButton onClick={() => setSheet('none')} aria-label="閉じる">
                    <PaintedIcon name="close" size={18} />
                  </RoundButton>
                </div>

                {sheet === 'faction' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {FACTIONS.map((fac) => (
                      <GameButton
                        key={fac.id}
                        size="sm"
                        fullWidth
                        variant={selectedFactionId === fac.id ? 'selected-royal' : 'normal-stone'}
                        onClick={() => {
                          setSelectedFactionId(fac.id);
                          setSheet('none');
                        }}
                      >
                        <PaintedIcon name={fac.icon} size={18} />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div>{fac.label}</div>
                          <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>{fac.desc}</div>
                        </div>
                      </GameButton>
                    ))}
                  </div>
                )}

                {sheet === 'deck' && data?.decks && (
                  <>
                    <div className={styles.chipLabel}>マイデッキ（4枠）</div>
                    <div className={styles.optionGrid}>
                      {customDecks.map((slot, idx) => (
                        <GameButton
                          key={`slot-${idx}`}
                          size="sm"
                          variant={selectedDeckId === 'custom' && activeCustomSlot === idx ? 'selected-royal' : 'normal-stone'}
                          onClick={() => {
                            selectCustomSlot(idx);
                            setSheet('none');
                          }}
                        >
                          ★ {slot.name || `デッキ${idx + 1}`}
                        </GameButton>
                      ))}
                    </div>
                    <div className={styles.chipLabel}>プリセットデッキ</div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <GameButton size="sm" variant="normal-stone" onClick={handleGeneratePassphrase}>
                            合言葉を自動生成
                          </GameButton>
                          <GameButton size="sm" variant="selected-royal" onClick={handleCopyInviteUrl}>
                            招待URLをコピー
                          </GameButton>
                          <GameButton size="sm" variant="normal-stone" onClick={handleCheckServer}>
                            接続テスト
                          </GameButton>
                        </div>
                        {serverStatus && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--cf-ink-muted)', wordBreak: 'break-all' }}>
                            {serverStatus}
                          </span>
                        )}
                      </div>
                    )}

                    {playMode !== 'cpu' && playMode !== 'casual' && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--cf-ink-muted)', fontWeight: 700 }}>
                        {playMode === 'local'
                          ? '端末1台で交互に手札を隠して対戦できます（受け渡し画面つき）。'
                          : '近い強さの相手と対戦し、勝ち負けでランクが上下します（オンラインサーバーが必要・通常モードのみ）。「ランクマッチへ」で相手を探します。'}
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
