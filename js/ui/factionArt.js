// PR #178 の4陣営56種。画像の対応はUIが持ち、カード定義は参照しない。
// ファイル名はカードIDのアンダースコアをハイフンにしたもの。
const FACTION_CARD_TYPES = new Set([
  "fac_king_infantry",
  "fac_king_cavalry",
  "fac_king_archer",
  "fac_king_heavy",
  "fac_king_priest",
  "fac_king_holy_sword",
  "fac_king_lumina_lance",
  "fac_king_lumina",
  "fac_king_holy_ray",
  "fac_king_minor_heal",
  "fac_king_heal",
  "fac_king_shield",
  "fac_king_wall",
  "fac_king_decoy",
  "fac_king_purify",
  "fac_forest_beastman",
  "fac_forest_elf",
  "fac_forest_druid",
  "fac_forest_fire_bolt",
  "fac_forest_water_stream",
  "fac_forest_gust",
  "fac_forest_fissure",
  "fac_forest_fire_spirit",
  "fac_forest_water_spirit",
  "fac_forest_wind_spirit",
  "fac_forest_earth_spirit",
  "fac_forest_life_drop",
  "fac_forest_thorn_wall",
  "fac_forest_bark_shield",
  "fac_demon_skeleton",
  "fac_demon_imp",
  "fac_demon_curser",
  "fac_demon_shadow_scythe",
  "fac_demon_frost_blade",
  "fac_demon_chaos_rod",
  "fac_demon_shadow",
  "fac_demon_frost_breath",
  "fac_demon_chaos_pulse",
  "fac_demon_poison_mist",
  "fac_demon_curse_mark",
  "fac_demon_soul_shard",
  "fac_demon_echo_soul",
  "fac_demon_blood_veil",
  "fac_demon_bone_shield",
  "fac_dragon_recruit",
  "fac_dragon_dragoon",
  "fac_dragon_flame_whelp",
  "fac_dragon_thunder_whelp",
  "fac_dragon_fang_sword",
  "fac_dragon_thunder_spear",
  "fac_dragon_fireball",
  "fac_dragon_bolt",
  "fac_dragon_flame_breath",
  "fac_dragon_blood_drop",
  "fac_dragon_ash_veil",
  "fac_dragon_whelp_scale"
]);

export function factionCardPath(type) {
  return FACTION_CARD_TYPES.has(type)
    ? `cards/card-${type.replaceAll('_', '-')}.png`
    : null;
}

const FACTION_SOLDIER_TYPES = new Set([
  "fac_king_infantry",
  "fac_king_cavalry",
  "fac_king_archer",
  "fac_king_heavy",
  "fac_king_priest",
  "fac_forest_beastman",
  "fac_forest_elf",
  "fac_forest_druid",
  "fac_demon_skeleton",
  "fac_demon_imp",
  "fac_demon_curser",
  "fac_dragon_recruit",
  "fac_dragon_dragoon",
  "fac_dragon_flame_whelp",
  "fac_dragon_thunder_whelp"
]);

export function factionUnitPath(type) {
  return FACTION_SOLDIER_TYPES.has(type) ? factionCardPath(type) : null;
}
