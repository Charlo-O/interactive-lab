import { Vector3 } from 'three';

// The seven little scenes behind the buttons: scripted inputs for the behaviour
// system plus the separate pieces of physics they need (a tear, breath on the
// glass, a light the paw chases, the cup rocking on its heel).

const DEG = Math.PI / 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = t => t * t * (3 - 2 * t);

function keyframes(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, ...a] = keys[i];
    const [t1, ...b] = keys[i + 1];
    if (t <= t1) {
      const u = smooth((t - t0) / (t1 - t0));
      return a.map((value, k) => value + (b[k] - value) * u);
    }
  }
  return keys[keys.length - 1].slice(1);
}

// The life of the tear under the left eye: it swells, necks, lets go, slides
// down the cheek, falls the last few millimetres, lands and slowly re-forms.
export class TearCycle {
  constructor({ eyeLocal, eyeRadius, radii, toWorld }) {
    this.radii = radii;
    this.toWorld = toWorld;
    // Where the painted bead sits on the head, in head-local centimetres.
    this.start = { x: eyeLocal.x - 0.25 * eyeRadius, y: eyeLocal.y - 1.26 * eyeRadius };
    this.reset();
  }

  reset() {
    this.stage = 'rest';
    this.time = 0;
    this.grow = 1;
    this.neck = 1;
    this.drop = null;
    this.fall = null;
    this.landed = null;
  }

  get resting() { return this.stage === 'rest'; }

  begin() {
    if (this.stage === 'rest') { this.stage = 'swell'; this.time = 0; }
  }

  surface(localY) {
    const [rx, ry, rz] = this.radii;
    const scale = Math.sqrt(Math.max(1 - (localY / ry) ** 2, 0.02)) / Math.sqrt(Math.max(1 - (this.start.y / ry) ** 2, 0.02));
    const x = this.start.x * scale;
    // The face is the skull plus the jaw and cheek mass below it.
    const skull = rz * Math.sqrt(Math.max(1 - (x / rx) ** 2 - (localY / ry) ** 2, 0));
    const jaw = 0.42 + 1.98 * Math.sqrt(Math.max(1 - (x / 2.3) ** 2 - ((localY + 0.62) / 1.62) ** 2, 0));
    return new Vector3(x, localY, Math.max(skull, jaw) + 0.2);
  }

  // Returns the point where the drop landed in the frame it lands, else null.
  update(dt) {
    this.time += dt;
    this.landed = null;
    if (this.stage === 'swell') {
      this.grow = 1 + 0.38 * smooth(clamp(this.time / 1.4, 0, 1));
      if (this.time >= 1.4) { this.stage = 'pinch'; this.time = 0; }
    } else if (this.stage === 'pinch') {
      this.neck = 1 - smooth(clamp(this.time / 0.22, 0, 1));
      if (this.time >= 0.22) { this.stage = 'slide'; this.time = 0; this.grow = 0; this.neck = 1; }
    } else if (this.stage === 'slide') {
      const u = clamp(this.time / 1.15, 0, 1) ** 1.8;
      const y = this.start.y + (-1.85 - this.start.y) * u;
      this.drop = { point: this.toWorld(this.surface(y)), radius: 0.15 };
      if (this.time >= 1.15) { this.stage = 'fall'; this.time = 0; this.fall = { y: this.drop.point.y, v: 0 }; }
    } else if (this.stage === 'fall') {
      // Free fall at 981 cm/s^2: the last few millimetres take a frame or two.
      this.fall.v += 981 * dt;
      this.fall.y -= this.fall.v * dt;
      this.drop.point.y = this.fall.y;
      if (this.fall.y <= 4.7) {
        this.landed = this.drop.point.clone();
        this.drop = null;
        this.stage = 'regrow';
        this.time = 0;
      }
    } else if (this.stage === 'regrow') {
      this.grow = smooth(clamp(this.time / 2.6, 0, 1));
      if (this.time >= 2.6) { this.grow = 1; this.stage = 'rest'; this.time = 0; }
    }
    return this.landed;
  }
}

// The cup tipped on its heel and rocking to rest.
export class CupRock {
  constructor() { this.time = -1; this.angle = 0; }
  get rocking() { return this.time >= 0; }
  start() { this.time = 0; }
  stop() { this.time = -1; this.angle = 0; }
  update(dt) {
    if (this.time < 0) return;
    this.time += dt;
    if (this.time > 3.7) { this.stop(); return; }
    const envelope = Math.exp(-this.time / 1.2) * (1 - Math.exp(-this.time / 0.12));
    this.angle = 8 * DEG * Math.sin(2 * Math.PI * 1.15 * this.time) * envelope;
  }
}

// The paw on the glass reaching towards something. The anatomy decides how far.
export class PawChase {
  constructor({ restAzimuth, restY, reachable }) {
    this.restAzimuth = restAzimuth;
    this.restY = restY;
    this.reachable = reachable;
    this.reset();
  }

  reset() {
    this.dTheta = 0;
    this.dY = 0;
    this.vTheta = 0;
    this.vY = 0;
    this.spread = 0;
    this.touching = false;
  }

  get active() { return Math.abs(this.dTheta) > 1e-4 || Math.abs(this.dY) > 1e-4; }

