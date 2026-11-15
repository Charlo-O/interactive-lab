/**
 * Deterministic perforated / torn edge shared by the tear strip and the
 * envelope's top edge so the two interlock exactly.
 */
const POINTS = 240;

function offsets(seed = 11): number[] {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: number[] = [];
  for (let i = 0; i <= POINTS; i++) {
    // Small round scallops every 4 points, roughened with a little jitter.
    const scallop = Math.abs(Math.sin((i * Math.PI) / 4)) * 1.7;
    out.push(+(scallop + (rnd() - 0.5) * 1.1).toFixed(2));
  }
  return out;
}

const EDGE = offsets();

const pt = (i: number, extra = 0) =>
  `${((i / POINTS) * 100).toFixed(3)}% calc(var(--sh) + ${(EDGE[i] + extra).toFixed(2)}px)`;

/** clip-path for the envelope front: torn edge on top, full box below. */
export function frontClip(): string {
  const pts = ['0% 100%'];
  for (let i = 0; i <= POINTS; i++) pts.push(pt(i));
  pts.push('100% 100%');
  return `polygon(${pts.join(',')})`;
}

/** clip-path for the tear strip: straight top, perforated bottom (slight overlap). */
export function stripClip(): string {
  const pts = ['0% -40px', '100% -40px'];
  for (let i = POINTS; i >= 0; i--) pts.push(pt(i, 2.6));
  return `polygon(${pts.join(',')})`;
}
