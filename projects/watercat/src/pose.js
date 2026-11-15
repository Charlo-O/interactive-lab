import { MathUtils, Vector3 } from 'three';
import { cup, referenceCamera } from './config.js';

// ---------------------------------------------------------------------------
// Measured anatomy. Adult values are from the literature listed in
// docs/research.md; the kitten is scaled from them below.
// ---------------------------------------------------------------------------
export const vertebrae = Object.freeze({ cervical: 7, thoracic: 13, lumbar: 7, sacral: 3, caudal: 22 });

// Goniometric ranges of the conscious cat, Jaeger et al. 2007 (degrees).
export const jointLimits = Object.freeze({
  shoulder: [88, 144],
  elbow: [34, 145],
  carpus: [20, 170],
  hip: [54, 143],
  stifle: [46, 146],
  tarsus: [35, 163]
});

const adult = Object.freeze({
  humerus: 10.2, radius: 9.59, metacarpus: 2.9, phalanxFore: 2.2,
  femur: 10.6, tibia: 11.16, metatarsus: 5.6, phalanxHind: 2.3,
  sacrum: 3.5, lumbar: 13.6, thoracic: 14.8, cervical: 8.2, tail: 27
});

// A small kitten: about a third of adult body length, with a head that stays
// proportionally huge (head diameter only doubles from birth to adulthood).
const bodyScale = 0.33;
export const bones = Object.freeze(Object.fromEntries(
  Object.entries(adult).map(([name, length]) => [name, length * bodyScale])
));

// ---------------------------------------------------------------------------
// Contact and constraint helpers.
// ---------------------------------------------------------------------------
const v = (x, y, z) => new Vector3(x, y, z);
const rad = MathUtils.degToRad;
const deg = MathUtils.radToDeg;

function softMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function cavityDistance(x, y, z) {
  const inv = 1 / Math.hypot(1, cup.slope);
  const side = (Math.hypot(x, z) - cup.baseRadius - cup.slope * y) * inv + cup.wall;
  return -softMin(-side, y - cup.floor, cup.innerFillet);
}

function pushInside(point, radius) {
  const penetration = cavityDistance(point.x, point.y, point.z) + radius;
  if (penetration <= 0) return;
  const e = 0.002;
  const normal = v(
    cavityDistance(point.x + e, point.y, point.z) - cavityDistance(point.x - e, point.y, point.z),
    cavityDistance(point.x, point.y + e, point.z) - cavityDistance(point.x, point.y - e, point.z),
    cavityDistance(point.x, point.y, point.z + e) - cavityDistance(point.x, point.y, point.z - e)
  ).normalize();
  point.addScaledVector(normal, -penetration);
}

function solveDistance(a, b, wa, wb, target) {
  const delta = b.clone().sub(a);
  const length = delta.length();
  if (length < 1e-8 || wa + wb === 0) return;
  const correction = (length - target) / (length * (wa + wb));
  a.addScaledVector(delta, correction * wa);
  b.addScaledVector(delta, -correction * wb);
}

// Position-based relaxation: gravity and muscle tone pull on the chain while
// bone lengths, joint ranges and glass contacts are held as hard constraints.
function settle(guide, lengths, radii, limits, { pinFirst = true, pinLast = false, tone = 0.14, gravity = 0.004, iterations = 140 } = {}) {
  const points = guide.map(point => point.clone());
  const weight = points.map((_, i) => ((i === 0 && pinFirst) || (i === points.length - 1 && pinLast) ? 0 : 1));
  const spans = limits.map(([lo, hi], i) => [lo, hi].map(angle => Math.sqrt(
    lengths[i] ** 2 + lengths[i + 1] ** 2 - 2 * lengths[i] * lengths[i + 1] * Math.cos(rad(angle))
  )));
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (iteration < iterations * 0.7) {
      points.forEach((point, i) => {
        if (!weight[i]) return;
        point.y -= gravity;
        point.lerp(guide[i], tone);
      });
    }
    spans.forEach(([lo, hi], i) => {
      const span = points[i].distanceTo(points[i + 2]);
      const clamped = MathUtils.clamp(span, lo, hi);
      if (clamped !== span) solveDistance(points[i], points[i + 2], weight[i], weight[i + 2], clamped);
    });
    lengths.forEach((length, i) => solveDistance(points[i], points[i + 1], weight[i], weight[i + 1], length));
    points.forEach((point, i) => { if (weight[i]) pushInside(point, radii[i]); });
  }
  return points;
}

const angleAt = (a, b, c) => deg(a.clone().sub(b).angleTo(c.clone().sub(b)));