  update(dt, target) {
    const azimuth = target ? Math.atan2(Math.sin(Math.atan2(target.x, target.z) - this.restAzimuth), Math.cos(Math.atan2(target.x, target.z) - this.restAzimuth)) : 0;
    const wantTheta = target ? clamp(azimuth, -0.3, 0.3) : 0;
    const wantY = target ? clamp(target.y - this.restY, -0.75, 0.75) : 0;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    const omega = 7;
    const zeta = 0.75;
    for (let i = 0; i < steps; i++) {
      this.vTheta += (omega * omega * (wantTheta - this.dTheta) - 2 * zeta * omega * this.vTheta) * h;
      this.vY += (omega * omega * (wantY - this.dY) - 2 * zeta * omega * this.vY) * h;
      const nextTheta = this.dTheta + this.vTheta * h;
      const nextY = this.dY + this.vY * h;
      if (this.reachable(nextTheta, nextY)) {
        this.dTheta = nextTheta;
        this.dY = nextY;
      } else {
        this.vTheta = 0;
        this.vY = 0;
      }
    }
    const close = target ? Math.hypot((wantTheta - this.dTheta) * 4, wantY - this.dY) < 0.5 : false;
    this.touching = close;
    this.spread += ((close ? 1 : 0) - this.spread) * (1 - Math.exp(-dt / 0.14));
  }
}

const LOOK_KEYS = [[0, 0, 0], [0.7, -30, 8], [2.3, -30, 8], [3.3, 22, -6], [4.5, 22, -6], [5.5, -8, 14], [6.1, -8, 14], [6.6, 0, 0]];

// Each entry: label, duration, and how it drives the world while it runs.
export function createPerformances(c) {
  return {
    look: {
      duration: 6.6,
      update(t, input) {
        if (c.pointerLive()) return;
        const [yaw, pitch] = keyframes(LOOK_KEYS, t);
        input.pointerActive = t < 6.2;
        input.pointerYaw = yaw * DEG;
        input.pointerPitch = pitch * DEG;
        if (t < 6.2) c.cue(c.pointFromAngles(yaw * DEG, pitch * DEG), 'target');
      }
    },

    touch: {
      duration: 6.6,
      begin() { this.tapped = false; },
      update(t, input) {
        const tapPoint = c.wallPoint(-0.14, 4.9);
        if (t < 1.3) {
          c.cue(tapPoint, 'finger');
          if (t >= 0.28 && !this.tapped) { this.tapped = true; c.tap(tapPoint); }
          return;
        }
        if (t > 5.9) return;
        const s = t - 1.3;
        const finger = c.wallPoint(-0.1 + 0.3 * Math.sin(s * 1.9), 6.0 + 0.45 * Math.sin(s * 1.4 + 0.6));
        const [yaw, pitch] = c.headAngles(finger);
        input.stroking = true;
        input.pointerActive = true;
        input.pointerYaw = yaw;
        input.pointerPitch = pitch;
        c.cue(finger, 'finger');
      }
    },

    nap: {
      duration: 9.2,
      begin() { this.woke = false; c.behavior.forceSleep(0.55, 0.65); },
      update(t, input) {
        input.pointerActive = false;
        if (t >= 1.5 && t < 1.6) c.behavior.forceSleep(1, 0.8);
        if (t >= 7.2 && !this.woke) {
          this.woke = true;
          c.behavior.forceSleep(null);
          c.tap(c.wallPoint(0.05, 4.4));
        }
      },
      end() { c.behavior.forceSleep(null); }
    },

    tear: {
      duration: 12,
      begin() { c.tear.begin(); },
      finished() { return c.tear.resting; }
    },

    fog: {
      duration: 16,
      begin() { c.fogMode(true); this.heart = 0; },
      update(t, input, dt) {
        // A few long breaths out, then the fog can be written on.
        if (t < 4.2) {
          input.breathRate = 1.5;
          input.breathGain = 1.55;
        }
        if (t >= 4.3 && t < 6.5) {
          const u0 = this.heart;
          const u1 = clamp((t - 4.3) / 2.1, 0, 1);
          this.heart = u1;
          const steps = Math.max(1, Math.ceil((u1 - u0) * 60));
          for (let i = 0; i < steps; i++) {
            c.wipeHeart(u0 + (u1 - u0) * (i / steps), u0 + (u1 - u0) * ((i + 1) / steps));
          }
          c.cue(c.heartPoint(u1), 'finger');
        }
      },
      end() { c.fogMode(false); }
    },

    spot: {
      duration: 12,
      begin() { c.spotMode(true); },
      update(t, input) {
        const point = c.spotPoint(t);
        const [yaw, pitch] = c.headAngles(point);
        input.pointerActive = true;
        input.pointerYaw = yaw;
        input.pointerPitch = pitch;
      },
      end() { c.spotMode(false); }
    },

    shake: {
      duration: 3.7,
      begin() { c.rock.start(); c.behavior.jolt(0.5); },
      end() { c.rock.stop(); }
    }
  };
}

export class Director {
  constructor(performances, onChange) {
    this.performances = performances;
    this.onChange = onChange;
    this.current = null;
    this.time = 0;
  }

  toggle(id) {
    if (this.current === id) { this.stop(); return; }
    this.stop();
    this.current = id;
    this.time = 0;
    const scene = this.performances[id];
    scene.begin?.();
    this.onChange(id, 0);
  }

  stop() {
    if (!this.current) return;
    const id = this.current;
    this.current = null;
    this.performances[id].end?.();
    this.onChange(null, 0, id);
  }

  update(dt, input) {
    if (!this.current) return;
    this.time += dt;
    const scene = this.performances[this.current];
    scene.update?.(this.time, input, dt);
    this.onChange(this.current, clamp(this.time / scene.duration, 0, 1));
    if (this.time >= scene.duration || scene.finished?.()) this.stop();
  }
}
