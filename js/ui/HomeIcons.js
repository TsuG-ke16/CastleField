import { NAV_ART, atlasMarkup } from './KingdomArt.js';
// ホーム専用。ナビ・操作アイコンを同じ24pxグリッド/線幅で描く。
const paths = {
  profile:'<circle cx="12" cy="8" r="3.2"/><path d="M5 21v-3a7 7 0 0 1 14 0v3Z"/>',
  deck:'<path d="m4 7 10-3 4 14-10 3Z"/><path d="M10 3h10v15M7 10l6-2M8 14l6-2"/>',
  rank:'<path d="m4 3 7 7-3 3-7-7 3-3Zm16 0-7 7 3 3 7-7-3-3ZM9 14l-6 7m12-7 6 7M2 17l5 5m10-5 5 5"/>',
  gacha:'<path d="m12 2 8 6-2 11-6 3-6-3L4 8Zm-8 6h16M4 8l8 6 8-6m-8 6v8M12 2l-4 6 4 6 4-6-4-6Z"/>',
  settings:'<path d="m9 2-1 3-3 1-3 3 2 3-1 3 3 3 3-1 3 2 3-2 3 1 3-3-1-3 2-3-3-3-3-1-1-3Z"/><circle cx="12" cy="11" r="3"/>',
  catalog:'<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15M5 8h4m-4 4h4m6-4h4m-4 4h4"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 1 1 5 3c-1 1-2 1-2 3m0 3h.01"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  arrow:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  solo:'<path d="M5 7h14v12H5ZM8 7V4m8 3V4M8 11h1m6 0h1m-7 4h6M2 10v6m20-6v6"/>',
  online:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a18 18 0 0 1 0 20 18 18 0 0 1 0-20"/>',
  local:'<circle cx="8" cy="7" r="3"/><circle cx="18" cy="8" r="2.5"/><path d="M2 21v-3a6 6 0 0 1 12 0v3Zm13-7a5 5 0 0 1 8 4v3h-6"/>',
  ranking:'<path d="M4 21V11h5v10m1 0V4h5v17m1 0v-7h5v7"/>',
  mission:'<path d="M8 4h10v18H3V4h4m2-2h6v4H9Zm-3 9 2 2 3-4m-5 9h9"/>',
  friend:'<circle cx="8" cy="7" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3m4-13v8m-4-4h8"/>',
  shop:'<path d="M3 8h18l-2-5H5Zm1 0v13h16V8M9 21v-7h6v7M3 8v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V8"/>',
  skin:'<path d="m8 3 4 3 4-3 6 5-4 5-2-2v11H8V11l-2 2-4-5Z"/>',
};
export const homeIcon = (id, size=24) => NAV_ART[id] ? atlasMarkup(NAV_ART[id],'home-nav-art',size) : `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id] ?? paths.more}</svg>`;
