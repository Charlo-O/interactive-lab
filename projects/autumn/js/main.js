(() => {
  'use strict';

  // ---- timing (seconds) ----
  const REST_TIME = 3.6;     // calm before the next automatic gust
  const OUT_TIME = 4.6;      // from gust until the leaves are called back
  const WIND_SPEED = 1100;   // how fast the gust front sweeps across, units/s

  // Area of the reference poster (707 × 1000) that has to fit on screen.
  const FRAME = { cx: 353.5, cy: 305, w: 640, h: 400 };

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const backLayer = document.getElementById('back');
  const frontLayer = document.getElementById('front');
  const word = document.getElementById('word');

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const wrap180 = (a) => ((a + 540) % 360) - 180;

  // ---- view: stage units (poster px) → screen px ----
  const view = { k: 1, ox: 0, oy: 0, l: 0, t: 0, r: 0, b: 0 };

  function fit() {
    const vw = innerWidth;
    const vh = innerHeight;
    if (!vw || !vh) return;   // hidden or not laid out yet; resize will call again
    const k = Math.min((vw * 0.96) / FRAME.w, (vh * 0.8) / FRAME.h);
    view.k = k;
    view.ox = vw / 2 - FRAME.cx * k;
    view.oy = vh / 2 - FRAME.cy * k;
    view.l = -view.ox / k;
    view.t = -view.oy / k;
    view.r = (vw - view.ox) / k;
    view.b = (vh - view.oy) / k;
    word.setAttribute('viewBox', `${view.l} ${view.t} ${vw / k} ${vh / k}`);
    for (const leaf of leaves) leaf.resize();
  }

  // ---- letters ----
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const FONT = '700 100px Montserrat, "Helvetica Neue", Arial, sans-serif';

  const letters = LETTERS.map((L) => {
    const g = document.createElementNS(SVG_NS, 'g');
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = L.ch;
    g.appendChild(text);
    word.appendChild(g);
    return { ...L, g, text, sx: 1, inkCx: 0, ang: 0, av: 0, dy: 0, vy: 0, kickAt: -1, kick: 0 };
  });

  // Size each glyph so its ink matches the reference: cap height and width.
  function measureLetters() {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = FONT;
    const cap = ctx.measureText('H').actualBoundingBoxAscent / 100;
    const size = CAP_HEIGHT / cap;
    for (const L of letters) {
      const m = ctx.measureText(L.ch);
      const left = -m.actualBoundingBoxLeft * size / 100;
      const right = m.actualBoundingBoxRight * size / 100;
      L.text.setAttribute('font-size', size);
      L.sx = L.w / (right - left);
      L.inkCx = (left + right) / 2;
      renderLetter(L);
    }
  }

  function renderLetter(L) {
    // rock around the foot of the letter, squeeze to the reference width
    L.g.setAttribute('transform',
      `translate(${L.x} ${L.base + L.dy}) rotate(${L.ang}) scale(${L.sx} 1) translate(${-L.inkCx} 0)`);
  }

  function updateLetter(L, dt, now) {
    if (L.kickAt >= 0 && now >= L.kickAt) {
      L.av += L.kick;
      L.vy -= rand(12, 26);
      L.kickAt = -1;
    }
    L.av += (-120 * L.ang - 7 * L.av) * dt;
    L.ang += L.av * dt;
    L.vy += (-180 * L.dy - 10 * L.vy) * dt;
    L.dy += L.vy * dt;
    renderLetter(L);
  }

  // ---- leaves ----
  class Leaf {
    constructor([id, x, y, len, dir, layer]) {
      const sprite = SPRITES[id];
      const long = Math.max(sprite.w, sprite.h);
      this.id = id;
      this.len = len;
      this.tip = sprite.tip;
      this.layer = layer;
      this.w = (sprite.w * len) / long;
      this.h = (sprite.h * len) / long;
      this.home = { x, y, rot: dir - sprite.tip };

      this.el = document.createElement('div');
      this.el.className = 'leaf';
      for (const face of ['front', 'back']) {
        const img = new Image();
        img.src = sprite.src;
        img.alt = '';
        img.draggable = false;
        if (face === 'back') img.className = 'back';
        this.el.appendChild(img);
      }
      (layer === 'f' ? frontLayer : backLayer).appendChild(this.el);

      this.seed = Math.random() * 1000;
      this.x = x;
      this.y = y;
      this.rot = this.home.rot;
      this.vx = 0;
      this.vy = 0;
      this.vr = 0;
      this.spin = 0;          // accumulated rotateY tumble
      this.spinV = 0;
      this.flutter = Math.random() * TAU;
      this.amp = 6;           // 3D flutter amplitude, degrees
      this.depth = 1;         // scale: >1 reads as closer to the viewer
      this.depthTarget = 1;
      this.mode = 'rest';
      this.landedAt = -10;
      this.lean = { x: 0, y: 0, r: 0 };
      this.launchAt = -1;
      this.gx = 0;
      this.gy = 0;
      this.flewAt = -10;
      this.ampTarget = 6;
    }

    resize() {
      this.el.style.width = `${this.w * view.k}px`;
      this.el.style.height = `${this.h * view.k}px`;
    }

    // A gust reaches this leaf at time `at` and throws it along `angle`.
    blow(at, angle, speed) {
      this.launchAt = at;
      this.gx = Math.cos(angle);
      this.gy = Math.sin(angle);
      this.launchSpeed = speed;
    }

    launch(now) {
      this.launchAt = -1;
      this.mode = 'fly';
      this.flewAt = now;
      this.vx += this.gx * this.launchSpeed;
      this.vy += this.gy * this.launchSpeed - rand(40, 120);
      this.vr = rand(140, 420) * (Math.random() < 0.5 ? -1 : 1);
      this.spinV = Math.random() < 0.45 ? rand(360, 900) * (Math.random() < 0.5 ? -1 : 1) : 0;
      this.depthTarget = 1 + rand(0, 0.3);
      this.ampTarget = rand(40, 65);
    }

    // Start flying home along a swooping curve.
    recall(now, delay) {
      if (this.mode === 'rest') return;
      this.mode = 'queued';
      this.returnAt = now + delay;
    }

    beginReturn(now) {
      this.mode = 'return';
      this.r0 = now;
      this.dur = rand(1.9, 2.7);
      const p0 = { x: this.x, y: this.y };
      const p3 = { x: this.home.x, y: this.home.y };
      const dx = p3.x - p0.x;
      const dy = p3.y - p0.y;
      const side = rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1);
      const nx = -dy * side;
      const ny = dx * side;
      this.path = [
        p0,
        { x: p0.x + dx * 0.3 + nx + this.vx * 0.3, y: p0.y + dy * 0.3 + ny + this.vy * 0.3 },
        { x: p3.x - dx * 0.2 + nx * 0.6, y: p3.y - dy * 0.2 + ny * 0.6 - 30 },
        p3,
      ];
      this.rot0 = this.rot;
      const turns = Math.round(rand(-1, 1));
      this.rotDelta = wrap180(this.home.rot - this.rot) + turns * 360;
      this.spin0 = this.spin;
      const dirn = this.spinV !== 0 ? Math.sign(this.spinV) : Math.sign(this.spin) || 1;
      const flips = this.spinV !== 0 ? 1 : 0;
      this.spinEnd = (dirn > 0 ? Math.ceil(this.spin / 360) + flips : Math.floor(this.spin / 360) - flips) * 360;
      this.amp0 = this.amp;
      this.depth0 = this.depth;
    }

    update(dt, now, pointer) {
      if (this.launchAt >= 0 && now >= this.launchAt) this.launch(now);
      if (this.mode === 'queued' && now >= this.returnAt) this.beginReturn(now);

      const px = this.x;
      const py = this.y;

      if (this.mode === 'fly' || this.mode === 'queued') {
        this.fly(dt, now);
      } else if (this.mode === 'return') {
        this.glideHome(now);
      } else {
        this.rest(dt, now, pointer);
      }

      if (this.mode === 'return' || this.mode === 'rest') {
        this.vx = (this.x - px) / dt;
        this.vy = (this.y - py) / dt;
      }
      this.render();
    }

    fly(dt, now) {
      const age = now - this.flewAt;
      const s = this.seed;
      // swirling wind field + a gust that keeps pushing outward for a moment
      const nx = Math.sin(this.y * 0.013 + now * 1.7 + s) + Math.sin(this.x * 0.009 - now * 1.1 + s * 2);
      const ny = Math.cos(this.x * 0.012 + now * 1.3 + s * 3) + Math.sin(this.y * 0.008 + now * 0.9 - s);
      const push = 260 * Math.exp(-age / 0.9) * (this.launchSpeed / 600);
      const swirl = 150 * (0.35 + 0.65 * Math.exp(-age / 1.2));
      this.vx += (nx * swirl + this.gx * push) * dt;
      this.vy += (ny * swirl + this.gy * push + 55) * dt;
      const drag = Math.exp(-1.15 * dt);
      this.vx *= drag;
      this.vy *= drag;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      this.vr *= Math.exp(-0.5 * dt);
      this.rot += (this.vr + nx * 25) * dt;
      this.spinV *= Math.exp(-0.3 * dt);
      this.spin += this.spinV * dt;

      const speed = Math.hypot(this.vx, this.vy);
      this.flutter += dt * (2.2 + speed * 0.012);
      this.amp = lerp(this.amp, this.ampTarget, 1 - Math.exp(-3 * dt));
      this.depth = lerp(this.depth, this.depthTarget, 1 - Math.exp(-2 * dt));

      // leaves that leave the screen wait just past the edge
      const m = this.len * 0.8 + 30;
      if (this.x < view.l - m || this.x > view.r + m || this.y < view.t - m || this.y > view.b + m) {
        this.x = Math.min(view.r + m, Math.max(view.l - m, this.x));
        this.y = Math.min(view.b + m, Math.max(view.t - m, this.y));
        this.vx = 0;
        this.vy = 0;
      }
    }

    glideHome(now) {
      const u = clamp01((now - this.r0) / this.dur);
      const t = easeInOutSine(u);
      const [a, b, c, d] = this.path;
      const it = 1 - t;
      this.x = it * it * it * a.x + 3 * it * it * t * b.x + 3 * it * t * t * c.x + t * t * t * d.x;
      this.y = it * it * it * a.y + 3 * it * it * t * b.y + 3 * it * t * t * c.y + t * t * t * d.y;
      this.rot = this.rot0 + this.rotDelta * t;
      this.spin = lerp(this.spin0, this.spinEnd, t);
      this.amp = this.amp0 * (1 - t) * (1 - t);
      this.depth = lerp(this.depth0, 1, t);
      this.flutter += 0.05;
      if (u >= 1) this.land(now);
    }

    land(now) {
      this.mode = 'rest';
      this.landedAt = now;
      this.spin = 0;
      this.spinV = 0;
      this.depthTarget = 1;
      this.wobble = rand(4, 8) * (Math.random() < 0.5 ? -1 : 1);
      onLanded(this);
    }

    rest(dt, now, pointer) {
      const since = now - this.landedAt;
      const calm = clamp01(since / 1.2);              // breeze sway fades in after landing
      const settle = Math.exp(-since / 0.35) * Math.sin(since * 14);

      // lean away from a nearby pointer
      let tx = 0, ty = 0, tr = 0;
      if (pointer.active) {
        const dx = this.home.x - pointer.x;
        const dy = this.home.y - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = Math.max(0, 1 - d / 110);
        tx = (dx / d) * f * 10;
        ty = (dy / d) * f * 10;
        tr = f * 9 * (dx > 0 ? 1 : -1);
      }
      const e = 1 - Math.exp(-8 * dt);
      this.lean.x = lerp(this.lean.x, tx, e);
      this.lean.y = lerp(this.lean.y, ty, e);
      this.lean.r = lerp(this.lean.r, tr, e);

      const s = this.seed;
      this.x = this.home.x + Math.sin(now * 0.7 + s) * 0.8 * calm + this.lean.x;
      this.y = this.home.y + Math.cos(now * 0.6 + s) * 0.6 * calm + this.lean.y;
      this.rot = this.home.rot + Math.sin(now * 0.9 + s) * 1.8 * calm + (this.wobble || 0) * settle + this.lean.r;
      this.flutter += dt * 1.1;
      this.amp = lerp(this.amp, 6 * calm, 1 - Math.exp(-3 * dt));
      this.depth = 1 + Math.exp(-since / 0.18) * 0.06 * Math.cos(since * 16);
    }

    render() {
      const k = view.k;
      const sx = view.ox + this.x * k - (this.w * k) / 2;
      const sy = view.oy + this.y * k - (this.h * k) / 2;
      const rx = Math.sin(this.flutter) * this.amp;
      const ry = Math.cos(this.flutter * 0.8 + this.seed) * this.amp * 0.7 + this.spin;
      const p = Math.max(this.w, this.h) * k * 4;
      this.el.style.transform =
        `translate3d(${sx}px,${sy}px,0) rotate(${this.rot}deg) perspective(${p}px) ` +
        `rotateX(${rx}deg) rotateY(${ry}deg) scale(${this.depth})`;
    }
  }

  const leaves = LAYOUT.map((row) => new Leaf(row));

  // ---- choreography ----
  let simT = 0;
  let phase = 'rest';   // rest → out → in → rest
  let phaseAt = 0;
  const pointer = { x: 0, y: 0, active: false };

  function gust(origin) {
    phase = 'out';
    phaseAt = simT;
    if (reduceMotion) {
      for (const leaf of leaves) leaf.el.style.opacity = 0;
      return;
    }
    for (const leaf of leaves) {
      const dx = leaf.x - origin.x;
      const dy = leaf.y - origin.y;
      const d = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx) + rand(-0.45, 0.45);
      // most leaves are thrown off screen; a few stay and drift in the breeze
      const speed = Math.random() < 0.3 ? rand(160, 300) : rand(440, 820);
      leaf.blow(simT + d / WIND_SPEED + rand(0, 0.08), angle, speed);
    }
    for (const L of letters) {
      const dx = L.x - origin.x;
      const dy = L.base - CAP_HEIGHT / 2 - origin.y;
      L.kickAt = simT + Math.hypot(dx, dy) / WIND_SPEED;
      L.kick = (dx >= 0 ? 1 : -1) * rand(40, 65);
    }
  }

  function gather() {
    phase = 'in';
    phaseAt = simT;
    if (reduceMotion) {
      for (const leaf of leaves) leaf.el.style.opacity = 1;
      return;
    }
    for (const leaf of leaves) {
      leaf.launchAt = -1;
      // leaves behind the word come home first so the ones on top land last
      leaf.recall(simT, rand(0, 0.6) + (leaf.layer === 'f' ? 0.6 : 0));
    }
  }

  // A leaf landing on a letter gives it a small nudge.
  function onLanded(leaf) {
    for (const L of letters) {
      const cy = L.base - CAP_HEIGHT / 2;
      if (Math.abs(leaf.home.x - L.x) < L.w * 0.7 && Math.abs(leaf.home.y - cy) < CAP_HEIGHT * 0.9) {
        L.vy += leaf.layer === 'f' ? 22 : 10;
        L.av += rand(-10, 10);
      }
    }
  }

  function autoOrigin() {
    return { x: FRAME.cx + rand(-60, 60), y: 300 + rand(-30, 40) };
  }

  function tick(dt) {
    simT += dt;
    if (phase === 'rest' && simT - phaseAt > REST_TIME) gust(autoOrigin());
    else if (phase === 'out' && simT - phaseAt > OUT_TIME) gather();
    else if (phase === 'in' && (reduceMotion ? simT - phaseAt > 1.2 : leaves.every((l) => l.mode === 'rest'))) {
      phase = 'rest';
      phaseAt = simT;
    }
    for (const leaf of leaves) leaf.update(dt, simT, pointer);
    for (const L of letters) updateLetter(L, dt, simT);
  }

  let last = performance.now();
  function frame(ms) {
    const dt = Math.min(1 / 30, Math.max(1 / 240, (ms - last) / 1000));
    last = ms;
    tick(dt);
    requestAnimationFrame(frame);
  }

  // ---- input ----
  const toStage = (cx, cy) => ({ x: (cx - view.ox) / view.k, y: (cy - view.oy) / view.k });

  addEventListener('pointerdown', (e) => {
    const p = toStage(e.clientX, e.clientY);
    if (phase === 'out') {
      if (simT - phaseAt > 0.5) gather();
    } else {
      gust(p);
    }
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    Object.assign(pointer, toStage(e.clientX, e.clientY), { active: true });
  });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (phase === 'out') gather();
    else gust(autoOrigin());
  });
  addEventListener('resize', fit);

  // ---- start ----
  fit();
  measureLetters();
  document.fonts.load(FONT).then(measureLetters, () => {});

  window.AUTUMN = { leaves, gust, gather, tick, autoOrigin, get phase() { return phase; } };
  requestAnimationFrame(frame);
})();
