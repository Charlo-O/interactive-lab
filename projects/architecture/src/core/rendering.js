import * as THREE from '../../assets/vendor/three/three.module.js';
import { VS, FS, LVS, LFS } from './shaders.js';

/** 创建共享渲染状态；所有建筑材质共用 U 中的 uniform 引用。 */
export function createRendering(canvas, pixelRatio) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1.5, 1200);
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 140);

  const U = {
    paper: { value: new THREE.Color() },
    ink: { value: new THREE.Color() },
    red: { value: new THREE.Color() },
    boil: { value: 0 },
    dpr: { value: pixelRatio },
    prog: { value: 0 },
    grow: { value: -99 },
    wash: { value: 0 },
    washY: { value: -20 },
    lineK: { value: 1 },
    hang: { value: 999 },
    shinCol: { value: new THREE.Color() },
    light: { value: new THREE.Vector3(0.55, 0.78, 0.3).normalize() },
  };

  function hatchMat(tone, { open = 0, red = false, noclip = false, hang = false } = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      side: THREE.DoubleSide,
      clipping: true,
      clippingPlanes: noclip ? null : [clip],
      polygonOffset: true,
      polygonOffsetFactor: 1.5,
      polygonOffsetUnits: 2,
      uniforms: {
        uWash: U.wash,
        uWashY: U.washY,
        uHang: U.hang,
        uIsHang: { value: hang ? 1 : 0 },
        uLight: U.light,
        uInk: hang ? U.shinCol : red ? U.red : U.ink,
        uPaper: U.paper,
        uTone: { value: tone },
        uBoil: U.boil,
        uDPR: U.dpr,
        uOpen: { value: open },
        uProg: U.prog,
        uGrow: U.grow,
        uIsGrow: { value: red && !hang ? 1 : 0 },
      },
    });
  }

  function lineMat(
    seed,
    alpha,
    amp,
    { red = false, noclip = false, over = 0, hang = false, wl = false } = {},
  ) {
    return new THREE.ShaderMaterial({
      vertexShader: LVS,
      fragmentShader: LFS,
      transparent: true,
      depthWrite: false,
      clipping: true,
      clippingPlanes: noclip ? null : [clip],
      uniforms: {
        uLineK: U.lineK,
        uWash: U.wash,
        uWashY: U.washY,
        uWL: { value: wl ? 1 : 0 },
        uOver: { value: over },
        uSeed: { value: seed },
        uAmp: { value: amp },
        uBoil: U.boil,
        uInk: hang ? U.shinCol : red ? U.red : U.ink,
        uAlpha: { value: alpha },
        uProg: U.prog,
        uGrow: U.grow,
        uIsGrow: { value: red && !hang ? 1 : 0 },
        uHang: U.hang,
        uIsHang: { value: hang ? 1 : 0 },
      },
    });
  }

  return { renderer, scene, camera, clip, U, hatchMat, lineMat };
}
