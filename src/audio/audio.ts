/** Procedural engine/tire/nitro audio — pure Web Audio, zero assets. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engGain: GainNode | null = null;
  private eng1: OscillatorNode | null = null;
  private eng2: OscillatorNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // engine: detuned saw + square through a lowpass that opens with revs
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 700;
    this.engFilter.Q.value = 1.4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain).connect(this.master);

    this.eng1 = ctx.createOscillator();
    this.eng1.type = 'sawtooth';
    this.eng1.frequency.value = 60;
    this.eng1.connect(this.engFilter);
    this.eng1.start();

    this.eng2 = ctx.createOscillator();
    this.eng2.type = 'square';
    this.eng2.frequency.value = 91;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.eng2.connect(g2).connect(this.engFilter);
    this.eng2.start();

    // tire rumble
    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = buf;
    tireSrc.loop = true;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 480;
    tireFilter.Q.value = 0.7;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    tireSrc.connect(tireFilter).connect(this.tireGain).connect(this.master);
    tireSrc.start();

    // skid hiss
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = buf;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'highpass';
    skidFilter.frequency.value = 2200;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    skidSrc.connect(skidFilter).connect(this.skidGain).connect(this.master);
    skidSrc.start();
  }

  update(vf: number, vlat: number, throttle: number, boosting: boolean, active: boolean): void {
    if (!this.ctx || !this.engGain || !this.eng1 || !this.eng2 || !this.engFilter) return;
    const t = this.ctx.currentTime;
    const sp = Math.abs(vf);
    const gear = Math.min(5, Math.floor(sp / 11));
    const inGear = (sp - gear * 11) / 11;
    const rpm = 55 + (gear === 0 ? sp * 4 : 40 + inGear * 95 + gear * 6) + (boosting ? 45 : 0);
    this.eng1.frequency.setTargetAtTime(rpm, t, 0.06);
    this.eng2.frequency.setTargetAtTime(rpm * 1.5 + 4, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(500 + sp * 36 + (boosting ? 1500 : 0), t, 0.1);
    const target = active ? 0.07 + throttle * 0.06 + (boosting ? 0.05 : 0) : 0.0;
    this.engGain.gain.setTargetAtTime(target, t, 0.1);
    this.tireGain!.gain.setTargetAtTime(active ? Math.min(0.16, sp * 0.0025) : 0, t, 0.15);
    this.skidGain!.gain.setTargetAtTime(active ? Math.min(0.22, Math.abs(vlat) * 0.011) : 0, t, 0.06);
  }

  beep(freq = 440, dur = 0.12): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  whoosh(): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.75);
  }

  thud(strength: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160 + 220 * strength;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05 + 0.35 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.25);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }
}
