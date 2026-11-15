import * as THREE from '../../assets/vendor/three/three.module.js';

// 赵州桥：尺寸与构造为展示用示意，模型元数据见 docs/ARCHITECTURE.md。
export function buildZhaozhou(toolkit) {
  const {
    state,
    ZERO,
    C,
    V,
    V2,
    TAU,
    resetBuild,
    place,
    box,
    beam,
    lines,
    seg,
    surf,
    segL,
    finalize,
  } = toolkit;
  resetBuild();
  state.GNC = true;
  const STO = C('#c2bba9'),
    ST2 = C('#aea795'),
    DECK = C('#b9b2a1'),
    IRON = C('#4f4b47'),
    WATER = C('#b4c9cf'),
    EARTH = C('#b5ae95');
  // 主拱：净跨 37.02 米、矢高 7.23 米的圆弧拱，拱石厚 1.03 米，宽 9 米，由 28 道拱券纵向并列砌成
  const SP = 37.02,
    RI = 7.23,
    R = ((SP * SP) / 4 + RI * RI) / (2 * RI),
    CY = RI - R,
    A = Math.asin(SP / 2 / R),
    TH = 1.03,
    W = 9,
    NR = 28,
    WR = W / NR,
    HG = 0.3,
    RH = R + TH + HG,
    XE = 32.2;
  const deck = (x) => 9.2 - 4.2 * Math.min(1, Math.abs(x) / XE) ** 2,
    arcY = (r, x) => Math.sqrt(r * r - x * x) + CY;
  // 楔形拱石：圆心 (cx,cy)，半径 r0→r1，角度 a0→a1（自竖直方向量起），沿 z0→z1
  function wedge(cx, cy, r0, r1, a0, a1, z0, z1) {
    const P = (r, a) => V2(cx + r * Math.sin(a), cy + r * Math.cos(a));
    const g = new THREE.ExtrudeGeometry(
      new THREE.Shape([P(r0, a0), P(r0, a1), P(r1, a1), P(r1, a0)]),
      { depth: z1 - z0, bevelEnabled: false },
    );
    g.translate(0, 0, z0);
    place(g, 'stone');
  }
  // 拱券：nr 道并列，相邻券错缝半块
  function vault(cx, cy, r, t, a, nv, nr) {
    const da = (2 * a) / nv,
      wr = W / nr;
    for (let j = 0; j < nr; j++) {
      const z0 = -W / 2 + j * wr,
        o = j % 2 ? 0.5 : 0;
      for (let i = -1; i < nv; i++) {
        const a0 = Math.max(-a, -a + (i + o) * da),
          a1 = Math.min(a, -a + (i + 1 + o) * da);
        if (a1 - a0 > 1e-4) wedge(cx, cy, r, r + t, a0, a1, z0, z0 + wr);
      }
    }
  }
  // 河床、两岸与洨河水面
  const bank = (x) => {
    const t = Math.min(1, Math.max(0, (Math.abs(x) - 20.5) / 10));
    return -0.85 + 5.65 * t * t * (3 - 2 * t);
  };
  state.PAINT = WATER;
  surf('ground', (u, w) => V(-25 + u * 50, -0.8, -60 + w * 120), 10, 8);
  state.G.ground[state.G.ground.length - 1].userData.rec = ZERO;
  state.PAINT = EARTH;
  for (const s of [-1, 1]) {
    surf(
      'ground',
      (u, w) => {
        const x = s * (20.5 + u * 49.5);
        return V(x, bank(x), -60 + w * 120);
      },
      60,
      8,
    );
    state.G.ground[state.G.ground.length - 1].userData.rec = ZERO;
  }
  for (let n = 0; n < 190; n++) {
    const x = -19 + Math.random() * 38,
      z = -56 + Math.random() * 104,
      l = 2 + Math.random() * 5,
      a = [];
    for (let i = 0; i <= 8; i++) {
      const zz = z + (l * i) / 8;
      a.push(x + Math.sin(zz * 0.3 + n) * 0.3, -0.78, zz);
    }
    const arr = [];
    for (let i = 0; i < a.length - 3; i += 3)
      arr.push(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]);
    state.L.water.push({ a: new Float32Array(arr), rec: ZERO });
  }
  for (const s of [-1, 1])
    for (let z = -58; z <= 58; z += 1.8) {
      const x0 = s * (21 + Math.random() * 1.5),
        x1 = s * (26 + Math.random() * 3),
        p = [];
      for (let i = 0; i <= 5; i++) {
        const x = x0 + ((x1 - x0) * i) / 5;
        p.push(V(x, bank(x) + 0.03, z + Math.random() * 0.2));
      }
      if (Math.abs(z) > W / 2 + 1)
        state.L.ink.push({
          a: new Float32Array(
            p.slice(0, -1).flatMap((q, i) => [q.x, q.y, q.z, p[i + 1].x, p[i + 1].y, p[i + 1].z]),
          ),
          rec: ZERO,
        });
    }
  // 桥台：拱脚之下五层条石
  state.PAINT = ST2;
  for (const s of [-1, 1]) {
    box('stone', s * 21.9, -1, 0, 6.8, 2, W + 0.6);
    for (let y = -1.6; y < 0; y += 0.4)
      seg('ink', V(s * 18.5, y, W / 2 + 0.31), V(s * 25.3, y, W / 2 + 0.31));
  }
  // 主拱 28 道拱券（自两端拱脚向拱顶逐块砌筑）
  state.PAINT = STO;
  vault(0, CY, R, TH, A, 40, NR);
  // 腰铁：横跨相邻拱券的铁件；铁拉杆：五根贯通全宽，杆头露于券脸
  state.RECK = 8.3;
  state.PAINT = IRON;
  for (const a of [-0.8, -0.4, 0, 0.4, 0.8].map((t) => t * A))
    for (let j = 1; j < NR; j++) {
      const g = new THREE.BoxGeometry(0.14, 0.05, 0.42);
      g.rotateZ(-a);
      g.translate(
        (R + TH + 0.025) * Math.sin(a),
        CY + (R + TH + 0.025) * Math.cos(a),
        -W / 2 + j * WR,
      );
      place(g, 'stone', false);
    }
  const RODS = [-0.66, -0.32, 0, 0.32, 0.66].map((t) => t * A);
  for (const a of RODS) {
    const x = (R + TH + 0.09) * Math.sin(a),
      y = CY + (R + TH + 0.09) * Math.cos(a),
      g = new THREE.CylinderGeometry(0.06, 0.06, W + 0.3, 8);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, 0);
    place(g, 'stone');
    for (const s of [-1, 1]) {
      const h = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12);
      h.rotateX(Math.PI / 2);
      h.translate(x, y, s * (W / 2 + 0.12));
      place(h, 'stone');
    }
  }
  // 护拱石
  state.RECK = 8.5;
  state.PAINT = ST2;
  for (let i = 0; i < 14; i++) {
    const a0 = -A + (i * 2 * A) / 14;
    wedge(0, CY, R + TH, RH, a0, a0 + (2 * A) / 14, -W / 2, W / 2);
  }
  // 敞肩：每肩两个小拱（近桥堍净跨 3.81 米，近拱顶 2.85 米）
  const SA = (80 * Math.PI) / 180,
    smalls = [];
  for (const s of [-1, 1])
    for (const [xc, yl, sp, ts] of [
      [13.025, 6.15, 2.85, 0.55],
      [17.355, 4.05, 3.81, 0.66],
    ]) {
      const r = sp / 2 / Math.sin(SA),
        yc = yl - r * Math.cos(SA);
      smalls.push({ x: s * xc, yc, r, ts, s });
      state.RECK = 8.8;
      state.PAINT = STO;
      vault(s * xc, yc, r, ts, SA, Math.max(8, Math.round((2 * SA * r) / 0.5)), 14);
    }
  // 拱肩：拱顶处的垫层，以及两肩带小拱券洞的实砌墙体（全宽）
  const P2D = (x, y) => V2(x, y),
    outline = (s) => {
      const pts = [],
        bot = (x) => arcY(RH, x);
      const crv = (a, b) => {
        const n = Math.max(1, Math.ceil(Math.abs(b - a) / 0.4));
        for (let i = 0; i <= n; i++) {
          const x = a + ((b - a) * i) / n;
          pts.push([x, bot(x)]);
        }
      };
      let x = 10.8;
      for (const m of smalls
        .filter((m) => m.s === s)
        .sort((a, b) => Math.abs(a.x) - Math.abs(b.x))) {
        const c = Math.abs(m.x),
          xl = c - m.r * Math.sin(SA),
          xr = c + m.r * Math.sin(SA),
          re = m.r + m.ts;
        crv(x, xl);
        pts.push([xl, m.yc + m.r * Math.cos(SA)]);
        for (let i = 0; i <= 16; i++) {
          const a = -SA + (2 * SA * i) / 16;
          pts.push([c + re * Math.sin(a), m.yc + re * Math.cos(a)]);
        }
        pts.push([xr, m.yc + m.r * Math.cos(SA)]);
        x = xr;
      }
      crv(x, RH * Math.sin(A));
      pts.push([SP / 2, 0], [XE, 0]);
      for (let i = 0; i <= 40; i++) {
        const xx = XE - ((XE - 10.8) * i) / 40;
        pts.push([xx, deck(xx)]);
      }
      return pts.map(([x, y]) => [s * x, y]);
    };
  const inside = (pts, x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i],
        [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  state.RECK = 9.1;
  state.PAINT = ST2;
  {
    const pts = [];
    for (let i = 0; i <= 54; i++) {
      const x = -10.8 + (21.6 * i) / 54;
      pts.push(P2D(x, arcY(RH, x)));
    }
    for (let i = 0; i <= 54; i++) {
      const x = 10.8 - (21.6 * i) / 54;
      pts.push(P2D(x, deck(x)));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: W,
      bevelEnabled: false,
      curveSegments: 1,
    });
    g.translate(0, 0, -W / 2);
    place(g, 'stone');
  }
  for (const s of [-1, 1]) {
    const o = outline(s),
      g = new THREE.ExtrudeGeometry(new THREE.Shape(o.map(([x, y]) => P2D(x, y))), {
        depth: W,
        bevelEnabled: false,
        curveSegments: 1,
      });
    g.translate(0, 0, -W / 2);
    place(g, 'stone');
    // 券脸墙的砌缝：错缝条石
    const ps = [];
    for (let k = 0, y = 0.45; y < 9.1; y += 0.5, k++) {
      let run = null;
      for (let x = 10.9; x <= XE + 0.01; x += 0.1) {
        const xx = s * x,
          ok = inside(o, xx, y) && inside(o, xx, y + 0.04) && inside(o, xx, y - 0.04);
        if (ok && !run) run = xx;
        if ((!ok || x > XE - 0.05) && run !== null) {
          if (Math.abs(xx - run) > 0.3)
            for (const z of [-1, 1])
              ps.push(V(run, y, z * (W / 2 + 0.01)), V(xx, y, z * (W / 2 + 0.01)));
          run = null;
        }
      }
      for (let x = 11 + (k % 2) * 0.6; x < XE; x += 1.2) {
        const xx = s * x;
        if (inside(o, xx, y + 0.02) && inside(o, xx, y + 0.48))
          for (const z of [-1, 1])
            ps.push(V(xx, y, z * (W / 2 + 0.01)), V(xx, y + 0.5, z * (W / 2 + 0.01)));
      }
    }
    segL('ink', ps);
  }
  // 桥面：中高两低的缓坡，铺石横缝
  state.RECK = 9.4;
  state.PAINT = DECK;
  surf(
    'roof',
    (u, w) => {
      const x = -XE + 2 * XE * u;
      return V(x, deck(x) + 0.03, (w - 0.5) * W);
    },
    180,
    2,
  );
  {
    const ps = [];
    for (let x = -XE + 0.45; x < XE; x += 0.9)
      ps.push(V(x, deck(x) + 0.05, -W / 2 + 0.32), V(x, deck(x) + 0.05, W / 2 - 0.32));
    segL('ink', ps);
    for (const z of [-1.6, 0, 1.6])
      lines(
        'ink',
        Array.from({ length: 91 }, (_, i) => {
          const x = -XE + (2 * XE * i) / 90;
          return V(x, deck(x) + 0.05, z);
        }),
      );
  }
  // 栏板与望柱：栏板上浮雕蛟龙
  state.RECK = 9.7;
  {
    const NP = 32,
      dx = (2 * XE) / NP;
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - 0.18);
      for (let k = 0; k <= NP; k++) {
        const x = -XE + k * dx,
          y = deck(x);
        state.PAINT = STO;
        box('stone', x, y + 0.6, z, 0.26, 1.2, 0.26);
        {
          const g = new THREE.CylinderGeometry(0.13, 0.16, 0.16, 10);
          g.translate(x, y + 1.28, z);
          place(g, 'stone');
          const b = new THREE.SphereGeometry(0.14, 10, 8);
          b.translate(x, y + 1.44, z);
          place(b, 'stone', false);
        }
        if (k < NP) {
          const x1 = x + dx,
            a = V(x + 0.13, y + 0.52, z),
            b = V(x1 - 0.13, deck(x1) + 0.52, z);
          state.PAINT = ST2;
          beam('stone', a, b, 0.14, 0.84);
          const Q = (t, v) =>
              a
                .clone()
                .lerp(b, t)
                .add(V(0, v - 0.42, s * 0.075)),
            ps = [],
            pl = (arr) => {
              for (let i = 0; i < arr.length - 1; i++) ps.push(Q(...arr[i]), Q(...arr[i + 1]));
            };
          pl([
            [0.04, 0.1],
            [0.96, 0.1],
            [0.96, 0.74],
            [0.04, 0.74],
            [0.04, 0.1],
          ]);
          const ph = k * 1.7;
          pl(
            Array.from({ length: 25 }, (_, i) => {
              const t = 0.1 + (0.8 * i) / 24;
              return [t, 0.42 + 0.18 * Math.sin(t * Math.PI * 2.4 + ph)];
            }),
          );
          pl(
            Array.from({ length: 13 }, (_, i) => {
              const q = (i / 12) * TAU * 1.3,
                r = 0.07 * (1 - i / 16);
              return [
                0.86 + r * Math.cos(q) * 0.3,
                0.42 + 0.18 * Math.sin(0.86 * Math.PI * 2.4 + ph) + r * Math.sin(q),
              ];
            }),
          );
          segL('ink', ps);
        }
      }
    }
  }
  state.RECK = null;
  // 辅助线与尺寸：净跨、矢高、全长
  for (const x of [-SP / 2, SP / 2, -XE, XE])
    seg('cons', V(x, -1.5, -W / 2 - 2.5), V(x, 12, -W / 2 - 2.5));
  seg('cons', V(-44, 0, W / 2 + 1.5), V(44, 0, W / 2 + 1.5));
  seg('cons', V(-44, deck(0), -W / 2 - 2.5), V(44, deck(0), -W / 2 - 2.5));
  for (const s of [-1, 1])
    seg(
      'cons',
      V((s * SP) / 2, 0, -W / 2 - 2.5),
      V(((s * SP) / 2) * 0.55, CY * 0.45, -W / 2 - 2.5),
    );
  {
    const z = W / 2 + 0.6;
    seg('red', V(-SP / 2, 0, z), V(SP / 2, 0, z));
    for (const s of [-1, 1]) seg('red', V((s * SP) / 2, -0.4, z), V((s * SP) / 2, 0.4, z));
    seg('red', V(0, 0, z), V(0, RI, z));
    for (let k = 0; k <= 7; k++) seg('red', V(-0.3, k, z), V(0.3, k, z));
    const zr = 13;
    seg('red', V(-XE, -0.75, zr), V(XE, -0.75, zr));
    for (let k = 0; k <= 64; k++) {
      const x = -XE + (k * 64.4) / 64,
        w = k % 5 ? 0.35 : 0.9;
      seg('red', V(x, -0.75, zr - w), V(x, -0.75, zr + w));
    }
  }
  for (let k = -70; k <= 70; k += 7)
    state.L.grid.push({ a: new Float32Array([k, -0.77, -56, k, -0.77, 56]), rec: ZERO });
  for (let k = -56; k <= 56; k += 7)
    state.L.grid.push({ a: new Float32Array([-70, -0.77, k, 70, -0.77, k]), rec: ZERO });

  const { group, KEYS } = finalize();
  const mo = smalls.find((m) => m.s > 0 && m.r > 1.8),
    mi = smalls.find((m) => m.s < 0 && m.r < 1.8),
    ra = RODS[4];
  return {
    group,
    KEYS,
    topY: 10.6,
    SH_B: 0,
    SH_T: 0,
    PMAX: 1,
    BUILD_S: 22,
    big: '赵州桥',
    name: '赵州桥',
    dd: ['安济桥 立体构造图', '敞肩圆弧石拱桥　二十八道拱券', '铅笔排线加淡彩'],
    clipN: V(-1, 0, 0),
    clipMax: 36,
    HOME: { th: 0.42, ph: 1.42, dist: 96 },
    sect: { th: 1.5, ph: 1.32, dist: 30 },
    tgt: (p, c) => V(0, 2.5 + 2 * Math.min(1, p * 1.1) + (2 * c) / 100, 0),
    notes: [
      ['主拱（圆弧拱）', V(-9.5, arcY(R + TH / 2, -9.5), W / 2)],
      ['二十八道拱券纵向并列', V(-12, arcY(R, -12) - 0.02, 1.2)],
      ['敞肩小拱（净跨3.81米）', V(mo.x, mo.yc + mo.r, W / 2), false, 8.85],
      ['小拱（净跨2.85米）', V(mi.x, mi.yc + mi.r, W / 2), false, 8.85],
      [
        '铁拉杆',
        V((R + TH + 0.09) * Math.sin(ra), CY + (R + TH + 0.09) * Math.cos(ra), W / 2 + 0.12),
        false,
        8.35,
      ],
      ['蛟龙栏板', V(4, deck(4) + 0.6, W / 2 - 0.1), false, 9.75],
      ['望柱', V(-24.15, deck(-24.15) + 1.3, W / 2 - 0.18), false, 9.75],
      ['桥台', V(22.5, -1, W / 2 + 0.3)],
      ['洨河', V(-6, -0.8, 24)],
      ['净跨 37.02米', V(-9, 0, W / 2 + 0.6)],
      ['矢高 7.23米', V(0, 3.6, W / 2 + 0.6)],
      ['全长 64.4米', V(22, -0.75, 13)],
      ['拱券剖面（28道）', V(0, RI + TH / 2, 2.4), true],
      ['护拱石', V(0, RI + TH + HG / 2, -2.2), true],
      ['铁拉杆贯通全宽', V(0, RI + TH + 0.09, -3.9), true],
    ],
    stage: (p, gy) => {
      const h = gy - 5;
      return h < 0
        ? '砌筑桥台'
        : h < 8.29
          ? '主拱券'
          : h < 8.5
            ? '腰铁·铁拉杆'
            : h < 8.8
              ? '护拱石'
              : h < 9.1
                ? '敞肩小拱'
                : h < 9.4
                  ? '拱肩墙'
                  : h < 9.7
                    ? '铺桥面'
                    : '栏板望柱';
    },
  };
}
