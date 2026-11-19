import { skinArt } from './skinArt.js';

const portraits = new Set(['infantry', 'spearman', 'knight', 'archer', 'mage', 'hero']);

export function profileArt(id, fallback) {
  if (portraits.has(id)) return `assets/profiles/${id}.png`;
  return skinArt(id) ?? fallback;
}
