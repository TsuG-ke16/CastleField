import { create } from 'zustand';
import type { AppTab, CpuLevel, LoadedGameData, ModeId, PlayMode, QualityMode } from '../engine/types';
import { loadAllGameData } from '../engine/dataLoader';
import { soundManager } from '../audio/soundManager';
import type { PublicProfile, RankedSummary } from '../engine/rankedClient';
import { economyApi, type ServerWallet } from '../engine/economyClient';
import { transferApi } from '../engine/rankedClient';

/** お財布（コイン・交換pt・所持品）をどこで持つか。server はサーバーが正（端末の値は表示用の写し） */
export type WalletMode = 'local' | 'server';
import type { GameState } from '../engine/types';

/** ランクマッチで成立した試合の席（サーバーが発行した鍵）。対戦画面がこれでつなぐ */
export interface RankedTicket {
  token: string;
  playerId: 'p1' | 'p2';
  opponentName: string;
  /** 相手のアバター・フレーム・ランク（サーバーから） */
  opponent: PublicProfile | null;
  state: GameState;
}

export interface GachaRecord {
  id: string;
  name: string;
  rarity: string;
  isNew: boolean;
}

export type EngineMode = 'rust-wasm' | 'js-legacy';
export type FactionId = 'kingdom' | 'forest' | 'demon' | 'dragon';

export interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  gachaRolls: number;
  cardsPlayed: number;
}

export function computePlayerProgression(stats: PlayerStats): {
  xp: number;
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
} {
  const xp = stats.wins * 60 + stats.matchesPlayed * 25 + stats.cardsPlayed * 2 + stats.gachaRolls * 5;
  const level = Math.min(20, 1 + Math.floor(xp / 100));
  const titles = [
    '見習い兵',
    '王国の騎士',
    '近衛隊長',
    '城塞将軍',
    '王国英雄',
    '伝説の覇者',
  ];
  const titleIdx = Math.min(titles.length - 1, Math.floor((level - 1) / 3));
  return {
    xp,
    level,
    title: titles[titleIdx],
    currentLevelXp: xp % 100,
    nextLevelXp: 100,
  };
}

export interface CustomDeckSlot {
  name: string;
  cards: Record<string, number>;
}

export interface MatchHistoryEntry {
  id: string;
  at: number;
  mode: ModeId;
  playMode: PlayMode;
  stage: string;
  won: boolean;
  turns: number;
  damageDealt: number;
  cardsPlayed: number;
  monstersDefeated: number;
  deckLabel: string;
  log: string[];
}

const STORAGE_KEY = 'castlefield_v2_save_v1';

interface SavedSlice {
  playerName?: string;
  avatarCardType?: string;
  coins?: number;
  points?: number;
  pityCount?: number;
  ownedSkins?: string[];
  gachaHistory?: GachaRecord[];
  selectedCastleSkin?: string;
  selectedSoldierSkin?: string;
  selectedBackSkin?: string;
  selectedIconFrame?: string | null;
  selectedDeckId?: string;
  selectedStageId?: string;
  selectedFactionId?: FactionId;
  customDeck?: Record<string, number>;
  customDecks?: CustomDeckSlot[];
  activeCustomSlot?: number;
  unlockedSkills?: string[];
  quality?: QualityMode;
  muted?: boolean;
  bgmMuted?: boolean;
  volume?: number;
  mulliganEnabled?: boolean;
  reducedMotion?: boolean;
  tutorialSeen?: boolean;
  matchHistory?: MatchHistoryEntry[];
  engineMode?: EngineMode;
  stats?: PlayerStats;
  claimedMissions?: string[];
  walletMode?: WalletMode;
}

