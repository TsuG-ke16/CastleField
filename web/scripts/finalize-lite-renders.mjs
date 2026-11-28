// Finalizes the Phase 8 Lite (power-saver) prerenders:
//   assets/v2/renders/_hires/*.png (Blender, 200% supersampled)
//   -> assets/v2/renders/*.webp (50% downscale, lossy WebP with alpha)
// Supersampling + downscale hides sub-pixel seams between glTF meshes.
//
// Usage (from web/): node scripts/finalize-lite-renders.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERS = path.resolve(__dirname, '../../assets/v2/renders');
const HIRES = path.join(RENDERS, '_hires');

if (!fs.existsSync(HIRES)) {
  console.error(`No hi-res renders found at ${HIRES}. Run Blender render_power_saver_sprites.py first.`);
  process.exit(1);
}

let total = 0;
for (const file of fs.readdirSync(HIRES).filter((f) => f.endsWith('.png')).sort()) {
  const src = path.join(HIRES, file);
  const meta = await sharp(src).metadata();
  const width = Math.round((meta.width || 0) / 2);
  const height = Math.round((meta.height || 0) / 2);
  const out = path.join(RENDERS, file.replace(/\.png$/, '.webp'));
  await sharp(src)
    .resize(width, height, { kernel: 'lanczos3' })
    .webp({ quality: 80, alphaQuality: 90, effort: 6 })
    .toFile(out);
  const size = fs.statSync(out).size;
  total += size;
  console.log(`${path.basename(out)}  ${width}x${height}  ${size} bytes`);
}
fs.rmSync(HIRES, { recursive: true, force: true });
console.log(`TOTAL ${total} bytes`);
