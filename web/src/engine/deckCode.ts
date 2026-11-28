const PREFIX = 'CF2-';

function encodeUtf8Base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeUtf8Base64Url(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Encode a deck map ({ cardKey: count }) into a portable CF2-... share code. */
export function encodeDeckCode(cards: Record<string, number>): string {
  const csv = Object.entries(cards)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}:${Math.max(1, Math.min(6, Math.floor(count)))}`)
    .join(',');
  return `${PREFIX}${encodeUtf8Base64Url(csv)}`;
}

/** Decode and validate a CF2-... share code against known card keys. */
export function decodeDeckCode(
  raw: string,
  validCardKeys: Set<string> | Record<string, unknown>
): { ok: true; cards: Record<string, number>; skipped: number } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREFIX) || trimmed.length <= PREFIX.length) {
    return { ok: false, reason: '有効なカードが見つかりませんでした' };
  }
  let csv = '';
  try {
    csv = decodeUtf8Base64Url(trimmed.slice(PREFIX.length));
  } catch {
    return { ok: false, reason: '有効なカードが見つかりませんでした' };
  }
  const hasKey =
    validCardKeys instanceof Set
      ? (k: string) => validCardKeys.has(k)
      : (k: string) => Object.prototype.hasOwnProperty.call(validCardKeys, k);

  const cards: Record<string, number> = {};
  let skipped = 0;
  for (const part of csv.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const colon = seg.lastIndexOf(':');
    if (colon <= 0) {
      skipped += 1;
      continue;
    }
    const key = seg.slice(0, colon).trim();
    const countNum = Number(seg.slice(colon + 1).trim());
    if (!key || !Number.isFinite(countNum) || countNum <= 0) {
      skipped += 1;
      continue;
    }
    if (!hasKey(key)) {
      skipped += 1;
      continue;
    }
    cards[key] = Math.max(1, Math.min(6, Math.floor(countNum)));
  }

  if (Object.keys(cards).length === 0) {
    return { ok: false, reason: '有効なカードが見つかりませんでした' };
  }
  return { ok: true, cards, skipped };
}
