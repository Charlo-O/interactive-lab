// 像素动物：锦鲤 / 海龟 / 蜥蜴在整个页面自由活动（导出时走可循环的路线）
// 绳索脊柱 + 柔软摆动 + 四肢 + 闪烁标注 + 点闪烁 + 鼠标交互 + 视频导出。动物的定义见 creatures.js
(() => {
  'use strict';

  // ---------- 常量 ----------
  const LOOP = 12;                       // 摆尾、闪烁等周期运动的公共周期（秒）
  const PATH_LOOP = 36;                  // 沿路线走完一圈的时间，是 LOOP 的整数倍 → 导出可无缝循环
  const TAU = Math.PI * 2;
  const BG = '#fcfaf0';
  const N = 96;                          // 脊柱节点数
  const REF_L = 1300;                    // “大小”滑块以这个身长为准（原图像素），三种动物和原图一样大
  const BLINK_TRACKS = 7;                // 闪烁标注最多同时几个点
  // 墨色浓度：取色时周围几个像素一平均，深色被冲淡了；把点的颜色沿“底色 → 原色”方向推远一点，色相不变
  // （每种动物的倍数见 creatures.js 的 ink，按原图的深浅对过）
  const PAPER = [252 / 255, 250 / 255, 240 / 255];

  const params = {
    size: 0.42,    // 身长占屏幕短边的比例
    range: 1,      // 活动范围
    swim: 1,       // 摆动幅度
    speed: 1,      // 节奏快慢
    twinkle: 1,    // 呼吸闪烁
    sparkle: 1,    // 随机闪光
    sheen: 1,      // 沿身体的光泽带
  };
  const FIN_BEATS = 6;
  const GLIDE = 6;    // 摆尾—滑行的节奏周期（秒），整除 LOOP 和 PATH_LOOP
  const DRAG = 0.085; // 鳍被水拖住的程度（秒）

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) { params.swim = 0.5; params.range = 0.6; params.twinkle = 0.5; params.sparkle = 0.4; }
  // 标注每秒跳几拍（导出 30fps 时一拍 = 2 帧）；PATH_LOOP × BLINK_HZ 是整数 → 导出可无缝循环
  const BLINK_HZ = reduceMotion ? 5 : 15;

  // 可复现的随机数（实时播放和导出完全一致）
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrapPI = a => a - TAU * Math.round(a / TAU);

  // ---------- 脊柱（原图坐标，头 → 尾） ----------
  function buildSpine(ctrl) {
    // Catmull-Rom 加密，再按弧长等距重采样
    const dense = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let k = 0; k < 40; k++) {
        const t = k / 40, t2 = t * t, t3 = t2 * t;
        dense.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    dense.push(ctrl[ctrl.length - 1]);
    const acc = [0];
    for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const L = acc[acc.length - 1];
    const x = new Float64Array(N), y = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * L;
      while (j < dense.length - 2 && acc[j + 1] < s) j++;
      const f = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
      x[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
      y[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    }
    const segAng = new Float64Array(N - 1);
    for (let i = 0; i < N - 1; i++) segAng[i] = Math.atan2(y[i + 1] - y[i], x[i + 1] - x[i]);
    return { x, y, segAng, L, ds: L / (N - 1) };
  }

  // 点 → (沿脊柱位置 s, 离中线距离 d)；两端允许外延
  function bindToSpine(REST, px, py) {
    let best = Infinity, bs = 0, bd = 0;
    for (let i = 0; i < N - 1; i++) {
      const ax = REST.x[i], ay = REST.y[i];
      const dx = REST.x[i + 1] - ax, dy = REST.y[i + 1] - ay;
      const len2 = dx * dx + dy * dy;
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      if (i > 0) t = Math.max(0, t);
      if (i < N - 2) t = Math.min(1, t);
      const qx = ax + dx * t, qy = ay + dy * t;
      const dist = Math.hypot(px - qx, py - qy);
      if (dist < best) {
        best = dist;
        bs = (i + t) * REST.ds;
        const len = Math.sqrt(len2);
        bd = ((px - qx) * (-dy / len) + (py - qy) * (dx / len));
      }
    }
    return [bs, bd];
  }

  // ---------- 由定义 + 点数据构建一只动物 ----------
  function buildCreature(key, def, RAW) {
    const REST = buildSpine(def.spine), L = REST.L, M = def.motion;
    const PIVOT_I = Math.round(M.pivotU * (N - 1));
    // 每段脊柱的软硬（弹簧频率）和每个关节最多弯多少
    const SEG_K = new Float64Array(N - 1), SEG_C = new Float64Array(N - 1), MAX_BEND = new Float64Array(N);
    for (let i = 0; i < N - 1; i++) {
      const w = M.stiff((i + 0.5) / (N - 1));
      SEG_K[i] = w * w; SEG_C[i] = 2 * M.damping * w;
      MAX_BEND[i + 1] = M.maxBend((i + 0.5) / (N - 1));
    }

    // 四肢：关节绑在脊柱上；back = 往尾巴方向划的转动方向，side = 在身体哪一侧
    const LIMBS = def.limbs.map(l => {
      const [jx, jy] = l.path[0];
      const [js, jd] = bindToSpine(REST, jx, jy);
      const tip = l.path[l.path.length - 1], rx = tip[0] - jx, ry = tip[1] - jy;
      const g = REST.segAng[clamp(Math.floor(js / REST.ds), 0, N - 2)];
      const segs = [];
      let len = 0;
      for (let k = 0; k < l.path.length - 1; k++) {
        const [ax, ay] = l.path[k], [bx, by] = l.path[k + 1], sl = Math.hypot(bx - ax, by - ay);
        segs.push({ ax, ay, dx: bx - ax, dy: by - ay, sl, at: len });
        len += sl;
      }
      return { ...l, js, jd, segs, len, back: (-ry * Math.cos(g) + rx * Math.sin(g)) >= 0 ? 1 : -1, side: jd >= 0 ? 1 : -1 };
    });
    // 点属于哪条腿：离这条腿的骨线足够近（越往尖端越细），返回 [腿, 沿腿的位置 0–1]
    function limbOf(x, y) {
      let best = -1, bf = 0, score = 1;
      LIMBS.forEach((lb, li) => {
        for (const sg of lb.segs) {
          const t = clamp(((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / (sg.sl * sg.sl), -0.3, 1.3);
          const f = (sg.at + t * sg.sl) / lb.len;
          if (f < -0.05 || f > 1.25) continue;
          const dist = Math.hypot(x - sg.ax - sg.dx * t, y - sg.ay - sg.dy * t);
          const sc = dist / (lb.radius * (1 - 0.25 * clamp(f, 0, 1)));
          if (sc < score) { score = sc; best = li; bf = f; }
        }
      });
      return [best, bf];
    }

    const COUNT = RAW.length / 4;
    const P = {
      s: new Float32Array(COUNT), d: new Float32Array(COUNT), u: new Float32Array(COUNT),
      fin: new Float32Array(COUNT), finEx: new Float32Array(COUNT), side: new Float32Array(COUNT),
      tail: new Float32Array(COUNT), drag: new Float32Array(COUNT),
      limb: new Int8Array(COUNT).fill(-1), limbF: new Float32Array(COUNT), limbW: new Float32Array(COUNT),
      attr: new Float32Array(COUNT * 12),   // 静态属性，见 GLFish
    };
    const leaf = def.shape === 'leaf';
    const uPed = def.fins ? bindToSpine(REST, ...def.fins.ped)[0] / L : 1;
    const rnd = mulberry32(20261023), ink = def.ink || 1;
    for (let i = 0; i < COUNT; i++) {
      const x = RAW[i * 4], y = RAW[i * 4 + 1], c = RAW[i * 4 + 2], str = RAW[i * 4 + 3] / 100;
      const [s, d] = bindToSpine(REST, x, y);
      const u = s / L, uc = clamp(u, 0, 1);
      P.s[i] = s; P.d[i] = d; P.u[i] = u;
      P.side[i] = d >= 0 ? 1 : -1;
      if (def.fins) {
        // 锦鲤：超出身体半宽的是鳍；尾柄以后是尾鳍
        const ex = Math.abs(d) - def.fins.halfWidth(uc, uPed);
        P.finEx[i] = Math.max(0, ex);
        P.fin[i] = u < uPed ? smoothstep(0, 70, ex) : 0;
        P.tail[i] = smoothstep(uPed - 0.03, uPed + 0.08, u);
        // 被水拖住的权重：鳍越往外越拖；尾鳍越靠末端、越靠两侧越拖
        const tailDrag = P.tail[i] * smoothstep(uPed - 0.02, 1.02, u) * (0.6 + 0.4 * Math.min(1, Math.abs(d) / 150));
        P.drag[i] = Math.max(P.fin[i] * Math.min(1, ex / 180), tailDrag);
      }
      if (LIMBS.length && !(def.bodyHalfWidth && Math.abs(d) < def.bodyHalfWidth(uc))) {
        const [li, f] = limbOf(x, y);
        if (li >= 0) { P.limb[i] = li; P.limbF[i] = clamp(f, 0, 1); P.limbW[i] = smoothstep(0.02, 0.32, f); }
      }
      const o = i * 12;
      [(c >> 16) & 255, (c >> 8) & 255, c & 255].forEach((v, j) => { P.attr[o + j] = clamp(PAPER[j] + (v / 255 - PAPER[j]) * ink, 0, 1); });
      P.attr[o + 3] = 0.74 + 0.26 * str;                    // 透明度：颜色本身已是原图的深浅，点基本不透明，不再额外冲淡
      P.attr[o + 4] = leaf ? 29 + 13 * str + rnd() * 10 : 18 + 8 * str + rnd() * 6;   // 大小（原图像素），深色的更大；叶片面积小，放大才铺得满
      P.attr[o + 5] = uc;                                   // 沿身体位置（光泽带用）
      P.attr[o + 6] = 4 + Math.floor(rnd() * 2);            // 细胞团瓣数 4–5；叶片：4 = 月牙，5 = 叶子
      P.attr[o + 7] = rnd() * TAU;                          // 呼吸相位
      P.attr[o + 8] = 3 + Math.floor(rnd() * 10);           // 每循环呼吸次数（整数 → 无缝）
      P.attr[o + 9] = rnd();                                // 闪光时刻
      P.attr[o + 10] = rnd() < 0.6 ? 1 + Math.floor(rnd() * 2) : 0; // 每循环闪光次数，0 = 不闪
      P.attr[o + 11] = rnd() * TAU;                         // 旋转
    }

    return {
      key, name: def.name, M, theme: def.theme, REST, L, PIVOT_I, SEG_K, SEG_C, MAX_BEND, LIMBS,
      en: def.en, latin: def.latin, WORDS: def.words, CLIP: def.clip,
      COUNT, P, BLINK: buildBlink(RAW, COUNT, L, def.words.length, 7331 + key.length * 101),
      shape: def.shape === 'leaf' ? 1 : 0,
    };
  }

  // ---------- 闪烁标注的节拍表 ----------
  // 像 video2：几个标注点在身体上一闪一闪，每个只亮 1–4 拍就熄掉或直接跳到别处，线条跟着重新连。
  // 整圈（PATH_LOOP 秒）的节拍表预先排好，实时和导出查同一张表；点亮着的时候跟着它绑定的那个点动
  function buildBlink(RAW, COUNT, L, nWords, seed) {
    const T = PATH_LOOP * BLINK_HZ, K = BLINK_TRACKS, rnd = mulberry32(seed);
    const dot = new Int32Array(T * K).fill(-1), word = new Uint8Array(T * K);
    const edges = new Array(T);
    const tr = Array.from({ length: K }, () => ({ i: -1, word: 0, until: 0 }));
    const gap = L * 0.12;   // 同时亮着的点彼此至少隔这么远（原图像素），文字不挤在一起
    const far = (i, k) => tr.every((o, j) => j === k || o.i < 0 || Math.hypot(RAW[i * 4] - RAW[o.i * 4], RAW[i * 4 + 1] - RAW[o.i * 4 + 1]) >= gap);
    let prevKey = '', prevEdges = [];
    for (let tk = 0; tk < T; tk++) {
      tr.forEach((o, k) => {
        if (tk < o.until) return;
        if (o.i >= 0 && rnd() < 0.45) {
          // 熄掉 1–3 拍
          o.i = -1;
          o.until = tk + 1 + Math.floor(rnd() * 3);
          return;
        }
        // 亮起（或直接跳到新位置）：亮 1–4 拍，短的多
        let i = 0;
        for (let n = 0; n < 16; n++) { i = Math.floor(rnd() * COUNT); if (far(i, k)) break; }
        o.i = i;
        for (let n = 0; n < 8; n++) { o.word = Math.floor(rnd() * nWords); if (tr.every((q, j) => j === k || q.i < 0 || q.word !== o.word)) break; }
        o.until = tk + 1 + Math.floor(Math.pow(rnd(), 1.6) * 4);
      });
      const on = [];
      tr.forEach((o, k) => {
        dot[tk * K + k] = o.i; word[tk * K + k] = o.word;
        if (o.i >= 0) on.push(k);
      });
      // 连线：每个点连最近的另一个点，有时再随手多连一条；点没变就沿用上一拍的线
      const key = on.map(k => tr[k].i).join(',');
      if (key !== prevKey) {
        const seen = new Set(), list = [];
        const link = (a, b) => { const id = Math.min(a, b) * K + Math.max(a, b); if (a !== b && !seen.has(id)) { seen.add(id); list.push(a, b); } };
        for (const a of on) {
          const ia = tr[a].i;
          let best = -1, bd = Infinity;
          for (const b of on) {
            if (b === a) continue;
            const ib = tr[b].i, d = Math.hypot(RAW[ia * 4] - RAW[ib * 4], RAW[ia * 4 + 1] - RAW[ib * 4 + 1]);
            if (d < bd) { bd = d; best = b; }
          }
          if (best >= 0) link(a, best);
          if (on.length > 2 && rnd() < 0.5) link(a, on[Math.floor(rnd() * on.length)]);
        }
        prevKey = key; prevEdges = list;
      }
      edges[tk] = prevEdges;
    }
    return { T, K, dot, word, edges };
  }

  const CREATURES = {};
  for (const [key, def] of Object.entries(window.CREATURES || {})) {
    CREATURES[key] = buildCreature(key, def, (window.CREATURE_POINTS || {})[key] || []);
  }

  // ---------- 导出用的循环路线 ----------
  // 横躺的 8 字再加一点不规则，周期 PATH_LOOP；页面竖长时转成竖的 8 字
  const PATH_MARGIN = 470;       // 路线离页面边缘的距离（原图像素）
  const PATH_SAMPLES = 1024;
  const PATH_SPEED_MOD = 0.34;   // 游动：速度 = 平均 × (1 ± 0.34)
  const DARTS = 12, RUN_FRAC = 0.45;            // 蜥蜴：每圈窜 12 次，每次 3 秒里跑 45% 的时间
  const DART_PEAK = 30 / 16 / RUN_FRAC;         // 窜的时候的峰值速度（相对平均）
  // 把路线按弧长采样成表，沿弧长前进 → 速度均匀，不会在弯道处停住
  function pathTable(world) {
    if (world.loop) return world.table || (world.table = loopTable(world));
    const r = params.range, M = PATH_SAMPLES;
    if (world.table && world.range === r) return world.table;
    const long = world.tall ? world.h : world.w, short = world.tall ? world.w : world.h;
    const A = Math.max(60, long / 2 - PATH_MARGIN) * r / 1.12;
    const B = Math.max(60, short / 2 - PATH_MARGIN) * r;
    const x = new Float64Array(M + 1), y = new Float64Array(M + 1), hd = new Float64Array(M + 1), acc = new Float64Array(M + 1);
    for (let j = 0; j <= M; j++) {
      const p = TAU * j / M;
      let px = A * (Math.sin(p) + 0.12 * Math.sin(3 * p + 0.7));
      let py = B * (0.85 * Math.sin(2 * p) + 0.15 * Math.sin(p + 1.1));
      let vx = A * (Math.cos(p) + 0.36 * Math.cos(3 * p + 0.7));
      let vy = B * (1.7 * Math.cos(2 * p) + 0.15 * Math.cos(p + 1.1));
      if (world.tall) { let s = px; px = py; py = s; s = vx; vx = vy; vy = s; }
      x[j] = world.w / 2 + px; y[j] = world.h / 2 + py;
      hd[j] = Math.atan2(vy, vx);
      if (j) acc[j] = acc[j - 1] + Math.hypot(x[j] - x[j - 1], y[j] - y[j - 1]);
    }
    world.range = r;
    return (world.table = { x, y, hd, acc, len: acc[M] });
  }
  // 短片的环形路线：接近圆、略带不规则、微微倾斜的闭合曲线，铺满画面又离边缘有余地；
  // 一直朝同一个方向缓缓转弯（不会游到边上才急转），转弯快慢大致均匀。尺寸按画面比例给，dir = ±1 顺/逆时针
  const LOOP_PATH = { ax: 0.32, ay: 0.281, cx: 0.5, cy: 0.545, e2: 0.03, tilt: 0.12 };
  function loopTable(world) {
    const o = { ...LOOP_PATH, dir: 1, p0: 0, ...world.loop }, M = PATH_SAMPLES;
    const ax = o.ax * world.w, ay = o.ay * world.h, c = Math.cos(o.tilt), s = Math.sin(o.tilt);
    const x = new Float64Array(M + 1), y = new Float64Array(M + 1), hd = new Float64Array(M + 1), acc = new Float64Array(M + 1);
    for (let j = 0; j <= M; j++) {
      const p = o.p0 + o.dir * TAU * j / M;
      const u = ax * (Math.cos(p) + o.e2 * Math.cos(2 * p + 1.1)), v = ay * (Math.sin(p) + o.e2 * Math.sin(2 * p + 1.7));
      const du = o.dir * ax * (-Math.sin(p) - 2 * o.e2 * Math.sin(2 * p + 1.1)), dv = o.dir * ay * (Math.cos(p) + 2 * o.e2 * Math.cos(2 * p + 1.7));
      x[j] = o.cx * world.w + u * c - v * s; y[j] = o.cy * world.h + u * s + v * c;
      hd[j] = Math.atan2(du * s + dv * c, du * c - dv * s);
      if (j) acc[j] = acc[j - 1] + Math.hypot(x[j] - x[j - 1], y[j] - y[j - 1]);
    }
    return { x, y, hd, acc, len: acc[M] };
  }
  const steadyWarp = tau => [tau, 1];
  // 时间（一圈里的比例 τ）→ [沿路线走过的比例, 当前速率（相对平均）]
  // 游动：每 GLIDE 秒一次快慢起伏，摆尾时加速、放松时滑行。loop = 一圈几秒（导出短片时比 PATH_LOOP 短）
  function glideWarp(tau, loop = PATH_LOOP) {
    const kk = loop / GLIDE;
    return [tau + PATH_SPEED_MOD / (kk * TAU) * Math.sin(TAU * kk * tau), 1 + PATH_SPEED_MOD * Math.cos(TAU * kk * tau)];
  }
  // 窜—停：每段先平滑地加速、减速跑完一截，然后停住（每 3 秒窜一次，不管一圈多长）
  function dartWarp(tau, loop = PATH_LOOP) {
    const darts = Math.max(1, Math.round(DARTS * loop / PATH_LOOP));
    const x = darts * tau, n = Math.floor(x), y = Math.min(1, (x - n) / RUN_FRAC);
    return [(n + y * y * y * (y * (6 * y - 15) + 10)) / darts, 30 * y * y * (1 - y) * (1 - y) / RUN_FRAC];
  }
  function pathAt(world, T, out, warp, loop = PATH_LOOP) {
    const tb = pathTable(world), acc = tb.acc;
    let tau = T / loop; tau -= Math.floor(tau);
    const [fr, rate] = warp(tau, loop);
    const s = fr * tb.len;
    let lo = 0, hi = PATH_SAMPLES;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] <= s) lo = m; else hi = m; }
    const f = clamp((s - acc[lo]) / (acc[hi] - acc[lo] || 1), 0, 1);
    out.x = tb.x[lo] + (tb.x[hi] - tb.x[lo]) * f;
    out.y = tb.y[lo] + (tb.y[hi] - tb.y[lo]) * f;
    const dh = tb.hd[hi] - tb.hd[lo];
    out.heading = tb.hd[lo] + Math.atan2(Math.sin(dh), Math.cos(dh)) * f;
    out.speed = tb.len / loop * rate;
    out.frac = fr;
    return out;
  }

  // ---------- 模拟 ----------
  const NO_DODGE = { x: 0, y: 0 };
  class Sim {
    constructor(C, interactive) {
      this.C = C;
      this.interactive = interactive;
      this.loop = PATH_LOOP;   // 导出时沿路线走一圈的秒数，必须是 LOOP 的整数倍
      this.steady = false;     // 匀速：不再摆几下滑一段 / 窜一下停一下，摆动频率和幅度始终一样
      this.steadyEnv = 1;
      const n = C.COUNT;
      this.pos = new Float32Array(n * 2);
      this.dist = new Float32Array(n);
      this.ox = new Float32Array(n); this.oy = new Float32Array(n);
      this.vx = new Float32Array(n); this.vy = new Float32Array(n);
      this.sx = new Float64Array(N); this.sy = new Float64Array(N);
      this.nx = new Float64Array(N); this.ny = new Float64Array(N);
      this.rope = new Float64Array(N * 2);     // 绳索脊柱：头在前面走，后面每一节被前一节拖着走
      this.ropeAng = new Float64Array(N - 1);
      this.ropeReady = false;
      this.wave = new Float64Array(N * 2);     // 绳索 + 身体横波
      this.head = { x: 0, y: 0, heading: 0, speed: 0, wander: 0 };
      this.turn = 0;      // 平滑后的转向角速度（弧度/秒），鳍和腿据此倾斜
      this.cruise = 1;    // 当前的参考速度，摆动频率和幅度按它归一化
      this.env = 1;       // 用力程度：1 = 用力摆 / 在跑，0 = 滑行 / 停住
      this.glideT = 0;
      this.look = 0;      // 停下时头左右张望的角度
      this.dart = { running: true, timer: 1.2 };
      this.segA = new Float64Array(N - 1); this.segW = new Float64Array(N - 1);   // 每段的实际角度、角速度
      this.tgt = new Float64Array(N - 1); this.prevTgt = new Float64Array(N - 1);
      this.prevX = new Float64Array(N); this.prevY = new Float64Array(N);
      this.lat = new Float64Array(N);   // 每个节点低通后的横向速度
      this.spineReady = false;
      this.limbs = C.LIMBS.map(() => ({ jx: 0, jy: 0, a: 0, ph: 0, hold: 0, bank: 0, tip: 0 }));
      this.world = { w: 1600, h: 2000, tall: true };
      this.pose = { x: 0, y: 0, heading: 0, speed: 0, frac: 0 };
      this.phase = 0;
      this.excite = 0;
      this.dodge = { x: 0, y: 0, vx: 0, vy: 0 };
      this.pointer = null;   // {x, y, vx, vy, active}
      this.ripples = [];
    }

    // 能活动的范围（原图像素）；尺寸变了框直接跳到新位置。实时模式下接着走，软边界会把它带回画面
    setWorld(w, h) {
      this.world = { w, h, tall: h > w };
      this.spineReady = false;
      if (!this.interactive) this.ropeReady = false;
    }

    // 实时：Reynolds 式转向——惯性 + 漫游 + 软边界 + 躲开指针；转弯半径随速度变大，不能原地掉头
    steer(t, dt) {
      const M = this.C.M, h = this.head, { w: W, h: H } = this.world, L = this.C.L;
      const dart = M.rhythm === 'dart';
      if (!this.ropeReady) {
        h.x = W * 0.3; h.y = H * 0.62; h.heading = -0.35; h.speed = dart ? 0 : M.cruise * L; h.wander = 0;
      }
      this.cruise = M.cruise * L;
      let target;
      if (dart) {
        // 窜一段、停一下；受惊时马上跑
        const d = this.dart;
        d.timer -= dt;
        if (!d.running && this.excite > 0.3) { d.running = true; d.timer = 0.8 + Math.random() * 0.8; }
        if (d.timer <= 0) {
          d.running = !d.running;
          d.timer = d.running ? 0.7 + Math.random() * 1.1 : 0.8 + Math.random() * 1.8;
          if (d.running) h.wander = clamp(h.wander + (Math.random() - 0.5) * 1.6, -1.1, 1.1);
        }
        target = d.running ? this.cruise * (1 + 0.6 * this.excite) : 0;
        this.env = clamp(h.speed / this.cruise, 0, 1);
        this.look = (1 - this.env) * M.look * Math.sin(t * 1.3 + 2 * Math.sin(t * 0.37));
      } else {
        // 摆几下加速，再放松滑行；节拍时快时慢，不会机械重复
        this.glideT += dt * (0.85 + 0.3 * Math.sin(t * 0.13));
        this.env = M.glideMin + (1 - M.glideMin) * (0.5 + 0.5 * Math.cos(TAU * this.glideT / GLIDE + 0.9));
        target = this.cruise * (M.speedRange[0] + M.speedRange[1] * this.env) * (1 + 1.3 * this.excite);
      }

      let dx = Math.cos(h.heading), dy = Math.sin(h.heading);
      // 漫游：前方一个缓慢随机漂移的方向偏移
      h.wander = clamp(h.wander + (Math.random() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(h.heading + h.wander) * 0.45;
      dy += Math.sin(h.heading + h.wander) * 0.45;
      // 软边界：看前方一段，快出活动范围时转回中间（范围随“活动范围”缩放）
      const mx = (W / 2 - L * 0.3) * params.range, my = (H / 2 - L * 0.3) * params.range;
      const lx = h.x + Math.cos(h.heading) * L * 0.45 - W / 2, ly = h.y + Math.sin(h.heading) * L * 0.45 - H / 2;
      const over = Math.max(Math.abs(lx) - mx, Math.abs(ly) - my);
      if (over > -L * 0.1) {
        const k = clamp((over + L * 0.1) / (L * 0.4), 0, 1) * 3.5;
        const cx = W / 2 - h.x, cy = H / 2 - h.y, d = Math.hypot(cx, cy) || 1;
        dx += cx / d * k; dy += cy / d * k;
      }
      // 指针靠近头部：转身走开
      const p = this.pointer;
      if (p && p.active) {
        const ox = h.x - p.x, oy = h.y - p.y, d = Math.hypot(ox, oy), R = L * 0.7;
        if (d < R && d > 1e-3) { const k = (1 - d / R) ** 2 * 4; dx += ox / d * k; dy += oy / d * k; }
      }
      const desired = Math.atan2(dy, dx);
      const agility = Math.min(M.agility * (1 + 1.5 * this.excite), h.speed / (L * M.turnRadius));
      const turned = clamp(wrapPI(desired - h.heading), -agility * dt, agility * dt);
      h.heading += turned;
      if (dt > 0) this.turn += (turned / dt - this.turn) * Math.min(1, dt * 3);
      h.speed += (target - h.speed) * Math.min(1, dt * M.accel);
      h.x += Math.cos(h.heading) * h.speed * dt;
      h.y += Math.sin(h.heading) * h.speed * dt;
      // 节奏随速度变化：游动的摆尾频率部分跟速度走；爬行的步子完全按走过的距离算，脚不打滑
      if (dart) this.phase += TAU * h.speed / (M.stride * L) * params.speed * dt;
      else this.phase += TAU * M.beats * params.speed / LOOP * (1 - M.beatSpeed + M.beatSpeed * h.speed / this.cruise) * dt;
    }

    // 导出：头沿可循环的路线走，相位用解析式积分，保证整段视频首尾衔接
    followPath(t, dt) {
      const C = this.C, M = C.M, h = this.head, dart = M.rhythm === 'dart';
      const pose = pathAt(this.world, t, this.pose, this.steady ? steadyWarp : dart ? dartWarp : glideWarp, this.loop);
      const turned = this.ropeReady ? wrapPI(pose.heading - h.heading) : 0;
      h.x = pose.x; h.y = pose.y; h.heading = pose.heading; h.speed = pose.speed;
      if (dt > 0) this.turn += (turned / dt - this.turn) * Math.min(1, dt * 3);
      const len = pathTable(this.world).len;
      if (dart) {
        // 步数取整：走完一圈正好迈整数步
        this.cruise = len / this.loop * (this.steady ? 1 : DART_PEAK * 0.7);
        this.env = this.steady ? this.steadyEnv : clamp(h.speed / this.cruise, 0, 1);
        const strides = Math.max(1, Math.round(len / (M.stride * C.L) * params.speed));
        this.phase = TAU * strides * pose.frac;
        this.look = (1 - this.env) * M.look * Math.sin(TAU * 3 * t / LOOP);
      } else {
        this.cruise = len / this.loop;
        // 路线速度 = 平均速度 × (1 + m·cos(ωt))，对它积分得到的相位仍是 LOOP 的周期函数；匀速时摆尾也完全匀速
        const beats = Math.max(1, Math.round(M.beats * params.speed));
        const m = this.steady ? 0 : PATH_SPEED_MOD, wg = TAU / GLIDE;
        this.env = this.steady ? this.steadyEnv : M.glideMin + (1 - M.glideMin) * (0.5 + 0.5 * Math.cos(TAU * t / GLIDE + 0.9));
        this.phase = TAU * beats / LOOP * (t + M.beatSpeed * m * Math.sin(wg * t) / wg);
      }
    }

    // 绳索脊柱：头往前走，后面每一节保持固定间距被前一节拖着走，关节弯曲有上限（为 0 的地方是刚体）
    dragRope() {
      const h = this.head, r = this.rope, ra = this.ropeAng, ds = this.C.REST.ds, MB = this.C.MAX_BEND;
      if (!this.ropeReady) {
        for (let k = 0; k < N; k++) { r[k * 2] = h.x - Math.cos(h.heading) * ds * k; r[k * 2 + 1] = h.y - Math.sin(h.heading) * ds * k; }
        this.ropeReady = true;
      }
      r[0] = h.x; r[1] = h.y;
      let prev = h.heading + Math.PI;
      for (let k = 1; k < N; k++) {
        const px = r[k * 2 - 2], py = r[k * 2 - 1];
        const a = prev + clamp(wrapPI(Math.atan2(r[k * 2 + 1] - py, r[k * 2] - px) - prev), -MB[k], MB[k]);
        r[k * 2] = px + Math.cos(a) * ds; r[k * 2 + 1] = py + Math.sin(a) * ds;
        ra[k - 1] = prev = a;
      }
    }

    // 计算当前帧的脊柱（按弧长积分，身长不变）
    spine(t, dt) {
      const C = this.C, M = C.M, REST = C.REST, PI_ = C.PIVOT_I;
      if (this.interactive) this.steer(t, dt); else this.followPath(t, dt);
      this.dragRope();
      const dz = this.interactive ? this.dodge : NO_DODGE;
      const L = C.L, r = this.rope, wv = this.wave;
      // 摆动幅度：游动随节奏和速度变化、受惊时用力摆；爬行只在跑的时候摆
      const rel = clamp(this.head.speed / this.cruise, 0.4, 2.2);
      const amp = M.rhythm === 'dart' ? params.swim * this.env
        : params.swim * (this.env + (1.4 - this.env) * this.excite) * (0.75 + 0.25 * rel);
      // 随摆动的轻微前冲
      const surge = M.surge * this.env * Math.sin(M.surgeFreq * this.phase);

      // 1. 在绳索上叠一层身体的横向位移波（每种动物的波形见 creatures.js）
      for (let k = 0; k < N; k++) {
        const u = k / (N - 1);
        const a0 = this.ropeAng[Math.max(0, k - 1)], a1 = this.ropeAng[Math.min(N - 2, k)];
        const cx = Math.cos(a0) + Math.cos(a1), cy = Math.sin(a0) + Math.sin(a1), l = Math.hypot(cx, cy) || 1;
        const off = M.wave(u, this.phase, amp, L);
        wv[k * 2] = r[k * 2] - cy / l * off;
        wv[k * 2 + 1] = r[k * 2 + 1] + cx / l * off;
      }
      // 目标角度 = 摆动后曲线每一段的方向 + 原图姿态 + 停下时头的张望
      const tgt = this.tgt;
      for (let i = 0; i < N - 1; i++) {
        const u = (i + 0.5) / (N - 1);
        tgt[i] = Math.atan2(wv[i * 2 + 3] - wv[i * 2 + 1], wv[i * 2 + 2] - wv[i * 2]) + (REST.segAng[i] - REST.segAng[PI_]) * M.restKeep
          + this.look * clamp(1 - u / 0.2, 0, 1);
      }

      // 2. 每段用弹簧去追目标角度：软的地方更滞后，转弯和受惊时会柔软地甩过去再回弹
      const A = this.segA, W = this.segW, prev = this.prevTgt;
      if (!this.spineReady) {
        for (let i = 0; i < N - 1; i++) { A[i] = prev[i] = tgt[i]; W[i] = 0; }
      } else if (dt > 0) {
        const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
        for (let i = 0; i < N - 1; i++) {
          const d0 = wrapPI(tgt[i] - prev[i]);
          let a = A[i], w = W[i];
          for (let k = 1; k <= n; k++) {
            const g = prev[i] + d0 * k / n;
            w += (C.SEG_K[i] * wrapPI(g - a) - C.SEG_C[i] * w) * h;
            a += w * h;
          }
          A[i] = a; W[i] = w; prev[i] = tgt[i];
        }
      }
      const ang = A;
      const hx = Math.cos(this.head.heading), hy = Math.sin(this.head.heading);
      const sx = this.sx, sy = this.sy, ds = REST.ds;
      sx[PI_] = wv[PI_ * 2] + dz.x + hx * surge; sy[PI_] = wv[PI_ * 2 + 1] + dz.y + hy * surge;
      for (let i = PI_ + 1; i < N; i++) { sx[i] = sx[i - 1] + ds * Math.cos(ang[i - 1]); sy[i] = sy[i - 1] + ds * Math.sin(ang[i - 1]); }
      for (let i = PI_ - 1; i >= 0; i--) { sx[i] = sx[i + 1] - ds * Math.cos(ang[i]); sy[i] = sy[i + 1] - ds * Math.sin(ang[i]); }
      // 节点法线（相邻两段的平均方向），插值时不会出折痕
      for (let i = 0; i < N; i++) {
        const a0 = ang[Math.max(0, i - 1)], a1 = ang[Math.min(N - 2, i)];
        const cx = Math.cos(a0) + Math.cos(a1), cy = Math.sin(a0) + Math.sin(a1);
        const l = Math.hypot(cx, cy) || 1;
        this.nx[i] = -cy / l; this.ny[i] = cx / l;
      }
      // 3. 每个节点的横向速度（沿法线，低通）：鳍和尾鳍据此被水拖在后面
      const lat = this.lat, e = 1 - Math.exp(-Math.max(0, dt) * 8);
      for (let i = 0; i < N; i++) {
        if (this.spineReady && dt > 0) {
          const vn = ((sx[i] - this.prevX[i]) * this.nx[i] + (sy[i] - this.prevY[i]) * this.ny[i]) / dt;
          lat[i] += (vn - lat[i]) * e;
        } else lat[i] = 0;
        this.prevX[i] = sx[i]; this.prevY[i] = sy[i];
      }
      this.spineReady = true;
    }

    latAt(s) {
      const f = clamp(s / this.C.REST.ds, 0, N - 1), i = Math.min(N - 2, Math.floor(f));
      return this.lat[i] + (this.lat[i + 1] - this.lat[i]) * (f - i);
    }

    // 脊柱坐标 (s, d) → 画面坐标（原图像素）
    place(s, d, out) {
      const f = s / this.C.REST.ds;
      const i = Math.min(N - 2, Math.max(0, Math.floor(f)));
      const fr = f - i;
      const bx = this.sx[i] + (this.sx[i + 1] - this.sx[i]) * fr;
      const by = this.sy[i] + (this.sy[i + 1] - this.sy[i]) * fr;
      const c = Math.min(1, Math.max(0, fr));
      let nx = this.nx[i] + (this.nx[i + 1] - this.nx[i]) * c;
      let ny = this.ny[i] + (this.ny[i + 1] - this.ny[i]) * c;
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      out[0] = bx + nx * d; out[1] = by + ny * d; out[2] = nx; out[3] = ny;
      return out;
    }

    step(t, dt) {
      if (this.interactive) this.updateInteraction(t, dt);
      this.spine(t, dt);
      const C = this.C, P = C.P, tmp = [0, 0, 0, 0];
      const finPhase = TAU * FIN_BEATS * t / LOOP;
      const tailOpen = Math.sin(this.phase - 1.2);
      // 转弯时鳍倾斜：内侧收拢，外侧张开
      const bank = clamp(this.turn * 0.6, -0.4, 0.4);
      // 四肢：关节跟着身体走，整条腿再绕关节转；尖端相位滞后、转得更多，像软鳍一样一波一波地划
      const envL = Math.min(1, this.env + this.excite);
      C.LIMBS.forEach((lb, li) => {
        const st = this.limbs[li];
        this.place(lb.js, lb.jd, tmp);
        st.jx = tmp[0]; st.jy = tmp[1];
        st.a = lb.back * lb.amp * envL * params.swim;
        st.hold = lb.back * lb.amp * (1 - envL) * lb.hold * params.swim;
        st.bank = -lb.back * lb.bank * bank * lb.side;
        st.ph = this.phase + lb.phase;
        st.tip = (1 + lb.flex) * (st.a * Math.sin(st.ph - lb.flexLag) + st.hold) + st.bank;
      });
      const pos = this.pos;
      for (let i = 0; i < C.COUNT; i++) {
        let d = P.d[i];
        // 尾鳍张合
        if (P.tail[i] > 0) d *= 1 + 0.08 * params.swim * P.tail[i] * tailOpen;
        if (P.fin[i] > 0) d += P.finEx[i] * bank * P.fin[i];
        this.place(P.s[i], d, tmp);
        let x = tmp[0], y = tmp[1];
        // 鳍：从根部往外传的滞后波，像丝绸被水带着
        const fw = P.fin[i];
        if (fw > 0) {
          const ex = P.finEx[i];
          const phi = fw * 0.15 * params.swim * Math.sin(finPhase - ex / 65 + P.side[i] * 1.3 + P.u[i] * 5) * Math.min(1, ex / 160 + 0.3);
          // 沿身体方向（切线 = 法线转 90°）摆动 ≈ 绕鳍根转动
          const m = ex * phi * P.side[i];
          x += tmp[3] * m;
          y -= tmp[2] * m;
        }
        // 被水拖住：鳍和尾鳍的外缘逆着身体横摆的方向滞后，像薄纱一样飘
        const dw = P.drag[i];
        if (dw > 0) {
          const m = -this.latAt(P.s[i]) * DRAG * dw;
          x += tmp[2] * m; y += tmp[3] * m;
        }
        const li = P.limb[i];
        if (li >= 0) {
          const st = this.limbs[li], lb = C.LIMBS[li], f = P.limbF[i];
          const th = P.limbW[i] * ((1 + lb.flex * f) * (st.a * Math.sin(st.ph - lb.flexLag * f) + st.hold) + st.bank);
          const c = Math.cos(th), s = Math.sin(th), rx = x - st.jx, ry = y - st.jy;
          x = st.jx + rx * c - ry * s;
          y = st.jy + rx * s + ry * c;
        }
        pos[i * 2] = x + this.ox[i];
        pos[i * 2 + 1] = y + this.oy[i];
      }
    }

    // 导出用：从 t<0 开始空跑一段，让绳索铺满路线、弹簧进入稳定状态，保证首尾衔接
    preroll(fps) {
      const dt = 1 / fps;
      for (let f = -12 * fps; f < 0; f++) this.step(f * dt, dt);
    }

    // ---------- 鼠标 / 触摸 ----------
    updateInteraction(t, dt) {
      const p = this.pointer;
      const R = 120, R2 = R * R;
      const pos = this.pos;
      this.excite *= Math.exp(-dt / 1.4);

      // 躲开：靠近身体时朝反方向闪避
      let dodgeTx = 0, dodgeTy = 0;
      if (p && p.active) {
        let best = Infinity, bi = 0;
        for (let i = 0; i < N; i += 4) {
          const dd = (this.sx[i] - p.x) ** 2 + (this.sy[i] - p.y) ** 2;
          if (dd < best) { best = dd; bi = i; }
        }
        const dist = Math.sqrt(best);
        const near = 1 - smoothstep(60, 300, dist);
        const speed = Math.hypot(p.vx, p.vy);
        if (near > 0) {
          this.excite = Math.min(1, this.excite + near * Math.min(1, speed / 1800) * dt * 6);
          const ax = this.sx[bi] - p.x, ay = this.sy[bi] - p.y, l = Math.hypot(ax, ay) || 1;
          dodgeTx = ax / l * 50 * near; dodgeTy = ay / l * 50 * near;
        }
      }
      const dz = this.dodge, w = 3.2;
      dz.vx += (w * w * (dodgeTx - dz.x) - 2 * w * dz.vx) * dt; dz.x += dz.vx * dt;
      dz.vy += (w * w * (dodgeTy - dz.y) - 2 * w * dz.vy) * dt; dz.y += dz.vy * dt;

      // 涟漪：点击/轻点处向外扩散，把点推开
      this.ripples = this.ripples.filter(r => t - r.t0 < 1.6);

      // 点：被指针拨开、被拖动带走，再弹回原位
      const k = 38, c = 7.5;
      for (let i = 0; i < this.C.COUNT; i++) {
        let fx = 0, fy = 0;
        const x = pos[i * 2], y = pos[i * 2 + 1];
        if (p && p.active) {
          const dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / R) ** 2;
            fx += dx / d * f * 5200 + p.vx * f * 3.2;
            fy += dy / d * f * 5200 + p.vy * f * 3.2;
          }
        }
        for (const r of this.ripples) {
          const rad = (t - r.t0) * 820;
          const dx = x - r.x, dy = y - r.y, d = Math.hypot(dx, dy) || 1;
          const band = 1 - Math.min(1, Math.abs(d - rad) / 46);
          if (band > 0) {
            const f = band * band * 9000 * (1 - (t - r.t0) / 1.6);
            fx += dx / d * f; fy += dy / d * f;
          }
        }
        let vx = this.vx[i], vy = this.vy[i];
        vx += (fx - k * this.ox[i] - c * vx) * dt;
        vy += (fy - k * this.oy[i] - c * vy) * dt;
        this.vx[i] = vx; this.vy[i] = vy;
        this.ox[i] += vx * dt; this.oy[i] += vy * dt;
        this.dist[i] = Math.min(1, Math.hypot(this.ox[i], this.oy[i]) / 26);
      }
      if (p) { p.vx *= Math.exp(-dt * 10); p.vy *= Math.exp(-dt * 10); }
    }

    ripple(x, y, t) {
      this.ripples.push({ x, y, t0: t });
      this.excite = Math.min(1, this.excite + 0.8);
    }

    // 整只平移（卡片页每帧把动物挪回卡片中心，让它原地游）；速度、弹簧状态都不受影响
    translate(dx, dy) {
      const h = this.head, r = this.rope;
      h.x += dx; h.y += dy;
      for (let k = 0; k < N; k++) {
        r[k * 2] += dx; r[k * 2 + 1] += dy;
        this.sx[k] += dx; this.sy[k] += dy;
        this.prevX[k] += dx; this.prevY[k] += dy;
      }
      for (let i = 0; i < this.C.COUNT; i++) {
        this.pos[i * 2] += dx; this.pos[i * 2 + 1] += dy;
      }
    }
  }

  // ---------- WebGL：画组成动物的点 ----------
  const VS = `#version 300 es
  in vec2 aPos; in float aDist;
  in vec4 aA; in vec4 aB; in vec4 aC;
  uniform vec2 uRes; uniform float uScale, uT, uTwinkle, uSparkle, uSheen;
  out vec3 vColor; out float vAlpha; out float vRot; out float vLobes; out float vMerge;
  const float TAU = 6.2831853;
  void main() {
    float tl = uT / ${LOOP.toFixed(1)};
    vec3 col = aA.rgb;
    float tw = 0.5 + 0.5 * sin(TAU * aC.x * tl + aB.w);
    float a = aA.a * mix(1.0 - 0.2 * uTwinkle, 1.0, tw);
    float size = aB.x * (0.9 + 0.16 * tw * uTwinkle);
    float spark = 0.0;
    if (aC.z > 0.0) {
      float c = fract(tl * aC.z + aC.y);
      spark = c < 0.035 ? sin(3.14159 * c / 0.035) : 0.0;
      spark *= uSparkle;
    }
    float bp = fract(tl * 3.0) * 1.5 - 0.25;
    float sheen = exp(-pow((aB.y - bp) / 0.07, 2.0)) * uSheen;
    float lift = clamp(spark * 0.8 + sheen * 0.12 + aDist * 0.4, 0.0, 1.0);
    col = mix(col, min(col * 1.12 + 0.36, vec3(1.0)), lift);
    a = mix(a, 1.0, clamp(spark * 0.85 + aDist * 0.3, 0.0, 1.0));
    size *= 1.0 + 0.5 * spark + 0.22 * aDist;
    vec2 p = aPos * uScale;
    gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);
    gl_PointSize = size * uScale;
    vColor = col; vAlpha = a; vRot = aC.w + tw * 0.4; vLobes = aB.z; vMerge = tw;
  }`;
  const FS = `#version 300 es
  precision mediump float;
  in vec3 vColor; in float vAlpha; in float vRot; in float vLobes; in float vMerge;
  uniform float uShape;
  out vec4 o;
  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d;
    if (uShape < 0.5) {
      // 细胞团：几个小圆柔和地粘在一起，随呼吸微微分开/合拢
      float off = 0.34 + 0.08 * vMerge;
      d = length(p) - 0.36;
      for (int i = 0; i < 5; i++) {
        if (float(i) >= vLobes) break;
        float ang = vRot + 6.2831853 * float(i) / vLobes;
        d = smin(d, length(p - off * vec2(cos(ang), sin(ang))) - 0.42, 0.07);
      }
    } else {
      // 叶片：月牙或柳叶形，朝向随机，随呼吸微微张合
      float c = cos(vRot), s = sin(vRot);
      vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
      if (vLobes < 4.5) d = max(length(q) - 0.82, 0.7 - length(q - vec2(0.38 + 0.06 * vMerge, 0.22)));
      else d = max(length(q - vec2(0.0, -0.46)) - 0.92, length(q - vec2(0.0, 0.46)) - 0.92);
    }
    float a = smoothstep(0.05, -0.06, d) * vAlpha;
    if (a < 0.004) discard;
    o = vec4(vColor * a, a);
  }`;

  class GLFish {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('需要 WebGL2');
      this.gl = gl;
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      this.u = {};
      ['uRes', 'uScale', 'uT', 'uTwinkle', 'uSparkle', 'uSheen', 'uShape'].forEach(n => { this.u[n] = gl.getUniformLocation(prog, n); });
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const loc = n => gl.getAttribLocation(prog, n);
      // 静态属性：A = rgb + 透明度；B = 大小, u, 瓣数, 呼吸相位；C = 呼吸次数, 闪光时刻, 闪光次数, 旋转
      this.attrBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.attrBuf);
      [['aA', 0], ['aB', 4], ['aC', 8]].forEach(([n, off]) => {
        const l = loc(n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 48, off * 4);
      });
      this.posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      const lp = loc('aPos'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
      this.distBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.distBuf);
      const ld = loc('aDist'); gl.enableVertexAttribArray(ld); gl.vertexAttribPointer(ld, 1, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.count = 0;
      this.shape = 0;
    }
    // 换一种动物：重新上传点的静态属性，按点数分配位置缓冲
    setCreature(C) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.attrBuf);
      gl.bufferData(gl.ARRAY_BUFFER, C.P.attr, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, C.COUNT * 8, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.distBuf);
      gl.bufferData(gl.ARRAY_BUFFER, C.COUNT * 4, gl.DYNAMIC_DRAW);
      this.count = C.COUNT;
      this.shape = C.shape;
    }
    resize(w, h) { this.canvas.width = w; this.canvas.height = h; }
    draw(sim, t, sc) {
      const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.distBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.dist);
      gl.uniform2f(this.u.uRes, w, h);
      gl.uniform1f(this.u.uScale, sc);
      gl.uniform1f(this.u.uT, ((t % LOOP) + LOOP) % LOOP);
      gl.uniform1f(this.u.uTwinkle, params.twinkle);
      gl.uniform1f(this.u.uSparkle, params.sparkle);
      gl.uniform1f(this.u.uSheen, params.sheen);
      gl.uniform1f(this.u.uShape, this.shape);
      gl.drawArrays(gl.POINTS, 0, this.count);
      gl.bindVertexArray(null);
    }
  }

  // ---------- 2D：背景、标题、框线、标注 ----------
  // 版面 L：W×H 画布像素；sc = 每个原图像素多少画布像素；unit = 每个 CSS 像素多少画布像素；bar = 工具栏占的区域
  const fishScale = (W, H) => Math.min(W, H) * params.size / REF_L;

  let noiseTile = null;
  function getNoise() {
    if (noiseTile) return noiseTile;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), img = g.createImageData(256, 256), rnd = mulberry32(5);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() < 0.5 ? 255 : 210;
      img.data[i] = img.data[i + 1] = v; img.data[i + 2] = v - 8; img.data[i + 3] = rnd() * 26;
    }
    g.putImageData(img, 0, 0);
    return (noiseTile = c);
  }

  // 蜥蜴背景上若隐若现的浅色叶片纹理（可无缝平铺）
  let leafTile = null;
  function getLeaves() {
    if (leafTile) return leafTile;
    const S = 320, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), rnd = mulberry32(11);
    for (let i = 0; i < 80; i++) {
      const x = rnd() * S, y = rnd() * S, r = 7 + rnd() * 11, a = rnd() * TAU, moon = rnd() < 0.5;
      const fill = rnd() < 0.8 ? 'rgba(255,255,255,0.5)' : 'rgba(225,228,196,0.12)';
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.save(); g.translate(x + ox, y + oy); g.rotate(a);
        g.fillStyle = fill;
        g.beginPath();
        if (moon) { g.arc(0, 0, r, -2.4, 2.4); g.arc(r * 0.55, 0, r * 0.75, 1.95, -1.95, true); }
        else g.ellipse(0, 0, r, r * 0.45, 0, 0, TAU);
        g.fill(); g.restore();
      }
    }
    return (leafTile = c);
  }

  function drawBackground(ctx, t, L, theme) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, L.W, L.H);
    const p = TAU * t / LOOP;
    // 色晕位置按 1600×2000 的比例摆，铺满时跟着页面拉伸
    const fx = L.W / 1600, fy = L.H / 2000, fr = Math.sqrt(fx * fy);
    for (const b of theme.blobs) {
      const x = (b.x + 22 * Math.sin(p * b.k + b.ph)) * fx, y = (b.y + 26 * Math.cos(p * b.k + b.ph * 1.3)) * fy;
      const r = b.r * fr * (1 + 0.06 * Math.sin(p + b.ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const [cr, cg, cb] = b.c;
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${b.a})`);
      g.addColorStop(0.45, `rgba(${cr},${cg},${cb},${b.a * 0.45})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (theme.texture === 'leaves') {
      const pat = ctx.createPattern(getLeaves(), 'repeat'), k = L.unit / 2;
      pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, L.W, L.H);
      ctx.globalAlpha = 1;
    }
    // 很淡的纸纹（按屏幕像素平铺）
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(getNoise(), 'repeat');
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();
  }

  const FONT_TITLE = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';
  const FONT_MONO = '"Roboto Mono", ui-monospace, Menlo, monospace';
  const FONT_PIXEL = '"Silkscreen", "Roboto Mono", ui-monospace, monospace';   // 闪烁标注用的像素字，像 video2
  const TITLE = ['Dither & ', 'motion'];   // 左上角标题，第二段用主题色
  const INK = '#0b0b0b', MUTED = '#8f8d88';
  const spacing = (ctx, px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; };

  // 版式：左上角标题 + 一行编号小字，右下角动物英文名 + 拉丁学名（对角呼应）
  function drawTitles(ctx, alpha, L, C) {
    if (alpha <= 0.001) return;
    const u = L.unit, short = Math.min(L.W, L.H) / u;
    const f = clamp(short * 0.075, 28, 92) * u;
    const pad = clamp(short * 0.06, 18, 72) * u;
    const fn = Math.max(16 * u, f * 0.5), fs = Math.max(9.5 * u, f * 0.17);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 ${f}px ${FONT_TITLE}`;
    spacing(ctx, -0.03 * f);
    const yt = pad + f * 0.74;
    ctx.fillStyle = INK;
    ctx.fillText(TITLE[0], pad, yt);
    ctx.fillStyle = C.theme.accent;
    ctx.fillText(TITLE[1], pad + ctx.measureText(TITLE[0]).width, yt);
    const no = String(Object.keys(CREATURES).indexOf(C.key) + 1).padStart(2, '0');
    ctx.font = `400 ${fs}px ${FONT_MONO}`;
    spacing(ctx, 0.14 * fs);
    ctx.fillStyle = MUTED;
    ctx.fillText(`NO. ${no} — ${C.COUNT.toLocaleString('en-US')} POINTS IN MOTION`, pad + 0.04 * f, yt + f * 0.62);

    // 右下角：名字在上、学名在下；和工具栏挤在一起时整块往上挪
    let base = L.H - pad;
    ctx.font = `400 ${fn}px ${FONT_TITLE}`;
    spacing(ctx, -0.02 * fn);
    const wn = ctx.measureText(C.en).width;
    if (L.bar && L.W - pad > L.bar.x0 && L.W - pad - wn < L.bar.x1) base = Math.min(base, L.bar.y0 - 14 * u);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.fillText(C.en, L.W - pad, base - fs * 2.1);
    ctx.font = `italic 300 ${fs * 1.25}px ${FONT_TITLE}`;
    spacing(ctx, 0);
    ctx.fillStyle = MUTED;
    ctx.fillText(C.latin, L.W - pad, base);
    ctx.restore();
  }

  // 闪烁标注：按时间查这一拍亮着哪些点（节拍表见 buildBlink），点钉在身体上的某个点上跟着动；
  // 白色直线整拍出现、整拍消失，硬切不渐变。每个点写一个词 + 一行实时坐标读数（像 video2）
  function drawFrame(ctx, sim, alpha, L, t) {
    if (alpha <= 0.001) return;
    const C = sim.C, B = C.BLINK, sc = L.sc, u = L.unit, pos = sim.pos;
    const tick = ((Math.floor(t * BLINK_HZ + 1e-6) % B.T) + B.T) % B.T, o = tick * B.K;
    const A = [];
    for (let n = 0; n < B.K; n++) { const i = B.dot[o + n]; A.push(i < 0 ? null : [pos[i * 2] * sc, pos[i * 2 + 1] * sc]); }
    ctx.save();
    ctx.globalAlpha = alpha;
    // 白线压在浅底上要一圈很淡的影子才看得见
    ctx.shadowColor = 'rgba(24, 28, 34, 0.32)';
    ctx.shadowBlur = 2.5 * u;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.1 * u, 2 * sc);
    ctx.beginPath();
    const E = B.edges[tick];
    for (let j = 0; j < E.length; j += 2) { const a = A[E[j]], b = A[E[j + 1]]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    const r = Math.max(2.4 * u, 8 * sc);
    ctx.fillStyle = '#fff';
    for (const p of A) if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], r + 1.2 * u, 0, TAU); ctx.fill(); }
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = C.theme.frame;
    for (const p of A) if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); }
    // 标注：往身体外侧写（点亮起时在身体左半边就写在左边，亮着期间不换边），出画就翻到另一边；
    // 跟动物一起缩放，但字不小于 9.5 CSS 像素
    const k = Math.max(sc, 9.5 * u / 20);
    let cx = 0;
    for (let n = 0; n < N; n++) cx += sim.sx[n];
    cx = cx / N * sc;
    const sides = sim.tagSides || (sim.tagSides = []);
    const fWord = `400 ${20 * k}px ${FONT_PIXEL}`, fNum = `400 ${14 * k}px ${FONT_PIXEL}`;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2 * u;
    ctx.strokeStyle = 'rgba(252, 250, 240, 0.82)';   // 字后面一圈底色，压在点上也读得清
    A.forEach((p, n) => {
      if (!p) return;
      const word = C.WORDS[B.word[o + n]];
      const num = String(Math.round(clamp(p[0] / L.W, 0, 1) * 1280) / 1280);
      ctx.font = fWord;
      const w = ctx.measureText(word).width, dx = r + 7 * k;
      if (!sides[n] || sides[n].i !== B.dot[o + n]) sides[n] = { i: B.dot[o + n], left: p[0] < cx };
      let left = sides[n].left;
      if (left ? p[0] - dx - w < 0 : p[0] + dx + w > L.W) left = !left;
      const x = p[0] + (left ? -dx : dx);
      ctx.textAlign = left ? 'right' : 'left';
      ctx.strokeText(word, x, p[1] - 4 * k);
      ctx.fillStyle = '#141414';
      ctx.fillText(word, x, p[1] - 4 * k);
      ctx.font = fNum;
      ctx.strokeText(num, x, p[1] + 16 * k);
      ctx.fillStyle = '#6f6c66';
      ctx.fillText(num, x, p[1] + 16 * k);
    });
    ctx.restore();
  }

  function drawOverlay(ctx, sim, view, L, t) {
    drawTitles(ctx, view.titleAlpha, L, sim.C);
    drawFrame(ctx, sim, view.frameAlpha, L, t);
  }

  // 引擎接口：卡片页（cards.html）复用同一套点数据、模拟和渲染；没有 #stage 的页面到这里为止
  window.PixelEngine = {
    CREATURES, Sim, GLFish, params, N, LOOP, PATH_LOOP, GLIDE, PATH_SPEED_MOD, DART_PEAK,
    glideWarp, dartWarp, clamp, smoothstep, wrapPI, mulberry32, pickCodec, download, FONT_TITLE, FONT_MONO,
  };
  if (!document.getElementById('stage')) return;

  // ---------- 实时播放 ----------
  const stage = document.getElementById('stage');
  const bar = document.querySelector('.bar');
  const bgCanvas = document.getElementById('bg');
  const fgCanvas = document.getElementById('fg');
  const bgCtx = bgCanvas.getContext('2d');
  const fgCtx = fgCanvas.getContext('2d');
  let fish;
  try { fish = new GLFish(document.getElementById('fish')); }
  catch (e) { console.error(e); stage.insertAdjacentHTML('beforeend', '<p style="position:absolute;inset:auto 0 50% 0;text-align:center;color:#888">这个浏览器不支持 WebGL2，无法显示动画</p>'); return; }

  const selCreature = document.getElementById('creature');
  const fromHash = () => (location.hash.slice(1) in CREATURES ? location.hash.slice(1) : 'koi');
  let C = CREATURES[fromHash()];
  let live = new Sim(C, true);
  fish.setCreature(C);
  const view = { showFrame: true, showTitle: true, frameAlpha: 1, titleAlpha: 1 };
  const L = { W: 1, H: 1, sc: 1, unit: 1, bar: null };

  function measureBar() {
    const b = bar.getBoundingClientRect(), r = stage.getBoundingClientRect();
    L.bar = { x0: (b.left - r.left) * L.unit, x1: (b.right - r.left) * L.unit, y0: (b.top - r.top) * L.unit };
  }
  function layout() {
    const r = stage.getBoundingClientRect();
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    // 大屏上限制总像素，保证流畅
    const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(6e6 / (cw * ch)));
    L.unit = dpr;
    L.W = Math.round(cw * dpr); L.H = Math.round(ch * dpr);
    L.sc = fishScale(L.W, L.H);
    for (const c of [bgCanvas, fgCanvas]) { c.width = L.W; c.height = L.H; }
    fish.resize(L.W, L.H);
    live.setWorld(L.W / L.sc, L.H / L.sc);
    measureBar();
  }
  new ResizeObserver(layout).observe(stage);
  new ResizeObserver(measureBar).observe(bar);
  layout();

  // 换一种动物：淡出 → 换数据、标题、配色 → 淡入
  function applyCreature(key) {
    C = CREATURES[key];
    live = new Sim(C, true);
    live.setWorld(L.W / L.sc, L.H / L.sc);
    fish.setCreature(C);
    selCreature.value = key;
    document.documentElement.style.setProperty('--accent', C.theme.frame);
    if (location.hash.slice(1) !== key) history.replaceState(null, '', '#' + key);
  }
  let switching = 0;
  function setCreature(key) {
    if (!(key in CREATURES) || key === C.key) { selCreature.value = C.key; return; }
    clearTimeout(switching);
    if (reduceMotion) { applyCreature(key); return; }
    stage.style.opacity = '0';
    switching = setTimeout(() => { applyCreature(key); stage.style.opacity = '1'; }, 280);
  }
  applyCreature(C.key);
  selCreature.addEventListener('change', () => setCreature(selCreature.value));
  addEventListener('hashchange', () => setCreature(fromHash()));

  let last = performance.now(), clock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    const ease = 1 - Math.exp(-dt * 6);
    view.frameAlpha += ((view.showFrame ? 1 : 0) - view.frameAlpha) * ease;
    view.titleAlpha += ((view.showTitle ? 1 : 0) - view.titleAlpha) * ease;
    live.step(clock, dt);
    drawBackground(bgCtx, clock, L, C.theme);
    fish.draw(live, clock, L.sc);
    fgCtx.clearRect(0, 0, L.W, L.H);
    drawOverlay(fgCtx, live, view, L, clock);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(t => { last = t; frame(t); });

  // 指针 → 原图坐标
  function toBoard(e) {
    const r = stage.getBoundingClientRect();
    return [(e.clientX - r.left) * L.unit / L.sc, (e.clientY - r.top) * L.unit / L.sc];
  }
  let lastMove = 0;
  stage.addEventListener('pointermove', e => {
    const [x, y] = toBoard(e);
    const now = performance.now();
    const p = live.pointer || (live.pointer = { x, y, vx: 0, vy: 0, active: true });
    const dt = Math.max(0.008, (now - lastMove) / 1000);
    if (p.active && now - lastMove < 100) {
      p.vx = p.vx * 0.5 + ((x - p.x) / dt) * 0.5;
      p.vy = p.vy * 0.5 + ((y - p.y) / dt) * 0.5;
    }
    p.x = x; p.y = y; p.active = true;
    lastMove = now;
  });
  stage.addEventListener('pointerdown', e => {
    const [x, y] = toBoard(e);
    live.pointer = { x, y, vx: 0, vy: 0, active: true };
    lastMove = performance.now();
    live.ripple(x, y, clock);
  });
  const leave = () => { if (live.pointer) live.pointer.active = false; };
  stage.addEventListener('pointerleave', leave);
  stage.addEventListener('pointercancel', leave);
  stage.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') leave(); });

  // ---------- 按钮 ----------
  const btnFrame = document.getElementById('toggleFrame');
  const btnTitle = document.getElementById('toggleTitle');
  btnFrame.addEventListener('click', () => { view.showFrame = !view.showFrame; btnFrame.setAttribute('aria-pressed', view.showFrame); });
  btnTitle.addEventListener('click', () => { view.showTitle = !view.showTitle; btnTitle.setAttribute('aria-pressed', view.showTitle); });

  // ---------- 调参面板 ----------
  const panel = document.getElementById('panel');
  const btnPanel = document.getElementById('togglePanel');
  const SLIDERS = [
    ['size', '大小', 0.25, 1, 0.01], ['range', '活动范围', 0.1, 1.3, 0.05],
    ['swim', '摆动幅度', 0, 2, 0.05], ['speed', '节奏快慢', 0.4, 2, 0.05],
    ['twinkle', '呼吸闪烁', 0, 1.5, 0.05], ['sparkle', '随机闪光', 0, 2, 0.05], ['sheen', '光泽带', 0, 2, 0.05],
  ];
  panel.innerHTML = SLIDERS.map(([k, label, min, max, step]) =>
    `<label>${label}<span id="v-${k}">${params[k].toFixed(2)}</span></label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${params[k]}">`
  ).join('') + '<div class="hint">D 键开关面板 · 1 / 2 / 3 切换动物 · 导出视频时使用当前参数</div>';
  panel.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    params[k] = parseFloat(e.target.value);
    document.getElementById('v-' + k).textContent = params[k].toFixed(2);
    if (k === 'size') layout();
  });
  const togglePanel = () => { const open = panel.classList.toggle('open'); btnPanel.setAttribute('aria-pressed', open); };
  btnPanel.addEventListener('click', togglePanel);
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'd' || e.key === 'D') togglePanel();
    const keys = Object.keys(CREATURES), n = parseInt(e.key, 10);
    if (n >= 1 && n <= keys.length) setCreature(keys[n - 1]);
  });

  // ---------- 导出视频 ----------
  const btnExport = document.getElementById('export');
  const selRatio = document.getElementById('exportRatio');
  const selSize = document.getElementById('exportSize');
  const selLen = document.getElementById('exportLen');

  // 短边 = 所选清晰度，长边按比例；总像素不超过 3840×2160（H.264 的上限）
  function exportDims() {
    const short = parseInt(selSize.value, 10);
    const [rw, rh] = selRatio.value === 'window' ? [L.W, L.H] : selRatio.value.split(':').map(Number);
    let w = rw >= rh ? short * rw / rh : short, h = rw >= rh ? short : short * rh / rw;
    const k = Math.min(1, Math.sqrt(3840 * 2160 / (w * h)));
    const even = v => Math.max(2, Math.round(v * k / 2) * 2);
    return [even(w), even(h)];
  }

  async function pickCodec(w, h, fps, bitrate) {
    const list = ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.640028', 'avc1.4d0034', 'avc1.42003e'];
    for (const codec of list) {
      try {
        const cfg = { codec, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' } };
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return cfg;
      } catch (_) { /* 尝试下一个 */ }
    }
    return null;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // 离屏渲染器：按指定尺寸逐帧合成背景 + 动物 + 文字框线（不含鼠标交互）
  // opt.loop = 沿路线走一圈几秒；opt.size 覆盖“大小”；opt.path = 改走环形路线（见 loopTable）；
  // opt.env = 匀速游动的用力程度（给了就不再快慢起伏）；opt.unit = 每个版式像素多少画布像素
  function offscreenRenderer(w, h, fps, creature = C, opt = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const glCanvas = document.createElement('canvas');
    const efish = new GLFish(glCanvas);
    efish.resize(w, h);
    efish.setCreature(creature);
    // 文字大小默认按当前窗口等比放大，导出的画面和屏幕上看到的一致
    const sc = opt.size ? Math.min(w, h) * opt.size / REF_L : fishScale(w, h);
    const EL = { W: w, H: h, sc, unit: opt.unit || Math.min(w, h) / (Math.min(L.W, L.H) / L.unit), bar: null };
    const sim = new Sim(creature, false);
    sim.loop = opt.loop || PATH_LOOP;
    sim.setWorld(w / sc, h / sc);
    if (opt.path) sim.world.loop = opt.path;
    if (opt.env) { sim.steady = true; sim.steadyEnv = opt.env; }
    sim.preroll(fps);
    const ev = { frameAlpha: view.showFrame ? 1 : 0, titleAlpha: view.showTitle ? 1 : 0 };
    return {
      canvas,
      sim,
      render(i) {
        const t = (i % (sim.loop * fps)) / fps;
        sim.step(t, 1 / fps);
        drawBackground(ctx, t, EL, creature.theme);
        efish.draw(sim, t, EL.sc);
        ctx.drawImage(glCanvas, 0, 0);
        drawOverlay(ctx, sim, ev, EL, t);
      },
      dispose() {
        const lose = efish.gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      },
    };
  }

  // 短片：12 秒绕环形路线一圈（正好一个 LOOP，首尾无缝），匀速、摆动均匀；
  // 大小、用力程度、转圈方向见 creatures.js 的 clip；字号按 540 宽的版式固定
  const clipOpt = (w, h, creature = C) => ({ loop: LOOP, ...creature.CLIP, unit: Math.min(w, h) / 540 });

  async function exportVideo() {
    const [w, h] = exportDims();
    const clip = selLen.value === 'clip', loops = clip ? 1 : parseInt(selLen.value, 10);
    const seconds = clip ? LOOP : PATH_LOOP * loops;
    const fps = 30, frames = seconds * fps;
    const label = btnExport.textContent;
    btnExport.disabled = true;
    selCreature.disabled = true;
    let off = null;
    try {
      await document.fonts.ready;
      off = offscreenRenderer(w, h, fps, C, clip ? clipOpt(w, h) : {});
      const { canvas, render } = off;
      const name = `${C.key}-${w}x${h}-${seconds}s`;
      const bitrate = Math.round(w * h * fps * 0.22);
      const cfg = window.VideoEncoder && window.Mp4Muxer ? await pickCodec(w, h, fps, bitrate) : null;

      if (cfg) {
        const muxer = new Mp4Muxer.Muxer({
          target: new Mp4Muxer.ArrayBufferTarget(),
          video: { codec: 'avc', width: w, height: h, frameRate: fps },
          fastStart: 'in-memory',
        });
        let failure = null;
        const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
        enc.configure(cfg);
        for (let i = 0; i < frames; i++) {
          if (failure) throw failure;
          render(i);
          const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
          enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
          vf.close();
          while (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 2));
          if (i % 6 === 0) {
            btnExport.textContent = `导出中 ${Math.round(i / frames * 100)}%`;
            await new Promise(r => setTimeout(r, 0));
          }
        }
        await enc.flush();
        if (failure) throw failure;
        muxer.finalize();
        download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), name + '.mp4');
      } else {
        // 退路：浏览器不支持 WebCodecs 时，实时录制成 WebM
        const stream = canvas.captureStream(fps);
        const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
        const chunks = [];
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        const done = new Promise(r => { rec.onstop = r; });
        rec.start();
        const t0 = performance.now();
        for (let i = 0; i < frames; i++) {
          render(i);
          const due = t0 + (i + 1) * 1000 / fps;
          btnExport.textContent = `录制中 ${Math.round(i / frames * 100)}%`;
          await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
        }
        rec.stop();
        await done;
        download(new Blob(chunks, { type: 'video/webm' }), name + '.webm');
      }
    } catch (e) {
      console.error(e);
      alert('导出失败：' + (e && e.message ? e.message : e));
    } finally {
      if (off) off.dispose();
      btnExport.disabled = false;
      selCreature.disabled = false;
      btnExport.textContent = label;
    }
  }
  btnExport.addEventListener('click', exportVideo);

  // 调试/验证用
  window.__koi = {
    params, view, L, CREATURES, clipOpt, exportVideo, exportDims, offscreenRenderer, setCreature,
    get live() { return live; }, get C() { return C; }, get COUNT() { return C.COUNT; }, get BLINK() { return C.BLINK; },
  };
})();
