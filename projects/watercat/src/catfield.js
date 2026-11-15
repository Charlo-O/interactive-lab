import { cup, fieldBox } from './config.js';
import { softMasses } from './pose.js';

const N = value => value.toFixed(4);
const V = point => `vec3(${N(point.x)},${N(point.y)},${N(point.z)})`;
const A = array => `vec3(${array.map(N).join(',')})`;
const M = (x, y, z) => `mat3(${[x, y, z].map(a => `${N(a.x)},${N(a.y)},${N(a.z)}`).join(',')})`;

export const headConstants = head => /* glsl */ `
  const vec3 HEAD_C = ${V(head.center)};
  const mat3 HEAD_R = ${M(head.basis.x, head.basis.y, head.basis.z)};
`;

export const distanceHelpers = /* glsl */ `
  float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
  float smax(float a, float b, float k) { return -smin(-a, -b, k); }
`;

export const cupConstants = /* glsl */ `
  const float R0 = ${cup.baseRadius.toFixed(4)};
  const float SLOPE = ${cup.slope.toFixed(5)};
  const float CONE_INV = ${(1 / Math.hypot(1, cup.slope)).toFixed(5)};
  const float CUP_H = ${cup.height.toFixed(4)};
  const float WALL = ${cup.wall.toFixed(4)};
  const float FLOOR_Y = ${cup.floor.toFixed(4)};
  const float HEEL = ${cup.heel.toFixed(4)};
  const float INNER_F = ${cup.innerFillet.toFixed(4)};
  const float LIP_R = ${cup.lipRadius.toFixed(4)};
`;

const limbCode = (name, joints, radii, blend) => {
  const parts = joints.slice(1).map((joint, i) =>
    `rcone(p,${V(joints[i])},${V(joint)},${N(radii[i])},${N(radii[i + 1])})`);
  return `float ${name}(vec3 p){float d=${parts[0]};${parts.slice(1).map(part => `d=smin(d,${part},${N(blend)});`).join('')}return d;}`;
};

function pawCode(name, center, frame, scale, toes) {
  const toeLines = toes.map(([x, y, z, rx, ry]) =>
    `d=smin(d,ell(q-${A([x, y, z])},${A([rx, ry, 0.2])}),0.075);`).join('');
  return `float ${name}(vec3 p){
    vec3 q=(p-${V(center)})*${M(frame.lateral, frame.distal, frame.palmar)};
    q/=${N(scale)};
    float d=ell(q-vec3(0.0,-0.10,-0.12),vec3(0.64,0.74,0.34));
    d=smin(d,ell(q-vec3(0.0,-0.22,0.1),vec3(0.42,0.38,0.16)),0.1);
    ${toeLines}
    return d*${N(scale)};
  }`;
}

const defaultToes = [
  [-0.42, 0.34, -0.02, 0.2, 0.25],
  [-0.15, 0.56, 0.0, 0.2, 0.27],
  [0.15, 0.56, 0.0, 0.2, 0.27],
  [0.42, 0.34, -0.02, 0.2, 0.25]
];

