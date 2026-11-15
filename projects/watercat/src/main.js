import { recording } from './record.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cup, fieldBox, referenceCamera } from './config.js';
import { buildKitten, forelimbReach } from './pose.js';
import { fieldDimensions, fieldFragment, fieldVertex } from './catfield.js';
import { referenceDepthFragment, tracerFragment, tracerVertex } from './tracer.js';
import { blurFragment, displayFragment, encodeFragment, kuwaharaFragment, postVertex, tensorFragment } from './paint.js';
import { drawCatPlate, drawGlassPlate } from './plate.js';
import { CatBehavior } from './behavior.js';
import { GlassFog } from './fog.js';
import { createPerformances, CupRock, Director, PawChase, TearCycle } from './performances.js';
import { Soundscape } from './audio.js';
import { runExport } from './export.js';

const viewport = document.querySelector('#viewport');
const overlay = document.querySelector('#overlay');
const params = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const BASE_FOV = THREE.MathUtils.radToDeg(2 * Math.atan(0.5 * referenceCamera.framePx / referenceCamera.focalPx));
const BASE_TARGET = new THREE.Vector3(...referenceCamera.target);
const BASE_POSITION = new THREE.Vector3(...referenceCamera.position);
const BASE_DISTANCE = BASE_POSITION.distanceTo(BASE_TARGET);

// Stars sit on the lip of the glass, where the key light glints.
const STAR_RIM = { azimuth: -0.523, radius: 4.47, height: 8.34 };
const STAR_WALL = { azimuth: -0.646, radius: 4.262, height: 6.35 };

function bakeField(renderer, kitten) {
  const [nx, ny, nz] = fieldDimensions();
  const target = new THREE.WebGL3DRenderTarget(nx, ny, nz, {
    format: THREE.RGFormat, type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false
  });
  const size = fieldBox.max.map((value, i) => value - fieldBox.min[i]);
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: fieldVertex,
    fragmentShader: fieldFragment(kitten),
    uniforms: {
      uSlice: { value: 0 },
      uMin: { value: new THREE.Vector3(...fieldBox.min) },
      uSize: { value: new THREE.Vector3(...size) }
    },
    depthTest: false,
    depthWrite: false
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.Camera();
  for (let k = 0; k < nz; k++) {
    material.uniforms.uSlice.value = (k + 0.5) / nz;
    renderer.setRenderTarget(target, k);
    renderer.render(scene, camera);
  }
  renderer.setRenderTarget(null);
  target.volumeCC = measureVolume(renderer, material, scene, camera);
  return target;
}

// Depth of the resting cat as the painter saw it, one texel per painted pixel or
// so. The tracer uses it to keep painted shading on the surface it was painted on.
function bakeReferenceDepth(renderer, field) {
  const target = new THREE.WebGLRenderTarget(1024, 1024, {
    format: THREE.RedFormat, type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false
  });
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: tracerVertex,
    fragmentShader: referenceDepthFragment,
    uniforms: { uCat: { value: field.texture } },
    depthTest: false,
    depthWrite: false
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  renderer.setRenderTarget(target);
  renderer.render(scene, new THREE.Camera());
  renderer.setRenderTarget(null);
  material.dispose();
  quad.geometry.dispose();
  return target;
}

// Integrates the field on a coarse grid to compare the model with a real kitten's mass.
function measureVolume(renderer, material, scene, camera) {
  const n = 128;
  const target = new THREE.WebGLRenderTarget(n, n, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });
  const size = fieldBox.max.map((value, i) => value - fieldBox.min[i]);
  const cell = size[0] / n * size[1] / n * size[2] / n;
  const buffer = new Float32Array(n * n * 4);
  let inside = 0;
  for (let k = 0; k < n; k++) {
    material.uniforms.uSlice.value = (k + 0.5) / n;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, n, n, buffer);
    for (let i = 0; i < n * n; i++) if (buffer[i * 4] < 0) inside++;
  }
  renderer.setRenderTarget(null);
  target.dispose();
  return inside * cell;
}

