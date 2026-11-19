// 複数のデッキを端末に保存する。旧版の1枠は最初の枠に引き継ぐ。
const KEY = 'cf-mydecks-v2';
const LEGACY_KEY = 'cf-mydeck-v1';
export const DECK_SLOTS = 4;
let memory;
const listeners = new Set();
const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* 通知の失敗で保存を止めない */ } } };
/** デッキが変わったとき（編成・削除・選びなおし）に呼ばれる。クラウドへの保存（Account.js）が使う */
export function onDecksChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** クラウドから受け取った内容で、この端末のデッキを置きかえる（通知はしない） */
export function replaceDecks(state) {
  memory = { active: 0, slots: Array(DECK_SLOTS).fill(null) };
  memory.slots = memory.slots.map((_, i) => {
    const d = state?.slots?.[i];
    return validList(d?.list) && typeof d.name === 'string' ? { name: d.name.slice(0, 24), list: { ...d.list } } : null;
  });
  memory.active = Number.isInteger(state?.active) && memory.slots[state.active] ? state.active : Math.max(0, memory.slots.findIndex(Boolean));
  return persist();
}

function validList(list) {
  return list && typeof list === 'object' && !Array.isArray(list)
    && Object.values(list).every(n => Number.isInteger(n) && n > 0);
}

function read() {
  if (memory) return memory;
  memory = { active: 0, slots: Array(DECK_SLOTS).fill(null) };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved?.slots)) {
      memory.slots = memory.slots.map((_, i) => {
        const deck = saved.slots[i];
        return validList(deck?.list) && typeof deck.name === 'string'
          ? { name: deck.name.slice(0, 24), list: deck.list } : null;
      });
      memory.active = Number.isInteger(saved.active) && memory.slots[saved.active] ? saved.active
        : Math.max(0, memory.slots.findIndex(Boolean));
    } else {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (validList(legacy)) memory.slots[0] = { name: 'マイデッキ', list: legacy };
    }
  } catch { /* ストレージが使えない間も、このページで編成できる */ }
  return memory;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
    return true;
  } catch { return false; }
}

export const deckChoice = slot => `custom:${slot}`;
export function deckSlot(choice) {
  if (choice === 'custom') return read().active;
  const match = /^custom:(\d+)$/.exec(choice ?? '');
  return match && Number(match[1]) < DECK_SLOTS ? Number(match[1]) : null;
}

export function loadDecks() {
  return structuredClone(read());
}

export function loadMyDeck(slot = read().active) {
  const deck = read().slots[slot];
  return deck ? { ...deck.list } : null;
}

export function selectMyDeck(slot) {
  const state = read();
  if (!state.slots[slot] || state.active === slot) return;
  state.active = slot;
  persist();
  notify();
}

export function saveMyDeck(slot, name, list) {
  const state = read();
  state.slots[slot] = { name, list: { ...list } };
  state.active = slot;
  const ok = persist();
  notify();
  return ok;
}

export function deleteMyDeck(slot) {
  const state = read();
  state.slots[slot] = null;
  if (state.active === slot) state.active = Math.max(0, state.slots.findIndex(Boolean));
  const ok = persist();
  notify();
  return ok;
}
