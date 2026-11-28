import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_DIR, '..');

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

test('all 230 cards across Normal, Classic, and 4-Factions resolve to existing artwork', () => {
  const loader = fs.readFileSync(path.join(WEB_DIR, 'src/engine/dataLoader.ts'), 'utf8');
  const direct = {};
  const dm = loader.match(/const DIRECT_MAP[\s\S]*?=\s*\{([\s\S]*?)\};/);
  if (dm) {
    for (const m of dm[1].matchAll(/([a-zA-Z0-9_]+)\s*:\s*'([^']+)'/g)) direct[m[1]] = m[2];
  }
  const sliced = new Set();
  const sm = loader.match(/const V2_SLICED_CARDS = new Set\(\[([\s\S]*?)\]\);/);
  if (sm) {
    for (const m of sm[1].matchAll(/'([^']+)'/g)) sliced.add(m[1]);
  }

  const resolve = (type) => {
    if (sliced.has(type)) return path.join(REPO_ROOT, `assets/v2/cards/card-${type.replace(/_/g, '-')}.webp`);
    if (direct[type]) return path.join(REPO_ROOT, `assets/cards/${direct[type]}`);
    if (type.startsWith('beast_')) {
      const slug = type.slice(6).replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      return path.join(REPO_ROOT, `assets/cards/card-beast-${slug}.png`);
    }
    const kebab = type.replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return path.join(REPO_ROOT, `assets/cards/card-${kebab}.png`);
  };

  const jsonFiles = [
    path.join(REPO_ROOT, 'data/cards.json'),
    path.join(REPO_ROOT, 'data/classic/cards.json'),
    ...fs
      .readdirSync(path.join(REPO_ROOT, 'data/factions/cards'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(REPO_ROOT, 'data/factions/cards', f)),
  ];

  let total = 0;
  const missing = [];
  for (const file of jsonFiles) {
    const cards = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of Object.keys(cards)) {
      total++;
      const resolved = resolve(key);
      if (!fs.existsSync(resolved)) missing.push({ file: path.basename(file), key, resolved });
    }
  }
  assert.equal(total, 230);
  assert.deepEqual(missing, []);
});

test('assets/v2/manifest.json assets exist, contain zero SVGs, and obey size budgets', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets/v2/manifest.json'), 'utf8'));
  const toPath = (item) => (typeof item === 'string' ? item : item.file);
  const relPaths = [
    ...(manifest.buttons || []).map(toPath),
    ...(manifest.frames || []).map(toPath),
    ...(manifest.icons || []).map(toPath),
    ...(manifest.models || []).map(toPath),
    ...(manifest.renders || []).map(toPath),
    ...(manifest.cards || []).map(toPath),
  ];
  assert.ok(relPaths.length >= 90);

  for (const rel of relPaths) {
    assert.ok(!rel.toLowerCase().endsWith('.svg'), `SVG not allowed in v2 manifest: ${rel}`);
    const full = path.join(REPO_ROOT, 'assets/v2', rel);
    assert.ok(fs.existsSync(full), `Missing manifest asset: ${rel}`);
    const bytes = fs.statSync(full).size;
    if (rel === 'models/home-diorama-v2.glb') assert.ok(bytes <= 2.5 * 1024 * 1024, `${rel} too large`);
    else if (rel.startsWith('models/field-')) assert.ok(bytes <= 1.2 * 1024 * 1024, `${rel} too large`);
    else if (rel === 'models/gacha-chest-v2.glb') assert.ok(bytes <= 500 * 1024, `${rel} too large`);
    else if (rel.startsWith('renders/battle-')) assert.ok(bytes <= 150 * 1024, `${rel} too large`);
  }
});

test('dist/index.html exists and does not preload vendor-three on initial boot', () => {
  const indexPath = path.join(WEB_DIR, 'dist/index.html');
  assert.ok(fs.existsSync(indexPath), 'web/dist/index.html must exist (run npm run build first)');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.equal(/modulepreload[^>]+vendor-three/i.test(html), false);
});

test('web/src contains zero SVGs, zero !important, and zero banned legacy button assets', () => {
  const forbidden = /<svg|\.svg|data:image\/svg|!important|btn-end-turn|button-end-turn|assets\/ui\/btn-|assets\/ui\/natural/i;
  const hits = [];
  for (const file of walkFiles(path.join(WEB_DIR, 'src'))) {
    const content = fs.readFileSync(file, 'utf8');
    if (forbidden.test(content)) {
      hits.push(path.relative(REPO_ROOT, file));
    }
  }
  assert.deepEqual(hits, []);
});

test('deckCode share helper round-trips deck maps and vite PWA config prevents stale cache fallback', async () => {
  const viteCfg = fs.readFileSync(path.join(WEB_DIR, 'vite.config.ts'), 'utf8');
  assert.match(viteCfg, /cleanupOutdatedCaches:\s*true/);
  assert.match(viteCfg, /navigateFallbackDenylist:/);

  const deckCodePath = path.join(WEB_DIR, 'src/engine/deckCode.ts');
  assert.ok(fs.existsSync(deckCodePath));
  const ts = require(path.join(WEB_DIR, 'node_modules/typescript/lib/typescript.js'));
  const tsSource = fs.readFileSync(deckCodePath, 'utf8');
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  const { encodeDeckCode, decodeDeckCode } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText, 'utf8').toString('base64')}`
  );
  const realCards = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data/cards.json'), 'utf8'));
  const keys = Object.keys(realCards).slice(0, 3);
  const sample = { [keys[0]]: 4, [keys[1]]: 2, [keys[2]]: 9 };

  const code = encodeDeckCode(sample);
  assert.ok(code.startsWith('CF2-'));
  const decoded = decodeDeckCode(code, realCards);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.cards, { [keys[0]]: 4, [keys[1]]: 2, [keys[2]]: 6 });
  assert.equal(decoded.skipped, 0);

  const bad = decodeDeckCode('INVALID-123', realCards);
  assert.equal(bad.ok, false);
});