function rotation(yawDeg, pitchDeg, rollDeg) {
  const [cy, sy] = [Math.cos(rad(yawDeg)), Math.sin(rad(yawDeg))];
  const [cp, sp] = [Math.cos(rad(pitchDeg)), Math.sin(rad(pitchDeg))];
  const [cr, sr] = [Math.cos(rad(rollDeg)), Math.sin(rad(rollDeg))];
  const x = v(cy * cr + sy * sp * sr, -cp * sr, -sy * cr + cy * sp * sr);
  const y = v(cy * sr - sy * sp * cr, cp * cr, -sy * sr - cy * sp * cr);
  const z = v(sy * cp, sp, cy * cp);
  return { x, y, z };
}

// ---------------------------------------------------------------------------
// Rays through the painting, used to anchor decals where the artist put them.
// ---------------------------------------------------------------------------
const camera = (() => {
  const position = v(...referenceCamera.position);
  const forward = v(...referenceCamera.target).sub(position).normalize();
  const right = forward.clone().cross(v(0, 1, 0)).normalize();
  const up = right.clone().cross(forward);
  return { position, forward, right, up };
})();

function pixelRay(u, v_) {
  const { framePx, focalPx } = referenceCamera;
  return camera.forward.clone().multiplyScalar(focalPx)
    .addScaledVector(camera.right, u - framePx / 2)
    .addScaledVector(camera.up, framePx / 2 - v_)
    .normalize();
}