function fullscreen(fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: postVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { material, scene };
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.premultiplyAlpha = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

async function start() {
  const dev = params.has('dev');
  // ?export renders the video frames (see export.js) instead of running live.
  const exporting = params.has('export');
  // ?dev=1 steps by hand for repeatable frames; ?dev=live keeps the normal loop.
  const manual = (dev && params.get('dev') !== 'live') || exporting;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: dev || exporting, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', '玻璃杯里的小水猫，可拖动旋转');
  viewport.prepend(renderer.domElement);

  const kitten = buildKitten();
  const field = bakeField(renderer, kitten);
  if (dev) {
    console.table(kitten.report.map(({ name, angle, range, ok }) => ({ name, angle: +angle.toFixed(1), range: range.join('-'), ok })));
    console.log('spine', kitten.spineLength.toFixed(2), 'cm; volume', field.volumeCC.toFixed(0), 'ml');
  }

  const glassPlate = canvasTexture(drawGlassPlate());
  const catPlate = canvasTexture(drawCatPlate());
  const referenceDepth = bakeReferenceDepth(renderer, field);

  const uniforms = {
    uCat: { value: field.texture },
    uCam: { value: new THREE.Vector3() },
    uRight: { value: new THREE.Vector3() },
    uUp: { value: new THREE.Vector3() },
    uForward: { value: new THREE.Vector3() },
    uFocal: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMode: { value: params.get('mode') === 'clay' ? 1 : 0 },
    uBreath: { value: 0 },
    uBlink: { value: 1 },
    uEar: { value: 0 },
    uEarSwivel: { value: 0 },
    uHeadInv: { value: new THREE.Matrix3() },
    uHeadMove: { value: new THREE.Vector3() },
    uHeadOn: { value: 0 },
    uGaze: { value: new THREE.Vector2() },
    uEyeScale: { value: 1 },
    uPupil: { value: 0 },
    uJiggle: { value: new THREE.Vector3() },
    uShiver: { value: 0 },
    uPurr: { value: 0 },
    uClock: { value: 0 },
    uImpact: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    uImpactN: { value: 0 },
    uCupInv: { value: new THREE.Matrix3() },
    uCupRot: { value: new THREE.Matrix3() },
    uCupPivot: { value: new THREE.Vector3() },
    uCupUp: { value: new THREE.Vector3(0, 1, 0) },
    uSlosh: { value: new THREE.Vector3() },
    uFog: { value: null },
    uFogOn: { value: 0 },
    uDrop: { value: new THREE.Vector4() },
    uTearGrow: { value: 1 },
    uTearNeck: { value: 1 },
    uPawMove: { value: new THREE.Vector3() },
    uToeSpread: { value: 0 },
    uGlassPlate: { value: glassPlate },
    uCatPlate: { value: catPlate },
    uRefDepth: { value: referenceDepth.texture },
    uPlateAzimuth: { value: 0 },
    uPlateOn: { value: params.get('plate') === '0' ? 0 : 1 }
  };

  const tracer = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: tracerVertex,
    fragmentShader: tracerFragment(kitten),
    uniforms,
    depthTest: false,
    depthWrite: false
  });
  const traceQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tracer);
  traceQuad.frustumCulled = false;
  const traceScene = new THREE.Scene();
  traceScene.add(traceQuad);

  const makeTarget = () => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
  });
  const hdr = makeTarget();
  const encoded = makeTarget();
  const tensorA = makeTarget();
  const tensorB = makeTarget();
  const tensorC = makeTarget();
  const painted = makeTarget();
  const targets = [hdr, encoded, tensorA, tensorB, tensorC, painted];

  const encode = fullscreen(encodeFragment, { uImage: { value: hdr.texture } });
  const tensor = fullscreen(tensorFragment, { uImage: { value: encoded.texture }, uTexel: { value: new THREE.Vector2() } });
  const blurX = fullscreen(blurFragment, { uImage: { value: tensorA.texture }, uStep: { value: new THREE.Vector2() } });
  const blurY = fullscreen(blurFragment, { uImage: { value: tensorB.texture }, uStep: { value: new THREE.Vector2() } });
  const kuwahara = fullscreen(kuwaharaFragment, {
    uImage: { value: encoded.texture }, uTensor: { value: tensorC.texture },
    uTexel: { value: new THREE.Vector2() }, uRadius: { value: 6 }
  });
  const display = fullscreen(displayFragment, {
    uImage: { value: painted.texture }, uRaw: { value: 0 },
    uStar: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uFrame: { value: new THREE.Vector2(1, 1) },
    uZoom: { value: 1 },
    uGlow: { value: 0 }
  });

  const post = { kuwahara: params.get('paint') !== '0' };

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 1, 400);
  camera.position.copy(BASE_POSITION);
  camera.lookAt(BASE_TARGET);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(BASE_TARGET);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = THREE.MathUtils.degToRad(28);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(94);
  controls.minDistance = BASE_DISTANCE * 0.62;
  controls.maxDistance = BASE_DISTANCE * 1.35;
  controls.update();

  const state = {
    view: 'final',
    playing: !reducedMotion.matches && !manual,
    width: 1,
    height: 1,
    scale: 1,
    idleScale: 1,
    interacting: false,
    lastLively: -Infinity,
    dirty: true,
    cue: null,
    fogOn: false,
    spotOn: false,
    spot: new THREE.Vector3(),
    tilt: 0
  };

  // Audio can only start from a user gesture; the first one anywhere unlocks it.
  const sound = new Soundscape();
  if (recording) sound.record();
  const unlockSound = () => sound.unlock();
  window.addEventListener('pointerdown', unlockSound, { capture: true });
  window.addEventListener('keydown', unlockSound, { capture: true });
  document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));

  function fit(width, height) {
    const aspect = width / height;
    camera.aspect = aspect;
    // The square painting frame always fits the shorter side of the viewport.
    camera.fov = aspect >= 1 ? BASE_FOV
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / aspect));
    camera.updateProjectionMatrix();
  }

  function allocate(width, height, pixelRatio) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    uniforms.uRes.value.copy(buffer);
    for (const target of targets) target.setSize(buffer.x, buffer.y);
    const texel = new THREE.Vector2(1 / buffer.x, 1 / buffer.y);
    tensor.material.uniforms.uTexel.value.copy(texel);
    kuwahara.material.uniforms.uTexel.value.copy(texel);
    blurX.material.uniforms.uStep.value.set(texel.x, 0);
    blurY.material.uniforms.uStep.value.set(0, texel.y);
    // The filter radius is defined in painting pixels.
    kuwahara.material.uniforms.uRadius.value = Math.max(2.2, 6 * Math.min(buffer.x, buffer.y) / referenceCamera.framePx);
    const aspect = width / height;
    display.material.uniforms.uFrame.value.set(aspect >= 1 ? aspect : 1, aspect >= 1 ? 1 : 1 / aspect);
    state.dirty = true;
  }

  function applyResolution() {
    const devicePixels = window.devicePixelRatio || 1;
    const cap = Math.sqrt(1150000 / (state.width * state.height));
    // A recording renders at full device resolution every frame.
    const ratio = recording ? devicePixels : Math.min(devicePixels, cap, 1.6) * state.scale;
    allocate(state.width, state.height, ratio);
  }

  function resize() {
    state.width = Math.max(viewport.clientWidth, 2);
    state.height = Math.max(viewport.clientHeight, 2);
    fit(state.width, state.height);
    applyResolution();
    overlay.width = state.width * Math.min(window.devicePixelRatio, 2);
    overlay.height = state.height * Math.min(window.devicePixelRatio, 2);
  }

  const scratch = new THREE.Vector3();
  function project(point) {
    scratch.copy(point).project(camera);
    return [0.5 + 0.5 * scratch.x, 0.5 + 0.5 * scratch.y];
  }

  function updateCameraUniforms() {
    camera.updateMatrixWorld();
    const m = camera.matrixWorld;
    uniforms.uCam.value.setFromMatrixPosition(m);
    uniforms.uRight.value.setFromMatrixColumn(m, 0);
    uniforms.uUp.value.setFromMatrixColumn(m, 1);
    camera.getWorldDirection(uniforms.uForward.value);
    uniforms.uFocal.value = 0.5 * uniforms.uRes.value.y / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    uniforms.uPlateAzimuth.value = Math.atan2(camera.position.x, camera.position.z);
  }

  // The cup's own frame differs from the world only while it is being rocked.
  const cupRotation = new THREE.Quaternion();
  const cupPivot = new THREE.Vector3();
  function cupToWorld(point) {
    return point.sub(cupPivot).applyQuaternion(cupRotation).add(cupPivot);
  }

  const v3 = new THREE.Vector3();
  function pointOnCup({ azimuth, radius, height }, add) {
    const a = azimuth + add;
    return v3.set(Math.sin(a) * radius, height, Math.cos(a) * radius);
  }

  function render() {
    updateCameraUniforms();
    const azimuth = uniforms.uPlateAzimuth.value;
    renderer.setRenderTarget(hdr);
    renderer.render(traceScene, camera);
    const pass = (target, scene) => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    };
    pass(encoded, encode.scene);
    if (post.kuwahara && uniforms.uMode.value === 0) {
      pass(tensorA, tensor.scene);
      pass(tensorB, blurX.scene);
      pass(tensorC, blurY.scene);
      pass(painted, kuwahara.scene);
      display.material.uniforms.uImage.value = painted.texture;
    } else {
      display.material.uniforms.uImage.value = encoded.texture;
    }

    const showStars = uniforms.uMode.value === 0;
    const stars = display.material.uniforms.uStar.value;
    const zoom = camera.position.distanceTo(controls.target) / BASE_DISTANCE;
    const [u0, v0] = project(cupToWorld(pointOnCup(STAR_RIM, azimuth)));
    stars[0].set(u0, v0, showStars ? 1 : 0);
    const [u1, v1] = project(cupToWorld(state.spotOn ? v3.copy(state.spot) : pointOnCup(STAR_WALL, azimuth)));
    stars[1].set(u1, v1, showStars ? 0.9 : 0);
    display.material.uniforms.uGlow.value = showStars && state.spotOn ? 1 : 0;
    display.material.uniforms.uZoom.value = zoom;

    renderer.setRenderTarget(null);
    renderer.render(display.scene, camera);
  }

  // ---- Behaviour ------------------------------------------------------------------
  const behavior = new CatBehavior();
  const headRotation = new THREE.Matrix4();
  const qYaw = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion();

  function applyPose(pose) {
    uniforms.uBreath.value = pose.breath;
    uniforms.uBlink.value = pose.lid;
    uniforms.uEyeScale.value = pose.eyeScale;
    uniforms.uGaze.value.set(...pose.gaze);
    uniforms.uPupil.value = pose.pupil;
    uniforms.uEar.value = pose.earHinge;
    uniforms.uEarSwivel.value = pose.earSwivel;
    uniforms.uJiggle.value.set(...pose.jiggle);
    uniforms.uShiver.value = pose.shiver;
    uniforms.uPurr.value = pose.purr;
    uniforms.uClock.value = pose.clock;

    const { x, y, z } = kitten.head.basis;
    qYaw.setFromAxisAngle(y, pose.headYaw);
    qPitch.setFromAxisAngle(x, -pose.headPitch);
    qRoll.setFromAxisAngle(z, -pose.headRoll);
    qYaw.multiply(qPitch).multiply(qRoll);
    headRotation.makeRotationFromQuaternion(qYaw).invert();
    uniforms.uHeadInv.value.setFromMatrix4(headRotation);
    uniforms.uHeadMove.value.set(...pose.headMove);
    const moved = Math.abs(pose.headYaw) + Math.abs(pose.headPitch) + Math.abs(pose.headRoll)
      + Math.abs(pose.headMove[0]) + Math.abs(pose.headMove[1]);
    uniforms.uHeadOn.value = moved > 1e-5 ? 1 : 0;

    uniforms.uImpactN.value = pose.impacts.length;
    pose.impacts.forEach(({ point, age }, i) => uniforms.uImpact.value[i].set(point[0], point[1], point[2], age));
  }

  // ---- Pointer: look at it, tap the glass, press and hold to stroke -----------------
  const canvas = renderer.domElement;
  const pointer = { known: false, x: 0, y: 0, lastMove: -Infinity, mode: 'idle', downTime: 0, downX: 0, downY: 0, holdTimer: 0, written: 0 };
  const HOLD_MS = 220;
  const MOVE_TOLERANCE = 7;
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const headCenter = new THREE.Vector3(...kitten.head.center.toArray());

  function aimRay() {
    const ndcX = pointer.x / state.width * 2 - 1;
    const ndcY = 1 - pointer.y / state.height * 2;
    rayOrigin.copy(camera.position);
    rayDirection.set(ndcX, ndcY, 0.5).unproject(camera).sub(rayOrigin).normalize();
    if (state.tilt !== 0) {
      const inverse = cupRotation.clone().invert();
      rayOrigin.sub(cupPivot).applyQuaternion(inverse).add(cupPivot);
      rayDirection.applyQuaternion(inverse);
    }
  }

  // Direction of the pointer from the head, as head-relative yaw and pitch.
  function pointerAngles() {
    aimRay();
    const toCamera = camera.position.clone().sub(headCenter).normalize();
    const plane = headCenter.clone().addScaledVector(toCamera, 5);
    const t = plane.clone().sub(rayOrigin).dot(toCamera) / rayDirection.dot(toCamera);
    const target = rayOrigin.clone().addScaledVector(rayDirection, t).sub(headCenter).normalize();
    const { x, y, z } = kitten.head.basis;
    const forward = target.dot(z);
    if (forward < 0.1) return [0, 0];
    return [Math.atan2(target.dot(x), forward), Math.asin(THREE.MathUtils.clamp(target.dot(y), -1, 1))];
  }

  // First point where the current ray meets the outside of the cup.
  function cupHit() {
    aimRay();
    const k = cup.slope;
    const { x: ox, y: oy, z: oz } = rayOrigin;
    const { x: dx, y: dy, z: dz } = rayDirection;
    const rimAtOrigin = cup.baseRadius + k * oy;
    const a = dx * dx + dz * dz - k * k * dy * dy;
    const b = 2 * (ox * dx + oz * dz - k * rimAtOrigin * dy);
    const c = ox * ox + oz * oz - rimAtOrigin * rimAtOrigin;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      const y = oy + dy * t;
      if (t > 0 && y >= 0 && y <= cup.height) return new THREE.Vector3(ox + dx * t, y, oz + dz * t);
    }
    return null;
  }

  function overLeftEar() {
    aimRay();
    const { tip } = kitten.head.ears[0];
    const toTip = tip.clone().sub(rayOrigin);
    return toTip.addScaledVector(rayDirection, -toTip.dot(rayDirection)).length() < 0.75;
  }

  const finalView = () => state.view === 'final' && state.playing;

  function tapAt() {
    if (overLeftEar()) {
      behavior.flickEar();
      sound.play(['trill-a', 'trill-b'], { gain: 0.5, rate: 1.1 });
      return;
    }
    const hit = cupHit();
    if (!hit) return;
    // A tap by hand sometimes gets a small startled mew back.
    tapSound(Math.random() < 0.35);
    const inward = new THREE.Vector3(-hit.x, 0, -hit.z).normalize();
    behavior.tap(hit.toArray(), inward.toArray());
  }

  function tapSound(answer) {
    const asleep = behavior.drowsiness > 0.5;
    sound.play('tap', { gain: 0.85, spread: 0.06 });
    if (asleep) sound.play('mew-c', { gain: 0.5, rate: 0.9, delay: 0.35 });
    else if (answer) sound.play(['mew-b', 'mew-d'], { gain: 0.5, rate: 1.08, delay: 0.16 });
  }

  function trackPointer(event) {
    if (event.target !== canvas) { pointer.known = false; return; }
    const rect = viewport.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.known = true;
    pointer.lastMove = performance.now();
    if (event.pointerType === 'mouse') viewport.dataset.over = cupHit() || overLeftEar() ? 'cup' : 'none';
  }

  function endStroke() {
    clearTimeout(pointer.holdTimer);
    pointer.mode = 'idle';
    controls.enabled = state.view !== 'reference';
  }

  canvas.addEventListener('pointerdown', event => {
    if (!finalView() || event.button !== 0) return;
    trackPointer(event);
    // While the glass is fogged, dragging on it writes instead of orbiting.
    if (state.fogOn) {
      const hit = cupHit();
      if (hit) {
        pointer.mode = 'write';
        pointer.lastWrite = hit.clone();
        controls.enabled = false;
        return;
      }
    }
    pointer.mode = 'pending';
    pointer.downTime = performance.now();
    pointer.downX = event.clientX;
    pointer.downY = event.clientY;
    clearTimeout(pointer.holdTimer);
    // A still press on the cup becomes stroking; off the cup it stays an orbit.
    pointer.holdTimer = setTimeout(() => {
      if (pointer.mode !== 'pending' || !cupHit()) return;
      pointer.mode = 'stroke';
      controls.enabled = false;
    }, HOLD_MS);
  });

  window.addEventListener('pointermove', event => {
    trackPointer(event);
    if (pointer.mode === 'write') {
      const hit = cupHit();
      if (hit) {
        pointer.written += hit.distanceTo(pointer.lastWrite);
        fog.wipe(pointer.lastWrite, hit);
        pointer.lastWrite = hit.clone();
      }
      return;
    }
    if (pointer.mode === 'pending'
      && Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > MOVE_TOLERANCE) {
      pointer.mode = 'orbit';
      clearTimeout(pointer.holdTimer);
    }
  });

  window.addEventListener('pointerup', event => {
    if (pointer.mode === 'pending' && performance.now() - pointer.downTime < HOLD_MS) {
      trackPointer(event);
      tapAt();
    }
    endStroke();
  });
  window.addEventListener('pointercancel', endStroke);
  viewport.addEventListener('pointerleave', () => { pointer.known = false; });

  function gatherInput(now) {
    const neutral = state.view !== 'final';
    const active = pointer.known && now - pointer.lastMove < 2200;
    const [pointerYaw, pointerPitch] = pointer.known && !neutral ? pointerAngles() : [0, 0];
    return { neutral, pointerActive: active, pointerYaw, pointerPitch, stroking: !neutral && pointer.mode === 'stroke' };
  }

  // ---- Structure view: skeleton drawn over the clay model -------------------
  const overlayContext = overlay.getContext('2d');
  function drawOverlay() {
    const g = overlayContext;
    const w = overlay.width;
    const h = overlay.height;
    g.clearRect(0, 0, w, h);
    if (state.view === 'final' && state.cue) {
      const [u, v] = project(cupToWorld(state.cue.point.clone()));
      const ratio = Math.min(window.devicePixelRatio, 2);
      const finger = state.cue.kind === 'finger';
      g.beginPath();
      g.arc(u * w, (1 - v) * h, (finger ? 17 : 7) * ratio, 0, Math.PI * 2);
      g.fillStyle = finger ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)';
      g.fill();
      g.lineWidth = 1.6 * ratio;
      g.strokeStyle = 'rgba(90,132,168,0.75)';
      g.stroke();
    }
    if (state.view !== 'structure') return;
    const toScreen = point => {
      const [u, v] = project(point);
      return [u * w, (1 - v) * h];
    };
    const line = (points, color, width) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      points.forEach((point, i) => {
        const [x, y] = toScreen(point);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.stroke();
    };
    const joints = (points, color, radius) => {
      g.fillStyle = color;
      points.forEach(point => {
        const [x, y] = toScreen(point);
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.fill();
      });
    };
    const ratio = Math.min(window.devicePixelRatio, 2);
    // The cup: rim and foot circles.
    const ring = (radius, y) => {
      const out = [];
      for (let i = 0; i <= 96; i++) {
        const a = i / 96 * Math.PI * 2;
        out.push(new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius));
      }
      return out;
    };
    line(ring(cup.rimRadius, cup.height), '#5a84a8', 1.4 * ratio);
    line(ring(cup.baseRadius, 0), '#5a84a8', 1.4 * ratio);
    line(ring(cup.baseRadius + cup.slope * cup.floor - cup.wall, cup.floor), '#9db8cf', 1 * ratio);

    const { spine, limbs, tail } = kitten;
    const spineColor = '#1e6e8c';
    line(spine, spineColor, 2.4 * ratio);
    joints(spine, spineColor, 3 * ratio);
    line(tail.nodes, '#3a8aa8', 1.8 * ratio);
    joints(tail.nodes, '#3a8aa8', 2 * ratio);
    const limbColor = '#b2543f';
    for (const limb of [limbs.foreLeft, limbs.foreRight, limbs.hindRight, limbs.hindLeft]) {
      line(limb, limbColor, 2.2 * ratio);
      joints(limb, limbColor, 3 * ratio);
    }
  }

  // ---- View switching --------------------------------------------------------
  const viewButtons = [...document.querySelectorAll('[data-view]')].filter(element => element.tagName === 'BUTTON');
  const panel = document.querySelector('#panel');
  const playButton = document.querySelector('#play');
  const homeButton = document.querySelector('#home');

  function resetCamera() {
    controls.reset();
    camera.position.copy(BASE_POSITION);
    controls.target.copy(BASE_TARGET);
    camera.lookAt(BASE_TARGET);
    controls.update();
    fit(state.width, state.height);
    state.dirty = true;
  }

  function setView(view) {
    if (view === state.view) return;
    state.view = view;
    viewport.dataset.view = view;
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    if (view !== 'final') director.stop();
    const structure = view === 'structure';
    uniforms.uMode.value = structure ? 1 : 0;
    panel.hidden = !structure;
    if (view === 'reference') {
      resetCamera();
      controls.enabled = false;
    } else {
      controls.enabled = true;
    }
    drawOverlay();
    state.dirty = true;
  }

  viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  homeButton.addEventListener('click', resetCamera);
  playButton.addEventListener('click', () => {
    state.playing = !state.playing;
    playButton.setAttribute('aria-pressed', String(state.playing));
    playButton.setAttribute('aria-label', state.playing ? '暂停动画' : '播放动画');
  });
  reducedMotion.addEventListener('change', event => {
    state.playing = !event.matches;
    playButton.setAttribute('aria-pressed', String(state.playing));
  });

  // The wipe between render and painting follows the pointer in the compare view.
  viewport.addEventListener('pointermove', event => {
    if (state.view !== 'reference') return;
    const percent = THREE.MathUtils.clamp(100 - event.clientX / viewport.clientWidth * 100, 0, 100);
    viewport.style.setProperty('--wipe', `${percent}%`);
  });

  // Fade the controls when nothing is happening.
  let idleTimer = 0;
  const wake = () => {
    viewport.dataset.idle = 'false';
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { viewport.dataset.idle = 'true'; }, 3200);
  };
  viewport.addEventListener('pointermove', wake);
  viewport.addEventListener('pointerdown', wake);
  viewport.addEventListener('keydown', wake);
  wake();

  // Render less while the view or the kitten is moving so responses stay immediate.
  const MOVING_SCALE = recording ? 1 : 0.72;
  controls.addEventListener('start', () => { state.interacting = true; });
  controls.addEventListener('end', () => { state.interacting = false; });
  controls.addEventListener('change', () => { state.dirty = true; });

  new ResizeObserver(resize).observe(viewport);
  resize();
  applyPose(behavior.pose());
  render();

  // ---- The seven scenes --------------------------------------------------------
  const fog = new GlassFog(renderer);
  uniforms.uFog.value = fog.texture;

  const neck = kitten.spine[11];
  const headMove = new THREE.Vector3();
  function headToCup(local) {
    const { x, y, z } = kitten.head.basis;
    return kitten.head.center.clone()
      .addScaledVector(x, local.x).addScaledVector(y, local.y).addScaledVector(z, local.z)
      .sub(neck).applyQuaternion(qYaw).add(neck).add(headMove);
  }

  const tear = new TearCycle({
    eyeLocal: kitten.head.eyes[1].local,
    eyeRadius: kitten.head.eyes[1].radius,
    radii: [2.55, 2.28, 2.35],
    toWorld: headToCup
  });
  const rock = new CupRock();
  const pressCenter = kitten.limbs.press.center;
  const paw = new PawChase({
    restAzimuth: Math.atan2(pressCenter.x, pressCenter.z),
    restY: pressCenter.y,
    reachable: (dTheta, dY) => forelimbReach(kitten, dTheta, dY)
  });

  function wallPoint(azimuth, y) {
    const r = cup.baseRadius + cup.slope * y;
    return new THREE.Vector3(Math.sin(azimuth) * r, y, Math.cos(azimuth) * r);
  }

  function headAngles(point) {
    const toTarget = point.clone().sub(headCenter).normalize();
    const { x, y, z } = kitten.head.basis;
    return [Math.atan2(toTarget.dot(x), toTarget.dot(z)), Math.asin(THREE.MathUtils.clamp(toTarget.dot(y), -1, 1))];
  }

  function pointFromAngles(yaw, pitch) {
    const { x, y, z } = kitten.head.basis;
    const direction = z.clone().multiplyScalar(Math.cos(yaw) * Math.cos(pitch))
      .addScaledVector(x, Math.sin(yaw) * Math.cos(pitch)).addScaledVector(y, Math.sin(pitch));
    return headCenter.clone().addScaledVector(direction, 5);
  }

  function tapGlass(point) {
    tapSound(false);
    behavior.tap(point.toArray(), new THREE.Vector3(-point.x, 0, -point.z).normalize().toArray());
  }

  // A heart drawn in the fog in front of the kitten's nose.
  const nose = headToCup(kitten.head.nose);
  const noseAzimuth = Math.atan2(nose.x, nose.z);
  function heartPoint(u) {
    const t = u * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const r = cup.baseRadius + cup.slope * 6.3;
    return wallPoint(noseAzimuth + 0.03 + x * 0.075 / r, 6.3 + y * 0.075);
  }
  const noseGlass = wallPoint(noseAzimuth, nose.y - 0.3);
  const fogSource = {
    u: Math.atan2(noseGlass.x, noseGlass.z) / (2 * Math.PI) + 0.5,
    v: noseGlass.y / cup.height,
    sizeU: 1.55 / (2 * Math.PI * 4.2),
    sizeV: 1.15 / cup.height
  };

  // The light wanders around the paw unless a pointer is steering it.
  function spotPoint(t) {
    const hit = pointer.known && performance.now() - pointer.lastMove < 900 ? cupHit() : null;
    if (hit && hit.z > 0) state.spot.copy(hit);
    else {
      const az = Math.atan2(pressCenter.x, pressCenter.z);
      state.spot.copy(wallPoint(az + 0.46 * Math.sin(t * 1.05) + 0.12 * Math.sin(t * 2.6 + 1), pressCenter.y + 0.9 * Math.sin(t * 0.8 + 0.7) + 0.2 * Math.sin(t * 3.1)));
    }
    return state.spot;
  }

  const actionButtons = [...document.querySelectorAll('[data-action]')];
  const director = new Director(createPerformances({
    behavior, tear, rock, wallPoint, headAngles, pointFromAngles, heartPoint, spotPoint,
    tap: tapGlass,
    cue(point, kind) { state.cue = { point: point.clone(), kind }; },
    pointerLive: () => pointer.known && performance.now() - pointer.lastMove < 900,
    fogMode(on) { state.fogOn = on; },
    spotMode(on) { state.spotOn = on; },
    wipeHeart(u0, u1) { fog.wipe(heartPoint(u0), heartPoint(u1)); }
  }), (id, progress) => {
    actionButtons.forEach(button => {
      const on = button.dataset.action === id;
      button.setAttribute('aria-pressed', String(on));
      button.style.setProperty('--progress', on ? progress.toFixed(3) : '0');
    });
  });

  actionButtons.forEach(button => button.addEventListener('click', () => {
    if (state.view !== 'final') setView('final');
    if (!state.playing) {
      state.playing = true;
      playButton.setAttribute('aria-pressed', 'true');
    }
    director.toggle(button.dataset.action);
  }));

  let sloshX = 0, sloshZ = 0, sloshVX = 0, sloshVZ = 0;
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  function applyExtras(dt, pose) {
    const landed = tear.update(dt);
    if (landed) {
      sound.play('drop', { gain: 0.75, rate: 1.15 });
      behavior.splash(landed.toArray(), 0.55);
      behavior.blinkSlowly();
    }
    uniforms.uTearGrow.value = tear.grow;
    uniforms.uTearNeck.value = tear.neck;
    if (tear.drop) uniforms.uDrop.value.set(tear.drop.point.x, tear.drop.point.y, tear.drop.point.z, tear.drop.radius);
    else uniforms.uDrop.value.w = 0;

    // Condensation: added while breathing out in the fog scene.
    if (state.fogOn) fog.step(dt, { source: fogSource, rate: 0.5 * pose.exhale, tau: 7 });
    else fog.step(dt, { tau: 2.2 });
    uniforms.uFog.value = fog.texture;
    uniforms.uFogOn.value = fog.energy > 0.002 ? 1 : 0;

    paw.update(dt, state.spotOn ? state.spot : null);
    uniforms.uPawMove.value.set(paw.dTheta, paw.dY, paw.active ? 1 : 0);
    uniforms.uToeSpread.value = paw.spread;

    // Rocking: about the heel on the low side, in the plane facing the camera.
    rock.update(dt);
    state.tilt = rock.angle;
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    camRight.crossVectors(camForward, worldUp).normalize();
    cupRotation.setFromAxisAngle(camForward, state.tilt);
    cupPivot.copy(camRight).multiplyScalar(Math.sign(state.tilt) * (cup.baseRadius - 0.2));
    const matrix = new THREE.Matrix4().makeRotationFromQuaternion(cupRotation);
    uniforms.uCupRot.value.setFromMatrix4(matrix);
    uniforms.uCupInv.value.copy(uniforms.uCupRot.value).transpose();
    uniforms.uCupPivot.value.copy(cupPivot);
    uniforms.uCupUp.value.copy(worldUp).applyQuaternion(cupRotation.clone().invert());

    // The soft body lags behind and pools towards the low side.
    const gx = -uniforms.uCupUp.value.x;
    const gz = -uniforms.uCupUp.value.z;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      sloshVX += (36 * (gx * 2.2 - sloshX) - 6 * sloshVX) * h;
      sloshVZ += (36 * (gz * 2.2 - sloshZ) - 6 * sloshVZ) * h;
      sloshX += sloshVX * h;
      sloshZ += sloshVZ * h;
    }
    uniforms.uSlosh.value.set(sloshX, 0, sloshZ);
  }

  function advance(dt, input) {
    state.cue = null;
    director.update(dt, input);
    // A kitten in the middle of doing something doesn't nod off.
    if (director.current && director.current !== 'nap') behavior.idle = 0;
    input.counterRoll = -rock.angle * 0.55;
    const pose = behavior.update(dt, input);
    applyPose(pose);
    headMove.set(...pose.headMove);
    applyExtras(dt, pose);
    return pose;
  }

  // ---- Sound ---------------------------------------------------------------------
  // Cues at fixed moments inside each scene: [seconds, clip or clips, options].
  const SCENE_SOUNDS = {
    look: [[0.35, ['mew-a', 'mew-c'], { gain: 0.7, rate: 1.05 }], [3.35, 'mew-d', { gain: 0.5, rate: 1.1 }]],
    nap: [[0.4, 'mew-sleepy', { gain: 0.55, spread: 0 }]],
    tear: [[0.3, 'mew-sad', { gain: 0.55, rate: 1.05 }]],
    spot: [[0.6, 'chatter', { gain: 0.5 }], [5.5, 'trill-c', { gain: 0.45 }]],
    shake: [[0, 'slosh-b', { gain: 0.8 }], [0.3, 'mew-b', { gain: 0.55, rate: 1.12 }]]
  };
  const heard = { scene: null, time: 0, stroking: false, exhale: 0, tilt: 0, touching: false, lastTick: -Infinity, written: 0, rub: 0 };

  function updateSound(dt, pose, input) {
    const live = Boolean(pose) && state.view === 'final';
    const scene = live ? director.current : null;
    const t = director.time;
    if (scene !== heard.scene) { heard.scene = scene; heard.time = -1e-6; }
    for (const [at, clip, options] of SCENE_SOUNDS[scene] || []) {
      if (heard.time < at && t >= at) sound.play(clip, options);
    }
    heard.time = t;

    // Purring follows the behaviour's own purr level; asleep, a slower, deeper purr.
    const purr = live ? pose.purr : 0;
    sound.loop('purr', 0.85 * purr ** 1.3, { tau: 0.25 });
    const sleep = live ? THREE.MathUtils.smoothstep(pose.drowsiness, 0.55, 0.95) : 0;
    sound.loop('purr-sleep', 0.4 * sleep * (1 - purr), { tau: 0.6 });
    const stroking = live && input.stroking;
    if (stroking && !heard.stroking) sound.play(['trill-b', 'trill-c'], { gain: 0.4, delay: 0.25 });
    heard.stroking = stroking;

    // Breathing on the glass: one warm breath at the start of each long exhale.
    const exhale = scene === 'fog' && t < 4.4 ? pose.exhale : 0;
    if (exhale > 0.25 && heard.exhale <= 0.25) sound.play(['breath-a', 'breath-b', 'breath-c'], { gain: 0.26, rate: 1.02 });
    heard.exhale = exhale;

    // A fingertip squeaking through the fog, scripted heart or by hand.
    const drawn = pointer.written - heard.written;
    heard.written = pointer.written;
    const handSpeed = dt > 0 ? drawn / dt : 0;
    const target = !live ? 0 : scene === 'fog' && t >= 4.3 && t < 6.5 ? 0.4 : 0.45 * THREE.MathUtils.clamp(handSpeed / 6, 0, 1);
    heard.rub = Math.max(target, heard.rub * Math.exp(-dt / 0.12));
    sound.loop('squeak', heard.rub, { tau: 0.05 });

    // The rocking cup: each time it rolls across upright its base knocks the
    // table and the water inside sloshes over, softer every swing.
    const tilt = live && rock.rocking ? rock.angle : 0;
    if (tilt && heard.tilt && Math.sign(tilt) !== Math.sign(heard.tilt)) {
      const strength = Math.exp(-rock.time / 1.2);
      if (strength > 0.12) {
        sound.play('clunk', { gain: 0.75 * strength, spread: 0.08 });
        sound.play(['slosh-a', 'slosh-b'], { gain: 0.6 * strength, rate: 1.1 });
      }
    }
    heard.tilt = tilt;

    // The paw pad meeting the glass while it chases the light.
    const touching = scene === 'spot' && paw.touching;
    const now = sound.now();
    if (touching && !heard.touching && now - heard.lastTick > 450) {
      sound.play('tick', { gain: 0.35, rate: 0.85 });
      heard.lastTick = now;
    }
    heard.touching = touching;
  }

  const soundButton = document.querySelector('#sound');
  const showSound = () => {
    soundButton.setAttribute('aria-pressed', String(sound.enabled));
    soundButton.setAttribute('aria-label', sound.enabled ? '关闭声音' : '打开声音');
  };
  soundButton.addEventListener('click', () => { sound.setEnabled(!sound.enabled); showSound(); });
  showSound();

  // ---- Anatomy read-out ---------------------------------------------------------
  const tbody = document.querySelector('#panel-joints');
  tbody.innerHTML = kitten.report.map(({ name, angle, range, ok }) =>
    `<tr class="${ok ? '' : 'bad'}"><td>${name}</td><td>${angle.toFixed(0)}°</td><td>${range[0]}–${range[1]}°</td></tr>`).join('');
  const mass = field.volumeCC * 1.05;
  document.querySelector('#panel-summary').textContent =
    `脊柱 ${kitten.spineLength.toFixed(1)} cm（颈椎到荐椎沿杯壁盘绕）。身体体积 ${field.volumeCC.toFixed(0)} ml，` +
    `按 1.05 g/ml 约 ${mass.toFixed(0)} g（3–4 周幼猫约 350–450 g，这只比真实幼猫轻，是为了装进杯子）。`;

  // ---- Main loop -----------------------------------------------------------------
  let previous = performance.now();
  let slowFrames = 0;
  function tick(now) {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    let pose = null;
    let input = null;
    if (sound.recorder && recording) sound.recorder.time = now / 1000;
    if (state.playing) {
      input = gatherInput(now);
      pose = advance(dt, input);
    }
    updateSound(dt, pose, input);

    controls.update();

    const lively = state.interacting || now - pointer.lastMove < 500 || pointer.mode === 'stroke'
      || Boolean(pose && (pose.impacts.length > 0 || pose.shiver > 0.05)) || Boolean(director.current);
    if (lively) state.lastLively = now;
    const desired = lively || now - state.lastLively < 700 ? Math.min(MOVING_SCALE, state.idleScale) : state.idleScale;
    if (desired !== state.scale) {
      state.scale = desired;
      applyResolution();
    }

    if (state.playing || state.dirty) {
      render();
      drawOverlay();
      state.dirty = false;
      // Adaptive quality if the GPU can't keep up.
      if (!lively) {
        slowFrames = dt > 0.075 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames > 40 && state.idleScale > 0.6) {
          state.idleScale = Math.max(0.6, state.idleScale - 0.1);
          slowFrames = 0;
        }
      }
    }
    requestAnimationFrame(tick);
  }

  viewport.dataset.ready = 'true';
  playButton.setAttribute('aria-pressed', String(state.playing));
  if (!manual) requestAnimationFrame(tick);

  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    document.querySelector('#loading').textContent = '图形上下文丢失，请刷新页面。';
    viewport.dataset.ready = 'false';
  });

  // The video export drives the same simulation one fixed step at a time.
  if (exporting) {
    const still = { neutral: false, pointerActive: false, pointerYaw: 0, pointerPitch: 0, stroking: false };
    let held = null;
    runExport({
      sound, director,
      size(width, height) { allocate(width, height, 1); fit(width, height); },
      // One video frame: simulate, collect sounds, render.
      frame(dt) {
        const input = { ...still };
        const pose = advance(dt, input);
        if (held && held.until > 0) { state.cue = { point: held.point.clone(), kind: 'finger' }; held.until -= dt; }
        updateSound(dt, pose, input);
        sound.recorder.time += dt;
        render();
        return renderer.domElement;
      },
      // Where the scripted cue (finger or gaze target) sits in the frame, 0..1.
      cue() {
        if (!state.cue) return null;
        const [u, v] = project(cupToWorld(state.cue.point.clone()));
        return { u, v: 1 - v, kind: state.cue.kind };
      },
      start(id) { director.toggle(id); },
      progress() {
        const scene = director.current && director.performances[director.current];
        return scene ? Math.min(director.time / scene.duration, 1) : 0;
      },
      tapGlass(azimuth, y) {
        const point = wallPoint(azimuth, y);
        held = { point, until: 0.35 };
        tapSound(true);
        behavior.tap(point.toArray(), new THREE.Vector3(-point.x, 0, -point.z).normalize().toArray());
      },
      flickEar() {
        behavior.flickEar();
        sound.play(['trill-a', 'trill-b'], { gain: 0.5, rate: 1.1 });
      }
    }).catch(error => {
      console.error(error);
      document.title = `export failed: ${error.message}`;
      window.__export = { ...(window.__export || {}), error: String(error) };
    });
  }

  // What tools/record.mjs needs to aim the cursor and follow the scenes.
  if (recording) {
    const toScreen = point => {
      const [u, v] = project(cupToWorld(point));
      return { x: u * state.width, y: (1 - v) * state.height };
    };
    window.__rec = {
      director, sound, state,
      wall: (azimuth, y) => toScreen(wallPoint(azimuth, y)),
      ear: () => toScreen(kitten.head.ears[0].tip.clone()),
      events: () => sound.recorder.events
    };
  }

  // Hooks used for capturing comparison frames during development.
  if (dev) {
    window.__wc = {
      renderer, camera, controls, uniforms, kitten, post, kuwahara, render, setView, behavior, applyPose,
      director, fog, tear, rock, paw, sound,
      // Advance everything without the display loop, for repeatable frames.
      step(seconds, input = {}, tick_ = 1 / 60) {
        let pose = behavior.pose();
        for (let t = 0; t < seconds - 1e-9; t += tick_) {
          pose = advance(tick_, { neutral: false, pointerActive: false, pointerYaw: 0, pointerPitch: 0, stroking: false, ...input });
        }
        return pose;
      },
      rest() { director.stop(); tear.reset(); rock.stop(); paw.reset(); behavior.reset(); advance(0, { neutral: false, pointerActive: false, pointerYaw: 0, pointerPitch: 0, stroking: false }); },
      displayMaterial: display.material,
      volume: field.volumeCC,
      pointer, state,
      async capture(name, width = 1280, height = 1280) {
        allocate(width, height, 1);
        fit(width, height);
        render();
        const blob = await new Promise(done => renderer.domElement.toBlob(done, 'image/png'));
        await fetch(`/__save?name=${encodeURIComponent(name)}.png`, { method: 'POST', body: blob });
        allocate(state.width, state.height, 1);
        fit(state.width, state.height);
        return { name, bytes: blob.size };
      },
      view(azimuth, elevation) {
        const a = THREE.MathUtils.degToRad(azimuth);
        const e = THREE.MathUtils.degToRad(elevation);
        camera.position.set(
          BASE_TARGET.x + BASE_DISTANCE * Math.sin(a) * Math.cos(e),
          BASE_TARGET.y + BASE_DISTANCE * Math.sin(e),
          BASE_DISTANCE * Math.cos(a) * Math.cos(e)
        );
        camera.lookAt(BASE_TARGET);
      },
      home() { camera.position.copy(BASE_POSITION); camera.lookAt(BASE_TARGET); },
      // Times the GPU by forcing a finish after each frame.
      timeFrames(count = 6) {
        const gl = renderer.getContext();
        const pixel = new Uint8Array(4);
        const t0 = performance.now();
        for (let i = 0; i < count; i++) {
          render();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        }
        return (performance.now() - t0) / count;
      },
      async views(prefix, size = 700) {
        const list = [['a', 0, 16.6], ['b', 0, 80], ['c', 90, 10], ['d', 180, 10]];
        for (const [key, azimuth, elevation] of list) {
          this.view(azimuth, elevation);
          await this.capture(`${prefix}_${key}`, size, size);
        }
        this.home();
        return 'done';
      }
    };
  }
}

setTimeout(() => start().catch(error => {
  console.error(error);
  document.body.dataset.error = String(error);
  document.querySelector('#loading').textContent = '无法启动 3D 场景，请使用支持 WebGL 2 的浏览器。';
}), 0);
