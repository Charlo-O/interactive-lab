import * as THREE from 'three';
import { cup } from './config.js';

const vertex = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outColor;
  uniform sampler2D uPrev;
  uniform float uKeep;
  uniform vec4 uSource;
  uniform float uRate;
  uniform vec4 uWipe;
  uniform float uWipeOn;
  uniform float uWipeRadius;
  uniform vec2 uCm;
  void main() {
    float f = texture(uPrev, vUv).r * uKeep;
    vec2 d = (vUv - uSource.xy) / uSource.zw;
    f += uRate * exp(-dot(d, d));
    if (uWipeOn > 0.5) {
      // Distances are measured in centimetres on the glass.
      vec2 a = uWipe.xy * uCm, b = uWipe.zw * uCm, p = vUv * uCm;
      vec2 pa = p - a, ba = b - a;
      float len2 = dot(ba, ba);
      float h = len2 > 1e-8 ? clamp(dot(pa, ba) / len2, 0.0, 1.0) : 0.0;
      f *= smoothstep(uWipeRadius * 0.55, uWipeRadius, length(pa - ba * h));
    }
    outColor = vec4(min(f, 1.3), 0.0, 0.0, 1.0);
  }
`;

// Condensation on the cup, stored in cylindrical coordinates: u is the azimuth
// around the axis, v the height. It builds up, slowly evaporates and can be wiped.
export class GlassFog {
  constructor(renderer) {
    this.renderer = renderer;
    const make = () => new THREE.WebGLRenderTarget(512, 256, {
      format: THREE.RedFormat, type: THREE.HalfFloatType, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });
    this.a = make();
    this.b = make();
    this.uniforms = {
      uPrev: { value: this.a.texture },
      uKeep: { value: 0 },
      uSource: { value: new THREE.Vector4(0, 0, 1, 1) },
      uRate: { value: 0 },
      uWipe: { value: new THREE.Vector4() },
      uWipeOn: { value: 0 },
      uWipeRadius: { value: 0.23 },
      uCm: { value: new THREE.Vector2(2 * Math.PI * 4.2, cup.height) }
    };
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: fragment,
      uniforms: this.uniforms, depthTest: false, depthWrite: false
    });
    this.scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.camera = new THREE.Camera();
    this.energy = 0;
    this.pendingWipes = [];
    this.pass(0, 0, null);
    this.swap();
  }

  get texture() { return this.a.texture; }

  uv(point) {
    return [Math.atan2(point.x, point.z) / (2 * Math.PI) + 0.5, point.y / cup.height];
  }

  pass(keep, rate, wipe) {
    const u = this.uniforms;
    u.uPrev.value = this.a.texture;
    u.uKeep.value = keep;
    u.uRate.value = rate;
    u.uWipeOn.value = wipe ? 1 : 0;
    if (wipe) u.uWipe.value.set(...wipe);
    this.renderer.setRenderTarget(this.b);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  swap() { [this.a, this.b] = [this.b, this.a]; }

  wipe(fromPoint, toPoint) {
    if (this.energy < 0.01) return;
    this.pendingWipes.push([...this.uv(fromPoint), ...this.uv(toPoint)]);
  }

  // Grows the patch of breath at `source` {u, v, sizeU, sizeV} by `rate` and lets
  // the rest evaporate with a time constant of `tau` seconds.
  step(dt, { source = null, rate = 0, tau = 6 } = {}) {
    if (source) this.uniforms.uSource.value.set(source.u, source.v, source.sizeU, source.sizeV);
    const add = source ? rate * dt : 0;
    if (this.energy < 0.002 && add === 0 && this.pendingWipes.length === 0) return;
    const keep = Math.exp(-dt / tau);
    this.energy = Math.min(1.3, this.energy * keep + add);
    this.pass(keep, add, this.pendingWipes.shift() || null);
    this.swap();
    // Fast fingers can queue several segments in one frame.
    while (this.pendingWipes.length) {
      this.pass(1, 0, this.pendingWipes.shift());
      this.swap();
    }
  }
}
