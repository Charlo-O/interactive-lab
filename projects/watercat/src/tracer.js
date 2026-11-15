import { fieldBox, glslColor, optics, palette, referenceCamera } from './config.js';
import { cupConstants, distanceHelpers, headConstants } from './catfield.js';

const F = value => (Number.isInteger(value) ? `${value}.0` : String(value));
const C = glslColor;
const vec2Text = ([x, y]) => `vec2(${F(+x.toFixed(4))},${F(+y.toFixed(4))})`;

export const tracerVertex = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function decalSource(kitten) {
  const { head, limbs } = kitten;
  const eyes = head.eyes;
  const toes = limbs.press.toes;
  const paw = limbs.press;
  return /* glsl */ `
  const vec2 EYE_POS[2] = vec2[](${eyes.map(e => vec2Text([e.local.x, e.local.y])).join(',')});
  const float EYE_R[2] = float[](${eyes.map(e => F(+e.radius.toFixed(4))).join(',')});
  const vec2 NOSE_POS = ${vec2Text([head.nose.x, head.nose.y])};
  const vec2 DROP_POS = ${vec2Text([head.drop.x, head.drop.y])};
  const vec3 PAW_C = vec3(${[paw.center.x, paw.center.y, paw.center.z].map(n => n.toFixed(4)).join(',')});
  const mat3 PAW_R = mat3(${[paw.frame.lateral, paw.frame.distal, paw.frame.palmar].map(a => `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`).join(',')});
  const vec2 PAD_POS = ${vec2Text(paw.pad)};
  const vec2 TOE_POS[4] = vec2[](${toes.map(t => vec2Text(t)).join(',')});
  `;
}

function referenceBasis() {
  const [px, py, pz] = referenceCamera.position;
  const [tx, ty, tz] = referenceCamera.target;
  const norm = v => { const l = Math.hypot(...v); return v.map(a => a / l); };
  const forward = norm([tx - px, ty - py, tz - pz]);
  const right = norm([forward[1] * 0 - forward[2] * 1, forward[2] * 0 - forward[0] * 0, forward[0] * 1 - forward[1] * 0]);
  const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { forward, right, up };
}

const referenceDistance = () =>
  Math.hypot(...referenceCamera.position.map((value, i) => value - referenceCamera.target[i]));

// The painter's camera, shared by the tracer and the depth bake below.
function referenceConstants() {
  const refBasis = referenceBasis();
  const size = fieldBox.max.map((value, i) => value - fieldBox.min[i]);
  return /* glsl */ `
  const vec3 REF_C = vec3(${referenceCamera.position.map(F).join(',')});
  const vec3 REF_F = vec3(${refBasis.forward.map(v => v.toFixed(6)).join(',')});
  const vec3 REF_R = vec3(${refBasis.right.map(v => v.toFixed(6)).join(',')});
  const vec3 REF_U = vec3(${refBasis.up.map(v => v.toFixed(6)).join(',')});
  const float REF_FOCAL = ${F(referenceCamera.focalPx)};
  const float REF_FRAME = ${F(referenceCamera.framePx)};
  const float REF_DIST = ${referenceDistance().toFixed(4)};
  const vec3 FIELD_MIN = vec3(${fieldBox.min.map(F).join(',')});
  const vec3 FIELD_SIZE = vec3(${size.map(F).join(',')});
  `;
}

// What the painter could see: for every pixel of the painting, how far along
// the view the resting cat's first surface lies (relative to the focus plane).
// The painted shading is laid on that surface only, never on what it hides.
export const referenceDepthFragment = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler3D uCat;
  ${referenceConstants()}
  void main() {
    vec2 s = (vUv - 0.5) * REF_FRAME / REF_FOCAL;
    vec3 rd = normalize(REF_F + s.x * REF_R + s.y * REF_U);
    vec3 lo = (FIELD_MIN - REF_C) / rd, hi = (FIELD_MIN + FIELD_SIZE - REF_C) / rd;
    vec3 a = min(lo, hi), b = max(lo, hi);
    float t = max(max(a.x, a.y), a.z) + 0.05;
    float tEnd = min(min(b.x, b.y), b.z) - 0.05;
    float depth = 1e3;
    for (int i = 0; i < 220 && t < tEnd; i++) {
      vec3 p = REF_C + rd * t;
      float d = texture(uCat, (p - FIELD_MIN) / FIELD_SIZE).r;
      if (d < 0.002) { depth = dot(p - REF_C, REF_F) - REF_DIST; break; }
      t += d * 0.9;
    }
    outColor = vec4(depth, 0.0, 0.0, 1.0);
  }
