import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ARTIFACT_DIR = 'C:/Users/keisu/.gemini/antigravity/brain/486b6279-249f-4870-81bd-c2f66a4d1fbc';
const V2_DIR = path.join(REPO_ROOT, 'assets', 'v2');
const RAW_DIR = path.join(V2_DIR, 'raw');
const BTN_DIR = path.join(V2_DIR, 'ui', 'buttons');
const FRAME_DIR = path.join(V2_DIR, 'ui', 'frames');
const ICON_DIR = path.join(V2_DIR, 'icons');

fs.mkdirSync(RAW_DIR, { recursive: true });
fs.mkdirSync(BTN_DIR, { recursive: true });
fs.mkdirSync(FRAME_DIR, { recursive: true });
fs.mkdirSync(ICON_DIR, { recursive: true });

// Copy original JPGs into assets/v2/raw/ as PNG for archival reproducibility
const SOURCES = {
  buttons: path.join(ARTIFACT_DIR, 'buttons_sheet_1795784760660.jpg'),
  frames: path.join(ARTIFACT_DIR, 'frames_ribbons_sheet_1795784771347.jpg'),
  icons: path.join(ARTIFACT_DIR, 'icons_sheet_1795784784050.jpg'),
};

for (const [key, src] of Object.entries(SOURCES)) {
  await sharp(src).png().toFile(path.join(RAW_DIR, `${key}-sheet.png`));
}

/**
 * Flood-fill outer near-white background to transparent, preserving interior whites (parchment, eyes, highlights).
 */