function hitEllipsoid(u, v_, center, frame, radii) {
  const direction = pixelRay(u, v_);
  const o = camera.position.clone().sub(center);
  const local = a => v(a.dot(frame.x) / radii[0], a.dot(frame.y) / radii[1], a.dot(frame.z) / radii[2]);
  const lo = local(o);
  const ld = local(direction);
  const a = ld.dot(ld);
  const b = 2 * lo.dot(ld);
  const c = lo.dot(lo) - 1;
  const t = (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
  return lo.addScaledVector(ld, t).multiply(v(...radii));
}

function hitCavity(u, v_) {
  const direction = pixelRay(u, v_);
  let last = Infinity;
  for (let t = 100; t < 125; t += 0.002) {
    const p = camera.position.clone().addScaledVector(direction, t);
    const d = Math.hypot(p.x, p.z) - (cup.baseRadius + cup.slope * p.y - cup.wall);
    if (last > 0 && d <= 0) return p;
    last = d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The pose: a kitten curled along the inside of the glass. Its back follows the
// wall in a rising spiral, as cats do in round containers, so that a 13 cm
// spine fits a cup 7.6 cm across. Ventral surfaces face the axis.
// ---------------------------------------------------------------------------
export const headFrame = Object.freeze({
  center: [0.8, 7.18, 0.72],
  radii: [2.55, 2.28, 2.35],
  angles: [-5, 14, 11]
});

// Painted landmarks in image pixels.
const landmarks = {
  eyes: [[620, 443, 38.5], [818, 474, 39.5]],
  nose: [693, 482],
  highlight: [599, 357],
  drop: [809, 519],
  toes: [[762, 700], [787, 687], [815, 687], [832, 709]],
  pad: [801, 737]
};

function buildSpine() {
  const guide = [
    v(-2.30, 2.45, 2.15),   // S3, tail root
    v(-3.00, 2.55, 1.15),   // S1
    v(-3.30, 2.95, -0.25),  // L5
    v(-3.05, 3.30, -1.60),  // L3
    v(-2.15, 3.75, -2.55),  // L1
    v(-1.10, 4.20, -3.00),  // T10
    v(0.10, 4.65, -3.10),   // T7
    v(1.25, 5.15, -2.75),   // T4
    v(2.05, 5.65, -1.90),   // T1
    v(2.15, 6.35, -1.25),   // C5
    v(1.80, 6.85, -0.95),   // C3
    v(1.25, 7.05, -1.15)    // C1
  ];
  const lumbar = bones.lumbar / 3;
  const thoracic = bones.thoracic / 4;
  const cervical = bones.cervical / 3;
  const lengths = [bones.sacrum, lumbar, lumbar, lumbar, thoracic, thoracic, thoracic, thoracic, cervical, cervical, cervical];
  const radii = [0.7, 0.75, 0.75, 0.75, 0.8, 0.8, 0.8, 0.8, 0.75, 0.6, 0.55, 0.5];
  // Inter-node span covers about three vertebrae; the feline spine allows
  // roughly 8-10 degrees per joint, and the neck a good deal more.
  const limits = [...Array(7).fill([140, 179]), ...Array(3).fill([105, 179])];
  return settle(guide, lengths, radii, limits, { pinFirst: false, tone: 0.2, gravity: 0.003 });
}

function stationFrames(spine) {
  return spine.map((point, i) => {
    const a = spine[Math.max(i - 1, 0)];
    const b = spine[Math.min(i + 1, spine.length - 1)];
    const forward = b.clone().sub(a).normalize();
    const radial = v(point.x, 0, point.z).normalize();
    const dorsal = radial.clone().multiplyScalar(0.97).add(v(0, 0.24, 0));
    dorsal.addScaledVector(forward, -dorsal.dot(forward)).normalize();
    const left = dorsal.clone().cross(forward).normalize();
    return { point, forward, dorsal, left };
  });
}

// Trunk cross-sections: { spine node, ventral offset, lateral, dorsoventral, length }.
function trunkStations(frames) {
  const table = [
    [0, 0.42, 1.25, 1.30, 1.20],
    [1, 0.95, 1.72, 1.62, 1.40],
    [2, 1.28, 1.86, 1.98, 1.55],
    [3, 1.72, 1.92, 2.36, 1.72],
    [4, 1.96, 2.00, 2.50, 1.80],
    [5, 2.02, 2.08, 2.50, 1.74],
    [6, 2.00, 2.18, 2.46, 1.68],
    [7, 1.76, 2.10, 2.30, 1.58],
    [8, 1.22, 1.72, 1.92, 1.30]
  ];
  return table.map(([index, ventral, lateral, depth, length]) => {
    const frame = frames[index];
    return {
      center: frame.point.clone().addScaledVector(frame.dorsal, -ventral).add(v(0, -0.06, 0)),
      left: frame.left, dorsal: frame.dorsal, forward: frame.forward,
      radii: [lateral, depth, length]
    };
  });
}

// Loose abdominal skin and the viscera pool under gravity. Fardin (2014): given
// time, a cat relaxes to the shape of its container.
export const softMasses = Object.freeze([
  { center: [0.75, 2.55, 0.75], radii: [2.75, 1.55, 2.65], blend: 0.9 },   // pooled belly
  { center: [1.45, 4.25, 0.45], radii: [1.95, 1.95, 1.95], blend: 0.8 },   // sternum and pectorals
  { center: [2.45, 4.35, -0.15], radii: [1.25, 1.75, 1.45], blend: 0.5 },  // left shoulder and triceps
  { center: [-0.1, 5.55, -2.05], radii: [2.6, 1.75, 1.55], blend: 0.8 },   // scruff and upper back behind the head
  { center: [-2.1, 2.95, -1.55], radii: [1.55, 1.3, 1.75], blend: 0.7 },   // left flank against the back of the cup
  { center: [2.25, 3.25, -1.45], radii: [1.35, 1.7, 1.7], blend: 0.7 }     // right flank
]);

function pawFrameFrom(toes, pad) {
  const toeMid = toes.reduce((sum, toe) => sum.add(toe), v(0, 0, 0)).multiplyScalar(0.25);
  const distal = toeMid.clone().sub(pad).normalize();
  const across = toes[3].clone().sub(toes[0]);
  const palmar = across.clone().cross(distal).normalize();
  const lateral = distal.clone().cross(palmar).normalize();
  return { distal, palmar, lateral };
}

function sign(a, frame, origin) {
  const d = a.clone().sub(origin);
  return [d.dot(frame.lateral), d.dot(frame.distal), d.dot(frame.palmar)];
}

function buildLimbs(frames) {
  const { humerus, radius, metacarpus, femur, tibia, metatarsus } = bones;

  // Left forelimb: the paw print pressed on the front of the glass.
  const toeHits = landmarks.toes.map(([a, b]) => hitCavity(a, b));
  const padHit = hitCavity(...landmarks.pad);
  const pressFrame = pawFrameFrom(toeHits, padHit);
  const toeMid = toeHits.reduce((sum, toe) => sum.add(toe), v(0, 0, 0)).multiplyScalar(0.25);
  const pawCenter = toeMid.clone().multiplyScalar(0.46).addScaledVector(padHit, 0.54);
  const pawBone = pawCenter.clone().addScaledVector(pressFrame.palmar, -0.42);

  const foreLeft = settle([
    v(1.15, 4.7, 0.1),      // shoulder
    v(2.15, 1.95, 1.72),    // elbow
    v(0.98, 4.55, 2.88),    // carpus
    pawBone.clone().addScaledVector(pressFrame.distal, 0.32) // metacarpophalangeal
  ], [humerus, radius, metacarpus], [0.62, 0.48, 0.33, 0.3], [jointLimits.elbow, jointLimits.carpus],
  { tone: 0.5, gravity: 0.002 });

  // Right forelimb: folded against the chest under the chin.
  const foreRight = settle([
    v(0.75, 6.35, -0.35),
    v(-0.85, 5.05, 0.25),
    v(0.25, 3.6, 1.15),
    v(0.8, 3.0, 1.8)
  ], [humerus, radius, metacarpus], [0.62, 0.48, 0.33, 0.3], [jointLimits.elbow, jointLimits.carpus],
  { tone: 0.3 });

  // Hind limbs: upper (right) and lower (left), hips flexed under the belly.
  const hindRight = settle([
    v(-2.05, 3.55, 1.0),
    v(0.55, 3.95, -1.30),
    v(0.95, 2.05, 1.72),
    v(1.82, 1.42, 3.02)
  ], [femur, tibia, metatarsus], [1.0, 0.6, 0.34, 0.33], [jointLimits.stifle, jointLimits.tarsus], { tone: 0.3 });

  const hindLeft = settle([
    v(-2.15, 1.95, 0.9),
    v(0.25, 2.25, -1.55),
    v(0.2, 1.5, 1.72),
    v(-0.62, 1.34, 3.05)
  ], [femur, tibia, metatarsus], [0.95, 0.58, 0.34, 0.33], [jointLimits.stifle, jointLimits.tarsus], { tone: 0.3 });

  const footFrame = (distal, roll) => {
    const d = distal.clone().normalize();
    const p = v(0, -1, 0).addScaledVector(d, d.y).normalize();
    p.applyAxisAngle(d, roll);
    const lateral = d.clone().cross(p).normalize();
    return { distal: d, palmar: p, lateral };
  };

  const pawRight = {
    center: foreRight[3].clone().add(v(0.18, -0.22, 0.25)),
    frame: footFrame(v(0.45, -0.6, 0.65), 0.8), scale: 0.9
  };
  const hindPaw = limb => {
    const distal = limb[3].clone().sub(limb[2]).normalize();
    return { center: limb[3].clone().addScaledVector(distal, 0.55), frame: footFrame(distal, 0), scale: 0.98 };
  };

  return {
    press: {
      frame: pressFrame, center: pawCenter, bone: pawBone,
      toes: toeHits.map(toe => sign(toe, pressFrame, pawCenter)),
      pad: sign(padHit, pressFrame, pawCenter)
    },
    foreLeft, foreRight, hindRight, hindLeft,
    paws: [pawRight, hindPaw(hindRight), hindPaw(hindLeft)]
  };
}

function buildTail(spine) {
  const az = degrees => rad(degrees);
  const guide = [spine[0].clone()];
  // Caudal joints continue the sacrum along the wall, around the hind feet.
  const samples = [
    [-41, 3.0, 2.0], [-28, 3.04, 1.66], [-14, 3.05, 1.48], [0, 3.05, 1.44], [14, 3.05, 1.46],
    [28, 3.03, 1.5], [42, 3.0, 1.54], [56, 2.98, 1.6], [69, 2.96, 1.66]
  ];
  for (const [angle, radius, y] of samples) {
    guide.push(v(Math.sin(az(angle)) * radius, y, Math.cos(az(angle)) * radius));
  }
  const lengths = guide.slice(1).map(() => bones.tail / (guide.length - 1));
  const limits = lengths.slice(1).map(() => [140, 180]);
  const radii = guide.map((_, i) => 0.56 - 0.27 * (i / (guide.length - 1)));
  const tail = settle(guide, lengths, radii, limits, { tone: 0.35, gravity: 0.004 });
  return { nodes: tail, radii };
}

function eulerBasis() {
  return rotation(...headFrame.angles);
}

function earFrame(base, tip, faceHint) {
  const up = tip.clone().sub(base).normalize();
  const face = faceHint.clone().addScaledVector(up, -faceHint.dot(up)).normalize();
  const across = up.clone().cross(face).normalize();
  return { base, tip, up, face, across };
}

function buildHead() {
  const center = v(...headFrame.center);
  const basis = eulerBasis();
  const toLocal = point => {
    const d = point.clone().sub(center);
    return [d.dot(basis.x), d.dot(basis.y), d.dot(basis.z)];
  };
  const decal = ([u, v_]) => hitEllipsoid(u, v_, center, basis, headFrame.radii);

  // A cat's pinnae move independently; the right one here is held against the
  // glass, the left stands clear of the rim.
  const ears = [
    earFrame(v(-0.62, 8.42, 0.12), v(-0.62, 10.26, -0.28), v(-0.05, 0.25, 1)),
    earFrame(v(2.62, 7.86, -0.35), v(4.13, 8.27, -0.88), v(-0.12, 0.92, 0.62))
  ];

  // Direction of the small window that makes the highlight fall where it was painted.
  const highlightLocal = decal(landmarks.highlight);
  const normalLocal = v(
    highlightLocal.x / headFrame.radii[0] ** 2,
    highlightLocal.y / headFrame.radii[1] ** 2,
    highlightLocal.z / headFrame.radii[2] ** 2
  ).normalize();
  const normalWorld = basis.x.clone().multiplyScalar(normalLocal.x)
    .addScaledVector(basis.y, normalLocal.y).addScaledVector(basis.z, normalLocal.z).normalize();
  const viewRay = pixelRay(...landmarks.highlight);
  const keyDirection = viewRay.clone().addScaledVector(normalWorld, -2 * viewRay.dot(normalWorld)).normalize().toArray();

  return {
    center, basis, ears, toLocal, keyDirection,
    eyes: landmarks.eyes.map(([u, v_, r]) => ({ local: decal([u, v_]), radius: r / 92 })),
    nose: decal(landmarks.nose),
    drop: decal(landmarks.drop),
    highlight: decal(landmarks.highlight)
  };
}

// Can the pressed forelimb put its paw there? The shoulder stays put, the paw
// slides along the wall, and the arm must keep its bone lengths and joint ranges.
export function forelimbReach(kitten, dTheta, dY) {
  const { foreLeft } = kitten.limbs;
  const mcp = foreLeft[3];
  const radius = Math.hypot(mcp.x, mcp.z) + cup.slope * dY;
  const azimuth = Math.atan2(mcp.x, mcp.z) + dTheta;
  const target = v(Math.sin(azimuth) * radius, mcp.y + dY, Math.cos(azimuth) * radius);
  const lengths = [bones.humerus, bones.radius, bones.metacarpus];
  const solved = settle([foreLeft[0], foreLeft[1], foreLeft[2], target], lengths, [0.62, 0.48, 0.33, 0.3],
    [jointLimits.elbow, jointLimits.carpus], { pinLast: true, tone: 0.4, gravity: 0.002, iterations: 40 });
  const stretch = Math.max(...lengths.map((length, i) => Math.abs(solved[i].distanceTo(solved[i + 1]) - length)));
  const elbow = angleAt(solved[0], solved[1], solved[2]);
  const carpus = angleAt(solved[1], solved[2], solved[3]);
  return stretch < 0.05 && elbow >= jointLimits.elbow[0] && elbow <= jointLimits.elbow[1]
    && carpus >= jointLimits.carpus[0] && carpus <= jointLimits.carpus[1];
}

export function buildKitten() {
  const spine = buildSpine();
  const frames = stationFrames(spine);
  const trunk = trunkStations(frames);
  const limbs = buildLimbs(frames);
  const tail = buildTail(spine);
  const head = buildHead();

  const report = [
    ['左肘 elbow', angleAt(limbs.foreLeft[0], limbs.foreLeft[1], limbs.foreLeft[2]), jointLimits.elbow],
    ['左腕 carpus', angleAt(limbs.foreLeft[1], limbs.foreLeft[2], limbs.foreLeft[3]), jointLimits.carpus],
    ['右肘 elbow', angleAt(limbs.foreRight[0], limbs.foreRight[1], limbs.foreRight[2]), jointLimits.elbow],
    ['右腕 carpus', angleAt(limbs.foreRight[1], limbs.foreRight[2], limbs.foreRight[3]), jointLimits.carpus],
    ['右膝 stifle', angleAt(limbs.hindRight[0], limbs.hindRight[1], limbs.hindRight[2]), jointLimits.stifle],
    ['右跗 tarsus', angleAt(limbs.hindRight[1], limbs.hindRight[2], limbs.hindRight[3]), jointLimits.tarsus],
    ['左膝 stifle', angleAt(limbs.hindLeft[0], limbs.hindLeft[1], limbs.hindLeft[2]), jointLimits.stifle],
    ['左跗 tarsus', angleAt(limbs.hindLeft[1], limbs.hindLeft[2], limbs.hindLeft[3]), jointLimits.tarsus]
  ].map(([name, angle, range]) => ({ name, angle, range, ok: angle >= range[0] && angle <= range[1] }));

  const spineLength = spine.slice(1).reduce((sum, point, i) => sum + point.distanceTo(spine[i]), 0);
  return { spine, frames, trunk, limbs, tail, head, report, spineLength };
}
