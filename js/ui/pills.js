// select をピル型のボタンに見せる（見た目の層だけ）。
// 値は今までどおり隠した select が持つ。ピルを押すと select の value を変えて input / change を飛ばすので、
// select の name・イベントの流れ・送る値は変わらない（Settings.js の設定画面と同じやり方）。
// 選択肢が多い・長いときは、折り返す（pill-wrap）か縦に並べる（pill-stack）。
export function pillify(select, label) {
  if (select._pillSync) return select.nextElementSibling; // 2回目は組を増やさない
  // _pillSync は「コードから select.value を書き換えたあと」に呼んで、ピルの見た目を合わせ直す関数
  const options = [...select.options];
  const longest = Math.max(0, ...options.map(o => o.textContent.length));
  const group = document.createElement('div');
  group.className = 'pill-group';
  if (longest > 9) group.classList.add('pill-stack');
  else if (options.length > 3) group.classList.add('pill-wrap');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const o of options) {
    const pill = document.createElement('button');
    pill.type = 'button'; pill.className = 'pill'; pill.dataset.value = o.value; pill.textContent = o.textContent;
    group.append(pill);
  }
  const sync = () => {
    for (const pill of group.children) {
      const on = select.value === pill.dataset.value;
      pill.classList.toggle('on', on);
      pill.setAttribute('aria-pressed', String(on));
      pill.disabled = select.disabled;
    }
  };
  group.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill || select.disabled || select.value === pill.dataset.value) return;
    select.value = pill.dataset.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
  });
  select.classList.add('pill-source');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
  select.after(group);
  select._pillSync = sync;
  sync();
  return group;
}
