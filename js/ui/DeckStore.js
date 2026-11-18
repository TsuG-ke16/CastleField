// 自分で編成したデッキ（マイデッキ）を、この端末に覚えておく。{ カード種類: 枚数 }。
// 覚えられない環境（プライベートウィンドウなど）でも、編成画面で作って、その場で使うことはできる。
const KEY = 'cf-mydeck-v1';
let memory = null;

/** 覚えているマイデッキ（なければ null）。形が壊れていたら使わない */
export function loadMyDeck() {
  if (memory) return { ...memory };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)
      && Object.values(saved).every((n) => Number.isInteger(n) && n > 0)) {
      memory = saved;
      return { ...saved };
    }
  } catch { /* 読めなければ、ないものとして扱う */ }
  return null;
}

export function saveMyDeck(list) {
  memory = Object.fromEntries(Object.entries(list).filter(([, n]) => n > 0));
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch { /* 覚えられなくても、この画面のあいだは使える */ }
}
