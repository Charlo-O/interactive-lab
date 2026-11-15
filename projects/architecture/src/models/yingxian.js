import * as THREE from '../../assets/vendor/three/three.module.js';

// 应县木塔：尺寸与构造为展示用示意，模型元数据见 docs/ARCHITECTURE.md。
export function buildYingxian(toolkit) {
  const {
    state,
    ZERO,
    C,
    GOLD,
    V,
    V2,
    P2,
    RY,
    TAU,
    resetBuild,
    place,
    box,
    beam,
    lines,
    seg,
    surf,
    segL,
    ring,
    finalize,
  } = toolkit;
  resetBuild();
  const COLR = C('#9c5a3c'),
    BRK = C('#94765a'),
    WAL = C('#e6dfcd'),
    TILE = C('#63676a'),
    RIDG = C('#54585c'),
    RAIL = C('#8d5c40'),
    STNP = C('#aba69a'),
    IRON = C('#4a4642'),
    FLR_C = C('#9f8466'),
    PLQ = C('#3f3a35'),
    CLAY = C('#c8b48f');
  const P8 = Math.PI / 8,
    Q4 = Math.PI / 4,
    CO = Math.cos(P8),
    SI = Math.sin(P8);
  // 第 k 面（面心角 k·45°，0 为南）的局部坐标：t 沿面，d 为至中心的垂距
  const sideP = (k, t, y, d) => {
    const f = k * Q4;
    return V(t * Math.cos(f) + d * Math.sin(f), y, -t * Math.sin(f) + d * Math.cos(f));
  };
  const vtx = (R, k, y) => P2(R, y, k * Q4 + P8); // 第 k 角，位于第 k 面与第 k+1 面之间
  // 八角回转体（逐面平直）
  function octBand(grp, pr) {
    for (let i = 0; i < pr.length - 1; i++) {
      const [r0, y0] = pr[i],
        [r1, y1] = pr[i + 1];
      if (Math.abs(r1 - r0) + Math.abs(y1 - y0) < 1e-6) continue;
      const g = new THREE.LatheGeometry([V2(r0, y0), V2(r1, y1)], 8, P8).toNonIndexed();
      g.computeVertexNormals();
      place(g, grp);
    }
  }
  // 台基 3.6 米，塔身各层层高（实测）：一层 14.57、二层 8.82、三层 8.59、四层 7.75 米
  const Y0 = 3.6,
    FL = [Y0, Y0 + 14.57, Y0 + 23.39, Y0 + 31.98, Y0 + 39.73],
    RO = [12.49, 12.1, 11.7, 11.3, 10.9],
    RN = [6.95, 6.75, 6.55, 6.35, 6.15],
    CH = [7.8, 3.4, 3.4, 2.9, 3.3],
    SC = [0.2, 0.17, 0.165, 0.16, 0.155],
    OV = [3.9, 3.4, 3.3, 3.2, 3.2];
  const APEX = Y0 + 52.1,
    TOP = 67.31;
  // 铺作：栌斗之上华栱逐跳外出。eave 为檐下铺作（加下昂、令栱），否则为平坐铺作
  function puzuo(f, t, d, yb, s, eave) {
    state.FACE = RY(f);
    const p = 3 * s;
    state.PAINT = BRK;
    box('wood', t, yb + s, d, 3.6 * s, 2 * s, 3.6 * s);
    box('wood', t, yb + 3 * s, d, 6.2 * s, 2 * s, 1.1 * s);
    box('wood', t, yb + 3 * s, d, 1.1 * s, 2 * s, 2 * p);
    box('wood', t, yb + 5 * s, d, 9.2 * s, 2 * s, 1.1 * s);
    box('wood', t, yb + 5 * s, d, 1.1 * s, 2 * s, 4 * p);
    box('wood', t, yb + 5 * s, d + p, 6.2 * s, 2 * s, 1.1 * s);
    if (eave) {
      beam('wood', V(t, yb + 9 * s, d - 2.5 * p), V(t, yb + 5.8 * s, d + 3.4 * p), 1.1 * s, 2 * s);
      box('wood', t, yb + 7 * s, d + 2 * p, 6.2 * s, 2 * s, 1.1 * s);
      box('wood', t, yb + 9 * s, d + 1.2 * p, 1.1 * s, 2 * s, 4.4 * p);
      box('wood', t, yb + 9 * s, d + 3 * p, 7.2 * s, 2 * s, 1.1 * s);
    } else {
      box('wood', t, yb + 7 * s, d + 0.5 * p, 1.1 * s, 2 * s, 5 * p);
      box('wood', t, yb + 7 * s, d + 2 * p, 7.2 * s, 2 * s, 1.1 * s);
    }
    state.FACE = new THREE.Matrix4();
  }
  function puzuoRing(i, yb, eave, R = RO[i], s = SC[i], bj = eave) {
    const ap = R * CO,
      hs = R * SI;
    for (let k = 0; k < 8; k++) {
      puzuo(k * Q4 - P8, 0, R, yb, s, eave);
      for (const t of bj ? [(-2 * hs) / 3, -hs / 3, 0, hs / 3, (2 * hs) / 3] : [-hs / 3, hs / 3])
        puzuo(k * Q4, t, ap, yb, s, eave);
    }
  } // bj：是否加补间铺作
  // 八边形方木一圈（外接圆 R）
  const octBeams = (R, y, w, h, edge = true) => {
    for (let k = 0; k < 8; k++) beam('wood', vtx(R, k - 1, y), vtx(R, k, y), w, h, edge);
  };
  // 柱：外槽 24、内槽 8
  function columns(R, y0, y1, rad, per = 3) {
    const ap = R * CO,
      hs = R * SI;
    state.PAINT = COLR;
    for (let k = 0; k < 8; k++)
      for (let j = 0; j < per; j++) {
        const t = -hs + (2 * hs * j) / per,
          p = sideP(k, t, 0, ap),
          g = new THREE.CylinderGeometry(rad, rad * 1.04, y1 - y0, 10);
        g.translate(p.x, (y0 + y1) / 2, p.z);
        place(g, 'wood');
      }
  }
  // 八角屋面：檐口外接圆 Re、高 Ye → 上端 Rt、Yt（Rt=0 为攒尖）；角部起翘；角梁头挂风铎
  function octRoof(Re, Ye, Rt, Yt, upA) {
    const T = 0.42,
      R = (v) => Re + (Rt - Re) * v,
      Y = (v) => Ye + (Yt - Ye) * Math.pow(v, 1.35),
      wk = (u) => Math.max(0, (Math.abs(2 * u - 1) - 0.45) / 0.55),
      vm = Rt > 0 ? 1 : 0.93;
    const P = (k, u, v, dy = 0) => {
      const r = Math.max(0.05, R(v)),
        q = vtx(r, k - 1, 0).lerp(vtx(r, k, 0), u);
      q.y = Y(v) + upA * wk(u) ** 2 * (1 - v) ** 2 + dy;
      return q;
    };
    for (let k = 0; k < 8; k++) {
      state.PAINT = TILE;
      for (let b = 0; b < 2; b++) surf('roof', (u, v) => P(k, u, ((b + v) / 2) * vm), 12, 3);
      state.PAINT = BRK;
      surf('roof', (u, v) => P(k, u, v * vm, -T), 10, 3);
      state.PAINT = TILE;
      surf('roof', (u, v) => P(k, u, 0, -v * T), 12, 1);
      for (const dy of [0.02, -T])
        lines(
          'ink',
          Array.from({ length: 13 }, (_, i) => P(k, i / 12, 0, dy)),
        );
      const n = Math.max(6, Math.round((2 * Re * SI) / 0.5)),
        ps = [];
      for (let i = 1; i < n; i++) {
        const u = i / n,
          e = Rt > 0 ? 0.98 : (i % 2 ? 0.72 : 0.9) * vm;
        for (let j = 0; j < 6; j++)
          ps.push(P(k, u, (e * j) / 6, 0.04), P(k, u, (e * (j + 1)) / 6, 0.04));
      }
      segL('ink', ps);
      const sf = [];
      for (let i = 1; i < n; i++) {
        const u = i / n;
        sf.push(P(k, u, 0, -T - 0.02), P(k, u, Math.min(0.45, vm), -T - 0.02));
      }
      segL('ink', sf);
      state.PAINT = RIDG;
      let pv = null;
      for (let j = 0; j <= 6; j++) {
        const q = P(k, 1, (j / 6) * vm, 0.18);
        if (pv) beam('wood', pv, q, 0.36, 0.3, j === 1);
        pv = q;
      }
      state.PAINT = IRON;
      {
        const c = P(k, 1, 0, -0.1),
          b = new THREE.CylinderGeometry(0.1, 0.2, 0.42, 8);
        b.translate(c.x, c.y - 0.62, c.z);
        place(b, 'wood');
        seg('ink', c, V(c.x, c.y - 0.4, c.z));
      }
    }
  }
  // ---- 台基：下方上八角，南出踏道 ----
  state.PAINT = STNP;
  box('stone', 0, 0.9, 0, 38, 1.8, 38);
  octBand('stone', [
    [17.8, 1.8],
    [17.8, Y0],
    [0.08, Y0],
  ]);
  for (const y of [0.6, 1.2])
    lines(
      'ink',
      [V(-19.02, y, -19.02), V(19.02, y, -19.02), V(19.02, y, 19.02), V(-19.02, y, 19.02)],
      true,
    );
  for (let i = 0; i < 9; i++) {
    const zf = 21.7 - i * 0.3,
      h = (i + 1) * 0.2;
    box('stone', 0, h / 2, (19 + zf) / 2, 6, h, zf - 19);
    const zf2 = 19 - i * 0.284;
    box('stone', 0, 1.8 + h / 2, (16.3 + zf2) / 2, 6, h, zf2 - 16.3);
  }
  // ---- 一层：副阶周匝 24 柱，外槽厚墙南北开门，塔心室供释迦坐像 ----
  const yF = Y0 + 4.4;
  columns(15.6, Y0, yF, 0.3);
  state.PAINT = COLR;
  octBeams(15.6, yF + 0.15, 0.3, 0.3);
  state.PAINT = BRK;
  octBeams(15.6, yF + 0.42, 0.5, 0.24);
  puzuoRing(0, yF + 0.54, true, 15.6, 0.15, false);
  state.PAINT = BRK;
  octBeams((15.6 * CO + 2.7 * 0.15 * 3) / CO, yF + 0.54 + 1.5 + 0.15, 0.25, 0.3);
  octRoof(18.4, yF + 1.85, 13.2, Y0 + 7.75, 0.55);
  const yc0 = FL[0] + CH[0];
  state.PAINT = CLAY;
  octBand('stone', [
    [RO[0] + 0.62, Y0],
    [RO[0] + 0.62, yc0],
    [RO[0] - 0.62, yc0],
    [RO[0] - 0.62, Y0],
  ]);
  columns(RO[0], Y0, yc0, 0.34);
  octBand('stone', [
    [RN[0] + 0.35, Y0],
    [RN[0] + 0.35, yc0 - 0.4],
    [5.54, yc0 - 0.4],
    [5.54, Y0],
  ]);
  columns(RN[0], Y0, yc0 + 2.2, 0.36, 1);
  for (const k of [0, 4]) {
    const d = (RO[0] + 0.62) * CO + 0.05;
    state.FACE = RY(k * Q4);
    state.PAINT = PLQ;
    box('wood', 0, Y0 + 2.4, d, 2.8, 4.8, 0.1);
    state.PAINT = COLR;
    box('wood', -1.55, Y0 + 2.5, d + 0.05, 0.3, 5, 0.2);
    box('wood', 1.55, Y0 + 2.5, d + 0.05, 0.3, 5, 0.2);
    box('wood', 0, Y0 + 5.05, d + 0.05, 3.4, 0.3, 0.2);
    seg('ink', V(0, Y0, d + 0.07), V(0, Y0 + 4.8, d + 0.07));
  }
  {
    const d = (RN[0] + 0.35) * CO + 0.04;
    state.FACE = RY(0);
    state.PAINT = PLQ;
    box('wood', 0, Y0 + 2.6, d, 2.4, 5.2, 0.08);
  }
  state.FACE = new THREE.Matrix4();
  // 释迦牟尼坐像：须弥座、仰莲、结跏趺坐，背光
  state.RECK = yc0;
  {
    const y = Y0;
    state.PAINT = C('#b9a27c');
    octBand('stone', [
      [4.1, y],
      [4.1, y + 0.9],
      [3.5, y + 1.3],
      [3.5, y + 1.8],
      [4, y + 2.1],
      [4, y + 2.3],
    ]);
    state.PAINT = C('#c8a964');
    const lot = new THREE.LatheGeometry(
      [
        [0.1, y + 2.3],
        [3.6, y + 2.3],
        [3.9, y + 2.7],
        [3.4, y + 3],
      ].map(([r, yy]) => V2(r, yy)),
      24,
    );
    place(lot, 'wood');
    const fig = new THREE.LatheGeometry(
      [
        [0.1, y + 3],
        [3, y + 3],
        [3.2, y + 3.6],
        [2.7, y + 4.4],
        [1.7, y + 4.7],
        [1.6, y + 5.8],
        [1.75, y + 7],
        [1.5, y + 7.6],
        [0.6, y + 7.9],
        [0.5, y + 8.2],
        [0.75, y + 8.6],
        [0.8, y + 9.2],
        [0.6, y + 9.7],
        [0.45, y + 9.85],
        [0.35, y + 10.2],
        [0.05, y + 10.32],
      ].map(([r, yy]) => V2(r, yy)),
      28,
    );
    fig.scale(1, 1, 0.72);
    place(fig, 'wood');
    const hal = new THREE.CylinderGeometry(2.6, 2.6, 0.12, 32);
    hal.rotateX(Math.PI / 2);
    hal.scale(1, 1.25, 1);
    hal.translate(0, y + 8.2, -1.3);
    state.PAINT = C('#d6b25a');
    place(hal, 'wood');
  }
  state.RECK = null;
  // ---- 各层：柱、阑额普拍枋、檐下铺作、屋面；上层之下为平坐与暗层 ----
  const yb = [],
    eaveY = [];
  for (let i = 0; i < 5; i++) {
    const R = RO[i],
      ap = R * CO,
      hs = R * SI,
      y0 = FL[i],
      yc = y0 + CH[i],
      s = SC[i];
    if (i > 0) {
      columns(R, y0, yc, 0.3);
      columns(RN[i], y0, yc + 2, 0.32, 1);
    }
    state.PAINT = COLR;
    octBeams(R, yc - 0.3, 0.3, 0.45);
    state.PAINT = BRK;
    octBeams(R, yc + 0.12, 0.62, 0.24);
    yb[i] = yc + 0.24;
    puzuoRing(i, yb[i], true);
    state.PAINT = BRK;
    octBeams((ap + 9 * s) / CO, yb[i] + 10 * s + 0.15, 0.25, 0.3);
    octBeams(R, yb[i] + 6 * s, 0.22, 0.5, false);
    octBeams(RN[i], yc + 1.8, 0.4, 0.5);
    eaveY[i] = yb[i] + 10 * s - 0.2;
    // 外槽各间：四正面当心间设格子门，其余为白墙
    if (i > 0)
      for (let k = 0; k < 8; k++) {
        state.FACE = RY(k * Q4);
        for (const tc of [(-2 * hs) / 3, 0, (2 * hs) / 3]) {
          const bw = (2 * hs) / 3 - 0.62,
            h = CH[i] - 0.55,
            yy = y0 + h / 2 + 0.05;
          if (tc === 0 && k % 2 === 0) {
            state.PAINT = RAIL;
            box('wood', tc, yy, ap, bw, h, 0.12, false);
            const ps = [],
              z = ap + 0.07;
            for (let x = -bw / 2 + 0.12; x <= bw / 2 - 0.1; x += bw / 4 - 0.03)
              ps.push(V(tc + x, y0 + 0.1, z), V(tc + x, y0 + h, z));
            for (let yv = y0 + h * 0.35; yv < y0 + h - 0.1; yv += 0.22)
              ps.push(V(tc - bw / 2 + 0.1, yv, z), V(tc + bw / 2 - 0.1, yv, z));
            segL('ink', ps);
          } else {
            state.PAINT = WAL;
            box('wood', tc, yy, ap, bw, h, 0.2);
          }
        }
      }
    state.FACE = new THREE.Matrix4();
    // 匾额（南面）
    if (i > 0) {
      state.FACE = RY(0);
      state.PAINT = PLQ;
      box('wood', 0, yc + 0.75, ap + 0.32, 2.6, 0.9, 0.1);
      state.PAINT = GOLD;
      box('wood', 0, yc + 0.75, ap + 0.29, 2.9, 1.1, 0.06, false);
      state.FACE = new THREE.Matrix4();
    }
    if (i < 4) {
      const Rn = RO[i + 1],
        sp = SC[i + 1],
        yP = FL[i + 1] - 0.35 - 8 * sp;
      octRoof(R + OV[i], eaveY[i], Rn + 0.3, yP - 0.05, 0.5 + 0.05 * (4 - i));
      // 平坐：铺作、地面方、楼板与勾栏
      puzuoRing(i + 1, yP, false);
      const Rp = Rn + 2.4;
      state.PAINT = BRK;
      octBeams((Rn * CO + 2 * 3 * sp) / CO, yP + 8 * sp + 0.12, 0.3, 0.25);
      state.PAINT = FLR_C;
      octBand('wood', [
        [Rp, FL[i + 1] - 0.32],
        [Rp, FL[i + 1]],
        [0.08, FL[i + 1]],
      ]);
      state.PAINT = RAIL;
      {
        const yr = FL[i + 1],
          apr = (Rp - 0.15) * CO,
          hp = (Rp - 0.15) * SI,
          ps = [];
        for (let k = 0; k < 8; k++) {
          for (const t of [-hp, -hp / 2, 0, hp / 2]) {
            const p = sideP(k, t, yr + 0.55, apr);
            box('wood', p.x, p.y, p.z, 0.18, 1.1, 0.18, false);
          }
          for (let t = -hp; t < hp; t += 0.24)
            ps.push(sideP(k, t, yr + 0.12, apr), sideP(k, t, yr + 0.95, apr));
        }
        segL('ink', ps);
        octBeams(Rp - 0.15, yr + 1.05, 0.14, 0.12);
        octBeams(Rp - 0.15, yr + 0.55, 0.1, 0.1);
        octBeams(Rp - 0.15, yr + 0.08, 0.12, 0.12);
      }
      // 暗层：柱间斜撑构成三角形，夹在平坐与上层楼板之间
      {
        const h0 = yb[i] + 10 * s + 0.5,
          h1 = FL[i + 1] - 0.35,
          An = Rn * CO,
          Hn = Rn * SI;
        state.PAINT = BRK;
        columns(Rn, h0, h1, 0.26);
        columns(RN[i + 1], h0, h1, 0.28, 1);
        for (let k = 0; k < 8; k++) {
          for (let j = 0; j < 3; j++) {
            const t0 = -Hn + (2 * Hn * j) / 3,
              t1 = t0 + (2 * Hn) / 3;
            beam(
              'wood',
              sideP(k, t0, h0 + 0.2, An - 0.3),
              sideP(k, t1, h1 - 0.2, An - 0.3),
              0.22,
              0.26,
            );
          }
          beam('wood', vtx(RN[i + 1], k, h0 + 0.2), vtx(Rn, k, h1 - 0.2), 0.24, 0.28);
          beam('wood', vtx(RN[i + 1], k - 1, h0 + 0.2), vtx(RN[i + 1], k, h1 - 0.2), 0.22, 0.26);
        }
        state.PAINT = WAL;
        octBand('wood', [
          [Rn + 0.05, h0],
          [Rn + 0.05, h1],
        ]);
      }
    }
  }
  // 顶层攒尖与塔刹：刹座、覆钵、相轮七重、宝盖、仰月、宝珠，八条铁链系于檐角
  octRoof(RO[4] + OV[4], eaveY[4], 0, APEX, 0.55);
  state.PAINT = BRK;
  for (let k = 0; k < 8; k++)
    beam(
      'wood',
      vtx((RO[4] * CO + 9 * SC[4]) / CO, k, eaveY[4] + 0.2),
      V(0, APEX - 1.2, 0),
      0.32,
      0.4,
    );
  state.PAINT = CLAY;
  octBand('stone', [
    [2.1, APEX - 0.9],
    [2.1, APEX + 0.5],
    [1.6, APEX + 0.9],
    [1.6, APEX + 1.4],
    [2.2, APEX + 1.8],
    [2.2, APEX + 2],
  ]);
  state.PAINT = IRON;
  {
    const y = APEX + 2;
    place(
      new THREE.LatheGeometry(
        [
          [0.05, y],
          [1.5, y],
          [1.55, y + 0.5],
          [1.2, y + 1.05],
          [0.5, y + 1.3],
          [0.2, y + 1.32],
        ].map(([r, yy]) => V2(r, yy)),
        24,
      ),
      'wood',
    );
    const m = new THREE.CylinderGeometry(0.13, 0.16, TOP - APEX + 1, 8);
    m.translate(0, (APEX - 1 + TOP) / 2, 0);
    place(m, 'wood');
    for (let k = 0; k < 7; k++) {
      const r = 1.2 - k * 0.07,
        g = new THREE.CylinderGeometry(r, r, 0.18, 20);
      g.translate(0, y + 1.9 + k * 0.55, 0);
      place(g, 'wood');
    }
    const yg = y + 6.1,
      cap = new THREE.CylinderGeometry(1.7, 1.2, 0.3, 24);
    cap.translate(0, yg, 0);
    place(cap, 'wood');
    const moon = new THREE.TorusGeometry(0.55, 0.07, 6, 20, Math.PI);
    moon.rotateZ(Math.PI);
    moon.translate(0, yg + 2.3, 0);
    place(moon, 'wood');
    for (const [yy, r] of [
      [yg + 1.2, 0.42],
      [yg + 3.1, 0.34],
    ]) {
      const b = new THREE.SphereGeometry(r, 14, 10);
      b.translate(0, yy, 0);
      place(b, 'wood');
    }
    const er = RO[4] + OV[4];
    for (let k = 0; k < 8; k++) {
      const a = vtx(1.65, k, yg),
        b = vtx(er - 0.2, k, eaveY[4] + 0.55 + 0.4),
        p = [];
      for (let j = 0; j <= 14; j++) {
        const t = j / 14,
          q = a.clone().lerp(b, t);
        q.y -= 1.6 * Math.sin(Math.PI * t);
        p.push(q);
      }
      lines('ink', p);
    }
  }
  // 五层藻井
  state.PAINT = C('#7b8c7a');
  octBand('wood', [
    [0.08, FL[4] + 7.1],
    [1.6, FL[4] + 7.1],
    [1.6, FL[4] + 6.6],
    [3.4, FL[4] + 6.6],
    [3.4, FL[4] + 6.1],
    [RN[4] - 0.2, FL[4] + 6.1],
  ]);
  // 上层佛像（简化）
  for (let i = 1; i < 5; i++) {
    state.RECK = FL[i] + CH[i];
    const y = FL[i],
      h = [0, 4.05, 2.73, 4.27, 3.41][i];
    state.PAINT = C('#c8a964');
    octBand('stone', [
      [1.6, y],
      [1.6, y + 0.7],
      [1.3, y + 0.9],
    ]);
    const f = new THREE.LatheGeometry(
      [
        [0.05, y + 0.9],
        [1.2, y + 0.9],
        [1.3, y + 0.9 + h * 0.15],
        [0.9, y + 0.9 + h * 0.24],
        [0.7, y + 0.9 + h * 0.6],
        [0.55, y + 0.9 + h * 0.7],
        [0.25, y + 0.9 + h * 0.74],
        [0.32, y + 0.9 + h * 0.86],
        [0.26, y + 0.9 + h * 0.97],
        [0.05, y + 0.9 + h],
      ].map(([r, yy]) => V2(r, yy)),
      20,
    );
    f.scale(1, 1, 0.75);
    place(f, 'wood');
  }
  state.RECK = null;
  // 辅助线与尺寸
  for (const R of [24, 30, 37]) {
    const p = [];
    for (let k = 0; k <= 8; k++) p.push(vtx(R, k, 0));
    lines('cons', p);
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    seg('cons', P2(21, 0, a), P2(42, 0, a));
  }
  for (let k = 0; k < 8; k++)
    seg('cons', vtx(RO[0] + OV[0] + 3, k, -1), vtx(RO[0] + OV[0] + 3, k, TOP + 2));
  for (const y of FL) ring('cons', RO[0] + 9, y, 64);
  {
    const SX = -30,
      SZ = -12;
    seg('red', V(SX, 0, SZ), V(SX, TOP, SZ));
    for (let k = 0; k <= 67; k++) {
      const w = k % 5 ? 0.5 : 1.3;
      seg('red', V(SX - w, k, SZ), V(SX + w, k, SZ));
    }
  }
  for (let k = -63; k <= 63; k += 7)
    state.L.grid.push({
      a: new Float32Array([k, -0.02, -63, k, -0.02, 63, -63, -0.02, k, 63, -0.02, k]),
      rec: ZERO,
    });

  const { group, KEYS } = finalize();
  return {
    group,
    KEYS,
    topY: TOP,
    SH_B: 0,
    SH_T: 0,
    PMAX: 1,
    BUILD_S: 28,
    big: '应县木塔',
    name: '应县木塔',
    dd: ['佛宫寺释迦塔 立体木构图', '八角五层六檐　明五暗四　双层套筒', '铅笔排线加淡彩'],
    clipN: V(0, 0, -1),
    clipMax: 25,
    HOME: { th: 0.45, ph: 1.36, dist: 190 },
    sect: { th: 0.06, ph: 1.45, dist: 158 },
    tgt: (p, c) => V(0, 12 + 19 * Math.min(1, p * 1.1) + (2 * c) / 100, 0),
    notes: [
      ['铁塔刹（高约11.6米）', V(0, APEX + 6, 0)],
      ['攒尖顶', vtx(6, 1, APEX - 3.5)],
      ['平坐与勾栏', sideP(1, 0, FL[2] + 1, (RO[2] + 2.25) * CO)],
      ['外檐铺作（全塔斗栱五十四种）', sideP(1, 0, yb[0] + 1, RO[0] * CO + 1.2)],
      ['副阶周匝', sideP(-1, 0, Y0 + 3, 15.6 * CO)],
      ['塔基（高约3.6米）', sideP(-1, 0, 2.4, 17.8 * CO)],
      ['格子门', sideP(0, 0, FL[1] + 1.6, RO[1] * CO + 0.1)],
      ['匾额', V(0, FL[2] + CH[2] + 0.75, RO[2] * CO + 0.4)],
      ['风铎', vtx(RO[3] + OV[3], 2, eaveY[3] - 0.6)],
      ['明五暗四　外观六檐', sideP(2, 0, eaveY[2] + 0.6, (RO[2] + OV[2] * 0.6) * CO)],
      ['通高 67.31米', V(-30, TOP, -12)],
      ['释迦牟尼坐像（高约10.3米）', V(0, Y0 + 8.4, 0), true],
      ['暗层斜撑', sideP(2, 0, (yb[1] + FL[2]) / 2 + 0.6, RO[2] * CO), true],
      ['内槽柱（八根）', vtx(RN[2], 2, FL[2] + 1.6), true],
      ['外槽柱（二十四根）', vtx(RO[3], 2, FL[3] + 1.4), true],
      ['双层套筒', V(9, FL[1] + 2.2, 0), true],
    ],
    stage: (p, gy) => {
      const h = gy - 5;
      return h < Y0
        ? '砌台基'
        : h < FL[0] + CH[0]
          ? '一层柱额与副阶'
          : h < FL[1]
            ? '一层铺作·第一暗层'
            : h < FL[2]
              ? '二层·第二暗层'
              : h < FL[3]
                ? '三层·第三暗层'
                : h < FL[4]
                  ? '四层·第四暗层'
                  : h < APEX
                    ? '五层与攒尖顶'
                    : '立塔刹';
    },
  };
}
