// What the kitten is doing, as a small set of damped variables. Everything is
// simulated in seconds and radians, independently of the renderer, so the same
// behaviour can be stepped deterministically in a test.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// The right ear is pressed against the glass, so the head has little room to
// turn that way. Yaw is positive towards the viewer's right, pitch positive up.
export const HEAD_LIMITS = Object.freeze({ yaw: [-16 * DEG, 4 * DEG], pitch: [-10 * DEG, 9 * DEG] });
const EYE_RANGE = Object.freeze({ yaw: 18 * DEG, pitch: 14 * DEG });
const EAR_RANGE = 32 * DEG;
const DROOP = 11 * DEG;

// Awake about 22 breaths a minute, asleep about 16; both inside the 15-30 /min
// resting range. Breathing slows as muscles relax into sleep.
const BREATH_AWAKE = 2.7;
const BREATH_ASLEEP = 3.8;

// Seconds without attention before the kitten dozes off, then falls asleep.
export const DROWSY_AFTER = 12;
export const ASLEEP_AFTER = 26;
const ATTENTION_HOLD = 2.2;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (a, b, t) => a + (b - a) * t;
const approach = (value, target, tau, dt) => value + (target - value) * (1 - Math.exp(-dt / tau));
const spring = () => ({ x: 0, v: 0 });

function stepSpring(state, target, omega, zeta, dt) {
  state.v += (omega * omega * (target - state.x) - 2 * zeta * omega * state.v) * dt;
  state.x += state.v * dt;
}

// Lid opening over one blink: a quick reflex blink or a cat's slow narrowing.
function lidOpening(blink) {
  if (!blink) return 1;
  const { time, close, hold, open } = blink;
  if (time < close) return 1 - time / close;
  if (time < close + hold) return 0;
  if (time < close + hold + open) return (time - close - hold) / open;
  return 1;
}

export class CatBehavior {
  constructor(seed = 7) {
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.random = this.seed;
    this.clock = 0;
    this.phase = 0;
    this.idle = 0;
    this.attention = 0;
    this.drowsiness = 0;
    this.startle = 0;
    this.shiver = 0;
    this.contentment = 0;
    this.purr = 0;
    this.headYaw = spring();
    this.headPitch = spring();
    this.headRoll = spring();
    this.gazeYaw = spring();
    this.gazePitch = spring();
    this.earSwivel = spring();
    this.earHinge = spring();
    this.jiggle = [spring(), spring(), spring()];
    this.impacts = [];
    this.blink = null;
    this.nextBlink = 5.5;
    this.nextTwitch = 7.5;
    this.lean = { x: 0, y: 0 };
    this.forced = null;
    this.breathGain = 1;
    this.lastBreath = 0;
    this.exhale = 0;
  }

  next(low, high) {
    // Small linear-congruential generator: repeatable, and that's all it needs.
    this.random = (this.random * 16807) % 2147483647;
    return low + (high - low) * (this.random / 2147483647);
  }

  // A tap on the glass. `point` is the contact in world space, `inward` a unit
  // vector into the cup. The pinna and eyelid reflexes come first (tens of ms).
  tap(point, inward, strength = 1) {
    this.idle = 0;
    const wasAsleep = this.drowsiness > 0.5;
    this.startle = Math.max(this.startle, strength);
    this.shiver = Math.max(this.shiver, strength);
    this.blink = { time: 0, close: 0.05, hold: 0.04, open: wasAsleep ? 0.3 : 0.16 };
    this.earHinge.v += 7 * strength;
    this.impacts.unshift({ point: [...point], age: 0, strength });
    this.impacts.length = Math.min(this.impacts.length, 4);
    // The head jerks away from the disturbance, the soft body takes the shock.
    const away = -Math.sign(point[0] - 0.8) || 1;
    this.headYaw.v += away * 1.5 * strength;
    this.headPitch.v += 0.5 * strength;
    inward.forEach((component, i) => { this.jiggle[i].v += component * 2.1 * strength; });
  }

