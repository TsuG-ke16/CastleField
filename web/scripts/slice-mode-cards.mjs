// Extracts 28 sheet-based cards (4-Factions extra & Classic spells) from
// assets/ui/kingdom-v2/*.webp into standalone 256x256 WebP files under
// assets/v2/cards/ matching js/ui/cardVisuals.js grid coordinates.
//
// Usage (from web/): node scripts/slice-mode-cards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(REPO, 'assets/ui/kingdom-v2');
const OUT_DIR = path.join(REPO, 'assets/v2/cards');
fs.mkdirSync(OUT_DIR, { recursive: true });

const EXTRA1_KEYS = [
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
];

const EXTRA2_KEYS = [
  'fac_dragon_mage',
  'fac_dragon_scale_guard',
  'fac_dragon_ancient_barrier',
  'fac_dragon_wing_decoy',
  'fac_king_siege',
];

const CLASSIC_SPELLS_KEYS = [
  'classic_king_holy_fireball',
  'classic_demon_dark_fireball',
  'classic_king_rampart_volley',
];

const SHEET_DEFS = [
  { file: 'cards-extra.webp', cols: 5, rows: 5, keys: EXTRA1_KEYS },
  { file: 'cards-extra2.webp', cols: 3, rows: 2, keys: EXTRA2_KEYS },
  { file: 'classic-spells.webp', cols: 3, rows: 1, keys: CLASSIC_SPELLS_KEYS },
];

const toKebab = (k) => k.replace(/_/g, '-');
const outFiles = [];

for (const def of SHEET_DEFS) {
  const srcPath = path.join(SRC_DIR, def.file);
  const meta = await sharp(srcPath).metadata();
  const cellW = Math.floor((meta.width || 0) / def.cols);
  const cellH = Math.floor((meta.height || 0) / def.rows);
  for (let i = 0; i < def.keys.length; i++) {
    const col = i % def.cols;
    const row = Math.floor(i / def.cols);
    const outName = `card-${toKebab(def.keys[i])}.webp`;
    const outPath = path.join(OUT_DIR, outName);
    await sharp(srcPath)
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 84, effort: 5 })
      .toFile(outPath);
    outFiles.push(`cards/${outName}`);
  }
}

console.log(`Sliced ${outFiles.length} mode cards to assets/v2/cards/`);
