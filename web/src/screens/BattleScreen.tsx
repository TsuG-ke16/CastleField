import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { computePlayerProgression, useAppStore } from '../stores/useAppStore';
import type { GameEngineAdapter } from '../engine/adapter';
import { cardTypeToImagePath, loadModeBundle } from '../engine/dataLoader';
import { JsLegacyAdapter } from '../engine/jsLegacyAdapter';
import { OnlineEngineAdapter, type OnlineConnStatus } from '../engine/onlineAdapter';
import { WasmEngineAdapter } from '../engine/wasmAdapter';
import { rankedApi, type RankedChange } from '../engine/rankedClient';
import { getSkinFilter } from '../engine/skinUtils';
import type { CardDef, GameEvent, GameState, HandCard, PlayTarget, StampDef } from '../engine/types';
import { soundManager } from '../audio/soundManager';
import { BattleFxOverlay, type BattleFxHandle } from '../pixi/BattleFxOverlay';
import { BattleFieldView } from '../scene3d/BattleFieldView';
import { GameButton, RoundButton } from '../components/ui/GameButton';
import { GameCard } from '../components/ui/GameCard';
import { PaintedIcon } from '../components/ui/PaintedIcon';
import { ParchmentSheet } from '../components/ui/Surfaces';
import { ResultOverlay } from './ResultOverlay';
import { FramedAvatar } from '../components/ui/FramedAvatar';
import styles from './BattleScreen.module.css';

interface MatchSummary {
  winner: string | null;
  turns: number;
  damageDealt: number;
  cardsPlayed: number;
  monstersDefeated: number;
}

function describeUpgrade(u: { description?: string; effect?: string; amount?: number }): string {
  if (u.description && u.description.trim()) return u.description;
  switch (u.effect) {
    case 'repairCastle':
      return `城HPを${u.amount ?? 0}回復`;
    case 'drawCards':
      return `カードを${u.amount ?? 0}枚引く`;
    case 'sharpenSoldiers':
      return `盤面の味方兵士の攻撃+${u.amount ?? 0}`;
    default:
      return 'コインで戦力を強化';
  }
}

function summarizeEvent(ev: GameEvent): string | null {
  switch (ev.type) {
    case 'turnStarted':
      return `ターン${ev.turn}: ${ev.playerId === 'p1' ? 'P1' : 'P2'} の行動開始`;
    case 'soldierDeployed':
      return `${ev.playerId === 'p1' ? 'P1' : 'P2'} が兵士を配置 (⚔${ev.attack} ❤${ev.hp})`;
    case 'spellCast':
      return `${ev.playerId === 'p1' ? 'P1' : 'P2'} が魔法発動`;
    case 'castleDamaged':
      return `${ev.playerId === 'p1' ? 'P1' : 'P2'} の城に ${ev.amount} ダメージ`;
    case 'castleHealed':
      return `${ev.playerId === 'p1' ? 'P1' : 'P2'} の城が ${ev.amount} 回復`;
    case 'monsterAppeared':
      return `野生の魔物が出現！(❤${ev.hp})`;
    case 'monsterDefeated':
      return `${ev.playerId === 'p1' ? 'P1' : 'P2'} が魔物を撃破 (+報酬)`;
    case 'cardsFused':
      return `カード合成成功！上位カードへ進化`;
    case 'spellReflected':
      return `反射で魔法を跳ね返した！(${ev.amount})`;
    case 'diceRolled': {
      const val = ev.roll ?? ev.value ?? ev.result ?? '';
      return `🎲 ダイス結果: ${val}`;
    }
    case 'gameOver':
      return ev.winner ? `決着！ ${ev.winner === 'p1' ? 'P1' : 'P2'} の勝利` : '引き分け';
    default:
      return null;
  }
}

/** ランクマッチで、相手が動かないまま勝ちを申し出られるまでの時間（サーバーの ranks.json の ranked.idleTurnMs と同じ） */
const IDLE_CLAIM_MS = 180_000;

