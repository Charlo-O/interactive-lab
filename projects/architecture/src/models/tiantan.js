import * as THREE from '../../assets/vendor/three/three.module.js';

// 天坛：尺寸与构造为展示用示意，模型元数据见 docs/ARCHITECTURE.md。
export function buildTiantan(toolkit) {
  const {
    state,
    ZERO,
    C,
    TAN,
    DOOR,
    NAT,
    GOLD,
    V,
    V2,
    P2,
    RY,
    TAU,
    roofF,
    vAt,
    yAt,
    resetBuild,
    place,
    box,
    beam,
    lines,
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
  const LAPIS = C('#3b5c9c'),
    LAPD = C('#2e4778'),
    QING = C('#3f6d93'),
    LU = C('#4f8d78'),
    SOF = C('#a94a35'),
    MARB = C('#dcd9d0'),
    PAVE = C('#cdc9bc'),
    JIN = C('#6a6660');
  // 祈谷坛：三层，直径 90.8 / 79.6 / 68.2 米，总高 5.6 米
  const TR = [45.4, 39.8, 34.1],
    TY = [0, 1.85, 3.7, 5.6],
    RUN = 9 * 0.34;
  // 殿身：檐柱、金柱各十二，龙井柱四（高 19.2 米）。斗口取攒当的 1/11
  const F = 6.05,
    RP = 14.4,
    rE = 12.1,
    rG = 8.7,
    rD = 5.6,
    YD = F + 19.2,
    T = 0.5,
    CA = (k) => ((k + 0.5) * Math.PI) / 6;
  const dk = (rc) => (TAU * rc) / (12 * (rc > 10 ? 6 : rc > 7 ? 4 : 3)) / 11,
    DG = (rc) => 15 * dk(rc),
    RT = (rc) => rc + 9 * dk(rc);
  // 自上而下：龙井柱顶→额枋→斗栱→挑檐桁→屋面，由屋面曲线反推各层柱头高度
  const yb3 = YD + 2.1,
    f3 = roofF(9.2, 0, 0, 7, 0.55, 0.15),
    Ye3 = yb3 + DG(rD) + 0.22 + T - yAt(f3, RT(rD)),
    R3 = roofF(9.2, Ye3, 0, Ye3 + 7, 0.55, 0.15);
  const Yt2 = YD - 0.4,
    R2 = roofF(12.6, 21.4, 6, Yt2, 0.6, 0.12),
    yb2 = yAt(R2, RT(rG)) - T - 0.22 - DG(rG);
  const Yt1 = yb2 - 1.75 - 0.4,
    R1 = roofF(16.3, 14.6, 9, Yt1, 0.6, 0.12),
    yb1 = yAt(R1, RT(rE)) - T - 0.22 - DG(rE),
    yTop = yb1 - 1.55;

  // ---- 祈谷坛：三层须弥座、汉白玉栏杆与出水、四面出陛 ----
  const FS = [
      [-7.6, 1.6],
      [0, 3.6],
      [7.6, 1.6],
    ],
    FE = [[0, 2.6]],
    DIRS = [
      [0, FS],
      [Math.PI, FS],
      [Math.PI / 2, FE],
      [-Math.PI / 2, FE],
    ];
  // 望柱头：上层蟠龙、中层翔凤、下层朵云
  const head = (k, y, z) => {
    const cyl = (r0, r1, hh, yy) => {
      const g = new THREE.CylinderGeometry(r0, r1, hh, 8);
      g.translate(0, yy + hh / 2, z);
      place(g, 'stone');
    };
    if (k === 2) {
      cyl(0.15, 0.15, 0.32, y);
      const s = new THREE.SphereGeometry(0.15, 10, 6);
      s.translate(0, y + 0.36, z);
      place(s, 'stone', false);
      lines(
        'ink',
        Array.from({ length: 25 }, (_, i) => {
          const t = i / 24,
            a = t * TAU * 2;
          return V(0.155 * Math.sin(a), y + 0.03 + 0.28 * t, z + 0.155 * Math.cos(a));
        }),
      );
    } else if (k === 1) {
      cyl(0.15, 0.15, 0.24, y);
      const c = new THREE.ConeGeometry(0.17, 0.3, 8);
      c.translate(0, y + 0.39, z);
      place(c, 'stone');
    } else for (let q = 0; q < 3; q++) cyl(0.17 - q * 0.03, 0.15 - q * 0.025, 0.12, y + q * 0.12);
  };
  // 出水：上层螭首、中层凤首、下层云头
  const spout = (k, y, R) => {
    const g = new THREE.CylinderGeometry(0.12, 0.15, 0.9, 6);
    g.rotateX(Math.PI / 2);
    g.translate(0, y, R + 0.4);
    place(g, 'stone');
    const s = new THREE.SphereGeometry(k === 2 ? 0.2 : 0.15, 8, 6);
    s.scale(1, k === 1 ? 0.7 : 0.85, k === 2 ? 1.3 : 1);
    s.translate(0, y + (k === 1 ? 0.05 : 0), R + 0.86);
    place(s, 'stone', false);
  };
  // 御路浮雕：上层龙、中层凤、下层云
  function yulu(k, R, y0, xc, rh, m) {
    const Ls = RUN - 0.34,
      K = Math.hypot(Ls, m * Ls),
      S = (x, s) => V(xc + x, y0 + rh + m * Ls * s + 0.025, R + RUN - Ls * s),
      ps = [],
      pl = (a) => {
        for (let i = 0; i < a.length - 1; i++) ps.push(S(...a[i]), S(...a[i + 1]));
      };
    const sp = (cx, cs, r, dr) =>
      pl(
        Array.from({ length: 21 }, (_, i) => {
          const t = (i / 20) * TAU * 1.5,
            q = r * (1 - i / 27);
          return [cx + dr * q * Math.cos(t), cs + (q * Math.sin(t)) / K];
        }),
      );
    const cv = (f, s0, s1, n = 32) =>
      pl(
        Array.from({ length: n + 1 }, (_, i) => {
          const s = s0 + ((s1 - s0) * i) / n;
          return [f(s), s];
        }),
      );
    pl([
      [-1.17, 0.02],
      [1.17, 0.02],
      [1.17, 0.98],
      [-1.17, 0.98],
      [-1.17, 0.02],
    ]);
    if (k === 2) {
      const bx = (s) => 0.48 * Math.sin(s * Math.PI * 2.4 + 0.5);
      for (const o of [0, 0.17]) cv((s) => bx(s) + o, 0.1, 0.84);
      for (let s = 0.13; s < 0.82; s += 0.035)
        pl([
          [bx(s) + 0.03, s],
          [bx(s) + 0.14, s + 0.012],
        ]); // 鳞
      for (const s of [0.24, 0.44, 0.62, 0.78]) {
        const x = bx(s) + 0.17;
        pl([
          [x, s],
          [x + 0.14, s + 0.02],
          [x + 0.21, s + 0.05],
        ]);
        pl([
          [x + 0.14, s + 0.02],
          [x + 0.22, s],
        ]);
      } // 爪
      const hx = bx(0.84) + 0.08;
      sp(hx, 0.89, 0.09, 1);
      pl([
        [hx - 0.05, 0.91],
        [hx - 0.17, 0.97],
      ]);
      pl([
        [hx + 0.05, 0.91],
        [hx + 0.15, 0.97],
      ]);
      sp(-0.5, 0.92, 0.07, 1); // 龙头、龙角与宝珠
      for (const [x, s] of [
        [-0.8, 0.2],
        [0.8, 0.36],
        [-0.78, 0.6],
        [0.82, 0.76],
      ])
        sp(x, s, 0.17, x > 0 ? -1 : 1);
    } else if (k === 1) {
      cv((s) => 0.26 * Math.sin(s * Math.PI * 2), 0.2, 0.8, 24);
      for (const d of [-1, 1]) {
        pl(
          Array.from({ length: 13 }, (_, i) => {
            const t = i / 12;
            return [d * (0.1 + 0.86 * t), 0.62 + 0.2 * Math.sin(t * Math.PI)];
          }),
        );
        pl(
          Array.from({ length: 13 }, (_, i) => {
            const t = i / 12;
            return [d * (0.1 + 0.7 * t), 0.55 + 0.12 * Math.sin(t * Math.PI)];
          }),
        );
        cv((s) => d * (0.08 + 3 * (0.24 - s) * (0.24 - s)), 0.04, 0.22, 12);
      }
      sp(0, 0.86, 0.1, 1);
    } else
      for (const [x, s] of [
        [-0.6, 0.15],
        [0.55, 0.27],
        [-0.5, 0.42],
        [0.6, 0.56],
        [-0.62, 0.7],
        [0.5, 0.84],
        [0.02, 0.5],
      ])
        sp(x, s, 0.22, x > 0 ? -1 : 1);
    segL('ink', ps);
  }
  for (let k = 0; k < 3; k++) {
    const R = TR[k],
      y0 = TY[k],
      y1 = TY[k + 1],
      h = y1 - y0,
      rb = R - 0.45,
      Rin = (k < 2 ? TR[k + 1] : RP) - 0.4,
      yr = y1 + 0.16;
    // 须弥座（圭脚、下枋、下枭、束腰、上枭、上枋）与铺地
    state.PAINT = MARB;
    band(
      'stone',
      [
        [R, y0],
        [R, y0 + 0.2],
        [R - 0.06, y0 + 0.2],
        [R - 0.06, y0 + 0.45],
        [R - 0.3, y0 + 0.6],
        [R - 0.3, y1 - 0.68],
        [R - 0.06, y1 - 0.53],
        [R - 0.06, y1],
      ],
      192,
    );
    state.PAINT = PAVE;
    band(
      'stone',
      [
        [R - 0.06, y1],
        [Rin, y1],
      ],
      192,
    );
    {
      const ps = [],
        n = Math.round((TAU * R) / 2.4);
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * TAU;
        ps.push(P2(R - 0.285, y0 + 0.6, a), P2(R - 0.285, y1 - 0.68, a));
      }
      for (let r = R - 2.4, q = 0; r > Rin + 0.8; r -= 2.4, q++) {
        const m = Math.round((TAU * r) / 2.8);
        for (let i = 0; i < m; i++) {
          const a = ((i + (q % 2) * 0.5) / m) * TAU;
          ps.push(P2(r, y1 + 0.01, a), P2(Math.min(R - 0.75, r + 2.4), y1 + 0.01, a));
        }
      }
      segL('ink', ps);
      for (let r = R - 2.4; r > Rin + 0.8; r -= 2.4) ring('ink', r, y1 + 0.01, 160);
    }
    // 栏杆：留出陛口，环设地栿、望柱、栏板
    const op = [];
    for (const [d, fl] of DIRS)
      for (const [xc, hw] of fl) {
        const e = hw + 0.21,
          s = d + Math.asin((xc - e) / rb),
          t = d + Math.asin((xc + e) / rb),
          s2 = ((s % TAU) + TAU) % TAU;
        op.push([s2, s2 + t - s]);
      }
    op.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < op.length; i++) {
      const s = op[i][1],
        e = i < op.length - 1 ? op[i + 1][0] : op[0][0] + TAU,
        n = Math.max(1, Math.round(((e - s) * rb) / 2.05)),
        da = (e - s) / n;
      state.PAINT = MARB;
      arcB('stone', rb, y1, 0.42, 0.16, s, e);
      for (let j = 0; j <= n; j++) {
        const a = s + da * j;
        state.FACE = RY(a);
        box('stone', 0, yr + 0.55, rb, 0.26, 1.1, 0.26);
        head(k, yr + 1.1, rb);
        if (j > 0 && j < n) spout(k, y1 - 0.3, R);
        if (j < n) {
          state.FACE = RY(a + da / 2);
          const zc = rb * Math.cos(da / 2),
            len = 2 * rb * Math.sin(da / 2) - 0.26;
          box('stone', 0, yr + 0.43, zc, len, 0.86, 0.13);
          const x = len / 2 - 0.06,
            z = zc + 0.07,
            ps = [
              V(-x, yr + 0.7, z),
              V(x, yr + 0.7, z),
              V(-x, yr + 0.5, z),
              V(x, yr + 0.5, z),
              V(-x, yr + 0.1, z),
              V(x, yr + 0.1, z),
            ];
          for (const c of [-len / 3, 0, len / 3])
            ps.push(
              V(c - 0.05, yr + 0.5, z),
              V(c - 0.05, yr + 0.7, z),
              V(c + 0.05, yr + 0.5, z),
              V(c + 0.05, yr + 0.7, z),
            );
          segL('ink', ps);
        }
      }
    }
    state.FACE = new THREE.Matrix4();
    // 出陛：每段九级。南北三出、中设御路，东西各一出；垂带上设栏板与抱鼓石
    const rh = h / 9,
      m = (h - rh) / (RUN - 0.34),
      ys = (z) => Math.min(y1 + 0.2, y0 + rh + 0.2 + m * (R + RUN - z));
    for (const [d, fl] of DIRS) {
      state.FACE = RY(d);
      for (const [xc, hw] of fl) {
        for (const [xa, xb] of hw > 3
          ? [
              [xc - hw, xc - 1.3],
              [xc + 1.3, xc + hw],
            ]
          : [[xc - hw, xc + hw]])
          for (let i = 0; i < 9; i++) {
            const zf = R + RUN - i * 0.34,
              hh = (i + 1) * rh;
            box('stone', (xa + xb) / 2, y0 + hh / 2, (R - 0.1 + zf) / 2, xb - xa, hh, zf - R + 0.1);
          }
        if (hw > 3) {
          prism(
            'stone',
            [
              [R - 0.9, y0],
              [R + RUN + 0.15, y0],
              [R + RUN + 0.15, y0 + rh - 0.15 * m],
              [R + 0.34, y1],
              [R - 0.9, y1],
            ],
            xc - 1.3,
            xc + 1.3,
          );
          yulu(k, R, y0, xc, rh, m);
        }
        for (const s of [-1, 1]) {
          const xs = xc + s * (hw + 0.21),
            za = R + RUN - 0.38,
            zb = R - 0.62;
          prism(
            'stone',
            [
              [R - 0.9, y0],
              [R + RUN + 0.3, y0],
              [R + RUN + 0.3, ys(R + RUN + 0.3)],
              [R + 0.34, y1 + 0.2],
              [R - 0.9, y1 + 0.2],
            ],
            xs - 0.21,
            xs + 0.21,
          );
          prism(
            'stone',
            [
              [za, ys(za)],
              [R + 0.34, y1 + 0.2],
              [zb, y1 + 0.2],
              [zb, y1 + 1.04],
              [R + 0.34, y1 + 1.04],
              [za, ys(za) + 0.84],
            ],
            xs - 0.065,
            xs + 0.065,
          );
          const g = new THREE.CylinderGeometry(0.38, 0.38, 0.17, 16);
          g.rotateZ(Math.PI / 2);
          g.translate(xs, ys(R + RUN - 0.02) + 0.38, R + RUN - 0.02);
          place(g, 'stone');
        }
      }
    }
    state.FACE = new THREE.Matrix4();
  }

  // ---- 殿身 ----
  // 台明与四面踏跺；殿内金砖地面，正中龙凤石
  state.PAINT = MARB;
  band(
    'stone',
    [
      [RP, TY[3]],
      [RP, F],
      [rE - 0.6, F],
    ],
    160,
  );
  state.PAINT = JIN;
  band(
    'stone',
    [
      [rE - 0.6, F],
      [0.06, F],
    ],
    96,
  );
  for (const d of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    state.FACE = RY(d);
    state.PAINT = MARB;
    for (let i = 0; i < 3; i++) {
      const zf = RP + 0.96 - i * 0.32,
        hh = (i + 1) * 0.15;
      box('stone', 0, TY[3] + hh / 2, (RP - 0.2 + zf) / 2, 4.2, hh, zf - RP + 0.2);
    }
  }
  state.FACE = new THREE.Matrix4();
  state.PAINT = C('#d9d6cf');
  {
    const g = new THREE.CylinderGeometry(1.1, 1.1, 0.06, 40);
    g.translate(0, F + 0.03, 0);
    place(g, 'stone');
  }
  {
    const ps = [];
    let sd = 7;
    const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let q = 0; q < 9; q++) {
      let a = rn() * TAU,
        r = 0.1 + rn() * 0.8,
        pv = null;
      for (let i = 0; i < 8; i++) {
        a += (rn() - 0.5) * 1.1;
        r = Math.min(1, Math.max(0.08, r + (rn() - 0.5) * 0.3));
        const p = P2(r, F + 0.065, a);
        if (pv) ps.push(pv, p);
        pv = p;
      }
    }
    segL('ink', ps);
  }
  // 柱与柱础：檐柱（十二时辰）、金柱（十二月）、龙井柱（四季）；金柱与龙井柱朱地沥粉贴金
  const colm = (r, a, y1, rad) => {
    const p = P2(r, 0, a);
    state.PAINT = MARB;
    {
      const g = new THREE.CylinderGeometry(rad * 1.3, rad * 1.5, 0.24, 20);
      g.translate(p.x, F + 0.12, p.z);
      place(g, 'stone');
    }
    state.PAINT = TAN;
    {
      const g = new THREE.CylinderGeometry(rad, rad, y1 - F - 0.24, 20);
      g.translate(p.x, (F + 0.24 + y1) / 2, p.z);
      place(g, 'wood');
    }
    return p;
  };
  const gild = (p, rad, zs, nh) => {
    state.PAINT = GOLD;
    for (const y of zs) {
      const g = new THREE.CylinderGeometry(rad + 0.03, rad + 0.03, 0.18, 20);
      g.translate(p.x, y, p.z);
      place(g, 'wood');
    }
    for (let z = 0; z < zs.length - 1; z++)
      for (let i = 0; i < nh; i++)
        for (const dr of [-1, 1]) {
          const ya = zs[z] + 0.15,
            yb = zs[z + 1] - 0.15,
            tn = (yb - ya) / (TAU * rad),
            pts = [];
          for (let q = 0; q <= 36; q++) {
            const t = q / 36,
              a = (i / nh) * TAU + dr * t * tn * TAU;
            pts.push(
              V(
                p.x + (rad + 0.015) * Math.sin(a),
                ya + (yb - ya) * t,
                p.z + (rad + 0.015) * Math.cos(a),
              ),
            );
          }
          lines('ink', pts);
        }
  };
  for (let k = 0; k < 12; k++) {
    colm(rE, CA(k), yb1 - 0.2, 0.42);
    gild(colm(rG, CA(k), yb2 - 0.2, 0.5), 0.5, [F + 0.9, F + 4.2, F + 7.5], 3);
  }
  for (const k of [1, 4, 7, 10])
    gild(colm(rD, CA(k), YD, 0.6), 0.6, [F + 1, F + 5.4, F + 9.8, F + 14.2, YD - 0.8], 5);
  // 童柱：立于连接龙井柱的花梁上，承托上层
  for (const k of [0, 2, 3, 5, 6, 8, 9, 11]) {
    const p = P2(rD, 0, CA(k));
    state.PAINT = TAN;
    const g = new THREE.CylinderGeometry(0.38, 0.38, YD - yb2 + 0.2, 16);
    g.translate(p.x, (YD + yb2 - 0.2) / 2, p.z);
    place(g, 'wood');
  }
  // 隔扇：每间四扇，三交六椀菱花格心，上设横披窗
  function latt(ps, x0, y0, x1, y1, z, sp) {
    for (const t of [Math.PI / 2, Math.PI / 6, -Math.PI / 6]) {
      const dx = Math.cos(t),
        dy = Math.sin(t),
        nx = -dy,
        ny = dx,
        cs = [
          [x0, y0],
          [x1, y0],
          [x0, y1],
          [x1, y1],
        ].map(([x, y]) => x * nx + y * ny);
      for (let c = Math.ceil(Math.min(...cs) / sp) * sp; c <= Math.max(...cs); c += sp) {
        const px = nx * c,
          py = ny * c;
        let ta = -1e9,
          tb = 1e9;
        for (const [p, q] of [
          [-dx, px - x0],
          [dx, x1 - px],
          [-dy, py - y0],
          [dy, y1 - py],
        ]) {
          if (Math.abs(p) < 1e-9) {
            if (q < 0) tb = -1e9;
          } else if (p < 0) ta = Math.max(ta, q / p);
          else tb = Math.min(tb, q / p);
        }
        if (tb - ta > 0.03)
          ps.push(V(px + dx * ta, py + dy * ta, z), V(px + dx * tb, py + dy * tb, z));
      }
    }
  }
  const zc = rE * Math.cos(Math.PI / 12),
    hx = rE * Math.sin(Math.PI / 12) - 0.44,
    yM = yTop - 1.05;
  for (let j = 0; j < 12; j++) {
    state.FACE = RY((j * Math.PI) / 6);
    const ps = [],
      w = (2 * hx - 0.16) / 4,
      y0 = F + 0.26,
      y1 = yM - 0.11,
      zf = zc + 0.065;
    state.PAINT = TAN;
    box('wood', 0, F + 0.13, zc, 2 * hx, 0.26, 0.3);
    box('wood', 0, yM, zc, 2 * hx, 0.22, 0.3);
    box('wood', 0, yTop - 0.1, zc, 2 * hx, 0.2, 0.3);
    for (const s of [-1, 1]) box('wood', s * (hx - 0.08), (F + yTop) / 2, zc, 0.16, yTop - F, 0.3);
    state.PAINT = DOOR;
    const Rc = (a, b, c, e) =>
      ps.push(
        V(a, b, zf),
        V(c, b, zf),
        V(c, b, zf),
        V(c, e, zf),
        V(c, e, zf),
        V(a, e, zf),
        V(a, e, zf),
        V(a, b, zf),
      );
    for (let i = 0; i < 4; i++) {
      const x0 = -hx + 0.08 + i * w,
        x1 = x0 + w;
      box('wood', (x0 + x1) / 2, (y0 + y1) / 2, zc, w - 0.02, y1 - y0, 0.12, false);
      Rc(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05);
      Rc(x0 + 0.14, y0 + 0.2, x1 - 0.14, y0 + 1.15);
      Rc(x0 + 0.14, y0 + 1.27, x1 - 0.14, y0 + 1.5);
      Rc(x0 + 0.14, y0 + 1.62, x1 - 0.14, y1 - 0.32);
      Rc(x0 + 0.14, y1 - 0.24, x1 - 0.14, y1 - 0.12);
      latt(ps, x0 + 0.14, y0 + 1.62, x1 - 0.14, y1 - 0.32, zf, 0.2);
    }
    box('wood', 0, (yM + yTop) / 2 - 0.05, zc, 2 * hx - 0.16, yTop - yM - 0.31, 0.1, false);
    latt(ps, -hx + 0.16, yM + 0.16, hx - 0.16, yTop - 0.25, zc + 0.055, 0.2);
    segL('ink', ps);
  }
  state.FACE = new THREE.Matrix4();
  // 梁与天花：外圈抱头梁、穿插枋，中圈天花梁、花梁；天花分外圈、中圈与中央藻井三层
  state.PAINT = QING;
  for (let k = 0; k < 12; k++) {
    const a = CA(k);
    beam('wood', P2(rG, yb1 + 0.32, a), P2(RT(rE), yb1 + 0.32, a), 0.46, 0.64);
    beam('wood', P2(rG, yTop - 0.55, a), P2(rE, yTop - 0.55, a), 0.36, 0.42);
    beam('wood', P2(rD, yb2 - 0.5, a), P2(rG, yb2 - 0.5, a), 0.5, 0.6);
  }
  state.PAINT = LU;
  arcB('wood', rD, yb2 - 0.8, 0.5, 0.6, 0, TAU);
  for (const [r0, r1, y] of [
    [rG + 0.5, rE - 0.42, yb1 + 0.72],
    [rD + 0.62, rG - 0.5, yb2 + 0.2],
  ]) {
    state.PAINT = LU;
    band(
      'wood',
      [
        [r0, y],
        [r1, y],
      ],
      144,
    );
    const ps = [],
      n = Math.round((TAU * r1) / 1.1);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ps.push(P2(r0, y - 0.02, a), P2(r1, y - 0.02, a));
    }
    segL('ink', ps);
    for (let r = r0 + 1; r < r1 - 0.3; r += 1) ring('ink', r, y - 0.02, 96);
  }
  // 藻井：龙井柱内叠三层井口，顶悬金色蟠龙
  {
    const y = YD + 0.05;
    state.PAINT = LU;
    band(
      'wood',
      [
        [0.06, y + 2.7],
        [1.05, y + 2.7],
        [1.05, y + 2.25],
        [2.1, y + 2.25],
        [2.1, y + 1.55],
        [3.3, y + 1.55],
        [3.3, y + 0.85],
        [4.5, y + 0.85],
        [4.5, y + 0.15],
        [rD - 0.25, y + 0.15],
      ],
      96,
    );
    state.PAINT = GOLD;
    {
      const g = new THREE.SphereGeometry(0.85, 20, 10, 0, TAU, 0, Math.PI / 2);
      g.scale(1, 0.6, 1);
      g.rotateX(Math.PI);
      g.translate(0, y + 2.68, 0);
      place(g, 'wood');
    }
    state.PAINT = QING;
    for (let k = 0; k < 4; k++)
      beam('wood', P2(rD, YD - 0.35, CA(1 + 3 * k)), P2(rD, YD - 0.35, CA(4 + 3 * k)), 0.42, 0.6);
  }
  // 额枋：小额枋、由额垫板、大额枋（逐间青绿互换）、平板枋
  function hexi(r, y0, h, a0, a1) {
    const Q = (t, y) => P2(r, y0 + y * h, a0 + (a1 - a0) * t),
      ps = [],
      pl = (arr) => {
        for (let i = 0; i < arr.length - 1; i++) ps.push(Q(...arr[i]), Q(...arr[i + 1]));
      };
    pl([
      [0.34, 0.18],
      [0.66, 0.18],
      [0.72, 0.5],
      [0.66, 0.82],
      [0.34, 0.82],
      [0.28, 0.5],
      [0.34, 0.18],
    ]);
    for (const mf of [(t) => t, (t) => 1 - t]) {
      for (const t of [0.035, 0.07])
        pl([
          [mf(t), 0.04],
          [mf(t), 0.96],
        ]);
      for (const t of [0.1, 0.17])
        pl([
          [mf(t), 0.04],
          [mf(t + 0.07), 0.5],
          [mf(t), 0.96],
        ]);
    }
    pl(
      Array.from({ length: 17 }, (_, i) => [
        0.37 + (0.26 * i) / 16,
        0.5 + 0.17 * Math.sin((i / 16) * Math.PI * 3),
      ]),
    );
    segL('ink', ps);
    state.PAINT = GOLD;
    for (const [t0, t1] of [
      [0.035, 0.07],
      [0.93, 0.965],
    ])
      arcB('wood', r, y0 + 0.03, 0.03, h - 0.06, a0 + (a1 - a0) * t0, a0 + (a1 - a0) * t1, false);
  }
  function drum(rc, yb, cr, hd) {
    for (let j = 0; j < 12; j++) {
      const a = (j * Math.PI) / 6,
        e = cr ? (cr + 0.02) / rc : 0,
        a0 = a - Math.PI / 12 + e,
        a1 = a + Math.PI / 12 - e,
        q = j % 2;
      state.PAINT = q ? LU : QING;
      arcB('wood', rc, yb - 1.25 - hd, 0.36, 0.4, a0, a1);
      state.PAINT = TAN;
      arcB('wood', rc, yb - 0.85 - hd, 0.2, hd, a0, a1, false);
      state.PAINT = q ? QING : LU;
      arcB('wood', rc, yb - 0.85, 0.46, 0.65, a0, a1);
      hexi(rc + 0.25, yb - 0.85, 0.65, a0, a1);
      if (hd > 0.4)
        lines(
          'ink',
          Array.from({ length: 25 }, (_, i) => {
            const t = i / 24;
            return P2(
              rc + 0.11,
              yb - 0.85 - hd / 2 + hd * 0.28 * Math.sin(t * Math.PI * 6),
              a0 + (a1 - a0) * t,
            );
          }),
        );
    }
    state.PAINT = QING;
    arcB('wood', rc, yb - 0.2, 0.62, 0.2, 0, TAU);
  }
  // 斗栱（七踩）：柱头科与平身科，环设栱垫板、正心桁、挑檐枋、挑檐桁；端头贴金
  function dougong(rc, yb) {
    const d = dk(rc),
      per = Math.round((TAU * rc) / 12 / (11 * d));
    state.KOGU = true;
    for (let k = 0; k < 12; k++)
      for (let i = 0; i < per; i++) {
        state.FACE = RY(CA(k) + (i * Math.PI) / 6 / per);
        const z = rc;
        state.PAINT = QING;
        box('wood', 0, yb + d, z, 3 * d, 2 * d, 3 * d);
        state.PAINT = LU;
        box('wood', 0, yb + 3 * d, z, 6.2 * d, 2 * d, d);
        box('wood', 0, yb + 3 * d, z + 0.5 * d, d, 2 * d, 7 * d);
        state.PAINT = QING;
        box('wood', 0, yb + 5 * d, z, 9.2 * d, 2 * d, d);
        box('wood', 0, yb + 5 * d, z + 3 * d, 6.2 * d, 2 * d, d);
        box('wood', 0, yb + 5 * d, z + 0.5 * d, d, 2 * d, 13 * d);
        state.PAINT = LU;
        box('wood', 0, yb + 7 * d, z + 6 * d, 6.2 * d, 2 * d, d);
        beam('wood', V(0, yb + 8.6 * d, z - 9 * d), V(0, yb + 6.3 * d, z + 10.5 * d), d, 2 * d);
        state.PAINT = QING;
        box('wood', 0, yb + 9 * d, z + 9 * d, 7.2 * d, 2 * d, d);
        box('wood', 0, yb + 9 * d, z + 3.5 * d, d, 2 * d, 15 * d);
      }
    state.FACE = new THREE.Matrix4();
    state.KOGU = false;
    state.PAINT = TAN;
    arcB('wood', rc, yb, 0.06, 6 * d, 0, TAU, false);
    state.PAINT = QING;
    arcB('wood', rc, yb + 6 * d, d, 9 * d, 0, TAU);
    state.PAINT = LU;
    arcB('wood', rc, yb + 15 * d, 3 * d, 3 * d, 0, TAU);
    state.PAINT = QING;
    arcB('wood', rc + 9 * d, yb + 10 * d, d, 2 * d, 0, TAU);
    state.PAINT = LU;
    arcB('wood', rc + 9 * d, yb + 12 * d, 3 * d, 3 * d, 0, TAU);
  }
  drum(rE, yb1, 0.42, 0.3);
  dougong(rE, yb1);
  drum(rG, yb2, 0.5, 0.5);
  dougong(rG, yb2);
  drum(rD, yb3, 0, 0.85);
  dougong(rD, yb3);
  // 椽：檐椽与飞椽
  function rafters(pf, rc) {
    const [Re] = pf(0),
      n = Math.round((TAU * rc) / 0.46),
      Y = (r) => yAt(pf, r) - T;
    state.KOGU = true;
    state.PAINT = LU;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU,
        r0 = rc - 0.3,
        r1 = Re - 1.15,
        r2 = Re - 0.06;
      beam('wood', P2(r0, Y(r0) - 0.1, a), P2(r1, Y(r1) - 0.1, a), 0.16, 0.18, false);
      beam('wood', P2(r1 - 0.04, Y(r1) - 0.11, a), P2(r2, Y(r2) - 0.11, a), 0.14, 0.16, false);
    }
    state.KOGU = false;
  }
  // 屋面：青琉璃筒瓦，瓦当与连檐、朱红望板、瓦垄
  function roof(pf, nu, vm = 1) {
    const [Re, Ye] = pf(0);
    state.PAINT = LAPIS;
    for (let b = 0; b < 4; b++)
      surf(
        'roof',
        (u, w) => {
          const [r, y] = pf(((b + w) / 4) * vm);
          return P2(r, y, u * TAU);
        },
        nu,
        3,
      );
    surf('roof', (u, w) => P2(Re, Ye - w * T * 0.45, u * TAU), nu, 1);
    state.PAINT = LU;
    surf('roof', (u, w) => P2(Re - 0.04, Ye - T * 0.45 - w * T * 0.55, u * TAU), nu, 1);
    state.PAINT = SOF;
    surf(
      'wood',
      (u, w) => {
        const [r, y] = pf(w * vm);
        return P2(r, y - T, u * TAU);
      },
      nu,
      8,
    );
    for (const dy of [0, -T * 0.45, -T]) ring('ink', Re + 0.02, Ye + dy, nu);
    const n = Math.round((TAU * Re) / 0.62),
      ve = [vAt(pf, 1.95), vAt(pf, 3.1), vAt(pf, 4.6)];
    for (let i = 0; i < n; i++) {
      const e = vm < 1 ? ve[i % 4 ? (i % 2 ? 2 : 1) : 0] : 1,
        p = [];
      for (let q = 0; q <= 12; q++) {
        const [r, y] = pf((q / 12) * e);
        p.push(P2(r, y + 0.05, (i / n) * TAU));
      }
      lines('ink', p);
    }
    for (const v of [0.3, 0.6])
      if (v < vm) {
        const [r, y] = pf(v);
        ring('ink', r, y + 0.04, nu);
      }
  }
  // 围脊：下层屋面与上层檐身相接处
  const ridge = (Rt, Yt) => {
    state.PAINT = LAPD;
    arcB('wood', Rt + 0.22, Yt - 0.15, 0.56, 0.45, 0, TAU);
    arcB('wood', Rt + 0.22, Yt + 0.3, 0.36, 0.16, 0, TAU);
  };
  rafters(R1, rE);
  roof(R1, 144);
  ridge(9, Yt1);
  rafters(R2, rG);
  roof(R2, 112);
  ridge(6, Yt2);
  rafters(R3, rD);
  roof(R3, 96, vAt(R3, 1.75));
  // 屋架：金桁，以及汇向顶心的由戗
  state.PAINT = QING;
  for (const [pf, r] of [
    [R1, 10.6],
    [R2, 7.5],
    [R3, 4.4],
    [R3, 2.6],
  ])
    arcB('wood', r, yAt(pf, r) - T - 0.62, 0.34, 0.34, 0, TAU);
  state.PAINT = LU;
  for (let k = 0; k < 12; k++) {
    const a = CA(k);
    let pv = null;
    for (const r of [rD, 4.4, 3.3, 2.2, 1.2, 0.35]) {
      const q = P2(r, yAt(R3, r) - T - 0.2, a);
      if (pv) beam('wood', pv, q, 0.3, 0.4);
      pv = q;
    }
  }
  // 鎏金宝顶
  const yB = yAt(R3, 1.8) - 0.2,
    topY = yB + 4;
  state.PAINT = GOLD;
  band(
    'wood',
    [
      [1.85, yB],
      [1.85, yB + 0.3],
      [1.6, yB + 0.42],
      [1.6, yB + 0.8],
      [1.15, yB + 0.95],
      [1.15, yB + 1.05],
    ],
    48,
  );
  place(
    new THREE.LatheGeometry(
      [
        [1.15, 1.05],
        [1, 1.18],
        [1.05, 1.35],
        [1.22, 1.6],
        [1.32, 1.95],
        [1.33, 2.3],
        [1.26, 2.65],
        [1.08, 2.98],
        [0.8, 3.25],
        [0.5, 3.45],
        [0.28, 3.6],
        [0.2, 3.72],
        [0.24, 3.82],
        [0.16, 3.92],
        [0.03, 4],
      ].map(([r, y]) => V2(r, yB + y)),
      40,
    ),
    'wood',
  );
  // 雷公柱：由由戗悬吊、承托宝顶；以一条中轴连接藻井蟠龙与地面龙凤石
  const SH_T = yB + 0.6,
    SH_B = F + 0.02;
  state.PAINT = NAT;
  {
    const y0 = SH_T - 3.4,
      g = new THREE.CylinderGeometry(0.3, 0.3, SH_T - y0, 14);
    g.translate(0, (y0 + SH_T) / 2, 0);
    place(g, 'shin', false);
    const b = new THREE.SphereGeometry(0.42, 14, 10);
    b.scale(1, 1.3, 1);
    b.translate(0, y0 - 0.3, 0);
    place(b, 'shin', true, 'shin');
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      seg('shin', P2(0.31, y0, a), P2(0.31, SH_T, a));
    }
    for (let y = F + 0.5; y < y0 - 1; y += 1.3) seg('shin', V(0, y, 0), V(0, y + 0.75, 0));
  }
  // 辅助线（作图定位）；外方框即“天圆地方”的“地”
  for (const r of [52, 63, 75, 88]) ring('cons', r, 0, 192);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    seg('cons', P2(49, 0, a), P2(92, 0, a));
  }
  lines('cons', [V(-60, 0, -60), V(60, 0, -60), V(60, 0, 60), V(-60, 0, 60)], true);
  for (const pf of [R1, R2, R3]) {
    const [r, y] = pf(0);
    ring('cons', r + 6, y, 96);
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    seg('cons', P2(23, -2, a), P2(23, topY + 3, a));
  }
  seg('cons', V(-70, topY - 1, 0), V(70, topY - 1, 0));
  seg('cons', V(0, topY - 1, -70), V(0, topY - 1, 70));
  {
    const SX = -52,
      SZ = -16;
    seg('red', V(SX, 0, SZ), V(SX, 37, SZ));
    for (let k = 0; k <= 37; k++) {
      const w = k % 5 ? 0.5 : 1.3;
      seg('red', V(SX - w, k, SZ), V(SX + w, k, SZ));
    }
  }
  lines(
    'red',
    Array.from({ length: 97 }, (_, k) => P2(57, 0, 0.5 + (k / 96) * 3.4)),
  );
  {
    const c = P2(57, 0, 3.9);
    lines(
      'red',
      Array.from({ length: 25 }, (_, k) => {
        const b = (k / 24) * TAU;
        return V(c.x + Math.cos(b) * 2.6, 0, c.z + Math.sin(b) * 2.6);
      }),
    );
  }
  for (let k = -84; k <= 84; k += 7)
    state.L.grid.push({
      a: new Float32Array([k, -0.02, -84, k, -0.02, 84, -84, -0.02, k, 84, -0.02, k]),
      rec: ZERO,
    });

  const { group, KEYS } = finalize();
  const [mr, my] = R3(0.35);
  return {
    group,
    KEYS,
    topY,
    SH_B,
    SH_T,
    PMAX: 1.3,
    BUILD_S: 24,
    big: '天坛',
    bigTop: '-.1em',
    name: '天坛 祈年殿',
    dd: ['祈年殿与祈谷坛 立体木构图', '圆形三重檐攒尖顶　二十八柱', '铅笔排线加淡彩'],
    clipN: V(0, 0, -1),
    clipMax: 50,
    HOME: { th: 0.62, ph: 1.24, dist: 215 },
    sect: { th: 0.08, ph: 1.5, dist: 105 },
    tgt: (p, c) => V(0, 7 + 8 * Math.min(1, p * 1.1) + (4 * c) / 100, 0),
    notes: [
      ['鎏金宝顶', V(0, yB + 2.3, 0)],
      ['青琉璃瓦三重檐', P2(mr, my + 0.1, 1.5)],
      ['斗栱（七踩）', P2(RT(rE) + 0.1, yb1 + 0.9, 1.75)],
      ['和玺彩画', P2(rG + 0.26, yb2 - 0.52, -0.2)],
      ['檐柱（十二时辰）', P2(rE + 0.44, F + 3.4, CA(2))],
      ['隔扇（三交六椀）', P2(zc + 0.07, F + 2.6, -Math.PI / 6)],
      ['御路（龙·凤·云）', V(0, TY[0] + 0.9, TR[0] + 1.6)],
      ['汉白玉栏杆', P2(TR[1] - 0.45, TY[2] + 1.25, 1.3)],
      ['螭首', P2(TR[2] + 0.85, TY[3] - 0.3, 1.75)],
      ['祈谷坛（三层）', P2(TR[0], 1, -0.75)],
      ['天圆地方', V(60, 0, -34)],
      ['通高 约37米', V(-52, 37, -16)],
      ['龙井柱（四季）', P2(rD + 0.62, F + 12, CA(7)), true],
      ['金柱（十二月）', P2(rG + 0.52, F + 4.5, CA(3)), true],
      ['藻井', P2(4.6, YD + 0.6, Math.PI * 0.55), true],
      ['雷公柱', V(0, SH_T - 2, 0), true],
      ['龙凤石', V(0, F + 0.06, 0), true],
    ],
    stage: (p, gy) => {
      if (p >= 1.2) return '收尾';
      if (p >= 1) return '雷公柱';
      const h = gy - 5;
      return h < TY[1] - 0.3
        ? '下层坛'
        : h < TY[2] - 0.3
          ? '中层坛'
          : h < F - 0.2
            ? '上层坛'
            : h < yb1 - 0.4
              ? '立柱装隔扇'
              : h < Yt1 + 0.6
                ? '下层屋面'
                : h < YD + 0.4
                  ? '中层屋面'
                  : h < yB - 0.6
                    ? '上层屋面'
                    : '鎏金宝顶';
    },
  };
}
