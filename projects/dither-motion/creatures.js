// 三种动物的定义：名字、骨架、四肢、运动方式、闪烁标注的词和配色。坐标都是 1600×2000 原图像素。
// 引擎（fish.js）只认这里的字段；新增动物 = 加一份定义 + 用 tools/extract.mjs 生成点数据。
(() => {
  'use strict';
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  window.CREATURES = {
    // ---------- 锦鲤：柔软的身体波动 + 鳍被水拖着飘 ----------
    koi: {
      name: '锦鲤',
      en: 'Nishiki Koi', latin: 'Cyprinus rubrofuscus',
      // 12 秒短片：身长占短边的比例、匀速游动的用力程度、环形路线的方向（1 顺时针 / -1 逆时针）和起点
      clip: { size: 0.42, env: 0.8, path: { dir: 1, p0: 2.4 } },
      ink: 1.12,   // 点的墨色浓度（1 = 原样取色），对着原图调过
      // 闪烁标注随机挑的词（像 video2 的 MUSCLE / SPINE / TENSION），每个词下面跟一行实时坐标读数
      words: ['DORSAL FIN', 'CAUDAL', 'PECTORAL', 'SPINE', 'GILL', 'SCALE', 'CURRENT', 'GLIDE', 'ARC', 'DRIFT',
        'PULSE', 'WAKE', 'BALANCE', 'TENSION', 'RIPPLE', 'FLOW', 'BARBEL', 'MOMENTUM', 'CURVE', 'TURN'],
      spine: [
        [1226, 480], [1182, 557], [1070, 695], [970, 795], [895, 895], [845, 982],
        [795, 1070], [745, 1157], [726, 1245], [714, 1345], [701, 1457], [692, 1625],
      ],
      // 鳍和尾鳍：按身体半宽区分，超出部分算作鳍（ped = 尾柄位置）
      fins: {
        ped: [728, 1230],
        halfWidth(u, uPed) {
          if (u < 0.04) return 40 + u / 0.04 * 35;
          if (u < 0.16) return 75 + (u - 0.04) / 0.12 * 12;
          if (u < uPed) return 87 - (u - 0.16) / (uPed - 0.16) * 52;
          return 30;
        },
      },
      limbs: [],
      motion: {
        rhythm: 'glide',      // 摆几下尾加速，再放松滑行
        cruise: 0.2,          // 巡航速度（每秒多少个身长）
        beats: 10,            // 每 12 秒摆尾次数
        beatSpeed: 0.6,       // 摆尾频率里随速度变化的比例
        glideMin: 0.35,       // 滑行时摆尾力度的下限
        speedRange: [0.65, 0.6],
        accel: 1.1,
        agility: 0.9, turnRadius: 0.2,
        pivotU: 0.3, restKeep: 0.35,
        maxBend: () => 0.035,
        stiff: u => 7 + 23 * Math.pow(1 - u, 1.5), damping: 0.42,
        surge: 3, surgeFreq: 2,
        // 从头传到尾的横向位移波，振幅往尾部迅速变大
        wave(u, ph, amp, L) {
          const w = ph - u * 5.8;
          return L * 0.065 * (0.1 + 0.9 * Math.pow(u, 1.8)) * amp * (Math.sin(w) + 0.15 * u * Math.sin(2 * w + 0.6));
        },
      },
      shape: 'cell',
      theme: {
        accent: '#0094ff', frame: '#056fec',
        blobs: [
          { x: 30, y: 690, r: 230, c: [246, 170, 110], a: 0.38, k: 1, ph: 0 },
          { x: 40, y: 1020, r: 300, c: [120, 175, 240], a: 0.34, k: 1, ph: 1.7 },
          { x: -20, y: 1300, r: 260, c: [70, 140, 235], a: 0.3, k: 2, ph: 3.1 },
          { x: 1530, y: 1640, r: 240, c: [246, 165, 100], a: 0.4, k: 1, ph: 2.4 },
          { x: 1610, y: 1900, r: 300, c: [40, 120, 235], a: 0.5, k: 2, ph: 0.6 },
        ],
      },
    },

    // ---------- 海龟：龟壳是刚体，只有脖子会弯；前鳍肢大幅划水、后鳍肢小幅配合，划几下再滑行 ----------
    turtle: {
      name: '海龟',
      en: 'Green Sea Turtle', latin: 'Chelonia mydas',
      // 鳍肢张得宽：比另外两种小一点、圈也小一点，才不碰画面边缘
      clip: { size: 0.36, env: 0.85, path: { dir: -1, p0: 0.6, ax: 0.27, ay: 0.235, cy: 0.54 } },
      ink: 1.08,
      words: ['FLIPPER', 'CARAPACE', 'PLASTRON', 'SCUTE', 'STROKE', 'NECK', 'CURRENT', 'BUOYANCY', 'GLIDE', 'DEPTH',
        'BALANCE', 'BREATH', 'DRIFT', 'TIDE', 'MOMENTUM', 'SWEEP', 'LIFT', 'BANK', 'PULSE', 'ARC'],
      spine: [
        [1310, 505], [1250, 560], [1170, 625], [1090, 695], [1005, 770],
        [915, 860], [830, 960], [750, 1070], [690, 1180], [645, 1290],
      ],
      // 鳍肢：沿 path 从关节到尖端；amp 划水幅度（弧度），phase 相位，hold 滑行时往后收拢的比例，
      // flexLag/flex 让尖端滞后、弯得更多（像软鳍一样一波一波地划），bank 转弯时内侧收、外侧张
      limbs: [
        { path: [[905, 700], [680, 590], [430, 705]], radius: 95, amp: 0.55, phase: 0, hold: 0.6, flexLag: 0.9, flex: 0.35, bank: 0.35 },
        { path: [[1120, 870], [1270, 950], [1330, 1080], [1300, 1330]], radius: 85, amp: 0.55, phase: 0, hold: 0.6, flexLag: 0.9, flex: 0.35, bank: 0.35 },
        { path: [[560, 1270], [420, 1350], [296, 1430]], radius: 78, amp: 0.28, phase: 1.6, hold: 0.25, flexLag: 0.6, flex: 0.3, bank: 0.25 },
        { path: [[690, 1330], [715, 1500], [740, 1710]], radius: 80, amp: 0.28, phase: 1.6, hold: 0.25, flexLag: 0.6, flex: 0.3, bank: 0.25 },
      ],
      motion: {
        rhythm: 'glide',
        cruise: 0.2, beats: 5, beatSpeed: 0.4, glideMin: 0.15,
        speedRange: [0.5, 0.85],
        accel: 0.8,
        agility: 0.5, turnRadius: 0.35,
        pivotU: 0.5, restKeep: 1,
        // 只有脖子能弯，龟壳整体转向
        maxBend: u => (u < 0.3 ? 0.04 : 0),
        stiff: u => (u < 0.3 ? 14 : 22), damping: 0.6,
        surge: 8, surgeFreq: 1,
        // 头随划水轻轻点动
        wave(u, ph, amp, L) { return L * 0.012 * amp * clamp(1 - u / 0.3, 0, 1) * Math.sin(ph - 0.8); },
      },
      shape: 'cell',
      theme: {
        accent: '#ff6b17', frame: '#ff6e18',
        blobs: [
          { x: 1250, y: -40, r: 330, c: [150, 178, 150], a: 0.45, k: 1, ph: 0.4 },
          { x: 1610, y: 10, r: 260, c: [175, 172, 118], a: 0.45, k: 1, ph: 2.1 },
          { x: -30, y: 1300, r: 270, c: [95, 150, 150], a: 0.5, k: 2, ph: 1.2 },
          { x: 0, y: 1600, r: 220, c: [150, 198, 182], a: 0.38, k: 1, ph: 3.3 },
        ],
      },
    },

    // ---------- 蜥蜴：窜一段、停一下；身体左右弯、四条腿对角交替迈步、尾巴甩动，停下时左右张望 ----------
    lizard: {
      name: '蜥蜴',
      en: 'Day Gecko', latin: 'Phelsuma grandis',
      clip: { size: 0.42, env: 1, path: { dir: 1, p0: 4.2 } },
      ink: 1.25,
      words: ['STRIDE', 'TAIL', 'CLAW', 'SPINE', 'DART', 'PAUSE', 'GAIT', 'BALANCE', 'TENSION', 'GRIP',
        'SPRINT', 'TOE PAD', 'FLEX', 'TWIST', 'REFLEX', 'POISE', 'ANGLE', 'LIMB', 'IMPULSE', 'SCALE'],
      spine: [
        [1080, 495], [1030, 560], [975, 630], [920, 700], [865, 780], [820, 870], [785, 960],
        [760, 1060], [748, 1160], [752, 1250], [770, 1330], [800, 1420], [845, 1500], [905, 1565],
        [975, 1615], [1050, 1655], [1110, 1705], [1135, 1745],
      ],
      // 身体半宽：在这以内的点算身体，不跟着腿转
      bodyHalfWidth: u => (u < 0.18 ? 72 : u < 0.55 ? 66 : 45 * (1 - (u - 0.55) / 0.45) + 12),
      // 腿：对角两条腿同相（左前 + 右后、右前 + 左后），前后摆动
      limbs: [
        { path: [[850, 760], [740, 700], [630, 640]], radius: 78, amp: 0.5, phase: 0, hold: 0, flexLag: 0.5, flex: 0.2, bank: 0 },
        { path: [[885, 810], [1010, 860], [1140, 940]], radius: 78, amp: 0.5, phase: PI, hold: 0, flexLag: 0.5, flex: 0.2, bank: 0 },
        { path: [[735, 1150], [600, 1150], [450, 1190]], radius: 88, amp: 0.5, phase: PI, hold: 0, flexLag: 0.5, flex: 0.2, bank: 0 },
        { path: [[775, 1200], [880, 1270], [990, 1380]], radius: 82, amp: 0.5, phase: 0, hold: 0, flexLag: 0.5, flex: 0.2, bank: 0 },
      ],
      motion: {
        rhythm: 'dart',       // 窜一段、停一下
        cruise: 0.75,         // 奔跑速度（每秒多少个身长）
        stride: 0.38,         // 每个步态周期前进多少个身长：腿的节奏随速度变化，脚不打滑
        accel: 7,
        agility: 2.2, turnRadius: 0.15,
        pivotU: 0.3, restKeep: 0.4,
        maxBend: u => (u < 0.55 ? 0.03 : 0.05),
        stiff: u => 10 + 14 * (1 - u), damping: 0.5,
        surge: 0, surgeFreq: 1,
        look: 0.35,           // 停下时头左右张望的幅度
        // 躯干在肩和髋之间左右弯成 C 形；尾巴是从根部往后传的波
        wave(u, ph, amp, L) {
          const uS = 0.25, uH = 0.52;
          if (u < uS) return -L * 0.01 * amp * Math.sin(ph) * (1 - u / uS);
          if (u < uH) return L * 0.035 * amp * Math.sin(ph) * Math.sin(PI * (u - uS) / (uH - uS));
          const k = (u - uH) / (1 - uH);
          return L * 0.06 * amp * Math.pow(k, 1.3) * Math.sin(ph - 1.2 - 5 * (u - uH));
        },
      },
      shape: 'leaf',
      theme: {
        accent: '#70e02a', frame: '#72c43f',
        texture: 'leaves',
        blobs: [
          { x: -20, y: 560, r: 240, c: [150, 215, 80], a: 0.6, k: 1, ph: 0.3 },
          { x: -10, y: 830, r: 170, c: [240, 190, 130], a: 0.22, k: 1, ph: 2.2 },
          { x: 1620, y: 1960, r: 290, c: [150, 205, 70], a: 0.6, k: 2, ph: 1.1 },
          { x: 1610, y: 1800, r: 200, c: [160, 205, 80], a: 0.45, k: 1, ph: 2.9 },
        ],
      },
    },
  };
})();
