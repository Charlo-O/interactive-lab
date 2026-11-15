// Recording mode (?record=1), driven by tools/record.mjs.
//
// The whole page runs on a virtual clock that the recorder advances by exactly
// one video frame at a time: performance.now, timers, requestAnimationFrame and
// CSS transitions all follow it. So however long a frame takes to render and
// screenshot, the recording plays back at true speed and every frame is the
// same on every run. Imported first by main.js so it is in place before anything
// reads the time.

export const recording = new URLSearchParams(location.search).has('record');

if (recording) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  let frameCallbacks = [];
  const started = new WeakMap();

  performance.now = () => now;
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn: () => fn(...args) });
    return id;
  };
  window.clearTimeout = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { frameCallbacks.push(fn); return frameCallbacks.length; };
  window.cancelAnimationFrame = () => {};

  // Same choices on every run.
  let seed = 20261110;
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  window.__clock = {
    get now() { return now; },
    step(ms) {
      now += ms;
      for (;;) {
        let due = null;
        for (const entry of timers) if (entry[1].at <= now && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        timers.delete(due[0]);
        due[1].fn();
      }
      const callbacks = frameCallbacks;
      frameCallbacks = [];
      for (const fn of callbacks) fn(now);
      // CSS transitions: hold each one and place it on the virtual clock.
      for (const animation of document.getAnimations()) {
        if (!started.has(animation)) {
          started.set(animation, now - (animation.currentTime || 0));
          animation.pause();
        }
        animation.currentTime = now - started.get(animation);
      }
      return now;
    }
  };
}
