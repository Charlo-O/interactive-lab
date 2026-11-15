import { animate, clamp, ease, easeInOutSine, easeOutCubic, reducedMotion, tween, wait } from './anim';
import { PaperSound } from './sound';

type State = 'intro' | 'sealed' | 'tearing' | 'opening' | 'open' | 'turning' | 'closing' | 'closed';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const stage = $('#stage');
const scene = $('#scene');
const envBack = $('#envBack');
const envFront = $('#envFront');
const strip = $('#strip');
const letter = $('#letter');
const fold = $('#fold');
const stack = $('#stack');
const hint = $('#hint');
const soundBtn = $<HTMLButtonElement>('#sound');
const closeBtn = $<HTMLButtonElement>('#closeBtn');
const prevBtn = $<HTMLButtonElement>('#prevBtn');
const nextBtn = $<HTMLButtonElement>('#nextBtn');
const sheets = [...stack.querySelectorAll<HTMLElement>('.sheet')];
const panel = { top: $('#panelTop'), mid: $('#panelMid'), bottom: $('#panelBottom') };
const envParts = [envBack, envFront];

const sound = new PaperSound();
let state: State = 'intro';
let current = 0;

const setState = (s: State) => {
  state = s;
  stage.dataset.state = s;
};

/* ───────────── Geometry ───────────── */

const cssPx = (name: string, fallback: number) =>
  parseFloat(getComputedStyle(stage).getPropertyValue(name)) || fallback;

function geo() {
  const ew = envFront.offsetWidth;
  const eh = envFront.offsetHeight;
  const lw = letter.offsetWidth;
  const lh = letter.offsetHeight;
  const third = lh / 3;
  // Folded letter must sit inside the envelope with a little air on each side.
  const s = Math.min((ew * 0.88) / lw, (eh - 22) / third);
  const foldH = third * s;
  const envY = cssPx('--ey', -26);
  const envTop = envY - eh / 2;
  return {
    s,
    envY,
    yIn: envTop + 7 + foldH / 2, // tucked inside, top edge peeking above the torn front
    yRise: envTop - foldH / 2 - 12, // fully clear of the envelope
    yOpen: cssPx('--ly', -6),
    yDrop: envY + window.innerHeight * 0.62,
  };
}

/* ───────────── Tri-fold ───────────── */

const Z = { top: 2.4, bottom: 1.2 };
const panelTransform = (deg: number, zMax: number) =>
  `translateZ(${((Math.abs(deg) / 180) * zMax).toFixed(2)}px) rotateX(${deg}deg)`;

function setFolded(folded: boolean) {
  panel.top.style.transform = panelTransform(folded ? -180 : 0, Z.top);
  panel.bottom.style.transform = panelTransform(folded ? 180 : 0, Z.bottom);
}

function foldPanel(el: HTMLElement, from: number, to: number, zMax: number, duration: number) {
  const opening = Math.abs(to) < Math.abs(from);
  const front = el.querySelector('.face-front .shade')!;
  const back = el.querySelector('.face-back .shade')!;
  // Light falls off as a panel turns edge-on, then recovers once it lies flat.
  const frontShade = opening ? [0.42, 0.42, 0] : [0, 0.42, 0.42];
  const backShade = opening ? [0, 0.34, 0.34] : [0.34, 0.34, 0];
  const opts = { duration, easing: ease.fold };
  const offsets = [0, 0.5, 1];
  return Promise.all([
    animate(el, [{ transform: panelTransform(from, zMax) }, { transform: panelTransform(to, zMax) }], opts),
    animate(front, frontShade.map((o, i) => ({ opacity: o, offset: offsets[i] })), opts),
    animate(back, backShade.map((o, i) => ({ opacity: o, offset: offsets[i] })), opts),
  ]);
}

/** Copy the current sheet into the three fold panels. */
function loadFold(index: number) {
  const source = sheets[index];
  const scroll = source.querySelector('.sheet-body')?.scrollTop ?? 0;
  fold.querySelectorAll<HTMLElement>('.page-clone').forEach((clone) => {
    clone.innerHTML = source.innerHTML;
    const body = clone.querySelector<HTMLElement>('.sheet-body');
    if (body) body.scrollTop = scroll;
  });
}

