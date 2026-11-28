// Audio manager using Howler + lightweight Web Audio tactile synth & adaptive BGM sequencer
// so SFX and royal/battle/pinch music stay crisp with tiny bundle size & mobile battery efficiency.
import { Howler } from 'howler';

export type SoundKey = 'tap' | 'card' | 'deploy' | 'hit' | 'spell' | 'heal' | 'coin' | 'victory' | 'defeat';
export type BgmMode = 'none' | 'home' | 'battle' | 'pinch';

const HOME_MELODY = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 659.25, 523.25];
const BATTLE_MELODY = [293.66, 349.23, 440.0, 392.0, 349.23, 392.0, 440.0, 523.25];
const PINCH_MELODY = [329.63, 440.0, 493.88, 523.25, 493.88, 587.33, 659.25, 440.0];

class SoundManager {
  private ctx: AudioContext | null = null;
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
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
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
    if (this.muted || this.bgmMuted || this.bgmMode === 'none') return;

    const tempoMs = this.bgmMode === 'home' ? 520 : this.bgmMode === 'battle' ? 340 : 230;
    this.bgmTimer = window.setInterval(() => {
      if (this.muted || this.bgmMuted || this.bgmMode === 'none') return;
      if (!this.ctx || this.ctx.state !== 'running') return;
      this.playBgmBeat();
    }, tempoMs);
  }

  private playBgmBeat() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const notes =
      this.bgmMode === 'home' ? HOME_MELODY : this.bgmMode === 'battle' ? BATTLE_MELODY : PINCH_MELODY;
    const freq = notes[this.bgmStep % notes.length];
    const isDownBeat = this.bgmStep % 2 === 0;
    this.bgmStep += 1;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = this.bgmMode === 'home' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    const amp = (this.bgmMode === 'home' ? 0.025 : 0.032) * this.volume;
    g.gain.setValueAtTime(0.0005, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.24);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);

    if (isDownBeat) {
      const bass = ctx.createOscillator();
      const bg = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(freq * 0.5, now);
      bg.gain.setValueAtTime(0.0005, now);
      bg.gain.linearRampToValueAtTime(amp * 0.75, now + 0.02);
      bg.gain.exponentialRampToValueAtTime(0.0005, now + 0.3);
      bass.connect(bg);
      bg.connect(ctx.destination);
      bass.start(now);
      bass.stop(now + 0.32);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    Howler.volume(this.volume);
  }

  public play(key: SoundKey) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const gainMaster = ctx.createGain();
    gainMaster.gain.value = 0.14 * this.volume;
    gainMaster.connect(ctx.destination);

    const tone = (
      freq: number,
      endFreq: number,
      dur: number,
      type: OscillatorType = 'triangle',
      delay = 0
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + delay + dur);
      g.gain.setValueAtTime(0.001, now + delay);
      g.gain.linearRampToValueAtTime(1.0, now + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(g);
      g.connect(gainMaster);
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
        break;
      case 'hit':
        tone(180, 65, 0.14, 'sawtooth');
        tone(110, 55, 0.16, 'square', 0.02);
        break;
      case 'spell':
        tone(420, 960, 0.18, 'sine');
        tone(640, 260, 0.22, 'triangle', 0.07);
        break;
      case 'heal':
        tone(523, 659, 0.14, 'sine');
        tone(659, 784, 0.18, 'sine', 0.08);
        break;
      case 'coin':
        tone(987, 1318, 0.1, 'sine');
        tone(1318, 1567, 0.15, 'sine', 0.07);
        break;
      case 'victory':
        tone(523, 523, 0.14, 'triangle', 0);
        tone(659, 659, 0.14, 'triangle', 0.12);
        tone(784, 784, 0.16, 'triangle', 0.24);
        tone(1046, 1046, 0.36, 'triangle', 0.38);
        break;
      case 'defeat':
        tone(392, 349, 0.2, 'sawtooth', 0);
        tone(330, 246, 0.35, 'triangle', 0.18);
        break;
    }
  }
}

export const soundManager = new SoundManager();
