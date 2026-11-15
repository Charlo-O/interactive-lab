import * as THREE from '../../assets/vendor/three/three.module.js';

/** 组装期间的可变状态只保存在此工具实例中，建筑之间通过 resetBuild 隔离。 */
export function createGeometryToolkit({ hatchMat, lineMat }) {
  const ZERO = { b: 0 };

  const C = (h) => new THREE.Color(h),
    TAN = C('#c4553b'),
    DOOR = C('#9f3e2b'),
    NAT = C('#b48d62'),
    GOLD = C('#d6a83e');
  const state = {
    G: null,
    L: null,
    recs: [],
    FACE: new THREE.Matrix4(),
    PAINT: TAN,
    KOGU: false,
    GNC: false,
    RECK: null,
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function resetBuild() {
    state.G = { wood: [], roof: [], stone: [], shin: [], ground: [] };
    state.L = { ink: [], red: [], grid: [], cons: [], shin: [], water: [] };
    state.recs = [];
    state.FACE = new THREE.Matrix4();
    state.PAINT = TAN;
    state.KOGU = false;
    state.GNC = false;
    state.RECK = null;
  }

  function mkRec(minY, grp) {
    const r = {
      k:
        state.RECK !== null
          ? state.RECK + Math.random() * 0.3
          : minY + (grp === 'roof' ? 1.2 : 0) + Math.random() * 0.5,
      b: 0,
    };
    state.recs.push(r);
    return r;
  }
  function place(geo, grp, edge = true, set = 'ink') {
    geo.applyMatrix4(state.FACE);
    geo.userData.col = state.PAINT;
    geo.userData.k = state.KOGU;
    geo.computeBoundingBox();
    const rec = grp === 'shin' ? ZERO : mkRec(geo.boundingBox.min.y, grp);
    geo.userData.rec = rec;
    state.G[grp].push(geo);
    if (edge)
      state.L[set].push({ a: new THREE.EdgesGeometry(geo, 24).attributes.position.array, rec });
  }
  function box(grp, x, y, z, sx, sy, sz, edge = true) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    place(g, grp, edge);
  }
  function beam(grp, a, b, w, h, edge = true) {
    const d = b.clone().sub(a),
      len = d.length();
    const g = new THREE.BoxGeometry(w, h, len);
    const m = new THREE.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d.normalize()),
      V(1, 1, 1),
    );
    g.applyMatrix4(m);
    place(g, grp, edge);
  }
  function lines(set, pts, closed = false) {
    const out = [],
      p = pts.map((q) => q.clone().applyMatrix4(state.FACE));
    for (let i = 0; i < p.length - (closed ? 0 : 1); i++) {
      const A = p[i],
        B = p[(i + 1) % p.length];
      out.push(A.x, A.y, A.z, B.x, B.y, B.z);
    }
    const rec = set === 'ink' ? mkRec(Math.min(...p.map((q) => q.y)), 'line') : ZERO;
    state.L[set].push({ a: new Float32Array(out), rec });
  }
  function seg(set, a, b) {
    lines(set, [a, b]);
  }
  function surf(grp, fn, nu, nv) {
    const P = [],
      I = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const p = fn(i / nu, j / nv);
        P.push(p.x, p.y, p.z);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i,
          b = a + 1,
          c = a + nu + 1,
          d = c + 1;
        I.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    place(g, grp, false);
  }
  const quad = (p0, c, p1, u) => {
    const v = 1 - u;
    return [
      v * v * p0[0] + 2 * u * v * c[0] + u * u * p1[0],
      v * v * p0[1] + 2 * u * v * c[1] + u * u * p1[1],
    ];
  };
  const TAU = Math.PI * 2,
    P2 = (r, y, a) => V(r * Math.sin(a), y, r * Math.cos(a)),
    V2 = (x, y) => new THREE.Vector2(x, y),
    RY = (a) => new THREE.Matrix4().makeRotationY(a);
  // 回转体：轮廓每段单独成面以保持棱角（角度 0 为南，即 +z）
  function band(grp, pr, n = 144) {
    for (let i = 0; i < pr.length - 1; i++) {
      const [r0, y0] = pr[i],
        [r1, y1] = pr[i + 1];
      if (Math.abs(r1 - r0) + Math.abs(y1 - y0) > 1e-6)
        place(new THREE.LatheGeometry([V2(r0, y0), V2(r1, y1)], n), grp);
    }
  }
  // 弧形构件：宽 w、高 h 的矩形截面，沿中心半径 rc 自 a0 弯到 a1
  function arcB(grp, rc, y0, w, h, a0, a1, edge = true) {
    const n = Math.max(2, Math.ceil(((a1 - a0) * rc) / 0.4)),
      S = [
        [rc + w / 2, y0],
        [rc + w / 2, y0 + h],
        [rc - w / 2, y0 + h],
        [rc - w / 2, y0],
      ],
      P = [],
      I = [];
    for (let f = 0; f < 4; f++) {
      const A = S[f],
        B = S[(f + 1) % 4],
        b = P.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n,
          s = Math.sin(a),
          c = Math.cos(a);
        P.push(A[0] * s, A[1], A[0] * c, B[0] * s, B[1], B[0] * c);
      }
      for (let i = 0; i < n; i++) {
        const q = b + i * 2;
        I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    if (a1 - a0 < TAU - 1e-6)
      for (const [a, e] of [
        [a0, 0],
        [a1, 1],
      ]) {
        const b = P.length / 3,
          s = Math.sin(a),
          c = Math.cos(a);
        for (const [r, y] of S) P.push(r * s, y, r * c);
        if (e) I.push(b, b + 2, b + 1, b, b + 3, b + 2);
        else I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    place(g, grp, edge);
  }
  // 将局部 (z,y) 轮廓沿 x0→x1 挤出成实体
  function prism(grp, pts, x0, x1) {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => V2(z, y))), {
      depth: x1 - x0,
      bevelEnabled: false,
    });
    g.rotateY(-Math.PI / 2);
    g.translate(x1, 0, 0);
    place(g, grp);
  }
  // 线段组（端点成对排列）
  function segL(set, ps) {
    const o = [];
    let mn = 1e9;
    for (const p of ps) {
      const q = p.clone().applyMatrix4(state.FACE);
      o.push(q.x, q.y, q.z);
      mn = Math.min(mn, q.y);
    }
    if (o.length)
      state.L[set].push({ a: new Float32Array(o), rec: set === 'ink' ? mkRec(mn, 'line') : ZERO });
  }
  const ring = (set, r, y, n = 144) =>
    lines(
      set,
      Array.from({ length: n + 1 }, (_, i) => P2(r, y, (i / n) * TAU)),
    );
  // 屋面剖面：自檐口 (Re,Ye) 至上端 (Rt,Yt) 的二次曲线，檐口平缓、近顶陡峭
  const roofF = (Re, Ye, Rt, Yt, cr, cy) => {
    const c = [Re - (Re - Rt) * cr, Ye + (Yt - Ye) * cy];
    return (v) => quad([Re, Ye], c, [Rt, Yt], v);
  };
  const vAt = (pf, r) => {
      let a = 0,
        b = 1;
      for (let i = 0; i < 30; i++) {
        const m = (a + b) / 2;
        if (pf(m)[0] > r) a = m;
        else b = m;
      }
      return (a + b) / 2;
    },
    yAt = (pf, r) => pf(vAt(pf, r))[1];

  function merge(list) {
    const ng = list.map((g) => ({
      g: g.index ? g.toNonIndexed() : g,
      b: g.userData.rec.b,
      c: g.userData.col || TAN,
      k: g.userData.k,
    }));
    let n = 0;
    ng.forEach(({ g }) => (n += g.attributes.position.count));
    const P = new Float32Array(n * 3),
      N = new Float32Array(n * 3),
      B = new Float32Array(n),
      K = new Float32Array(n * 3);
    let o = 0;
    for (const { g, b, c: col, k } of ng) {
      const c = g.attributes.position.count,
        pa = g.attributes.position.array;
      P.set(pa, o * 3);
      N.set(g.attributes.normal.array, o * 3);
      B.fill(b, o, o + c);
      for (let i = o; i < o + c; i++) {
        K[i * 3] = col.r;
        K[i * 3 + 1] = col.g;
        K[i * 3 + 2] = col.b;
      }
      if (k) {
        const ar = [];
        for (let t = 0; t < c / 3; t++) {
          const j = t * 9,
            ax = pa[j + 3] - pa[j],
            ay = pa[j + 4] - pa[j + 1],
            az = pa[j + 5] - pa[j + 2],
            bx = pa[j + 6] - pa[j],
            by = pa[j + 7] - pa[j + 1],
            bz = pa[j + 8] - pa[j + 2];
          ar.push(Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx));
        }
        const mn = Math.min(...ar),
          mx = Math.max(...ar);
        if (mx / mn > 2.2)
          ar.forEach((a, t) => {
            if (a <= mn * 1.05)
              for (let v = 0; v < 3; v++) {
                const i = o + t * 3 + v;
                K[i * 3] = GOLD.r;
                K[i * 3 + 1] = GOLD.g;
                K[i * 3 + 2] = GOLD.b;
              }
          });
      }
      o += c;
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.BufferAttribute(P, 3));
    r.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    r.setAttribute('aBuild', new THREE.BufferAttribute(B, 1));
    r.setAttribute('aCol', new THREE.BufferAttribute(K, 3));
    return r;
  }
  function mergeL(list) {
    let n = 0;
    list.forEach(({ a }) => (n += a.length));
    const P = new Float32Array(n),
      B = new Float32Array(n / 3);
    let o = 0;
    for (const { a, rec } of list) {
      P.set(a, o);
      B.fill(rec.b, o / 3, (o + a.length) / 3);
      o += a.length;
    }
    const O = new Float32Array(n);
    for (let i = 0; i < n; i += 6) {
      O[i] = P[i + 3];
      O[i + 1] = P[i + 4];
      O[i + 2] = P[i + 5];
      O[i + 3] = P[i];
      O[i + 4] = P[i + 1];
      O[i + 5] = P[i + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aBuild', new THREE.BufferAttribute(B, 1));
    g.setAttribute('aOther', new THREE.BufferAttribute(O, 3));
    return g;
  }
  function finalize() {
    const sorted = state.recs.slice().sort((a, b) => a.k - b.k);
    sorted.forEach((r, i) => (r.b = (i / Math.max(1, sorted.length - 1)) * 0.965));
    const KEYS = sorted.map((r) => r.k);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(merge(state.G.wood), hatchMat(0)));
    group.add(new THREE.Mesh(merge(state.G.roof), hatchMat(0.03, { open: 1 })));
    group.add(new THREE.Mesh(merge(state.G.stone), hatchMat(0.04)));
    group.add(
      new THREE.Mesh(merge(state.G.ground), hatchMat(-0.14, { open: 1, noclip: state.GNC })),
    );
    group.add(new THREE.Mesh(merge(state.G.shin), hatchMat(0, { noclip: true, hang: true })));
    const gi = mergeL(state.L.ink),
      gr = mergeL(state.L.red),
      gg = mergeL(state.L.grid),
      gs = mergeL(state.L.shin);
    group.add(
      new THREE.LineSegments(gs, lineMat(2.2, 0.7, 0.06, { noclip: true, over: 0.3, hang: true })),
    );
    group.add(new THREE.LineSegments(gs, lineMat(5.1, 0.32, 0.1, { noclip: true, hang: true })));
    group.add(new THREE.LineSegments(gi, lineMat(1.3, 0.62, 0.09, { over: 0.25 })));
    group.add(new THREE.LineSegments(gi, lineMat(7.9, 0.2, 0.13, { over: 0.7 })));
    group.add(
      new THREE.LineSegments(
        mergeL(state.L.cons),
        lineMat(4.4, 0.17, 0.15, { noclip: true, over: 4 }),
      ),
    );
    group.add(
      new THREE.LineSegments(gr, lineMat(2.2, 0.75, 0.06, { red: true, noclip: true, over: 0.4 })),
    );
    group.add(new THREE.LineSegments(gr, lineMat(5.1, 0.35, 0.1, { red: true, noclip: true })));
    group.add(new THREE.LineSegments(gg, lineMat(3.3, 0.13, 0.12, { noclip: true })));
    if (state.L.water.length)
      group.add(
        new THREE.LineSegments(
          mergeL(state.L.water),
          lineMat(6.6, 0.42, 0.08, { noclip: true, wl: true }),
        ),
      );
    // 合并后的缓冲区独立保存数据，释放组装阶段的临时构件与记录。
    for (const list of Object.values(state.G)) {
      for (const geometry of list) geometry.dispose();
    }
    resetBuild();
    return { group, KEYS };
  }

  return {
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
    quad,
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
  };
}
