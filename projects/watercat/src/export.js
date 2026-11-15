// Video export, opened as watercat.html?export=1 on tools/serve.py.
//
// Plays every interaction once, in full, on a fixed 30 fps clock: each frame
// is rendered, captioned and POSTed to /__save as a JPEG, and the sounds the
// page would have played are written down rather than played. At the end the
// sound list goes up as export/sound.json; tools/finish_export.py mixes it from
// the same clips and muxes the MP4. Progress: window.__export, document.title.

const FPS = 30;
const SIZE = 1080;

// Labels match the buttons on the page.
const TIMELINE = [
  { label: '水猫', hold: 1.8 },
  { label: '点玻璃', hold: 3.4, at: [[0.5, s => s.tapGlass(-0.32, 5.6)], [1.9, s => s.tapGlass(0.22, 4.3)]] },
  { label: '点耳朵', hold: 2.2, at: [[0.4, s => s.flickEar()], [1.2, s => s.flickEar()]] },
  { label: '看着你', action: 'look', tail: 0.8 },
  { label: '摸一摸', action: 'touch', tail: 1.8 },
  { label: '打个盹', action: 'nap', tail: 1.2 },
  { label: '掉眼泪', action: 'tear', tail: 1.2 },
  { label: '呵口气', action: 'fog', tail: 3.2 },
  { label: '逗光点', action: 'spot', tail: 1.0 },
  { label: '摇杯子', action: 'shake', tail: 1.6 },
  { label: '', hold: 1.2 }
];

// Same choices every run.
function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function save(name, body, type) {
  const response = await fetch(`/__save?name=${encodeURIComponent(name)}`, { method: 'POST', body, headers: { 'Content-Type': type } });
  if (!response.ok) throw new Error(`save ${name}: HTTP ${response.status}`);
}

function jpeg(canvas) {
  const data = atob(canvas.toDataURL('image/jpeg', 0.94).split(',')[1]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return bytes;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// The finger or gaze marker the page draws on its overlay canvas.
function drawCue(g, cue) {
  if (!cue) return;
  const finger = cue.kind === 'finger';
  g.beginPath();
  g.arc(cue.u * SIZE, cue.v * SIZE, finger ? 30 : 12, 0, Math.PI * 2);
  g.fillStyle = finger ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)';
  g.fill();
  g.lineWidth = 2.6;
  g.strokeStyle = 'rgba(90,132,168,0.75)';
  g.stroke();
}

// A caption pill styled like the page's action buttons, with its progress line.
function drawCaption(g, label, alpha, progress) {
  if (!label || alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.font = '500 34px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  const w = g.measureText(label).width + 64;
  const h = 64;
  const x = (SIZE - w) / 2;
  const y = SIZE - 58 - h;
  roundRect(g, x, y, w, h, h / 2);
  g.fillStyle = 'rgba(246,250,253,0.88)';
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(95,131,163,0.25)';
  g.stroke();
  if (progress > 0) {
    g.save();
    roundRect(g, x, y, w, h, h / 2);
    g.clip();
    g.fillStyle = '#2a79a8';
    g.fillRect(x, y + h - 4, w * progress, 4);
    g.restore();
  }
  g.fillStyle = '#33597a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, SIZE / 2, y + h / 2 + 1);
  g.restore();
}

export async function runExport(studio) {
  seedRandom(20261110);
  const recorder = studio.sound.record();
  studio.size(SIZE, SIZE);
  const out = document.createElement('canvas');
  out.width = out.height = SIZE;
  const g = out.getContext('2d');
  const dt = 1 / FPS;
  const status = window.__export = { frame: 0, segment: '', done: false, chapters: [] };
  await document.fonts?.ready;

  let frame = 0;
  const emit = async (label, localTime, length, progress) => {
    const canvas = studio.frame(dt);
    g.drawImage(canvas, 0, 0, SIZE, SIZE);
    drawCue(g, studio.cue());
    const alpha = Math.min(1, localTime / 0.35, (length - localTime) / 0.35);
    drawCaption(g, label, alpha, progress);
    frame += 1;
    await save(`frames/${String(frame).padStart(5, '0')}.jpg`, jpeg(out), 'image/jpeg');
    status.frame = frame;
    document.title = `export ${frame} · ${label || 'end'}`;
  };

  for (const segment of TIMELINE) {
    status.segment = segment.label;
    status.chapters.push({ label: segment.label, start: frame / FPS });
    if (segment.action) {
      // Run the scene to its natural end, then let it settle.
      studio.start(segment.action);
      let t = 0;
      // Length is only known at the end, so captions fade out over the tail.
      while (studio.director.current === segment.action) {
        await emit(segment.label, t, Infinity, studio.progress());
        t += dt;
      }
      const length = t + segment.tail;
      for (; t < length - 1e-6; t += dt) await emit(segment.label, t, length, 1);
    } else {
      const cues = [...(segment.at || [])];
      for (let t = 0; t < segment.hold - 1e-6; t += dt) {
        while (cues.length && cues[0][0] <= t + 1e-6) cues.shift()[1](studio);
        await emit(segment.label, t, segment.hold, 0);
      }
    }
  }

  const sound = { fps: FPS, frames: frame, duration: frame / FPS, events: recorder.events, chapters: status.chapters };
  await save('sound.json', JSON.stringify(sound, null, 1), 'application/json');
  status.done = true;
  document.title = `export done · ${frame} frames`;
}
