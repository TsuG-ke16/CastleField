# Draco デコーダー（3D モデルの圧縮を解く部品）

`assets/v2/models/*.glb` は Draco で圧縮してある。これを解く部品を、外部（gstatic.com）からではなくここから読む（オフライン・PWA でも 3D が出るように）。

- 出どころ：three.js 0.172.0 の `examples/jsm/libs/draco/gltf/`（`draco_wasm_wrapper.js`・`draco_decoder.wasm`）
- ライセンス：Apache License 2.0（Google Draco）
- three を上げたときは、同じ場所からコピーし直す
- 使う場所：`web/src/scene3d/dracoPath.ts`
