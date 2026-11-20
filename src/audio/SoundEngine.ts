import type { ElementType, ReactionType, WeaponType } from '../core/Types';

/**
 * 100% procedural Web Audio API synthesizer producing Mondstadt-inspired dynamic BGM and combat/world SFX.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private masterVolume = 0.7;
  private bgmVolume = 0.52;
  private sfxVolume = 0.8;

  private inCombat = false;
  private isNight = false;
  private stepIndex = 0;
  private bgmAccumulator = 0;
  private started = false;

  private readonly peacefulNotes = [
    523.25, 659.25, 783.99, 987.77, 783.99, 659.25, 587.33, 739.99,
    493.88, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 587.33,
  ];
  private readonly combatBass = [130.81, 130.81, 146.83, 164.81, 110.0, 110.0, 123.47, 146.83];
  private readonly combatLead = [
    659.25, 0, 783.99, 880.0, 987.77, 0, 880.0, 783.99,
    659.25, 587.33, 659.25, 0, 739.99, 880.0, 987.77, 1174.66,
  ];

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.masterGain.gain.value = this.masterVolume;
      this.bgmGain.gain.value = this.bgmVolume;
      this.sfxGain.gain.value = this.sfxVolume;

      this.bgmGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.started = true;
  }

  public setVolumes(master: number, bgm: number, sfx: number): void {
    this.masterVolume = master;
    this.bgmVolume = bgm;
    this.sfxVolume = sfx;
    if (this.masterGain) this.masterGain.gain.value = master;
    if (this.bgmGain) this.bgmGain.gain.value = bgm;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }

  public getVolumes(): { master: number; bgm: number; sfx: number } {
    return { master: this.masterVolume, bgm: this.bgmVolume, sfx: this.sfxVolume };
  }

  public setInCombat(combat: boolean): void {
    this.inCombat = combat;
  }

  public setTimeMode(hour: number): void {
    this.isNight = hour < 6 || hour >= 19.5;
  }

  public update(dt: number): void {
    if (!this.started || !this.ctx || !this.bgmGain || this.ctx.state !== 'running') return;

    const stepInterval = this.inCombat ? 0.21 : 0.42;
    this.bgmAccumulator += dt;
    if (this.bgmAccumulator >= stepInterval) {
      this.bgmAccumulator -= stepInterval;
      this.triggerBgmStep();
      this.stepIndex = (this.stepIndex + 1) % 16;
    }
  }

  private triggerBgmStep(): void {
    if (!this.ctx || !this.bgmGain) return;
    const now = this.ctx.currentTime;

    if (!this.inCombat) {
      const note = this.peacefulNotes[this.stepIndex] * (this.isNight ? 0.5 : 1.0);
      this.playPluck(now, note, 0.08, 1.3, 'triangle', this.bgmGain);
      if (this.stepIndex % 4 === 0) {
        this.playPad(now, note * 0.25, 0.045, 1.8, this.bgmGain);
      }
      if (this.stepIndex % 8 === 2) {
        this.playFlute(now, note * 1.5, 0.035, 0.85, this.bgmGain);
      }
    } else {
      const bass = this.combatBass[Math.floor(this.stepIndex / 2) % this.combatBass.length];
      if (this.stepIndex % 2 === 0) {
        this.playPluck(now, bass, 0.14, 0.22, 'sawtooth', this.bgmGain, 650);
      }
      const lead = this.combatLead[this.stepIndex];
      if (lead > 0) {
        this.playPluck(now, lead, 0.075, 0.34, 'triangle', this.bgmGain);
      }
      if (this.stepIndex % 4 === 0) {
        this.playPercussion(now, 90, 0.12, 0.14, this.bgmGain);
      } else if (this.stepIndex % 2 === 1) {
        this.playFilteredNoise(now, 0.06, 0.03, 3500, 'highpass', this.bgmGain);
      }
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private playPluck(
    start: number,
    freq: number,
    gainVal: number,
    dur: number,
    type: OscillatorType,
    dest: AudioNode,
    cutoff = 2400,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private playPad(start: number, freq: number, gainVal: number, dur: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private playFlute(start: number, freq: number, gainVal: number, dur: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.99, start);
    osc.frequency.linearRampToValueAtTime(freq, start + 0.08);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainVal, start + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.04);
  }

  private playPercussion(start: number, freq: number, dur: number, gainVal: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.6, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, start + dur);
    gain.gain.setValueAtTime(gainVal, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private playFilteredNoise(
    start: number,
    dur: number,
    gainVal: number,
    freq: number,
    filterType: BiquadFilterType,
    dest: AudioNode,
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, start);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  public playSwing(weaponType: WeaponType, comboIndex: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const baseFreq =
      weaponType === 'claymore' ? 500 : weaponType === 'catalyst' ? 1450 : weaponType === 'polearm' ? 1220 : 980;
    this.playFilteredNoise(
      now,
      weaponType === 'claymore' ? 0.22 : 0.13,
      0.18,
      baseFreq + comboIndex * 115,
      'bandpass',
      this.sfxGain,
    );
    if (weaponType === 'catalyst' || weaponType === 'polearm') {
      this.playPluck(now, (weaponType === 'catalyst' ? 880 : 720) + comboIndex * 90, 0.1, 0.2, 'sine', this.sfxGain);
    }
  }

  public playHit(element: ElementType, isCrit: boolean): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPercussion(now, isCrit ? 155 : 115, 0.12, isCrit ? 0.28 : 0.19, this.sfxGain);
    const toneMap: Record<ElementType, number> = {
      anemo: 880,
      pyro: 440,
      hydro: 660,
      electro: 1180,
      cryo: 1320,
      geo: 330,
      physical: 540,
    };
    this.playPluck(
      now,
      toneMap[element],
      isCrit ? 0.16 : 0.1,
      0.18,
      element === 'electro' ? 'sawtooth' : 'triangle',
      this.sfxGain,
    );
  }

  public playSkill(element: ElementType): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playFilteredNoise(now, 0.35, 0.2, 1200, 'bandpass', this.sfxGain);
    const chords: Record<ElementType, number[]> = {
      anemo: [523.25, 783.99, 1046.5],
      pyro: [293.66, 440, 587.33],
      hydro: [440, 554.37, 880],
      electro: [493.88, 739.99, 1174.66],
      cryo: [659.25, 987.77, 1318.5],
      geo: [196, 293.66, 392, 587.33],
      physical: [392, 587.33],
    };
    chords[element].forEach((f, i) => {
      this.playPluck(now + i * 0.04, f, 0.15, 0.52, 'triangle', this.sfxGain!);
    });
  }

  public playBurst(element: ElementType): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPercussion(now, element === 'geo' ? 52 : 70, 0.5, 0.38, this.sfxGain);
    this.playFilteredNoise(now, 0.6, 0.26, 1600, 'bandpass', this.sfxGain);
    const root =
      element === 'pyro'
        ? 220
        : element === 'electro'
          ? 246.94
          : element === 'hydro'
            ? 261.63
            : element === 'cryo'
              ? 329.63
              : element === 'geo'
                ? 174.61
                : 293.66;
    [1, 1.5, 2, 2.5, 3].forEach((mult, idx) => {
      this.playPluck(now + idx * 0.055, root * mult, 0.16, 0.9, 'triangle', this.sfxGain!);
    });
  }

  public playReaction(reaction: ReactionType): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    switch (reaction) {
      case 'overloaded':
        this.playPercussion(now, 62, 0.38, 0.38, this.sfxGain);
        this.playFilteredNoise(now, 0.32, 0.28, 700, 'lowpass', this.sfxGain);
        break;
      case 'vaporize':
      case 'melt':
        this.playFilteredNoise(now, 0.28, 0.24, 2800, 'highpass', this.sfxGain);
        this.playPluck(now, 783.99, 0.13, 0.3, 'sine', this.sfxGain);
        break;
      case 'electroCharged':
      case 'superconduct':
        this.playPluck(now, 1480, 0.13, 0.16, 'sawtooth', this.sfxGain);
        this.playPluck(now + 0.06, 1760, 0.11, 0.16, 'sawtooth', this.sfxGain);
        break;
      case 'swirl':
        this.playFilteredNoise(now, 0.36, 0.22, 1800, 'bandpass', this.sfxGain);
        this.playPluck(now, 987.77, 0.12, 0.42, 'sine', this.sfxGain);
        break;
      case 'frozen':
        this.playPluck(now, 1567.98, 0.15, 0.45, 'sine', this.sfxGain);
        this.playPluck(now + 0.04, 2093.0, 0.12, 0.42, 'sine', this.sfxGain);
        break;
      case 'crystallize':
        this.playPluck(now, 587.33, 0.15, 0.45, 'triangle', this.sfxGain);
        this.playPluck(now + 0.05, 880, 0.14, 0.5, 'sine', this.sfxGain);
        break;
    }
  }

  public playElementalSight(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPad(now, 523.25, 0.14, 0.9, this.sfxGain);
    this.playPluck(now + 0.04, 1046.5, 0.12, 0.75, 'sine', this.sfxGain);
  }

  public playSeelieChime(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [880, 1174.66, 1318.5].forEach((f, i) => {
      this.playPluck(now + i * 0.09, f, 0.13, 0.55, 'sine', this.sfxGain!);
    });
  }

  public playFootstep(surface: 'grass' | 'stone' | 'water' | 'sand'): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (surface === 'water') {
      this.playFilteredNoise(now, 0.11, 0.08, 1200, 'bandpass', this.sfxGain);
    } else if (surface === 'stone') {
      this.playPercussion(now, 240, 0.045, 0.06, this.sfxGain);
    } else {
      this.playFilteredNoise(now, 0.07, 0.045, 950, 'lowpass', this.sfxGain);
    }
  }

  public playDash(): void {
    if (!this.ctx || !this.sfxGain) return;
    this.playFilteredNoise(this.ctx.currentTime, 0.2, 0.16, 1400, 'bandpass', this.sfxGain);
  }

  public playGliderOpen(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playFilteredNoise(now, 0.26, 0.18, 900, 'bandpass', this.sfxGain);
    this.playPluck(now, 587.33, 0.1, 0.35, 'sine', this.sfxGain);
  }

  public playCharacterSwap(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(now, 659.25, 0.12, 0.22, 'triangle', this.sfxGain);
    this.playPluck(now + 0.05, 880, 0.1, 0.25, 'triangle', this.sfxGain);
  }

  public playPickup(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playPluck(now, 880, 0.12, 0.22, 'sine', this.sfxGain);
    this.playPluck(now + 0.06, 1174.66, 0.12, 0.25, 'sine', this.sfxGain);
  }

  public playChestOpen(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.playPluck(now + i * 0.07, f, 0.16, 0.65, 'triangle', this.sfxGain!);
    });
  }

  public playStatueResonate(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [392, 493.88, 587.33, 783.99, 987.77, 1174.66].forEach((f, i) => {
      this.playPluck(now + i * 0.1, f, 0.16, 1.4, 'sine', this.sfxGain!);
    });
  }

  public playAnemoculus(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
      this.playPluck(now + i * 0.075, f, 0.17, 0.8, 'sine', this.sfxGain!);
    });
  }

  public playWaypointUnlock(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((f, i) => {
      this.playPluck(now + i * 0.08, f, 0.16, 0.9, 'triangle', this.sfxGain!);
    });
  }

  public playWishComet(rarity: 3 | 4 | 5): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.playFilteredNoise(now, 0.9, 0.22, 1800, 'bandpass', this.sfxGain);
    const notes =
      rarity === 5
        ? [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5, 1567.98]
        : rarity === 4
          ? [440, 554.37, 659.25, 880, 1108.73]
          : [392, 493.88, 587.33, 783.99];
    notes.forEach((f, i) => {
      this.playPluck(now + 0.35 + i * 0.08, f, rarity === 5 ? 0.2 : 0.14, 1.1, 'sine', this.sfxGain!);
    });
  }
}
