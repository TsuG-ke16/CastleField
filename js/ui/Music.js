// BGM。音源ファイルも外部曲も使わず、Web Audio でその場で鳴らす（このゲーム用に作った旋律）。
// 1曲は 32 ステップ（16分音符 × 2小節）のくり返しで、5つの層を重ねる：
//   旋律（lead）・和音の分散（arp）・厚い和音（pad）・ベース（bass）・ドラム（kick / snare / hat）
// 旋律と分散和音には残響（ディレイ）をかけ、最後にコンプレッサーで音割れを防ぐ。
// 試合中の場面（ふつう・魔物・夜・ボス・ピンチ）どうしは、止めずに小節の切れ目で次の曲へ移る。

/** 和音：根音（MIDI）と種類（'M' 長三和音 / 'm' 短三和音 / '7' 属七） */
const CHORD_STEPS = { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], s: [0, 5, 7] };
const chord = (root, kind = 'M') => CHORD_STEPS[kind].map((n) => root + n);

/**
 * step：1ステップ（16分音符）の秒数。chords：8ステップごとの和音（4つで2小節）。
 * lead：32ステップの旋律（0 は休み）。drums：16文字の刻み（x 強い・o 弱い・. 休み）。くり返す
 * bassPattern：ベースを鳴らすステップ（16文字。x 根音・o 1オクターブ上・. 休み）
 * arp：分散和音の音域（MIDI の基準。0 なら鳴らさない）。pad：厚い和音の音量（0 なら鳴らさない）
 * lead の音色：'square'（明るい）・'sawtooth'（鋭い）・'triangle'（やわらかい）
 */
