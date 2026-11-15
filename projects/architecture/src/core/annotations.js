/** Canvas 注记；每个建筑切换时 reset 清除引线方向缓存。 */
export function createAnnotations(canvas, DPR) {
  const octx = canvas.getContext('2d');
  const noteDir = {};
  function draw(W, H, M, { note, prog, cutV, clip, camera, U }) {
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    octx.clearRect(0, 0, W, H);
    if (!note) return;
    octx.font =
      '12px "Songti SC","STSong","Noto Serif SC","Source Han Serif SC","Noto Serif CJK SC","SimSun",serif';
    octx.textBaseline = 'middle';
    const ink = `#${U.ink.value.getHexString()}`,
      red = `#${U.red.value.getHexString()}`;
    for (const [s, p, isRed, nk] of M.notes) {
      if (isRed && cutV < 35) continue;
      if (prog < 1 && (nk != null ? U.grow.value - 5 < nk : p.y > U.grow.value - 3)) continue;
      if (isRed && prog < Math.min(1.2, M.PMAX)) continue;
      {
        const dz = M.clipN.dot(p) + clip.constant;
        if (dz < -0.05 || (cutV >= 35 && !isRed && dz > 8)) continue;
      }
      const q = p.clone().project(camera);
      if (q.z > 1) continue;
      const x = (q.x * 0.5 + 0.5) * W,
        y = (-q.y * 0.5 + 0.5) * H,
        k = s;
      let dir = noteDir[k] ?? 1;
      if (x > W / 2 + 40) dir = 1;
      else if (x < W / 2 - 40) dir = -1;
      noteDir[k] = dir;
      const tx = x + dir * 60,
        ty = y - 26;
      octx.strokeStyle = octx.fillStyle = isRed ? red : ink;
      octx.globalAlpha = 0.8;
      octx.lineWidth = 0.8;
      octx.beginPath();
      octx.arc(x, y, 1.8, 0, 6.3);
      octx.fill();
      octx.beginPath();
      octx.moveTo(x, y);
      octx.lineTo(tx, ty);
      octx.lineTo(tx + dir * 14, ty);
      octx.stroke();
      octx.textAlign = dir > 0 ? 'left' : 'right';
      octx.globalAlpha = 0.9;
      octx.lineWidth = 3.5;
      octx.strokeStyle = `#${U.paper.value.getHexString()}`;
      octx.strokeText(s, tx + dir * 18, ty);
      octx.fillText(s, tx + dir * 18, ty);
    }
    octx.globalAlpha = 1;
  }

  return {
    draw,
    reset() {
      for (const key in noteDir) delete noteDir[key];
    },
  };
}
