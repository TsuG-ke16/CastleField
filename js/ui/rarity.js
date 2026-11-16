// Names are populated from data/rarities.json when the UI is initialized.
export const RARITY_NAMES = {};
export function setRarities(defs) {
  for (const [id, def] of Object.entries(defs ?? {})) RARITY_NAMES[id] = def.name;
}