async function extractTransparentRegion(imgPath, extractRect, outPath, options = {}) {
  const {
    resizeWidth = null,
    resizeHeight = null,
    fit = 'contain',
    whiteThreshold = 238,
    hollowCenterWhite = false,
  } = options;

  let pipeline = sharp(imgPath).extract(extractRect).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const buf = Buffer.from(data);

  const isNearWhite = (idx) => {
    const r = buf[idx];
    const g = buf[idx + 1];
    const b = buf[idx + 2];
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC >= whiteThreshold && maxC - minC <= 22;
  };

  // Flood fill from all 4 borders
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const pushIfWhite = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    if (!isNearWhite(p * channels)) return;
    visited[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < width; x++) {
    pushIfWhite(x, 0);
    pushIfWhite(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfWhite(0, y);
    pushIfWhite(width - 1, y);
  }
  if (hollowCenterWhite) {
    // Also seed from exact center for closed hollow frames (wood board frame)
    pushIfWhite(Math.floor(width / 2), Math.floor(height / 2));
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = (p - x) / width;
    buf[p * channels + 3] = 0;
    pushIfWhite(x + 1, y);
    pushIfWhite(x - 1, y);
    pushIfWhite(x, y + 1);
    pushIfWhite(x, y - 1);
  }

  // Soft 1px feather on pixels adjacent to transparent background that are light
  const copyAlpha = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) copyAlpha[p] = buf[p * channels + 3];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (copyAlpha[p] === 0) continue;
      const hasTransparentNeighbor =
        copyAlpha[p - 1] === 0 ||
        copyAlpha[p + 1] === 0 ||
        copyAlpha[p - width] === 0 ||
        copyAlpha[p + width] === 0;
      if (hasTransparentNeighbor) {
        const idx = p * channels;
        const lum = (buf[idx] + buf[idx + 1] + buf[idx + 2]) / 3;
        if (lum > 200) {
          buf[idx + 3] = Math.max(0, Math.round(255 * (1 - (lum - 200) / 55)));
        }
      }
    }
  }

  // Trim bounding box of non-transparent pixels
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (buf[(y * width + x) * channels + 3] > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  let outImg = sharp(buf, { raw: { width, height, channels } });
  if (maxX >= minX && maxY >= minY) {
    const pad = 2;
    const cx = Math.max(0, minX - pad);
    const cy = Math.max(0, minY - pad);
    const cw = Math.min(width - cx, maxX - minX + 1 + pad * 2);
    const ch = Math.min(height - cy, maxY - minY + 1 + pad * 2);
    outImg = outImg.extract({ left: cx, top: cy, width: cw, height: ch });
  }

  if (resizeWidth && resizeHeight) {
    outImg = outImg.resize(resizeWidth, resizeHeight, {
      fit,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  } else if (resizeWidth || resizeHeight) {
    outImg = outImg.resize(resizeWidth, resizeHeight);
  }

  await outImg.webp({ quality: 92, alphaQuality: 95 }).toFile(outPath);
  const stat = fs.statSync(outPath);
  return { file: path.relative(V2_DIR, outPath).replaceAll('\\', '/'), bytes: stat.size };
}

const manifest = { buttons: [], frames: [], icons: [] };

// 1. Slice 4 buttons (1024x1024 stacked into 4 rows of 256px)
const buttonMeta = await sharp(SOURCES.buttons).metadata();
const bw = buttonMeta.width;
const bh = Math.floor(buttonMeta.height / 4);
const buttonDefs = [
  { name: 'btn-primary-gold', row: 0 },
  { name: 'btn-normal-stone', row: 1 },
  { name: 'btn-selected-royal', row: 2 },
  { name: 'btn-danger-ruby', row: 3 },
];
for (const b of buttonDefs) {
  const res = await extractTransparentRegion(
    SOURCES.buttons,
    { left: 0, top: b.row * bh, width: bw, height: bh },
    path.join(BTN_DIR, `${b.name}.webp`),
    { resizeWidth: 360, resizeHeight: 112, fit: 'fill', whiteThreshold: 235 }
  );
  manifest.buttons.push(res);
}

// Create round buttons cleanly derived in matching style (crop left+right cap or smooth pill)
// Using center-cropped square ends from gold/stone buttons gives crisp circular cap buttons!
for (const [name, srcBtn] of [['btn-round-gold', 'btn-primary-gold.webp'], ['btn-round-stone', 'btn-normal-stone.webp']]) {
  const srcPath = path.join(BTN_DIR, srcBtn);
  const meta = await sharp(srcPath).metadata();
  const capW = Math.round(meta.height * 0.52);
  const leftCap = await sharp(srcPath).extract({ left: 0, top: 0, width: capW, height: meta.height }).toBuffer();
  const rightCap = await sharp(srcPath).extract({ left: meta.width - capW, top: 0, width: capW, height: meta.height }).toBuffer();
  const roundPath = path.join(BTN_DIR, `${name}.webp`);
  await sharp({
    create: { width: capW * 2, height: meta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: leftCap, left: 0, top: 0 },
      { input: rightCap, left: capW, top: 0 },
    ])
    .resize(128, 128, { fit: 'fill' })
    .webp({ quality: 92, alphaQuality: 95 })
    .toFile(roundPath);
  manifest.buttons.push({ file: `ui/buttons/${name}.webp`, bytes: fs.statSync(roundPath).size });
}

// 2. Slice 4 frames/ribbons (2x2 grid)
const fMeta = await sharp(SOURCES.frames).metadata();
const hw = Math.floor(fMeta.width / 2);
const hh = Math.floor(fMeta.height / 2);
const frameDefs = [
  { name: 'frame-parchment', left: 0, top: 0, rw: 384, rh: 280, hollow: false },
  { name: 'frame-wood-board', left: hw, top: 0, rw: 320, rh: 320, hollow: true },
  { name: 'banner-victory-ribbon', left: 0, top: hh, rw: 512, rh: 260, hollow: false },
  { name: 'banner-defeat-ribbon', left: hw, top: hh, rw: 512, rh: 260, hollow: false },
];
for (const f of frameDefs) {
  const res = await extractTransparentRegion(
    SOURCES.frames,
    { left: f.left, top: f.top, width: hw, height: hh },
    path.join(FRAME_DIR, `${f.name}.webp`),
    { resizeWidth: f.rw, resizeHeight: f.rh, fit: 'contain', whiteThreshold: 238, hollowCenterWhite: f.hollow }
  );
  manifest.frames.push(res);
}

// 3. Slice 16 icons (4x4 grid)
const iMeta = await sharp(SOURCES.icons).metadata();
const cw = Math.floor(iMeta.width / 4);
const ch = Math.floor(iMeta.height / 4);
const iconNames = [
  'cpu', 'online', 'local', 'filter',
  'bell', 'close', 'check', 'arrow',
  'rank-unranked', 'shop', 'skin', 'ranking',
  'mission', 'crown', 'battle', 'deck',
];
for (let idx = 0; idx < iconNames.length; idx++) {
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  const res = await extractTransparentRegion(
    SOURCES.icons,
    { left: col * cw, top: row * ch, width: cw, height: ch },
    path.join(ICON_DIR, `${iconNames[idx]}.webp`),
    { resizeWidth: 128, resizeHeight: 128, fit: 'contain', whiteThreshold: 238 }
  );
  manifest.icons.push(res);
}

// Also bring over existing high-quality painted icons into assets/v2/icons/ as WebP so web/ has zero dependency on legacy SVG icons
const EXTRA_EXISTING_ICONS = [
  ['gacha', 'assets/ui/home/gacha.png'],
  ['catalog', 'assets/ui/home/catalog.png'],
  ['settings', 'assets/ui/home/settings.png'],
  ['profile', 'assets/ui/home/profile.png'],
  ['rank', 'assets/ui/home/rank.png'],
  ['friend', 'assets/ui/home/friend.png'],
  ['coin', 'assets/ui/icon-coin.png'],
  ['heart', 'assets/ui/icon-heart.png'],
  ['mp', 'assets/ui/icon-mp.png'],
  ['help', 'assets/ui/icon-help.png'],
  ['fire', 'assets/ui/icon-fire.png'],
  ['water', 'assets/ui/icon-water.png'],
  ['wind', 'assets/ui/icon-wind.png'],
  ['earth', 'assets/ui/icon-earth.png'],
];
for (const [name, relPath] of EXTRA_EXISTING_ICONS) {
  const src = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(src)) continue;
  const dst = path.join(ICON_DIR, `${name}.webp`);
  await sharp(src)
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92, alphaQuality: 95 })
    .toFile(dst);
  manifest.icons.push({ file: `icons/${name}.webp`, bytes: fs.statSync(dst).size });
}

fs.writeFileSync(path.join(V2_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Processed v2 assets:', {
  buttons: manifest.buttons.length,
  frames: manifest.frames.length,
  icons: manifest.icons.length,
});
