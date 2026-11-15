export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ease = {
  out: 'cubic-bezier(.22,1,.36,1)',
  outSoft: 'cubic-bezier(.33,1,.68,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  in: 'cubic-bezier(.55,0,.8,.2)',
  fold: 'cubic-bezier(.5,.05,.18,1)',
} as const;

/**
 * Web Animations wrapper: runs, then bakes the end state into inline styles
 * so the next animation starts from wherever this one landed.
 */
export function animate(
  el: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  const opts: KeyframeAnimationOptions = { fill: 'both', ...options };
  if (reducedMotion) {
    opts.duration = Math.min(Number(options.duration) || 0, 140);
    opts.delay = 0;
  }
  const anim = el.animate(frames, opts);
  return anim.finished.then(
    () => {
      try {
        anim.commitStyles();
      } catch {
        /* element not rendered — nothing to bake */
      }
      anim.cancel();
    },
    () => undefined,
  );
}

export const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));

export const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Drive a 0→1 progress value on rAF with a JS easing function. */
export function tween(duration: number, fn: (t: number) => void, easing = easeInOutSine): Promise<void> {
  if (reducedMotion) duration = Math.min(duration, 120);
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / Math.max(1, duration));
      fn(easing(k));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