function loadSaved(): SavedSlice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedSlice;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistState(s: AppStoreState): void {
  try {
    const payload: SavedSlice = {
      playerName: s.playerName,
      avatarCardType: s.avatarCardType,
      coins: s.coins,
      points: s.points,
      pityCount: s.pityCount,
      ownedSkins: s.ownedSkins,
      gachaHistory: s.gachaHistory,
      selectedCastleSkin: s.selectedCastleSkin,
      selectedSoldierSkin: s.selectedSoldierSkin,
      selectedBackSkin: s.selectedBackSkin,
      selectedIconFrame: s.selectedIconFrame,
      selectedDeckId: s.selectedDeckId,
      selectedStageId: s.selectedStageId,
      selectedFactionId: s.selectedFactionId,
      customDeck: s.customDeck,
      customDecks: s.customDecks,
      activeCustomSlot: s.activeCustomSlot,
      unlockedSkills: s.unlockedSkills,
      quality: s.quality,
      muted: s.muted,
      bgmMuted: s.bgmMuted,
      volume: s.volume,
      mulliganEnabled: s.mulliganEnabled,
      reducedMotion: s.reducedMotion,
      tutorialSeen: s.tutorialSeen,
      matchHistory: s.matchHistory,
      engineMode: s.engineMode,
      stats: s.stats,
      claimedMissions: s.claimedMissions,
      walletMode: s.walletMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

interface AppStoreState {
  tab: AppTab;
  mode: ModeId;
  playMode: PlayMode;
  cpuLevel: CpuLevel;
  playerName: string;
  avatarCardType: string;
  engineMode: EngineMode;
  onlinePassphrase: string;
  onlineServerUrl: string;
  selectedDeckId: string;
  selectedStageId: string;
  selectedFactionId: FactionId;
  customDeck: Record<string, number>;
  customDecks: CustomDeckSlot[];
  activeCustomSlot: number;
  selectedCastleSkin: string;
  selectedSoldierSkin: string;
  selectedBackSkin: string;
  /** 装備しているアイコンフレーム（shop.json の frame_*）。なければ null */
  selectedIconFrame: string | null;
  quality: QualityMode;
  muted: boolean;
  bgmMuted: boolean;
  volume: number;
  mulliganEnabled: boolean;
  reducedMotion: boolean;
  tutorialSeen: boolean;
  matchHistory: MatchHistoryEntry[];
  coins: number;
  points: number;
  pityCount: number;
  ownedSkins: string[];
  gachaHistory: GachaRecord[];
  unlockedSkills: string[];
  stats: PlayerStats;
  claimedMissions: string[];
  inBattle: boolean;
  walletMode: WalletMode;
  /** お財布の操作の結果の知らせ（失敗の理由・上限など）。画面が出して消す */
  walletMessage: string | null;
  rankedTicket: RankedTicket | null;
  rankedSummary: RankedSummary | null;
  /** ホームに戻ったら、ランクマッチの待合室を開く */
  rankedLobbyRequested: boolean;
  data: LoadedGameData | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  setTab: (tab: AppTab) => void;
  setMode: (mode: ModeId) => void;
  setPlayMode: (playMode: PlayMode) => void;
  setCpuLevel: (level: CpuLevel) => void;
  setPlayerName: (name: string) => void;
  setAvatarCardType: (cardType: string) => void;
  setEngineMode: (engineMode: EngineMode) => void;
  setOnlinePassphrase: (passphrase: string) => void;
  setOnlineServerUrl: (url: string) => void;
  setSelectedDeckId: (deckId: string) => void;
  setSelectedStageId: (stageId: string) => void;
  setSelectedFactionId: (factionId: FactionId) => void;
  clonePresetToCustomDeck: (presetId: string) => void;
  updateCustomDeckCard: (cardKey: string, delta: number) => void;
  resetCustomDeck: () => void;
  selectCustomSlot: (slot: number) => void;
  renameCustomDeck: (slot: number, name: string) => void;
  setQuality: (q: QualityMode) => void;
  toggleMute: () => void;
  toggleBgmMute: () => void;
  setVolume: (vol: number) => void;
  toggleMulliganEnabled: () => void;
  toggleReducedMotion: () => void;
  markTutorialSeen: () => void;
  resetTutorial: () => void;
  addMatchHistory: (entry: MatchHistoryEntry) => void;
  startBattle: () => void;
  exitBattle: () => void;
  startRankedBattle: (ticket: RankedTicket) => void;
  setRankedSummary: (summary: RankedSummary | null) => void;
  setRankedLobbyRequested: (open: boolean) => void;
  spendCoinsAndRollGacha: (count: 1 | 10) => GachaRecord[] | null;
  buyShopItem: (itemId: string, price: number, usePoints?: boolean) => boolean;
  /** シーズン報酬などで受け取った品を所持品に入れる */
  grantOwnedItems: (itemIds: string[]) => void;
  equipSkin: (kind: 'castle' | 'soldier' | 'back' | 'frame', skinId: string | null) => void;
  toggleSkillNode: (nodeId: string) => void;
  resetSkills: () => void;
  grantRewardCoins: (amount: number) => void;
  recordMatchResult: (won: boolean, cardsPlayed: number) => void;
  claimMissionReward: (missionId: string, rewardCoins: number) => boolean;
  /** サーバーのお財布をこの端末に写す */
  applyWallet: (w: ServerWallet) => void;
  /** お財布をサーバーに切りかえる（端末の所持品を1回だけ移す。コインは移らない） */
  enableServerWallet: () => Promise<{ ok: boolean; reason?: string }>;
  disableServerWallet: () => void;
  /** 引き継ぎコードで、この端末を別の端末のゲストにする（お財布はサーバーに切りかえる） */
  redeemTransferCode: (code: string) => Promise<{ ok: boolean; reason?: string }>;
  refreshWallet: () => Promise<void>;
  /** ガチャ（お財布の場所に合わせて、端末かサーバーで引く） */
  rollGacha: (count: 1 | 10) => Promise<GachaRecord[] | null>;
  /** 試合の報酬（ranked はサーバーが決着で渡すので、ここでは読み直すだけ） */
  reportMatchReward: (won: boolean, ranked: boolean) => void;
  setWalletMessage: (msg: string | null) => void;
}

const initial = loadSaved();
if (initial.muted) {
  soundManager.setMuted(true);
}
if (initial.bgmMuted) {
  soundManager.setBgmMuted(true);
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const savePatch = (patch: Partial<AppStoreState>) => {
    set(patch);
    persistState(get());
  };

  return {
    tab: 'battle',
    mode: 'kingdom',
    playMode: 'cpu',
    cpuLevel: 'normal',
    playerName: initial.playerName ?? '王国の領主',
    avatarCardType: initial.avatarCardType ?? 'infantry',
    engineMode: initial.engineMode ?? 'rust-wasm',
    onlinePassphrase: '',
    onlineServerUrl: '',
    selectedDeckId: initial.selectedDeckId ?? 'costBalance',
    selectedStageId: initial.selectedStageId ?? 'meadow',
    selectedFactionId: initial.selectedFactionId ?? 'kingdom',
    customDeck: initial.customDeck ?? {},
    customDecks:
      Array.isArray(initial.customDecks) && initial.customDecks.length === 4
        ? initial.customDecks
        : [
            { name: 'デッキ1', cards: initial.customDeck ?? {} },
            { name: 'デッキ2', cards: {} },
            { name: 'デッキ3', cards: {} },
            { name: 'デッキ4', cards: {} },
          ],
    activeCustomSlot:
      typeof initial.activeCustomSlot === 'number' && initial.activeCustomSlot >= 0 && initial.activeCustomSlot < 4
        ? initial.activeCustomSlot
        : 0,
    selectedCastleSkin: initial.selectedCastleSkin ?? 'castle-blue',
    selectedSoldierSkin: initial.selectedSoldierSkin ?? 'infantry-blue',
    selectedBackSkin: initial.selectedBackSkin ?? 'card-back',
    selectedIconFrame: initial.selectedIconFrame ?? null,
    quality: initial.quality ?? '3d',
    muted: initial.muted ?? false,
    bgmMuted: initial.bgmMuted ?? false,
    volume: typeof initial.volume === 'number' ? initial.volume : 0.75,
    mulliganEnabled: initial.mulliganEnabled ?? false,
    reducedMotion:
      initial.reducedMotion ??
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false),
    tutorialSeen: initial.tutorialSeen ?? false,
    matchHistory: Array.isArray(initial.matchHistory) ? initial.matchHistory.slice(0, 12) : [],
    coins: initial.coins ?? 2400,
    points: initial.points ?? 350,
    pityCount: initial.pityCount ?? 0,
    ownedSkins: initial.ownedSkins ?? ['castle-blue', 'infantry-blue', 'card-back'],
    gachaHistory: initial.gachaHistory ?? [],
    unlockedSkills: initial.unlockedSkills ?? [],
    stats: initial.stats ?? { matchesPlayed: 0, wins: 0, gachaRolls: 0, cardsPlayed: 0 },
    claimedMissions: initial.claimedMissions ?? [],
    inBattle: false,
    walletMode: initial.walletMode ?? 'local',
    walletMessage: null,
    rankedTicket: null,
    rankedSummary: null,
    rankedLobbyRequested: false,
    data: null,
    loading: true,
    error: null,

    init: async () => {
      try {
        soundManager.setVolume(get().volume);
        soundManager.setMuted(get().muted);
        soundManager.setBgmMuted(get().bgmMuted);
        const data = await loadAllGameData();
        const deckKeys = Object.keys(data.decks || {});
        const savedDeck = get().selectedDeckId;
        const firstDeckKey =
          savedDeck === 'custom' || (savedDeck && deckKeys.includes(savedDeck))
            ? savedDeck
            : deckKeys.includes('costBalance')
              ? 'costBalance'
              : deckKeys[0] || 'balanced';
        const fallbackCards = data.decks?.['costBalance']?.cards || data.decks?.[firstDeckKey]?.cards || {};
        const slotPresets = ['costBalance', 'costAssault', 'costDefense', 'costSpell'];
        const existingCustom = get().customDeck;
        const currentSlots = get().customDecks;
        const seededSlots: CustomDeckSlot[] = [0, 1, 2, 3].map((i) => {
          const cur = currentSlots[i];
          if (cur && Object.keys(cur.cards || {}).length > 0) return cur;
          if (i === 0 && existingCustom && Object.keys(existingCustom).length > 0) {
            return { name: cur?.name || 'デッキ1', cards: { ...existingCustom } };
          }
          const presetKey = slotPresets[i];
          const src = data.decks?.[presetKey]?.cards || fallbackCards;
          return { name: cur?.name || `デッキ${i + 1}`, cards: { ...src } };
        });
        const slotIdx = get().activeCustomSlot;
        const seededCustom = { ...(seededSlots[slotIdx]?.cards || fallbackCards) };
        savePatch({
          data,
          loading: false,
          selectedDeckId: firstDeckKey,
          customDecks: seededSlots,
          customDeck: seededCustom,
        });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    },

    setTab: (tab) => {
      soundManager.play('tap');
      set({ tab });
    },
    setMode: (mode) => {
      soundManager.play('tap');
      set({ mode });
    },
    setPlayMode: (playMode) => {
      soundManager.play('tap');
      set({ playMode });
    },
    setCpuLevel: (cpuLevel) => {
      soundManager.play('tap');
      set({ cpuLevel });
    },
    setPlayerName: (playerName) => {
      const cleaned = playerName.trim() || '王国の領主';
      savePatch({ playerName: cleaned });
    },
    setAvatarCardType: (avatarCardType) => {
      soundManager.play('tap');
      savePatch({ avatarCardType });
    },
    setEngineMode: (engineMode) => {
      soundManager.play('tap');
      savePatch({ engineMode });
    },
    setOnlinePassphrase: (onlinePassphrase) => set({ onlinePassphrase }),
    setOnlineServerUrl: (onlineServerUrl) => set({ onlineServerUrl }),
    setSelectedDeckId: (selectedDeckId) => {
      soundManager.play('tap');
      savePatch({ selectedDeckId });
    },
    setSelectedStageId: (selectedStageId) => {
      soundManager.play('tap');
      savePatch({ selectedStageId });
    },
    setSelectedFactionId: (selectedFactionId) => {
      soundManager.play('tap');
      savePatch({ selectedFactionId });
    },
    clonePresetToCustomDeck: (presetId) => {
      const decks = get().data?.decks || {};
      const src = decks[presetId]?.cards;
      if (!src) return;
      soundManager.play('tap');
      const idx = get().activeCustomSlot;
      const nextSlots = get().customDecks.map((s, i) => (i === idx ? { ...s, cards: { ...src } } : s));
      savePatch({ customDecks: nextSlots, customDeck: { ...src }, selectedDeckId: 'custom' });
    },
    updateCustomDeckCard: (cardKey, delta) => {
      const next = { ...get().customDeck };
      const cur = next[cardKey] ?? 0;
      const updated = Math.max(0, Math.min(6, cur + delta));
      if (updated === 0) delete next[cardKey];
      else next[cardKey] = updated;
      soundManager.play('tap');
      const idx = get().activeCustomSlot;
      const nextSlots = get().customDecks.map((s, i) => (i === idx ? { ...s, cards: next } : s));
      savePatch({ customDecks: nextSlots, customDeck: next, selectedDeckId: 'custom' });
    },
    resetCustomDeck: () => {
      const decks = get().data?.decks || {};
      const slotPresets = ['costBalance', 'costAssault', 'costDefense', 'costSpell'];
      const idx = get().activeCustomSlot;
      const base = decks[slotPresets[idx]]?.cards || decks['costBalance']?.cards || Object.values(decks)[0]?.cards || {};
      soundManager.play('tap');
      const nextSlots = get().customDecks.map((s, i) => (i === idx ? { ...s, cards: { ...base } } : s));
      savePatch({ customDecks: nextSlots, customDeck: { ...base }, selectedDeckId: 'custom' });
    },
    selectCustomSlot: (slot) => {
      const idx = Math.max(0, Math.min(3, slot));
      const slots = get().customDecks;
      const picked = slots[idx]?.cards || {};
      soundManager.play('tap');
      savePatch({ activeCustomSlot: idx, customDeck: { ...picked }, selectedDeckId: 'custom' });
    },
    renameCustomDeck: (slot, name) => {
      const idx = Math.max(0, Math.min(3, slot));
      const cleaned = name.slice(0, 14);
      const nextSlots = get().customDecks.map((s, i) =>
        i === idx ? { ...s, name: cleaned || `デッキ${idx + 1}` } : s
      );
      savePatch({ customDecks: nextSlots });
    },
    setQuality: (quality) => {
      soundManager.play('tap');
      savePatch({ quality });
    },
    toggleMute: () => {
      const next = !get().muted;
      soundManager.setMuted(next);
      savePatch({ muted: next });
    },
    toggleBgmMute: () => {
      const next = !get().bgmMuted;
      soundManager.setBgmMuted(next);
      savePatch({ bgmMuted: next });
    },
    setVolume: (vol) => {
      const clamped = Math.max(0, Math.min(1, vol));
      soundManager.setVolume(clamped);
      savePatch({ volume: clamped });
    },
    toggleMulliganEnabled: () => {
      soundManager.play('tap');
      savePatch({ mulliganEnabled: !get().mulliganEnabled });
    },
    toggleReducedMotion: () => {
      soundManager.play('tap');
      savePatch({ reducedMotion: !get().reducedMotion });
    },
    markTutorialSeen: () => {
      if (!get().tutorialSeen) savePatch({ tutorialSeen: true });
    },
    resetTutorial: () => {
      soundManager.play('tap');
      savePatch({ tutorialSeen: false });
    },
    addMatchHistory: (entry) => {
      const next = [entry, ...get().matchHistory].slice(0, 12);
      savePatch({ matchHistory: next });
    },
    startBattle: () => {
      soundManager.play('deploy');
      set({ inBattle: true });
    },
    startRankedBattle: (ticket) => {
      soundManager.play('deploy');
      set({ rankedTicket: ticket, playMode: 'ranked', inBattle: true });
    },
    setRankedSummary: (rankedSummary) => set({ rankedSummary }),
    setRankedLobbyRequested: (rankedLobbyRequested) => set({ rankedLobbyRequested }),
    exitBattle: () => {
      soundManager.play('tap');
      set({ inBattle: false, tab: 'battle', rankedTicket: null });
    },

    spendCoinsAndRollGacha: (count) => {
      const cost = count === 10 ? 900 : 100;
      const { coins, pityCount, data, ownedSkins, gachaHistory, stats } = get();
      if (coins < cost || !data) return null;

      const rawItems = Array.isArray(data.shop)
        ? data.shop
        : Array.isArray(data.shop?.items)
          ? data.shop.items
          : Object.entries(data.shop?.items || {}).map(([id, v]) => ({ id, ...v }));
      // ランク報酬（シーズン報酬だけでもらえる品）はガチャから出さない
      const gachaItems = rawItems.filter((x) => !(x as { rankReward?: string | null }).rankReward);
      const pool = gachaItems.length > 0 ? gachaItems : [
        { id: 'unit_crimson', name: '紅蓮の兵', category: 'soldier', rarity: 'rare' },
        { id: 'castle_crimson', name: '紅蓮の城', category: 'castle', rarity: 'epic' },
        { id: 'castle_gold', name: '黄金の城', category: 'castle', rarity: 'legendary' },
      ];

      const results: GachaRecord[] = [];
      let currentPity = pityCount;
      const nextOwned = new Set(ownedSkins);
      let bonusPoints = 0;

      for (let i = 0; i < count; i++) {
        currentPity += 1;
        const forceEpic = currentPity >= 40;
        const forceRare = count === 10 && i === 9;
        let candidates = pool;
        if (forceEpic) {
          const epics = pool.filter((x) => x.rarity === 'epic' || x.rarity === 'legendary');
          if (epics.length) candidates = epics;
          currentPity = 0;
        } else if (forceRare) {
          const rares = pool.filter((x) => x.rarity !== 'common');
          if (rares.length) candidates = rares;
        }
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        if (picked.rarity === 'epic' || picked.rarity === 'legendary') currentPity = 0;
        const isNew = !nextOwned.has(picked.id);
        if (isNew) nextOwned.add(picked.id);
        else bonusPoints += 25;

        results.push({
          id: picked.id,
          name: picked.name,
          rarity: picked.rarity || 'common',
          isNew,
        });
      }

      soundManager.play('coin');
      savePatch({
        coins: coins - cost,
        points: get().points + bonusPoints,
        pityCount: currentPity,
        ownedSkins: Array.from(nextOwned),
        gachaHistory: [...results, ...gachaHistory].slice(0, 40),
        stats: { ...stats, gachaRolls: stats.gachaRolls + count },
      });
      return results;
    },

    grantOwnedItems: (itemIds) => {
      const owned = get().ownedSkins;
      const add = itemIds.filter((id) => !owned.includes(id));
      if (add.length) savePatch({ ownedSkins: [...owned, ...add] });
    },
    buyShopItem: (itemId, price, usePoints = false) => {
      if (get().walletMode === 'server') {
        const { onlineServerUrl, playerName } = get();
        economyApi
          .buy(onlineServerUrl, playerName, itemId, usePoints)
          .then((r) => {
            if (r.ok) {
              soundManager.play('coin');
              get().applyWallet(r.wallet);
            } else set({ walletMessage: r.reason });
          })
          .catch((e) => set({ walletMessage: e instanceof Error ? e.message : String(e) }));
        return true;
      }
      const { coins, points, ownedSkins, data } = get();
      if (ownedSkins.includes(itemId)) return false;
      // 売り物でない品（ランク報酬・ガチャ限定。shop.json の price が null）は買えない
      const shopItems = (data?.shop as { items?: Record<string, { price?: number | null }> } | undefined)?.items;
      if (shopItems && !Array.isArray(shopItems) && shopItems[itemId]?.price === null) return false;
      if (usePoints) {
        if (points < price) return false;
        soundManager.play('coin');
        savePatch({ points: points - price, ownedSkins: [...ownedSkins, itemId] });
        return true;
      }
      if (coins < price) return false;
      soundManager.play('coin');
      savePatch({ coins: coins - price, ownedSkins: [...ownedSkins, itemId] });
      return true;
    },

    equipSkin: (kind, skinId) => {
      soundManager.play('tap');
      if (kind === 'frame') {
        // 持っていないフレームは付けられない（null は外す）
        if (skinId === null || get().ownedSkins.includes(skinId)) savePatch({ selectedIconFrame: skinId });
        return;
      }
      if (skinId === null) return;
      if (kind === 'castle') savePatch({ selectedCastleSkin: skinId });
      if (kind === 'soldier') savePatch({ selectedSoldierSkin: skinId });
      if (kind === 'back') savePatch({ selectedBackSkin: skinId });
    },

    toggleSkillNode: (nodeId) => {
      const { unlockedSkills } = get();
      soundManager.play('tap');
      if (unlockedSkills.includes(nodeId)) {
        savePatch({ unlockedSkills: unlockedSkills.filter((id) => id !== nodeId) });
      } else if (unlockedSkills.length < 12) {
        savePatch({ unlockedSkills: [...unlockedSkills, nodeId] });
      }
    },

    resetSkills: () => {
      soundManager.play('tap');
      savePatch({ unlockedSkills: [] });
    },

    grantRewardCoins: (amount) => {
      savePatch({ coins: get().coins + amount });
    },

    recordMatchResult: (won, cardsPlayed) => {
      const st = get().stats;
      savePatch({
        stats: {
          matchesPlayed: st.matchesPlayed + 1,
          wins: st.wins + (won ? 1 : 0),
          gachaRolls: st.gachaRolls,
          cardsPlayed: st.cardsPlayed + cardsPlayed,
        },
      });
    },

    claimMissionReward: (missionId, rewardCoins) => {
      if (get().walletMode === 'server') {
        const { onlineServerUrl, playerName } = get();
        economyApi
          .mission(onlineServerUrl, playerName, missionId)
          .then((r) => {
            if (r.ok) {
              soundManager.play('coin');
              get().applyWallet(r);
            } else set({ walletMessage: r.reason });
          })
          .catch((e) => set({ walletMessage: e instanceof Error ? e.message : String(e) }));
        return true;
      }
      const claimed = get().claimedMissions;
      if (claimed.includes(missionId)) return false;
      soundManager.play('coin');
      savePatch({
        coins: get().coins + rewardCoins,
        claimedMissions: [...claimed, missionId],
      });
      return true;
    },

    applyWallet: (w) => {
      savePatch({
        coins: w.coins,
        points: w.points,
        pityCount: w.pityCount,
        ownedSkins: w.ownedSkins,
        claimedMissions: w.claimedMissions,
        // サーバーの所持品にないフレームは外す（端末だけで持っていたものは移らない）
        selectedIconFrame: get().selectedIconFrame && w.ownedSkins.includes(get().selectedIconFrame as string) ? get().selectedIconFrame : null,
      });
    },

    enableServerWallet: async () => {
      const { onlineServerUrl, playerName, ownedSkins } = get();
      try {
        const m = await economyApi.migrate(onlineServerUrl, playerName, ownedSkins);
        const w = m.ok ? m : await economyApi.wallet(onlineServerUrl, playerName);
        if (!w.ok) return { ok: false, reason: w.reason };
        get().applyWallet(w);
        savePatch({ walletMode: 'server' });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
    },

    redeemTransferCode: async (code) => {
      const { onlineServerUrl } = get();
      try {
        const r = await transferApi.redeem(onlineServerUrl, code.trim());
        if (!r.ok) return { ok: false, reason: r.reason || '引き継げませんでした' };
        savePatch({ walletMode: 'server', rankedSummary: null, ...(r.name ? { playerName: r.name } : {}) });
        await get().refreshWallet();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
    },

    disableServerWallet: () => {
      // 端末のお財布に戻す（今の写しから続ける。サーバーの値はそのまま残る）
      savePatch({ walletMode: 'local' });
    },

    refreshWallet: async () => {
      if (get().walletMode !== 'server') return;
      const { onlineServerUrl, playerName } = get();
      try {
        const w = await economyApi.wallet(onlineServerUrl, playerName);
        if (w.ok) get().applyWallet(w);
      } catch {
        // つながらないときは、写しのまま
      }
    },

    rollGacha: async (count) => {
      if (get().walletMode !== 'server') return get().spendCoinsAndRollGacha(count);
      const { onlineServerUrl, playerName } = get();
      try {
        const r = await economyApi.gacha(onlineServerUrl, playerName, count);
        if (!r.ok) {
          set({ walletMessage: r.reason });
          return null;
        }
        soundManager.play('coin');
        get().applyWallet(r.wallet);
        const st = get().stats;
        savePatch({
          gachaHistory: [...r.results, ...get().gachaHistory].slice(0, 40),
          stats: { ...st, gachaRolls: st.gachaRolls + count },
        });
        return r.results;
      } catch (e) {
        set({ walletMessage: e instanceof Error ? e.message : String(e) });
        return null;
      }
    },

    reportMatchReward: (won, ranked) => {
      const { walletMode, data, onlineServerUrl, playerName } = get();
      if (walletMode !== 'server') {
        // 端末のお財布：data/v2/economy.json の報酬
        const r = data?.economy?.matchReward;
        get().grantRewardCoins(won ? (r?.win ?? 150) : (r?.loss ?? 40));
        return;
      }
      if (ranked) {
        void get().refreshWallet();
        return;
      }
      economyApi
        .matchReward(onlineServerUrl, playerName, won)
        .then((r) => {
          if (!r.ok) {
            set({ walletMessage: r.reason });
            return;
          }
          get().applyWallet(r);
          if (!r.granted) set({ walletMessage: '今日の対戦報酬は上限に達しました（ランクマッチの報酬は上限なし）' });
        })
        .catch(() => set({ walletMessage: 'サーバーにつながらず、報酬を受け取れませんでした' }));
    },

    setWalletMessage: (walletMessage) => set({ walletMessage }),
  };
});
