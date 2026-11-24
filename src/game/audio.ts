import type { Season, TimeOfDay } from "./types.ts";

export interface AmbientState {
  timeOfDay: TimeOfDay;
  season: Season;
  windmillCount: number;
  smithyCount: number;
  activeSmithWorking: boolean;
  cameraDistance: number;
}

/**
 * Lightweight procedural cozy WebAudio synthesizer & layered ambient soundscape
 * (zero external audio files).
 */
export class CozyAudio {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private isAmbientEnabled = true;

  // Continuous ambient graph nodes
  private ambientInitialized = false;
  private ambientMasterGain: GainNode | null = null;
  private surfGain: GainNode | null = null;
  private surfFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private sailLfoGain: GainNode | null = null;

  // Event timers for procedural birdsong, crickets, and smithy anvil clinks
  private birdTimer = 2.8;
  private anvilTimer = 4.2;
  private cricketTimer = 3.5;

  public get muted(): boolean {
    return this.isMuted;
  }

  public set muted(value: boolean) {
    this.isMuted = value;
    this.syncAmbientMasterGain();
  }

  public get ambientEnabled(): boolean {
    return this.isAmbientEnabled;
  }

  public set ambientEnabled(value: boolean) {
    this.isAmbientEnabled = value;
    this.syncAmbientMasterGain();
  }

