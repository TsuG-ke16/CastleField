import type { CardDef, LoadedGameData, ModeId, StampDef } from './types';
// @ts-ignore - vanilla JS Setup helper
import { factionDecks } from '@game/Setup.js';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

let cachedData: LoadedGameData | null = null;

export async function loadAllGameData(): Promise<LoadedGameData> {
  if (cachedData) return cachedData;
  const [
    cards,
    rules,
    monsters,
    upgrades,
    castles,
    decks,
    rarities,
    stages,
    weather,
    shop,
    gacha,
    skillTree,
    stamps,
    economy,
  ] = await Promise.all([
    fetchJson<LoadedGameData['cards']>('/data/cards.json'),
    fetchJson<LoadedGameData['rules']>('/data/rules.json'),
    fetchJson<LoadedGameData['monsters']>('/data/monsters.json'),
    fetchJson<LoadedGameData['upgrades']>('/data/upgrades.json'),
    fetchJson<LoadedGameData['castles']>('/data/castles.json'),
    fetchJson<LoadedGameData['decks']>('/data/decks.json'),
    fetchJson<LoadedGameData['rarities']>('/data/rarities.json'),
    fetchJson<LoadedGameData['stages']>('/data/stages.json'),
    fetchJson<LoadedGameData['weather']>('/data/weather.json'),
    fetchJson<LoadedGameData['shop']>('/data/shop.json'),
    fetchJson<LoadedGameData['gacha']>('/data/gacha.json'),
    fetchJson<LoadedGameData['skillTree']>('/data/classic/skilltree.json'),
    fetchJson<StampDef[]>('/data/stamps.json').catch(() => [] as StampDef[]),
    fetchJson<LoadedGameData['economy']>('/data/v2/economy.json'),
  ]);

  cachedData = {
    cards,
    rules,
    monsters,
    upgrades,
    castles,
    decks,
    rarities,
    stages,
    weather,
    stamps,
    economy,
    shop,
    gacha,
    skillTree,
  };
  return cachedData;
}

export interface ModeBundle {
  mode: ModeId;
  cards: Record<string, CardDef>;
  rules: Record<string, unknown>;
  decks?: Record<string, { name: string; cards: Record<string, number>; costDeck?: boolean; [k: string]: unknown }>;
  elements?: Record<string, unknown>;
  reactions?: Record<string, unknown>;
  skillTree?: LoadedGameData['skillTree'];
  factions?: Record<string, { name: string; description?: string; [k: string]: unknown }>;
  useRarities: boolean;
}

const modeCache = new Map<ModeId, ModeBundle>();

function cleanCardMap(raw: Record<string, unknown>): Record<string, CardDef> {
  const out: Record<string, CardDef> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (k.startsWith('_') || !v || typeof v !== 'object') continue;
    out[k] = v as CardDef;
  }
  return out;
}

export async function loadModeBundle(mode: ModeId, baseData: LoadedGameData): Promise<ModeBundle> {
  const hit = modeCache.get(mode);
  if (hit) return hit;

  if (mode === 'factions') {
    const [rules, elements, reactions, factionsRaw, cKing, cForest, cDemon, cDragon] = await Promise.all([
      fetchJson<Record<string, unknown>>('/data/factions/rules.json'),
      fetchJson<Record<string, unknown>>('/data/factions/elements.json'),
      fetchJson<Record<string, unknown>>('/data/factions/reactions.json'),
      fetchJson<Record<string, { name: string; description?: string; [k: string]: unknown }>>('/data/factions/factions.json'),
      fetchJson<Record<string, unknown>>('/data/factions/cards/kingdom.json'),
      fetchJson<Record<string, unknown>>('/data/factions/cards/forest.json'),
      fetchJson<Record<string, unknown>>('/data/factions/cards/demon.json'),
      fetchJson<Record<string, unknown>>('/data/factions/cards/dragon.json'),
    ]);
    const sets = {
      kingdom: cleanCardMap(cKing),
      forest: cleanCardMap(cForest),
      demon: cleanCardMap(cDemon),
      dragon: cleanCardMap(cDragon),
    };
    const cards: Record<string, CardDef> = {
      ...sets.kingdom,
      ...sets.forest,
      ...sets.demon,
      ...sets.dragon,
    };
    const decks = factionDecks(factionsRaw, sets) as ModeBundle['decks'];
    const factions: NonNullable<ModeBundle['factions']> = {};
    for (const [k, v] of Object.entries(factionsRaw || {})) {
      if (!k.startsWith('_')) factions[k] = v;
    }
    const bundle: ModeBundle = {
      mode: 'factions',
      cards,
      rules,
      decks,
      elements,
      reactions,
      factions,
      useRarities: false,
    };
    modeCache.set('factions', bundle);
    return bundle;
  }

  if (mode === 'classic') {
    const [cardsRaw, rules, elements, reactions] = await Promise.all([
      fetchJson<Record<string, unknown>>('/data/classic/cards.json'),
      fetchJson<Record<string, unknown>>('/data/classic/rules.json'),
      fetchJson<Record<string, unknown>>('/data/classic/elements.json'),
      fetchJson<Record<string, unknown>>('/data/classic/reactions.json'),
    ]);
    const bundle: ModeBundle = {
      mode: 'classic',
      cards: cleanCardMap(cardsRaw),
      rules,
      elements,
      reactions,
      skillTree: baseData.skillTree,
      useRarities: false,
    };
    modeCache.set('classic', bundle);
    return bundle;
  }

  const bundle: ModeBundle = {
    mode: 'kingdom',
    cards: baseData.cards,
    rules: baseData.rules,
    decks: baseData.decks,
    useRarities: true,
  };
  modeCache.set('kingdom', bundle);
  return bundle;
}

