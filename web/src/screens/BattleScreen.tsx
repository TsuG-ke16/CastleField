import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '../stores/useAppStore';
import { JsLegacyAdapter } from '../engine/jsLegacyAdapter';
import type { GameEvent, GameState, HandCard, PlayTarget } from '../engine/types';
import { soundManager } from '../audio/soundManager';
import { BattleFieldScene } from '../scene3d/BattleFieldScene';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { GameCard } from '../components/ui/GameCard';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import { ResultOverlay } from './ResultOverlay';
import styles from './BattleScreen.module.css';

interface MatchSummary {
  winner: string | null;
  turns: number;
  damageDealt: number;
  cardsPlayed: number;
  monstersDefeated: number;
}

export function BattleScreen() {
  const { data, selectedDeckId, cpuLevel, quality, exitBattle, grantRewardCoins } = useAppStore();
  const [matchSeed, setMatchSeed] = useState(() => Date.now());
  const adapterRef = useRef<JsLegacyAdapter | null>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<HandCard | null>(null);
  const [targets, setTargets] = useState<PlayTarget[]>([]);
  const [handCollapsed, setHandCollapsed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>('カードをタップ、または上へ出して発動！');
  const [shakePower, setShakePower] = useState(0);
  const [damagePop, setDamagePop] = useState<{ id: number; text: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [fuseMode, setFuseMode] = useState(false);
  const [fuseFirst, setFuseFirst] = useState<HandCard | null>(null);
  const [discardSelected, setDiscardSelected] = useState<string[]>([]);
  const [summary, setSummary] = useState<MatchSummary>({
    winner: null,
    turns: 1,
    damageDealt: 0,
    cardsPlayed: 0,
    monstersDefeated: 0,
  });

  const statsAccRef = useRef({ damageDealt: 0, cardsPlayed: 0, monstersDefeated: 0 });
  const popCounterRef = useRef(0);

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!data) return;
    statsAccRef.current = { damageDealt: 0, cardsPlayed: 0, monstersDefeated: 0 };
    const adapter = new JsLegacyAdapter(data, selectedDeckId, 'meadow', matchSeed);
    adapterRef.current = adapter;

    const unsub = adapter.onEvent((ev: GameEvent) => {
      if (ev.type === 'turnStarted') {
        if (ev.playerId === 'p1') setToastMsg('あなたの番！カードを出そう');
        else setToastMsg('相手の番です…');
      } else if (ev.type === 'castleDamaged') {
        const amt = Number(ev.amount || 0);
        if (ev.playerId === 'p2') statsAccRef.current.damageDealt += amt;
        soundManager.play('hit');
        setShakePower(Math.min(1.6, 0.5 + amt * 0.08));
        setTimeout(() => setShakePower(0), 220);
        setDamagePop({ id: ++popCounterRef.current, text: `-${amt}` });
        setTimeout(() => setDamagePop(null), 650);
      } else if (ev.type === 'soldierDeployed') {
        soundManager.play('deploy');
      } else if (ev.type === 'spellCast') {
        soundManager.play('spell');
      } else if (ev.type === 'castleHealed') {
        soundManager.play('heal');
      } else if (ev.type === 'cardPlayed' && ev.playerId === 'p1') {
        statsAccRef.current.cardsPlayed += 1;
      } else if (ev.type === 'monsterDefeated' && ev.playerId === 'p1') {
        statsAccRef.current.monstersDefeated += 1;
      } else if (ev.type === 'gameOver') {
        const w = String(ev.winner || '');
        if (w === 'p1') {
          soundManager.play('victory');
          grantRewardCoins(150);
        } else {
          soundManager.play('defeat');
          grantRewardCoins(40);
        }
        const finalSt = adapter.getState('p1');
        setSummary({
          winner: w || null,
          turns: finalSt.turn,
          damageDealt: statsAccRef.current.damageDealt,
          cardsPlayed: statsAccRef.current.cardsPlayed,
          monstersDefeated: statsAccRef.current.monstersDefeated,
        });
      }
    });

    adapter.start();
    const initial = adapter.getState('p1');
    setGameState(initial);
    setSelectedCard(null);
    setTargets([]);
    setDiscardSelected([]);

    return () => {
      unsub();
      adapter.dispose();
      adapterRef.current = null;
    };
  }, [data, selectedDeckId, matchSeed, grantRewardCoins]);

  // Automatic CPU turn driver when currentPlayer === 'p2' or p2 needs defense
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !gameState || gameState.phase === 'gameOver') return;

    const needCpuAct =
      gameState.currentPlayer === 'p2' ||
      (gameState.phase === 'defend' && gameState.defense?.defenderId === 'p2');

    if (!needCpuAct) return;
    const timer = setTimeout(() => {
      adapter.runCpuTurn('p2', cpuLevel);
      setGameState(adapter.getState('p1'));
    }, 520);
    return () => clearTimeout(timer);
  }, [gameState, cpuLevel]);

  const refreshState = () => {
    if (!adapterRef.current) return;
    setGameState(adapterRef.current.getState('p1'));
  };

  const p1 = gameState?.players.p1;
  const p2 = gameState?.players.p2;
  const myTurn = gameState?.currentPlayer === 'p1';
  const cards = data?.cards || {};

  const highlightRoadIds = useMemo(
    () => targets.map((t) => t.roadId).filter((x): x is string => Boolean(x)),
    [targets]
  );
  const highlightSoldierIds = useMemo(
    () => targets.map((t) => t.soldierId).filter((x): x is string => Boolean(x)),
    [targets]
  );
  const highlightMonsterIds = useMemo(
    () => targets.map((t) => t.monsterId).filter((x): x is string => Boolean(x)),
    [targets]
  );
  const highlightEnemyCastle = useMemo(
    () => targets.some((t) => t.playerId === 'p2' && !t.roadId),
    [targets]
  );

  const handleCardTap = (c: HandCard) => {
    const adapter = adapterRef.current;
    if (!adapter || !gameState) return;

    // Discard mode
    if (gameState.phase === 'discard' && myTurn) {
      setDiscardSelected((prev) =>
        prev.includes(c.cardId) ? prev.filter((id) => id !== c.cardId) : [...prev, c.cardId]
      );
      return;
    }

    // Fusion mode
    if (fuseMode) {
      if (!fuseFirst) {
        setFuseFirst(c);
        showToast(`${cards[c.type]?.name || '1枚目'} を選択。同じ種類の2枚目をタップ！`);
        return;
      }
      if (fuseFirst.cardId === c.cardId) {
        setFuseFirst(null);
        return;
      }
      const res = adapter.fuse(fuseFirst.cardId, c.cardId);
      setFuseFirst(null);
      setFuseMode(false);
      if (!res.ok) showToast(res.reason || '合成できませんでした');
      else {
        soundManager.play('spell');
        showToast('合成成功！より強いカードになった！');
      }
      refreshState();
      return;
    }

    if (selectedCard?.cardId === c.cardId) {
      // Tap again to play if single target or no target choice needed
      handlePlaySelected();
      return;
    }

    soundManager.play('card');
    const check = adapter.canPlayCard(c.cardId);
    if (!check.ok) {
      setSelectedCard(c);
      setTargets([]);
      showToast(check.reason || 'いまは出せません');
      return;
    }

    const tList = adapter.getTargets(c.cardId);
    setSelectedCard(c);
    setTargets(tList);
    if (tList.length > 1) {
      showToast('盤面の光っている場所（レーン／対象）をタップ！');
    } else {
      showToast('もう一度タップ、または「使う」で発動！');
    }
  };

  const executeWithTarget = (target?: PlayTarget) => {
    const adapter = adapterRef.current;
    if (!adapter || !selectedCard || !gameState) return;
    const res =
      gameState.phase === 'defend'
        ? adapter.defend(selectedCard.cardId, target)
        : adapter.playCard(selectedCard.cardId, target);

    if (!res.ok) {
      showToast(res.reason || '出せませんでした');
    } else {
      setSelectedCard(null);
      setTargets([]);
      showToast(`${cards[selectedCard.type]?.name || 'カード'} を発動！`);
    }
    refreshState();
  };

  const handlePlaySelected = () => {
    if (!selectedCard || !adapterRef.current) return;
    const check = adapterRef.current.canPlayCard(selectedCard.cardId);
    if (!check.ok) {
      showToast(check.reason || 'いまは出せません');
      return;
    }
    const tList = adapterRef.current.getTargets(selectedCard.cardId);
    if (tList.length <= 1) {
      executeWithTarget(tList[0]);
    } else {
      setTargets(tList);
      showToast('光っている場所（レーン／兵士）を選んでください');
    }
  };

  const handleEndTurn = () => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    setSelectedCard(null);
    setTargets([]);
    const res = adapter.endTurn();
    if (!res.ok) showToast(res.reason || 'ターンを終えられません');
    else showToast('相手の番です…');
    refreshState();
  };

  if (!gameState || !p1 || !p2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 900 }}>
        戦場を準備中…
      </div>
    );
  }

  const isDefensePrompt = gameState.phase === 'defend' && gameState.defense?.defenderId === 'p1';
  const needDiscardCount = gameState.phase === 'discard' && myTurn ? Math.max(0, (p1.hand?.length || 0) - p1.maxHand) : 0;

  return (
    <section className={styles.battleRoot} aria-label="バトル画面">
      <header className={styles.topHud}>
        <span className={`${styles.turnBadge} ${myTurn ? styles.turnMe : styles.turnOpp}`}>
          {isDefensePrompt ? '防御チャンス！' : myTurn ? 'あなたの番' : '相手の番'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`${styles.hudPill} tabular`}>
            {gameState.round}周目
          </span>
          {p1.maxMp !== undefined && (
            <span className={`${styles.hudPill} tabular`}>
              <PaintedIcon name="mp" size={14} />
              {p1.mp ?? 0}/{p1.maxMp}
            </span>
          )}
          <span className={`${styles.hudPill} tabular`}>
            山{gameState.deckCount ?? 0}
          </span>
          <RoundButton onClick={() => setShowMenu(true)} aria-label="対戦メニュー">
            <PaintedIcon name="settings" size={18} />
          </RoundButton>
        </div>
      </header>

      <div className={styles.arenaWrap}>
        <div className={styles.hpOverlayTop}>
          <div className={styles.castleSign}>
            <span>CPU ({cpuLevel})</span>
            <span>手札{p2.handCount}</span>
          </div>
          <div className={styles.castleSign}>
            <PaintedIcon name="heart" size={16} />
            <div className={styles.hpBarOuter}>
              <div
                className={styles.hpBarFillOpp}
                style={{ width: `${Math.max(0, Math.min(100, (p2.castleHp / p2.castleMaxHp) * 100))}%` }}
              />
            </div>
            <span className="tabular">{p2.castleHp}/{p2.castleMaxHp}</span>
          </div>
        </div>

        <AnimatePresence>
          {damagePop && (
            <motion.div
              key={damagePop.id}
              initial={{ scale: 0.4, y: 12, opacity: 1 }}
              animate={{ scale: 1.2, y: -34, opacity: 0 }}
              transition={{ duration: 0.6 }}
              className={styles.damagePop}
            >
              {damagePop.text}
            </motion.div>
          )}
        </AnimatePresence>

        <BattleFieldScene
          state={gameState}
          quality={quality}
          shakePower={shakePower}
          highlightRoadIds={highlightRoadIds}
          highlightSoldierIds={highlightSoldierIds}
          highlightMonsterIds={highlightMonsterIds}
          highlightEnemyCastle={highlightEnemyCastle}
          onSelectRoad={(roadId) => executeWithTarget(targets.find((t) => t.roadId === roadId))}
          onSelectSoldier={(soldierId) => executeWithTarget(targets.find((t) => t.soldierId === soldierId))}
          onSelectMonster={(monsterId) => executeWithTarget(targets.find((t) => t.monsterId === monsterId))}
          onSelectEnemyCastle={() => executeWithTarget(targets.find((t) => t.playerId === 'p2' && !t.roadId))}
        />

        <div className={styles.hpOverlayBottom}>
          <div className={styles.castleSign}>
            <span>あなた</span>
            {p1.armor > 0 && <span>🛡{p1.armor}</span>}
          </div>
          <div className={styles.castleSign}>
            <PaintedIcon name="heart" size={16} />
            <div className={styles.hpBarOuter}>
              <div
                className={styles.hpBarFillMe}
                style={{ width: `${Math.max(0, Math.min(100, (p1.castleHp / p1.castleMaxHp) * 100))}%` }}
              />
            </div>
            <span className="tabular">{p1.castleHp}/{p1.castleMaxHp}</span>
          </div>
        </div>
      </div>

      <footer className={styles.controlsDock}>
        <div className={styles.toastBanner}>{toastMsg}</div>
        <AnimatePresence>
          {selectedCard && cards[selectedCard.type] && !isDefensePrompt && (
            <motion.div
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 14, opacity: 0 }}
              className={styles.inspectBar}
            >
              <ParchmentSheet style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{cards[selectedCard.type].name}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
                    {cards[selectedCard.type].description ||
                      (targets.length > 1 ? '盤面の光るマスを選択してください' : 'タップで発動できます')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {adapterRef.current?.canPlayCard(selectedCard.cardId).ok && targets.length <= 1 && (
                    <GameButton size="sm" variant="primary-gold" onClick={handlePlaySelected}>
                      使う
                    </GameButton>
                  )}
                  <RoundButton onClick={() => { setSelectedCard(null); setTargets([]); setToastMsg(myTurn ? 'あなたの番！カードを出そう' : '相手の番です…'); }} aria-label="閉じる">
                    <PaintedIcon name="close" size={16} />
                  </RoundButton>
                </div>
              </ParchmentSheet>
            </motion.div>
          )}
        </AnimatePresence>

        {isDefensePrompt && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff3cd', padding: '6px 10px', borderRadius: 12, border: '2px solid #4a2e1a' }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>
              攻撃（{gameState.defense?.amount}）が飛んできた！防御カードを出すか選択：
            </span>
            <GameButton
              size="sm"
              variant="danger-ruby"
              onClick={() => {
                adapterRef.current?.passDefense();
                refreshState();
              }}
            >
              そのまま受ける
            </GameButton>
          </div>
        )}

        {needDiscardCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#ffe3cd', padding: '6px 10px', borderRadius: 12, border: '2px solid #4a2e1a' }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>
              手札上限オーバー！あと {needDiscardCount} 枚選んで捨てる ({discardSelected.length}/{needDiscardCount})
            </span>
            <GameButton
              size="sm"
              variant="primary-gold"
              disabled={discardSelected.length !== needDiscardCount}
              onClick={() => {
                adapterRef.current?.discard(discardSelected);
                setDiscardSelected([]);
                refreshState();
              }}
            >
              捨てる
            </GameButton>
          </div>
        )}

        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            <GameButton
              size="sm"
              variant={fuseMode ? 'selected-royal' : 'normal-stone'}
              disabled={!myTurn || gameState.phase !== 'main'}
              onClick={() => {
                const next = !fuseMode;
                setFuseMode(next);
                setFuseFirst(null);
                if (next) showToast('同じカードを2枚順番にタップして合成！');
              }}
            >
              {fuseMode ? '合成中' : '合成'}
            </GameButton>
            <GameButton
              size="sm"
              variant="normal-stone"
              disabled={!myTurn || gameState.phase !== 'main'}
              onClick={() => setShowUpgrades(true)}
            >
              <PaintedIcon name="coin" size={14} />
              <span className="tabular">{p1.coins}</span>
            </GameButton>
            <button
              type="button"
              onClick={() => setHandCollapsed((v) => !v)}
              style={{
                background: 'rgba(255,246,224,0.2)',
                color: '#fff6e0',
                border: '1.5px solid #ffd98a',
                borderRadius: 10,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {handCollapsed ? '▲' : '▼'}
            </button>
          </div>

          <GameButton
            size="md"
            variant="primary-gold"
            disabled={!myTurn || gameState.phase !== 'main'}
            onClick={handleEndTurn}
          >
            ターン終了
          </GameButton>
        </div>

        {!handCollapsed && (
          <div className={styles.handStrip} aria-label="手札">
            {(p1.hand || []).map((c) => {
              const def = cards[c.type];
              if (!def) return null;
              const playable = adapterRef.current?.canPlayCard(c.cardId).ok ?? false;
              const isSel = selectedCard?.cardId === c.cardId || discardSelected.includes(c.cardId);
              return (
                <div key={c.cardId} style={{ flexShrink: 0 }}>
                  <GameCard
                    typeKey={c.type}
                    card={def}
                    width={92}
                    selected={isSel}
                    disabled={myTurn && gameState.phase === 'main' && !playable}
                    onClick={() => handleCardTap(c)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </footer>

      {showUpgrades && data?.upgrades && (
        <div className={styles.modalBackdrop} onClick={() => setShowUpgrades(false)}>
          <div style={{ width: '100%', maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 16 }}>コインで強化（所持 {p1.coins}）</strong>
                <RoundButton onClick={() => setShowUpgrades(false)} aria-label="閉じる">
                  <PaintedIcon name="close" size={16} />
                </RoundButton>
              </div>
              {Object.entries(data.upgrades).map(([uid, u]) => (
                <GameButton
                  key={uid}
                  size="sm"
                  fullWidth
                  variant="normal-stone"
                  disabled={!adapterRef.current?.canBuyUpgrade(uid).ok}
                  onClick={() => {
                    adapterRef.current?.buyUpgrade(uid);
                    soundManager.play('coin');
                    refreshState();
                  }}
                >
                  {u.name}（🪙{u.cost}）
                </GameButton>
              ))}
            </ParchmentSheet>
          </div>
        </div>
      )}

      {showMenu && (
        <div className={styles.modalBackdrop} onClick={() => setShowMenu(false)}>
          <div style={{ width: '100%', maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 17, textAlign: 'center' }}>対戦メニュー</strong>
              <GameButton
                variant="danger-ruby"
                fullWidth
                onClick={() => {
                  setShowMenu(false);
                  adapterRef.current?.surrender('p1');
                  refreshState();
                }}
              >
                降参する
              </GameButton>
              <GameButton variant="normal-stone" fullWidth onClick={exitBattle}>
                ホームに戻る
              </GameButton>
              <GameButton variant="primary-gold" fullWidth onClick={() => setShowMenu(false)}>
                試合を続ける
              </GameButton>
            </ParchmentSheet>
          </div>
        </div>
      )}

      {gameState.phase === 'gameOver' && (
        <ResultOverlay
          won={summary.winner === 'p1'}
          turns={summary.turns}
          damageDealt={summary.damageDealt}
          cardsPlayed={summary.cardsPlayed}
          monstersDefeated={summary.monstersDefeated}
          onRematch={() => setMatchSeed(Date.now())}
          onHome={exitBattle}
        />
      )}
    </section>
  );
}
