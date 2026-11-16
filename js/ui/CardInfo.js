import { dropRates } from '../game/Setup.js';

export function currentRates({ session, viewerId, luckFrom }, cards, rarities) {
  if (!rarities) return {};
  const luck = session?.getState(viewerId)?.players[viewerId]?.luck;
  if (luck) return dropRates(cards, rarities, { from: luckFrom, multiplier: luck.boost });
  const local = session?.getDropRates?.();
  return local ? Object.fromEntries(Object.entries(local.cards).map(([id, c]) => [id, c.rate])) : dropRates(cards, rarities);
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