/* ───────────── Stack ───────────── */

const depthOf = (i: number) => (i - current + sheets.length) % sheets.length;
const pose = (d: number) => ({ translate: `${d * 7}px ${d * 5}px`, rotate: `${d * 0.9}deg` });

function layoutStack() {
  sheets.forEach((sheet, i) => {
    const d = depthOf(i);
    sheet.style.zIndex = String(sheets.length - d);
    Object.assign(sheet.style, pose(d));
    sheet.inert = d !== 0;
  });
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === sheets.length - 1;
}

function sweep(sheet: HTMLElement) {
  sheet.classList.remove('sweep');
  void sheet.offsetWidth;
  sheet.classList.add('sweep');
}

async function revealStack() {
  sheets.forEach((sheet) => Object.assign(sheet.style, pose(0)));
  layoutStackOrderOnly();
  letter.dataset.mode = 'stack';
  sweep(sheets[current]);
  stage.classList.add('ui-on');
  await Promise.all(
    sheets.map((sheet, i) =>
      animate(sheet, [pose(depthOf(i))], { duration: 700, easing: ease.out, delay: depthOf(i) * 70 }),
    ),
  );
  layoutStack();
}

function layoutStackOrderOnly() {
  sheets.forEach((sheet, i) => (sheet.style.zIndex = String(sheets.length - depthOf(i))));
}

async function collapseStack() {
  await Promise.all(sheets.map((sheet) => animate(sheet, [pose(0)], { duration: 320, easing: ease.inOut })));
}

async function go(dir: 1 | -1) {
  const target = current + dir;
  if (state !== 'open' || target < 0 || target >= sheets.length) return;
  setState('turning');
  sound.unlock();
  sound.page();

  const lw = letter.offsetWidth;
  const out = { translate: `${Math.round(lw * 0.64)}px ${Math.round(-lw * 0.035)}px`, rotate: '7deg' };
  const last = sheets.length - 1;

  if (dir === 1) {
    // Top card slides out to the right, then tucks in at the back.
    const leaving = sheets[current];
    current = target;
    sheets.forEach((sheet, i) => {
      if (sheet !== leaving) animate(sheet, [pose(depthOf(i))], { duration: 560, easing: ease.out, delay: 120 });
    });
    sweep(sheets[current]);
    await animate(leaving, [out], { duration: 360, easing: ease.inOut });
    leaving.style.zIndex = '0';
    await animate(leaving, [pose(last)], { duration: 480, easing: ease.out });
  } else {
    // The card at the back slides out from under the stack and lands on top.
    const arriving = sheets[target];
    current = target;
    await animate(arriving, [out], { duration: 360, easing: ease.inOut });
    arriving.style.zIndex = String(sheets.length + 1);
    sweep(arriving);
    sheets.forEach((sheet, i) => {
      if (sheet !== arriving) animate(sheet, [pose(depthOf(i))], { duration: 480, easing: ease.out });
    });
    await animate(arriving, [pose(0)], { duration: 480, easing: ease.out });
  }

  layoutStack();
  setState('open');
}

/* ───────────── Hint ───────────── */

let hintToken = 0;
async function setHint(text: string | null) {
  const token = ++hintToken;
  if (hint.textContent !== text || text === null) {
    await animate(hint, [{ opacity: 0, translate: '0 -4px' }], { duration: 180, easing: ease.inOut });
  }
  if (token !== hintToken || text === null) return;
  hint.textContent = text;
  hint.style.translate = '0 6px';
  await animate(hint, [{ opacity: 1, translate: '0 0' }], { duration: 420, easing: ease.out });
}

/* ───────────── Letter ↔ envelope ───────────── */

function placeLetterInside() {
  const g = geo();
  letter.style.translate = `0px ${g.yIn}px`;
  letter.style.scale = String(g.s);
}

