// Painterly post-processing: an anisotropic Kuwahara filter (Kyprianidis, Kang &
// Doellner 2009, with the polynomial sector weights of the 2011 follow-up).
// It flattens colour along local structure and keeps region edges hard.

export const postVertex = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const tensorFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uImage;
  uniform vec2 uTexel;
  vec3 at(vec2 o) { return texture(uImage, vUv + o * uTexel).rgb; }
  void main() {
    vec3 sx = (-1.0 * at(vec2(-1, -1)) - 2.0 * at(vec2(-1, 0)) - 1.0 * at(vec2(-1, 1))
      + 1.0 * at(vec2(1, -1)) + 2.0 * at(vec2(1, 0)) + 1.0 * at(vec2(1, 1))) / 4.0;
    vec3 sy = (-1.0 * at(vec2(-1, -1)) - 2.0 * at(vec2(0, -1)) - 1.0 * at(vec2(1, -1))
      + 1.0 * at(vec2(-1, 1)) + 2.0 * at(vec2(0, 1)) + 1.0 * at(vec2(1, 1))) / 4.0;
    outColor = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.0);
  }
`;

export const blurFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uImage;
  uniform vec2 uStep;
  void main() {
    vec4 sum = texture(uImage, vUv) * 0.2270270;
    sum += (texture(uImage, vUv + uStep * 1.3846) + texture(uImage, vUv - uStep * 1.3846)) * 0.3162162;
    sum += (texture(uImage, vUv + uStep * 3.2308) + texture(uImage, vUv - uStep * 3.2308)) * 0.0702703;
    outColor = sum;
  }
`;

export const kuwaharaFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uImage;
  uniform sampler2D uTensor;
  uniform vec2 uTexel;
  uniform float uRadius;

  void main() {
    vec4 t = texture(uTensor, vUv);
    float root = sqrt(max(t.y * t.y - 2.0 * t.x * t.y + t.x * t.x + 4.0 * t.z * t.z, 0.0));
    float l1 = 0.5 * (t.y + t.x + root);
    float l2 = 0.5 * (t.y + t.x - root);
    // Nothing to flatten where the image has no structure: backdrop and open
    // body. Skipping them saves most of this pass's cost.
    if (l1 + l2 < 1.2e-5) {
      outColor = vec4(texture(uImage, vUv).rgb, 1.0);
      return;
    }
    vec2 v = vec2(l1 - t.x, -t.z);
    float lengthV = length(v);
    vec2 dir = lengthV > 1e-7 ? v / lengthV : vec2(0.0, 1.0);
    float phi = -atan(dir.y, dir.x);
    float A = (l1 + l2) > 1e-7 ? (l1 - l2) / (l1 + l2) : 0.0;

    float radius = max(uRadius * texture(uImage, vUv).a, 1.2);
    const float alpha = 1.0;
    float a = radius * clamp((alpha + A) / alpha, 0.1, 2.0);
    float b = radius * clamp(alpha / (alpha + A), 0.1, 2.0);
    float cosPhi = cos(phi);
    float sinPhi = sin(phi);
    mat2 R = mat2(cosPhi, -sinPhi, sinPhi, cosPhi);
    mat2 S = mat2(0.5 / a, 0.0, 0.0, 0.5 / b);
    mat2 SR = S * R;
    int maxX = int(sqrt(a * a * cosPhi * cosPhi + b * b * sinPhi * sinPhi));
    int maxY = int(sqrt(a * a * sinPhi * sinPhi + b * b * cosPhi * cosPhi));

    const float zeta = 2.0 / 4.0;
    const float zeroCross = 2.0;
    float sinZero = sin(zeroCross);
    float eta = (zeta + cos(zeroCross)) / (sinZero * sinZero);

    vec4 m[8];
    vec3 s[8];
    for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }

    float w[8];
    for (int y = -maxY; y <= maxY; y++) {
      for (int x = -maxX; x <= maxX; x++) {
        if (((x + y) & 1) != 0 && max(abs(x), abs(y)) > 3) continue;
        vec2 p = SR * vec2(float(x), float(y));
        if (dot(p, p) > 0.25) continue;
        vec3 c = clamp(texture(uImage, vUv + vec2(float(x), float(y)) * uTexel).rgb, 0.0, 1.0);
        float sum = 0.0;
        float z;
        float vxx = zeta - eta * p.x * p.x;
        float vyy = zeta - eta * p.y * p.y;
        z = max(0.0, p.y + vxx); w[0] = z * z; sum += w[0];
        z = max(0.0, -p.x + vyy); w[2] = z * z; sum += w[2];
        z = max(0.0, -p.y + vxx); w[4] = z * z; sum += w[4];
        z = max(0.0, p.x + vyy); w[6] = z * z; sum += w[6];
        vec2 q = 0.70710678 * vec2(p.x - p.y, p.x + p.y);
        vxx = zeta - eta * q.x * q.x;
        vyy = zeta - eta * q.y * q.y;
        z = max(0.0, q.y + vxx); w[1] = z * z; sum += w[1];
        z = max(0.0, -q.x + vyy); w[3] = z * z; sum += w[3];
        z = max(0.0, -q.y + vxx); w[5] = z * z; sum += w[5];
        z = max(0.0, q.x + vyy); w[7] = z * z; sum += w[7];
        float g = exp(-3.125 * dot(p, p)) / max(sum, 1e-6);
        for (int k = 0; k < 8; k++) {
          float wk = w[k] * g;
          m[k] += vec4(c * wk, wk);
          s[k] += c * c * wk;
        }
      }
    }
    vec4 result = vec4(0.0);
    for (int k = 0; k < 8; k++) {
      if (m[k].w < 1e-6) continue;
      vec3 mean = m[k].rgb / m[k].w;
      vec3 variance = abs(s[k] / m[k].w - mean * mean);
      float sigma = variance.r + variance.g + variance.b;
      float weight = 1.0 / (1.0 + pow(1000.0 * sigma, 4.0)) + 1e-14;
      result += vec4(mean * weight, weight);
    }
    outColor = vec4(result.rgb / result.a, 1.0);
  }
