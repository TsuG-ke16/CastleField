// Audio manager using Howler for music/sfx + lightweight Web Audio tactile synth fallback
// so button clicks, card plays, sword clashes, and victory fanfare always feel crisp on mobile & desktop.
import { Howler } from 'howler';

type SoundKey = 'tap' | 'card' | 'deploy' | 'hit' | 'spell' | 'heal' | 'coin' | 'victory' | 'defeat';

class SoundManager {
  private ctx: AudioContext | null = null;
  public muted = false;
  public volume = 0.75;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

    const tone = (freq: number, endFreq: number, dur: number, type: OscillatorType = 'triangle', delay = 0) => {
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
