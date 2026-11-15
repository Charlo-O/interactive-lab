import * as THREE from '../../assets/vendor/three/three.module.js';

// 福建土楼：尺寸与构造为展示用示意，模型元数据见 docs/ARCHITECTURE.md。
export function buildTulou(toolkit) {
  const {
    state,
    ZERO,
    C,
    V,
    P2,
    RY,
    TAU,
    resetBuild,
    place,
    box,
    beam,
    seg,
    surf,
    band,
    arcB,
    prism,
    segL,
    ring,
    finalize,
  } = toolkit;
  resetBuild();
  state.GNC = true;
  const EW = C('#c9a678'),
    STB = C('#9d978b'),
    TILE = C('#676b6e'),
    RIDG = C('#55595c'),
    WD = C('#a27c54'),
    WDD = C('#7b5b3e'),
    PAV = C('#c2bcac'),
    EARTH = C('#bbb39a'),
    GRA = C('#cfcabf');
  // 外环：外径约 62.6 米，四层、每层 72 间；夯土外墙底厚 1.7 米，向上收分至 1.1 米
  const RO = 31.3,
    RI = 29.6,
    HB = 1.2,
    HW = 13.6,
    ro = (y) => RO - 0.6 * Math.min(1, Math.max(0, y) / HW);
  // 地面：楼外泥土、楼内卵石铺地
  state.PAINT = PAV;
  surf('ground', (u, w) => P2(0.2 + w * (RI - 0.2), 0, u * TAU), 96, 6);
  state.G.ground[state.G.ground.length - 1].userData.rec = ZERO;
  state.PAINT = EARTH;
  surf('ground', (u, w) => P2(RO + 0.1 + w * (72 - RO), 0, u * TAU), 96, 6);
  state.G.ground[state.G.ground.length - 1].userData.rec = ZERO;
  // 环形双坡屋面：外檐 (re,ye) → 脊 (rr,yr) ← 内檐 (rn,yn)
  function ringRoof(re, ye, rr, yr, rn, yn, nu) {
    const T = 0.3,
      out = (v) => [re + (rr - re) * v, ye + (yr - ye) * v],
      inn = (v) => [rn + (rr - rn) * v, yn + (yr - yn) * v];
    state.PAINT = TILE;
    for (const f of [out, inn])
      for (let b = 0; b < 3; b++)
        surf(
          'roof',
          (u, w) => {
            const [r, y] = f((b + w) / 3);
            return P2(r, y, u * TAU);
          },
          nu,
          2,
        );
    state.PAINT = WDD;
    for (const f of [out, inn])
      surf(
        'roof',
        (u, w) => {
          const [r, y] = f(w);
          return P2(r, y - T, u * TAU);
        },
        nu,
        2,
      );
    for (const [r, y] of [
      [re, ye],
      [rn, yn],
    ]) {
      state.PAINT = TILE;
      surf('roof', (u, w) => P2(r, y - w * T, u * TAU), nu, 1);
      for (const dy of [0, -T]) ring('ink', r + (r > rr ? 0.02 : -0.02), y + dy, nu);
    }
    state.PAINT = RIDG;
    arcB('wood', rr, yr - 0.08, 0.5, 0.32, 0, TAU);
    for (const [f, r0] of [
      [out, re],
      [inn, rn],
    ]) {
      const n = Math.round((TAU * r0) / 0.55),
        ps = [],
        [ra, ya] = f(0),
        [rb, yb] = f(0.97);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        ps.push(P2(ra, ya + 0.04, a), P2(rb, yb + 0.04, a));
      }
      segL('ink', ps);
    }
    return (r) =>
      r > rr
        ? ye + ((yr - ye) * (re - r)) / (re - rr) - T
        : yn + ((yr - yn) * (r - rn)) / (rr - rn) - T;
  }
  // 一环木构：nb 开间，墙内皮 rw，房前檐柱 rc，廊柱 rk；楼层标高 fl，顶接屋面
  function ringFrame(rw, rc, rk, fl, nb, under, rail) {
    const da = TAU / nb;
    for (let i = 0; i < fl.length; i++) {
      const y0 = fl[i],
        last = i === fl.length - 1;
      for (let k = 0; k < nb; k++) {
        const a = k * da;
        state.PAINT = WD;
        for (const r of [rc, rk]) {
          const y1 = last ? under(r) : fl[i + 1] - 0.24,
            p = P2(r, 0, a),
            g = new THREE.CylinderGeometry(0.13, 0.14, y1 - y0, 8);
          g.translate(p.x, (y0 + y1) / 2, p.z);
          place(g, 'wood');
        }
        state.FACE = RY(a);
        const y1 = last ? Math.min(under(rc), under(rw)) : fl[i + 1] - 0.24;
        box('wood', 0, (y0 + y1) / 2, (rc + rw) / 2, 0.07, y1 - y0, rw - rc);
        state.FACE = new THREE.Matrix4();
        if (i > 0)
          beam('wood', P2(rk - 0.3, y0 - 0.13, a), P2(rw + 0.25, y0 - 0.13, a), 0.14, 0.22, false);
      }
      // 房前板壁：每间一门一窗
      {
        const y1 = last ? under(rc) : fl[i + 1] - 0.24;
        state.PAINT = WDD;
        arcB('wood', rc, y0, 0.06, y1 - y0, 0, TAU, false);
        const ps = [],
          r = rc - 0.04;
        for (let k = 0; k < nb; k++) {
          const a = k * da,
            Q = (t, y) => P2(r, y, a + da * t),
            R = (t0, y0_, t1, y1_) =>
              ps.push(
                Q(t0, y0_),
                Q(t1, y0_),
                Q(t1, y0_),
                Q(t1, y1_),
                Q(t1, y1_),
                Q(t0, y1_),
                Q(t0, y1_),
                Q(t0, y0_),
              );
          R(0.14, y0 + 0.05, 0.42, y0 + 2.05);
          R(0.58, y0 + 1.0, 0.86, y0 + 1.75);
          ps.push(Q(0.72, y0 + 1.0), Q(0.72, y0 + 1.75));
        }
        segL('ink', ps);
      }
      if (i > 0) {
        state.PAINT = WD;
        arcB('wood', (rk - 0.3 + rw) / 2, y0 - 0.02, rw - rk + 0.3, 0.1, 0, TAU);
        if (rail) {
          arcB('wood', rk - 0.25, y0 + 1.0, 0.1, 0.1, 0, TAU);
          arcB('wood', rk - 0.25, y0 + 0.1, 0.1, 0.08, 0, TAU);
          const ps = [],
            n = Math.round((TAU * rk) / 0.3);
          for (let j = 0; j < n; j++) {
            const a = (j / n) * TAU;
            ps.push(P2(rk - 0.2, y0 + 0.18, a), P2(rk - 0.2, y0 + 1.0, a));
          }
          segL('ink', ps);
        }
      } else {
        state.PAINT = GRA;
        band(
          'stone',
          [
            [rk - 0.6, y0],
            [rw, y0],
          ],
          nb * 3,
        );
        band(
          'stone',
          [
            [rk - 0.6, 0],
            [rk - 0.6, y0],
          ],
          nb * 3,
        );
      }
    }
  }
  // ---- 外环 ----
  // 墙基：河卵石与块石；其上夯土分层版筑，每版约 0.6 米
  state.PAINT = STB;
  band(
    'stone',
    [
      [RO + 0.12, 0],
      [RO + 0.12, HB],
      [RI, HB],
      [RI, 0],
    ],
    180,
  );
  {
    const ps = [];
    for (const y of [0.35, 0.82])
      for (let a = 0; a < TAU;) {
        const w = (0.35 + Math.random() * 0.35) / RO,
          h = 0.18 + Math.random() * 0.08,
          c = a + w;
        for (let q = 0; q < 8; q++) {
          const t0 = (q / 8) * TAU,
            t1 = ((q + 1) / 8) * TAU;
          ps.push(
            P2(RO + 0.14, y + h * Math.sin(t0), c + w * Math.cos(t0)),
            P2(RO + 0.14, y + h * Math.sin(t1), c + w * Math.cos(t1)),
          );
        }
        a += 2 * w + 0.004;
      }
    segL('ink', ps);
  }
  state.PAINT = EW;
  for (let y = HB, k = 0; y < HW - 0.01; y += 0.62, k++) {
    const y1 = Math.min(HW, y + 0.62);
    band(
      'stone',
      [
        [ro(y), y],
        [ro(y1), y1],
        [RI, y1],
        [RI, y],
      ],
      180,
    );
    const ps = [];
    for (let a = (k % 2) * 0.04; a < TAU; a += 0.08)
      ps.push(P2(ro(y) + 0.02, y + 0.04, a), P2(ro(y1) + 0.02, y1 - 0.04, a));
    segL('ink', ps);
  }
  const FL = [0.3, 3.7, 6.9, 10.1],
    U1 = ringRoof(33.4, 12.5, 26.8, 16, 22.4, 13.66, 180);
  ringFrame(RI, 25.2, 23.6, FL, 72, U1, true);
  // 外墙小窗：三、四层每间一窗，二层设射击孔；大门朝南
  {
    const ps = [];
    for (let k = 0; k < 72; k++) {
      const a = ((k + 0.5) * TAU) / 72;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.08) continue;
      state.FACE = RY(a);
      for (const [y, w, h] of [
        [FL[2] + 1.6, 0.55, 0.75],
        [FL[3] + 1.6, 0.55, 0.75],
        [FL[1] + 1.8, 0.14, 0.42],
      ]) {
        const z = ro(y) + 0.03;
        state.PAINT = WDD;
        box('wood', 0, y, z, w, h, 0.06, false);
        ps.push(
          V(-w / 2, y - h / 2, z + 0.04),
          V(w / 2, y - h / 2, z + 0.04),
          V(w / 2, y - h / 2, z + 0.04),
          V(w / 2, y + h / 2, z + 0.04),
          V(w / 2, y + h / 2, z + 0.04),
          V(-w / 2, y + h / 2, z + 0.04),
          V(-w / 2, y + h / 2, z + 0.04),
          V(-w / 2, y - h / 2, z + 0.04),
        );
        if (w > 0.3)
          ps.push(
            V(-w / 6, y - h / 2, z + 0.04),
            V(-w / 6, y + h / 2, z + 0.04),
            V(w / 6, y - h / 2, z + 0.04),
            V(w / 6, y + h / 2, z + 0.04),
          );
      }
      segL('ink', ps.splice(0));
    }
    state.FACE = new THREE.Matrix4();
  }
  {
    const z = ro(1.6);
    state.PAINT = GRA;
    box('stone', -1.3, 1.6, z + 0.1, 0.42, 3.2, 0.5);
    box('stone', 1.3, 1.6, z + 0.1, 0.42, 3.2, 0.5);
    box('stone', 0, 3.4, z + 0.12, 3.2, 0.42, 0.56);
    state.PAINT = WDD;
    box('wood', 0, 1.6, z, 2.2, 3, 0.14);
    seg('ink', V(0, 0.1, z + 0.08), V(0, 3.1, z + 0.08));
    state.PAINT = C('#efe9dc');
    box('wood', 0, 4.15, z + 0.06, 1.9, 0.6, 0.08);
    state.PAINT = TILE;
    surf('roof', (u, w) => V(-2.4 + 4.8 * u, 4.95 - w * 0.55, z + w * 1.25), 8, 1);
    for (let x = -2.3; x < 2.4; x += 0.3) seg('ink', V(x, 4.97, z), V(x, 4.42, z + 1.25));
  }
  // 楼梯：四部，沿廊而上
  for (let s = 0; s < 4; s++) {
    const a = Math.PI / 4 + (s * Math.PI) / 2;
    state.FACE = RY(a);
    state.PAINT = WD;
    for (let i = 0; i < 3; i++) {
      const y0 = FL[i],
        y1 = FL[i + 1],
        n = 14,
        stairLength = 4.6;
      for (let j = 0; j < n; j++) {
        const x = -stairLength / 2 + (stairLength * (j + 0.5)) / n;
        box(
          'wood',
          x,
          y0 + ((y1 - y0) * (j + 1)) / n - 0.03,
          24.4,
          stairLength / n + 0.04,
          0.06,
          0.9,
          false,
        );
      }
      for (const o of [-0.47, 0.47])
        beam(
          'wood',
          V(-stairLength / 2, y0 + 0.05, 24.4 + o),
          V(stairLength / 2, y1 - 0.03, 24.4 + o),
          0.08,
          0.24,
        );
    }
  }
  state.FACE = new THREE.Matrix4();
  // ---- 第二环：两层，每层 40 间 ----
  state.PAINT = EW;
  band(
    'stone',
    [
      [19.2, 0],
      [19.2, 7.1],
      [18.7, 7.1],
      [18.7, 0],
    ],
    120,
  );
  const U2 = ringRoof(20.6, 6.6, 16.6, 8.9, 12.8, 6.72, 120);
  ringFrame(18.7, 14.7, 13.5, [0.3, 3.6], 40, U2, true);
  // ---- 第三环：单层，32 间 ----
  state.PAINT = EW;
  band(
    'stone',
    [
      [11.4, 0],
      [11.4, 4.08],
      [11, 4.08],
      [11, 0],
    ],
    96,
  );
  const U3 = ringRoof(12.6, 3.7, 9.6, 5.4, 7, 3.93, 96);
  ringFrame(11, 8.4, 7.6, [0.3], 32, U3, false);
  // ---- 祖堂：居中朝南，悬山顶，闽南燕尾脊 ----
  {
    const hx = 3.3,
      hz = 2.8,
      H = 4.2;
    state.PAINT = GRA;
    box('stone', 0, 0.2, 0, 2 * hx + 1, 0.4, 2 * hz + 1);
    state.PAINT = C('#e9e2d2');
    box('stone', 0, 0.4 + H / 2, -hz, 2 * hx, H, 0.25);
    for (const s of [-1, 1]) box('stone', s * hx, 0.4 + H / 2, 0, 0.25, H, 2 * hz);
    state.PAINT = WD;
    for (const x of [-hx, -hx / 3, hx / 3, hx]) {
      const g = new THREE.CylinderGeometry(0.16, 0.17, H, 10);
      g.translate(x, 0.4 + H / 2, hz);
      place(g, 'wood');
    }
    box('wood', 0, 0.4 + H - 0.15, hz, 2 * hx + 0.3, 0.3, 0.3);
    state.PAINT = WDD;
    box('wood', 0, 0.4 + H * 0.42, -hz + 0.14, 1.4, 1.8, 0.06);
    const ye = 0.4 + H + 0.1,
      yr = ye + 2.3,
      ze = hz + 1.2,
      xe = hx + 0.7;
    state.PAINT = TILE;
    for (const s of [-1, 1])
      surf('roof', (u, w) => V(-xe + 2 * xe * u, ye + (yr - ye) * w, s * ze * (1 - w)), 12, 4);
    {
      const ps = [];
      for (const s of [-1, 1])
        for (let x = -xe + 0.2; x < xe; x += 0.3)
          ps.push(V(x, ye + 0.04, s * ze), V(x, yr + 0.04, 0));
      segL('ink', ps);
    }
    state.PAINT = RIDG;
    box('wood', 0, yr + 0.15, 0, 2 * xe - 0.6, 0.3, 0.4);
    for (const s of [-1, 1]) {
      const p = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        p.push(V(s * (xe - 0.6 + 1.1 * t), yr + 0.15 + 0.9 * t * t, 0));
      }
      for (let i = 0; i < 6; i++) beam('wood', p[i], p[i + 1], 0.32, 0.28, i > 4);
    }
    state.PAINT = C('#e9e2d2');
    for (const s of [-1, 1])
      prism(
        'stone',
        [
          [-hz, 0.4 + H],
          [hz, 0.4 + H],
          [0, yr - 0.35],
        ],
        s * hx - 0.12,
        s * hx + 0.12,
      );
  }
  // 水井
  for (const a of [1.1, -1.1]) {
    const p = P2(21.2, 0, a);
    state.PAINT = GRA;
    {
      const g = new THREE.CylinderGeometry(0.72, 0.76, 0.7, 24);
      g.translate(p.x, 0.35, p.z);
      place(g, 'stone');
    }
    state.PAINT = C('#3e4a50');
    const d = new THREE.CircleGeometry(0.55, 20);
    d.rotateX(-Math.PI / 2);
    d.translate(p.x, 0.71, p.z);
    place(d, 'stone', false);
  }
  // 辅助线与尺寸
  for (const r of [38, 46, 56]) ring('cons', r, 0, 160);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    seg('cons', P2(34, 0, a), P2(60, 0, a));
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    seg('cons', P2(RO * Math.SQRT2 * 0.98, -1, a), P2(RO * Math.SQRT2 * 0.98, 18, a));
  }
  ring('cons', 36, 16, 120);
  {
    const z = 38;
    seg('red', V(-RO, 0, z), V(RO, 0, z));
    for (let k = 0; k <= 62; k++) {
      const x = -RO + (k * 2 * RO) / 62,
        w = k % 5 ? 0.4 : 1;
      seg('red', V(x, 0, z - w), V(x, 0, z + w));
    }
    const SX = -37,
      SZ = 12;
    seg('red', V(SX, 0, SZ), V(SX, 16.4, SZ));
    for (let k = 0; k <= 16; k++) {
      const w = k % 5 ? 0.4 : 1;
      seg('red', V(SX - w, k, SZ), V(SX + w, k, SZ));
    }
  }
  for (let k = -70; k <= 70; k += 7)
    state.L.grid.push({
      a: new Float32Array([k, -0.03, -70, k, -0.03, 70, -70, -0.03, k, 70, -0.03, k]),
      rec: ZERO,
    });

  const { group, KEYS } = finalize();
  return {
    group,
    KEYS,
    topY: 16.4,
    SH_B: 0,
    SH_T: 0,
    PMAX: 1,
    BUILD_S: 24,
    big: '土楼',
    name: '福建土楼',
    dd: ['永定承启楼 立体构造图', '夯土外墙　三环一中心　四百间', '铅笔排线加淡彩'],
    clipN: V(0, 0, -1),
    clipMax: 35,
    HOME: { th: 0.72, ph: 0.95, dist: 140 },
    sect: { th: 0.06, ph: 1.33, dist: 92 },
    tgt: (p, c) => V(0, 3 + 4 * Math.min(1, p * 1.1), 0),
    notes: [
      ['夯土外墙（底厚1.7米）', P2(ro(7.5), 7.5, 0.95)],
      ['石砌墙基', P2(RO + 0.12, 0.6, 1.25)],
      ['三、四层开窗', P2(ro(FL[3] + 1.6), FL[3] + 1.6, 0.3)],
      ['大门', V(0, 3.4, ro(3.4) + 0.4)],
      ['瓦屋面 出檐深远', P2(32.4, 13, 0.35)],
      ['外环 四层 每层72间', P2(23.4, FL[2] + 1, 4.3)],
      ['走马廊', P2(23.4, FL[3] + 1, 3.4)],
      ['第二环 两层40间', P2(16, 8.4, -0.3)],
      ['第三环 单层32间', P2(9.3, 5.2, 1.6)],
      ['祖堂', V(0, 6.9, 0)],
      ['外径 约62.6米', V(14, 0, 38)],
      ['通高 约16.4米', V(-37, 16.4, 12)],
      ['墙体收分 1.7→1.1米', V(30.6, 8, 0), true],
      ['楼板与楼栿', V(26.5, FL[2], 0), true],
      ['房间（进深约4.4米）', V(27.4, FL[1] + 1.6, 0), true],
    ],
    stage: (p, gy) => {
      const h = gy - 5;
      return h < HB
        ? '石砌墙基'
        : h < FL[1]
          ? '夯筑一层'
          : h < FL[2]
            ? '夯筑二层'
            : h < FL[3]
              ? '夯筑三层'
              : h < HW
                ? '夯筑四层'
                : '盖瓦收顶';
    },
  };
}
