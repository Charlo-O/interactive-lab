// 二维纸纹与尺规痕迹；不参与 Three.js 场景。
export function createPaperTexture(element) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'),
    d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = 228 + Math.random() * 27;
    d.data[i] = n;
    d.data[i + 1] = n * 0.995;
    d.data[i + 2] = n * 0.985;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  g.strokeStyle = 'rgba(70,80,80,.1)';
  g.lineWidth = 0.6;
  for (let k = 0; k < 90; k++) {
    const x = Math.random() * 256,
      y = Math.random() * 256,
      a = Math.random() * 6.3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    g.stroke();
  }
  element.style.background = `radial-gradient(ellipse at center,rgba(255,255,255,0) 55%,rgba(80,80,76,.18) 100%),url(${c.toDataURL()})`;
}

export function drawPaperDecoration(c, W, H, DPR) {
  const g = c.getContext('2d');
  c.width = W * DPR;
  c.height = H * DPR;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cs = getComputedStyle(document.documentElement),
    ink = cs.getPropertyValue('--ink').trim(),
    red = cs.getPropertyValue('--red').trim();
  let sd = 11;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  g.lineCap = 'round';
  const st = (pts, a, w = 0.7, col = ink) => {
    for (let k = 0; k < 2; k++) {
      g.globalAlpha = a * (k ? 0.55 : 1);
      g.strokeStyle = col;
      g.lineWidth = w * (k ? 0.8 : 1);
      g.beginPath();
      pts.forEach(([x, y], i) => {
        const X = x + (r() - 0.5) * 0.9,
          Y = y + (r() - 0.5) * 0.9;
        i ? g.lineTo(X, Y) : g.moveTo(X, Y);
      });
      g.stroke();
    }
  };
  const arc = (x, y, rr, a0, a1, a, w, col) => {
    const p = [];
    const n = Math.max(12, Math.ceil((rr * Math.abs(a1 - a0)) / 6));
    for (let t = 0; t <= n; t++) {
      const q = a0 + ((a1 - a0) * t) / n;
      p.push([x + Math.cos(q) * rr, y + Math.sin(q) * rr]);
    }
    st(p, a, w, col);
  };
  const cx = W / 2,
    cy = H / 2,
    m = Math.min(W, H);
  for (let k = 0; k < 8; k++) {
    const a0 = r() * 6.3;
    arc(
      cx + (r() - 0.5) * m * 0.08,
      cy + (r() - 0.5) * m * 0.06,
      m * (0.3 + k * 0.065 + r() * 0.03),
      a0,
      a0 + 2.6 + r() * 3.4,
      0.12,
      0.7,
    );
  }
  const tr = m * 0.46;
  for (let t = 0; t < 90; t++) {
    const q = -2.5 + t * 0.022,
      l = t % 5 ? 4 : 9;
    st(
      [
        [cx + Math.cos(q) * tr, cy + Math.sin(q) * tr],
        [cx + Math.cos(q) * (tr + l), cy + Math.sin(q) * (tr + l)],
      ],
      0.28,
      0.6,
    );
  }
  const L2 = Math.hypot(W, H);
  for (let k = 0; k < 7; k++) {
    const q = r() * 3.14,
      px = cx + (r() - 0.5) * W * 0.8,
      py = cy + (r() - 0.5) * H * 0.8;
    st(
      [
        [px - Math.cos(q) * L2, py - Math.sin(q) * L2],
        [px + Math.cos(q) * L2, py + Math.sin(q) * L2],
      ],
      0.07,
      0.6,
    );
  }
  const sx = W - 80,
    sy = 92;
  st(
    [
      [sx - 28, sy],
      [sx + 28, sy],
    ],
    0.55,
    0.8,
  );
  st(
    [
      [sx, sy - 32],
      [sx, sy + 32],
    ],
    0.55,
    0.8,
  );
  st(
    [
      [sx - 9, sy - 9],
      [sx + 9, sy + 9],
    ],
    0.35,
  );
  st(
    [
      [sx - 9, sy + 9],
      [sx + 9, sy - 9],
    ],
    0.35,
  );
  arc(sx, sy, 11, 0, 6.3, 0.35, 0.6);

  st(
    [
      [34, 112],
      [176, 112],
    ],
    0.5,
    0.7,
  );
  st(
    [
      [34, 118],
      [176, 118],
    ],
    0.5,
    0.7,
  );
  for (let x = 34; x <= 176; x += 4)
    st(
      [
        [x, 112],
        [x, 118],
      ],
      0.4,
      0.5,
    );
  for (let k = 0; k < 6; k++) {
    const x = W * (0.15 + r() * 0.7),
      y = H * (0.15 + r() * 0.7);
    st(
      [
        [x - 5, y],
        [x + 5, y],
      ],
      0.35,
      0.6,
    );
    st(
      [
        [x, y - 5],
        [x, y + 5],
      ],
      0.35,
      0.6,
    );
  }
  const mx = cx - m * 0.42,
    my = cy + m * 0.18;
  arc(mx, my, 24, 0, 6.3, 0.6, 0.9, red);
  arc(mx, my, 13, 0, 6.3, 0.5, 0.8, red);
  st(
    [
      [mx - 6, my - 2],
      [mx + 8, my - 4],
    ],
    0.6,
    0.9,
    red,
  );
  st(
    [
      [mx - 6, my + 2],
      [mx + 8, my],
    ],
    0.5,
    0.8,
    red,
  );
  arc(cx, cy, m * 0.4, 1.9, 3.4, 0.55, 0.9, red);
  g.globalAlpha = 1;
}
