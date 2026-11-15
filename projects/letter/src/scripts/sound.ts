/**
 * Tiny procedural paper foley — no audio files.
 * Tearing is a looping crackle whose level follows drag speed;
 * folds, slides and page turns are filtered noise swishes.
 */
export class PaperSound {
  enabled = true;
  private ctx?: AudioContext;
  private master?: GainNode;
  private hiss?: AudioBuffer;
  private crackle?: AudioBuffer;
  private tear?: { src: AudioBufferSourceNode; gain: GainNode };

  /** Must be called from a user gesture before the first sound. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.hiss = this.buffer(1.5, () => Math.random() * 2 - 1);
      let env = 0;
      this.crackle = this.buffer(2, () => {
        if (Math.random() < 0.0028) env = 0.55 + Math.random() * 0.45;
        env *= 0.9935;
        return (Math.random() * 2 - 1) * (0.14 + env);
      });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private buffer(seconds: number, sample: () => number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = sample();
    return buf;
  }

  private get ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  private swish(opts: { dur: number; f0: number; f1: number; q: number; gain: number; attack?: number; delay?: number }) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.hiss!;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = opts.q;
    bp.frequency.setValueAtTime(opts.f0, t);
    bp.frequency.exponentialRampToValueAtTime(opts.f1, t + opts.dur);
    const g = ctx.createGain();
    const a = opts.attack ?? opts.dur * 0.35;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + opts.dur + 0.05);
  }

  page() {
    this.swish({ dur: 0.34, f0: 900, f1: 3400, q: 0.8, gain: 0.2, attack: 0.08 });
    this.swish({ dur: 0.22, f0: 2600, f1: 1400, q: 1.2, gain: 0.07, delay: 0.28 });
  }

  fold() {
    this.swish({ dur: 0.28, f0: 700, f1: 1800, q: 0.9, gain: 0.13, attack: 0.1 });
  }

  slide() {
    this.swish({ dur: 0.6, f0: 1600, f1: 650, q: 0.55, gain: 0.1, attack: 0.25 });
  }

  tearStart() {
    if (!this.ready || this.tear) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.crackle!;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 3200;
    bp.gain.value = 6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(hp).connect(bp).connect(gain).connect(this.master!);
    src.start();
    this.tear = { src, gain };
  }

  /** 0…1 — typically derived from pointer speed. */
  tearLevel(level: number) {
    if (!this.tear || !this.ctx) return;
    this.tear.gain.gain.setTargetAtTime(Math.min(0.55, level) * (this.enabled ? 1 : 0), this.ctx.currentTime, 0.035);
  }

  tearStop() {
    if (!this.tear || !this.ctx) return;
    const { src, gain } = this.tear;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    src.stop(this.ctx.currentTime + 0.3);
    this.tear = undefined;
  }
}