export function catFieldSource(kitten) {
  const { trunk, spine, head, limbs, tail } = kitten;
  const { foreLeft, foreRight, hindRight, hindLeft, press, paws } = limbs;

  const stationCount = trunk.length;
  const earShape = (ear, index) => {
    const frame = M(ear.across, ear.up, ear.face);
    const height = N(ear.base.distanceTo(ear.tip));
    return `float ear${index}(vec3 p){
      vec3 q=(p-${V(ear.base)})*${frame};
      vec3 s=vec3(q.x,q.y,q.z/0.52);
      float outer=rcone(s,vec3(0.0,-0.55,0.0),vec3(0.0,${height}-0.2,0.0),0.98,0.2)*0.52;
      vec3 c=vec3(q.x,q.y-0.05,(q.z-0.13)/0.60);
      float bowl=rcone(c,vec3(0.0,-0.4,0.0),vec3(0.0,${height}-0.32,0.0),0.76,0.1)*0.60;
      return smax(outer,-bowl,0.05);
    }`;
  };

  const eyeBumps = head.eyes.map(eye =>
    `d=smin(d,ell(q-${A([eye.local.x, eye.local.y, eye.local.z - 0.1])},vec3(0.45,0.45,0.1)),0.12);`).join('');
  const drop = head.drop;

  const tailParts = tail.nodes.slice(1).map((node, i) =>
    `d=smin(d,rcone(p,${V(tail.nodes[i])},${V(node)},${N(tail.radii[i])},${N(tail.radii[i + 1])}),0.08);`).join('');

  const pressToes = press.toes.map(([x, y]) => [x, y, -0.03, 0.2, 0.25]);

  return /* glsl */ `
  float ell(vec3 q, vec3 r) { float k0 = length(q / r); float k1 = length(q / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
  float dot2(vec3 v) { return dot(v, v); }
  float rcone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
    vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
    float x2 = dot2(pa * l2 - ba * y); float y2 = y * y * l2; float z2 = z * z * l2;
    float k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }
  const int STATIONS = ${stationCount};
  const vec3 ST_C[STATIONS] = vec3[](${trunk.map(s => V(s.center)).join(',')});
  const mat3 ST_R[STATIONS] = mat3[](${trunk.map(s => M(s.left, s.dorsal, s.forward)).join(',')});
  const vec3 ST_S[STATIONS] = vec3[](${trunk.map(s => A(s.radii)).join(',')});

  ${limbCode('foreLeftBones', [...foreLeft, press.bone.clone().addScaledVector(press.frame.distal, 0.15)], [0.86, 0.7, 0.5, 0.46, 0.44], 0.2)}
  ${limbCode('foreRightBones', foreRight, [0.8, 0.66, 0.46, 0.42], 0.2)}
  ${limbCode('hindRightBones', hindRight, [1.34, 0.92, 0.46, 0.42], 0.22)}
  ${limbCode('hindLeftBones', hindLeft, [1.28, 0.88, 0.46, 0.42], 0.22)}
  ${limbCode('neckBones', [spine[8], spine[9], spine[10], spine[11]], [1.28, 1.08, 0.98, 1.05], 0.3)}
  ${pawCode('pressPaw', press.center, press.frame, 1.04, pressToes)}
  ${pawCode('pawA', paws[0].center, paws[0].frame, paws[0].scale, defaultToes)}
  ${pawCode('pawB', paws[1].center, paws[1].frame, paws[1].scale, defaultToes)}
  ${pawCode('pawC', paws[2].center, paws[2].frame, paws[2].scale, defaultToes)}
  ${head.ears.map(earShape).join('\n')}

  float tailField(vec3 p) {
    float d = 1e3;
    ${tailParts}
    return d;
  }

  float headField(vec3 p) {
    vec3 q = (p - HEAD_C) * HEAD_R;
    float d = ell(q, vec3(2.55, 2.28, 2.35));
    // Mandible and cheeks: the skull is widest at the zygomatic arches.
    d = smin(d, ell(q - vec3(0.0, -0.62, 0.42), vec3(2.3, 1.62, 1.98)), 0.5);
    // A kitten's short muzzle: paired whisker pads over a small chin.
    d = smin(d, ell(q - vec3(${N(head.nose.x - 0.42)}, ${N(head.nose.y - 0.30)}, 2.08), vec3(0.56, 0.42, 0.42)), 0.42);
    d = smin(d, ell(q - vec3(${N(head.nose.x + 0.42)}, ${N(head.nose.y - 0.30)}, 2.08), vec3(0.56, 0.42, 0.42)), 0.42);
    d = smin(d, ell(q - vec3(${N(head.nose.x)}, ${N(head.nose.y - 0.72)}, 2.02), vec3(0.42, 0.28, 0.36)), 0.3);
    ${eyeBumps}
    // Tear clinging under the left eye; capillary length of water is 2.7 mm.
    d = smin(d, ell(q - ${A([drop.x, drop.y, drop.z + 0.03])}, vec3(0.145, 0.19, 0.11)), 0.07);
    return d;
  }

  float cavity(vec3 p) {
    float side = (length(p.xz) - R0 - SLOPE * p.y) * CONE_INV + WALL;
    return smax(side, FLOOR_Y - p.y, INNER_F);
  }

  // Returns the distance and, in .y, how much a point belongs to the limbs and
  // haunches (which the painting keeps a shade lighter than the trunk).
  vec2 catSDF(vec3 p) {
    float core = 1e3;
    for (int i = 3; i < STATIONS; i++) core = smin(core, ell((p - ST_C[i]) * ST_R[i], ST_S[i]), 0.8);
    ${softMasses.map(m => `core = smin(core, ell(p - ${A(m.center)}, ${A(m.radii)}), ${N(m.blend)});`).join(' ')}
    core = smin(core, neckBones(p), 0.5);
    float limb = 1e3;
    for (int i = 0; i < 3; i++) limb = smin(limb, ell((p - ST_C[i]) * ST_R[i], ST_S[i]), 0.8);
    limb = smin(limb, hindRightBones(p), 0.22);
    limb = smin(limb, hindLeftBones(p), 0.22);
    core = smin(core, foreLeftBones(p), 0.18);
    core = smin(core, foreRightBones(p), 0.18);
    core = smin(core, pressPaw(p), 0.12);
    limb = smin(limb, pawA(p), 0.12);
    limb = smin(limb, pawB(p), 0.12);
    limb = smin(limb, pawC(p), 0.12);
    limb = smin(limb, tailField(p), 0.14);
    float h = headField(p);
    h = smin(h, ear0(p), 0.2);
    h = smin(h, ear1(p), 0.2);
    float d = smin(core, limb, 0.34);
    d = smin(d, h, 0.95);
    float part = smoothstep(-0.2, 0.25, min(core, h) - limb);
    // Soft tissue yields where it meets the glass: a rounded, flattened contact.
    return vec2(smax(d, cavity(p) + 0.008, 0.2), part);
  }
`;
}

export const fieldVertex = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const fieldFragment = kitten => /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform float uSlice;
  uniform vec3 uMin;
  uniform vec3 uSize;
  ${headConstants(kitten.head)}
  ${cupConstants}
  ${distanceHelpers}
  ${catFieldSource(kitten)}
  void main() {
    vec3 p = uMin + vec3(vUv, uSlice) * uSize;
    outColor = vec4(catSDF(p), 0.0, 1.0);
  }
`;

export const fieldDimensions = () => {
  const size = fieldBox.max.map((value, i) => value - fieldBox.min[i]);
  return size.map(extent => Math.round(extent / fieldBox.voxel));
};
