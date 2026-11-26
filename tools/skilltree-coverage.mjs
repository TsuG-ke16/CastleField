// 200ノードのハンドラの有無（カバレッジ）を docs/skilltree-200-coverage.md に書き出す（段階D2）。
//   node tools/skilltree-coverage.mjs          … 書き出す
//   node tools/skilltree-coverage.mjs --check  … 書き出さずに今のファイルと同じか確かめる（違えば終了コード1）
// 区分は js/game/skills/qa.js の implementationOf（= Runtime.implementation と同じ判定）：
//   handler（handlers/*.js に on/mods/actions/scheduled/mulligan がある）・core（基盤 Luck.js/Crit.js）・static（試合開始時の数値）・休眠（どれもない）
// 「部分実装」「対応づけ」などの理由は docs/skilltree-200-handoff.md のノード別の表（docs/skilltree-200-notes/*.md の集約）にある。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { implementationOf } from '../js/game/skills/qa.js';
import { HANDLERS } from '../js/game/skills/handlers/index.js';
import { CPU_SKILL_ACTIONS } from '../js/game/strategies.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tree = JSON.parse(readFileSync(join(root, 'data/classic/skilltree.json'), 'utf8'));
const out = join(root, 'docs/skilltree-200-coverage.md');

export function coverage(t = tree) {
  return t.nodes.map((n) => {
    const actions = Object.keys(HANDLERS[n.id]?.actions ?? {});
    return {
      id: n.id, name: n.name, group: n.group, impl: implementationOf(n.id) ?? 'dormant', actions,
      cpu: actions.length ? (actions.some((a) => CPU_SKILL_ACTIONS[a]) ? 'use' : 'skip') : '-',
    };
  });
}

export function render(rows) {
  const count = (k) => rows.filter((r) => r.impl === k).length;
  const lines = [
    '# 200ノード ハンドラのカバレッジ（自動生成）',
    '',
    '`node tools/skilltree-coverage.mjs` が作る（手で直さない）。`tests/classic-skills-d2.test.js` が一致を確かめる。',
    '区分：handler＝handlers/*.js の効果ハンドラ／core＝基盤（Luck.js・Crit.js）／static＝試合開始時の数値（SkillTree.js の STATIC_HANDLERS）／**dormant＝休眠**（取得できるが戦闘で何も起きない。counters は null）。',
    '「部分実装・既存仕様への対応づけ」の理由は docs/skilltree-200-handoff.md のノード別の表を見ること。CPU 列：任意アクションを CPU が使う（use）／使わない（skip）／任意アクションなし（-）。',
    '',
    `合計 ${rows.length}：handler ${count('handler')}・core ${count('core')}・static ${count('static')}・dormant ${count('dormant')}`,
    '',
    `休眠：${rows.filter((r) => r.impl === 'dormant').map((r) => r.id).join('・') || 'なし'}`,
    '',
    '| ID | 名称 | 系統 | 区分 | 任意アクション | CPU |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.name} | ${r.group} | ${r.impl === 'dormant' ? '**dormant**' : r.impl} | ${r.actions.join(' ') || '-'} | ${r.cpu} |`),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = render(coverage());
  if (process.argv.includes('--check')) {
    let cur = '';
    try {
      cur = readFileSync(out, 'utf8');
    } catch {}
    if (cur !== text) {
      console.error('docs/skilltree-200-coverage.md が古いです（node tools/skilltree-coverage.mjs で作り直す）');
      process.exit(1);
    }
    console.log('同じです');
  } else {
    writeFileSync(out, text);
    console.log(`書き出しました：${out}`);
  }
}
