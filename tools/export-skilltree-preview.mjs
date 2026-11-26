// node tools/export-skilltree-preview.mjs [出力先]
// data/classic/skilltree.json を、PR #200 のスキルツリーの独立プレビュー（previews/skill-tree/）の「仕様データ読込」が
// そのまま読める JSON にする（既定の出力先 docs/skilltree-200-preview.json）。変換は js/ui/skillTreeExport.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toPreviewJson } from '../js/ui/skillTreeExport.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const tree = JSON.parse(readFileSync(`${root}data/classic/skilltree.json`, 'utf8'));
const out = process.argv[2] ?? `${root}docs/skilltree-200-preview.json`;
const json = toPreviewJson(tree);
writeFileSync(out, `${JSON.stringify(json, null, 1)}\n`);
console.log(`${out}：groups ${json.groups.length}・nodes ${json.nodes.length}・edges ${json.edges.length}`);