async function openLetter() {
  if (state !== 'tearing' && state !== 'closed') return;
  setState('opening');
  void setHint('Opening your letter…');
  loadFold(current);
  letter.dataset.mode = 'fold';
  setFolded(true);
  const g = geo();

  // 1 · envelope settles level while the folded letter slides up and out
  sound.slide();
  await Promise.all([
    animate(scene, [{ rotate: '0deg' }], { duration: 800, easing: ease.inOut }),
    animate(letter, [{ translate: `0px ${g.yRise}px` }], { duration: 860, easing: ease.out, delay: 140 }),
  ]);

  // 2 · letter comes forward; envelope falls away; panels unfold
  stage.classList.add('letter-out');
  void setHint(null);
  const drop = envParts.map((el) =>
    animate(el, [{ translate: `0px ${g.yDrop}px`, opacity: 0 }], { duration: 950, easing: ease.in, delay: 60 }),
  );
  const move = animate(letter, [{ translate: `0px ${g.yOpen}px`, scale: '1' }], {
    duration: 1050,
    easing: ease.inOut,
  });
  const unfold = (async () => {
    await wait(360);
    sound.fold();
    const top = foldPanel(panel.top, -180, 0, Z.top, 860);
    await wait(300);
    sound.fold();
    await Promise.all([top, foldPanel(panel.bottom, 180, 0, Z.bottom, 860)]);
  })();
  await Promise.all([...drop, move, unfold]);

  await revealStack();
  setState('open');
}

async function closeLetter() {
  if (state !== 'open') return;
  setState('closing');
  sound.unlock();
  stage.classList.remove('ui-on');
  await collapseStack();

  loadFold(current);
  letter.dataset.mode = 'fold';
  setFolded(false);
  const g = geo();

  sound.fold();
  const bottom = foldPanel(panel.bottom, 0, 180, Z.bottom, 680);
  await wait(300);
  sound.fold();
  const top = foldPanel(panel.top, 0, -180, Z.top, 680);
  await wait(360);

  sound.slide();
  const rise = envParts.map((el) =>
    animate(el, [{ translate: `0px ${g.envY}px`, opacity: 1 }], { duration: 950, easing: ease.out }),
  );
  const shrink = animate(letter, [{ translate: `0px ${g.yRise}px`, scale: String(g.s) }], {
    duration: 980,
    easing: ease.inOut,
  });
  await Promise.all([bottom, top, shrink, ...rise]);

  stage.classList.remove('letter-out');
  await animate(letter, [{ translate: `0px ${g.yIn}px` }], { duration: 720, easing: ease.inOut });
  setState('closed');
  void setHint('Tap to open your letter');
}

/* ───────────── Tear strip ───────────── */

let stripW = 0;
let stripP = 0;

function setP(p: number) {
  stripP = p;
  strip.style.setProperty('--p', `${p.toFixed(2)}px`);
  const t = 1 - p / stripW;
  strip.style.setProperty('--rot', `${(-1 - t * 5.5).toFixed(2)}deg`);
}

function beginTear() {
  setState('tearing');
  stripW = envFront.offsetWidth;
  setP(stripW);
  strip.classList.add('is-tearing');
  sound.tearStart();
  void setHint('Opening your letter…');
}

async function finishTear(from: number) {
  const full = from >= stripW * 0.98;
  await tween(
    (full ? 1150 : 420 + 700 * (from / stripW)),
    (k) => {
      setP(from * (1 - k));
      sound.tearLevel(0.18 + 0.32 * Math.sin(Math.PI * Math.min(1, k * 1.1)));
    },
    full ? easeInOutSine : easeOutCubic,
  );
  sound.tearStop();
  await animate(strip, [{ translate: '-46px 30px', rotate: '-10deg', opacity: 0 }], {
    duration: 520,
    easing: ease.in,
  });
  strip.hidden = true;
  await openLetter();
}

async function springBack() {
  const from = stripP;
  sound.tearStop();
  await tween(380, (k) => setP(from + (stripW - from) * k), easeOutCubic);
  strip.classList.remove('is-tearing');
  strip.style.setProperty('--p', '100%');
  setState('sealed');
  void setHint('Drag to tear the envelope, or tap to open');
}

let drag: { id: number; x: number; y: number; lastX: number; lastT: number; active: boolean } | null = null;