export function BattleScreen() {
  const {
    data,
    mode,
    playMode,
    setPlayMode,
    selectedDeckId,
    selectedStageId,
    selectedFactionId,
    unlockedSkills,
    customDeck,
    customDecks,
    activeCustomSlot,
    cpuLevel,
    playerName,
    engineMode,
    onlinePassphrase,
    onlineServerUrl,
    selectedCastleSkin,
    selectedSoldierSkin,
    selectedBackSkin,
    quality,
    setQuality,
    muted,
    toggleMute,
    bgmMuted,
    toggleBgmMute,
    stats,
    mulliganEnabled,
    reducedMotion,
    tutorialSeen,
    markTutorialSeen,
    addMatchHistory,
    exitBattle,
    reportMatchReward,
    recordMatchResult,
    rankedTicket,
    setRankedLobbyRequested,
  } = useAppStore();
  const [rankedChange, setRankedChange] = useState<RankedChange | null>(null);
  const [idleSince, setIdleSince] = useState(() => Date.now());
  const [idleNow, setIdleNow] = useState(() => Date.now());
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const [matchSeed, setMatchSeed] = useState(() => Date.now());
  const adapterRef = useRef<GameEngineAdapter | null>(null);
  const fxRef = useRef<BattleFxHandle | null>(null);
  const modeCardsRef = useRef<Record<string, CardDef> | null>(null);
  const [modeCards, setModeCards] = useState<Record<string, CardDef> | null>(null);
  const [activeEngine, setActiveEngine] = useState<'rust-wasm' | 'js-legacy' | 'online' | 'factions' | 'classic'>(engineMode);
  const [onlineSeatId, setOnlineSeatId] = useState<'p1' | 'p2'>('p1');
  const [onlineStatus, setOnlineStatus] = useState<OnlineConnStatus | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [confirmedSide, setConfirmedSide] = useState<'p1' | 'p2'>('p1');
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<HandCard | null>(null);
  const [targets, setTargets] = useState<PlayTarget[]>([]);
  const [handCollapsed, setHandCollapsed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string>('カードをタップ、または上へ出して発動！');
  const [shakePower, setShakePower] = useState(0);
  const [damagePop, setDamagePop] = useState<{ id: number; text: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showStamps, setShowStamps] = useState(false);
  const [showEnvDetail, setShowEnvDetail] = useState(false);
  const [myStamp, setMyStamp] = useState<{ id: number; text: string } | null>(null);
  const [oppStamp, setOppStamp] = useState<{ id: number; text: string } | null>(null);
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [fuseMode, setFuseMode] = useState(false);
  const [fuseFirst, setFuseFirst] = useState<HandCard | null>(null);
  const [discardSelected, setDiscardSelected] = useState<string[]>([]);
  const [mulliganSelected, setMulliganSelected] = useState<string[]>([]);
  const [cutIn, setCutIn] = useState<{ id: number; name: string; typeKey: string; rarity: string } | null>(null);
  const [dicePop, setDicePop] = useState<{ id: number; text: string } | null>(null);
  const [turnBanner, setTurnBanner] = useState<{ id: number; mine: boolean; text: string } | null>(null);
  const prevTurnKeyRef = useRef<string | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const [summary, setSummary] = useState<MatchSummary>({
    winner: null,
    turns: 1,
    damageDealt: 0,
    cardsPlayed: 0,
    monstersDefeated: 0,
  });

  const statsAccRef = useRef({ damageDealt: 0, cardsPlayed: 0, monstersDefeated: 0 });
  const popCounterRef = useRef(0);
  const recordedMatchRef = useRef(false);
  const viewerSideRef = useRef<'p1' | 'p2'>('p1');
  const battleLogRef = useRef<string[]>([]);
  battleLogRef.current = battleLog;

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let unsubState: (() => void) | undefined;
    let created: GameEngineAdapter | null = null;
    statsAccRef.current = { damageDealt: 0, cardsPlayed: 0, monstersDefeated: 0 };
    recordedMatchRef.current = false;
    setOnlineError(null);
    setOnlineStatus(null);
    setConfirmedSide('p1');
    setBattleLog([]);
    setRankedChange(null);
    setClaimMsg(null);

    const initEngine = async () => {
      let adapter: GameEngineAdapter;
      let resolvedMode: 'rust-wasm' | 'js-legacy' | 'online' | 'factions' | 'classic' = 'js-legacy';
      let seat: 'p1' | 'p2' = 'p1';

      if ((mode === 'factions' || mode === 'classic') && (playMode === 'casual' || playMode === 'ranked')) {
        // 合言葉対戦・ランクマッチのサーバーは通常モードだけ（相手のいない試合で止まらないように、理由を出す）
        setOnlineError('合言葉対戦・ランクマッチは「通常モード」で遊べます。4陣営・クラシックは CPU対戦か同じ端末で遊んでください。');
        return;
      }
      if (mode === 'factions' || mode === 'classic') {
        const bundle = await loadModeBundle(mode, data);
        if (cancelled) return;
        modeCardsRef.current = bundle.cards;
        setModeCards(bundle.cards);
        adapter = JsLegacyAdapter.forMode(bundle, data, {
          factionId: selectedFactionId,
          skills: unlockedSkills,
          stage: selectedStageId,
          seed: matchSeed,
          mulligan: mulliganEnabled,
        });
        resolvedMode = mode;
      } else {
        modeCardsRef.current = null;
        setModeCards(null);
        if (playMode === 'ranked') {
          if (!rankedTicket) {
            setOnlineError('ランクマッチは、ホームの「ランクマッチへ」から相手を探してください。');
            return;
          }
          const online = OnlineEngineAdapter.attach(data, rankedTicket.token, rankedTicket.playerId, rankedTicket.state, {
            serverUrl: onlineServerUrl,
            onStatus: (st) => !cancelled && setOnlineStatus(st),
          });
          adapter = online;
          resolvedMode = 'online';
          seat = online.seatId;
          unsubState = online.onStateUpdate((nextSt) => {
            if (!cancelled) setGameState(nextSt);
          });
        } else if (playMode === 'casual' && !onlinePassphrase.trim()) {
          setOnlineError('合言葉が入っていません。ホームの「対戦形式」で合言葉を入れてください。');
          return;
        } else if (playMode === 'casual' && onlinePassphrase.trim()) {
          try {
            const online = await OnlineEngineAdapter.connect(data, onlinePassphrase.trim(), {
              serverUrl: onlineServerUrl,
              name: playerNameRef.current,
              onStatus: (st) => !cancelled && setOnlineStatus(st),
            });
            adapter = online;
            resolvedMode = 'online';
            seat = online.seatId;
            unsubState = online.onStateUpdate((nextSt) => {
              if (!cancelled) setGameState(nextSt);
            });
          } catch (err) {
            if (!cancelled) {
              setOnlineError(err instanceof Error ? err.message : String(err));
            }
            return;
          }
        } else if (engineMode === 'rust-wasm') {
          try {
            adapter = await WasmEngineAdapter.create(
              data,
              selectedDeckId,
              selectedStageId,
              matchSeed,
              customDeck,
              mulliganEnabled
            );
            resolvedMode = 'rust-wasm';
          } catch (err) {
            console.warn('[CastleField] Rust WASM load failed, falling back to JS engine:', err);
            adapter = new JsLegacyAdapter(data, selectedDeckId, selectedStageId, matchSeed, customDeck, mulliganEnabled);
          }
        } else {
          adapter = new JsLegacyAdapter(data, selectedDeckId, selectedStageId, matchSeed, customDeck, mulliganEnabled);
        }
      }

      if (cancelled) {
        adapter.dispose();
        return;
      }

      created = adapter;
      adapterRef.current = adapter;
      viewerSideRef.current = seat;
      setOnlineSeatId(seat);
      setActiveEngine(resolvedMode);

      unsub = adapter.onEvent((ev: GameEvent) => {
        const line = summarizeEvent(ev);
        if (line) {
          setBattleLog((prev) => [line, ...prev].slice(0, 20));
        }
        const myS = viewerSideRef.current;
        if (ev.type === 'turnStarted') {
          if (ev.playerId === myS || playMode === 'local') {
            soundManager.play('turn');
            setToastMsg('あなたの番！カードを出そう');
          } else {
            setToastMsg('相手の番です…');
          }
        } else if (ev.type === 'castleDamaged') {
          const amt = Number(ev.amount || 0);
          if (ev.playerId !== myS) statsAccRef.current.damageDealt += amt;
          soundManager.play('hit');
          fxRef.current?.burst('fire');
          if (!reducedRef.current) {
            setShakePower(Math.min(1.6, 0.5 + amt * 0.08));
            setTimeout(() => setShakePower(0), 220);
          }
          setDamagePop({ id: ++popCounterRef.current, text: `-${amt}` });
          setTimeout(() => setDamagePop(null), 650);
        } else if (ev.type === 'soldierDeployed') {
          soundManager.play('deploy');
          fxRef.current?.burst('deploy');
        } else if (ev.type === 'soldiersClashed') {
          soundManager.play('clash');
          fxRef.current?.burst('clash');
        } else if (ev.type === 'spellCast') {
          const stName = String(ev.spellType || '').toLowerCase();
          const fxKind =
            stName.includes('thunder') || stName.includes('bolt') || stName.includes('lightning')
              ? 'thunder'
              : stName.includes('water') || stName.includes('aqua') || stName.includes('ice') || stName.includes('frost') || stName.includes('spring') || stName.includes('wave')
                ? 'water'
                : stName.includes('wind') || stName.includes('gale') || stName.includes('leaf') || stName.includes('storm')
                  ? 'wind'
                  : stName.includes('earth') || stName.includes('quake') || stName.includes('rock') || stName.includes('root') || stName.includes('meteor') || stName.includes('hammer')
                    ? 'earth'
                    : 'fire';
          soundManager.play(fxKind === 'thunder' ? 'thunder' : 'spell');
          fxRef.current?.burst(fxKind);
        } else if (ev.type === 'spellReflected') {
          soundManager.play('shield');
          fxRef.current?.burst('shield');
        } else if (ev.type === 'cardsFused') {
          soundManager.play('fuse');
          fxRef.current?.burst('fuse');
        } else if (ev.type === 'castleHealed') {
          soundManager.play('heal');
          fxRef.current?.burst('heal');
        } else if (ev.type === 'cardPlayed') {
          if (ev.playerId === myS) statsAccRef.current.cardsPlayed += 1;
          const cardType = String(ev.cardType || '');
          const def = (modeCardsRef.current || data.cards)[cardType];
          if (def && (def.rarity === 'epic' || def.rarity === 'legendary')) {
            const cid = ++popCounterRef.current;
            setCutIn({ id: cid, name: def.name, typeKey: cardType, rarity: def.rarity });
            setTimeout(() => setCutIn((cur) => (cur?.id === cid ? null : cur)), 950);
          }
        } else if (ev.type === 'monsterAppeared') {
          soundManager.play('monster');
        } else if (ev.type === 'monsterDefeated') {
          soundManager.play('monsterDown');
          if (ev.playerId === myS) statsAccRef.current.monstersDefeated += 1;
        } else if (ev.type === 'diceRolled') {
          const val = ev.roll ?? ev.value ?? ev.result ?? '';
          const did = ++popCounterRef.current;
          soundManager.play('dice');
          setDicePop({ id: did, text: `🎲 ダイス結果: ${val}` });
          setTimeout(() => setDicePop((cur) => (cur?.id === did ? null : cur)), 1350);
        } else if (ev.type === 'stampSent' && ev.playerId !== myS) {
          soundManager.play('stamp');
          const sid = String(ev.stampId || '');
          const found = (data.stamps || []).find((s) => s.id === sid);
          const id = ++popCounterRef.current;
          setOppStamp({ id, text: found ? `${found.icon} ${found.label}` : sid });
          setTimeout(() => setOppStamp((cur) => (cur?.id === id ? null : cur)), 2200);
        } else if (ev.type === 'rankedResult') {
          const changes = (ev.changes || {}) as Record<string, RankedChange>;
          const mine = changes[viewerSideRef.current];
          if (mine) setRankedChange(mine);
        } else if (ev.type === 'gameOver') {
          const w = String(ev.winner || '');
          const won = w === myS;
          const finalSt = adapter.getState(myS);
          if (!recordedMatchRef.current) {
            recordedMatchRef.current = true;
            recordMatchResult(won, statsAccRef.current.cardsPlayed);
            addMatchHistory({
              id: `${Date.now()}`,
              at: Date.now(),
              mode,
              playMode,
              stage: finalSt.stage || selectedStageId,
              won,
              turns: finalSt.turn,
              damageDealt: statsAccRef.current.damageDealt,
              cardsPlayed: statsAccRef.current.cardsPlayed,
              monstersDefeated: statsAccRef.current.monstersDefeated,
              deckLabel:
                selectedDeckId === 'custom'
                  ? customDecks[activeCustomSlot]?.name || `デッキ${activeCustomSlot + 1}`
                  : data.decks?.[selectedDeckId]?.name || selectedDeckId,
              log: battleLogRef.current.slice(0, 15),
            });
            if (won) {
              soundManager.play('victory');
              fxRef.current?.burst('victory');
              reportMatchReward(true, playMode === 'ranked');
            } else {
              soundManager.play('defeat');
              reportMatchReward(false, playMode === 'ranked');
            }
          }
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
      const initial = adapter.getState(seat);
      setGameState(initial);
      setSelectedCard(null);
      setTargets([]);
      setDiscardSelected([]);
      setMulliganSelected([]);
    };

    void initEngine();

    return () => {
      cancelled = true;
      unsub?.();
      unsubState?.();
      created?.dispose();
      adapterRef.current = null;
    };
  }, [
    data,
    mode,
    playMode,
    selectedDeckId,
    selectedStageId,
    selectedFactionId,
    unlockedSkills,
    customDeck,
    matchSeed,
    engineMode,
    mulliganEnabled,
    onlinePassphrase,
    onlineServerUrl,
    rankedTicket,
    reportMatchReward,
    recordMatchResult,
  ]);

  // ランクマッチ：相手が長く動かないとき、待っている側は勝ちを申し出られる（サーバーが時間を確かめる）
  useEffect(() => {
    setIdleSince(Date.now());
    setClaimMsg(null);
  }, [gameState]);
  useEffect(() => {
    if (playMode !== 'ranked') return;
    const iv = window.setInterval(() => setIdleNow(Date.now()), 5000);
    return () => window.clearInterval(iv);
  }, [playMode]);

  const activeSide: 'p1' | 'p2' = useMemo(() => {
    if (playMode === 'local' && gameState) {
      if (gameState.phase === 'defend' && gameState.defense?.defenderId) {
        return gameState.defense.defenderId === 'p2' ? 'p2' : 'p1';
      }
      return gameState.currentPlayer === 'p2' ? 'p2' : 'p1';
    }
    return onlineSeatId;
  }, [playMode, gameState, onlineSeatId]);

  viewerSideRef.current = activeSide;
  const oppSide: 'p1' | 'p2' = activeSide === 'p1' ? 'p2' : 'p1';

  useEffect(() => {
    if (!gameState || gameState.phase !== 'main') return;
    const turnKey = `${gameState.turn}:${gameState.currentPlayer}`;
    if (prevTurnKeyRef.current === turnKey) return;
    prevTurnKeyRef.current = turnKey;
    const mine = gameState.currentPlayer === activeSide;
    const bid = ++popCounterRef.current;
    setTurnBanner({ id: bid, mine, text: mine ? '⚔ あなたのターン' : '🛡 相手のターン' });
    const t = window.setTimeout(() => setTurnBanner((cur) => (cur?.id === bid ? null : cur)), 780);
    return () => window.clearTimeout(t);
  }, [gameState?.turn, gameState?.currentPlayer, gameState?.phase, activeSide]);

  // Automatic CPU turn driver only when playMode === 'cpu'
  useEffect(() => {
    const adapter = adapterRef.current;
    if (playMode !== 'cpu' || !adapter || !gameState || gameState.phase === 'gameOver') return;

    const needCpuAct =
      gameState.currentPlayer === 'p2' ||
      (gameState.phase === 'defend' && gameState.defense?.defenderId === 'p2');

    if (!needCpuAct) return;
    const timer = setTimeout(() => {
      adapter.runCpuTurn('p2', cpuLevel);
      setGameState(adapter.getState('p1'));
    }, 520);
    return () => clearTimeout(timer);
  }, [playMode, gameState, cpuLevel]);

  const refreshState = () => {
    if (!adapterRef.current) return;
    if (playMode === 'local') {
      const probe = adapterRef.current.getState(null);
      const nextSide: 'p1' | 'p2' =
        probe.phase === 'defend' && probe.defense?.defenderId
          ? (probe.defense.defenderId === 'p2' ? 'p2' : 'p1')
          : probe.currentPlayer === 'p2'
            ? 'p2'
            : 'p1';
      setGameState(adapterRef.current.getState(nextSide));
    } else {
      setGameState(adapterRef.current.getState(onlineSeatId));
    }
  };

  const pMe = gameState?.players[activeSide];
  const pOpp = gameState?.players[oppSide];
  const myTurn = gameState?.currentPlayer === activeSide;
  const cards = modeCards || data?.cards || {};

  useEffect(() => {
    if (!pMe || pMe.castleMaxHp <= 0) return;
    const hpRatio = pMe.castleHp / pMe.castleMaxHp;
    const hasMonster = (gameState?.monsters?.length || 0) > 0;
    const isNight = gameState?.time === 'night';
    soundManager.setBgmMode(
      hpRatio <= 0.34 ? 'pinch' : hasMonster ? 'monster' : isNight ? 'night' : 'battle'
    );
  }, [pMe?.castleHp, pMe?.castleMaxHp, gameState?.monsters?.length, gameState?.time]);

  const myCastleFilter = useMemo(
    () => getSkinFilter(data, selectedCastleSkin, 'blue'),
    [data, selectedCastleSkin]
  );
  const mySoldierFilter = useMemo(
    () => getSkinFilter(data, selectedSoldierSkin, 'blue'),
    [data, selectedSoldierSkin]
  );
  const myBackFilter = useMemo(
    () => getSkinFilter(data, selectedBackSkin, 'blue'),
    [data, selectedBackSkin]
  );

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
    () => targets.some((t) => t.playerId === oppSide && !t.roadId),
    [targets, oppSide]
  );

  const handleCardQuickPlay = (c: HandCard) => {
    const adapter = adapterRef.current;
    if (!adapter || !gameState) return;
    const check = adapter.canPlayCard(c.cardId);
    if (!check.ok && !check.needsTarget) {
      setSelectedCard(c);
      setTargets([]);
      showToast(check.reason || 'いまは出せません');
      return;
    }
    const tList = adapter.getTargets(c.cardId);
    if (tList.length <= 1) {
      const res =
        gameState.phase === 'defend'
          ? adapter.defend(c.cardId, tList[0])
          : adapter.playCard(c.cardId, tList[0]);
      if (res.ok) {
        setSelectedCard(null);
        setTargets([]);
        showToast(`${cards[c.type]?.name || 'カード'} を発動！`);
      } else {
        showToast(res.reason || '出せませんでした');
      }
      refreshState();
    } else {
      setSelectedCard(c);
      setTargets(tList);
      showToast('盤面の光っている場所（レーン／対象）をタップ！');
    }
  };

  const handleCardTap = (c: HandCard) => {
    const adapter = adapterRef.current;
    if (!adapter || !gameState) return;

    if (gameState.phase === 'mulligan') {
      setMulliganSelected((prev) =>
        prev.includes(c.cardId) ? prev.filter((id) => id !== c.cardId) : [...prev, c.cardId]
      );
      return;
    }

    if (gameState.phase === 'discard' && myTurn) {
      setDiscardSelected((prev) =>
        prev.includes(c.cardId) ? prev.filter((id) => id !== c.cardId) : [...prev, c.cardId]
      );
      return;
    }

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
      handlePlaySelected();
      return;
    }

    soundManager.play('card');
    const check = adapter.canPlayCard(c.cardId);
    if (!check.ok && !check.needsTarget) {
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
      showToast('もう一度タップ・上にスワイプ、または「使う」で発動！');
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
    if (!check.ok && !check.needsTarget) {
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
    else {
      if (!tutorialSeen) markTutorialSeen();
      showToast(playMode === 'local' ? '端末を相手へ渡してください…' : '相手の番です…');
    }
    refreshState();
  };

  const handleSendStamp = (stamp: StampDef) => {
    soundManager.play('stamp');
    setShowStamps(false);
    const id = ++popCounterRef.current;
    setMyStamp({ id, text: `${stamp.icon} ${stamp.label}` });
    setTimeout(() => setMyStamp((cur) => (cur?.id === id ? null : cur)), 2200);
    if (adapterRef.current instanceof OnlineEngineAdapter) {
      adapterRef.current.sendStamp(stamp.id);
    } else if (playMode === 'cpu' && (data?.stamps?.length || 0) > 0 && Math.random() < 0.55) {
      const pool = (data?.stamps || []).filter((s) => ['hello', 'nice', 'go', 'smug', 'gg'].includes(s.id));
      const reply = pool[Math.floor(Math.random() * Math.max(1, pool.length))] || stamp;
      setTimeout(() => {
        const oid = ++popCounterRef.current;
        setOppStamp({ id: oid, text: `${reply.icon} ${reply.label}` });
        setTimeout(() => setOppStamp((cur) => (cur?.id === oid ? null : cur)), 2200);
      }, 520);
    }
  };

  const shortcutRef = useRef({
    handleCardTap: (_c: HandCard) => {},
    handleEndTurn: () => {},
    hand: [] as HandCard[],
    phase: '' as string,
    myTurn: false,
    showMenu: false,
    showUpgrades: false,
    showStamps: false,
    showEnvDetail: false,
    selectedCard: null as HandCard | null,
    fuseMode: false,
    blocked: false,
  });
  shortcutRef.current = {
    handleCardTap,
    handleEndTurn,
    hand: pMe?.hand || [],
    phase: gameState?.phase || '',
    myTurn,
    showMenu,
    showUpgrades,
    showStamps,
    showEnvDetail,
    selectedCard,
    fuseMode,
    blocked: Boolean(onlineError || !gameState || (playMode === 'local' && activeSide !== confirmedSide)),
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const s = shortcutRef.current;
      if (s.blocked || s.phase === 'gameOver') return;
      if (e.key === 'Escape') {
        if (s.showUpgrades) setShowUpgrades(false);
        else if (s.showStamps) setShowStamps(false);
        else if (s.showEnvDetail) setShowEnvDetail(false);
        else if (s.showMenu) setShowMenu(false);
        else if (s.selectedCard || s.fuseMode) {
          setSelectedCard(null);
          setTargets([]);
          setFuseMode(false);
          setFuseFirst(null);
        } else {
          setShowMenu(true);
        }
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && !s.showMenu && !s.showUpgrades && !s.selectedCard && s.myTurn && s.phase === 'main') {
        e.preventDefault();
        s.handleEndTurn();
        return;
      }
      if (e.key >= '1' && e.key <= '9' && !s.showMenu && !s.showUpgrades && s.myTurn) {
        const card = s.hand[Number(e.key) - 1];
        if (card) s.handleCardTap(card);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (onlineError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }}>
        <ParchmentSheet style={{ maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 17 }}>オンライン接続エラー</strong>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{onlineError}</p>
          <GameButton
            variant="primary-gold"
            fullWidth
            onClick={() => {
              setOnlineError(null);
              setPlayMode('cpu');
              setMatchSeed(Date.now());
            }}
          >
            CPU対戦へ切り替える
          </GameButton>
          <GameButton variant="normal-stone" fullWidth onClick={exitBattle}>
            ホームに戻る
          </GameButton>
        </ParchmentSheet>
      </div>
    );
  }

  if (!gameState || !pMe || !pOpp) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, fontWeight: 900 }}>
        <div>{playMode === 'casual' || playMode === 'ranked' ? 'オンライン戦場へ接続中…' : '戦場を準備中…'}</div>
        <GameButton size="sm" variant="normal-stone" onClick={exitBattle}>
          キャンセル
        </GameButton>
      </div>
    );
  }

  const isDefensePrompt = gameState.phase === 'defend' && gameState.defense?.defenderId === activeSide;
  const needDiscardCount = gameState.phase === 'discard' && myTurn ? Math.max(0, (pMe.hand?.length || 0) - pMe.maxHand) : 0;
  const showHandoff = playMode === 'local' && gameState.phase !== 'gameOver' && activeSide !== confirmedSide;
  const stageKey = gameState.stage || (selectedStageId === 'random' ? 'meadow' : selectedStageId);
  const stageInfo = data?.stages?.[stageKey];

  return (
    <section className={styles.battleRoot} aria-label="バトル画面">
      <header className={styles.topHud}>
        <span className={`${styles.turnBadge} ${myTurn ? styles.turnMe : styles.turnOpp}`}>
          {isDefensePrompt
            ? '防御チャンス！'
            : playMode === 'local'
              ? `${activeSide === 'p1' ? 'P1(青)' : 'P2(赤)'} の番`
              : myTurn
                ? 'あなたの番'
                : '相手の番'}
        </span>

        <div className={styles.hudRight}>
          <span
            className={styles.hudPill}
            title={
              activeEngine === 'online'
                ? 'Rustサーバー同期オンライン'
                : activeEngine === 'factions'
                  ? '4陣営モード稼働中'
                  : activeEngine === 'classic'
                    ? 'クラシックモード稼働中'
                    : activeEngine === 'rust-wasm'
                      ? 'Rust WebAssembly エンジン稼働中'
                      : 'Legacy JS エンジン稼働中'
            }
          >
            {activeEngine === 'online' ? (
              onlineStatus === 'waiting' ? (
                <>⏳<span className={styles.engineText}> 相手待ち</span></>
              ) : onlineStatus === 'reconnecting' ? (
                <>🟡<span className={styles.engineText}> 再接続中</span></>
              ) : onlineStatus === 'closed' ? (
                <>🔴<span className={styles.engineText}> 切断</span></>
              ) : (
                <>🟢<span className={styles.engineText}> オンライン</span></>
              )
            ) : activeEngine === 'factions' ? (
              <>⚔<span className={styles.engineText}> 4陣営</span></>
            ) : activeEngine === 'classic' ? (
              <>📜<span className={styles.engineText}> クラシック</span></>
            ) : activeEngine === 'rust-wasm' ? (
              <>🦀<span className={styles.engineText}> Rust</span></>
            ) : (
              'JS'
            )}
          </span>
          <span className={`${styles.hudPill} tabular`}>{gameState.round}周</span>
          {pMe.maxMp !== undefined && (
            <span className={`${styles.hudPill} tabular`}>
              <PaintedIcon name="mp" size={14} />
              {pMe.mp ?? 0}/{pMe.maxMp}
            </span>
          )}
          <span className={`${styles.hudPill} tabular`}>
            <img
              src="/assets/ui/card-back.png"
              alt="山札"
              style={{ width: 11, height: 15, objectFit: 'contain', filter: myBackFilter }}
            />
            山{gameState.deckCount ?? 0} 捨{gameState.discardCount ?? 0}
          </span>
          <RoundButton onClick={() => setShowMenu(true)} aria-label="対戦メニュー">
            <PaintedIcon name="settings" size={18} />
          </RoundButton>
        </div>
      </header>

      {activeEngine === 'online' && onlineStatus === 'reconnecting' && (
        <div
          role="status"
          style={{
            padding: '5px 10px',
            background: '#fff3cd',
            borderBottom: '2px solid #4a2e1a',
            color: '#6b4200',
            fontSize: 11,
            fontWeight: 900,
            textAlign: 'center',
          }}
        >
          🟡 サーバーと再接続しています… 電波が安定すると自動で再開します
        </div>
      )}

      {playMode === 'ranked' &&
        gameState.phase !== 'gameOver' &&
        (gameState.phase === 'defend' ? gameState.defense?.defenderId !== activeSide : !myTurn) &&
        idleNow - idleSince >= IDLE_CLAIM_MS && (
          <div className={styles.idleClaim} role="status">
            <span>相手が動きません</span>
            <GameButton
              size="sm"
              variant="selected-royal"
              onClick={async () => {
                const token = rankedTicket?.token;
                if (!token) return;
                try {
                  const r = await rankedApi.claimIdle(onlineServerUrl, token);
                  if (!r.ok) setClaimMsg(r.reason || 'まだ申し出られません');
                  else if (r.state) setGameState(r.state);
                } catch {
                  setClaimMsg('サーバーにつながりません');
                }
              }}
            >
              勝ちを申し出る
            </GameButton>
            {claimMsg && <span className={styles.idleClaimMsg}>{claimMsg}</span>}
          </div>
        )}

      <div className={`${styles.arenaWrap} ${isDefensePrompt ? styles.defendAlert : ''}`}>
        <div className={styles.hpOverlayTop}>
          <div className={styles.castleSign}>
            {playMode === 'ranked' && rankedTicket?.opponent && (
              // ランクマッチの相手：アバターと、サーバーが認めたフレーム・ランク
              <span style={{ display: 'inline-flex', margin: rankedTicket.opponent.iconFrame ? '0 6px 0 4px' : 0 }}>
                <FramedAvatar
                  cardType={rankedTicket.opponent.avatar || 'infantry'}
                  frameId={rankedTicket.opponent.iconFrame}
                  size={24}
                  alt="相手のアバター"
                />
              </span>
            )}
            <span>
              {playMode === 'local'
                ? oppSide === 'p1'
                  ? 'P1 (青)'
                  : 'P2 (赤)'
                : playMode === 'casual'
                  ? '対戦相手'
                  : playMode === 'ranked'
                    ? rankedTicket?.opponentName || '対戦相手'
                    : `CPU (${cpuLevel})`}
            </span>
            {playMode === 'ranked' && rankedTicket?.opponent?.rank && (
              <span style={{ color: rankedTicket.opponent.rank.color, textShadow: '0 1px 0 rgba(74,46,26,0.5)' }}>
                {rankedTicket.opponent.rank.divisionLabel}
              </span>
            )}
            <span>手札{pOpp.handCount}</span>
            {pOpp.castleHp > 0 && pOpp.castleHp <= Math.floor(pOpp.castleMaxHp / 3) && (
              <span className={styles.odBadge}>⚡OD</span>
            )}
          </div>
          <div className={styles.castleSign}>
            <PaintedIcon name="heart" size={16} />
            <div className={styles.hpBarOuter}>
              <div
                className={styles.hpBarFillOpp}
                style={{ width: `${Math.max(0, Math.min(100, (pOpp.castleHp / pOpp.castleMaxHp) * 100))}%` }}
              />
            </div>
            <span className="tabular">{pOpp.castleHp}/{pOpp.castleMaxHp}</span>
          </div>
        </div>

        <div className={styles.envBadges}>
          <button
            type="button"
            className={styles.envPill}
            onClick={() => setShowEnvDetail((v) => !v)}
            aria-label="地形と天候の詳細"
          >
            {stageInfo?.icon || '🌿'} {(stageInfo?.name || '草原').split('（')[0]} ⓘ
          </button>
          {gameState.weather && (
            <button
              type="button"
              className={styles.envPill}
              onClick={() => setShowEnvDetail((v) => !v)}
            >
              ☁ {gameState.weather.name || gameState.weather.id}
            </button>
          )}
          {gameState.time === 'night' && (
            <button
              type="button"
              className={styles.envPill}
              onClick={() => setShowEnvDetail((v) => !v)}
            >
              🌙 夜
            </button>
          )}
        </div>

        {showEnvDetail && (
          <div className={styles.envPopover}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>
                  {stageInfo?.icon || '🌿'} {stageInfo?.name || '草原'}
                </strong>
                <button
                  type="button"
                  onClick={() => setShowEnvDetail(false)}
                  aria-label="地形詳細を閉じる"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)', lineHeight: 1.5 }}>
                {stageInfo?.description || '標準の戦場です。'}
              </div>
              {gameState.weather && (
                <div style={{ fontSize: 11, fontWeight: 800, borderTop: '1px dashed #c9b075', paddingTop: 4 }}>
                  ☁ {gameState.weather.name || gameState.weather.id}:{' '}
                  {data?.weather?.[gameState.weather.id]?.description || '戦場全体に天候効果が発生中'}
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 800 }}>
                {gameState.time === 'night' ? '🌙 夜：獣・隠密・魔物の攻撃が強化' : '☀ 昼：通常コンディション'}
              </div>
            </ParchmentSheet>
          </div>
        )}

        <AnimatePresence>
          {dicePop && (
            <motion.div
              key={dicePop.id}
              initial={{ scale: 0.78, x: '-50%', y: -8, opacity: 0 }}
              animate={{ scale: 1, x: '-50%', y: 0, opacity: 1 }}
              exit={{ scale: 0.85, x: '-50%', opacity: 0 }}
              className={styles.diceBanner}
            >
              {dicePop.text}
            </motion.div>
          )}
        </AnimatePresence>

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

        <AnimatePresence>
          {turnBanner && (
            <motion.div
              key={turnBanner.id}
              initial={reducedMotion ? { opacity: 1, x: '-50%', y: '-50%' } : { scale: 0.8, x: '-50%', y: '-42%', opacity: 0 }}
              animate={{ scale: 1, x: '-50%', y: '-50%', opacity: 1 }}
              exit={reducedMotion ? { opacity: 0, x: '-50%', y: '-50%' } : { scale: 0.94, x: '-50%', y: '-56%', opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.2 }}
              className={`${styles.turnBanner} ${turnBanner.mine ? styles.turnBannerMe : styles.turnBannerOpp}`}
            >
              {turnBanner.text}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {cutIn && (
            <motion.div
              key={cutIn.id}
              initial={{ scale: 0.72, x: '-50%', y: '-35%', opacity: 0 }}
              animate={{ scale: 1, x: '-50%', y: '-50%', opacity: 1 }}
              exit={{ scale: 0.9, x: '-50%', y: '-60%', opacity: 0 }}
              transition={{ duration: 0.22 }}
              className={styles.cutInBanner}
            >
              <img
                src={cardTypeToImagePath(cutIn.typeKey)}
                alt={cutIn.name}
                style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 10, border: '2px solid #ffe37a' }}
              />
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#ffe37a', letterSpacing: 1 }}>
                  {cutIn.rarity === 'legendary' ? '★ LEGENDARY ★' : '◆ EPIC ◆'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{cutIn.name}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {oppStamp && (
            <motion.div
              key={oppStamp.id}
              initial={{ scale: 0.7, y: -6, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className={styles.stampBubble}
              style={{ top: 52 }}
            >
              {oppStamp.text}
            </motion.div>
          )}
          {myStamp && (
            <motion.div
              key={myStamp.id}
              initial={{ scale: 0.7, y: 6, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className={styles.stampBubble}
              style={{ bottom: 52 }}
            >
              {myStamp.text}
            </motion.div>
          )}
        </AnimatePresence>

        <BattleFieldView
          state={gameState}
          quality={quality}
          shakePower={shakePower}
          stageId={stageKey}
          viewerSide={activeSide}
          myCastleFilter={myCastleFilter}
          mySoldierFilter={mySoldierFilter}
          highlightRoadIds={highlightRoadIds}
          highlightSoldierIds={highlightSoldierIds}
          highlightMonsterIds={highlightMonsterIds}
          highlightEnemyCastle={highlightEnemyCastle}
          onSelectRoad={(roadId) => executeWithTarget(targets.find((t) => t.roadId === roadId))}
          onSelectSoldier={(soldierId) => executeWithTarget(targets.find((t) => t.soldierId === soldierId))}
          onSelectMonster={(monsterId) => executeWithTarget(targets.find((t) => t.monsterId === monsterId))}
          onSelectEnemyCastle={() => executeWithTarget(targets.find((t) => t.playerId === oppSide && !t.roadId))}
        />

        <BattleFxOverlay
          ref={fxRef}
          stageId={stageKey}
          weatherId={gameState.weather?.id}
          isNight={gameState.time === 'night'}
          quality={quality}
          reducedMotion={reducedMotion}
        />

        <div className={styles.hpOverlayBottom}>
          <div className={styles.castleSign}>
            <span>{playMode === 'local' ? (activeSide === 'p1' ? 'P1 (青)' : 'P2 (赤)') : 'あなた'}</span>
            {pMe.armor > 0 && <span>🛡{pMe.armor}</span>}
            {pMe.castleHp > 0 && pMe.castleHp <= Math.floor(pMe.castleMaxHp / 3) && (
              <span className={styles.odBadge}>⚡OD</span>
            )}
          </div>
          <div className={styles.castleSign}>
            <PaintedIcon name="heart" size={16} />
            <div className={styles.hpBarOuter}>
              <div
                className={styles.hpBarFillMe}
                style={{ width: `${Math.max(0, Math.min(100, (pMe.castleHp / pMe.castleMaxHp) * 100))}%` }}
              />
            </div>
            <span className="tabular">{pMe.castleHp}/{pMe.castleMaxHp}</span>
          </div>
        </div>
      </div>

      <footer className={styles.controlsDock}>
        {!tutorialSeen && playMode === 'cpu' && gameState.phase === 'main' && myTurn && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '5px 10px',
              borderRadius: 10,
              background: '#fff3cd',
              border: '2px solid #4a2e1a',
              fontSize: 11,
              fontWeight: 900,
              color: '#4a2e1a',
            }}
            role="status"
          >
            <span>
              {statsAccRef.current.cardsPlayed > 0
                ? '③ 行動が終わったら右下の「ターン終了」を押そう！'
                : selectedCard
                  ? '② 「使う」または光っている場所をタップして発動！'
                  : '① 下の手札からカードをタップして選ぼう！'}
            </span>
            <button
              type="button"
              onClick={markTutorialSeen}
              aria-label="ヒントを閉じる"
              style={{ background: 'none', border: 'none', fontWeight: 900, fontSize: 14, cursor: 'pointer', padding: '0 4px' }}
            >
              ×
            </button>
          </div>
        )}
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
                  <RoundButton
                    onClick={() => {
                      setSelectedCard(null);
                      setTargets([]);
                      setToastMsg(myTurn ? 'あなたの番！カードを出そう' : '相手の番です…');
                    }}
                    aria-label="閉じる"
                  >
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

        {gameState.phase === 'mulligan' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#e7f2ff', padding: '6px 10px', borderRadius: 12, border: '2px solid #4a2e1a' }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>
              初期手札マリガン：引き直すカードを選択 ({mulliganSelected.length}枚)
            </span>
            <GameButton
              size="sm"
              variant="primary-gold"
              onClick={() => {
                const adapter = adapterRef.current;
                if (!adapter) return;
                adapter.mulligan(activeSide, mulliganSelected);
                if (playMode === 'cpu' || playMode === 'local') {
                  adapter.mulligan('p2', []);
                }
                setMulliganSelected([]);
                refreshState();
              }}
            >
              {mulliganSelected.length > 0 ? '引き直す' : 'そのまま開始'}
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

        {showStamps && (data?.stamps?.length || 0) > 0 && (
          <div className={styles.stampPalette} aria-label="スタンプ選択">
            {(data?.stamps || []).map((st) => (
              <button
                key={st.id}
                type="button"
                className={styles.stampBtn}
                onClick={() => handleSendStamp(st)}
              >
                <span>{st.icon}</span>
                <span>{st.label}</span>
              </button>
            ))}
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
              <span className="tabular">{pMe.coins}</span>
            </GameButton>
            <button
              type="button"
              onClick={() => setShowStamps((v) => !v)}
              aria-label="スタンプ"
              style={{
                background: showStamps ? '#3465cc' : 'rgba(255,246,224,0.2)',
                color: '#fff6e0',
                border: '1.5px solid #ffd98a',
                borderRadius: 10,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              💬
            </button>
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
            {(showHandoff ? [] : pMe.hand || []).map((c) => {
              const def = cards[c.type];
              if (!def) return null;
              const playable = adapterRef.current?.canPlayCard(c.cardId).ok ?? false;
              const isSel =
                selectedCard?.cardId === c.cardId ||
                discardSelected.includes(c.cardId) ||
                mulliganSelected.includes(c.cardId);
              return (
                <motion.div
                  key={c.cardId}
                  style={{ flexShrink: 0, touchAction: 'pan-x' }}
                  drag={playable && !fuseMode && gameState.phase === 'main' ? 'y' : false}
                  dragDirectionLock
                  dragConstraints={{ top: -90, bottom: 0 }}
                  dragElastic={0.2}
                  dragSnapToOrigin
                  onDragEnd={(_, info) => {
                    if (info.offset.y < -42) {
                      handleCardQuickPlay(c);
                    }
                  }}
                >
                  <GameCard
                    typeKey={c.type}
                    card={def}
                    width={92}
                    selected={isSel}
                    disabled={(myTurn && gameState.phase === 'main' && !playable) || (isDefensePrompt && !playable)}
                    onClick={() => handleCardTap(c)}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </footer>

      {activeEngine === 'online' && onlineStatus === 'waiting' && gameState.phase === 'ready' && (
        <div className={styles.handoffCurtain}>
          <ParchmentSheet style={{ maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'center' }}>
            <strong style={{ fontSize: 18 }}>対戦相手を待っています…</strong>
            <div style={{ fontSize: 13, fontWeight: 900, background: '#fbf3dc', padding: '6px 10px', borderRadius: 10, border: '1.5px solid #c9b075' }}>
              合言葉：{onlinePassphrase}
            </div>
            <GameButton
              variant="primary-gold"
              fullWidth
              onClick={async () => {
                const url = `${window.location.origin}/?room=${encodeURIComponent(onlinePassphrase.trim())}&stage=${encodeURIComponent(selectedStageId)}`;
                try {
                  await navigator.clipboard?.writeText(url);
                  setInviteCopied(true);
                  setTimeout(() => setInviteCopied(false), 2400);
                } catch {
                  setInviteCopied(false);
                }
              }}
            >
              {inviteCopied ? 'コピーしました！' : '招待URLをコピー'}
            </GameButton>
            <GameButton variant="normal-stone" size="sm" fullWidth onClick={exitBattle}>
              ホームへ戻る
            </GameButton>
          </ParchmentSheet>
        </div>
      )}

      {showHandoff && (
        <div className={styles.handoffCurtain}>
          <ParchmentSheet style={{ maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
            <strong style={{ fontSize: 18 }}>
              {activeSide === 'p1' ? 'プレイヤー1（青）' : 'プレイヤー2（赤）'} の番です
            </strong>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--cf-ink-muted)' }}>
              {isDefensePrompt ? '防御判定が飛んできました！端末を渡してください。' : '端末を受け取ったら下のボタンを押してください（相手の手札は隠されています）。'}
            </p>
            <GameButton
              variant="primary-gold"
              fullWidth
              onClick={() => {
                setConfirmedSide(activeSide);
                setToastMsg(`${activeSide === 'p1' ? 'P1(青)' : 'P2(赤)'} の番！カードを出そう`);
                refreshState();
              }}
            >
              準備OK（手札を見る）
            </GameButton>
          </ParchmentSheet>
        </div>
      )}

      {showUpgrades && data?.upgrades && (
        <div className={styles.modalBackdrop} onClick={() => setShowUpgrades(false)}>
          <div style={{ width: '100%', maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 16 }}>コインで強化（所持 {pMe.coins}）</strong>
                <RoundButton onClick={() => setShowUpgrades(false)} aria-label="閉じる">
                  <PaintedIcon name="close" size={16} />
                </RoundButton>
              </div>
              <div style={{ maxHeight: '62dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(data.upgrades).map(([uid, u]) => (
                  <div
                    key={uid}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      background: '#fbf3dc',
                      border: '1.5px solid #d4bc7d',
                      borderRadius: 10,
                      padding: 6,
                    }}
                  >
                    <GameButton
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cf-ink-muted)', padding: '0 4px', lineHeight: 1.4 }}>
                      {describeUpgrade(u)}
                    </div>
                  </div>
                ))}
              </div>
            </ParchmentSheet>
          </div>
        </div>
      )}

      {showMenu && (
        <div className={styles.modalBackdrop} onClick={() => setShowMenu(false)}>
          <div style={{ width: '100%', maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <ParchmentSheet style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 17, textAlign: 'center' }}>対戦メニュー</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <GameButton
                  size="sm"
                  variant={muted ? 'normal-stone' : 'selected-royal'}
                  onClick={toggleMute}
                >
                  効果音 {muted ? 'OFF' : 'ON'}
                </GameButton>
                <GameButton
                  size="sm"
                  variant={bgmMuted ? 'normal-stone' : 'selected-royal'}
                  onClick={toggleBgmMute}
                >
                  BGM {bgmMuted ? 'OFF' : 'ON'}
                </GameButton>
                <GameButton
                  size="sm"
                  variant={quality === '3d' ? 'selected-royal' : 'normal-stone'}
                  onClick={() => setQuality(quality === '3d' ? '2d' : '3d')}
                >
                  {quality === '3d' ? '3D' : '2D省エネ'}
                </GameButton>
              </div>
              <GameButton
                size="sm"
                variant="normal-stone"
                fullWidth
                onClick={() => setShowLog((v) => !v)}
              >
                {showLog ? '対戦ログを閉じる' : `対戦ログを見る (${battleLog.length})`}
              </GameButton>
              {showLog && (
                <div className={styles.logBox}>
                  {battleLog.length === 0 ? 'まだ行動がありません' : battleLog.map((line, i) => <div key={i}>• {line}</div>)}
                </div>
              )}
              <GameButton
                variant="danger-ruby"
                fullWidth
                onClick={() => {
                  setShowMenu(false);
                  adapterRef.current?.surrender(activeSide);
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
          won={summary.winner === activeSide}
          turns={summary.turns}
          damageDealt={summary.damageDealt}
          cardsPlayed={summary.cardsPlayed}
          monstersDefeated={summary.monstersDefeated}
          progression={computePlayerProgression(stats)}
          battleLog={battleLog}
          onRematch={() => {
            if (playMode === 'ranked') {
              // ランクマッチの「もう1回」は、待合室で次の相手を探す
              exitBattle();
              setRankedLobbyRequested(true);
              return;
            }
            setMatchSeed(Date.now());
          }}
          rematchLabel={playMode === 'ranked' ? '次の相手を探す' : undefined}
          rankedChange={playMode === 'ranked' ? rankedChange : undefined}
          coinReward={
            playMode === 'ranked'
              ? (rankedChange?.coins ?? null)
              : summary.winner === activeSide
                ? (data?.economy?.matchReward.win ?? 150)
                : (data?.economy?.matchReward.loss ?? 40)
          }
          onHome={exitBattle}
        />
      )}
    </section>
  );
}
