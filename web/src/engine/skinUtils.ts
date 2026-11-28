import type { LoadedGameData, ShopItem } from './types';

export function getShopItemMap(data: LoadedGameData | null): Record<string, ShopItem> {
  if (!data?.shop) return {};
  const raw = data.shop;
  if (Array.isArray(raw)) {
    const out: Record<string, ShopItem> = {};
    for (const it of raw) out[it.id] = it;
    return out;
  }
  if (Array.isArray(raw.items)) {
    const out: Record<string, ShopItem> = {};
    for (const it of raw.items) out[it.id] = it;
    return out;
  }
  const out: Record<string, ShopItem> = {};
  for (const [id, v] of Object.entries(raw.items || {})) {
    out[id] = { id, ...v };
  }
  return out;
}

export function getSkinFilter(
  data: LoadedGameData | null,
  skinId: string,
  side: 'blue' | 'orange' = 'blue'
): string | undefined {
  const map = getShopItemMap(data);
  const f = map[skinId]?.filters?.[side];
  return typeof f === 'string' && f.trim().length > 0 ? f : undefined;
}

export function getSkinPreviewImage(slotOrId: string): string {
  if (slotOrId === 'castle' || slotOrId.startsWith('castle')) {
    return '/assets/castles/castle-blue.png';
  }
  if (slotOrId === 'cardBack' || slotOrId === 'back' || slotOrId.includes('back') || slotOrId.includes('cardBack')) {
    return '/assets/ui/card-back.png';
  }
  if (slotOrId === 'spellSkin' || slotOrId.startsWith('spell')) {
    return '/assets/cards/card-fireball.png';
  }
  return '/assets/cards/card-infantry.png';
}
