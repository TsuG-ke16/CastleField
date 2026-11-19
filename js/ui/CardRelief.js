// 拡大表示のカードの枠を、凹凸と材質つきで光らせる（CardZoom.js から使う）。
// 枠の絵（assets/cards/frame-*.png）はそのまま使い、凹凸の地図（assets/cards/relief/。js/ui/build-card-relief.js で作る）を重ねて、
// 光の当たり方だけを WebGL で計算する。描くのは傾きが変わったフレームだけ（画像処理は毎フレームしない）。
//   金属：細く鋭い映り込み／宝石：強い点の光と中の輝き／紙・木：弱く広い光／スペシャル：角度で色が変わる
// 王冠・宝石（raised）は、同じ光で別のキャンバスに描き、手前に浮かせてカードの中に奥行きを出す。
// キャンバス（WebGL）は2つだけ作って使い回す（2D キャンバスへの写しは、端末によって GPU から読み戻しになって重いので使わない）。
// WebGL が使えない・地図が読めないときは null を返す（呼ぶ側は CSS だけの軽い表示にする）。

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uFrame, uRelief, uRaised;
uniform vec3 uL, uV;
uniform mat3 uM;
uniform float uFlat, uBump, uSpec, uEnv, uIri, uGem, uPar, uKd, uLayer, uShadow;
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1., 2. / 3., 1. / 3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
// 部屋の明かり（世界に固定）：上の細長い照明と、右のうすい照明。なめらかな面ほど縁がはっきり映る
float env(vec3 r, float sharp) {
  float w = mix(.22, .05, sharp);
  float top = smoothstep(.42 - w, .42 + w, -r.y) * (1. - smoothstep(.8 - w, .8 + w, -r.y)) * smoothstep(.95, .2, abs(r.x));
  float side = .45 * smoothstep(.5 - w, .5 + w, r.x) * (1. - smoothstep(.85, .98, r.x)) * smoothstep(.7, .1, abs(r.y + .1));
  return top + side;
}
void main() {
  float h0 = texture2D(uRelief, vec2(vUv.x, vUv.y * .5)).b;
  // 高い所ほど、見る向きにずれて見える（1回の視差。手前に浮かせた層と同じ向き）
  vec2 uv = vUv + uV.xy / max(uV.z, .4) * (h0 - .3) * uPar;
  vec4 c = texture2D(uFrame, uv);
  float raisedHere = texture2D(uRaised, uv).a;
  float a = c.a * mix(1., raisedHere, uLayer);
  if (a < .004) discard;
  vec3 alb = c.rgb / max(c.a, .001);
  vec3 rel = texture2D(uRelief, vec2(uv.x, uv.y * .5)).rgb;
  vec3 mat = texture2D(uRelief, vec2(uv.x, .5 + uv.y * .5)).rgb;
  vec2 nxy = rel.rg * 2. - 1.;
  vec3 n = normalize(vec3(nxy * uBump, sqrt(max(.04, 1. - dot(nxy, nxy)))));
  float metal = mat.r, smooth = mat.g, gem = mat.b;
  // 少し遠近をつけた、その点から目への向き
  vec3 V = normalize(uV - vec3((vUv - .5) * vec2(.3, .45), 0.));
  float ndl = dot(n, uL);
  vec3 col = alb * clamp(1. + uKd * (ndl - uFlat), .35, 1.45);
  // 金属は、地の色を少し沈めて映り込みで光らせる
  col *= 1. - .14 * metal * smooth;
  vec3 H = normalize(uL + V);
  float shin = mix(6., 160., smooth * smooth);
  float key = pow(max(dot(n, H), 0.), shin) * mix(.12, 1., smooth);
  vec3 R = uM * reflect(-V, n);
  float e = env(R, smooth) * smooth;
  vec3 tint = mix(vec3(1.), alb * 1.25 + .12, metal * .8);
  col += tint * (key * uSpec * mix(.35, 1., metal) + e * uEnv * metal);
  // 宝石：鋭い点の光と、見る向きで強まる中の輝き
  float glint = pow(max(dot(reflect(-uL, n), V), 0.), 3.);
  col += gem * uGem * (alb * (.08 + .4 * glint) + vec3(pow(max(dot(n, H), 0.), 260.)) * 1.2 + e * .35);
  // スペシャル：角度で色相が変わる虹色（金属の所だけ）
  if (uIri > 0.) {
    float hue = fract(dot(R.xy, vec2(.55, .8)) + vUv.y * .7 + vUv.x * .35);
    col += hsv2rgb(vec3(hue, .55, 1.)) * uIri * metal * (.12 + .7 * e + key);
  }
  if (uLayer < .5) {
    // 浮かせた部品の真下（ずれたときに見える所）は側面として暗く、光の反対側には影を落とす
    col *= 1. - .3 * raisedHere;
    float sh = texture2D(uRaised, uv + uL.xy / max(uL.z, .3) * uShadow).a;
    col *= 1. - .3 * sh * (1. - raisedHere);
  }
  // 明るすぎる所は白く飛ばさず、ゆるやかに頭打ちにする（0.8 までは元の絵の色のまま）
  vec3 over = max(col - .8, 0.);
  col = min(col, .8) + over / (1. + over * 2.2);
  gl_FragColor = vec4(col * a, a);
}`;

// レアリティごとの材質の強さ（枠の地図の金属・つやに掛ける）
const PRESETS = {
  common:    { bump: .9,  spec: .35, env: .45, iri: 0,   gem: 0,   kd: .55 },
  uncommon:  { bump: 1,   spec: .5,  env: .6,  iri: 0,   gem: .6,  kd: .6 },
  rare:      { bump: 1.1, spec: .8,  env: .9,  iri: 0,   gem: .9,  kd: .65 },
  epic:      { bump: 1.2, spec: .9,  env: 1,   iri: .12, gem: 1.1, kd: .7 },
  legendary: { bump: 1.35, spec: 1,  env: 1.25, iri: 0,  gem: 1.25, kd: .75 },
  special:   { bump: 1.1, spec: .9,  env: .9,  iri: .9,  gem: 1,   kd: .65 },
  other:     { bump: 1,   spec: .6,  env: .7,  iri: 0,   gem: .8,  kd: .6 },
};
export const CARD_LIGHT = (() => { const v = [-.42, -.62, .66]; const l = Math.hypot(...v); return v.map(x => x / l); })();

export const reliefPaths = (frameSrc) => {
  const m = /cards\/(frame-[a-z]+)\.png/.exec(frameSrc ?? '');
  return m ? { relief: `assets/cards/relief/${m[1]}-relief.png`, raised: `assets/cards/relief/${m[1]}-raised.png` } : null;
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`読み込めません：${src}`));
  img.src = src;
});

const shared = [];   // [枠, 浮かせた部品] の WebGL。開くたびに作らない
function context(slot) {
  if (shared[slot]?.gl && !shared[slot].gl.isContextLost()) return shared[slot];
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  for (const name of ['uFrame', 'uRelief', 'uRaised', 'uL', 'uV', 'uM', 'uFlat', 'uBump', 'uSpec', 'uEnv', 'uIri', 'uGem', 'uPar', 'uKd', 'uLayer', 'uShadow']) u[name] = gl.getUniformLocation(prog, name);
  gl.uniform1i(u.uFrame, 0); gl.uniform1i(u.uRelief, 1); gl.uniform1i(u.uRaised, 2);
  gl.disable(gl.DEPTH_TEST);
  const entry = { canvas, gl, u, textures: [], owner: null, onLost: null };
  shared[slot] = entry;
  // GPU のリセットなどで WebGL が消えたら、持ち主に知らせて CSS だけの表示に戻してもらう
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); entry.onLost?.(); });
  return shared[slot];
}

function texture(gl, unit, img, premultiply) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);   // 地図の値を色の変換で変えない
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// 返すもの：base / raised のキャンバス（呼ぶ側が置く）、resize()、draw(axes)、destroy()
// isCurrent：読み込みのあいだに閉じた・別のカードを開いたら false を返す関数。そのときは共有の WebGL に触らない
// onLost：WebGL が消えたときに呼ぶ
export async function createRelief({ frameSrc, preset, pixelRatioLimit = 2, isCurrent = () => true, onLost = null }) {
  const paths = reliefPaths(frameSrc);
  if (!paths || !window.WebGLRenderingContext) return null;
  let images;
  try { images = await Promise.all([loadImage(frameSrc), loadImage(paths.relief), loadImage(paths.raised)]); } catch { return null; }
  if (!isCurrent()) return null;
  let ctxs;
  try { ctxs = [context(0), context(1)]; } catch (error) { console.warn('凹凸の表示を使えません', error); return null; }
  // 別の演出が使用中なら、そのカードのキャンバスを動かさず、この呼び出しは CSS に任せる。
  if (ctxs.some(ctx => !ctx || ctx.owner)) return null;
  const token = {};
  for (const ctx of ctxs) {
    const { gl, textures } = ctx;
    for (const tex of textures) gl.deleteTexture(tex);
    textures.splice(0, textures.length, texture(gl, 0, images[0], true), texture(gl, 1, images[1], false), texture(gl, 2, images[2], false));
    ctx.owner = token;
    ctx.onLost = onLost;
  }
  const mine = () => ctxs.every(c => c.owner === token);
  const p = PRESETS[preset] ?? PRESETS.other;
  const [base, raised] = ctxs.map(c => c.canvas);
  base.className = 'zoom-gl-base';
  raised.className = 'zoom-gl-raised';
  let size = [0, 0];
  // 大きさは開いたとき・画面の大きさが変わったときだけ測る（毎フレーム測ると、レイアウトの計算が走って重い）
  const resize = () => {
    const dpr = Math.min(pixelRatioLimit, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(base.clientWidth * dpr)), h = Math.max(1, Math.round(base.clientHeight * dpr));
    if (w === size[0] && h === size[1]) return;
    size = [w, h];
    for (const el of [base, raised]) { el.width = w; el.height = h; }
  };
  const draw = (axes) => {
    if (!mine() || ctxs.some(c => c.gl.isContextLost())) return false;
    if (!size[0]) resize();
    // カード→世界の列ベクトルから、世界に固定した光と視線をカードの座標に写す。
    const L = axes.map(([x, y, z]) => x * CARD_LIGHT[0] + y * CARD_LIGHT[1] + z * CARD_LIGHT[2]);
    const V = axes.map(axis => axis[2]);
    const Mcol = axes.flat();
    ctxs.forEach(({ gl, u }, layer) => {
      gl.viewport(0, 0, size[0], size[1]);
      gl.uniform3fv(u.uL, L); gl.uniform3fv(u.uV, V);
      gl.uniformMatrix3fv(u.uM, false, Mcol);
      gl.uniform1f(u.uFlat, CARD_LIGHT[2]);
      gl.uniform1f(u.uBump, p.bump); gl.uniform1f(u.uSpec, p.spec); gl.uniform1f(u.uEnv, p.env);
      gl.uniform1f(u.uIri, p.iri); gl.uniform1f(u.uGem, p.gem); gl.uniform1f(u.uKd, p.kd);
      gl.uniform1f(u.uPar, .018); gl.uniform1f(u.uShadow, .012);
      gl.uniform1f(u.uLayer, layer);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    return true;
  };
  return {
    base, raised, resize, draw,
    // 自分が持ち主のときだけ片づける（あとから開いたカードの WebGL を消さない）
    destroy() {
      for (const ctx of ctxs) {
        if (ctx.owner !== token) continue;
        for (const tex of ctx.textures) ctx.gl.deleteTexture(tex);
        ctx.textures.length = 0; ctx.owner = null; ctx.onLost = null; ctx.canvas.remove();
      }
    },
  };
}