export function cardTypeToImagePath(type: string): string {
  // Known overrides matching existing assets/cards/ filenames cleanly (fixes dice & compound names)
  const DIRECT_MAP: Record<string, string> = {
    infantry: 'card-infantry.png',
    knight: 'card-knight.png',
    archer: 'card-archer.png',
    apprenticeArcher: 'card-apprentice-archer.png',
    skyArcher: 'card-sky-archer.png',
    apprenticeMage: 'card-apprentice-mage.png',
    mage: 'card-mage.png',
    archmage: 'card-archmage.png',
    spearman: 'card-spearman.png',
    cavalry: 'card-cavalry.png',
    dragonKnight: 'card-dragon-knight.png',
    heavy: 'card-heavy.png',
    heavyInfantry: 'card-heavy.png',
    hero: 'card-hero.png',
    assassin: 'card-assassin.png',
    guardian: 'card-guardian.png',
    treant: 'card-treant.png',
    fireball: 'card-fireball.png',
    thunder: 'card-thunder.png',
    bigThunder: 'card-big-thunder.png',
    heal: 'card-heal.png',
    minorHeal: 'card-minor-heal.png',
    greatHeal: 'card-great-heal.png',
    shield: 'card-shield.png',
    bigShield: 'card-big-shield.png',
    steelShield: 'card-steel-shield.png',
    holyShield: 'card-holy-shield.png',
    godShield: 'card-god-shield.png',
    stoneWall: 'card-stone-wall.png',
    wall: 'card-wall.png',
    castleWall: 'card-wall.png',
    flameSword: 'card-flame-sword.png',
    waterSpear: 'card-water-spear.png',
    windBow: 'card-wind-bow.png',
    earthHammer: 'card-earth-hammer.png',
    ironSword: 'card-iron-sword.png',
    magicSword: 'card-magic-sword.png',
    holySword: 'card-holy-sword.png',
    godSword: 'card-god-sword.png',
    poisonMist: 'card-poison-mist.png',
    frostBreath: 'card-frost-breath.png',
    deepFreeze: 'card-deep-freeze.png',
    toxicRain: 'card-toxic-rain.png',
    holyLight: 'card-holy-light.png',
    deathMist: 'card-death-mist.png',
    absoluteZero: 'card-absolute-zero.png',
    frozenWorld: 'card-frozen-world.png',
    antidote: 'card-antidote.png',
    galeForce: 'card-gale-force.png',
    chainBlast: 'card-chain-blast.png',
    ignitionBurst: 'card-ignition-burst.png',
    shieldBlast: 'card-shield-blast.png',
    purifyFlare: 'card-purify-flare.png',
    weatherCall: 'card-weather-call.png',
    manaRaid: 'card-mana-raid.png',
    lifeSteal: 'card-life-steal.png',
    desperateShot: 'card-desperate-shot.png',
    powderKeg: 'card-powder-keg.png',
    attackDice: 'card-attack-dice.png',
    healDice: 'card-heal-dice.png',
    manaDice: 'card-mana-dice.png',
    coinDice: 'card-coin-dice.png',
    shieldDice: 'card-shield-dice.png',
    buffDice: 'card-buff-dice.png',
    randomDice: 'card-random-dice.png',
    godDice: 'card-god-dice.png',
    moonrise: 'card-moonrise.png',
    dawnbreak: 'card-dawnbreak.png',
    meteor: 'card-meteor.png',
    starfall: 'card-starfall.png',
    giant: 'card-giant.png',
    paladin: 'card-paladin.png',
    druid: 'card-druid.png',
    oracle: 'card-oracle.png',
    witch: 'card-witch.png',
    thief: 'card-thief.png',
    training: 'card-training.png',
    whetstone: 'card-whetstone.png',
    prayer: 'card-prayer.png',
    blessing: 'card-blessing.png',
    mirror: 'card-mirror.png',
    decoy: 'card-decoy.png',
    provisions: 'card-provisions.png',
    goldVein: 'card-gold-vein.png',
    kingTreasure: 'card-king-treasure.png',
    manaShard: 'card-mana-shard.png',
    manaDrop: 'card-mana-drop.png',
    manaCrystal: 'card-mana-crystal.png',
    manaSpring: 'card-mana-spring.png',
    worldTreeDew: 'card-world-tree-dew.png',
    fireSpirit: 'card-fire-spirit.png',
    greatFireSpirit: 'card-great-fire-spirit.png',
    fireKing: 'card-fire-king.png',
    waterSpirit: 'card-water-spirit.png',
    greatWaterSpirit: 'card-great-water-spirit.png',
    waterKing: 'card-water-king.png',
    windSpirit: 'card-wind-spirit.png',
    greatWindSpirit: 'card-great-wind-spirit.png',
    windKing: 'card-wind-king.png',
    earthSpirit: 'card-earth-spirit.png',
    greatEarthSpirit: 'card-great-earth-spirit.png',
    earthKing: 'card-earth-king.png',
    apocalypse: 'card-apocalypse.png',
    adapt: 'card-adapt.png',
    beast_demonKing: 'card-beast-demon-king.png',
    // 4-Factions aliases & Classic deck cards matching js/ui/cardVisuals.js
    fac_king_hero: 'card-hero.png',
    fac_king_god_sword: 'card-god-sword.png',
    fac_king_god_shield: 'card-god-shield.png',
    fac_king_judgement: 'card-judgment.png',
    classic_king_infantry: 'card-fac-king-infantry.png',
    classic_king_cavalry: 'card-fac-king-cavalry.png',
    classic_king_archer: 'card-fac-king-archer.png',
    classic_king_heavy: 'card-fac-king-heavy.png',
    classic_king_priest: 'card-fac-king-priest.png',
    classic_king_holy_sword: 'card-fac-king-holy-sword.png',
    classic_king_lumina_lance: 'card-fac-king-lumina-lance.png',
    classic_king_lumina: 'card-fac-king-lumina.png',
    classic_king_minor_heal: 'card-minor-heal.png',
    classic_king_heal: 'card-fac-king-heal.png',
    classic_king_shield: 'card-fac-king-shield.png',
    classic_king_wall: 'card-fac-king-wall.png',
    classic_king_purify: 'card-fac-king-purify.png',
    classic_king_holy_ray: 'card-fac-king-holy-ray.png',
    classic_demon_skeleton: 'card-fac-demon-skeleton.png',
    classic_demon_imp: 'card-fac-demon-imp.png',
    classic_demon_curser: 'card-fac-demon-curser.png',
    classic_demon_shadow_scythe: 'card-fac-demon-shadow-scythe.png',
    classic_demon_frost_blade: 'card-fac-demon-frost-blade.png',
    classic_demon_chaos_rod: 'card-fac-demon-chaos-rod.png',
    classic_demon_frost_breath: 'card-fac-demon-frost-breath.png',
    classic_demon_poison_mist: 'card-fac-demon-poison-mist.png',
    classic_demon_soul_shard: 'card-fac-demon-soul-shard.png',
    classic_demon_blood_veil: 'card-fac-demon-blood-veil.png',
    classic_demon_bone_shield: 'card-fac-demon-bone-shield.png',
    classic_demon_shadow: 'card-fac-demon-shadow.png',
    classic_demon_curse_mark: 'card-fac-demon-curse-mark.png',
    classic_demon_echo_soul: 'card-fac-demon-echo-soul.png',
    classic_demon_chaos_pulse: 'card-fac-demon-chaos-pulse.png',
  };

  const V2_SLICED_CARDS = new Set([
    'fac_king_chain_sword',
    'fac_forest_flame_sword',
    'fac_forest_aqua_spear',
    'fac_forest_gale_bow',
    'fac_forest_earth_hammer',
    'fac_forest_flare_seed',
    'fac_forest_spring_wave',
    'fac_forest_leaf_storm',
    'fac_forest_root_bind',
    'fac_forest_warden',
    'fac_forest_treant',
    'fac_forest_herb',
    'fac_forest_old_root',
    'fac_demon_zombie',
    'fac_demon_ice_wraith',
    'fac_demon_chaos_spawn',
    'fac_demon_drain_blade',
    'fac_demon_vulnerable',
    'fac_demon_blood_pact',
    'fac_demon_mana_seal',
    'fac_dragon_mage',
    'fac_dragon_scale_guard',
    'fac_dragon_ancient_barrier',
    'fac_dragon_wing_decoy',
    'fac_king_siege',
    'classic_king_holy_fireball',
    'classic_demon_dark_fireball',
    'classic_king_rampart_volley',
  ]);

  if (V2_SLICED_CARDS.has(type)) {
    return `/assets/v2/cards/card-${type.replace(/_/g, '-')}.webp`;
  }
  if (DIRECT_MAP[type]) return `/assets/cards/${DIRECT_MAP[type]}`;
  if (type.startsWith('beast_')) {
    const slug = type.slice(6).replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return `/assets/cards/card-beast-${slug}.png`;
  }
  const kebab = type.replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return `/assets/cards/card-${kebab}.png`;
}