  /**
   * Call from a user gesture (pointerdown / keydown) to unlock WebAudio
   * and start the layered ambient soundscape gracefully.
   */
  public unlock(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (ctx && !this.ambientInitialized) {
      this.initAmbientGraph(ctx);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    if (!this.ambientInitialized) {
      this.initAmbientGraph(this.ctx);
    }
    return this.ctx;
  }

  private syncAmbientMasterGain(): void {
    if (!this.ctx || !this.ambientMasterGain) return;
    const target = this.isMuted || !this.isAmbientEnabled ? 0 : 1;
    this.ambientMasterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  private createLoopingPinkNoiseBuffer(ctx: AudioContext, seconds = 6): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;

      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
        b6 = white * 0.115926;
        data[i] = Math.max(-1, Math.min(1, pink));
      }

      // Smooth crossfade at loop seam to prevent any audible click
      const fadeSamples = Math.min(Math.floor(sampleRate * 0.25), Math.floor(length / 4));
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        const tailIdx = length - fadeSamples + i;
        data[tailIdx] = data[tailIdx]! * (1 - t) + data[i]! * t;
      }
    }

    return buffer;
  }

  private initAmbientGraph(ctx: AudioContext): void {
    if (this.ambientInitialized) return;
    this.ambientInitialized = true;

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.connect(ctx.destination);
    this.ambientMasterGain = master;

    const noiseBuffer = this.createLoopingPinkNoiseBuffer(ctx, 6);

    // 1) Soft Ocean Surf: low-passed pink noise with slow tidal swell LFO
    const surfSource = ctx.createBufferSource();
    surfSource.buffer = noiseBuffer;
    surfSource.loop = true;

    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = "lowpass";
    surfFilter.frequency.setValueAtTime(340, now);
    surfFilter.Q.setValueAtTime(0.65, now);

    const surfGain = ctx.createGain();
    surfGain.gain.setValueAtTime(0.045, now);

    // Slow wave swell LFO (~9.5s cycle) modulating surf filter & amplitude
    const waveLfo = ctx.createOscillator();
    waveLfo.type = "sine";
    waveLfo.frequency.setValueAtTime(0.105, now);

    const waveFilterDepth = ctx.createGain();
    waveFilterDepth.gain.setValueAtTime(160, now);
    waveLfo.connect(waveFilterDepth).connect(surfFilter.frequency);

    const waveGainDepth = ctx.createGain();
    waveGainDepth.gain.setValueAtTime(0.018, now);
    waveLfo.connect(waveGainDepth).connect(surfGain.gain);

    surfSource.connect(surfFilter).connect(surfGain).connect(master);
    surfSource.start(now);
    waveLfo.start(now);

    this.surfFilter = surfFilter;
    this.surfGain = surfGain;

    // 2) Gentle Wind & Windmill Sails: band-passed breeze + soft sail-turn whoosh
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.setValueAtTime(420, now);
    windFilter.Q.setValueAtTime(2.2, now);

    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.012, now);

    // Slow breeze drift LFO
    const breezeLfo = ctx.createOscillator();
    breezeLfo.type = "sine";
    breezeLfo.frequency.setValueAtTime(0.16, now);
    const breezeFreqDepth = ctx.createGain();
    breezeFreqDepth.gain.setValueAtTime(110, now);
    breezeLfo.connect(breezeFreqDepth).connect(windFilter.frequency);

    // Subtle periodic sail-whoosh modulation (active when windmills are built)
    const sailLfo = ctx.createOscillator();
    sailLfo.type = "sine";
    sailLfo.frequency.setValueAtTime(0.46, now);
    const sailLfoGain = ctx.createGain();
    sailLfoGain.gain.setValueAtTime(0, now);
    sailLfo.connect(sailLfoGain).connect(windGain.gain);

    windSource.connect(windFilter).connect(windGain).connect(master);
    windSource.start(now, 1.7);
    breezeLfo.start(now);
    sailLfo.start(now);

    this.windFilter = windFilter;
    this.windGain = windGain;
    this.sailLfoGain = sailLfoGain;

    this.syncAmbientMasterGain();
  }

  /**
   * Advances the procedural ambient soundscape (ocean surf, windmill breeze,
   * morning birdsong, evening crickets, and distant smithy anvil clinks).
   */
  public updateAmbient(dt: number, state: AmbientState): void {
    if (this.isMuted || !this.isAmbientEnabled) return;
    if (!this.ctx || this.ctx.state !== "running" || !this.ambientInitialized) return;

    const now = this.ctx.currentTime;
    // Slightly gentler when zoomed far out, richer at close diorama angles
    const zoomFactor = Math.max(0.65, Math.min(1.15, 1.25 - (state.cameraDistance - 10) * 0.014));

    // Ocean surf mix
    if (this.surfGain && this.surfFilter) {
      const todSurf =
        state.timeOfDay === "dusk" ? 0.036 : state.timeOfDay === "golden" ? 0.044 : 0.048;
      this.surfGain.gain.setTargetAtTime(todSurf * zoomFactor, now, 0.5);
      const baseCutoff = state.season === "winter" ? 290 : 350;
      this.surfFilter.frequency.setTargetAtTime(baseCutoff, now, 0.6);
    }

    // Wind & windmill sail whoosh mix
    if (this.windGain && this.windFilter && this.sailLfoGain) {
      const hasWindmill = state.windmillCount > 0;
      const seasonWind = state.season === "autumn" || state.season === "winter" ? 1.25 : 1.0;
      const baseWind = (0.01 + Math.min(state.windmillCount, 3) * 0.014) * seasonWind * zoomFactor;
      this.windGain.gain.setTargetAtTime(baseWind, now, 0.5);
      this.windFilter.frequency.setTargetAtTime(hasWindmill ? 460 : 380, now, 0.6);
      this.sailLfoGain.gain.setTargetAtTime(
        hasWindmill ? Math.min(0.016, 0.007 * state.windmillCount) * zoomFactor : 0,
        now,
        0.5,
      );
    }

    // 3) Occasional birdsong (Morning & Golden Hour; quieter in Winter)
    if (state.timeOfDay === "morning" || state.timeOfDay === "golden") {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.playBirdChirp(state.timeOfDay === "morning" ? 1.0 : 0.75, zoomFactor);
        const minGap = state.timeOfDay === "morning" ? 4.5 : 8.0;
        const maxGap = state.timeOfDay === "morning" ? 9.5 : 15.0;
        const winterMult = state.season === "winter" ? 1.7 : 1.0;
        this.birdTimer = (minGap + Math.random() * (maxGap - minGap)) * winterMult;
      }
    } else if (state.season !== "winter") {
      // Soft dusk crickets in non-winter evenings
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) {
        this.playDuskCricket(zoomFactor);
        this.cricketTimer = 5.0 + Math.random() * 6.5;
      }
    }

    // 4) Distant smithy anvil clinks when at least one constructed Smithy exists
    if (state.smithyCount > 0) {
      this.anvilTimer -= dt;
      if (this.anvilTimer <= 0) {
        const isDusk = state.timeOfDay === "dusk";
        this.playAnvilClink(isDusk ? 0.55 : 1.0, zoomFactor);
        const baseGap = state.activeSmithWorking ? 4.8 : 7.5;
        this.anvilTimer = (baseGap + Math.random() * 5.5) * (isDusk ? 1.8 : 1.0);
      }
    }
  }

  private playBirdChirp(intensity: number, zoomFactor: number): void {
    const ctx = this.ctx;
    const master = this.ambientMasterGain;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const pan = (Math.random() * 2 - 1) * 0.65;
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);
    panner.connect(master);

    const noteCount = 2 + Math.floor(Math.random() * 3); // 2 to 4 sweet notes
    const baseFreq = 1950 + Math.random() * 950;
    const motifAscending = Math.random() > 0.45;

    for (let i = 0; i < noteCount; i++) {
      const start = now + i * (0.11 + Math.random() * 0.05);
      const dur = 0.08 + Math.random() * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? "sine" : "triangle";

      const f0 = baseFreq + (motifAscending ? i * 160 : -i * 120);
      const fPeak = f0 * (1.16 + Math.random() * 0.14);
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(fPeak, start + dur * 0.48);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.94, start + dur);

      const vol = (0.018 + Math.random() * 0.01) * intensity * zoomFactor;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain).connect(panner);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }
  }

  private playDuskCricket(zoomFactor: number): void {
    const ctx = this.ctx;
    const master = this.ambientMasterGain;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() * 2 - 1) * 0.75, now);
    panner.connect(master);

    const pulses = 3;
    const carrierFreq = 3950 + Math.random() * 350;
    for (let i = 0; i < pulses; i++) {
      const start = now + i * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(carrierFreq, start);
      const vol = 0.007 * zoomFactor;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
      osc.connect(gain).connect(panner);
      osc.start(start);
      osc.stop(start + 0.065);
    }
  }

  private playAnvilClink(intensity: number, zoomFactor: number): void {
    const ctx = this.ctx;
    const master = this.ambientMasterGain;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() * 2 - 1) * 0.55, now);
    panner.connect(master);

    const strikes = Math.random() > 0.35 ? 2 : 3;
    const partials = [1180, 2410, 3690];

    for (let s = 0; s < strikes; s++) {
      const hitTime = now + s * (0.34 + Math.random() * 0.08);
      const strikeVol = (s === strikes - 1 ? 0.72 : 1.0) * intensity * zoomFactor;

      partials.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq * (0.98 + Math.random() * 0.04), hitTime);

        const partialVol = (idx === 0 ? 0.015 : idx === 1 ? 0.01 : 0.005) * strikeVol;
        const decay = idx === 0 ? 0.36 : idx === 1 ? 0.24 : 0.16;

        gain.gain.setValueAtTime(0.0001, hitTime);
        gain.gain.linearRampToValueAtTime(partialVol, hitTime + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, hitTime + decay);

        osc.connect(gain).connect(panner);
        osc.start(hitTime);
        osc.stop(hitTime + decay + 0.02);
      });
    }
  }

  public playShutter(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Soft mechanical camera shutter click (short filtered noise burst + low body thump)
    const bufferLen = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferLen * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(1.2, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.16, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now);

    const thump = ctx.createOscillator();
    const tGain = ctx.createGain();
    thump.type = "triangle";
    thump.frequency.setValueAtTime(160, now + 0.02);
    thump.frequency.exponentialRampToValueAtTime(75, now + 0.075);
    tGain.gain.setValueAtTime(0.09, now + 0.02);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    thump.connect(tGain).connect(ctx.destination);
    thump.start(now + 0.02);
    thump.stop(now + 0.085);
  }

  public playPlace(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.09);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playPaint(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.06);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playComplete(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 warm triad
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  public playHarvest(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playDemolish(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.12);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}
