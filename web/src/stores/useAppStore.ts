import { create } from 'zustand';
import type { AppTab, CpuLevel, LoadedGameData, ModeId, PlayMode, QualityMode } from '../engine/types';
import { loadAllGameData } from '../engine/dataLoader';
import { soundManager } from '../audio/soundManager';

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

const STORAGE_KEY = 'castlefield_v2_save_v1';

interface SavedSlice {
  coins?: number;
  points?: number;
  pityCount?: number;
  ownedSkins?: string[];
  gachaHistory?: GachaRecord[];
  selectedCastleSkin?: string;
  selectedSoldierSkin?: string;
  selectedBackSkin?: string;
  selectedDeckId?: string;
  selectedStageId?: string;
  selectedFactionId?: FactionId;
  customDeck?: Record<string, number>;
  unlockedSkills?: string[];
  quality?: QualityMode;
  muted?: boolean;
  bgmMuted?: boolean;
  engineMode?: EngineMode;
  stats?: PlayerStats;
  claimedMissions?: string[];
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
      coins: s.coins,
      points: s.points,
      pityCount: s.pityCount,
      ownedSkins: s.ownedSkins,
      gachaHistory: s.gachaHistory,
      selectedCastleSkin: s.selectedCastleSkin,
      selectedSoldierSkin: s.selectedSoldierSkin,
      selectedBackSkin: s.selectedBackSkin,
      selectedDeckId: s.selectedDeckId,
      selectedStageId: s.selectedStageId,
      selectedFactionId: s.selectedFactionId,
      customDeck: s.customDeck,
      unlockedSkills: s.unlockedSkills,
      quality: s.quality,
      muted: s.muted,
      bgmMuted: s.bgmMuted,
      engineMode: s.engineMode,
      stats: s.stats,
      claimedMissions: s.claimedMissions,
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
  engineMode: EngineMode;
  onlinePassphrase: string;
  onlineServerUrl: string;
  selectedDeckId: string;
  selectedStageId: string;
  selectedFactionId: FactionId;
  customDeck: Record<string, number>;
  selectedCastleSkin: string;
  selectedSoldierSkin: string;
  selectedBackSkin: string;
  quality: QualityMode;
  muted: boolean;
  bgmMuted: boolean;
  coins: number;
  points: number;
  pityCount: number;
  ownedSkins: string[];
  gachaHistory: GachaRecord[];
  unlockedSkills: string[];
  stats: PlayerStats;
  claimedMissions: string[];
  inBattle: boolean;
  data: LoadedGameData | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  setTab: (tab: AppTab) => void;
  setMode: (mode: ModeId) => void;
  setPlayMode: (playMode: PlayMode) => void;
  setCpuLevel: (level: CpuLevel) => void;
  setEngineMode: (engineMode: EngineMode) => void;
  setOnlinePassphrase: (passphrase: string) => void;
  setOnlineServerUrl: (url: string) => void;
  setSelectedDeckId: (deckId: string) => void;
  setSelectedStageId: (stageId: string) => void;
  setSelectedFactionId: (factionId: FactionId) => void;
  clonePresetToCustomDeck: (presetId: string) => void;
  updateCustomDeckCard: (cardKey: string, delta: number) => void;
  resetCustomDeck: () => void;
  setQuality: (q: QualityMode) => void;
  toggleMute: () => void;
  toggleBgmMute: () => void;
  startBattle: () => void;
  exitBattle: () => void;
  spendCoinsAndRollGacha: (count: 1 | 10) => GachaRecord[] | null;
  buyShopItem: (itemId: string, price: number, usePoints?: boolean) => boolean;
  equipSkin: (kind: 'castle' | 'soldier' | 'back', skinId: string) => void;
  toggleSkillNode: (nodeId: string) => void;
  resetSkills: () => void;
  grantRewardCoins: (amount: number) => void;
  recordMatchResult: (won: boolean, cardsPlayed: number) => void;
  claimMissionReward: (missionId: string, rewardCoins: number) => boolean;
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
    engineMode: initial.engineMode ?? 'rust-wasm',
    onlinePassphrase: '',
    onlineServerUrl: '',
    selectedDeckId: initial.selectedDeckId ?? 'costBalance',
    selectedStageId: initial.selectedStageId ?? 'meadow',
    selectedFactionId: initial.selectedFactionId ?? 'kingdom',
    customDeck: initial.customDeck ?? {},
    selectedCastleSkin: initial.selectedCastleSkin ?? 'castle-blue',
    selectedSoldierSkin: initial.selectedSoldierSkin ?? 'infantry-blue',
    selectedBackSkin: initial.selectedBackSkin ?? 'card-back',
    quality: initial.quality ?? '3d',
    muted: initial.muted ?? false,
    bgmMuted: initial.bgmMuted ?? false,
    coins: initial.coins ?? 2400,
    points: initial.points ?? 350,
    pityCount: initial.pityCount ?? 0,
    ownedSkins: initial.ownedSkins ?? ['castle-blue', 'infantry-blue', 'card-back'],
    gachaHistory: initial.gachaHistory ?? [],
    unlockedSkills: initial.unlockedSkills ?? [],
    stats: initial.stats ?? { matchesPlayed: 0, wins: 0, gachaRolls: 0, cardsPlayed: 0 },
    claimedMissions: initial.claimedMissions ?? [],
    inBattle: false,
    data: null,
    loading: true,
    error: null,

    init: async () => {
      try {
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
        const existingCustom = get().customDeck;
        const seededCustom =
          existingCustom && Object.keys(existingCustom).length > 0
            ? existingCustom
            : { ...fallbackCards };
        savePatch({
          data,
          loading: false,
          selectedDeckId: firstDeckKey,
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
      savePatch({ customDeck: { ...src }, selectedDeckId: 'custom' });
    },
    updateCustomDeckCard: (cardKey, delta) => {
      const next = { ...get().customDeck };
      const cur = next[cardKey] ?? 0;
      const updated = Math.max(0, Math.min(6, cur + delta));
      if (updated === 0) delete next[cardKey];
      else next[cardKey] = updated;
      soundManager.play('tap');
      savePatch({ customDeck: next, selectedDeckId: 'custom' });
    },
    resetCustomDeck: () => {
      const decks = get().data?.decks || {};
      const base = decks['costBalance']?.cards || Object.values(decks)[0]?.cards || {};
      soundManager.play('tap');
      savePatch({ customDeck: { ...base }, selectedDeckId: 'custom' });
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
    startBattle: () => {
      soundManager.play('deploy');
      set({ inBattle: true });
    },
    exitBattle: () => {
      soundManager.play('tap');
      set({ inBattle: false, tab: 'battle' });
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
      const pool = rawItems.length > 0 ? rawItems : [
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

    buyShopItem: (itemId, price, usePoints = false) => {
      const { coins, points, ownedSkins } = get();
      if (ownedSkins.includes(itemId)) return false;
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
      const claimed = get().claimedMissions;
      if (claimed.includes(missionId)) return false;
      soundManager.play('coin');
      savePatch({
        coins: get().coins + rewardCoins,
        claimedMissions: [...claimed, missionId],
      });
      return true;
    },
  };
});
