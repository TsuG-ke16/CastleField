// Audio manager using Howler + 5-layer Web Audio adaptive BGM (with delay & DynamicsCompressor)
// and 18 tactile SFX keys, keeping bundle tiny & pausing cleanly on hidden tabs.
import { Howler } from 'howler';

export type SoundKey =
  | 'tap'
  | 'card'
  | 'deploy'
  | 'hit'
  | 'spell'
  | 'thunder'
  | 'heal'
  | 'coin'
  | 'clash'
  | 'shield'
  | 'dice'
  | 'fuse'
  | 'monster'
  | 'monsterDown'
  | 'turn'
  | 'stamp'
  | 'victory'
  | 'defeat';

export type BgmMode = 'none' | 'home' | 'battle' | 'night' | 'monster' | 'pinch';

interface SceneConfig {
  stepMs: number;
  wave: OscillatorType;
  bgmGain: number;
  melody: number[];
  arp: number[];
  pad: number[][];
  bass: number[];
  drums: boolean;
}

const SCENES: Record<Exclude<BgmMode, 'none'>, SceneConfig> = {
  home: {
    stepMs: 260,
    wave: 'sine',
    bgmGain: 0.032,
    melody: [523.25, 0, 659.25, 587.33, 783.99, 0, 659.25, 523.25, 587.33, 0, 698.46, 659.25, 587.33, 523.25, 392.0, 0],
    arp: [261.63, 329.63, 392.0, 523.25, 293.66, 349.23, 440.0, 587.33, 246.94, 329.63, 392.0, 493.88, 261.63, 329.63, 392.0, 523.25],
    pad: [[261.63, 329.63, 392.0], [293.66, 349.23, 440.0], [246.94, 293.66, 392.0], [261.63, 329.63, 392.0]],
    bass: [130.81, 0, 130.81, 0, 146.83, 0, 146.83, 0, 98.0, 0, 98.0, 0, 130.81, 0, 196.0, 0],
    drums: true,
  },
  battle: {
    stepMs: 175,
    wave: 'triangle',
    bgmGain: 0.036,
    melody: [440.0, 0, 523.25, 493.88, 440.0, 392.0, 329.63, 0, 349.23, 0, 440.0, 523.25, 587.33, 523.25, 493.88, 0],
    arp: [220.0, 261.63, 329.63, 440.0, 196.0, 246.94, 293.66, 392.0, 174.61, 220.0, 261.63, 349.23, 164.81, 207.65, 246.94, 329.63],
    pad: [[220.0, 261.63, 329.63], [196.0, 246.94, 293.66], [174.61, 220.0, 261.63], [164.81, 207.65, 246.94]],
    bass: [110.0, 0, 110.0, 110.0, 98.0, 0, 98.0, 98.0, 87.31, 0, 87.31, 87.31, 82.41, 0, 123.47, 0],
    drums: true,
  },
  night: {
    stepMs: 290,
    wave: 'sine',
    bgmGain: 0.028,
    melody: [293.66, 0, 349.23, 0, 440.0, 0, 415.3, 0, 392.0, 0, 349.23, 0, 329.63, 0, 293.66, 0],
    arp: [146.83, 220.0, 261.63, 349.23, 130.81, 196.0, 261.63, 329.63, 116.54, 174.61, 220.0, 293.66, 110.0, 164.81, 220.0, 261.63],
    pad: [[146.83, 220.0, 261.63], [130.81, 196.0, 261.63], [116.54, 174.61, 220.0], [110.0, 164.81, 220.0]],
    bass: [73.42, 0, 0, 0, 65.41, 0, 0, 0, 58.27, 0, 0, 0, 55.0, 0, 82.41, 0],
    drums: false,
  },
  monster: {
    stepMs: 165,
    wave: 'sawtooth',
    bgmGain: 0.028,
    melody: [329.63, 0, 349.23, 329.63, 392.0, 0, 466.16, 392.0, 349.23, 329.63, 293.66, 0, 311.13, 329.63, 246.94, 0],
    arp: [164.81, 196.0, 246.94, 329.63, 174.61, 220.0, 261.63, 349.23, 146.83, 174.61, 220.0, 293.66, 123.47, 155.56, 196.0, 246.94],
    pad: [[164.81, 196.0, 246.94], [174.61, 220.0, 261.63], [146.83, 174.61, 220.0], [123.47, 155.56, 196.0]],
    bass: [82.41, 82.41, 0, 82.41, 87.31, 0, 87.31, 0, 73.42, 73.42, 0, 73.42, 61.74, 0, 92.5, 0],
    drums: true,
  },
  pinch: {
    stepMs: 130,
    wave: 'triangle',
    bgmGain: 0.038,
    melody: [369.99, 440.0, 493.88, 554.37, 587.33, 554.37, 493.88, 440.0, 493.88, 554.37, 659.25, 587.33, 554.37, 493.88, 440.0, 0],
    arp: [185.0, 220.0, 277.18, 369.99, 196.0, 246.94, 293.66, 392.0, 164.81, 196.0, 246.94, 329.63, 138.59, 174.61, 207.65, 277.18],
    pad: [[185.0, 220.0, 277.18], [196.0, 246.94, 293.66], [164.81, 196.0, 246.94], [138.59, 174.61, 207.65]],
    bass: [92.5, 0, 92.5, 92.5, 98.0, 0, 98.0, 98.0, 82.41, 0, 82.41, 82.41, 69.3, 92.5, 110.0, 0],
    drums: true,
  },
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  public muted = false;
  public bgmMuted = false;
  public volume = 0.75;
  private bgmMode: BgmMode = 'none';
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        if (this.bgmMode !== 'none' && !this.muted && !this.bgmMuted) {
          this.ensureContext();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          this.syncBgmTimer();
        });
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        this.ctx = ctx;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 6;
        comp.attack.value = 0.005;
        comp.release.value = 0.12;

        const master = ctx.createGain();
        master.gain.value = this.volume;
        master.connect(comp);
        comp.connect(ctx.destination);

        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = 0.22;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.24;
        const wet = ctx.createGain();
        wet.gain.value = 0.18;
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(master);

        const len = Math.floor(ctx.sampleRate * 0.25);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        this.masterGain = master;
        this.delayNode = delay;
        this.noiseBuffer = buf;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    Howler.mute(muted);
    this.syncBgmTimer();
  }

  public setBgmMuted(muted: boolean) {
    this.bgmMuted = muted;
    this.syncBgmTimer();
  }

  public setBgmMode(mode: BgmMode) {
    if (this.bgmMode === mode && this.bgmTimer !== null) return;
    this.bgmMode = mode;
    this.bgmStep = 0;
    this.syncBgmTimer();
  }

  private syncBgmTimer() {
    if (typeof window === 'undefined') return;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.muted || this.bgmMuted || this.bgmMode === 'none') return;

    const cfg = SCENES[this.bgmMode];
    this.bgmTimer = window.setInterval(() => {
      if (this.muted || this.bgmMuted || this.bgmMode === 'none') return;
      if (!this.ctx || this.ctx.state !== 'running') return;
      this.playBgmBeat();
    }, cfg.stepMs);
  }

  private spawnNoise(dest: AudioNode, when: number, dur: number, filterFreq: number, peak: number, highpass = false) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = highpass ? 'highpass' : 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, when);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  private playBgmBeat() {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || ctx.state !== 'running' || this.bgmMode === 'none') return;

    const cfg = SCENES[this.bgmMode];
    const step = this.bgmStep % 16;
    this.bgmStep += 1;
    const now = ctx.currentTime;
    const stepSec = cfg.stepMs / 1000;
    const amp = cfg.bgmGain;

    // 1. Lead melody (dry + delay)
    const mel = cfg.melody[step];
    if (mel > 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = cfg.wave;
      osc.frequency.setValueAtTime(mel, now);
      g.gain.setValueAtTime(0.0005, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0005, now + stepSec * 0.92);
      osc.connect(g);
      g.connect(master);
      if (this.delayNode) g.connect(this.delayNode);
      osc.start(now);
      osc.stop(now + stepSec * 0.96);
    }

    // 2. Arpeggio layer (shimmering off-beat chords via delay)
    const arpFreq = cfg.arp[step];
    if (arpFreq > 0 && step % 2 === 1) {
      const arp = ctx.createOscillator();
      const ag = ctx.createGain();
      arp.type = 'sine';
      arp.frequency.setValueAtTime(arpFreq * 1.5, now);
      ag.gain.setValueAtTime(0.0004, now);
      ag.gain.linearRampToValueAtTime(amp * 0.42, now + 0.01);
      ag.gain.exponentialRampToValueAtTime(0.0004, now + stepSec * 0.75);
      arp.connect(ag);
      ag.connect(master);
      if (this.delayNode) ag.connect(this.delayNode);
      arp.start(now);
      arp.stop(now + stepSec * 0.8);
    }

    // 3. Warm detuned pad every 4 steps
    if (step % 4 === 0) {
      const chord = cfg.pad[Math.floor(step / 4) % cfg.pad.length];
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(920, now);
      padFilter.connect(master);
      const padDur = stepSec * 3.8;
      for (const f of chord) {
        for (const detune of [-6, 6]) {
          const po = ctx.createOscillator();
          const pg = ctx.createGain();
          po.type = 'sawtooth';
          po.frequency.setValueAtTime(f, now);
          po.detune.setValueAtTime(detune, now);
          pg.gain.setValueAtTime(0.0003, now);
          pg.gain.linearRampToValueAtTime(amp * 0.14, now + 0.08);
          pg.gain.exponentialRampToValueAtTime(0.0003, now + padDur);
          po.connect(pg);
          pg.connect(padFilter);
          po.start(now);
          po.stop(now + padDur + 0.03);
        }
      }
    }

    // 4. Bass pulse
    const bassFreq = cfg.bass[step];
    if (bassFreq > 0) {
      const bass = ctx.createOscillator();
      const bg = ctx.createGain();
      bass.type = 'triangle';
      bass.frequency.setValueAtTime(bassFreq, now);
      bg.gain.setValueAtTime(0.0005, now);
      bg.gain.linearRampToValueAtTime(amp * 0.9, now + 0.015);
      bg.gain.exponentialRampToValueAtTime(0.0005, now + stepSec * 1.15);
      bass.connect(bg);
      bg.connect(master);
      bass.start(now);
      bass.stop(now + stepSec * 1.2);
    }

    // 5. Drum kit (kick / snare / hi-hat)
    if (cfg.drums) {
      if (step % 4 === 0) {
        const kick = ctx.createOscillator();
        const kg = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(125, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.11);
        kg.gain.setValueAtTime(amp * 1.35, now);
        kg.gain.exponentialRampToValueAtTime(0.0005, now + 0.13);
        kick.connect(kg);
        kg.connect(master);
        kick.start(now);
        kick.stop(now + 0.14);
      }
      if (step % 4 === 2) {
        this.spawnNoise(master, now, 0.09, 1800, amp * 0.55, false);
      } else if (step % 2 === 1) {
        this.spawnNoise(master, now, 0.035, 6500, amp * 0.25, true);
      }
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    Howler.volume(this.volume);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public play(key: SoundKey) {
    const ctx = this.ensureContext();
    const master = this.masterGain;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.2;
    sfxGain.connect(master);

    const tone = (
      freq: number,
      endFreq: number,
      dur: number,
      type: OscillatorType = 'triangle',
      delay = 0,
      vol = 1.0
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + delay + dur);
      g.gain.setValueAtTime(0.001, now + delay);
      g.gain.linearRampToValueAtTime(vol, now + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    };

    switch (key) {
      case 'tap':
        tone(540, 380, 0.055, 'triangle');
        break;
      case 'card':
        tone(340, 680, 0.08, 'sine');
        break;
      case 'deploy':
        tone(220, 440, 0.12, 'triangle');
        tone(330, 520, 0.1, 'sine', 0.05);
        this.spawnNoise(sfxGain, now, 0.06, 900, 0.35);
        break;
      case 'hit':
        tone(170, 52, 0.18, 'sawtooth');
        tone(95, 42, 0.22, 'sine', 0.01);
        this.spawnNoise(sfxGain, now, 0.12, 650, 0.7);
        break;
      case 'clash':
        tone(920, 480, 0.11, 'square', 0, 0.55);
        tone(1280, 740, 0.13, 'triangle', 0.02, 0.7);
        this.spawnNoise(sfxGain, now, 0.08, 3200, 0.5, true);
        break;
      case 'spell':
        tone(420, 960, 0.18, 'sine');
        tone(640, 260, 0.22, 'triangle', 0.07);
        break;
      case 'thunder':
        tone(680, 95, 0.26, 'sawtooth', 0, 0.75);
        this.spawnNoise(sfxGain, now, 0.2, 2400, 0.85, false);
        break;
      case 'shield':
        tone(587.33, 880, 0.12, 'sine', 0, 0.75);
        tone(880, 1174.66, 0.16, 'triangle', 0.06, 0.75);
        break;
      case 'heal':
        tone(523, 659, 0.14, 'sine');
        tone(659, 784, 0.18, 'sine', 0.08);
        break;
      case 'coin':
        tone(987, 1318, 0.1, 'sine');
        tone(1318, 1567, 0.15, 'sine', 0.07);
        break;
      case 'dice':
        this.spawnNoise(sfxGain, now, 0.03, 1800, 0.65);
        this.spawnNoise(sfxGain, now + 0.055, 0.03, 2200, 0.65);
        tone(520, 780, 0.07, 'triangle', 0.11, 0.75);
        break;
      case 'fuse':
        tone(440, 554.37, 0.1, 'triangle', 0);
        tone(554.37, 659.25, 0.1, 'triangle', 0.07);
        tone(659.25, 880, 0.18, 'sine', 0.14);
        tone(1174.66, 1318.5, 0.22, 'sine', 0.22, 0.8);
        break;
      case 'monster':
        tone(140, 62, 0.28, 'sawtooth', 0, 0.85);
        tone(185, 78, 0.25, 'triangle', 0.04, 0.7);
        break;
      case 'monsterDown':
        tone(440, 554.37, 0.12, 'triangle', 0);
        tone(554.37, 659.25, 0.12, 'triangle', 0.09);
        tone(659.25, 880, 0.24, 'sine', 0.18);
        break;
      case 'turn':
        tone(659.25, 659.25, 0.09, 'sine', 0, 0.75);
        tone(987.77, 987.77, 0.14, 'sine', 0.07, 0.65);
        break;
      case 'stamp':
        tone(587.33, 783.99, 0.08, 'sine', 0, 0.7);
        tone(783.99, 1046.5, 0.1, 'sine', 0.06, 0.65);
        break;
      case 'victory':
        tone(523.25, 523.25, 0.14, 'triangle', 0);
        tone(659.25, 659.25, 0.14, 'triangle', 0.12);
        tone(783.99, 783.99, 0.16, 'triangle', 0.24);
        tone(1046.5, 1046.5, 0.42, 'triangle', 0.36);
        this.spawnNoise(sfxGain, now + 0.36, 0.24, 5500, 0.5, true);
        break;
      case 'defeat':
        tone(392, 349, 0.2, 'sawtooth', 0);
        tone(330, 246, 0.35, 'triangle', 0.18);
        break;
    }
  }
}

export const soundManager = new SoundManager();
