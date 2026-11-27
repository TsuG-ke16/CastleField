import { create } from 'zustand';
import type { AppTab, CpuLevel, LoadedGameData, ModeId, PlayMode, QualityMode } from '../engine/types';
import { loadAllGameData } from '../engine/dataLoader';
import { soundManager } from '../audio/soundManager';

interface GachaRecord {
  id: string;
  name: string;
  rarity: string;
  isNew: boolean;
}

interface AppStoreState {
  tab: AppTab;
  mode: ModeId;
  playMode: PlayMode;
  cpuLevel: CpuLevel;
  selectedDeckId: string;
  selectedCastleSkin: string;
  selectedSoldierSkin: string;
  selectedBackSkin: string;
  quality: QualityMode;
  muted: boolean;
  coins: number;
  points: number;
  pityCount: number;
  ownedSkins: string[];
  gachaHistory: GachaRecord[];
  unlockedSkills: string[];
  inBattle: boolean;
  data: LoadedGameData | null;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  setTab: (tab: AppTab) => void;
  setMode: (mode: ModeId) => void;
  setPlayMode: (playMode: PlayMode) => void;
  setCpuLevel: (level: CpuLevel) => void;
  setSelectedDeckId: (deckId: string) => void;
  setQuality: (q: QualityMode) => void;
  toggleMute: () => void;
  startBattle: () => void;
  exitBattle: () => void;
  spendCoinsAndRollGacha: (count: 1 | 10) => GachaRecord[] | null;
  buyShopItem: (itemId: string, price: number, usePoints?: boolean) => boolean;
  equipSkin: (kind: 'castle' | 'soldier' | 'back', skinId: string) => void;
  toggleSkillNode: (nodeId: string) => void;
  resetSkills: () => void;
  grantRewardCoins: (amount: number) => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  tab: 'battle',
  mode: 'kingdom',
  playMode: 'cpu',
  cpuLevel: 'normal',
  selectedDeckId: 'costBalance',
  selectedCastleSkin: 'castle-blue',
  selectedSoldierSkin: 'infantry-blue',
  selectedBackSkin: 'card-back',
  quality: '3d',
  muted: false,
  coins: 2400,
  points: 350,
  pityCount: 0,
  ownedSkins: ['castle-blue', 'infantry-blue', 'card-back'],
  gachaHistory: [],
  unlockedSkills: [],
  inBattle: false,
  data: null,
  loading: true,
  error: null,

  init: async () => {
    try {
      const data = await loadAllGameData();
      const deckKeys = Object.keys(data.decks || {});
      const firstDeckKey = deckKeys.includes('costBalance') ? 'costBalance' : (deckKeys[0] || 'balanced');
      set({ data, loading: false, selectedDeckId: firstDeckKey });
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
  setSelectedDeckId: (selectedDeckId) => {
    soundManager.play('tap');
    set({ selectedDeckId });
  },
  setQuality: (quality) => {
    soundManager.play('tap');
    set({ quality });
  },
  toggleMute: () => {
    const next = !get().muted;
    soundManager.setMuted(next);
    set({ muted: next });
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
    const { coins, pityCount, data, ownedSkins, gachaHistory } = get();
    if (coins < cost || !data) return null;

    const rawItems = Array.isArray(data.shop)
      ? data.shop
      : Array.isArray(data.shop?.items)
        ? data.shop.items
        : Object.entries(data.shop?.items || {}).map(([id, v]) => ({ id, ...v }));
    const pool = rawItems.length > 0 ? rawItems : [
      { id: 'skin_royal_knight', name: '王家の兵', category: 'soldier', rarity: 'rare' },
      { id: 'skin_crimson_castle', name: '紅蓮の城', category: 'castle', rarity: 'epic' },
      { id: 'skin_gold_castle', name: '黄金の城', category: 'castle', rarity: 'legendary' },
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
    set({
      coins: coins - cost,
      points: get().points + bonusPoints,
      pityCount: currentPity,
      ownedSkins: Array.from(nextOwned),
      gachaHistory: [...results, ...gachaHistory].slice(0, 40),
    });
    return results;
  },

  buyShopItem: (itemId, price, usePoints = false) => {
    const { coins, points, ownedSkins } = get();
    if (ownedSkins.includes(itemId)) return false;
    if (usePoints) {
      if (points < price) return false;
      soundManager.play('coin');
      set({ points: points - price, ownedSkins: [...ownedSkins, itemId] });
      return true;
    }
    if (coins < price) return false;
    soundManager.play('coin');
    set({ coins: coins - price, ownedSkins: [...ownedSkins, itemId] });
    return true;
  },

  equipSkin: (kind, skinId) => {
    soundManager.play('tap');
    if (kind === 'castle') set({ selectedCastleSkin: skinId });
    if (kind === 'soldier') set({ selectedSoldierSkin: skinId });
    if (kind === 'back') set({ selectedBackSkin: skinId });
  },

  toggleSkillNode: (nodeId) => {
    const { unlockedSkills } = get();
    soundManager.play('tap');
    if (unlockedSkills.includes(nodeId)) {
      set({ unlockedSkills: unlockedSkills.filter((id) => id !== nodeId) });
    } else if (unlockedSkills.length < 12) {
      set({ unlockedSkills: [...unlockedSkills, nodeId] });
    }
  },

  resetSkills: () => {
    soundManager.play('tap');
    set({ unlockedSkills: [] });
  },

  grantRewardCoins: (amount) => {
    set({ coins: get().coins + amount });
  },
}));
