// 効果音。音のファイルは使わず、Web Audio でその場で作る（素材のライセンスを気にしなくてよい・読み込みがない）。
// - ブラウザは、画面に触るまで音を出せない。最初のタップで unlock() を呼ぶ
// - 強い攻撃ほど大きく・低く鳴らす（power：0〜1）
// - 消音の設定は端末に覚えておく（localStorage）

import { Music } from './Music.js';

const KEY = 'cf-muted';

class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxVolume = .5;
    this.bgmVolume = .3;
    this.muted = false;
    this.music = new Music(this);
    this.enabled = true; // 演出を飛ばしているあいだは false（まとめて鳴ってうるさくならないように）
    try {
      this.muted = localStorage.getItem(KEY) === '1';
    } catch { /* 覚えられなくても困らない */ }
  }

  /** 最初のタップで呼ぶ（何回呼んでもよい） */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.sfxVolume;
        // 派手な音を重ねても割れないように、コンプレッサーを通す
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -12; this.limiter.ratio.value = 6; this.limiter.attack.value = .003; this.limiter.release.value = .15;
        this.master.connect(this.limiter).connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.music.start();
    } catch { /* 音が出なくても遊べる */ }
  }

  setMuted(muted) {
    this.muted = muted;
    this.updateVolumes();
    try {
      localStorage.setItem(KEY, muted ? '1' : '0');
    } catch { /* 覚えられなくても困らない */ }
  }

  updateVolumes() { if(this.master) this.master.gain.value = this.sfxVolume; this.music.updateVolume(); }
  setScene(scene) { this.music.setScene(scene); }

  get ready() {
    return Boolean(this.ctx && this.ctx.state === 'running' && !this.muted && this.enabled);
  }

  /** 音の高さが変わる1音。freq → endFreq へ dur 秒で動く */
  tone({ freq, endFreq = freq, dur = 0.12, type = 'sine', gain = 0.3, at = 0, attack = 0.005 }) {
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** ざらざらした音（爆発・風・雷）。filter の高さを freq → endFreq へ動かす */
  noise({ dur = 0.2, gain = 0.3, freq = 1200, endFreq = freq, q = 0.8, type = 'lowpass', at = 0 }) {
    const t0 = this.ctx.currentTime + at;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  /**
   * @param {string} name 下の SOUNDS の名前
   * @param {number} [power] 0〜1。強さ（大きいほど大きく・低く）
   */
  play(name, power = 0.5) {
    if (!this.ready) return;
    try {
      SOUNDS[name]?.(this, Math.max(0, Math.min(1, power)));
    } catch { /* 音が出なくても遊べる */ }
  }
}

const SOUNDS = {
  deckAdd: (s, p) => s.tone({ freq: 520 + p * 400, endFreq: 780 + p * 500, dur: .08 + p * .06, gain: .09 + p * .08, type: 'triangle' }),
  deckRemove: (s, p) => s.tone({ freq: 410 + p * 200, endFreq: 230, dur: .09 + p * .05, gain: .09 + p * .06, type: 'triangle' }),
  deckReady: s => [523, 659, 784].forEach((freq, i) => s.tone({ freq, dur: .16, at: i * .06, gain: .1, type: 'triangle' })),
  bow: (s,p) => { s.noise({dur:.08,gain:.10+p*.15,freq:4800,endFreq:900});s.tone({freq:350,endFreq:110,dur:.16,gain:.1+p*.12,type:'triangle'}); },
  magicShot: (s,p) => s.tone({freq:750,endFreq:180,dur:.24,gain:.12+p*.2,type:'sine'}),
  fusion: (s,p) => [440,554,659,880,1109,1318].slice(0, 2 + Math.round(p*4)).forEach((freq,i)=>s.tone({freq,dur:.18+p*.1,at:i*.06,gain:.09+p*.07,type:'triangle'})),
  adaptFusion: s => [523,659,784,988,1047].forEach((freq,i)=>s.tone({freq,endFreq:freq*1.12,dur:.24,at:i*.07,gain:.13,type:'sine'})),
  lucky: s => [784,988,1175,1568,1976].forEach((freq,i)=>s.tone({freq,dur:.3,at:i*.07,gain:.16,type:'triangle'})),
  collapse: s => {s.noise({dur:.7,gain:.4,freq:700,endFreq:70});s.tone({freq:90,endFreq:25,dur:.6,gain:.3,type:'sawtooth'});},
  chatNotice: s => s.tone({ freq: 820, endFreq: 610, dur: .11, type: 'sine', gain: .085 }),
  beastRecruit: (s) => {
    s.tone({ freq: 164, endFreq: 329, dur: .32, gain: .13, type: 'triangle' });
    [523, 659, 784, 1047].forEach((freq, i) => s.tone({ freq, dur: .23, at: .1 + i * .065, gain: .08 }));
  },
  weatherSiren: (s) => {
    s.tone({ freq: 485, endFreq: 810, dur: .19, type: 'triangle', gain: .18 });
    s.tone({ freq: 810, endFreq: 510, dur: .19, at: .2, type: 'triangle', gain: .16 });
  },
  weatherRain: (s) => [740, 554, 440].forEach((freq, i) => s.tone({ freq, endFreq: freq * .92, dur: .18, at: i * .085, gain: .095 })),
  weatherChime: (s) => [659, 880, 1175].forEach((f, i) => s.tone({ freq: f, dur: 0.25, type: 'triangle', gain: 0.14, at: i * 0.1 })),
  tap: (s) => s.tone({ freq: 720, endFreq: 900, dur: 0.05, type: 'triangle', gain: 0.12 }),
  deny: (s) => {
    s.tone({ freq: 170, dur: 0.09, type: 'square', gain: 0.1 });
    s.tone({ freq: 130, dur: 0.12, type: 'square', gain: 0.1, at: 0.1 });
  },
  draw: (s) => s.noise({ dur: 0.09, gain: 0.12, freq: 2500, endFreq: 6000, type: 'bandpass', q: 1.5 }),
  card: (s) => {
    s.noise({ dur: 0.16, gain: 0.16, freq: 800, endFreq: 4000, type: 'bandpass', q: 1 });
    s.tone({ freq: 440, endFreq: 660, dur: 0.1, type: 'triangle', gain: 0.1, at: 0.04 });
  },
  deploy: (s) => {
    s.tone({ freq: 160, endFreq: 60, dur: 0.2, gain: 0.4 });
    s.noise({ dur: 0.18, gain: 0.14, freq: 600, endFreq: 150 });
    [523, 659, 784].forEach((f, i) => s.tone({ freq: f, dur: 0.1, type: 'square', gain: 0.06, at: 0.04 + i * 0.045 }));
  },
  step: (s) => s.tone({ freq: 190, endFreq: 120, dur: 0.07, gain: 0.16 }),
  clash: (s) => {
    // 剣がぶつかる「キン！」：金属の高い倍音を重ねて、少し長く響かせる
    s.noise({ dur: 0.14, gain: 0.3, freq: 3500, type: 'highpass' });
    [1870, 2810, 4120].forEach((f, i) => s.tone({ freq: f, endFreq: f * 0.97, dur: 0.35 - i * 0.06, type: 'triangle', gain: 0.07, attack: 0.002 }));
    s.tone({ freq: 220, endFreq: 90, dur: 0.12, gain: 0.25 });
  },
  hit: (s, p) => {
    s.tone({ freq: 220 - 90 * p, endFreq: 40, dur: 0.18 + 0.4 * p, gain: 0.35 + 0.45 * p });
    s.noise({ dur: 0.12 + 0.4 * p, gain: 0.2 + 0.4 * p, freq: 2200 - 1000 * p, endFreq: 120 });
    // 強い一撃ほど、低い「ドーン」の余韻を足す
    if (p > 0.4) s.tone({ freq: 70, endFreq: 30, dur: 0.5 + 0.4 * p, gain: 0.25 * p, type: 'sine', at: 0.03 });
  },
  smallHit: (s) => {
    s.tone({ freq: 260, endFreq: 110, dur: 0.09, gain: 0.25 });
    s.noise({ dur: 0.06, gain: 0.14, freq: 2400 });
  },
  block: (s) => {
    s.tone({ freq: 1500, endFreq: 1300, dur: 0.16, type: 'triangle', gain: 0.16 });
    s.tone({ freq: 2250, dur: 0.1, type: 'sine', gain: 0.08 });
  },
  fire: (s) => {
    s.noise({ dur: 0.45, gain: 0.26, freq: 400, endFreq: 3200, type: 'bandpass', q: 0.7 });
    s.noise({ dur: 0.5, gain: 0.18, freq: 200, endFreq: 80, at: 0.12 });
  },
  thunder: (s) => {
    s.noise({ dur: 0.08, gain: 0.55, freq: 6000, type: 'highpass' });
    s.noise({ dur: 0.06, gain: 0.35, freq: 6000, type: 'highpass', at: 0.09 });
    s.noise({ dur: 0.8, gain: 0.45, freq: 900, endFreq: 60, at: 0.05 });
    s.tone({ freq: 60, endFreq: 30, dur: 0.7, gain: 0.25, at: 0.05 });
  },
  heal: (s) => [523, 659, 784, 1047].forEach((f, i) => s.tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.16, at: i * 0.07 })),
  equip: (s) => {
    s.tone({ freq: 880, endFreq: 1320, dur: 0.1, type: 'triangle', gain: 0.16 });
    s.tone({ freq: 1760, dur: 0.12, type: 'sine', gain: 0.08, at: 0.08 });
  },
  poison: (s) => [0, 0.08, 0.17].forEach((at, i) => s.tone({ freq: 180 + i * 50, endFreq: 320 + i * 60, dur: 0.07, gain: 0.16, at })),
  gust: (s) => s.noise({ dur: 0.45, gain: 0.2, freq: 400, endFreq: 2200, type: 'bandpass', q: 0.8 }),
  freeze: (s) => [2093, 2637, 3136].forEach((f, i) => s.tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.08, at: i * 0.05 })),
  coin: (s) => {
    s.tone({ freq: 988, dur: 0.07, type: 'square', gain: 0.08 });
    s.tone({ freq: 1319, dur: 0.22, type: 'square', gain: 0.08, at: 0.07 });
  },
  monster: (s) => {
    s.tone({ freq: 110, endFreq: 60, dur: 0.5, type: 'sawtooth', gain: 0.22 });
    s.noise({ dur: 0.4, gain: 0.12, freq: 300 });
  },
  turn: (s) => {
    s.tone({ freq: 659, dur: 0.12, type: 'triangle', gain: 0.14 });
    s.tone({ freq: 880, dur: 0.2, type: 'triangle', gain: 0.14, at: 0.1 });
  },
  shuffle: (s) => [0, 0.06, 0.12, 0.18].forEach((at) => s.noise({ dur: 0.05, gain: 0.1, freq: 3500, type: 'bandpass', q: 2, at })),
  win: (s) => {
    // ファンファーレ：旋律＋和音＋シンバル
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => s.tone({ freq: f, dur: 0.24, type: 'square', gain: 0.12, at: i * 0.11 }));
    [523, 659, 784, 1047].forEach((f) => s.tone({ freq: f, dur: 1.2, type: 'sawtooth', gain: 0.05, at: 0.77 }));
    s.tone({ freq: 131, dur: 1.2, type: 'sine', gain: 0.22, at: 0.77 });
    s.noise({ dur: 1.1, gain: 0.16, freq: 7000, type: 'highpass', at: 0.77 });
  },
  lose: (s) => {
    [392, 349, 311, 262].forEach((f, i) => s.tone({ freq: f, endFreq: f * 0.97, dur: 0.4, type: 'triangle', gain: 0.16, at: i * 0.22 }));
    s.tone({ freq: 98, endFreq: 82, dur: 1.2, type: 'sawtooth', gain: 0.07, at: 0.66 });
  },
  // ---------- 新しく足した効果音 ----------
  // 兵士が倒れる「ポンッ」
  poof: (s) => {
    s.noise({ dur: 0.22, gain: 0.32, freq: 1200, endFreq: 200, type: 'bandpass', q: 0.9 });
    s.tone({ freq: 420, endFreq: 120, dur: 0.2, type: 'triangle', gain: 0.12 });
  },
  // 弓兵・魔法使いが帰る「ヒュン」
  whoosh: (s) => s.noise({ dur: 0.35, gain: 0.3, freq: 600, endFreq: 3500, type: 'bandpass', q: 1.2 }),
  // 盾をつける
  shieldUp: (s) => {
    s.tone({ freq: 660, endFreq: 990, dur: 0.18, type: 'triangle', gain: 0.13 });
    s.tone({ freq: 1320, dur: 0.25, type: 'sine', gain: 0.07, at: 0.08 });
  },
  // やけど
  burn: (s) => {
    s.noise({ dur: 0.35, gain: 0.18, freq: 2500, endFreq: 700, type: 'bandpass', q: 1.5 });
    s.tone({ freq: 300, endFreq: 520, dur: 0.15, type: 'sawtooth', gain: 0.05 });
  },
  // 凍結がとける「パリン」
  iceBreak: (s) => {
    s.noise({ dur: 0.12, gain: 0.22, freq: 5000, type: 'highpass' });
    [2637, 3520, 2093].forEach((f, i) => s.tone({ freq: f, dur: 0.12, type: 'sine', gain: 0.07, at: 0.02 + i * 0.04 }));
  },
  // 毒・やけどが治る
  cure: (s) => [784, 988, 1319].forEach((f, i) => s.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.1, at: i * 0.06 })),
  // 周回の始めの鐘
  roundGong: (s) => {
    [196, 392, 588].forEach((f, i) => s.tone({ freq: f, endFreq: f * 0.995, dur: 1.1 - i * 0.25, type: 'sine', gain: 0.16 - i * 0.04, attack: 0.004 }));
    s.noise({ dur: 0.08, gain: 0.08, freq: 3000, type: 'bandpass', q: 2 });
  },
  // 手札を捨てる
  discard: (s) => {
    s.noise({ dur: 0.12, gain: 0.12, freq: 3000, endFreq: 900, type: 'bandpass', q: 1.2 });
    s.tone({ freq: 330, endFreq: 220, dur: 0.1, type: 'triangle', gain: 0.07, at: 0.03 });
  },
  // 兵士が強くなる（とぎ石・バフ）
  powerUp: (s) => [392, 523, 659, 784, 1047].forEach((f, i) => s.tone({ freq: f, dur: 0.12, type: 'square', gain: 0.06, at: i * 0.045 })),
  // 城壁が消える
  armorDown: (s) => s.tone({ freq: 880, endFreq: 330, dur: 0.3, type: 'triangle', gain: 0.1 }),
  // サイコロを振る：カラカラ → コトン
  diceRoll: (s) => {
    for (let i = 0; i < 7; i++) s.noise({ dur: 0.03, gain: 0.24, freq: 2600 + (i % 3) * 600, type: 'bandpass', q: 3, at: i * 0.055 });
    s.tone({ freq: 240, endFreq: 160, dur: 0.12, gain: 0.25, at: 0.42 });
  },
  // 魔物を倒したファンファーレ
  fanfare: (s) => {
    [659, 784, 1047, 1319].forEach((f, i) => s.tone({ freq: f, dur: 0.16, type: 'square', gain: 0.08, at: i * 0.08 }));
    [523, 659, 784].forEach((f) => s.tone({ freq: f, dur: 0.6, type: 'triangle', gain: 0.07, at: 0.32 }));
  },
};

/** 画面全体で1つだけ使う */
export const sound = new Sound();
