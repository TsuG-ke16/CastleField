# 通常モード3D統合の検査記録（2026-11-23）

- `before/report.json` … Blender 5.3 で全GLB（城4・兵士8・魔物6・ステージ7）を読み、寸法・接地・材質・リグ名・法線を測った結果（修正前）
- `after/report.json` … 接地補正（`assets/models/fix-ground-contact.py`）をした6体の再測定。最下面がすべて y=0
- `blender/*.jpg` … 正面・斜め・側面のレンダリング一覧（`qa-audit-glb.py`。カメラは各モデルの外接箱の中心に合わせて自動で寄せるので、接地は絵ではなく report.json の `min_z_ground` で見る）
- `game/*.jpg` … ゲーム画面（Three.js の3D盤面・2Dへの復帰・カメラ回転・決着）

読み方：`min_z_ground` が 0 に近いほど地面に接している。`flipped_face_ratio` は「面の向きが外側と逆」の目安で、角のある形（非凸）は大きめに出るため参考値（実機の表示で裏返りは見えていない）。
`rig_missing` は兵士・城に付けたアニメ用ノード名（Anim_*, Castle_*）の有無。#188 の高品質5体（城2・兵士3）は階層リグ付き。#185 の簡易モデル（兵士6・城2・魔物）には Anim_* 階層がない。FieldGL の `bindModelRig` は名前で探すだけなので、無くてもエラーにはならないが、関節ごとのアニメは付かない（残課題：高品質化）。