  // A touch on an ear itself: it flicks away without alarming the kitten.
  flickEar(strength = 1) {
    this.idle = 0;
    this.earHinge.v += 9 * strength;
  }

  // Scripted scenes can push the kitten towards sleep, or release it (null).
  forceSleep(target, tau = 1) {
    this.forced = target === null ? null : { target, tau };
    if (target === null) this.idle = 0;
  }

  // Ripples without the fright: a drop landing on the body.
  splash(point, strength = 0.5) {
    this.impacts.unshift({ point: [...point], age: 0, strength });
    this.impacts.length = Math.min(this.impacts.length, 4);
  }

  blinkSlowly() {
    this.blink = { time: 0, close: 0.5, hold: 0.25, open: 0.55 };
  }

  // A mild scare without a contact point, such as the cup being shaken.
  jolt(strength = 0.5) {
    this.idle = 0;
    this.startle = Math.max(this.startle, strength);
    this.earHinge.v += 3 * strength;
  }

  update(dt, input) {
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(h, input);
    const pose = this.pose();
    this.exhale = dt > 0 ? Math.max(0, (this.lastBreath - pose.breath) / dt) : 0;
    this.lastBreath = pose.breath;
    pose.exhale = this.exhale;
    return pose;
  }

  integrate(h, input) {
    this.clock += h;
    const neutral = input.neutral;
    const active = !neutral && input.pointerActive;
    if (active || input.stroking) this.idle = 0;
    else this.idle += h;

    this.attention = approach(this.attention, active || input.stroking ? 1 : 0, active ? 0.14 : 0.7, h);

    // Sleep pressure: dozing first, then properly asleep. Waking is much quicker.
    const naturalSleep = neutral ? 0 : this.idle > ASLEEP_AFTER ? 1 : this.idle > DROWSY_AFTER ? 0.55 : 0;
    const sleepTarget = this.forced ? this.forced.target : naturalSleep;
    const sleepTau = this.forced ? this.forced.tau : sleepTarget > this.drowsiness ? 3.2 : 0.55;
    this.drowsiness = approach(this.drowsiness, sleepTarget, sleepTau, h);
    const d = this.drowsiness;

    this.startle = approach(this.startle, 0, 0.55, h);
    this.shiver = approach(this.shiver, 0, 0.32, h);
    this.contentment = approach(this.contentment, input.stroking ? 1 : 0, input.stroking ? 0.6 : 2.6, h);
    const c = this.contentment;
    this.purr = approach(this.purr, input.stroking ? 1 : 0, input.stroking ? 0.8 : 1.4, h);

    // Breathing slows through sleep. Integrating the phase keeps it continuous.
    const breathRate = input.breathRate || 1;
    this.phase = (this.phase + h * breathRate / mix(BREATH_AWAKE, BREATH_ASLEEP, d)) % 1;
    this.breathGain = approach(this.breathGain, input.breathGain || 1, 0.3, h);

    // Where the attention is, relative to the head's resting direction.
    const engaged = this.attention * (1 - d);
    const lookYaw = neutral ? 0 : input.pointerYaw * engaged;
    const lookPitch = neutral ? 0 : input.pointerPitch * engaged;

    // The head takes part of the turn; the eyes and pinna make up the rest,
    // reaching the target first and then counter-rotating as the head arrives.
    const share = mix(0.55, 0.85, c);
    const headYawTarget = clamp(lookYaw * share, ...HEAD_LIMITS.yaw);
    const headPitchTarget = clamp(lookPitch * share, ...HEAD_LIMITS.pitch) - DROOP * d;
    stepSpring(this.headYaw, headYawTarget, 9, 0.9, h);
    stepSpring(this.headPitch, headPitchTarget, 9, 0.9, h);
    stepSpring(this.headRoll, -headYawTarget * 0.35 * c + 2.5 * DEG * d + (input.counterRoll || 0), 7, 0.95, h);

    stepSpring(this.gazeYaw, clamp(lookYaw - this.headYaw.x, -EYE_RANGE.yaw, EYE_RANGE.yaw), 30, 1, h);
    stepSpring(this.gazePitch, clamp(lookPitch - this.headPitch.x, -EYE_RANGE.pitch, EYE_RANGE.pitch), 30, 1, h);
    stepSpring(this.earSwivel, clamp(lookYaw - this.headYaw.x, -EAR_RANGE, EAR_RANGE), 22, 0.9, h);

    // Ears: relaxed back in sleep, eased back while being stroked, pinned by a scare.
    stepSpring(this.earHinge, 0.14 * d + 0.12 * c + 0.38 * this.startle, 28, 0.65, h);

    this.lean.x = approach(this.lean.x, Math.sin(headYawTarget) * c, 0.4, h);
    this.lean.y = approach(this.lean.y, Math.sin(lookPitch * share) * c, 0.4, h);

    this.jiggle.forEach(axis => stepSpring(axis, 0, 18.8, 0.18, h));

    for (const impact of this.impacts) impact.age += h;
    this.impacts = this.impacts.filter(impact => impact.age < 1.4);

    this.updateBlinks(h, neutral, d, c);
    this.updateTwitches(h, neutral, d);
  }

