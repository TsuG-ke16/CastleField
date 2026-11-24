// ランクのエンブレム（全階級および認定中の未確定盾をすべて画像素材で描画する。SVGは不使用）。
const tierArt = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'];
const divisions = ['', 'I', 'II', 'III'];
const escapeAttribute = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** @param {{ tierIndex: number, division: number|null, color: string, name: string, divisionLabel?: string }|null} rank 認定中は null（「？」の宇宙クリスタル盾） */
export function rankEmblem(rank, size = 64) {
  const label = rank ? escapeAttribute(rank.divisionLabel ?? rank.name) : 'ランク未確定';
  const file = tierArt[rank?.tierIndex];
  if (file) {
    const division = divisions[rank.division] ?? '';
    return `<span class="rank-emblem rank-emblem-painted" style="--rank-emblem-size:${size}px" role="img" aria-label="${label}"><img src="assets/ranks/rank-${file}.png" width="${size}" height="${size}" alt="" decoding="async">${division ? `<b aria-hidden="true">${division}</b>` : ''}</span>`;
  }
  return `<span class="rank-emblem rank-emblem-painted rank-emblem-unranked" style="--rank-emblem-size:${size}px" role="img" aria-label="${label}"><img src="assets/ui/cosmic/rank-unranked.webp" width="${size}" height="${size}" alt="" decoding="async"></span>`;
}
