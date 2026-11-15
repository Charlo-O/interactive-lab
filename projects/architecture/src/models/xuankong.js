import * as THREE from '../../assets/vendor/three/three.module.js';

// 悬空寺：尺寸与构造为展示用示意，模型元数据见 docs/ARCHITECTURE.md。
export function buildXuankong(toolkit) {
  const {
    state,
    ZERO,
    C,
    V,
    V2,
    resetBuild,
    place,
    box,
    beam,
    lines,
    seg,
    surf,
    prism,
    segL,
    finalize,
  } = toolkit;
  resetBuild();
  state.GNC = true;
  const RD = C('#8e4a35'),
    WD = C('#a07650'),
    BM = C('#7b5a3e'),
    WAL = C('#d9c7a3'),
    LAT = C('#7a4632'),
    TILE = C('#5f6468'),
    RIDG = C('#4f5458'),
    ROCK = C('#a59d8c'),
    EARTH = C('#b8b19c'),
    FIG = C('#c8a964');
  // 崖面：中部凹进成岩龛，头顶岩檐外挑，崖脚外倾；叠加起伏
  const cliff = (x, y) => {
    const rec = Math.exp(-(((x + 12) / 23) ** 6)) * Math.exp(-(((y - 38) / 13.5) ** 6)),
      ovh = 4.6 * Math.exp(-(((y - 59) / 6.5) ** 2)) * Math.exp(-(((x + 12) / 30) ** 4)),
      base = y < 26 ? 3.2 * ((26 - y) / 26) ** 1.4 : 0,
      nz =
        0.55 * Math.sin(0.31 * x + 0.17 * y) +
        0.35 * Math.sin(0.83 * y - 0.27 * x + 1.3) +
        0.22 * Math.sin(1.7 * x + 1.1 * y) +
        0.15 * Math.sin(2.9 * y - 0.6 * x);
    return 6.6 - 2.5 * rec + ovh + base + nz * (1 - 0.75 * rec);
  };
  state.PAINT = ROCK;
  surf(
    'stone',
    (u, w) => {
      const x = 31.5 - 97.5 * u,
        y = -1 + 90 * w;
      return V(x, y, cliff(x, y));
    },
    80,
    72,
  );
  state.G.stone[state.G.stone.length - 1].userData.rec = ZERO;
  state.PAINT = EARTH;
  surf('ground', (u, w) => V(-62 + 124 * u, 0, 9 + w * 61), 8, 6);
  state.G.ground[state.G.ground.length - 1].userData.rec = ZERO;
  {
    const A = [],
      add = (p) => {
        for (let i = 0; i < p.length - 1; i++)
          A.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
      };
    for (let y = 2; y < 88; y += 3.4)
      for (let x = -66 + Math.random() * 4; x < 31;) {
        const l = 3 + Math.random() * 10,
          p = [],
          tilt = (Math.random() - 0.5) * 0.12;
        for (let t = 0; t <= l && x + t <= 31; t += 1.2) {
          const xx = x + t,
            yy = y + tilt * t + 0.5 * Math.sin(0.21 * xx + y);
          p.push(V(xx, yy, cliff(xx, yy) + 0.07));
        }
        if (p.length > 1) add(p);
        x += l + 1 + Math.random() * 5;
      }
    for (let n = 0; n < 150; n++) {
      let x = -64 + Math.random() * 94,
        y = 4 + Math.random() * 84;
      const p = [];
      for (let i = 0, m = 4 + Math.floor(Math.random() * 10); i < m; i++) {
        p.push(V(x, y, cliff(x, y) + 0.08));
        x += (Math.random() - 0.5) * 1.1;
        y -= 0.6 + Math.random() * 1.3;
      }
      add(p);
      if (Math.random() < 0.35) {
        const q = p[Math.floor(p.length / 2)],
          b = [q];
        let bx = q.x,
          by = q.y;
        for (let i = 0; i < 3; i++) {
          bx += (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random());
          by -= 0.4 + Math.random() * 0.6;
          b.push(V(bx, by, cliff(bx, by) + 0.08));
        }
        add(b);
      }
    }
    state.L.ink.push({ a: new Float32Array(A), rec: ZERO });
  }
  // 岩台：立柱落脚的外凸岩块
  const ROCKS = [
    [-33, 22.8, 7.8, 4, 1.1, 2.6],
    [-26, 24.2, 9.2, 3.2, 1.2, 2.4],
    [-20, 25.4, 9.6, 3.4, 1.1, 2.4],
    [-14.5, 26.2, 9.8, 3, 1.2, 2.3],
    [-8.6, 25.6, 9.6, 3, 1.1, 2.3],
    [-5.6, 26.6, 9.6, 2.6, 1, 2.2],
    [-2, 28.4, 9.8, 2.8, 1.1, 2.2],
    [2.4, 29.2, 9.7, 2.6, 1, 2.2],
    [-38, 23, 7.6, 3.4, 1.1, 2.4],
  ];
  state.PAINT = ROCK;
  for (const [x, y, z, a, b, c] of ROCKS) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(a, b, c);
    g.rotateY(Math.random());
    g.translate(x, y - b * 0.35, z - c * 0.45);
    place(g, 'stone');
  }
  const ledge = (x) => {
    let best = null;
    for (const [rx, ry, , a, b] of ROCKS) {
      const t = ry + b * 0.45;
      if (Math.abs(rx - x) < a * 0.8 && (best === null || t > best)) best = t;
    }
    return best;
  };
  // ---- 通用部件 ----
  const rails = (a, b, y) => {
    const d = b.clone().sub(a),
      n = Math.max(1, Math.round(d.length() / 1.2)),
      ps = [];
    state.PAINT = RD;
    for (let i = 0; i <= n; i++) {
      const q = a.clone().lerp(b, i / n);
      box('wood', q.x, y + 0.5, q.z, 0.12, 1, 0.12, false);
    }
    beam('wood', V(a.x, y + 0.98, a.z), V(b.x, y + 0.98, b.z), 0.1, 0.08);
    beam('wood', V(a.x, y + 0.12, a.z), V(b.x, y + 0.12, b.z), 0.1, 0.08);
    for (let i = 0; i <= n * 4; i++) {
      const q = a.clone().lerp(b, i / (n * 4));
      ps.push(V(q.x, y + 0.16, q.z), V(q.x, y + 0.94, q.z));
    }
    segL('ink', ps);
  };
  const post = (x, z, y1) => {
    const y0 = ledge(x) ?? y1 - 6,
      g = new THREE.CylinderGeometry(0.12, 0.14, y1 - y0, 8);
    state.PAINT = BM;
    g.translate(x, (y0 + y1) / 2, z);
    place(g, 'wood');
    state.PAINT = ROCK;
    box('stone', x, y0 + 0.1, z, 0.45, 0.2, 0.45);
  };
  // 飞梁：方木插入岩体约 2 米，梁头外露承托楼面
  const beams = (x0, x1, y, zf, step = 1.3) => {
    state.PAINT = BM;
    for (let x = x0; x <= x1 + 0.01; x += step) {
      const zr = cliff(x, y) - 2.1;
      box('wood', x, y, (zr + zf) / 2, 0.28, 0.34, zf - zr);
    }
  };
  // 歇山顶：檐口半宽 ea（x 向）、半深 eb（z 向），檐高 EV、脊高 RG，vc 为收山位置；正脊两端置鸱吻
  function xsRoof(cx, cz, ea, eb, EV, RG, vc = 0.48, upA = 0.5) {
    const T = 0.3,
      rh = ea - eb * vc,
      W = (a, b, y) => V(cx + a, y, cz + b),
      Y = (v) => RG - (RG - EV) * (1 - Math.pow(v, 1.6)),
      kk = (r) => Math.max(0, (Math.abs(r) - 0.62) / 0.38),
      up = (r, v) => upA * kk(r) ** 2 * (1 - v) ** 2,
      HA = (v) => ea + ((rh - ea) * Math.min(v, vc)) / vc;
    const PL = (sb, r, v, dy = 0) => W(r * HA(v), sb * eb * (1 - v), Y(v) + up(r, v) + dy),
      PE = (sa, r, v, dy = 0) => W(sa * HA(v), r * eb * (1 - v), Y(v) + up(r, v) + dy);
    for (const sb of [-1, 1]) {
      state.PAINT = TILE;
      for (let k = 0; k < 2; k++) surf('roof', (u, w) => PL(sb, 2 * u - 1, (k + w) / 2), 14, 3);
      state.PAINT = BM;
      surf('roof', (u, w) => PL(sb, 2 * u - 1, w, -T), 10, 3);
      state.PAINT = TILE;
      surf('roof', (u, w) => PL(sb, 2 * u - 1, 0, -w * T), 14, 1);
    }
    for (const sa of [-1, 1]) {
      state.PAINT = TILE;
      surf('roof', (u, w) => PE(sa, 2 * u - 1, w * vc), 8, 3);
      state.PAINT = BM;
      surf('roof', (u, w) => PE(sa, 2 * u - 1, w * vc, -T), 6, 2);
      state.PAINT = TILE;
      surf('roof', (u, w) => PE(sa, 2 * u - 1, 0, -w * T), 8, 1);
    }
    const ps = [];
    for (const sb of [-1, 1]) {
      for (let a = -ea + 0.25; a < ea; a += 0.42) {
        let pv = null;
        for (let j = 0; j <= 8; j++) {
          const v = j / 8;
          if (Math.abs(a) > HA(v) - 0.05) break;
          const q = W(a, sb * eb * (1 - v), Y(v) + up(a / HA(v), v) + 0.04);
          if (pv) ps.push(pv, q);
          pv = q;
        }
      }
      for (const dy of [0.02, -T])
        for (let j = 0; j < 16; j++)
          ps.push(PL(sb, j / 8 - 1, 0, dy), PL(sb, (j + 1) / 8 - 1, 0, dy));
    }
    for (const sa of [-1, 1]) {
      for (let b = -eb + 0.25; b < eb; b += 0.42) {
        let pv = null;
        for (let j = 0; j <= 5; j++) {
          const v = (j / 5) * vc;
          if (Math.abs(b) > eb * (1 - v) - 0.05) break;
          const q = PE(sa, b / (eb * (1 - v)), v, 0.04);
          if (pv) ps.push(pv, q);
          pv = q;
        }
      }
      for (const dy of [0.02, -T])
        for (let j = 0; j < 12; j++)
          ps.push(PE(sa, j / 6 - 1, 0, dy), PE(sa, (j + 1) / 6 - 1, 0, dy));
    }
    segL('ink', ps);
    // 山花与博风
    const gx = HA(vc),
      gb = eb * (1 - vc);
    for (const sa of [-1, 1]) {
      state.PAINT = WAL;
      surf(
        'wood',
        (u, w) => {
          const b = (2 * u - 1) * gb,
            top = Y(1 - Math.abs(b) / eb) - T;
          return W(sa * (gx - 0.28), b, Y(vc) - 0.15 + w * (top - Y(vc) + 0.15));
        },
        8,
        3,
      );
      state.PAINT = RD;
      for (const sb of [-1, 1]) {
        let pv = null;
        for (let j = 0; j <= 6; j++) {
          const v = vc + ((1 - vc) * j) / 6,
            q = W(sa * (gx + 0.02), sb * eb * (1 - v), Y(v) + 0.05);
          if (pv) beam('wood', pv, q, 0.12, 0.4);
          pv = q;
        }
      }
    }
    // 正脊、垂脊、戗脊与鸱吻
    state.PAINT = RIDG;
    box('wood', cx, RG + 0.22, cz, 2 * gx, 0.45, 0.42);
    for (const sa of [-1, 1])
      for (const sb of [-1, 1]) {
        let pv = null;
        for (let j = 0; j <= 4; j++) {
          const v = vc + ((1 - vc) * j) / 4,
            q = W(sa * gx, sb * eb * (1 - v), Y(v) + 0.15);
          if (pv) beam('wood', pv, q, 0.26, 0.24);
          pv = q;
        }
        pv = null;
        for (let j = 0; j <= 5; j++) {
          const v = vc * (1 - j / 5),
            q = PL(sb, sa, v, 0.16);
          if (pv) beam('wood', pv, q, 0.28, 0.26, j === 5);
          pv = q;
        }
      }
    for (const sa of [-1, 1]) {
      const sh = new THREE.Shape(
          [
            [0, 0],
            [0.55, 0],
            [0.62, 0.5],
            [0.48, 0.98],
            [0.2, 1.18],
            [-0.06, 1.06],
            [0.1, 0.86],
            [0.27, 0.7],
            [0.16, 0.45],
            [0, 0.4],
          ].map(([x, y]) => V2(sa * (x - 0.3), y)),
        ),
        g = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: false });
      g.translate(cx + sa * (gx - 0.2), RG + 0.42, cz - 0.12);
      place(g, 'wood');
    }
  }
  // 腰檐：前面与两侧三面环绕楼身，后靠崖壁
  function pentR(cx, zb, hx, hz, ex, ez, EV, YI, upA = 0.3) {
    const T = 0.24,
      kk = (r) => Math.max(0, (Math.abs(r) - 0.72) / 0.28),
      F = (u, v, dy = 0) => {
        const x = -ex + 2 * ex * u,
          xi = -hx + 2 * hx * u;
        return V(
          cx + x + (xi - x) * v,
          EV + (YI - EV) * v + upA * kk(2 * u - 1) ** 2 * (1 - v) ** 2 + dy,
          ez + (hz - ez) * v,
        );
      },
      S = (s, u, v, dy = 0) => {
        const z = zb + (ez - zb) * u,
          zi = zb + (hz - zb) * u;
        return V(
          cx + s * (ex + (hx - ex) * v),
          EV + (YI - EV) * v + upA * Math.max(0, (u - 0.72) / 0.28) ** 2 * (1 - v) ** 2 + dy,
          z + (zi - z) * v,
        );
      };
    state.PAINT = TILE;
    surf('roof', (u, v) => F(u, v), 14, 2);
    for (const s of [-1, 1]) surf('roof', (u, v) => S(s, u, v), 8, 2);
    state.PAINT = BM;
    surf('roof', (u, v) => F(u, v, -T), 10, 1);
    for (const s of [-1, 1]) surf('roof', (u, v) => S(s, u, v, -T), 6, 1);
    const ps = [];
    for (let i = 0; i <= 28; i++) {
      const u = i / 28;
      ps.push(F(u, 0, 0.03), F(u, 1, 0.03));
    }
    for (const s of [-1, 1])
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        ps.push(S(s, u, 0, 0.03), S(s, u, 1, 0.03));
      }
    for (const dy of [0.02, -T]) {
      for (let i = 0; i < 20; i++) ps.push(F(i / 20, 0, dy), F((i + 1) / 20, 0, dy));
      for (const s of [-1, 1])
        for (let i = 0; i < 8; i++) ps.push(S(s, i / 8, 0, dy), S(s, (i + 1) / 8, 0, dy));
    }
    segL('ink', ps);
    state.PAINT = RIDG;
    for (const s of [-1, 1])
      beam('wood', F(s > 0 ? 1 : 0, 0, 0.12), F(s > 0 ? 1 : 0, 1, 0.12), 0.2, 0.2);
  }
  // 悬山顶
  function gableRoof(x0, x1, zb, zf, EV, RG) {
    const zm = (zb + zf) / 2,
      ov = 0.6,
      P = (s, u, w, dy = 0) =>
        V(
          x0 - ov + (x1 - x0 + 2 * ov) * u,
          EV + (RG - EV) * w + dy,
          zm + s * (zf - zm + 0.5) * (1 - w),
        );
    for (const s of [-1, 1]) {
      state.PAINT = TILE;
      surf('roof', (u, w) => P(s, u, w), 10, 2);
      state.PAINT = BM;
      surf('roof', (u, w) => P(s, u, w, -0.25), 6, 1);
      const ps = [];
      for (let u = 0.02; u < 1; u += 0.42 / (x1 - x0 + 2 * ov))
        ps.push(P(s, u, 0, 0.03), P(s, u, 1, 0.03));
      segL('ink', ps);
      lines('ink', [P(s, 0, 0), P(s, 1, 0)]);
    }
    state.PAINT = RIDG;
    box('wood', (x0 + x1) / 2, RG + 0.15, zm, x1 - x0 + 2 * ov, 0.3, 0.32);
    state.PAINT = WAL;
    for (const x of [x0, x1])
      prism(
        'stone',
        [
          [zb, EV - 0.3],
          [zf, EV - 0.3],
          [zm, RG - 0.2],
        ],
        x - 0.1,
        x + 0.1,
      );
  }
  // 楼阁：后靠崖壁，前出一廊；n 层，每层层高 h；下层之上出腰檐，顶为歇山
  function tower(cx, y0, hx, zb, hz, n, h, figs) {
    const cw = 1.2,
      zc = hz + cw;
    for (let i = 0; i < n; i++) {
      const y = y0 + i * h,
        top = i === n - 1,
        y1 = y + h - 0.35;
      beams(cx - hx - cw + 0.25, cx + hx + cw - 0.2, y - 0.25, zc + 0.35);
      state.PAINT = WD;
      box('wood', cx, y - 0.04, (zb + zc) / 2, 2 * (hx + cw), 0.12, zc - zb);
      state.PAINT = RD;
      for (const x of [cx - hx - cw, cx - hx, cx - hx / 3, cx + hx / 3, cx + hx, cx + hx + cw]) {
        const g = new THREE.CylinderGeometry(0.13, 0.14, y1 - y, 8);
        g.translate(x, (y + y1) / 2, zc - 0.1);
        place(g, 'wood');
      }
      for (const s of [-1, 1])
        for (const z of [zb + 0.3, (zb + hz) / 2]) {
          const g = new THREE.CylinderGeometry(0.13, 0.14, y1 - y, 8);
          g.translate(cx + s * (hx + cw), (y + y1) / 2, z);
          place(g, 'wood');
        }
      box('wood', cx, y1 + 0.15, zc - 0.1, 2 * (hx + cw) + 0.3, 0.3, 0.24);
      for (const s of [-1, 1])
        box('wood', cx + s * (hx + cw), y1 + 0.15, (zb + zc) / 2, 0.24, 0.3, zc - zb);
      // 殿身：两山白墙，前檐当心间隔扇、次间槛窗
      state.PAINT = WAL;
      for (const s of [-1, 1])
        box('wood', cx + s * hx, (y + y1) / 2, (zb + hz) / 2, 0.18, y1 - y, hz - zb);
      {
        const bw = (2 * hx) / 3,
          ps = [];
        for (const j of [-1, 0, 1]) {
          const xc = cx + j * bw,
            z = hz;
          if (j === 0) {
            state.PAINT = LAT;
            box('wood', xc, (y + y1) / 2, z, bw - 0.25, y1 - y - 0.1, 0.1, false);
            for (let x = -bw / 2 + 0.2; x < bw / 2 - 0.1; x += (bw - 0.25) / 4)
              ps.push(V(xc + x, y + 0.1, z + 0.06), V(xc + x, y1 - 0.1, z + 0.06));
          } else {
            state.PAINT = WAL;
            box('wood', xc, y + 0.55, z, bw - 0.25, 1.1, 0.14);
            state.PAINT = LAT;
            box('wood', xc, (y + 1.1 + y1) / 2, z, bw - 0.25, y1 - y - 1.2, 0.08, false);
            for (let yy = y + 1.3; yy < y1 - 0.1; yy += 0.25)
              ps.push(V(xc - bw / 2 + 0.2, yy, z + 0.05), V(xc + bw / 2 - 0.2, yy, z + 0.05));
            for (let x = -bw / 2 + 0.25; x < bw / 2 - 0.1; x += 0.25)
              ps.push(V(xc + x, y + 1.15, z + 0.05), V(xc + x, y1 - 0.08, z + 0.05));
          }
        }
        segL('ink', ps);
      }
      rails(V(cx - hx - cw, 0, zc - 0.05), V(cx + hx + cw, 0, zc - 0.05), y);
      for (const s of [-1, 1])
        rails(V(cx + s * (hx + cw), 0, zb + 0.2), V(cx + s * (hx + cw), 0, zc - 0.05), y);
      if (!top) pentR(cx, zb, hx + cw, zc, hx + cw + 1.1, zc + 1.1, y + h - 0.95, y + h - 0.1);
      else
        xsRoof(
          cx,
          (zb + zc + 1.2) / 2,
          hx + cw + 1.1,
          (zc + 1.2 - zb) / 2,
          y + h - 0.25,
          y + h + 2.4,
        );
    }
    if (figs) {
      state.RECK = y0 + n * h;
      const y = y0 + (n - 1) * h,
        z = (zb + hz) / 2 - 0.3;
      state.PAINT = FIG;
      for (const [j, s] of [
        [-1, 0.9],
        [0, 1],
        [1, 0.9],
      ]) {
        const f = new THREE.LatheGeometry(
          [
            [0.05, y],
            [0.55, y],
            [0.6, y + 0.45],
            [0.45, y + 0.62],
            [0.4, y + 1.25],
            [0.3, y + 1.38],
            [0.12, y + 1.42],
            [0.17, y + 1.62],
            [0.13, y + 1.78],
            [0.04, y + 1.84],
          ].map(([r, yy]) => V2(r * s, y + (yy - y) * s)),
          16,
        );
        f.translate(cx + j * 1.7, 0, z);
        place(f, 'wood');
      }
      state.RECK = null;
    }
  }
  // ---- 南端：险梯与山门 ----
  state.PAINT = ROCK;
  box('stone', -44, 22.4, cliff(-44, 22.4) + 0.6, 14, 1.2, 3.4);
  {
    const a = V(-35.2, 23.3, 6.2),
      b = V(-28.4, 30.4, 6.2),
      n = 24;
    state.PAINT = WD;
    for (let i = 0; i < n; i++) {
      const q = a.clone().lerp(b, (i + 0.5) / n);
      box('wood', q.x, q.y, q.z, (b.x - a.x) / n + 0.05, 0.07, 1.2, false);
    }
    state.PAINT = BM;
    for (const o of [-0.62, 0.62])
      beam('wood', V(a.x, a.y - 0.2, a.z + o), V(b.x, b.y - 0.2, b.z + o), 0.1, 0.3);
    for (const x of [-34, -31.5, -29.2])
      beams(x, x, a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) - 0.45, 7.1, 9);
    rails(V(a.x, 0, a.z + 0.66), V(b.x, 0, b.z + 0.66), 0);
  }
  // ---- 寺院：平台、两层大殿与山门 ----
  {
    const y = 30.4,
      x0 = -28.2,
      x1 = -16.6,
      zb = 4.6,
      zf = 10.6;
    beams(x0 + 0.3, x1 - 0.3, y - 0.25, zf + 0.3, 1.4);
    state.PAINT = WD;
    box('wood', (x0 + x1) / 2, y - 0.04, (zb + zf) / 2, x1 - x0, 0.12, zf - zb);
    for (const x of [-26.5, -22.3, -18]) post(x, zf - 0.2, y - 0.42);
    rails(V(x0, 0, zf - 0.05), V(x1, 0, zf - 0.05), y);
    const hx0 = -26.6,
      hx1 = -19.4,
      hz = 8.4;
    state.PAINT = RD;
    for (const x of [hx0, (2 * hx0 + hx1) / 3, (hx0 + 2 * hx1) / 3, hx1])
      for (const yy of [
        [y, y + 3.4],
        [y + 3.6, y + 6.4],
      ]) {
        const g = new THREE.CylinderGeometry(0.14, 0.15, yy[1] - yy[0], 8);
        g.translate(x, (yy[0] + yy[1]) / 2, hz + 1.1);
        place(g, 'wood');
      }
    state.PAINT = WAL;
    for (const [ya, yb] of [
      [y, y + 3.4],
      [y + 3.6, y + 6.4],
    ]) {
      box('wood', (hx0 + hx1) / 2, (ya + yb) / 2, hz, hx1 - hx0, yb - ya, 0.18);
      for (const x of [hx0, hx1])
        box('wood', x, (ya + yb) / 2, (zb + hz) / 2, 0.18, yb - ya, hz - zb);
    }
    {
      const ps = [];
      for (const ya of [y, y + 3.6])
        for (const k of [0, 1, 2]) {
          const xc = hx0 + ((hx1 - hx0) * (k + 0.5)) / 3,
            w = (hx1 - hx0) / 3 - 0.6,
            z = hz + 0.1,
            yt = ya + (k === 1 ? 2.9 : 2.5),
            yb = ya + (k === 1 ? 0.1 : 0.9);
          state.PAINT = LAT;
          box('wood', xc, (yt + yb) / 2, z, w, yt - yb, 0.06, false);
          for (let x = -w / 2 + 0.15; x < w / 2; x += 0.22)
            ps.push(V(xc + x, yb, z + 0.04), V(xc + x, yt, z + 0.04));
        }
      segL('ink', ps);
    }
    state.PAINT = WD;
    box(
      'wood',
      (hx0 + hx1) / 2,
      y + 3.5,
      (zb + hz + 1.2) / 2,
      hx1 - hx0 + 0.4,
      0.14,
      hz + 1.2 - zb,
    );
    rails(V(hx0, 0, hz + 1.15), V(hx1, 0, hz + 1.15), y + 3.56);
    pentR(
      (hx0 + hx1) / 2,
      zb,
      (hx1 - hx0) / 2,
      hz + 1.2,
      (hx1 - hx0) / 2 + 0.9,
      hz + 2.1,
      y + 3.0,
      y + 3.5,
      0.2,
    );
    gableRoof(hx0, hx1, zb, hz + 1.3, y + 6.3, y + 8.3);
    state.PAINT = RD;
    for (const z of [6.6, 9.4]) {
      const g = new THREE.CylinderGeometry(0.15, 0.16, 3, 8);
      g.translate(x0 + 0.4, y + 1.5, z);
      place(g, 'wood');
    }
    box('wood', x0 + 0.4, y + 3.05, 8, 0.3, 0.3, 3.4);
    gableRoof(x0 - 0.2, x0 + 1, 6.1, 9.9, y + 3.3, y + 4.2);
  }
  // ---- 南楼与北楼：三层三檐歇山顶；北楼顶层为三教殿 ----
  tower(-11.5, 31, 3, 4.6, 8.6, 3, 3.6, false);
  for (const x of [-14.6, -8.4]) post(x, 9.7, 30.58);
  tower(0, 34, 3, 4.6, 8.6, 3, 3.6, true);
  for (const x of [-2.6, 2.6]) post(x, 9.7, 33.58);
  // ---- 栈道（飞廊）：连接南楼三层与北楼二层，崖上插梁、长立柱落于岩台，单坡瓦顶 ----
  {
    const xa = -7.3,
      xb = -4.2,
      ya = 38.2,
      yb = 37.6,
      za = 5.4,
      zf = 9.8;
    beams(xa + 0.3, xb - 0.3, Math.min(ya, yb) - 0.3, zf + 0.3, 0.95);
    state.PAINT = WD;
    surf(
      'wood',
      (u, w) => V(xa + (xb - xa) * u, ya + (yb - ya) * u + 0.02, za + (zf - za) * w),
      4,
      2,
    );
    for (const x of [-6.5, -5]) post(x, zf - 0.15, Math.min(ya, yb) - 0.47);
    rails(V(xa, 0, zf - 0.05), V(xb, 0, zf - 0.05), (ya + yb) / 2);
    state.PAINT = RD;
    for (const x of [xa + 0.15, xb - 0.15]) {
      const g = new THREE.CylinderGeometry(0.11, 0.12, 2.6, 8);
      g.translate(x, (ya + yb) / 2 + 1.3, zf - 0.1);
      place(g, 'wood');
    }
    state.PAINT = TILE;
    surf(
      'roof',
      (u, w) => V(xa - 0.3 + (xb - xa + 0.6) * u, 41.2 - 1.6 * w, 4.6 + (zf + 0.7 - 4.6) * w),
      6,
      2,
    );
    {
      const ps = [];
      for (let x = xa - 0.2; x < xb + 0.3; x += 0.4)
        ps.push(V(x, 41.23, 4.6), V(x, 39.63, zf + 0.7));
      segL('ink', ps);
    }
  }
  // 辅助线与尺寸
  for (const x of [-35.5, 4.4]) seg('cons', V(x, -1, 14), V(x, 52, 14));
  seg('cons', V(-50, 50, 14), V(20, 50, 14));
  seg('cons', V(-50, 30.4, 14), V(20, 30.4, 14));
  for (let y = 0; y <= 50; y += 10) seg('cons', V(4, y, 13), V(12, y, 13));
  {
    const SX = 8,
      SZ = 13;
    seg('red', V(SX, 0, SZ), V(SX, 50, SZ));
    for (let k = 0; k <= 50; k++) {
      const w = k % 5 ? 0.45 : 1.2;
      seg('red', V(SX - w, k, SZ), V(SX + w, k, SZ));
    }
    seg('red', V(-35.5, 52, 14), V(4.4, 52, 14));
    for (const x of [-35.5, 4.4]) seg('red', V(x, 51.3, 14), V(x, 52.7, 14));
  }
  for (let k = -63; k <= 63; k += 7)
    state.L.grid.push({ a: new Float32Array([k, -0.03, 9, k, -0.03, 63]), rec: ZERO });
  for (let k = 14; k <= 63; k += 7)
    state.L.grid.push({ a: new Float32Array([-63, -0.03, k, 63, -0.03, k]), rec: ZERO });

  const { group, KEYS } = finalize();
  return {
    group,
    KEYS,
    topY: 49,
    SH_B: 0,
    SH_T: 0,
    PMAX: 1,
    BUILD_S: 26,
    big: '悬空寺',
    name: '悬空寺',
    dd: ['悬空寺 立体木构图', '一院两楼　飞梁插岩　立柱承托', '铅笔排线加淡彩'],
    clipN: V(-1, 0, 0),
    clipMax: 31.5,
    HOME: { th: -0.72, ph: 1.46, dist: 98 },
    sect: { th: 1.52, ph: 1.5, dist: 46 },
    tgt: (p, c) => V(-12 + (11 * c) / 100, 30 + 8 * Math.min(1, p * 1.1), 6),
    notes: [
      ['北楼（三层三檐歇山顶）', V(0, 46.4, 7)],
      ['南楼', V(-11.5, 43.4, 7.5)],
      ['栈道（飞廊）', V(-5.7, 38.6, 9.6)],
      ['飞梁（半插入岩体）', V(1.95, 33.75, 10.1)],
      ['立柱（“三根马尾空中吊”）', V(-6.5, 32.4, 9.65)],
      ['寺院大殿', V(-23, 38.9, 6.8)],
      ['山门与险梯', V(-31.6, 27, 6.8)],
      ['翠屏峰崖壁', V(-46, 42, cliff(-46, 42))],
      ['岩檐', V(-12, 61, cliff(-12, 61))],
      ['岩台', V(-20, 25.6, 9.8)],
      ['最高处距地约50米', V(8, 50, 13)],
      ['全长约32米', V(-15, 52, 14)],
      ['飞梁插入岩体约2米', V(0, 33.75, 3.2), true],
      ['三教殿（释迦·老子·孔子）', V(0, 42.6, 6.4), true],
      ['腰檐', V(0, 37.3, 10.4), true],
    ],
    stage: (p, gy) => {
      const h = gy - 5;
      return h < 29.6
        ? '岩台立柱'
        : h < 30.6
          ? '凿岩插梁'
          : h < 34
            ? '寺院与南楼底层'
            : h < 37.4
              ? '南楼二层·北楼底层'
              : h < 41
                ? '栈道与三层'
                : h < 44.6
                  ? '歇山顶'
                  : '北楼收顶';
    },
  };
}
