// Sound for the kitten and the glass. Every clip is a real recording from
// freesound.org, cut by sfx/make.py (credits in sfx/CREDITS.md) and inlined
// by esbuild as data URLs. Nothing is decoded until the first user gesture,
// which is also when browsers allow an AudioContext to start.

import manifest from '../sfx/clips/manifest.json';
import breathA from '../sfx/clips/breath-a.mp3';
import breathB from '../sfx/clips/breath-b.mp3';
import breathC from '../sfx/clips/breath-c.mp3';
import chatter from '../sfx/clips/chatter.mp3';
import clunk from '../sfx/clips/clunk.mp3';
import drop from '../sfx/clips/drop.mp3';
import mewA from '../sfx/clips/mew-a.mp3';
import mewB from '../sfx/clips/mew-b.mp3';
import mewC from '../sfx/clips/mew-c.mp3';
import mewD from '../sfx/clips/mew-d.mp3';
import mewSad from '../sfx/clips/mew-sad.mp3';
import mewSleepy from '../sfx/clips/mew-sleepy.mp3';
import purr from '../sfx/clips/purr.mp3';
import purrSleep from '../sfx/clips/purr-sleep.mp3';
import sloshA from '../sfx/clips/slosh-a.mp3';
import sloshB from '../sfx/clips/slosh-b.mp3';
import squeak from '../sfx/clips/squeak.mp3';
import tap from '../sfx/clips/tap.mp3';
import tick from '../sfx/clips/tick.mp3';
import trillA from '../sfx/clips/trill-a.mp3';
import trillB from '../sfx/clips/trill-b.mp3';
import trillC from '../sfx/clips/trill-c.mp3';

const SOURCES = {
  'breath-a': breathA, 'breath-b': breathB, 'breath-c': breathC, chatter, clunk, drop,
  'mew-a': mewA, 'mew-b': mewB, 'mew-c': mewC, 'mew-d': mewD, 'mew-sad': mewSad, 'mew-sleepy': mewSleepy,
  purr, 'purr-sleep': purrSleep, 'slosh-a': sloshA, 'slosh-b': sloshB, squeak, tap, tick,
  'trill-a': trillA, 'trill-b': trillB, 'trill-c': trillC
};

const STORAGE_KEY = 'watercat.sound';
const pick = list => list[Math.floor(Math.random() * list.length)];

function readSetting() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export class Soundscape {
  constructor() {
    this.enabled = readSetting();
    this.context = null;
    this.master = null;
    this.buffers = null;
    this.loading = null;
    this.pending = [];
    this.loops = new Map();
    this.recorder = null;
  }

  // Video export: nothing is played, every sound is written down against the
  // simulation clock instead (advance recorder.time each frame).
  record() {
    this.enabled = true;
    this.recorder = { time: 0, events: [], loops: {} };
    return this.recorder;
  }

  // Milliseconds on whichever clock the sounds follow.
  now() { return this.recorder ? this.recorder.time * 1000 : performance.now(); }

  // Call from a user gesture. Safe to call repeatedly.
  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.context.destination);
      this.loading = this.decodeAll();
    }
    if (this.context.state === 'suspended' && !document.hidden) this.context.resume().catch(() => {});
  }

  async decodeAll() {
    const entries = await Promise.all(Object.entries(SOURCES).map(async ([name, url]) => {
      try {
        const data = await (await fetch(url)).arrayBuffer();
        return [name, await this.context.decodeAudioData(data)];
      } catch (error) {
        console.warn(`sound ${name} unavailable`, error);
        return [name, null];
      }
    }));
    this.buffers = Object.fromEntries(entries);
    // Anything asked for while decoding still plays if it is recent enough.
    const now = performance.now();
    for (const [name, options, at] of this.pending) if (now - at < 600) this.play(name, options);
    this.pending = [];
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    if (on) this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.context.currentTime, 0.04);
  }

  // Pause everything while the page is hidden; the render loop stops then too.
  setHidden(hidden) {
    if (!this.context) return;
    if (hidden) this.context.suspend().catch(() => {});
    else this.context.resume().catch(() => {});
  }

  // `name` may be a list, one of which is chosen at random.
  play(name, { gain = 1, rate = 1, delay = 0, spread = 0.04 } = {}) {
    if (this.recorder) {
      const id = Array.isArray(name) ? pick(name) : name;
      const r = rate * (1 + (Math.random() * 2 - 1) * spread);
      this.recorder.events.push({ type: 'play', t: this.recorder.time + delay, id, gain, rate: r });
      return;
    }
    if (!this.context || !this.enabled) return;
    const id = Array.isArray(name) ? pick(name) : name;
    if (!this.buffers) { this.pending.push([id, { gain, rate, delay, spread }, performance.now()]); return; }
    const buffer = this.buffers[id];
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * spread);
    const amp = this.context.createGain();
    amp.gain.value = gain;
    source.connect(amp).connect(this.master);
    source.start(this.context.currentTime + delay);
  }

  // Continuous layers (purring, a finger squeaking on glass) whose level is
  // steered every frame. `tau` is the smoothing time in seconds.
  loop(name, level, { tau = 0.15, rate = 1 } = {}) {
    if (this.recorder) {
      const last = this.recorder.loops[name];
      if (last === undefined ? level < 0.001 : Math.abs(level - last) < 0.002) return;
      this.recorder.loops[name] = level;
      this.recorder.events.push({ type: 'loop', t: this.recorder.time, id: name, level, tau, rate });
      return;
    }
    if (!this.context || !this.buffers) return;
    let layer = this.loops.get(name);
    if (!layer) {
      if (level < 0.001) return;
      const buffer = this.buffers[name];
      if (!buffer) return;
      const { loopStart, loopLength } = manifest[name];
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopStart + loopLength;
      source.playbackRate.value = rate;
      const amp = this.context.createGain();
      amp.gain.value = 0;
      source.connect(amp).connect(this.master);
      source.start(0, loopStart + Math.random() * loopLength);
      layer = { source, amp, level: 0 };
      this.loops.set(name, layer);
    }
    if (Math.abs(level - layer.level) < 0.002) return;
    layer.level = level;
    layer.amp.gain.setTargetAtTime(level, this.context.currentTime, tau);
  }
}