`;

// Final composite: display encoding and the lens sparkles, which are drawn after
// the filter because a real star filter acts on the light, not on the paint.
export const encodeFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uImage;
  vec3 srgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() { vec4 c = texture(uImage, vUv); outColor = vec4(srgb(c.rgb), c.a); }
`;

export const displayFragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uImage;
  uniform int uRaw;
  uniform vec3 uStar[2];
  uniform vec2 uFrame;
  uniform float uZoom;
  uniform float uGlow;

  float spike(vec2 p, vec2 dir, float len, float width) {
    float along = dot(p, dir);
    if (along < 0.0) return 0.0;
    float across = abs(p.x * dir.y - p.y * dir.x);
    float k = along / len;
    if (k > 1.0) return 0.0;
    float w = width * mix(1.0, 0.04, pow(k, 0.65));
    return (1.0 - smoothstep(w * 0.45, w, across)) * mix(1.0, 0.2, k * k);
  }

  // Four-point star in painting pixels: axes tilted, unequal arms.
  vec2 star(vec2 p) {
    const float tilt = 0.22;
    float c = cos(tilt), s = sin(tilt);
    vec2 up = vec2(-s, c), right = vec2(c, s);
    float core = spike(p, up, 117.0, 6.5) + spike(p, -up, 146.0, 6.5)
      + spike(p, right, 74.0, 5.5) + spike(p, -right, 100.0, 5.5);
    float glow = exp(-dot(p, p) / 150.0) * 1.3 + exp(-dot(p, p) / 1100.0) * 0.28;
    float cyan = spike(p, right, 78.0, 9.5) * 0.7 + spike(p, -right, 104.0, 8.0) * 0.45
      + spike(p, up, 70.0, 9.5) * 0.4 + spike(p, -up, 70.0, 10.0) * 0.5;
    return vec2(clamp(core + glow, 0.0, 1.0), clamp(cyan + glow * 0.5, 0.0, 1.0));
  }

  // The small hollow star: a pinched diamond outline.
  float sparkle(vec2 p) {
    vec2 a = abs(p);
    float outer = pow(pow(a.x, 0.6) + pow(a.y, 0.6), 1.0 / 0.6);
    float ring = (1.0 - smoothstep(13.0, 15.5, outer)) * smoothstep(4.0, 6.5, outer);
    return ring;
  }

  void main() {
    vec3 c = texture(uImage, vUv).rgb;
    if (uRaw == 1) { outColor = vec4(clamp(c, 0.0, 1.0), 1.0); return; }
    // A touch of unsharp masking restores the hard paint edges.
    vec2 texel = 1.0 / vec2(textureSize(uImage, 0));
    vec3 near = 0.25 * (texture(uImage, vUv + vec2(texel.x, 0.0)).rgb + texture(uImage, vUv - vec2(texel.x, 0.0)).rgb
      + texture(uImage, vUv + vec2(0.0, texel.y)).rgb + texture(uImage, vUv - vec2(0.0, texel.y)).rgb);
    vec3 display = clamp(c + (c - near) * 1.1, 0.0, 1.0);
    // uStar[i].xy is in frame-normalised coordinates, .z is intensity.
    vec2 scale = uFrame * uZoom;
    vec2 a = (vUv - uStar[0].xy) * scale * 1280.0;
    a.y = -a.y;
    vec2 st = star(vec2(a.x, -a.y));
    display = mix(display, vec3(0.55, 0.96, 0.95), clamp(st.y * uStar[0].z, 0.0, 1.0) * 0.72);
    display = mix(display, vec3(1.0), clamp(st.x * uStar[0].z, 0.0, 1.0));
    vec2 b = (vUv - uStar[1].xy) * scale * 1280.0;
    if (uGlow > 0.5) {
      display = mix(display, vec3(0.86, 0.95, 1.0), exp(-dot(b, b) / 1500.0) * 0.8);
      display = mix(display, vec3(1.0), exp(-dot(b, b) / 110.0));
    }
    display = mix(display, vec3(1.0), sparkle(uGlow > 0.5 ? b / 1.5 : b) * uStar[1].z * 0.95);
    outColor = vec4(display, 1.0);
  }
`;
