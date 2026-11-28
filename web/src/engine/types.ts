export type ModeId = 'kingdom' | 'factions' | 'classic';
export type PlayMode = 'cpu' | 'casual' | 'ranked' | 'friend' | 'local';
export type CpuLevel = 'easy' | 'normal' | 'hard';
export type AppTab = 'deck' | 'gacha' | 'battle' | 'shop' | 'menu';
export type QualityMode = '3d' | '2d';

export interface CardDef {
  name: string;
  kind: 'soldier' | 'spell' | 'weapon' | 'defense';
  hp?: number;
  attack?: number;
  speed?: number;
  range?: number;
  role?: string;
  rarity?: string;
  cost?: number;
  mpCost?: number;
  count?: number;
  effect?: string;
  amount?: number;
  attackBonus?: number;
  element?: 'fire' | 'water' | 'wind' | 'earth' | 'light' | 'dark';
  turns?: number;
  stay?: number;
  armor?: number;
  heal?: number;
  fuseTo?: string;
  dice?: string;
  exhaust?: boolean;
  description?: string;
  scope?: 'all' | 'lane';
}

export interface HandCard {
  cardId: string;
  type: string;
}

export interface SoldierState {
  soldierId: string;
  type: string;
  hp: number;
  maxHp?: number;
  attack: number;
  position: number;
  roadId: string;
  targetId: string;
  weapon: string | null;
  element: string | null;
  shield: number;
  statuses?: Record<string, unknown>;
  range?: number;
  rangeBonus?: number;
  name?: string;
}

export interface PlayerState {
  castleHp: number;
  castleMaxHp: number;
  hand: HandCard[] | null;
  handCount: number;
  playedThisTurn: boolean;
  eliminated: boolean;
  cardsPlayedThisTurn: number;
  armor: number;
  coins: number;
  mp?: number;
  maxMp?: number;
  castleType: string | null;
  maxHand: number;
  soldiers: SoldierState[];
  skills?: string[];
}

export interface MonsterState {
  monsterId: string;
  type: string;
  roadId: string;
  square: number;
  hp: number;
  maxHp: number;
  attack: number;
  element: string;
  attackIn: number;
  reward: number;
  castleAttack: number;
}

export interface RoadState {
  roadId: string;
  players: [string, string];
  length: number;
  lane: number;
}

export interface GameState {
  deckMode: 'shared' | 'own';
  playerOrder: string[];
  round: number;
  turn: number;
  currentPlayer: string;
  phase: 'ready' | 'mulligan' | 'main' | 'discard' | 'defend' | 'gameOver';
  defense: {
    defenderId: string;
    attackerId: string;
    kind: 'castle' | 'soldiers';
    amount: number;
    soldierIds?: string[];
  } | null;
  winner: string | null;
  deckCount: number | null;
  discardCount: number | null;
  exhaustedCount: number | null;
  stage?: string;
  time?: 'day' | 'night';
  weather?: { id: string; name?: string; remaining?: number } | null;
  monsters: MonsterState[];
  roads: RoadState[];
  players: Record<string, PlayerState>;
}

export interface PlayTarget {
  playerId?: string;
  roadId?: string;
  soldierId?: string;
  monsterId?: string;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
  needsTarget?: boolean;
}

export interface GameEvent {
  type: string;
  [key: string]: unknown;
}

export interface ShopItem {
  id: string;
  name: string;
  slot?: string;
  category?: string;
  rarity: string;
  /** null は売り物でない（ランク報酬・ガチャ限定） */
  price?: number | null;
  pointCost?: number;
  /** ランク報酬の階級（シーズン報酬だけでもらえる） */
  rankReward?: string | null;
  gacha?: boolean;
  target?: string;
  desc?: string;
  description?: string;
  filters?: { blue?: string; orange?: string };
}

export interface StampDef {
  id: string;
  icon: string;
  label: string;
}

/** data/v2/economy.json：v2 のお財布の数値 */
export interface EconomyDef {
  matchReward: { win: number; loss: number; dailyLimit: number };
  rankedReward: { win: number; loss: number };
  missions: Array<{
    id: string;
    title: string;
    kind: 'always' | 'matches' | 'wins' | 'gachaRolls' | 'skins' | 'skills';
    goal: number;
    reward: number;
  }>;
}

export interface LoadedGameData {
  cards: Record<string, CardDef>;
  rules: Record<string, unknown>;
  monsters: Record<string, { name: string; hp: number; attack: number; element: string; reward: number }>;
  upgrades: Record<string, { name: string; cost: number; description?: string; effect?: string; amount?: number; limit?: number }>;
  castles: Record<string, { name: string; hp?: number; maxHand?: number }>;
  decks: Record<string, { name: string; cards: Record<string, number>; costDeck?: boolean }>;
  rarities: Record<string, { name: string; color?: string; rate?: number; deckCost?: number }>;
  stages: Record<string, { name: string; icon?: string; description?: string; element?: string }>;
  weather: Record<string, { name: string; description?: string }>;
  stamps: StampDef[];
  economy: EconomyDef;
  shop: { items: Record<string, Omit<ShopItem, 'id'>> | ShopItem[] } | ShopItem[];
  gacha: Record<string, unknown>;
  skillTree: {
    start?: { id: string; name: string; cost?: number; layout: { x: number; y: number } };
    nodes: Array<{
      id: string;
      name: string;
      group: string;
      kind?: string;
      ultimate?: boolean;
      cross?: boolean;
      ends?: string[] | null;
      layout?: { x: number; y: number };
      x?: number;
      y?: number;
      cost?: number;
      desc?: string;
      description?: string;
    }>;
    edges: Array<[string, string]>;
  };
}
