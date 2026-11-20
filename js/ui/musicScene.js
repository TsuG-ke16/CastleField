// 盤面の様子から、流す BGM の場面を決める（画面だけで使う）。
// 優先する順：ピンチ（どこかの城が背水の陣）＞ボス戦（強い魔物）＞夜＞魔物がいる＞ふつう
import { UI_CONFIG } from './config.js';

/** BGM を止めずに切り替える、試合中の場面 */
export const BATTLE_SCENES = new Set(['battle', 'tension', 'night', 'boss', 'pinch']);

/**
 * @param {{ players?: object, monsters?: object[], time?: string } | null} s getState() か main.js の model
 * @returns {'pinch' | 'boss' | 'night' | 'tension' | 'battle'}
 */
export function musicScene(s) {
  if (!s) return 'battle';
  if (Object.values(s.players ?? {}).some((p) => p?.overdrive)) return 'pinch';
  const monsters = s.monsters ?? [];
  const boss = UI_CONFIG.bossMonsters ?? [];
  if (monsters.some((m) => boss.includes(m.type) || ['epic', 'legendary'].includes(m.rewardRarity))) return 'boss';
  if (s.time === 'night') return 'night';
  if (monsters.length > 0) return 'tension';
  return 'battle';
}