`;

export function tracerFragment(kitten) {
  return /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  precision highp int;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;

  uniform sampler3D uCat;
  uniform vec3 uCam;
  uniform vec3 uRight;
  uniform vec3 uUp;
  uniform vec3 uForward;
  uniform float uFocal;
  uniform vec2 uRes;
  uniform int uMode;
  uniform float uBreath;
  uniform float uBlink;
  uniform float uEar;
  uniform float uEarSwivel;
  uniform mat3 uHeadInv;
  uniform vec3 uHeadMove;
  uniform float uHeadOn;
  uniform vec2 uGaze;
  uniform float uEyeScale;
  uniform float uPupil;
  uniform vec3 uJiggle;
  uniform float uShiver;
  uniform float uPurr;
  uniform float uClock;
  uniform vec4 uImpact[4];
  uniform int uImpactN;
  uniform mat3 uCupInv;
  uniform mat3 uCupRot;
  uniform vec3 uCupPivot;
  uniform vec3 uCupUp;
  uniform vec3 uSlosh;
  uniform sampler2D uFog;
  uniform float uFogOn;
  uniform vec4 uDrop;
  uniform float uTearGrow;
  uniform float uTearNeck;
  uniform vec3 uPawMove;
  uniform float uToeSpread;
  uniform sampler2D uGlassPlate;
  uniform sampler2D uCatPlate;
  uniform sampler2D uRefDepth;
  uniform float uPlateAzimuth;
  uniform float uPlateOn;

  ${headConstants(kitten.head)}
  ${cupConstants}
  ${distanceHelpers}
  ${decalSource(kitten)}
  ${referenceConstants()}

  const vec3 BREATH_C = vec3(0.1, 3.9, -0.6);
  const vec3 EAR_C = vec3(${kitten.head.ears[0].base.toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 EAR_UP = vec3(${kitten.head.ears[0].up.toArray().map(v => v.toFixed(5)).join(',')});
  const vec3 EAR_ACROSS = vec3(${kitten.head.ears[0].across.toArray().map(v => v.toFixed(5)).join(',')});
  const vec3 EAR_TIP = vec3(${kitten.head.ears[0].tip.toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 EAR1_C = vec3(${kitten.head.ears[1].base.toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 EAR1_TIP = vec3(${kitten.head.ears[1].tip.toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 NECK_PIVOT = vec3(${kitten.spine[11].toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 HEAD_RADII = vec3(2.55, 2.28, 2.35);
  const vec3 ARM_E = vec3(${kitten.limbs.foreLeft[1].toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 ARM_C = vec3(${kitten.limbs.foreLeft[2].toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 ARM_P = vec3(${kitten.limbs.press.center.toArray().map(v => v.toFixed(4)).join(',')});
  const vec3 THROAT = vec3(1.0, 5.6, 1.6);
  const vec3 KEY_DIR = vec3(${kitten.head.keyDirection.map(v => v.toFixed(5)).join(',')});

  const vec3 FIELD_C = FIELD_MIN + 0.5 * FIELD_SIZE;
  const vec3 FIELD_H = 0.5 * FIELD_SIZE;

  const int AIR = 0;
  const int GLASS = 1;
  const int GEL = 2;
  const float N_GLASS = ${F(optics.glass)};
  const float N_GEL = ${F(optics.gel)};
  const float NONE = 1e6;
  const float HIT = 0.0009;
  const float GAP = 0.0035;
  const float CONTACT = 0.024;

  const vec3 BACKDROP = ${C(palette.backdrop)};
  const vec3 BODY = ${C(palette.body)};
  const vec3 BODY_L = ${C(palette.bodyLight)};
  const vec3 SHADOW = ${C(palette.shadow)};
  const vec3 SHADOW_D = ${C(palette.shadowDeep)};
  const vec3 CYAN = ${C(palette.cyan)};
  const vec3 CYAN_D = ${C(palette.cyanDeep)};
  const vec3 PERI = ${C(palette.periwinkle)};
  const vec3 PAD_C = ${C(palette.pad)};
  const vec3 TOE_C = ${C(palette.toe)};
  const vec3 NAVY = ${C(palette.navy)};
  const vec3 STEEL = ${C(palette.steel)};
  const vec3 WHITE = ${C(palette.white)};
  const vec3 EYE_T = ${C(palette.eyeTop)};
  const vec3 EYE_M = ${C(palette.eyeMid)};
  const vec3 EYE_L = ${C(palette.eyeLow)};
  const vec3 NOSE_C = ${C(palette.nose)};
  const vec3 FOG_C = ${C(0xF5F9FD)};
  const vec3 CROWN_BAND = ${C(0xC9DCEE)};
  const vec3 CROWN_LINE = ${C(0xB4C9E9)};
  const vec3 CROWN_DEEP = ${C(0x7E9EDB)};
  const vec3 EAR_MEMBRANE = ${C(0xC6DAEE)};
  const vec3 EAR_EDGE = ${C(0xA9C7E9)};

  float sq(float a) { return a * a; }
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }

  // ---- Glass -------------------------------------------------------------
  float sdGlass(vec3 p) {
    float r = length(p.xz);
    float side = (r - R0 - SLOPE * p.y) * CONE_INV;
    float outer = smax(smax(side, -p.y, HEEL), p.y - CUP_H, 0.02);
    float cavityD = smax(side + WALL, FLOOR_Y - p.y, INNER_F);
    float lip = length(vec2(r - (R0 + SLOPE * CUP_H - WALL * 0.5), p.y - CUP_H + 0.002)) - LIP_R;
    return smin(max(outer, -cavityD), lip, 0.03);
  }

  vec3 nGlass(vec3 p) {
    vec2 e = vec2(0.0009, 0.0);
    return normalize(vec3(sdGlass(p + e.xyy) - sdGlass(p - e.xyy),
      sdGlass(p + e.yxy) - sdGlass(p - e.yxy), sdGlass(p + e.yyx) - sdGlass(p - e.yyx)));
  }

  // ---- Cat field ----------------------------------------------------------
  // Surface waves spreading from a tap on the glass. The packet moves at 23 cm/s,
  // the slowest speed a ripple on water can have (wavelength about 1.7 cm).
  float tapWaves(vec3 p, out vec3 dir) {
    float height = 0.0;
    dir = vec3(0.0);
    for (int i = 0; i < uImpactN; i++) {
      vec3 v = p - uImpact[i].xyz;
      float r = length(v) + 1e-4;
      float age = uImpact[i].w;
      float front = 23.0 * age;
      float wave = exp(-sq((r - front) / 2.3) - age * 2.0) * sin(3.696 * (r - front));
      height += wave;
      dir += v / r * wave;
    }
    return height;
  }

  float segmentDistance(vec3 p, vec3 a, vec3 b) {
    vec3 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }

  // How much of a point moves rigidly with the skull: the head and both ears,
  // fading through the neck into the body.
  float headShare(vec3 p) {
    float k = length(((p - HEAD_C) * HEAD_R) / HEAD_RADII);
    float w = 1.0 - smoothstep(1.05, 1.5, k);
    // Below the jaw, whatever rests on the glass (the raised paw) stays put.
    float wall = R0 + SLOPE * p.y - WALL - length(p.xz);
    w *= mix(smoothstep(0.35, 1.2, wall), 1.0, smoothstep(5.9, 6.7, p.y));
    if (w < 1.0) {
      w = max(w, 1.0 - smoothstep(0.9, 1.5, segmentDistance(p, EAR_C, EAR_TIP)));
      w = max(w, 1.0 - smoothstep(0.9, 1.5, segmentDistance(p, EAR1_C, EAR1_TIP)));
    }
    return w;
  }

  vec3 rotateAbout(vec3 e, vec3 k, float a) {
    float c = cos(a), s = sin(a);
    return e * c + cross(k, e) * s + k * dot(k, e) * (1.0 - c);
  }

  // Maps a point of the living cat back to the baked resting pose: undoing the
  // head turn first, then the pinna, then breathing and body motion.
  // Share of a point that follows the pressed paw along the wall: full at the
  // paw, fading through the forearm to nothing at the elbow.
  float armShare(vec3 p) {
    vec3 ec = ARM_C - ARM_E, cp = ARM_P - ARM_C;
    float h1 = clamp(dot(p - ARM_E, ec) / dot(ec, ec), 0.0, 1.0);
    float h2 = clamp(dot(p - ARM_C, cp) / dot(cp, cp), 0.0, 1.0);
    float d1 = length(p - ARM_E - ec * h1);
    float d2 = length(p - ARM_C - cp * h2);
    float along = d1 < d2 ? h1 * 0.6 : 0.6 + h2 * 0.4;
    // Rigid from the wrist down, so the paw keeps its shape as it slides.
    // The blend is wide enough that the body never folds over as the paw moves.
    return smoothstep(0.0, 0.6, along) * (1.0 - smoothstep(1.15, 2.85, min(d1, d2))) * (1.0 - headShare(p));
  }

  // Inverse of the paw sliding on the glass: around the cup's axis and up its slope.
  vec3 pawInverse(vec3 p, float w) {
    float a = -uPawMove.x * w, c = cos(a), s = sin(a);
    vec3 q = vec3(c * p.x + s * p.z, p.y - uPawMove.y * w, -s * p.x + c * p.z);
    float radius = length(q.xz);
    q.xz *= (radius - SLOPE * uPawMove.y * w) / max(radius, 0.001);
    return q;
  }

  // share reports how much of the point went with the skull (.x) and with the
  // pressed paw (.y), for turning directions back the same way.
  vec3 warp(vec3 p, out vec2 share) {
    vec3 q = p;
    share = vec2(0.0);
    if (uHeadOn > 0.5) {
      float w = headShare(q);
      if (w > 0.001) q = mix(q, NECK_PIVOT + uHeadInv * (q - NECK_PIVOT - uHeadMove), w);
      share.x = w;
    }
    if (uPawMove.z > 0.5) {
      // The share depends on the resting position, which is what we are solving
      // for; a few fixed-point steps from the fully-moved guess settle it.
      vec3 start = q;
      float w = 1.0;
      for (int i = 0; i < 6; i++) {
        q = pawInverse(start, w);
        w = mix(w, armShare(q), 0.6);
      }
      q = pawInverse(start, w);
      share.y = w;
    }
    if (uEar != 0.0 || uEarSwivel != 0.0) {
      vec3 e = q - EAR_C;
      float along = dot(e, EAR_UP);
      if (along > -0.35 && dot(e, e) < 9.0) {
        float w = smoothstep(-0.35, 0.55, along);
        e = rotateAbout(e, EAR_ACROSS, uEar * w);
        e = rotateAbout(e, EAR_UP, -uEarSwivel * w);
        q = EAR_C + e;
      }
    }
    // The glass holds the body, so these motions fade out at the wall.
    float free_ = smoothstep(0.0, 0.8, R0 + SLOPE * p.y - WALL - length(p.xz));
    vec3 d = q - BREATH_C;
    float len2 = dot(d, d);
    float bodyShare = exp(-len2 / 13.0);
    q -= d / (sqrt(len2) + 0.001) * uBreath * 0.05 * bodyShare * free_;
    q -= (uJiggle + uSlosh) * free_ * exp(-len2 / 20.0);
    if (uShiver > 0.002) q.x -= sin(uClock * 70.0) * uShiver * 0.028 * free_;
    if (uImpactN > 0) {
      vec3 dir;
      tapWaves(p, dir);
      q -= dir * 0.055 * free_;
    }
    return q;
  }

  vec3 warp(vec3 p) { vec2 share; return warp(p, share); }

  // The direction a normal had on the resting cat: the head's turn and the
  // paw's swing around the cup are undone, as warp undoes them for the point.
  vec3 restNormal(vec3 n, vec2 share) {
    vec3 m = share.x > 0.001 ? mix(n, uHeadInv * n, share.x) : n;
    if (share.y > 0.001) {
      float a = -uPawMove.x * share.y, c = cos(a), s = sin(a);
      m = vec3(c * m.x + s * m.z, m.y, -s * m.x + c * m.z);
    }
    return normalize(m);
  }

  float sdCat(vec3 p) {
    vec3 q = abs(p - FIELD_C) - FIELD_H;
    float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    if (box > -0.03) return max(box, 0.08);
    return texture(uCat, (warp(p) - FIELD_MIN) / FIELD_SIZE).r;
  }

  vec3 nCat(vec3 p) {
    vec2 e = vec2(0.045, 0.0);
    return normalize(vec3(sdCat(p + e.xyy) - sdCat(p - e.xyy),
      sdCat(p + e.yxy) - sdCat(p - e.yxy), sdCat(p + e.yyx) - sdCat(p - e.yyx)));
  }

  // The resting cat, untouched by any motion. Anything that is fixed to the body
  // (markings, painted shading) is looked up there, so it rides along when the
  // head turns or the paw slides.
  vec2 restField(vec3 q) { return texture(uCat, (q - FIELD_MIN) / FIELD_SIZE).rg; }

  // How far along the axis from a to b a point lies, in centimetres.
  float distanceAlong(vec3 p, vec3 a, vec3 b) { return dot(p - a, normalize(b - a)); }

  // The skull and the two pinnae standing on it, in the resting pose. .x is the
  // whole head, .y only the part of the pinnae that stands clear of the skull.
  vec2 headMask(vec3 q) {
    float k = length(((q - HEAD_C) * HEAD_R) / HEAD_RADII);
    float ears = 1.0 - smoothstep(0.9, 1.4, min(segmentDistance(q, EAR_C, EAR_TIP), segmentDistance(q, EAR1_C, EAR1_TIP)));
    return vec2(max(1.0 - smoothstep(1.02, 1.3, k), ears), ears * smoothstep(1.0, 1.08, k));
  }

  // How close a point of the cat lies to its own outline, as this viewer sees
  // it. Rays shifted sideways by the given width are followed past the point;
  // one that finds no cat there has stepped off the silhouette. This is the
  // painter's outline: the same width on a thin ear as on a round skull, and
  // always where the edge actually is, whatever the pose or the view.
  float outlineNear(vec3 p, vec3 rd, float width) {
    const float REACH = 0.35;
    vec3 u = normalize(cross(rd, abs(rd.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 v = cross(rd, u);
    float open = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = 1.0471976 * float(i) + 0.3;
      vec3 o = p + (u * cos(a) + v * sin(a)) * width - rd * REACH;
      float t = 0.0, nearest = 1.0;
      for (int k = 0; k < 5; k++) {
        float d = sdCat(o + rd * t);
        nearest = min(nearest, d);
        if (d < 0.004) break;
        t += max(d, 0.03);
        if (t > 2.0 * REACH) break;
      }
      open = max(open, smoothstep(0.0, 0.035, nearest));
    }
    return open;
  }

  // Sphere trace through air with both surfaces as obstacles.
  bool marchAir(vec3 ro, vec3 rd, float limit, out float tHit, out int kind) {
    float t = 0.0;
    // Skip free space above the table quickly.
    for (int i = 0; i < 110; i++) {
      vec3 p = ro + rd * t;
      float g = sdGlass(p);
      float c = sdCat(p);
      float d = min(g, c);
      if (d < HIT) { tHit = t; kind = g < c ? GLASS : GEL; return true; }
      t += d * 0.96;
      if (t > limit) break;
    }
    return false;
  }

  bool marchGlass(vec3 ro, vec3 rd, out float tHit) {
    float t = 0.0;
    for (int i = 0; i < 72; i++) {
      float d = -sdGlass(ro + rd * t);
      if (d < HIT) { tHit = t; return true; }
      t += max(d * 0.96, 0.0012);
    }
    tHit = t;
    return false;
  }

  float marchGel(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 56; i++) {
      float d = -sdCat(ro + rd * t);
      if (d < HIT * 2.0) break;
      t += max(d * 0.9, 0.006);
      // Deep gel is simply opaque; no need to measure past the shading bands.
      if (t > 3.2) break;
    }
    return t;
  }

  // ---- Optics -------------------------------------------------------------
  float dielectric(float cosI, float eta, out float cosT) {
    float s2 = eta * eta * (1.0 - cosI * cosI);
    if (s2 >= 1.0) { cosT = 0.0; return 1.0; }
    cosT = sqrt(1.0 - s2);
    float a = (eta * cosI - cosT) / (eta * cosI + cosT);
    float b = (cosI - eta * cosT) / (cosI + eta * cosT);
    return 0.5 * (a * a + b * b);
  }

  // ---- Studio: a bright-field sweep with black flags and softboxes. --------
  // Bright-field glass photography lights the background and lets flags and
  // cards define the edges; the rig is fixed in the world, not to the camera.
  float card(vec3 d, vec3 axis, vec3 upv, vec2 extent, float soft) {
    vec3 right = normalize(cross(upv, axis));
    vec3 up = cross(axis, right);
    float f = dot(d, axis);
    if (f <= 0.0) return 0.0;
    vec2 uv = vec2(dot(d, right), dot(d, up)) / f;
    vec2 w = vec2(sin(uv.y * 9.0 + 1.3), sin(uv.x * 7.0 - 0.6)) * 0.012;
    vec2 k = 1.0 - smoothstep(extent - soft, extent + soft, abs(uv) + w);
    return k.x * k.y;
  }

  vec3 env(vec3 d) {
    vec3 c = BACKDROP;
    // A small, hard-edged window gives the wet surface its square highlight.
    return c;
  }

  vec3 keyLight(vec3 d) {
    float key = card(d, KEY_DIR, vec3(0, 1, 0), vec2(0.07, 0.05), 0.012);
    return WHITE * key * 16.0;
  }

  // The table stays level while the cup can tip, so its plane moves in cup space.
  float tableT(vec3 ro, vec3 rd) {
    float facing = dot(uCupUp, rd);
    return facing < -1e-5 ? dot(uCupUp, uCupPivot - ro) / facing : NONE;
  }

  vec3 tableColor(vec3 p0, vec3 rd) {
    vec3 p = uCupPivot + uCupRot * (p0 - uCupPivot);
    vec3 c = BACKDROP;
    // A soft pool of light where the thick foot focuses the key on the table.
    float r = length(p.xz);
    float front = smoothstep(0.0, 1.0, p.z / max(r, 0.001));
    float glow = exp(-sq(p.x / 1.8)) * exp(-max(p.z - R0, 0.0) / 0.55) * front;
    return mix(c, WHITE, 0.55 * glow * smoothstep(R0 - 0.6, R0, r));
  }

  // Painted flags: returns image-space uv of a world point seen by the reference
  // camera, with the azimuth of the live camera removed.
  vec2 plateUv(vec3 p, float azimuth) {
    float c = cos(azimuth), s = sin(azimuth);
    vec3 q = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
    vec3 v = q - REF_C;
    float z = dot(v, REF_F);
    vec2 px = vec2(0.5 * REF_FRAME + REF_FOCAL * dot(v, REF_R) / z, 0.5 * REF_FRAME - REF_FOCAL * dot(v, REF_U) / z);
    return vec2(px.x, REF_FRAME - px.y) / REF_FRAME;
  }

  // How much of the painted shading a point of the resting cat receives. The
  // plate is a picture taken from one place: it lands on the first surface the
  // painter saw, thins out where that surface turned away, and never reaches
  // anything hidden behind it. Without this the paint runs straight through the
  // cat and shows up as stray streaks once the view moves off the painting's.
  float plateSeen(vec3 q, vec3 nq, vec2 uv) {
    float facing = smoothstep(0.02, 0.2, -dot(nq, normalize(q - REF_C)));
    float behind = dot(q - REF_C, REF_F) - REF_DIST - texture(uRefDepth, uv).r;
    return facing * (1.0 - smoothstep(0.1, 0.3, behind));
  }

  // ---- Painted markings ----------------------------------------------------
  float circle(vec2 p, float r, float w) { return 1.0 - smoothstep(r - w, r + w, length(p)); }

  // Distance to a segment with a radius that varies linearly along it.
  float taper(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    return length(p - a - ab * t) - mix(ra, rb, t);
  }

  vec4 eyeDecal(vec2 q, int index) {
    float r = EYE_R[index] * uEyeScale;
    // When the eye turns, the cornea shifts a little and the dark inside more.
    vec2 uv = (q - EYE_POS[index] - uGaze * vec2(0.075, 0.06)) / r;
    vec2 buv = uv;
    buv.y /= max(uBlink, 0.06);
    // Lids close along a gentle curve rather than a straight slit.
    buv.y += (1.0 - uBlink) * 0.35 * buv.x * buv.x;
    float len = length(buv);

    if (index == 1 && uTearGrow > 0.01) {
      // The left eye wells over: a meniscus neck carries the tear to a hanging
      // bead about 2 mm across, below water's 2.7 mm capillary length.
      float swell = max(uTearGrow - 1.0, 0.0);
      float formed = min(uTearGrow, 1.0);
      vec2 tip = vec2(-0.25, mix(-0.9, -1.26, formed) - swell * 0.5);
      float drop = taper(uv, vec2(-0.1, -0.56), tip, 0.44 * mix(0.2, 1.0, uTearNeck), 0.23 * formed + swell * 0.28);
      float dropMask = 1.0 - smoothstep(-0.01, 0.03, drop);
      // As the lid drops the meniscus lets go; the bead stays on the cheek.
      dropMask *= mix(1.0 - smoothstep(-1.02, -0.9, uv.y), 1.0, smoothstep(0.75, 1.0, uBlink));
      float inDisc = 1.0 - smoothstep(0.96, 1.0, len);
      if (dropMask > 0.002 && inDisc < 0.5) {
        float axis = clamp((-uv.y - 0.95) / 0.5, 0.0, 1.0);
        vec3 tint = mix(EYE_L, vec3(0.62, 0.73, 0.84), axis);
        float inner = 1.0 - smoothstep(0.06, 0.2, length((uv - tip - vec2(-0.02, -0.04)) * vec2(1.25, 0.85)));
        tint = mix(tint, WHITE, inner * 0.65);
        float edge = smoothstep(-0.09, -0.02, drop);
        tint = mix(tint, mix(CYAN, WHITE, axis), edge * 0.75);
        vec2 g2 = uv - vec2(0.33, -0.78);
        float gleam2 = (1.0 - smoothstep(0.11, 0.14, abs(g2.x))) * (1.0 - smoothstep(0.15, 0.18, abs(g2.y)));
        tint = mix(tint, WHITE, gleam2);
        return vec4(tint, dropMask);
      }
    }

    float halo = (1.0 - smoothstep(1.03, 1.1, len)) * smoothstep(0.98, 1.02, len);
    if (len > 1.1) return vec4(0.0);
    vec2 inner = buv - uGaze * vec2(0.28, 0.22);
    float wob = 0.09 * sin(inner.x * 7.0 + float(index) * 2.1) + 0.05 * sin(inner.x * 15.0 - 1.3);
    float upper = smoothstep(0.26, 0.31, inner.y + wob);
    // The lit lower lobe of the cornea swells to the right of centre.
    float crest = (index == 0 ? -0.42 : -0.26) + 0.24 * exp(-sq((inner.x - 0.2) / 0.5)) - wob * 0.6;
    float lower = 1.0 - smoothstep(crest - 0.03, crest + 0.02, inner.y);
    vec3 ink = mix(EYE_M, EYE_T, upper);
    ink = mix(ink, EYE_L, lower);
    // A pupil opens when the kitten is interested; none shows at rest.
    if (uPupil > 0.01) {
      float pupil = 1.0 - smoothstep(0.34, 0.62, length(inner + vec2(0.0, 0.02)));
      ink = mix(ink, EYE_T * 0.6, pupil * uPupil * 0.6);
    }
    // The hard square gleam of a window on the cornea.
    // It is a reflection, so it stays put while the eye turns beneath it.
    vec2 g = buv + uGaze * vec2(0.075, 0.06) / r - (index == 0 ? vec2(0.62, -0.72) : vec2(0.45, -0.74));
    float gleam = (1.0 - smoothstep(0.12, 0.15, abs(g.x))) * (1.0 - smoothstep(0.14, 0.17, abs(g.y)));
    ink = mix(ink, WHITE, gleam);
    float disc = 1.0 - smoothstep(0.96, 1.0, len);
    vec3 color = mix(CYAN, ink, disc);
    return vec4(color, max(disc, halo * 0.75));
  }

  // Markings are fixed to the skin: both the point and its normal are those of
  // the resting pose, so a turned head or a sliding paw keeps its own.
  vec4 decals(vec3 p, vec3 n) {
    vec3 q = (p - HEAD_C) * HEAD_R;
    vec3 ln = n * HEAD_R;
    if (q.z > 0.6 && ln.z > 0.12) {
      for (int i = 0; i < 2; i++) {
        vec4 e = eyeDecal(q.xy, i);
        if (e.a > 0.001) return e;
      }
      vec2 nose = (q.xy - NOSE_POS - vec2(0.012, 0.03)) / vec2(0.105, 0.07);
      float noseMask = 1.0 - smoothstep(0.7, 1.05, pow(pow(abs(nose.x), 2.6) + pow(abs(nose.y), 2.6), 1.0 / 2.6));
      if (noseMask > 0.001) return vec4(mix(NOSE_C, EYE_M, smoothstep(-0.2, 0.7, nose.x)), noseMask);
    }
    vec3 foot = (p - PAW_C) * PAW_R;
    if (foot.z > -0.2 && abs(foot.x) < 1.0 && abs(foot.y) < 1.0) {
      float facing = smoothstep(0.2, 0.55, dot(n, PAW_R[2]));
      vec2 s = foot.xy - PAD_POS;
      // Metacarpal pad: rounded triangle with a shallow three-lobed heel.
      float widen = 1.0 + 0.42 * clamp(-s.y / 0.36, -1.0, 1.0);
      vec2 tp = vec2(s.x / widen, s.y) / vec2(0.285, 0.36);
      float heel = 0.06 * cos(s.x * 15.0);
      float pad = 1.0 - smoothstep(0.92, 1.06, length(vec2(tp.x, tp.y + (s.y < 0.0 ? heel : 0.0))));
      float toe = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 t = foot.xy - TOE_POS[i] * (1.0 + 0.16 * uToeSpread);
        float tilt = (float(i) - 1.5) * -0.22;
        t = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * t;
        toe = max(toe, 1.0 - smoothstep(0.88, 1.08, length(t / vec2(0.115, 0.185))));
      }
      if (max(pad, toe) * facing > 0.002) {
        vec3 tint = mix(PAD_C, CYAN, smoothstep(0.12, 0.38, s.x - s.y * 0.4) * 0.8);
        return vec4(pad > toe ? tint : TOE_C, max(pad, toe) * facing);
      }
    }
    return vec4(0.0);
  }

  // ---- Water-gel body ------------------------------------------------------
  // Thin parts let the set through; deep parts scatter to an even pale body.
  // At the edge light has crossed only a little gel, so it stays saturated.
  // p, n and rd describe the living cat as it is seen; rest is the same point of
  // skin on the resting cat, for whatever belongs to the body rather than the view.
  vec4 gelBody(vec3 p, vec3 rest, vec3 n, vec3 rd, float th, out float crisp) {
    float nv = clamp(-dot(rd, n), 0.0, 1.0);
    vec2 h = vec2(0.42, 0.9);
    float ao = clamp(sdCat(p + n * h.x) / h.x, 0.0, 1.0);
    float ao2 = clamp(sdCat(p + n * h.y) / h.y, 0.0, 1.0);
    float part = restField(rest).g;
    // The studio stays level when the cup is tipped: up and the key light are
    // the world's, not the cup's.
    vec3 nw = uCupRot * n;
    crisp = 0.0;

    vec3 c = mix(BODY, BODY_L, part);
    // Creases between masses: shallow and painterly, not an outline.
    float crease = (1.0 - smoothstep(0.34, 0.55, ao)) * (1.0 - smoothstep(0.3, 0.7, ao2)) * smoothstep(5.4, 4.6, rest.y);
    c = mix(c, mix(SHADOW, SHADOW_D, 1.0 - smoothstep(0.12, 0.3, ao)), crease * 0.4);

    // Bands inside the silhouette: cyan on the flanks, grey-blue on top.
    float top = smoothstep(0.1, 0.65, nw.y);
    vec3 bandColor = mix(CYAN, vec3(0.60, 0.72, 0.84), top);
    float band = (1.0 - smoothstep(2.1, 2.9, th)) * (1.0 - part * 0.7) * smoothstep(0.3, 0.0, part - 0.4);
    // The raised paw is firm against the glass; no bright thin edge around it.
    band *= smoothstep(1.15, 1.8, distance(rest, PAW_C));
    c = mix(c, bandColor, band);
    float line = 1.0 - smoothstep(0.1, 0.42, th);
    c = mix(c, mix(PERI, SHADOW_D, top), line);

    // Contours of the head. These depend on where the viewer and the key light
    // are, so they are worked out here for every view and pose instead of being
    // painted on. A round mass never gets thin along the refracted ray, so its
    // outline comes from the grazing angle: a paler band inside the edge and a
    // line on the edge itself, which deepens on the side away from the key light.
    vec2 head = headMask(rest);
    float drawn = 0.0;
    if (head.x > 0.001) {
      float lit = dot(nw, KEY_DIR);
      float shade = 1.0 - smoothstep(0.1, 0.6, lit);
      float inside = (1.0 - smoothstep(0.46, 0.62, nv)) * top * head.x;
      float edge = (1.0 - smoothstep(0.33, 0.46, nv)) * top * head.x;
      c = mix(c, CROWN_BAND, inside * 0.9);
      c = mix(c, mix(CROWN_LINE, CROWN_DEEP, shade), edge * mix(0.75, 1.0, shade));
      crisp = max(inside * 0.5, edge);
      // A pinna is a thin shell: a pale membrane with a drawn edge. The edge is
      // periwinkle where it faces up, like the crown, and cyan on the flanks.
      // Near the root the key light has further to go through the gel, and
      // where it gets in the edge deepens to a vivid blue. Underneath, the edge
      // all but disappears.
      if (head.y > 0.001) {
        float outline = outlineNear(p, rd, 0.1) * head.y;
        vec3 wall = mix(mix(CYAN, PERI, 0.45), EAR_EDGE, smoothstep(-0.2, 0.5, nw.y));
        bool left = segmentDistance(rest, EAR_C, EAR_TIP) < segmentDistance(rest, EAR1_C, EAR1_TIP);
        float root = 1.0 - smoothstep(0.15, 0.8, left ? distanceAlong(rest, EAR_C, EAR_TIP) : distanceAlong(rest, EAR1_C, EAR1_TIP));
        wall = mix(wall, CYAN_D, root * 0.75 * smoothstep(0.45, 0.7, lit));
        outline *= 1.0 - 0.65 * smoothstep(-0.05, -0.45, nw.y);
        c = mix(c, EAR_MEMBRANE, head.y);
        c = mix(c, wall, outline);
        crisp = max(crisp, outline);
        // An outline is seen even where the gel behind it is too thin to show.
        drawn = outline;
      }
    }

    // Passing waves show as paler crests and bluer troughs.
    if (uImpactN > 0) {
      vec3 dir;
      float wave = tapWaves(p, dir);
      c = mix(c, WHITE, clamp(wave, 0.0, 1.0) * 0.42);
      c = mix(c, SHADOW, clamp(-wave, 0.0, 1.0) * 0.4);
    }
    // A purr drives faint rings from the throat: spacing is that of 26 Hz
    // capillary waves on water (about 1 cm), their motion slowed to be visible.
    if (uPurr > 0.01) {
      float r = length(p - THROAT);
      float ring = sin(6.28 * r - uClock * 22.0) * exp(-r / 2.6) * uPurr;
      c = mix(c, WHITE, clamp(ring, 0.0, 1.0) * 0.18);
      c = mix(c, SHADOW, clamp(-ring, 0.0, 1.0) * 0.16);
    }

    float o = max(smoothstep(0.03, 0.34, th), drawn);
    return vec4(c, o);
  }

  vec3 beadColor(vec3 p, vec3 rd) {
    vec3 n = normalize(p - uDrop.xyz);
    float nv = clamp(-dot(rd, n), 0.0, 1.0);
    vec3 c = mix(CYAN, EYE_L, smoothstep(0.15, 0.7, nv));
    float gleam = smoothstep(0.86, 0.94, dot(reflect(rd, n), normalize(vec3(0.3, 0.8, 0.5))));
    return mix(c, WHITE, gleam);
  }

  // ---- Path ---------------------------------------------------------------
  vec3 radiance(vec3 ro, vec3 rd, out float strength) {
    vec3 L = vec3(0.0), T = vec3(1.0);
    int med = AIR;
    strength = 1.0;
    for (int bounce = 0; bounce < 14; bounce++) {
      if (med == AIR) {
        float tTable = tableT(ro, rd);
        float t; int kind;
        bool hit = marchAir(ro, rd, min(tTable, 400.0), t, kind);
        // A detached tear is a tiny sphere in the air, drawn over what lies behind it.
        if (uDrop.w > 0.0) {
          vec3 oc = ro - uDrop.xyz;
          float b = dot(oc, rd);
          float disc = b * b - dot(oc, oc) + sq(uDrop.w);
          if (disc > 0.0) {
            float td = -b - sqrt(disc);
            if (td > 0.0 && (!hit || td < t)) return L + T * beadColor(ro + rd * td, rd);
          }
        }
        if (!hit) {
          return L + T * (tTable < NONE ? tableColor(ro + rd * tTable, rd) : env(rd));
        }
        vec3 p = ro + rd * t;
        if (kind == GLASS) {
          vec3 n = nGlass(p);
          float cosI = clamp(-dot(rd, n), 0.0, 1.0), cosT;
          float R = dielectric(cosI, 1.0 / N_GLASS, cosT);
          L += T * R * env(reflect(rd, n));
          T *= 1.0 - R;
          if (bounce == 0 && uPlateOn > 0.5) {
            vec4 flag = texture(uGlassPlate, plateUv(p, uPlateAzimuth));
            if (flag.a > 0.003) {
              vec3 tint = pow(flag.rgb / flag.a, vec3(2.2));
              L = mix(L, tint, flag.a);
              T *= 1.0 - flag.a;
              strength = mix(strength, 0.22, flag.a);
            }
            if (max(T.r, max(T.g, T.b)) < 0.01) return L;
          }
          // Condensation from the kitten's breath, on the glass in front of it.
          if (bounce == 0 && uFogOn > 0.5) {
            float fog = texture(uFog, vec2(atan(p.x, p.z) / 6.2831853 + 0.5, p.y / CUP_H)).r;
            if (fog > 0.003) {
              float a = clamp(fog, 0.0, 1.0) * 0.93;
              L = mix(L, FOG_C, a);
              T *= 1.0 - a;
              strength = mix(strength, 0.7, a);
              if (max(T.r, max(T.g, T.b)) < 0.01) return L;
            }
          }
          float eta = 1.0 / N_GLASS;
          rd = normalize(eta * rd + (eta * cosI - cosT) * n);
          ro = p - n * GAP;
          med = GLASS;
        } else {
          vec3 n = nCat(p);
          float cosI = clamp(-dot(rd, n), 0.0, 1.0), cosT;
          float R = dielectric(cosI, 1.0 / N_GEL, cosT);
          L += T * R * env(reflect(rd, n));
          T *= 1.0 - R;
          float eta = 1.0 / N_GEL;
          vec3 inside = normalize(eta * rd + (eta * cosI - cosT) * n);
          vec3 start = p - n * GAP;
          float th = marchGel(start, inside);
          vec3 reflected = reflect(rd, n);
          // The same point of skin on the resting cat, and how it faced there.
          vec2 share;
          vec3 rest = warp(p, share);
          vec3 nr = restNormal(n, share);
          // The head alone carries the window highlight, as in the painting. The
          // window belongs to the studio, so it does not tip over with the cup.
          if (rest.y > 6.2) L += T * keyLight(uCupRot * reflected);
          vec4 mark = decals(rest, nr);
          float crisp;
          vec4 body = gelBody(p, rest, n, rd, th, crisp);
          strength = mix(strength, 0.4, crisp);
          if (uPlateOn > 0.5) {
            vec2 uv = plateUv(rest, 0.0);
            vec4 painted = texture(uCatPlate, uv);
            if (painted.a > 0.003) {
              painted *= plateSeen(rest, nr, uv);
              vec3 tint = pow(painted.rgb / max(painted.a, 1e-4), vec3(2.2));
              body.rgb = mix(body.rgb, tint, painted.a);
              body.a = max(body.a, painted.a);
              strength = mix(strength, 0.3, painted.a);
            }
          }
          if (mark.a > 0.003) strength = min(strength, 0.25);
          body.rgb = mix(body.rgb, mark.rgb, mark.a);
          body.a = max(body.a, mark.a);
          L += T * body.a * body.rgb;
          T *= 1.0 - body.a;
          if (max(T.r, max(T.g, T.b)) < 0.012) return L;
          vec3 q = start + inside * th;
          vec3 nq = nCat(q);
          float c2 = clamp(dot(inside, nq), 0.0, 1.0), ct2;
          float R2 = dielectric(c2, N_GEL, ct2);
          if (R2 > 0.999) return L + T * BODY;
          T *= 1.0 - R2;
          rd = normalize(N_GEL * inside + (ct2 - N_GEL * c2) * nq);
          ro = q + nq * GAP * 2.0;
          med = AIR;
        }
      } else if (med == GLASS) {
        float t;
        if (!marchGlass(ro, rd, t)) return L + T * env(rd);
        vec3 p = ro + rd * t;
        T *= exp(-vec3(0.05, 0.022, 0.012) * t);
        vec3 n = -nGlass(p);
        float cosI = clamp(-dot(rd, n), 0.0, 1.0), cosT;
        float R = dielectric(cosI, N_GLASS, cosT);
        if (R >= 0.9995) {
          rd = reflect(rd, n);
          ro = p + n * GAP;
          continue;
        }
        L += T * R * env(reflect(rd, n));
        T *= 1.0 - R;
        rd = normalize(N_GLASS * rd + (N_GLASS * cosI - cosT) * n);
        ro = p - n * GAP;
        med = AIR;
      }
      if (max(T.r, max(T.g, T.b)) < 0.01) return L;
    }
    return L + T * env(rd);
  }

  // Inspection render: the kitten's body alone, as modelling clay.
  vec3 clay(vec3 ro, vec3 rd) {
    float t = 0.0;
    float g = NONE;
    for (int i = 0; i < 160; i++) {
      vec3 p = ro + rd * t;
      float d = sdCat(p);
      if (d < HIT) {
        vec3 n = nCat(p);
        float lit = 0.5 + 0.5 * max(dot(n, normalize(vec3(-0.5, 0.75, 0.55))), 0.0);
        float ao = clamp(sdCat(p + n * 0.35) / 0.35, 0.0, 1.0);
        return vec3(0.82, 0.78, 0.74) * lit * mix(0.55, 1.0, ao);
      }
      t += d * 0.95;
      if (t > 260.0) break;
    }
    return BACKDROP;
  }

  void main() {
    vec2 px = gl_FragCoord.xy - 0.5 * uRes;
    // Everything is traced in the cup's own frame, so tipping the cup moves its
    // glass, its painted flags and the kitten together.
    vec3 ro = uCupPivot + uCupInv * (uCam - uCupPivot);
    vec3 rd = uCupInv * normalize(uForward * uFocal + uRight * px.x + uUp * px.y);
    float strength = 1.0;
    // Rays that never come near the cup just see the studio; no marching.
    float closest = dot(ro.xz, ro.xz) - sq(dot(ro.xz, rd.xz)) / dot(rd.xz, rd.xz);
    if (uMode == 0 && closest > 4.85 * 4.85) {
      float tTable = tableT(ro, rd);
      outColor = vec4(tTable < NONE ? tableColor(ro + rd * tTable, rd) : env(rd), 1.0);
      return;
    }
    vec3 color = uMode == 1 ? clay(ro, rd) : radiance(ro, rd, strength);
    outColor = vec4(max(color, vec3(0.0)), uMode == 0 ? strength : 1.0);
  }
  `;
}
