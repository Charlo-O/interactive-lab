import * as THREE from '../assets/vendor/three/three.module.js';
import { createRendering } from './core/rendering.js';
import { createModelBuilders, MODEL_IDS } from './models/index.js';
import { createPaperTexture, drawPaperDecoration } from './core/paper.js';
import { createAnnotations } from './core/annotations.js';

const $ = (id) => document.getElementById(id);
const cv = $('gl'),
  ov = $('ov');
const DPR = Math.min(2, window.devicePixelRatio || 1);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 纸纹 ----------
createPaperTexture($('grain'));

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const { renderer, scene, camera, clip, U, hatchMat, lineMat } = createRendering(cv, DPR);
let W = 0,
  H = 0;
function theme() {
  const cs = getComputedStyle(document.documentElement);
  U.paper.value.set(cs.getPropertyValue('--paper').trim());
  U.ink.value.set(cs.getPropertyValue('--ink').trim());
  U.red.value.set(cs.getPropertyValue('--red').trim());
  renderer.setClearColor(U.paper.value);
}
theme();
let M = null;
const models = {},
  builders = createModelBuilders({ hatchMat, lineMat });
let cam = { th: 0.8, ph: 1.26, dist: 220 },
  goal = null;
const tgt = V(0, 30, 0);
let auto = !reduce,
  boil = !reduce,
  note = true;
const ptr = new Map();
let pinch0 = 0;
const panOff = V(0, 0, 0);
let panMode = false,
  mid0 = null,
  dragging = false,
  rotV = 0,
  dragV = 0,
  lastMT = 0;
function pan(dx, dy) {
  const k = (0.536 * cam.dist) / Math.max(1, H),
    m = camera.matrixWorld.elements;
  panOff.x += (-dx * m[0] + dy * m[4]) * k;
  panOff.y += (-dx * m[1] + dy * m[5]) * k;
  panOff.z += (-dx * m[2] + dy * m[6]) * k;
  goal = null;
}
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  if (e.button === 1) e.preventDefault();
  if (ptr.size === 0) panMode = e.button === 1 || e.button === 2 || e.shiftKey;
  dragging = true;
  dragV = 0;
  lastMT = e.timeStamp;
  cv.setPointerCapture(e.pointerId);
  ptr.set(e.pointerId, [e.clientX, e.clientY]);
  goal = null;
  if (ptr.size === 2) {
    const [a, b] = [...ptr.values()];
    pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptr.has(e.pointerId)) return;
  const p = ptr.get(e.pointerId),
    dx = e.clientX - p[0],
    dy = e.clientY - p[1];
  ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptr.size === 1 && panMode) pan(dx, dy);
  else if (ptr.size === 1) {
    cam.th -= dx * 0.006;
    {
      const dtm = Math.max(8, e.timeStamp - lastMT) / 1000;
      lastMT = e.timeStamp;
      dragV = dragV * 0.6 + ((-dx * 0.006) / dtm) * 0.4;
    }
    cam.ph = Math.min(1.58, Math.max(0.25, cam.ph - dy * 0.005));
  } else if (ptr.size === 2) {
    const [a, b] = [...ptr.values()],
      d = Math.hypot(a[0] - b[0], a[1] - b[1]),
      mx = (a[0] + b[0]) / 2,
      my = (a[1] + b[1]) / 2;
    if (mid0) pan((mx - mid0[0]) / 2, (my - mid0[1]) / 2);
    mid0 = [mx, my];
    if (pinch0 && d > 0) {
      cam.dist = Math.min(460, Math.max(9, (cam.dist * pinch0) / d));
    }
    pinch0 = d;
  }
});
const up = (e) => {
  ptr.delete(e.pointerId);
  pinch0 = 0;
  mid0 = null;
  if (ptr.size === 0) {
    dragging = false;
    rotV = panMode || e.timeStamp - lastMT > 90 ? 0 : Math.max(-2.5, Math.min(2.5, dragV));
  }
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cam.dist = Math.min(460, Math.max(9, cam.dist * (1 + Math.sign(e.deltaY) * 0.08)));
  },
  { passive: false },
);
function toggle(id, get, set) {
  const b = $(id);
  b.onclick = () => {
    set(!get());
    b.setAttribute('aria-pressed', get());
  };
  b.setAttribute('aria-pressed', get());
}
let washOn = true,
  washAmt = reduce ? 1 : 0,
  washRise = reduce ? 1 : 0;
