// 系統 X のスキル効果ハンドラ（段階C で書く）。ここに書いたノードだけが「実装済み」になる（書いていないノードは休眠＝counters が null）。
// 書き方は docs/skilltree-200-progress.md の段階B「ハンドラ登録APIの書き方」。Game.js は触らずに書けるようにしてある。
//
// export default {
//   'X01': {
//     on: { onAttackResolve: { stage: 'extra', fn(api, ev) { ... } } }, // スキルイベント（Events.js の SKILL_EVENTS）
//     mods: { hitBaseAdd(api, ctx) { return 0; } },                     // 同期の数値補正（Runtime の mods 名）
//     actions: { 'X01': { label, list(api), check(api, args), run(api, args, plan) } }, // メイン行動中の任意アクション
//     scheduled(api, item) { ... },                                     // 予約効果の解決
//   },
// };

export default {};