  updateBlinks(h, neutral, d, c) {
    if (this.blink) {
      this.blink.time += h;
      const { time, close, hold, open } = this.blink;
      if (time >= close + hold + open) this.blink = null;
    }
    if (neutral) { this.nextBlink = 5.5; return; }
    this.nextBlink -= h;
    if (this.nextBlink <= 0 && !this.blink && d < 0.4) {
      if (c > 0.5) {
        // Contented eye narrowing: slow down, held, slow up.
        this.blink = { time: 0, close: 0.55, hold: 0.28, open: 0.6 };
        this.nextBlink = this.next(3.0, 4.6);
      } else {
        this.blink = { time: 0, close: 0.08, hold: 0.03, open: 0.15 };
        this.nextBlink = this.next(5.0, 11.0);
      }
    }
  }

  updateTwitches(h, neutral, d) {
    if (neutral) { this.nextTwitch = 7.5; return; }
    this.nextTwitch -= h;
    if (this.nextTwitch > 0) return;
    // Awake, an occasional ear flick; asleep, the small twitches of REM sleep.
    const asleep = d > 0.8;
    this.earHinge.v += this.next(asleep ? 2.5 : 4, asleep ? 4.5 : 7) * (this.next(0, 1) > 0.3 ? 1 : -1);
    this.nextTwitch = asleep ? this.next(2.2, 5.5) : this.next(6, 13);
  }

  pose() {
    const d = this.drowsiness;
    const breath = Math.pow(0.5 - 0.5 * Math.cos(this.phase * TAU), 1.3) * this.breathGain;
    const lid = Math.min(lidOpening(this.blink), 1 - 0.95 * d);
    return {
      clock: this.clock,
      breath,
      exhale: this.exhale,
      lid: Math.max(lid, 0.05),
      eyeScale: 1 + 0.13 * this.startle,
      gaze: [this.gazeYaw.x / EYE_RANGE.yaw, this.gazePitch.x / EYE_RANGE.pitch],
      pupil: this.attention * (1 - d),
      earHinge: this.earHinge.x,
      earSwivel: this.earSwivel.x,
      headYaw: this.headYaw.x,
      headPitch: this.headPitch.x,
      headRoll: this.headRoll.x,
      headMove: [this.lean.x * 0.12, breath * 0.02 + this.lean.y * 0.08 - 0.25 * d, 0],
      jiggle: this.jiggle.map(axis => axis.x),
      shiver: this.shiver,
      purr: this.purr,
      drowsiness: d,
      contentment: this.contentment,
      impacts: this.impacts.map(({ point, age, strength }) => ({ point, age, strength }))
    };
  }
}