toggle(
  'bWash',
  () => washOn,
  (v) => {
    washOn = v;
    $('bWash').textContent = v ? '去掉着色' : '着色';
  },
);
$('bWash').textContent = '去掉着色';
toggle(
  'bAuto',
  () => auto,
  (v) => (auto = v),
);
toggle(
  'bBoil',
  () => boil,
  (v) => (boil = v),
);
toggle(
  'bNote',
  () => note,
  (v) => (note = v),
);
let prog = 0,
  playing = !reduce;
const pr = $('prog');
pr.oninput = () => {
  playing = false;
  prog = pr.value / 1000;
};
const rdP = $('rdProg');
$('bBuild').onclick = () => {
  prog = 0;
  playing = true;
  washRise = 0;
};
const cut = $('cut');
let cutV = 0;
const setCut = (v) => {
  cutV = v;
  clip.constant = M.clipMax - (v / 100) * M.clipMax;
  cut.value = v;
  cut.style.setProperty('--p', v / 100);
  $('rdCut').innerHTML = v ? `剖切<i>${String(Math.round(v)).padStart(3, '0')}%</i>` : '未剖切';
};
cut.oninput = () => setCut(+cut.value);
$('bSect').onclick = () => {
  setCut(100);
  goal = { ...M.sect };
};
{
  const bD = $('bDark'),
    root = document.documentElement,
    isDark = () =>
      root.dataset.theme
        ? root.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    const t = localStorage.getItem('kigumi-theme');
    if (t === 'light' || t === 'dark') root.dataset.theme = t;
  } catch {
    // 隐私模式可能禁止访问 localStorage，仍可使用当前会话的主题。
  }
  const sync = () => {
    bD.setAttribute('aria-pressed', isDark());
    theme();
    if (W) drawDeco();
  };
  bD.onclick = () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try {
      localStorage.setItem('kigumi-theme', root.dataset.theme);
    } catch {
      // 主题持久化是可选功能。
    }
    sync();
  };
  sync();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
}
$('bReset').onclick = () => {
  panOff.set(0, 0, 0);
  setCut(0);
  goal = { ...M.HOME };
};
const annotations = createAnnotations(ov, DPR);
function select(id) {
  if (!MODEL_IDS.includes(id)) id = MODEL_IDS[0];
  if (M) M.group.visible = false;
  if (!models[id]) {
    models[id] = builders[id]();
    scene.add(models[id].group);
  }
  M = models[id];
  M.group.visible = true;
  clip.normal.copy(M.clipN);
  setCut(0);
  pr.max = Math.round(M.PMAX * 1000);
  prog = reduce ? M.PMAX : 0;
  pr.value = Math.round(prog * 1000);
  playing = !reduce;
  washRise = reduce ? 1 : 0;
  annotations.reset();
  panOff.set(0, 0, 0);
  cam = { ...M.HOME };
  goal = null;
  tgt.copy(M.tgt(prog, 0));
  $('big').textContent = M.big;
  $('big').style.top = M.bigTop || '';
  $('tbName').textContent = M.name;
  ['tbD1', 'tbD2', 'tbD3'].forEach((k, i) => ($(k).textContent = M.dd[i]));
  document.title = M.name + ' 立体构造图 — 中国古建筑';
  document
    .querySelectorAll('.sw button')
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === id));
  try {
    history.replaceState(null, '', '#' + id);
  } catch {
    // 受限的嵌入环境可能不允许修改地址，模型切换仍可工作。
  }
}
document.querySelectorAll('.sw button').forEach(
  (b) =>
    (b.onclick = () => {
      if (M !== models[b.dataset.m]) select(b.dataset.m);
    }),
);

