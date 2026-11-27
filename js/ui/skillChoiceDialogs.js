// スキルの選択UI（クラシック）：対戦中のスキルの設定（X15 の選び方・L06 の出目・X35 の自動延期）と、X15 の「2枚から選ぶ」ダイアログ。
// ルールは Game 側（js/game/skills/Runtime.js の SKILL_PREFS・X15 の選択待ち）だけ。ここは表示と、セッションへの受け渡しだけ。
// 設定の行は skillTreeModel.js の skillPrefRows（DOM 非依存）で作る。

import { skillPrefRows } from './skillTreeModel.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** 設定を端末に覚えるキー（次の試合の始めに、取ったノードの分だけ送り直す） */
export const PREFS_STORAGE_KEY = 'cf-skill-prefs';

/** パネルの「スキルの設定」の HTML（設定できるノードを取っていなければ空文字） */
export function prefsSectionHtml(skills, prefs) {
  const rows = skillPrefRows(skills, prefs);
  if (!rows.length) return '';
  return `<h3>スキルの設定</h3><div class="sb-prefs">${rows.map((r) => {
    const id = `sbp-${r.skillId}-${r.key}`;
    const input = r.type === 'toggle'
      ? `<label for="${id}"><input id="${id}" type="checkbox" data-pref="${r.skillId}" data-key="${r.key}"${r.value ? ' checked' : ''}>${esc(r.label)}</label>`
      : `<label for="${id}">${esc(r.label)}</label><select id="${id}" data-pref="${r.skillId}" data-key="${r.key}">${r.choices.map(([v, l]) => `<option value="${esc(v)}"${r.value === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<div class="sb-q sb-pref">${input}<p class="sb-note">${esc(r.note)}</p></div>`;
  }).join('')}</div>`;
}

/** 変えた入力から setSkillPrefs の形 { ノードID: { キー: 値 } } を作る（data-pref の入力でなければ null） */
export function prefFromInput(target) {
  const skillId = target?.dataset?.pref;
  const key = target?.dataset?.key;
  if (!skillId || !key) return null;
  return { [skillId]: { [key]: target.type === 'checkbox' ? target.checked : target.value } };
}

/** 端末に覚えた設定（壊れていれば空） */
export function loadSavedPrefs(storage) {
  try {
    const v = JSON.parse(storage?.getItem(PREFS_STORAGE_KEY) ?? 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** 設定を端末に覚える（今までの分に重ねる） */
export function savePrefs(storage, prefs) {
  try {
    const cur = loadSavedPrefs(storage);
    for (const [id, kv] of Object.entries(prefs)) cur[id] = { ...(cur[id] ?? {}), ...kv };
    storage?.setItem(PREFS_STORAGE_KEY, JSON.stringify(cur));
  } catch { /* 保存できない端末では、その試合だけの設定 */ }
}

/** 覚えた設定のうち、この試合で取ったノード・画面に出す設定の分だけ（試合の始めに送る） */
export function savedPrefsFor(skills, saved) {
  const allowed = new Map(skillPrefRows(skills, {}).map((r) => [`${r.skillId}.${r.key}`, r]));
  const out = {};
  for (const [id, kv] of Object.entries(saved ?? {})) {
    for (const [k, v] of Object.entries(kv ?? {})) {
      const row = allowed.get(`${id}.${k}`);
      if (!row) continue;
      if (row.type === 'toggle' ? typeof v !== 'boolean' : !row.choices.some(([c]) => c === v)) continue;
      (out[id] ??= {})[k] = v;
    }
  }
  return out;
}

/**
 * X15 運命の引き寄せの「2枚から選ぶ」ダイアログ。選んだら onPick(index)、「あとで」なら閉じるだけ
 * （パネルの「スキルを使う」からも選べる。選ばずにほかの操作をすると Game が MPコストの大きい方に決める）。
 * @returns {{ close: () => void, el: HTMLElement }}
 */
export function openX15Dialog({ choice, cards, onPick }) {
  const dlg = document.createElement('div');
  dlg.className = 'skill-battle sb-choice';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', '運命の引き寄せ：引くカードを選ぶ');
  dlg.innerHTML = `<div class="sb-head"><h2>運命の引き寄せ（X15）</h2></div>
    <p>山札の上の2枚から、引くカードを1枚選んでください。選ばなかったカードは山札の一番上に戻ります。</p>
    <div class="sb-options sb-cards">${choice.options.map((o) => {
      const def = cards?.[o.type] ?? {};
      return `<button type="button" class="sb-option" data-pick="${o.index}"><b>${esc(def.name ?? o.type)}</b><small>MP ${o.mpCost ?? 0}${def.description ? `・${esc(def.description)}` : ''}</small></button>`;
    }).join('')}</div>
    <p class="sb-note">選ばずにほかの操作をすると、MPコストの大きい方を引きます。</p>
    <div class="sb-confirm"><button type="button" class="small-btn" data-later="1">あとで選ぶ</button></div>`;
  const close = () => dlg.remove();
  dlg.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-pick]');
    if (b) onPick(Number(b.dataset.pick));
    else if (e.target.closest('[data-later]')) close();
  });
  dlg.addEventListener('pointerdown', (e) => e.stopPropagation());
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(dlg);
  dlg.querySelector('[data-pick]')?.focus({ preventScroll: true });
  return { close, el: dlg };
}