envFront.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (state === 'closed') {
    void openLetter();
    return;
  }
  if (state !== 'sealed' || e.button !== 0) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: e.timeStamp, active: false };
  envFront.setPointerCapture(e.pointerId);
});

envFront.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = drag.x - e.clientX;
  if (!drag.active) {
    if (dx < 8) return;
    drag.active = true;
    beginTear();
  }
  const p = clamp(stripW - dx * 1.08, 0, stripW);
  setP(p);
  const speed = Math.abs(e.clientX - drag.lastX) / Math.max(1, e.timeStamp - drag.lastT);
  sound.tearLevel(speed * 0.4);
  drag.lastX = e.clientX;
  drag.lastT = e.timeStamp;
  if (p <= stripW * 0.04) {
    drag = null;
    void finishTear(p);
  }
});

function endDrag(e: PointerEvent, cancelled = false) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.active) {
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!cancelled && moved < 12) {
      beginTear();
      void finishTear(stripW);
    }
    return;
  }
  if (!cancelled && 1 - stripP / stripW > 0.32) void finishTear(stripP);
  else void springBack();
}
envFront.addEventListener('pointerup', (e) => endDrag(e));
envFront.addEventListener('pointercancel', (e) => endDrag(e, true));

envFront.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  sound.unlock();
  if (state === 'sealed') {
    beginTear();
    void finishTear(stripW);
  } else if (state === 'closed') {
    void openLetter();
  }
});

/* ───────────── Letter controls ───────────── */

closeBtn.addEventListener('click', () => void closeLetter());
prevBtn.addEventListener('click', () => void go(-1));
nextBtn.addEventListener('click', () => void go(1));

document.addEventListener('keydown', (e) => {
  if (state !== 'open') return;
  if (e.key === 'ArrowRight') void go(1);
  else if (e.key === 'ArrowLeft') void go(-1);
  else if (e.key === 'Escape') void closeLetter();
});

let swipe: { x: number; y: number; id: number } | null = null;
stack.addEventListener('pointerdown', (e) => {
  if (state !== 'open' || (e.target as HTMLElement).closest('a, button')) return;
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
stack.addEventListener('pointerup', (e) => {
  if (!swipe || swipe.id !== e.pointerId) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) void go(dx < 0 ? 1 : -1);
});

soundBtn.addEventListener('click', () => {
  sound.enabled = !sound.enabled;
  if (sound.enabled) sound.unlock();
  soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  soundBtn.querySelector('span')!.textContent = sound.enabled ? 'Sound on' : 'Sound off';
});

/* ───────────── Parallax ───────────── */

const pointer = { x: 0, y: 0 };
const tilt = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX / window.innerWidth - 0.5;
  pointer.y = e.clientY / window.innerHeight - 0.5;
});

function parallax() {
  const k = state === 'sealed' || state === 'closed' || state === 'intro' ? 1 : state === 'tearing' ? 0.35 : 0;
  tilt.x += (pointer.x * k - tilt.x) * 0.06;
  tilt.y += (pointer.y * k - tilt.y) * 0.06;
  scene.style.transform = `perspective(1400px) rotateX(${(-tilt.y * 6).toFixed(3)}deg) rotateY(${(tilt.x * 8).toFixed(3)}deg)`;
  requestAnimationFrame(parallax);
}
if (!reducedMotion && window.matchMedia('(hover: hover)').matches) requestAnimationFrame(parallax);

/* ───────────── Boot ───────────── */

window.addEventListener('resize', () => {
  if (state === 'sealed' || state === 'closed' || state === 'intro') placeLetterInside();
});

async function intro() {
  placeLetterInside();
  setFolded(true);
  loadFold(0);
  layoutStack();
  letter.style.opacity = '1';

  await Promise.race([document.fonts?.ready, wait(1200)]);
  scene.style.translate = '0 28px';
  scene.style.rotate = '-7deg';
  await animate(scene, [{ opacity: 1, translate: '0 0', rotate: '-3deg' }], { duration: 1200, easing: ease.out });
  setState('sealed');
  hint.style.translate = '0 6px';
  await animate(hint, [{ opacity: 1, translate: '0 0' }], { duration: 600, easing: ease.out });
}

void intro();
