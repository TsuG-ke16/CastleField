import { dropRates } from '../game/Setup.js';

export function currentRates({ session, viewerId, luckFrom, permLuckFrom }, cards, rarities) {
  if (!rarities) return {};
  const player = session?.getState(viewerId)?.players[viewerId];
  const luck = player?.luck;
  if (luck) return dropRates(cards, rarities, { from: luck.from ?? luckFrom, multiplier: luck.boost });
  const base = dropRates(cards, rarities);
  const perm = player?.permLuck;
  if (!perm) return base;
  const boosted = dropRates(cards, rarities, { from: perm.from ?? permLuckFrom, multiplier: perm.boost });
  return Object.fromEntries(Object.keys(base).map(id => [id, base[id] * (1 - perm.chance) + boosted[id] * perm.chance]));
}

export function fusionPaths(type, cards) {
  const predecessors = new Set(Object.values(cards).map((c) => c.fuseTo).filter(Boolean));
  const paths = [];
  for (const root of Object.keys(cards).filter((id) => !predecessors.has(id))) {
    const path = [], seen = new Set();
    for (let id = root; id && cards[id] && !seen.has(id); id = cards[id].fuseTo) { seen.add(id); path.push(id); }
    if (path.includes(type)) paths.push(path);
  }
  return paths.length ? paths : [[type]];
}