// ---------- 纸面作图痕迹 ----------
const drawDeco = () => drawPaperDecoration($('deco'), W, H, DPR);

// ---------- 主循环 ----------
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setSize(W, H, false);
  ov.width = W * DPR;
  ov.height = H * DPR;
  camera.aspect = W / H;
  camera.fov = W < H ? 44 : 30;
  camera.updateProjectionMatrix();
  drawDeco();
}
addEventListener('resize', resize);
addEventListener('hashchange', () => select(location.hash.slice(1)));
select(location.hash.slice(1));
resize();
let last = performance.now();
function loop(now) {
  // 首个 RAF 的时间戳可能早于模块初始化时刻，不能让施工进度变为负数。
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (goal) {
    const k = 1 - Math.pow(0.02, dt);
    let dth = goal.th - cam.th;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    cam.th += dth * k;
    cam.ph += (goal.ph - cam.ph) * k;
    cam.dist += (goal.dist - cam.dist) * k;
    if (Math.abs(dth) < 0.002 && Math.abs(goal.dist - cam.dist) < 0.3) goal = null;
  } else {
    const tv = auto && !dragging ? 0.14 : 0;
    if (dragging) rotV = 0;
    else {
      rotV += (tv - rotV) * (1 - Math.pow(0.3, dt));
      cam.th += rotV * dt;
    }
  }
  camera.position.set(
    tgt.x + cam.dist * Math.sin(cam.ph) * Math.sin(cam.th),
    tgt.y + cam.dist * Math.cos(cam.ph),
    tgt.z + cam.dist * Math.sin(cam.ph) * Math.cos(cam.th),
  );
  camera.lookAt(tgt);
  if (playing) {
    prog = Math.min(M.PMAX, prog + dt / M.BUILD_S);
    if (prog >= M.PMAX) playing = false;
    pr.value = Math.round(prog * 1000);
  }
  {
    const pct = (prog / M.PMAX) * 100;
    pr.style.setProperty('--p', pct / 100);
    const gy = U.grow.value;
    let st = '开工';
    if (prog >= M.PMAX) st = washOn && washRise < 1 ? '上色' : '竣工';
    else if (prog > 0.003) st = M.stage(prog, gy);
    const h = `${st}<i>${String(Math.round(pct)).padStart(3, '0')}%</i>`;
    if (rdP.innerHTML !== h) rdP.innerHTML = h;
  }
  const pb = Math.min(prog, 1);
  U.prog.value = pb;
  U.grow.value =
    pb >= 0.999
      ? 999
      : M.KEYS[Math.min(M.KEYS.length - 1, Math.floor((pb / 0.965) * (M.KEYS.length - 1)))] + 5;
  const hp = Math.min(1, Math.max(0, (prog - 1) / 0.2));
  U.hang.value =
    prog < 1 ? 999 : M.SH_T + 1.5 - (M.SH_T + 1.5 - M.SH_B + 0.02) * (1 - (1 - hp) * (1 - hp));
  U.shinCol.value.copy(U.red.value).lerp(U.ink.value, Math.min(1, Math.max(0, (prog - 1.2) / 0.1)));
  if (M.update) M.update(dt);
  tgt.copy(M.tgt(prog, cutV)).add(panOff);
  if (prog < 1) washRise = 0;
  else if (washOn) washRise = Math.min(1, washRise + dt / 3);
  washAmt += ((washOn ? 1 : 0) - washAmt) * Math.min(1, dt * 3);
  U.wash.value = washAmt;
  U.lineK.value = 1 - 0.55 * washAmt;
  U.washY.value = washRise >= 1 ? 999 : -6 + washRise * (M.topY + 34);
  if (boil) U.boil.value = Math.floor(now / 170) % 64;
  renderer.render(scene, camera);
  annotations.draw(W, H, M, { note, prog, cutV, clip, camera, U });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