const TRACKS = {
  // タイトル：明るく勇ましい（ハ長調）
  title: {
    step: .13, chords: [chord(48), chord(45, 'm'), chord(41), chord(43)],
    lead: [72, 0, 76, 0, 79, 0, 84, 83, 81, 0, 79, 0, 76, 0, 74, 76, 77, 0, 81, 0, 84, 0, 81, 79, 79, 0, 77, 0, 76, 74, 72, 74],
    leadType: 'square', leadVol: .07, arp: 60, pad: .035,
    bassPattern: 'x..ox..ox..ox.o.',
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
  },
  // ふつうの試合：疾走感（イ短調）
  battle: {
    step: .11, chords: [chord(45, 'm'), chord(41), chord(48), chord(43)],
    lead: [69, 0, 72, 76, 74, 72, 71, 0, 72, 0, 76, 79, 77, 76, 74, 0, 76, 0, 77, 79, 81, 79, 77, 76, 74, 0, 76, 74, 72, 71, 72, 74],
    leadType: 'square', leadVol: .065, arp: 57, pad: .03,
    bassPattern: 'x.xox.xox.xox.xo',
    kick: 'x...x...x...x...', snare: '....x.......x..o', hat: 'x.x.x.x.x.x.x.xo',
  },
  // 魔物がいる：不穏で緊張感（ニ短調）
  tension: {
    step: .105, chords: [chord(50, 'm'), chord(46), chord(43, 'm'), chord(45, '7')],
    lead: [62, 0, 65, 0, 69, 0, 68, 69, 70, 0, 69, 0, 65, 0, 62, 0, 74, 0, 72, 70, 69, 0, 67, 0, 65, 64, 62, 0, 61, 0, 64, 0],
    leadType: 'sawtooth', leadVol: .05, arp: 62, pad: .035,
    bassPattern: 'xx.xxx.xxx.xxx.x',
    kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo',
  },
  // 夜：静かで幻想的（イ短調・ゆっくり）
  night: {
    step: .16, chords: [chord(45, 'm'), chord(40, 'm'), chord(41), chord(43)],
    lead: [76, 0, 0, 79, 0, 0, 81, 0, 79, 0, 76, 0, 74, 0, 0, 0, 72, 0, 0, 74, 0, 0, 76, 0, 79, 0, 76, 0, 71, 0, 0, 0],
    leadType: 'triangle', leadVol: .07, arp: 64, pad: .05,
    bassPattern: 'x.......x.......',
    kick: 'x...............', snare: '................', hat: '....o.......o...',
  },
  // ボス戦：重く激しい（ホ短調・フリギア）
  boss: {
    step: .095, chords: [chord(40, 'm'), chord(41), chord(40, 'm'), chord(38)],
    lead: [64, 64, 0, 65, 64, 0, 67, 0, 71, 0, 72, 71, 67, 0, 65, 0, 64, 64, 0, 65, 64, 0, 76, 0, 74, 0, 72, 71, 72, 0, 71, 0],
    leadType: 'sawtooth', leadVol: .06, arp: 52, pad: .04,
    bassPattern: 'xxoxxxoxxxoxxxox',
    kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x.xx', hat: 'xxxxxxxxxxxxxxxx',
  },
  // ピンチ（背水の陣）：いちばん速く、高く（嬰ヘ短調）
  pinch: {
    step: .085, chords: [chord(42, 'm'), chord(38), chord(40), chord(37, '7')],
    lead: [78, 0, 81, 0, 85, 0, 83, 81, 80, 0, 81, 83, 85, 0, 86, 85, 83, 0, 81, 0, 80, 0, 78, 0, 77, 0, 80, 0, 83, 85, 86, 88],
    leadType: 'square', leadVol: .06, arp: 66, pad: .03,
    bassPattern: 'xoxoxoxoxoxoxoxo',
    kick: 'x.x.x.x.x.x.x.x.', snare: '....x..o....x.xo', hat: 'xxxxxxxxxxxxxxxx',
  },
  // 勝ち：ファンファーレ
  victory: {
    step: .12, chords: [chord(48), chord(53), chord(55), chord(48)],
    lead: [72, 0, 72, 72, 76, 0, 79, 0, 84, 0, 0, 0, 81, 0, 84, 0, 83, 0, 79, 0, 81, 0, 83, 0, 84, 0, 0, 0, 0, 0, 0, 0],
    leadType: 'square', leadVol: .08, arp: 60, pad: .04,
    bassPattern: 'x...x...x...x.x.',
    kick: 'x.......x.......', snare: '....x.......x.xx', hat: 'x.x.x.x.x.x.x.x.',
  },
  // 負け：しずかに（イ短調・ゆっくり。ドラムなし）
  defeat: {
    step: .2, chords: [chord(45, 'm'), chord(50, 'm'), chord(40, '7'), chord(45, 'm')],
    lead: [76, 0, 0, 74, 72, 0, 0, 0, 71, 0, 0, 69, 0, 0, 0, 0, 72, 0, 0, 71, 69, 0, 0, 0, 68, 0, 0, 0, 69, 0, 0, 0],
    leadType: 'triangle', leadVol: .07, arp: 0, pad: .05,
    bassPattern: 'x.......x.......',
    kick: '................', snare: '................', hat: '................',
  },
};
/** 試合中の場面どうしは、止めずに小節の切れ目で次の曲へ移る（シームレス） */
const FLOW = new Set(['battle', 'tension', 'night', 'boss', 'pinch']);
const freqOf = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  constructor(sound) {
    this.sound = sound; this.scene = 'title'; this.nodes = new Set();
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    window.addEventListener('pagehide', () => this.stop());
    window.addEventListener('pageshow', () => this.start());
  }

  setScene(scene) {
    if (scene === this.scene) return;
    const smooth = this.timer && FLOW.has(this.scene) && FLOW.has(scene);
    this.scene = scene;
    if (smooth) return; // 鳴っている曲の小節の切れ目で移る（tick の中）
    this.stop(); this.start();
  }

  /** 音の通り道を作る：各層 → （旋律・分散和音は残響へも）→ 音量 → コンプレッサー → 出口 */
  build() {
    const c = this.sound.ctx;
    this.gain = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.ratio.value = 4; this.comp.attack.value = .005; this.comp.release.value = .2;
    this.gain.connect(this.comp).connect(c.destination);
    this.bus = c.createGain(); this.bus.connect(this.gain);
    // 残響：短いディレイをくり返す
    this.delay = c.createDelay(1); this.feedback = c.createGain(); this.wet = c.createGain();
    this.feedback.gain.value = .28; this.wet.gain.value = .22;
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.wet).connect(this.gain);
    // ドラム用の雑音（1回作って使い回す）
    const len = Math.floor(c.sampleRate * .3);
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start() {
    const s = this.sound;
    if (this.timer || !s.ctx || document.hidden) return;
    if (!this.gain) this.build();
    this.updateVolume(); this.step = 0; this.playing = this.scene; this.next = s.ctx.currentTime + .03;
    const tick = () => {
      if (s.ctx.state !== 'running') return;
      if (this.next < s.ctx.currentTime) this.next = s.ctx.currentTime + .03;
      while (this.next < s.ctx.currentTime + .2) {
        // 場面が変わったら、小節の切れ目（16ステップ）で新しい曲の頭から鳴らす
        if (this.playing !== this.scene && this.step % 16 === 0) { this.playing = this.scene; this.step = 0; }
        const track = TRACKS[this.playing] ?? TRACKS.title;
        if (!s.muted) this.playStep(track, this.step, this.next);
        this.step = (this.step + 1) % 32; this.next += track.step;
      }
    };
    tick(); this.timer = setInterval(tick, 60);
  }

  /** 1ステップぶんの音をまとめて予約する */
  playStep(t, i, at) {
    const step = t.step;
    this.delay.delayTime.setValueAtTime(step * 3, at);
    const ch = t.chords[Math.floor(i / 8) % t.chords.length];
    const d = i % 16;
    // 旋律
    const n = t.lead[i];
    if (n) this.voice({ freq: freqOf(n), at, dur: step * 1.7, vol: t.leadVol, type: t.leadType, cutoff: 3200, send: .9 });
    // 分散和音（16分で和音を上下に）
    if (t.arp) {
      const shift = 12 * Math.round((t.arp - ch[0]) / 12); // 和音を arp の音域へオクターブ移動
      const notes = [...ch, ch[0] + 12].map((x) => x + shift);
      const k = [0, 1, 2, 3, 2, 1, 2, 3][i % 8] % notes.length;
      this.voice({ freq: freqOf(notes[k]), at, dur: step * .9, vol: .03, type: 'triangle', cutoff: 2600, send: .6 });
    }
    // 厚い和音：和音が変わるところで、少しずらした鋸波を重ねて長く鳴らす
    if (t.pad && i % 8 === 0) {
      for (const x of ch.slice(0, 3)) {
        for (const det of [-6, 6]) this.voice({ freq: freqOf(x + 12), at, dur: step * 8.2, vol: t.pad / 2, type: 'sawtooth', cutoff: 1100, attack: step * 1.5, detune: det });
      }
    }
    // ベース
    const b = t.bassPattern[d];
    if (b && b !== '.') this.voice({ freq: freqOf(ch[0] - 12 + (b === 'o' ? 12 : 0)), at, dur: step * .95, vol: .11, type: 'sawtooth', cutoff: 700 });
    // ドラム
    const hit = (p) => (p[d] === 'x' ? 1 : p[d] === 'o' ? .55 : 0);
    if (hit(t.kick)) this.kick(at, hit(t.kick));
    if (hit(t.snare)) this.snare(at, hit(t.snare));
    if (hit(t.hat)) this.hat(at, hit(t.hat));
  }

  /** 音色1つ：発振器 → ローパス → 音量の形 → 出口（send があれば残響にも） */
  voice({ freq, at, dur, vol, type, cutoff = 4000, attack = .012, send = 0, detune = 0 }) {
    const c = this.sound.ctx;
    const o = c.createOscillator(); const f = c.createBiquadFilter(); const g = c.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = .7;
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.setTargetAtTime(.0001, at + Math.max(attack, dur * .6), dur * .25);
    o.connect(f).connect(g).connect(this.bus);
    if (send) { const sg = c.createGain(); sg.gain.value = send; g.connect(sg).connect(this.delay); }
    this.track(o, at, dur * 1.6);
  }

  kick(at, v) {
    const c = this.sound.ctx; const o = c.createOscillator(); const g = c.createGain();
    o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + .12);
    g.gain.setValueAtTime(.32 * v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .22);
    o.connect(g).connect(this.bus); this.track(o, at, .25);
  }

  snare(at, v) {
    const c = this.sound.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = .8;
    const g = c.createGain(); g.gain.setValueAtTime(.16 * v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .16);
    src.connect(f).connect(g).connect(this.bus); this.track(src, at, .18);
    const o = c.createOscillator(); const og = c.createGain();
    o.frequency.setValueAtTime(220, at); o.frequency.exponentialRampToValueAtTime(120, at + .08);
    og.gain.setValueAtTime(.08 * v, at); og.gain.exponentialRampToValueAtTime(.0001, at + .1);
    o.connect(og).connect(this.bus); this.track(o, at, .12);
  }

  hat(at, v) {
    const c = this.sound.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); g.gain.setValueAtTime(.05 * v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .045);
    src.connect(f).connect(g).connect(this.bus); this.track(src, at, .06);
  }

  /** 鳴らした音を覚えておき、止めるときにまとめて止める */
  track(node, at, dur) {
    this.nodes.add(node);
    node.onended = () => { this.nodes.delete(node); node.disconnect(); };
    node.start(at); node.stop(at + dur + .02);
  }

  updateVolume() { if (this.gain) this.gain.gain.setTargetAtTime(this.sound.muted ? 0 : this.sound.bgmVolume, this.sound.ctx.currentTime, .025); }

  stop() { clearInterval(this.timer); this.timer = null; for (const n of this.nodes) { try { n.stop(); } catch { /* もう止まっている */ } } this.nodes.clear(); }
}
