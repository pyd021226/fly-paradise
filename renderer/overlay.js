const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const FLY_HIT = 11;
const MAX_ADULTS = 48;
const MAX_EGGS = 240;
const MAX_LARVAE = 160;
const MAX_PUPAE = 96;
const MAX_SHELLS = 240;
const MAX_SPLATS = 400;
const MAX_FOOD = 8;
const ADULT_LEN = 18;
const MATE_MS = 8000;
const EGG_MS = 30000;
const PUPA_MS = 120000;
const RESPAWN_MIN = 120;
const RESPAWN_MAX = 300;
const NOTICE_RANGE = 220;
const RAG_R = 22;
const FOOD_SLOTS = 6;
const BIN_SLOTS = 8;
const PUPA_CAP = 2;
const PUPA_CELL = 2;
const PUPA_RX = 9 * 0.8;
const PUPA_RY = 3.6 * 0.8;
const LAUNCH_MS = 30 * 60 * 1000;
const FOOD_SUPPLY = 360;
const EAT_NEED = 60;
const EAT_UNITS = 60;
const EAT_L1 = 30;
const EAT_L2 = 60;
const EAT_L3 = 90;
const BREED_ADULTS = 12;
const BREED_EGGS = 18;
const BREED_LARVAE = 18;
const BREED_PUPAE = 18;
const RIPE_MS = 120000;
const AIR_MAX_MS = 15000;
const ICON_PX = 32;
const FAST_MS = 1500;
const FAST_EAT = 2;

function mateMs() { return fast ? FAST_MS : MATE_MS; }
function eggMs() { return fast ? FAST_MS : EGG_MS; }
function pupaMs() { return fast ? FAST_MS : PUPA_MS; }
function ripeMs() { return fast ? FAST_MS : RIPE_MS; }
function eatNeedFor(unit) {
  if (fast) return FAST_EAT;
  if (unit && unit.instar === 1) return EAT_L1;
  if (unit && unit.instar === 2) return EAT_L2;
  if (unit && unit.instar === 3) return EAT_L3;
  return EAT_UNITS;
}

function isGenoGreen(u) {
  return u && (u.geneD || 0) >= 2 && (u.geneP || 0) >= 2 && (u.geneG || 0) >= 2;
}

function isGreenMorph(u) {
  const m = morphOf(u.geneD, u.geneP, u.geneG, u.geneX, u.geneY);
  return m === 'green' || m === 'rainbow';
}

function canHatch() { return !breed || larvae.length < BREED_LARVAE; }
function canPupate() { return !breed || pupae.length < BREED_PUPAE; }
function canEclose() { return !breed || flies.length < BREED_ADULTS; }
function canAddAdult() { return !breed || flies.filter((f) => f.state !== 'dead').length < BREED_ADULTS; }
function adultsFull() { return breed && flies.filter((f) => f.state !== 'dead').length >= BREED_ADULTS; }

function extraAllele(n) {
  const k = Number(n);
  if (!Number.isFinite(k) || k <= 0) return 0;
  if (k >= 2) return 1;
  return Math.random() < 0.5 ? 1 : 0;
}

function extraGenes(mom, dad) {
  const mg = isGenoGreen(mom);
  const dg = isGenoGreen(dad);
  if (mg && dg) {
    return {
      geneX: extraAllele(mom.geneX) + extraAllele(dad.geneX),
      geneY: extraAllele(mom.geneY) + extraAllele(dad.geneY),
    };
  }
  if (mg) return { geneX: extraAllele(mom.geneX), geneY: extraAllele(mom.geneY) };
  if (dg) return { geneX: extraAllele(dad.geneX), geneY: extraAllele(dad.geneY) };
  return { geneX: 1, geneY: 1 };
}

let W = innerWidth;
let H = innerHeight;
let icons = [];
let mouse = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0, spd: 0 };
let swatterOn = false;
let ragOn = false;
let ragWipe = false;
let rawMove = false;
let paused = false;
let fast = false;
let watch = false;
let breed = true;
let flavorAnnoy = false;
let cleared = false;
let breedMs = 0;
let holdBoot = true;
let rainbowSeen = false;
let fanfareUntil = 0;
let fanfareRaised = false;
let grabbing = false;
let flies = [];
let foods = [];
let eggs = [];
let larvae = [];
let pupae = [];
let shells = [];
let corpses = [];
let splats = [];
let nextId = 1;
let booted = false;
let extinctSince = 0;
let respawnIn = 0;
let foodAcc = 0;
let lifeAcc = 0;
let snapAcc = 0;
let last = performance.now();
let screens = [];

function screenOf(x, y) {
  return screens.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) || null;
}

function nearestScreen(x, y) {
  if (!screens.length) return { x: 0, y: 0, w: W, h: H };
  let best = screens[0];
  let bd = 1e9;
  for (const s of screens) {
    const cx = clamp(x, s.x, s.x + s.w);
    const cy = clamp(y, s.y, s.y + s.h);
    const d = Math.hypot(x - cx, y - cy);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.max(1, Math.floor(W * dpr));
  canvas.height = Math.max(1, Math.floor(H * dpr));
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
addEventListener('resize', resize);

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function bodyPx(fly) {
  return 18 * (fly && fly.scale ? fly.scale : 1);
}

function senseRadius(fly) {
  const L = bodyPx(fly);
  const t = clamp(mouse.spd / 3200, 0, 1);
  const flying = fly.state === 'fly' || fly.state === 'flee';
  const minB = flying ? 20 : 4;
  const maxB = 30;
  return L * (minB + (maxB - minB) * t);
}

function mateRadius(fly) {
  return bodyPx(fly) * 20;
}

function iconGlyph(ic) {
  const side = Math.max(18, Math.min(ic.h - 2, 32));
  return {
    x: ic.x + (ic.w - side) / 2,
    y: ic.y + Math.max(0, (ic.h - side) / 2),
    w: side,
    h: side,
  };
}

function iconAt(x, y) {
  for (const ic of icons) {
    if (ic.w < 8 || ic.h < 8) continue;
    if (x >= ic.x && x <= ic.x + ic.w && y >= ic.y && y <= ic.y + ic.h) return ic;
  }
  return null;
}

function underIcon(x, y) {
  return !!iconAt(x, y);
}

function currentCell(x, y) {
  for (const ic of icons) {
    if (ic.w < 8 || ic.h < 8) continue;
    const g = iconGlyph(ic);
    if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return ic;
  }
  return null;
}

function ringIcons(ic) {
  if (!ic) return [];
  const cx = ic.x + ic.w / 2;
  const cy = ic.y + ic.h / 2;
  const rx = Math.max(80, ic.w * 1.6);
  const ry = Math.max(90, ic.h * 1.8);
  const out = [];
  for (const o of icons) {
    if (Math.abs((o.x + o.w / 2) - cx) <= rx && Math.abs((o.y + o.h / 2) - cy) <= ry) out.push(o);
  }
  return out;
}

function onFood(x, y, food, pad) {
  if (!food) return false;
  const ic = icons.find((i) => i.id === food.iconId);
  const p = Math.max(2, pad || 0);
  if (ic) {
    const g = iconGlyph(ic);
    if (x >= g.x + p && x <= g.x + g.w - p && y >= g.y + p && y <= g.y + g.h - p) return true;
  }
  return Math.hypot(food.x - x, food.y - y) < p;
}

function foodInRing(x, y, skipId) {
  const here = currentCell(x, y);
  if (!here) return null;
  const ids = new Set(ringIcons(here).map((i) => i.id));
  let best = null;
  let bd = 1e9;
  for (const f of foods) {
    if (skipId && f.id === skipId) continue;
    if (!foodOpen(f)) continue;
    if (f.infinite) {
      if (f.iconId !== here.id) continue;
    } else if (!ids.has(f.iconId)) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function punchIcons() {
  if (watch || swatterOn || ragOn || !icons.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const ic of icons) {
    if (ic.w < 8 || ic.h < 8) continue;
    ctx.fillRect(ic.x, ic.y, ic.w, ic.h);
  }
  ctx.restore();
}

function nearestEdge(g, x, y) {
  const dl = Math.abs(x - g.x);
  const dr = Math.abs(x - (g.x + g.w));
  const dt = Math.abs(y - g.y);
  const db = Math.abs(y - (g.y + g.h));
  const m = Math.min(dl, dr, dt, db);
  if (m === dt) return 'top';
  if (m === db) return 'bottom';
  if (m === dl) return 'left';
  return 'right';
}

function placeOnEdge(g, edge, along) {
  if (edge === 'top') return { x: clamp(along, g.x + 3, g.x + g.w - 3), y: g.y };
  if (edge === 'bottom') return { x: clamp(along, g.x + 3, g.x + g.w - 3), y: g.y + g.h };
  if (edge === 'left') return { x: g.x, y: clamp(along, g.y + 3, g.y + g.h - 3) };
  return { x: g.x + g.w, y: clamp(along, g.y + 3, g.y + g.h - 3) };
}

function iconPad(ic) {
  const g = iconGlyph(ic);
  return { x: g.x + g.w * 0.5, y: g.y + g.h * 0.45 };
}

function clampToGlyph(ic, x, y) {
  const g = iconGlyph(ic);
  return {
    x: clamp(x, g.x + 5, g.x + g.w - 5),
    y: clamp(y, g.y + 4, g.y + g.h - 4),
  };
}

function absContour(ic) {
  if (!ic || !ic.c || ic.c.length < 6) return [];
  return ic.c.map((p) => [ic.x + Number(p[0]), ic.y + Number(p[1])]);
}

function nearestContourIndex(ic, x, y) {
  const c = absContour(ic);
  if (!c.length) return -1;
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < c.length; i++) {
    const d = Math.hypot(c[i][0] - x, c[i][1] - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function contourCentroid(ic) {
  const c = absContour(ic);
  let x = 0;
  let y = 0;
  for (const p of c) {
    x += p[0];
    y += p[1];
  }
  return { x: x / c.length, y: y / c.length };
}

function perchPose(fly) {
  if (!fly.perch) return 'side';
  const g = iconGlyph(fly.perch);
  const nx = (fly.x - (g.x + g.w / 2)) / Math.max(8, g.w / 2);
  const ny = (fly.y - (g.y + g.h / 2)) / Math.max(8, g.h / 2);
  const t = Math.hypot(nx, ny);
  if (t < 0.4) return 'dorsal';
  if (t > 0.72) return 'side';
  return 'oblique';
}

function dangerPos() {
  return swatterOn ? paddleCenter() : { x: mouse.x, y: mouse.y };
}

function farFromMouse(ic, min = 90) {
  const c = iconPad(ic);
  const p = dangerPos();
  return Math.hypot(c.x - p.x, c.y - p.y) > min;
}

function randomIcon() {
  if (!icons.length) return null;
  return icons[Math.floor(Math.random() * icons.length)];
}

function nearestIconTo(x, y, excludeId) {
  let best = null;
  let bd = 1e9;
  for (const ic of icons) {
    if (ic.id === excludeId) continue;
    const c = iconPad(ic);
    if (screens.length && !screenOf(c.x, c.y)) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) {
      bd = d;
      best = ic;
    }
  }
  return best;
}

function pickIcon(preferFood, from, excludeId) {
  if (!icons.length) return null;
  const onScreen = (ic) => {
    const c = iconPad(ic);
    return !!screenOf(c.x, c.y);
  };
  let pool = icons.filter((ic) => ic.id !== excludeId && farFromMouse(ic, 70) && onScreen(ic));
  if (!pool.length) pool = icons.filter((ic) => ic.id !== excludeId && onScreen(ic));
  if (!pool.length) pool = icons.filter((ic) => ic.id !== excludeId);
  if (!pool.length) pool = icons.slice();
  if (preferFood) {
    const forced = seekFoodIcon(from);
    if (forced) return forced;
    const fed = pool.filter((ic) => {
      const f = foods.find((x) => x.iconId === ic.id);
      return f && foodOpen(f);
    });
    if (fed.length) {
      fed.sort((a, b) => foodScore(a, from) - foodScore(b, from));
      if (from) return fed[0];
      const w = [];
      for (const ic of fed) {
        const f = foods.find((x) => x.iconId === ic.id);
        const n = Math.max(1, f && f.attract ? Math.round(f.attract) : 1);
        for (let k = 0; k < n; k++) w.push(ic);
      }
      pool = w;
    }
  }
  if (from) {
    const home = screenOf(from.x, from.y);
    if (home) {
      const same = pool.filter((ic) => {
        const c = iconPad(ic);
        return c.x >= home.x && c.x < home.x + home.w && c.y >= home.y && c.y < home.y + home.h;
      });
      if (same.length) pool = same;
    }
    pool.sort((a, b) => {
      const da = Math.hypot(iconPad(a).x - from.x, iconPad(a).y - from.y);
      const db = Math.hypot(iconPad(b).x - from.x, iconPad(b).y - from.y);
      return da - db;
    });
    return pool[0] || null;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function passRecessive(n) {
  const k = n == null ? 1 : n;
  if (k >= 2) return 1;
  if (k <= 0) return 0;
  return Math.random() < 0.5 ? 1 : 0;
}

function inheritGene(a, b) {
  return passRecessive(a) + passRecessive(b);
}

function genesFor(morph) {
  const g = { geneD: 1, geneP: 1, geneG: 0, geneX: 0, geneY: 0 };
  if (morph === 'deep') { g.geneD = 2; g.geneP = 0; }
  else if (morph === 'mid') { g.geneD = 0; g.geneP = 2; }
  else if (morph === 'white') { g.geneD = 2; g.geneP = 2; }
  else if (morph === 'whiteHet') { g.geneD = 2; g.geneP = 2; g.geneG = 1; }
  else if (morph === 'green') { g.geneD = 2; g.geneP = 2; g.geneG = 2; g.geneX = 1; g.geneY = 1; }
  else if (morph === 'rainbow') { g.geneD = 2; g.geneP = 2; g.geneG = 2; g.geneX = 2; g.geneY = 2; }
  else if (morph === 'wild') { g.geneD = 0; g.geneP = 0; }
  return g;
}

function spawnFly(x, y, opts = {}) {
  if (!opts.force && !canAddAdult()) return null;
  const perched = opts.perch || null;
  const f = {
    id: nextId++,
    x: perched ? iconPad(perched).x : x,
    y: perched ? iconPad(perched).y : y,
    vx: 0,
    vy: 0,
    heading: rand(0, Math.PI * 2),
    visHead: rand(0, Math.PI * 2),
    state: perched ? 'perch' : 'fly',
    hunger: rand(0.2, 0.4),
    energy: perched ? 0.4 : 1,
    restUntil: 0,
    stillUntil: perched ? performance.now() + rand(300, 6000) : 0,
    perch: perched,
    target: null,
    mission: perched ? 'rest' : 'land',
    settleUntil: perched ? performance.now() + 2500 : 0,
    ignoreThreatUntil: 0,
    scareUntil: 0,
    nextTurn: 0,
    fleeSpeed: 0,
    intensity: 0,
    seed: rand(0, 1000),
    scale: rand(0.95, 1.2),
    turn: (Math.random() < 0.5 ? 1 : -1),
    crawling: false,
    crawlFrom: null,
    crawlTo: null,
    crawlT: 0,
    crawlDur: 0.3,
    fed: false,
    eatAcc: 0,
    mateId: 0,
    mateUntil: 0,
    mateRole: 0,
    mateSeek: 0,
    meal: 0,
    eatingFood: 0,
    eatTimer: 0,
    skipFood: 0,
    born: performance.now(),
    ripe: false,
    needMeal: true,
    eatUnits: 0,
    mealDoneAt: 0,
    mates: 0,
    sex: opts.sex || (Math.random() < 0.5 ? 'm' : 'f'),
    geneD: opts.geneD == null ? 1 : opts.geneD,
    geneP: opts.geneP == null ? 1 : opts.geneP,
    geneG: opts.geneG == null ? 0 : opts.geneG,
    geneX: opts.geneX == null ? 0 : opts.geneX,
    geneY: opts.geneY == null ? 0 : opts.geneY,
  };
  if (perched) {
    const p = clampToGlyph(perched, f.x + rand(-10, 10), f.y + rand(-8, 8));
    f.x = p.x;
    f.y = p.y;
  }
  flies.push(f);
  return f;
}

function spawnFromEdge(n, opts = {}) {
  const s = screens[0] || { x: 0, y: 0, w: W, h: H };
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = s.x + 12; y = rand(s.y + 40, s.y + s.h - 40); }
  else if (side === 1) { x = s.x + s.w - 12; y = rand(s.y + 40, s.y + s.h - 40); }
  else if (side === 2) { x = rand(s.x + 40, s.x + s.w - 40); y = s.y + 12; }
  else { x = rand(s.x + 40, s.x + s.w - 40); y = s.y + s.h - 12; }
  const genes = genesFor(opts.morph);
  let placed = false;
  for (let i = 0; i < n; i++) {
    const sex = opts.sex || (n >= 2 && i === 0 ? 'm' : n >= 2 && i === 1 ? 'f' : undefined);
    const f = spawnFly(x + i * 24, y + i * 10, {
      sex,
      geneD: genes.geneD,
      geneP: genes.geneP,
      geneG: opts.geneG == null ? genes.geneG : opts.geneG,
      geneX: opts.geneX == null ? genes.geneX : opts.geneX,
      geneY: opts.geneY == null ? genes.geneY : opts.geneY,
    });
    if (f) {
      placed = true;
      f.state = 'flee';
      f.mission = 'flee';
      f.fleePhase = 'straight';
      f.scareUntil = performance.now() + (fast ? rand(200, 500) : rand(4000, 16000));
      f.fleeSpeed = rand(360, 560);
      f.heading = rand(0, Math.PI * 2);
    }
  }
  if (placed && opts.morph === 'rainbow') playRainbowFanfare(performance.now(), true);
}

function makeCrumb(ic) {
  const lumps = 2 + Math.floor(Math.random() * 3);
  const bits = [];
  for (let i = 0; i < lumps; i++) {
    bits.push({
      ox: rand(-7, 7),
      oy: rand(-5, 6),
      rx: rand(1.4, 3.2),
      ry: rand(1.0, 2.4),
      rot: rand(0, Math.PI),
      hue: rand(38, 48),
      light: rand(62, 78),
    });
  }
  return {
    id: nextId++,
    iconId: ic.id,
    x: ic.x + ic.w * 0.55 + rand(-8, 8),
    y: ic.y + ic.h * 0.42 + rand(-6, 10),
    bits,
    amount: 1,
    eaters: [],
    supply: FOOD_SUPPLY,
    infinite: false,
    attract: 1,
  };
}

function foodSlots(food) {
  return food && food.infinite ? BIN_SLOTS : FOOD_SLOTS;
}

function recentlyLaunched(ic) {
  return ic.lastLaunch && (Date.now() - ic.lastLaunch) < LAUNCH_MS;
}

function foodScore(ic, from) {
  const f = foods.find((x) => x.iconId === ic.id && foodOpen(x));
  if (!f || !from) return 0;
  const c = iconPad(ic);
  return Math.hypot(c.x - from.x, c.y - from.y) / (f.attract || 1);
}

function syncBinFood() {
  const bin = icons.find((ic) => ic.recycleBin);
  for (const f of foods) {
    if (f.infinite && !(bin && f.iconId === bin.id)) {
      for (const id of f.eaters || []) {
        const u = unitById(id);
        if (u) u.eatingFood = 0;
      }
    }
  }
  foods = foods.filter((f) => !f.infinite || (bin && f.iconId === bin.id));
  if (!bin) return;
  const x = bin.x + bin.w * 0.5;
  const y = bin.y + bin.h * 0.45;
  let f = foods.find((x) => x.infinite && x.iconId === bin.id);
  if (!f) {
    foods.push({
      id: nextId++,
      iconId: bin.id,
      x,
      y,
      bits: [],
      amount: 1,
      eaters: [],
      supply: 1,
      infinite: true,
      attract: 2,
    });
  } else {
    f.x = x;
    f.y = y;
  }
  for (const ic of icons) ic.nearBin = false;
  const cx = bin.x + bin.w / 2;
  const cy = bin.y + bin.h / 2;
  const ranked = [];
  for (const ic of icons) {
    if (ic.id === bin.id) continue;
    ranked.push({
      ic,
      d: Math.hypot(ic.x + ic.w / 2 - cx, ic.y + ic.h / 2 - cy),
    });
  }
  ranked.sort((a, b) => a.d - b.d);
  for (const o of ranked.slice(0, 4)) o.ic.nearBin = true;
}

function spawnWeight(ic) {
  if (ic.recycleBin) return 0;
  if (recentlyLaunched(ic)) return 0;
  if (ic.nearBin) {
    const n = foods.filter((f) => !f.infinite && icons.some((i) => i.id === f.iconId && i.nearBin)).length;
    if (n >= 2) return 0;
    return 3;
  }
  return 2;
}

function inBinRadius(x, y) {
  const here = currentCell(x, y);
  if (here && (here.recycleBin || here.nearBin)) return true;
  const n = nearestIconTo(x, y);
  if (!n || !(n.recycleBin || n.nearBin)) return false;
  const c = iconPad(n);
  return Math.hypot(c.x - x, c.y - y) < 70;
}

function seekFoodIcon(from) {
  const inZ = from && inBinRadius(from.x, from.y);
  const binF = foods.find((f) => f.infinite);
  if (inZ && binF && foodOpen(binF)) {
    return icons.find((i) => i.id === binF.iconId) || null;
  }
  if (!inZ) return null;
  const ring = [];
  for (const ic of icons) {
    if (!ic.nearBin) continue;
    const f = foods.find((x) => x.iconId === ic.id && !x.infinite && foodOpen(x));
    if (f) ring.push(ic);
  }
  if (ring.length) {
    if (!from) return ring[0];
    ring.sort((a, b) => {
      const da = Math.hypot(iconPad(a).x - from.x, iconPad(a).y - from.y);
      const db = Math.hypot(iconPad(b).x - from.x, iconPad(b).y - from.y);
      return da - db;
    });
    return ring[0];
  }
  return null;
}

function seekFoodPoint(x, y, skipId) {
  if (inBinRadius(x, y)) {
    const bin = foods.find((f) => f.infinite && f.id !== skipId);
    if (bin && foodOpen(bin)) return bin;
    let best = null;
    let bd = 1e9;
    for (const f of foods) {
      if (f.infinite || (skipId && f.id === skipId) || !foodOpen(f)) continue;
      const ic = icons.find((i) => i.id === f.iconId);
      if (!ic || !ic.nearBin) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    if (best) return best;
  }
  return nearestFood(x, y, skipId);
}

function spawnFood() {
  if (grabbing) return;
  const crumbs = foods.filter((f) => !f.infinite);
  if (!icons.length || crumbs.length >= MAX_FOOD) return;
  const used = new Set(foods.map((f) => f.iconId));
  const weighted = [];
  for (const ic of icons) {
    if (used.has(ic.id)) continue;
    const w = spawnWeight(ic);
    for (let i = 0; i < w; i++) weighted.push(ic);
  }
  if (!weighted.length) return;
  const ic = weighted[Math.floor(Math.random() * weighted.length)];
  foods.push(makeCrumb(ic));
}

function boot() {
  if (booted || holdBoot) return;
  booted = true;
  const a = pickIcon(false);
  const b = pickIcon(false, null, a && a.id);
  if (a) {
    const f = spawnFly(0, 0, { perch: a, sex: 'm', geneD: 1, geneP: 1, geneG: 1 });
    if (f) f.needMeal = false;
  } else spawnFromEdge(1, { sex: 'm', geneG: 1 });
  if (b) {
    const f = spawnFly(0, 0, { perch: b, sex: 'f', geneD: 1, geneP: 1, geneG: 1 });
    if (f) f.needMeal = false;
  } else spawnFromEdge(1, { sex: 'f', geneG: 1 });
  spawnFood();
  spawnFood();
  spawnFood();
}

function mouseRel(fly) {
  const p = dangerPos();
  const dx = fly.x - p.x;
  const dy = fly.y - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  const closing = -(mouse.vx * dx + mouse.vy * dy) / dist;
  return { dist, closing, dx, dy, nx: dx / dist, ny: dy / dist };
}

// Closer → higher chance and stronger reaction. Far away almost ignored.
// Sitting flies only care when the cursor is almost on them.
function threat(fly, now) {
  const { dist } = mouseRel(fly);
  if (fly.state === 'flee') return { p: 0, intensity: 0, dist };
  if (now < (fly.settleUntil || 0)) return { p: 0, intensity: 0, dist };
  if (fly.mateSeek && dist > 40) return { p: 0, intensity: 0, dist };
  const r = senseRadius(fly);
  if (dist > r) return { p: 0, intensity: 0, dist };
  const intensity = clamp(1 - dist / r, 0.4, 1);
  return { p: 1, intensity, dist };
}

function interruptEat(unit) {
  if (!unit) return;
  if (unit.eatingFood) {
    leaveFood(foods.find((f) => f.id === unit.eatingFood), unit.id);
    unit.eatingFood = 0;
  }
  unit.eatStamp = 0;
  unit.eatBegan = 0;
  unit.eatAcc = 0;
}

function scare(fly, now, intensity) {
  interruptEat(fly);
  const t = clamp(intensity, 0.25, 1);
  if (fly.state === 'mate') {
    const other = flies.find((x) => x.id === fly.mateId);
    fly.mateId = 0;
    fly.mateUntil = 0;
    if (other && other.state === 'mate') {
      other.mateId = 0;
      other.mateUntil = 0;
      other.state = 'flee';
    }
  }
  fly.state = 'flee';
  fly.mission = 'flee';
  fly.perch = null;
  fly.target = null;
  fly.crawling = false;
  fly.ci = null;
  fly.mateSeek = 0;
  const linked = flies.find((x) => x.mateSeek === fly.id);
  if (linked) linked.mateSeek = 0;
  fly.intensity = t;
  fly.fleeSpeed = 360 + t * 480;
  fly.scareUntil = now + (4000 + t * 12000);
  fly.settleUntil = 0;
  fly.fleePhase = 'straight';
  fly.quietSince = 0;
  fly.landAfter = 0;
  fly.safeSince = 0;
  fly.afterSafe = null;
  fly.nextTurn = now + rand(80, 220);
  fly.turn = Math.random() < 0.5 ? 1 : -1;
  const { nx, ny, dist } = mouseRel(fly);
  fly.heading = Math.atan2(ny, nx);
  fly.lastSenseDist = 1e9;
  armBoosts(fly, now, dist, senseRadius(fly));
  fly.vx = Math.cos(fly.heading) * fly.fleeSpeed;
  fly.vy = Math.sin(fly.heading) * fly.fleeSpeed;
}

function armBoosts(fly, now, dist, r) {
  const prev = fly.lastSenseDist == null ? 1e9 : fly.lastSenseDist;
  if (dist < r && prev >= r) fly.boost2Until = now + rand(4000, 6000);
  if (dist < r * 0.5 && prev >= r * 0.5) fly.boost4Until = now + rand(4000, 6000);
  if (dist < r * 0.2 && prev >= r * 0.2) fly.boost8Until = now + rand(300, 500);
  fly.lastSenseDist = dist;
}

function fleeMul(fly, now) {
  if (now < (fly.boost8Until || 0)) return 8;
  if (now < (fly.boost4Until || 0)) return 3;
  if (now < (fly.boost2Until || 0)) return 2;
  return 1;
}

function canLand(fly, now) {
  const rel = mouseRel(fly);
  const r = 72;
  if (rel.dist <= r) {
    fly.quietSince = 0;
    fly.landAfter = 0;
    return false;
  }
  if (!fly.quietSince) {
    fly.quietSince = now;
    fly.landAfter = now + rand(600, 1600);
    return false;
  }
  return now >= fly.landAfter;
}

function scareAll(now) {
  for (const f of flies) scare(f, now, 1);
}

function iconHasFood(ic, skipId) {
  if (!ic) return false;
  const pad = iconPad(ic);
  return foods.some((f) => {
    if (skipId && f.id === skipId) return false;
    const on = f.iconId === ic.id || Math.hypot(f.x - pad.x, f.y - pad.y) < 52;
    return on && (foodOpen(f) || (f.eaters || []).length);
  });
}

function markIconStay(fly, now) {
  if (iconHasFood(fly.perch, fly.skipFood)) fly.leaveAt = 0;
  else fly.leaveAt = now + rand(1000, 5000);
}

function forceLand(fly, ic, now) {
  if (!ic) return;
  const p = clampToGlyph(ic, fly.x, fly.y);
  fly.state = 'perch';
  fly.mission = 'rest';
  fly.perch = ic;
  fly.target = ic;
  fly.x = p.x;
  fly.y = p.y;
  fly.vx = 0;
  fly.vy = 0;
  fly.crawling = false;
  fly._ix = ic.x;
  fly._iy = ic.y;
  markIconStay(fly, now);
}

function landOn(fly, ic, now) {
  if (!ic) return;
  const p = clampToGlyph(ic, fly.x, fly.y);
  const close = Math.hypot(p.x - fly.x, p.y - fly.y) < 48;
  const mouseOk = mouseRel(fly).dist > 56;
  if (!close) {
    fly.state = 'fly';
    fly.mission = 'land';
    fly.target = ic;
    return;
  }
  if (!canLand(fly, now) && !mouseOk) {
    fly.state = 'fly';
    fly.mission = 'land';
    fly.target = ic;
    return;
  }
  fly.state = 'perch';
  fly.mission = 'rest';
  fly.perch = ic;
  fly.target = null;
  fly.vx = 0;
  fly.vy = 0;
  fly.crawling = false;
  fly.ci = null;
  fly.x = p.x;
  fly.y = p.y;
  fly._ix = ic.x;
  fly._iy = ic.y;
  fly.stillUntil = now + rand(300, 6000);
  fly.settleUntil = now + 1800;
  markIconStay(fly, now);
}

function startHop(fly, now) {
  if (!fly.perch) return;
  const len = bodyPx(fly) * rand(1, 2);
  const ang = rand(0, Math.PI * 2);
  const to = clampToGlyph(
    fly.perch,
    fly.x + Math.cos(ang) * len,
    fly.y + Math.sin(ang) * len,
  );
  const dist = Math.hypot(to.x - fly.x, to.y - fly.y);
  fly.crawling = true;
  fly.crawlFrom = { x: fly.x, y: fly.y };
  fly.crawlTo = to;
  fly.crawlT = 0;
  fly.crawlDur = clamp(0.12 + dist / 90, 0.12, 0.28);
  fly.heading = Math.atan2(to.y - fly.y, to.x - fly.x);
  fly.stillUntil = now + rand(300, 6000);
}

function wrapScreen(fly) {
  if (fly.state === 'perch' || fly.state === 'eat') return;
  if (!screens.length) return;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const s of screens) {
    x0 = Math.min(x0, s.x);
    x1 = Math.max(x1, s.x + s.w);
  }
  const vw = x1 - x0;
  if (fly.x < x0) fly.x += vw;
  else if (fly.x >= x1) fly.x -= vw;
  const s = screenOf(fly.x, fly.y) || nearestScreen(fly.x, fly.y);
  if (fly.y < s.y) fly.y += s.h;
  else if (fly.y >= s.y + s.h) fly.y -= s.h;
}

function wanderHeading(fly, dt, now, toward) {
  if (now > (fly.nextTurn || 0)) {
    fly.nextTurn = now + rand(300, 1000);
    if (toward) {
      const want = Math.atan2(toward.y - fly.y, toward.x - fly.x);
      fly.course = want + rand(-2.1, 2.1);
    } else {
      fly.course = fly.heading + rand(-2.6, 2.6);
    }
    fly.burstMul = 1 + rand(0.2, 0.5);
    fly.burstUntil = now + rand(200, 300);
  }
  if (fly.course == null) fly.course = fly.heading;
  let diff = fly.course - fly.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  fly.heading += diff * Math.min(1, dt * 7);
  fly.heading += Math.sin(now * 0.007 + fly.seed) * 0.8 * dt;
}

function stepFly(fly, dt, now) {
  if (fly.state === 'dead') return;
  if (!fly.born) fly.born = now;
  if (fly.mateCool && now < fly.mateCool) fly.ripe = false;
  else if (!fly.needMeal) {
    if (!fly.ripe && now - fly.born >= ripeMs()) fly.ripe = true;
  } else if ((fly.eatUnits || 0) >= eatNeedFor(fly)) {
    if (!fly.mealDoneAt) fly.mealDoneAt = now;
    if (!fly.ripe && now - fly.mealDoneAt >= ripeMs()) fly.ripe = true;
  }

  if (fly.state === 'mate') {
    const p = dangerPos();
    if (Math.hypot(fly.x - p.x, fly.y - p.y) < 140) {
      failMate(fly, now);
      return;
    }
    if (now >= fly.mateUntil) {
      finishMate(fly, now);
      return;
    }
    fly.vx = 0;
    fly.vy = 0;
    return;
  }

  if (fly.dieAt) {
    if (now >= fly.dieAt) {
      corpses.push({
        x: fly.x,
        y: fly.y,
        heading: fly.visHead || fly.heading || 0,
        seed: fly.seed,
        scale: fly.scale || 1,
        sex: fly.sex,
        geneD: fly.geneD,
        geneP: fly.geneP,
        geneG: fly.geneG,
        geneX: fly.geneX,
        geneY: fly.geneY,
      });
      fly.state = 'dead';
      return;
    }
    wanderHeading(fly, dt, now);
    fly.vx = Math.cos(fly.heading) * 300;
    fly.vy = Math.sin(fly.heading) * 300;
    fly.x += fly.vx * dt;
    fly.y += fly.vy * dt;
    wrapScreen(fly);
    return;
  }

  const th = threat(fly, now);
  if (fly.state !== 'flee' && th.p > 0) {
    scare(fly, now, th.intensity);
  }

  fly.hunger = Math.min(1, (fly.hunger || 0) + dt * 0.028);
  if (fly.state === 'eat') fly.hunger = Math.max(0, fly.hunger - dt * 0.3);

  if (fly.state === 'flee') {
    const rel = mouseRel(fly);
    const r = senseRadius(fly);
    if (rel.dist <= r) {
      fly.safeSince = 0;
      fly.afterSafe = null;
    } else if (!fly.safeSince) {
      fly.safeSince = now;
    }
    if (fly.safeSince && now - fly.safeSince >= 3000) {
      fly.state = 'fly';
      if (Math.random() < 0.5) {
        fly.mission = 'cruise';
        fly.cruiseUntil = now + rand(1000, 3000);
        fly.target = null;
      } else {
        fly.mission = fly.hunger > 0.75 ? 'food' : 'land';
        fly.target = (fly.mission === 'food' ? pickIcon(true, fly) : nearestIconTo(fly.x, fly.y)) || randomIcon();
      }
    } else {
      if (fly.fleePhase !== 'random' && rel.dist > r) {
        fly.fleePhase = 'random';
        fly.nextTurn = now;
      }
      if (fly.fleePhase === 'straight') {
        fly.heading = Math.atan2(rel.ny, rel.nx);
      } else {
        wanderHeading(fly, dt, now);
      }
      const spd = fly.fleeSpeed * (0.85 + 0.2 * Math.sin(now * 0.008 + fly.seed));
      armBoosts(fly, now, rel.dist, r);
      const mul = fleeMul(fly, now);
      fly.vx = Math.cos(fly.heading) * spd * mul;
      fly.vy = Math.sin(fly.heading) * spd * mul;
    }
  } else if (fly.state === 'perch' || fly.state === 'eat') {
    fly.vx = 0;
    fly.vy = 0;
    if (fly.perch) {
      const still = icons.find((i) => i.id === fly.perch.id)
        || icons.find((i) => i.name === fly.perch.name);
      if (still) fly.perch = still;
      if (!fly.crawling) {
        if (fly._ix != null) {
          const dx = fly.perch.x - fly._ix;
          const dy = fly.perch.y - fly._iy;
          if (Math.hypot(dx, dy) < 40) {
            fly.x += dx;
            fly.y += dy;
          }
        }
        const held = clampToGlyph(fly.perch, fly.x, fly.y);
        fly.x = held.x;
        fly.y = held.y;
        fly._ix = fly.perch.x;
        fly._iy = fly.perch.y;
      }
    }

    if (fly.ripe && fly.mateSeek) {
      const p = flies.find((x) => x.id === fly.mateSeek);
      if (p && (p.state === 'perch' || p.state === 'eat') && Math.hypot(p.x - fly.x, p.y - fly.y) < 90) {
        startMate(fly, p, now);
        return;
      }
    } else if (fly.ripe && !fly.mateSeek) {
      const other = flies.find((o) => o.ripe && o.id !== fly.id && o.sex !== fly.sex && !o.mateSeek && o.state !== 'dead' && o.state !== 'mate');
      if (other) {
        beginPair(fly, other, now);
        return;
      }
    }

    if (fly.perch) {
      const pad = iconPad(fly.perch);
      const food = foods.find((f) => {
        if (f.id === fly.skipFood) return false;
        const onIcon = f.iconId === fly.perch.id
          || Math.hypot(f.x - pad.x, f.y - pad.y) < 52;
        if (!onIcon) return false;
        return foodOpen(f) || (f.eaters || []).includes(fly.id);
      });
      if (food && joinFood(food, fly.id)) {
        fly.eatingFood = food.id;
        fly.state = 'eat';
        fly.leaveAt = 0;
        if (fly.needMeal) {
          fly.eatUnits = (fly.eatUnits || 0) + dt;
          if (fly.eatUnits >= eatNeedFor(fly) && !fly.mealDoneAt) fly.mealDoneAt = now;
        }
      } else if (fly.hunger > 0.75) {
        const ic = pickIcon(true, fly, fly.perch && fly.perch.id);
        if (ic) {
          interruptEat(fly);
          fly.state = 'fly';
          fly.mission = 'food';
          fly.target = ic;
          fly.perch = null;
          return;
        }
      }
    }

    if (fly.crawling && fly.crawlTo) {
      fly.crawlT += dt / fly.crawlDur;
      const t = clamp(fly.crawlT, 0, 1);
      const e = t * t * (3 - 2 * t);
      fly.x = fly.crawlFrom.x + (fly.crawlTo.x - fly.crawlFrom.x) * e;
      fly.y = fly.crawlFrom.y + (fly.crawlTo.y - fly.crawlFrom.y) * e;
      if (t >= 1) fly.crawling = false;
    } else if (now > (fly.stillUntil || 0)) {
      startHop(fly, now);
    }

    if (fly.perch && !fly.mateSeek && !fly.eatingFood && fly.leaveAt && now >= fly.leaveAt) {
      interruptEat(fly);
      fly.state = 'fly';
      fly.mission = fly.hunger > 0.45 ? 'food' : 'land';
      fly.target = pickIcon(fly.mission === 'food', fly, fly.perch.id) || randomIcon();
      fly.takeoffUntil = now + 400;
      fly.perch = null;
      return;
    }
  } else {
    if (fly.mission === 'food' && !fly.mateSeek && !fly.dieAt) {
      const near = foodInRing(fly.x, fly.y, fly.skipFood);
      if (near) {
        const ic = icons.find((i) => i.id === near.iconId) || nearestIconTo(near.x, near.y);
        if (ic && onFood(fly.x, fly.y, near, bodyPx(fly) * 0.45)) {
          forceLand(fly, ic, now);
          return;
        }
        if (ic) fly.target = ic;
      }
    }
    if (now < (fly.takeoffUntil || 0)) {
      if (Math.hypot(fly.vx, fly.vy) < 30) {
        fly.vx = Math.cos(fly.heading || 0) * 320;
        fly.vy = Math.sin(fly.heading || 0) * 320;
      }
    } else if (fly.mission === 'cruise') {
      wanderHeading(fly, dt, now);
      fly.vx = Math.cos(fly.heading) * 280;
      fly.vy = Math.sin(fly.heading) * 280;
      if (now >= (fly.cruiseUntil || 0)) {
        fly.mission = fly.hunger > 0.75 ? 'food' : 'land';
        fly.target = (fly.mission === 'food' ? pickIcon(true, fly) : nearestIconTo(fly.x, fly.y)) || randomIcon();
      }
    } else if (fly.mission === 'meet' && fly.mateSeek) {
      const p = flies.find((x) => x.id === fly.mateSeek);
      if (p) {
        const want = Math.atan2(p.y - fly.y, p.x - fly.x);
        let diff = want - fly.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        fly.heading += diff * Math.min(1, dt * 8);
        fly.vx = Math.cos(fly.heading) * 420;
        fly.vy = Math.sin(fly.heading) * 420;
      }
    } else if (fly.mission === 'seekMate' && fly.ripe && !fly.mateSeek) {
      const other = flies.find((o) => o.ripe && o.id !== fly.id && o.sex !== fly.sex && !o.mateSeek && o.state !== 'dead' && o.state !== 'mate');
      if (other) beginPair(fly, other, now);
      else {
        fly.mission = 'land';
        fly.target = nearestIconTo(fly.x, fly.y);
      }
    } else if (!fly.target || !icons.some((i) => i.id === fly.target.id)) {
      if (fly.mateSeek) {
        fly.target = (fly.target && icons.find((i) => i.name === fly.target.name)) || randomIcon();
      } else {
        fly.target = fly.mission === 'food'
          ? (pickIcon(true, fly) || nearestIconTo(fly.x, fly.y))
          : nearestIconTo(fly.x, fly.y);
      }
    }
    if (fly.mission !== 'seekMate' && fly.mission !== 'meet' && fly.target) {
      const c = iconPad(fly.target);
      const dx = c.x - fly.x;
      const dy = c.y - fly.y;
      const d = Math.hypot(dx, dy) || 1;
      const cruise = 380;
      if (d < 50 && (fly.mateSeek || fly.mission === 'food')) {
        forceLand(fly, fly.target, now);
      } else if (d < 40) {
        landOn(fly, fly.target, now);
      } else if (d < 70 && canLand(fly, now)) {
        const want = Math.atan2(dy, dx);
        let diff = want - fly.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        fly.heading += diff * Math.min(1, dt * 6);
        fly.vx = Math.cos(fly.heading) * cruise;
        fly.vy = Math.sin(fly.heading) * cruise;
      } else {
        wanderHeading(fly, dt, now, c);
        fly.vx = Math.cos(fly.heading) * cruise;
        fly.vy = Math.sin(fly.heading) * cruise;
      }
    } else if (fly.mission !== 'seekMate' && fly.mission !== 'meet' && fly.mission !== 'cruise') {
      wanderHeading(fly, dt, now);
      fly.vx = Math.cos(fly.heading) * 280;
      fly.vy = Math.sin(fly.heading) * 280;
    }
  }

  if (fly.state === 'perch' || fly.state === 'eat' || fly.state === 'mate') {
    fly.airSince = 0;
  } else if (!fly.dieAt && fly.mission !== 'meet' && !fly.mateSeek) {
    if (!fly.airSince) fly.airSince = now;
    if (now - fly.airSince >= AIR_MAX_MS) {
      const ic = nearestIconTo(fly.x, fly.y) || randomIcon();
      if (ic) {
        forceLand(fly, ic, now);
        fly.settleUntil = now + 2500;
        fly.airSince = 0;
      }
    }
  }

  if (fly.state !== 'perch' && fly.state !== 'eat') {
    if (now < (fly.burstUntil || 0)) {
      const b = fly.burstMul || 1;
      fly.vx *= b;
      fly.vy *= b;
    }
    fly.x += fly.vx * dt;
    fly.y += fly.vy * dt;
    wrapScreen(fly);
  }

  const spd = Math.hypot(fly.vx, fly.vy);
  if (spd > 6 || fly.crawling) {
    let dh = fly.heading - fly.visHead;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    fly.visHead += dh * Math.min(1, dt * 10);
  }
}

function musicSrc(file) {
  return new URL(`../assets/${file}`, location.href).href;
}

function makeAud(file) {
  const a = new Audio(musicSrc(file));
  a.preload = 'auto';
  a.addEventListener('error', () => {
    a.src = `file:///C:/Users/pyz/Desktop/${file}`;
  }, { once: true });
  return a;
}

const audSwatter = makeAud('拍子音乐.mp3');
const audRag = makeAud('抹布音乐.mp3');
const audKill = makeAud('击杀成虫音乐.mp3');
const audRainbow = makeAud('彩色果蝇出现音乐.mp3');
audSwatter.loop = true;
audRag.loop = true;
audKill.loop = false;
audRainbow.loop = false;

let killPlaying = false;
let swatterResumeAt = 0;

function stopAud(a) {
  a.pause();
  try { a.currentTime = 0; } catch { /* not ready */ }
}

function playLoop(a) {
  a.loop = true;
  try { a.currentTime = 0; } catch { /* */ }
  a.play().catch(() => {});
}

function stopSwatterMusic() {
  killPlaying = false;
  stopAud(audKill);
  stopAud(audSwatter);
}

function stopRagMusic() {
  stopAud(audRag);
}

function playSwatterGrab() {
  stopRagMusic();
  stopAud(audKill);
  killPlaying = false;
  playLoop(audSwatter);
}

function playRagGrab() {
  stopSwatterMusic();
  playLoop(audRag);
}

function playKillMusic() {
  if (!swatterOn) return;
  if (!killPlaying) swatterResumeAt = audSwatter.currentTime || 0;
  killPlaying = true;
  audSwatter.pause();
  stopAud(audRag);
  try { audKill.currentTime = 0; } catch { /* */ }
  audKill.play().catch(() => {});
}

function raiseFanfare(on) {
  if (on === fanfareRaised) return;
  fanfareRaised = on;
  window.fly?.fanfare?.(on);
}

function playRainbowFanfare(now, force) {
  if (rainbowSeen && !force) return;
  rainbowSeen = true;
  fanfareUntil = now + 8000;
  raiseFanfare(true);
  try { audRainbow.currentTime = 0; } catch { /* */ }
  audRainbow.play().catch(() => {});
}

function tickFanfare(now) {
  if (fanfareUntil && now >= fanfareUntil) {
    fanfareUntil = 0;
    raiseFanfare(false);
  }
}

audKill.addEventListener('ended', () => {
  if (!killPlaying) return;
  killPlaying = false;
  if (!swatterOn) return;
  try { audSwatter.currentTime = swatterResumeAt; } catch { /* */ }
  audSwatter.loop = true;
  audSwatter.play().catch(() => {});
});

function killFly(fly, now) {
  fly.state = 'dead';
  addSplat(fly.x, fly.y, now, fly.seed, 1);
  playKillMusic();
}

function addSplat(x, y, now, seed, scale) {
  splats.push({ x, y, t: now, seed: seed || rand(0, 10), scale: scale || 1 });
}

function beginPair(a, b, now) {
  if (!a || !b || a.id === b.id || a.sex === b.sex) return;
  if (a.mateSeek || b.mateSeek) return;
  a.mateSeek = b.id;
  b.mateSeek = a.id;
  const first = !a.needMeal && !b.needMeal;
  const ic = first ? null : randomIcon();
  const go = (f) => {
    interruptEat(f);
    f.state = 'fly';
    f.perch = null;
    if (first || !ic) {
      f.mission = 'meet';
      f.target = null;
    } else {
      f.mission = 'land';
      f.target = ic;
    }
  };
  go(a);
  go(b);
}

function tryPairAll(now) {
  const ready = [];
  for (const f of flies) {
    if (f.ripe && !f.mateSeek && f.state !== 'dead' && f.state !== 'mate' && !f.dieAt && !(f.mateCool && now < f.mateCool)) ready.push(f);
  }
  const males = ready.filter((f) => f.sex === 'm');
  const females = ready.filter((f) => f.sex === 'f');
  const n = Math.min(males.length, females.length);
  for (let i = 0; i < n; i++) beginPair(males[i], females[i], now);
}

function closePairs(now) {
  for (const f of flies) {
    if (!f.mateSeek || f.state === 'dead' || f.state === 'mate') continue;
    const p = flies.find((x) => x.id === f.mateSeek);
    if (!p || p.state === 'dead' || p.state === 'mate') continue;
    const ic = f.target;
    if (ic) {
      const c = iconPad(ic);
      if (Math.hypot(f.x - c.x, f.y - c.y) < 90) forceLand(f, ic, now);
      if (Math.hypot(p.x - c.x, p.y - c.y) < 90) forceLand(p, ic, now);
    }
    if (Math.hypot(f.x - p.x, f.y - p.y) < 80) startMate(f, p, now);
  }
}

function failMate(fly, now) {
  const other = flies.find((x) => x.id === fly.mateId || x.id === fly.mateSeek);
  const fail = (f) => {
    if (!f || f.state === 'dead') return;
    f.state = 'flee';
    f.mission = 'flee';
    f.fleePhase = 'straight';
    f.fleeSpeed = 420;
    f.mateId = 0;
    f.mateUntil = 0;
    f.mateSeek = 0;
    f.ripe = false;
    f.mateCool = now + 8000;
    f.perch = null;
    f.target = null;
    const ang = rand(0, Math.PI * 2);
    f.heading = ang;
    f.vx = Math.cos(ang) * 420;
    f.vy = Math.sin(ang) * 420;
  };
  fail(fly);
  if (other) fail(other);
}

function startMate(a, b, now) {
  if (!a || !b || a.sex === b.sex) return;
  if (a.state === 'mate' || b.state === 'mate') return;
  const x = (a.x + b.x) * 0.5;
  const y = (a.y + b.y) * 0.5;
  a.x = x;
  a.y = y;
  b.x = x + 7;
  b.y = y - 4;
  a.state = 'mate';
  b.state = 'mate';
  a.mateId = b.id;
  b.mateId = a.id;
  a.mateUntil = now + mateMs();
  b.mateUntil = now + mateMs();
  a.mateRole = 0;
  b.mateRole = 1;
  a.vx = a.vy = b.vx = b.vy = 0;
  a.crawling = b.crawling = false;
}

function finishMate(fly, now) {
  const other = flies.find((x) => x.id === fly.mateId);
  if (other && !adultsFull()) layEggs(fly.x, fly.y, fly, other);
  const reset = (f) => {
    f.mates = (f.mates || 0) + 1;
    f.ripe = false;
    f.born = now;
    f.needMeal = true;
    f.eatUnits = 0;
    f.mealDoneAt = 0;
    f.mateId = 0;
    f.mateUntil = 0;
    f.mateSeek = 0;
    if (f.mates >= 2) {
      const ang = rand(0, Math.PI * 2);
      f.dieAt = now + 5000;
      f.state = 'fly';
      f.mission = 'dying';
      f.perch = null;
      f.target = null;
      f.ripe = false;
      f.heading = ang;
      f.vx = Math.cos(ang) * 380;
      f.vy = Math.sin(ang) * 380;
      f.takeoffUntil = now + 350;
      return;
    }
    const ic = nearestIconTo(f.x, f.y) || randomIcon();
    if (ic) forceLand(f, ic, now);
    else {
      f.state = 'fly';
      f.mission = 'food';
    }
    f.stillUntil = now + rand(400, 2000);
  };
  reset(fly);
  if (other && other.state === 'mate') reset(other);
}

function layEggs(x, y, mom, dad) {
  const want = breed ? 2 + Math.floor(Math.random() * 2) : 6 + Math.floor(Math.random() * 3);
  const room = breed ? Math.max(0, BREED_EGGS - eggs.length) : want;
  const n = Math.min(want, room);
  for (let i = 0; i < n; i++) {
    const geneD = inheritGene(mom && mom.geneD, dad && dad.geneD);
    const geneP = inheritGene(mom && mom.geneP, dad && dad.geneP);
    const geneG = inheritGene(mom && mom.geneG, dad && dad.geneG);
    const extra = (geneD >= 2 && geneP >= 2 && geneG >= 2) ? extraGenes(mom, dad) : { geneX: 0, geneY: 0 };
    eggs.push({
      x: x + rand(-12, 12),
      y: y + rand(-10, 10),
      rot: rand(0, Math.PI),
      t: performance.now(),
      seed: rand(0, 80),
      geneD,
      geneP,
      geneG,
      geneX: extra.geneX,
      geneY: extra.geneY,
      sex: Math.random() < 0.5 ? 'm' : 'f',
    });
  }
}

function larvaLen(instar) {
  if (instar === 1) return ADULT_LEN / 3;
  if (instar === 2) return (ADULT_LEN * 2) / 3;
  return ADULT_LEN;
}

function hatchEgg(e, now) {
  larvae.push({
    id: nextId++,
    x: e.x,
    y: e.y,
    heading: rand(0, Math.PI * 2),
    instar: 1,
    eatTimer: 0,
    skipFood: 0,
    eatingFood: 0,
    eatUnits: 0,
    nextTurn: now,
    seed: e.seed,
    vx: 0,
    vy: 0,
    geneD: e.geneD,
    geneP: e.geneP,
    geneG: e.geneG,
    geneX: e.geneX || 0,
    geneY: e.geneY || 0,
    sex: e.sex,
  });
}

function pupaEachCell(x, y, rot, fn) {
  const c = Math.cos(rot || 0);
  const s = Math.sin(rot || 0);
  const pad = PUPA_RX + PUPA_CELL;
  const x0 = Math.floor((x - pad) / PUPA_CELL);
  const x1 = Math.ceil((x + pad) / PUPA_CELL);
  const y0 = Math.floor((y - pad) / PUPA_CELL);
  const y1 = Math.ceil((y + pad) / PUPA_CELL);
  const rx2 = PUPA_RX * PUPA_RX;
  const ry2 = PUPA_RY * PUPA_RY;
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const dx = ix * PUPA_CELL - x;
      const dy = iy * PUPA_CELL - y;
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      if ((lx * lx) / rx2 + (ly * ly) / ry2 <= 1) fn(ix, iy);
    }
  }
}

function pupaOccMap() {
  const map = new Map();
  const stamp = (p) => {
    pupaEachCell(p.x, p.y, p.rot, (ix, iy) => {
      const k = `${ix},${iy}`;
      map.set(k, (map.get(k) || 0) + 1);
    });
  };
  for (const p of pupae) stamp(p);
  for (const p of shells) stamp(p);
  return map;
}

function pupaHitsCap(x, y, rot, map) {
  let hit = false;
  pupaEachCell(x, y, rot, (ix, iy) => {
    if ((map.get(`${ix},${iy}`) || 0) >= PUPA_CAP) hit = true;
  });
  return hit;
}

function settlePupa(x, y, rot) {
  const map = pupaOccMap();
  const perp = (rot || 0) + Math.PI / 2;
  const jig = rand(-14, 14);
  const sx = x + Math.cos(perp) * jig;
  const sy = y + Math.sin(perp) * jig;
  if (!pupaHitsCap(sx, sy, rot, map)) return { x: sx, y: sy };
  const gold = Math.PI * (3 - Math.sqrt(5));
  const seed = rand(0, Math.PI * 2);
  const step = Math.max(12, PUPA_RX * 2.4);
  let best = null;
  let bd = 1e9;
  for (let i = 0; i < 48; i++) {
    const ang = seed + i * gold;
    const r = step * Math.sqrt(i + 1);
    const nx = sx + Math.cos(ang) * r;
    const ny = sy + Math.sin(ang) * r;
    if (pupaHitsCap(nx, ny, rot, map)) continue;
    if (r < bd) {
      bd = r;
      best = { x: nx, y: ny };
    }
  }
  if (best) return best;
  let least = Infinity;
  let pick = { x: sx, y: sy };
  for (let i = 0; i < 48; i++) {
    const ang = seed + i * gold;
    const r = step * Math.sqrt(i + 1);
    const nx = sx + Math.cos(ang) * r;
    const ny = sy + Math.sin(ang) * r;
    let over = 0;
    pupaEachCell(nx, ny, rot, (ix, iy) => {
      over += Math.max(0, (map.get(`${ix},${iy}`) || 0) + 1 - PUPA_CAP);
    });
    if (over < least) {
      least = over;
      pick = { x: nx, y: ny };
    }
  }
  return pick;
}

function pupate(L, now) {
  const at = settlePupa(L.x, L.y, L.heading);
  pupae.push({
    x: at.x,
    y: at.y,
    rot: L.heading,
    t: now,
    seed: L.seed,
    geneD: L.geneD,
    geneP: L.geneP,
    geneG: L.geneG,
    geneX: L.geneX || 0,
    geneY: L.geneY || 0,
    sex: L.sex,
  });
}

function eclose(p, now) {
  const f = spawnFly(p.x, p.y, { geneD: p.geneD, geneP: p.geneP, geneG: p.geneG, geneX: p.geneX, geneY: p.geneY, sex: p.sex });
  if (!f) return false;
  shells.push({ x: p.x, y: p.y, rot: p.rot, seed: p.seed });
  f.needMeal = true;
  f.state = 'fly';
  f.mission = 'food';
  f.heading = rand(0, Math.PI * 2);
  f.visHead = f.heading;
  f.vx = Math.cos(f.heading) * 320;
  f.vy = Math.sin(f.heading) * 320;
  f.takeoffUntil = now + 700;
  if (morphOf(f.geneD, f.geneP, f.geneG, f.geneX, f.geneY) === 'rainbow') playRainbowFanfare(now);
  return true;
}

function foodOpen(food) {
  return food && (food.eaters || []).length < foodSlots(food) && (food.infinite || (food.supply || 0) > 0);
}

function joinFood(food, uid) {
  if (!food.eaters) food.eaters = [];
  if (food.eaters.includes(uid)) return true;
  if (food.eaters.length >= foodSlots(food)) return false;
  food.eaters.push(uid);
  return true;
}

function leaveFood(food, uid) {
  if (!food || !food.eaters) return;
  food.eaters = food.eaters.filter((id) => id !== uid);
}

function unitById(uid) {
  return flies.find((f) => f.id === uid) || larvae.find((L) => L.id === uid) || null;
}

function resumeEatClock(unit, now) {
  if (!unit.eatBegan) unit.eatBegan = now - (unit.eatAcc || 0);
  unit.eatAcc = now - unit.eatBegan;
}

function pauseEatClock(unit, now) {
  if (unit.eatBegan) {
    unit.eatAcc = now - unit.eatBegan;
    unit.eatBegan = 0;
  }
}

function finishEat(unit, food, now) {
  unit.eatTimer = 0;
  unit.eatAcc = 0;
  unit.eatBegan = 0;
  unit.eatStamp = 0;
  unit.eatingFood = 0;
  leaveFood(food, unit.id);
  if (unit.instar) {
    unit.skipFood = food.id;
    if (unit.instar < 3) {
      unit.eatUnits = 0;
      unit.instar += 1;
    } else if (canPupate()) {
      unit.eatUnits = 0;
      pupate(unit, now);
      unit.dead = true;
    }
  } else {
    unit.state = 'perch';
    unit.mission = 'rest';
  }
}

function tickFoods(dt, now) {
  for (const food of foods.slice()) {
    const n = (food.eaters || []).length;
    if (n && !food.infinite) food.supply = (food.supply || 0) - n * dt;
    if (!food.infinite && food.supply <= 0) {
      for (const id of food.eaters || []) {
        const u = unitById(id);
        if (u) {
          pauseEatClock(u, now);
          u.eatingFood = 0;
        }
      }
      foods = foods.filter((f) => f.id !== food.id);
    }
  }
}

function nearestFood(x, y, skipId, raw) {
  let best = null;
  let bd = 1e9;
  for (const f of foods) {
    if (skipId && f.id === skipId) continue;
    if (!foodOpen(f)) continue;
    let d = Math.hypot(f.x - x, f.y - y);
    if (!raw) d /= (f.attract || 1);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function stepLarva(L, dt, now) {
  const len = larvaLen(L.instar);
  const here = L.eatingFood && foods.find((f) => f.id === L.eatingFood);
  if (here && onFood(L.x, L.y, here, Math.max(2, len * 0.2))) {
    L.vx = 0;
    L.vy = 0;
    L.eatUnits = (L.eatUnits || 0) + dt;
    if (L.eatUnits >= eatNeedFor(L)) {
      if (L.instar < 3 || canPupate()) finishEat(L, here, now);
    }
    return;
  }
  if (L.eatingFood) {
    leaveFood(foods.find((f) => f.id === L.eatingFood), L.id);
    L.eatingFood = 0;
  }
  const near = foodInRing(L.x, L.y, L.skipFood);
  const food = near || seekFoodPoint(L.x, L.y, L.skipFood);
  if (food && onFood(L.x, L.y, food, len * 0.45) && joinFood(food, L.id)) {
    L.eatingFood = food.id;
    L.vx = 0;
    L.vy = 0;
    L.eatUnits = (L.eatUnits || 0) + dt;
    if (L.eatUnits >= eatNeedFor(L)) {
      if (L.instar < 3 || canPupate()) finishEat(L, food, now);
    }
    return;
  }
  if (now > (L.nextTurn || 0)) {
    L.nextTurn = now + rand(300, 1000);
    if (food) {
      const want = Math.atan2(food.y - L.y, food.x - L.x);
      L.heading = want + rand(-0.8, 0.8);
    } else L.heading += rand(-1.2, 1.2);
  }
  const spd = 40 * (L.instar === 1 ? 0.2 : L.instar === 2 ? 0.4 : 0.6);
  L.vx = Math.cos(L.heading) * spd;
  L.vy = Math.sin(L.heading) * spd;
  L.x += L.vx * dt;
  L.y += L.vy * dt;
  wrapScreen(L);
}

function stepLife(dt, now) {
  for (let i = eggs.length - 1; i >= 0; i--) {
    if (now - eggs[i].t >= eggMs() && canHatch()) {
      hatchEgg(eggs[i], now);
      eggs.splice(i, 1);
    }
  }
  for (const L of larvae) stepLarva(L, dt, now);
  larvae = larvae.filter((L) => !L.dead);
  for (let i = pupae.length - 1; i >= 0; i--) {
    if (now - pupae[i].t >= pupaMs() && canEclose()) {
      if (eclose(pupae[i], now)) pupae.splice(i, 1);
    }
  }
}

function wipeAt(x, y) {
  const r2 = RAG_R * RAG_R;
  splats = splats.filter((s) => {
    const dx = s.x - x;
    const dy = s.y - y;
    return dx * dx + dy * dy > r2;
  });
  shells = shells.filter((s) => {
    if (underIcon(s.x, s.y)) return true;
    const dx = s.x - x;
    const dy = s.y - y;
    return dx * dx + dy * dy > r2;
  });
  corpses = corpses.filter((s) => {
    const dx = s.x - x;
    const dy = s.y - y;
    return dx * dx + dy * dy > r2;
  });
}

const HANDLE_X = 19;
const HANDLE_Y = 136;
const PADDLE_CX = 117;
const PADDLE_CY = 28;
const PADDLE_RX = 24;
const PADDLE_RY = 23;
const PADDLE_TARGET = 152;

let swatterSprite = null;
let swatterScale = PADDLE_TARGET / (PADDLE_RX * 2);

function knockWhite(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i];
    const g = p[i + 1];
    const b = p[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.12 && max > 235) p[i + 3] = 0;
    else if (sat < 0.22 && max > 210) {
      p[i + 3] = Math.round(p[i + 3] * clamp((0.22 - sat) / 0.22, 0, 1) * clamp((240 - max) / 30, 0, 1));
    }
  }
  x.putImageData(d, 0, 0);
  return c;
}

const swatterImg = new Image();
swatterImg.onload = () => {
  swatterSprite = knockWhite(swatterImg);
};
swatterImg.src = '../assets/swatter.png';

function swatterPose() {
  // Cursor sits on the paddle; handle hangs down-right and may leave the screen.
  return { sx: -1, sy: 1, scale: swatterScale };
}

function paddleOffset() {
  return { x: 0, y: 0 };
}

function paddleCenter() {
  return { x: mouse.x, y: mouse.y };
}

function inPaddle(px, py) {
  const { sx, sy, scale } = swatterPose();
  const ix = PADDLE_CX + (px - mouse.x) / (scale * sx);
  const iy = PADDLE_CY + (py - mouse.y) / (scale * sy);
  const dx = (ix - PADDLE_CX) / PADDLE_RX;
  const dy = (iy - PADDLE_CY) / PADDLE_RY;
  return dx * dx + dy * dy <= 1;
}

function clampHandle() {
  mouse.x = clamp(mouse.x, 0, W);
  mouse.y = clamp(mouse.y, 0, H);
}

function swatAt(now) {
  let hit = false;
  for (const f of flies) {
    if (f.state === 'dead') continue;
    if (inPaddle(f.x, f.y)) {
      killFly(f, now);
      hit = true;
    }
  }
  flies = flies.filter((f) => f.state !== 'dead');
  for (let i = eggs.length - 1; i >= 0; i--) {
    if (underIcon(eggs[i].x, eggs[i].y)) continue;
    if (inPaddle(eggs[i].x, eggs[i].y)) {
      addSplat(eggs[i].x, eggs[i].y, now, eggs[i].seed, 0.35);
      eggs.splice(i, 1);
      hit = true;
    }
  }
  for (let i = larvae.length - 1; i >= 0; i--) {
    if (underIcon(larvae[i].x, larvae[i].y)) continue;
    if (inPaddle(larvae[i].x, larvae[i].y)) {
      addSplat(larvae[i].x, larvae[i].y, now, larvae[i].seed, 0.45 + larvae[i].instar * 0.15);
      larvae.splice(i, 1);
      hit = true;
    }
  }
  for (let i = pupae.length - 1; i >= 0; i--) {
    if (underIcon(pupae[i].x, pupae[i].y)) continue;
    if (inPaddle(pupae[i].x, pupae[i].y)) {
      addSplat(pupae[i].x, pupae[i].y, now, pupae[i].seed, 0.8);
      pupae.splice(i, 1);
      hit = true;
    }
  }
  if (!hit) {
    const c = paddleCenter();
    for (const f of flies) {
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      if (d < 160) scare(f, now, clamp(1 - d / 160, 0.4, 1));
    }
  }
}

function step(dt, now) {
  if (paused) return;
  for (const f of flies) stepFly(f, dt, now);
  flies = flies.filter((f) => f.state !== 'dead');
  tryPairAll(now);
  closePairs(now);
  stepLife(dt, now);
  tickFoods(dt, now);

  foodAcc += dt;
  if (foodAcc > 4) {
    foodAcc = 0;
    spawnFood();
  }

  const alive = flies.length + eggs.length + larvae.length + pupae.length;
  if (alive === 0) {
    if (breed) {
      extinctSince = 0;
    } else if (!extinctSince) {
      extinctSince = now;
      respawnIn = (RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN)) * 1000;
    } else if (now - extinctSince > respawnIn) {
      spawnFromEdge(2, { geneG: 1 });
      spawnFood();
      extinctSince = 0;
    }
  } else {
    extinctSince = 0;
  }
  checkClear();
}

function drawFood(f) {
  if (f.infinite || !(f.bits && f.bits.length)) return;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = clamp(0.4 + f.amount * 0.6, 0.35, 0.95);
  for (const b of f.bits) {
    ctx.save();
    ctx.translate(b.ox, b.oy);
    ctx.rotate(b.rot);
    ctx.fillStyle = `hsl(${b.hue}, 32%, ${b.light}%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawSplat(s) {
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = '#4a1020';
  ctx.translate(s.x, s.y);
  ctx.rotate(s.seed);
  const k = s.scale || 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10 * k, 6 * k, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7 * k, -3 * k, 3 * k, 2 * k, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const COL = {
  eye: '#d44532',
  eyeDark: '#7a1810',
  eyeHi: '#f4a090',
  thorax: '#d4a056',
  thoraxDark: '#b07a38',
  abdomen: '#ead7aa',
  band: '#2e2014',
  wing: 'rgba(248,250,252,0.5)',
  vein: 'rgba(70,70,70,0.4)',
  leg: '#c6a66c',
  head: '#c48a48',
  maleTip: null,
};

const PALETTE = {
  wild: { thorax: '#d4a056', thoraxDark: '#b07a38', abdomen: '#ead7aa', band: '#2e2014', head: '#c48a48', leg: '#c6a66c' },
  mid: { thorax: '#aa743c', thoraxDark: '#c49050', abdomen: '#c8a878', band: '#3a2410', head: '#8e5c28', leg: '#966834' },
  deep: { thorax: '#4a2c12', thoraxDark: '#8a5a28', abdomen: '#6b4524', band: '#1a0e08', head: '#3a220e', leg: '#4a3218' },
  white: { thorax: '#f3eee4', thoraxDark: '#d8d0c4', abdomen: '#fffcf6', band: '#6b6358', head: '#efe8dc', leg: '#c4b8a8' },
  green: { thorax: '#1aa85a', thoraxDark: '#c8f080', abdomen: '#148a48', band: '#0d3a20', head: '#127a40', leg: '#1a5a32' },
  rainbow: { thorax: '#e23d7a', thoraxDark: '#7a3dff', abdomen: '#3dd4e2', band: '#1a1030', head: '#f0c040', leg: '#6a4cff' },
};

const PALETTE_DEAD = {
  wild: { thorax: '#6a4a22', thoraxDark: '#3a2810', abdomen: '#8a7350', band: '#1a1008', head: '#5a3818', leg: '#6a5030' },
  mid: { thorax: '#6a4e28', thoraxDark: '#3a2c14', abdomen: '#8a6e48', band: '#1a1008', head: '#5a3c1c', leg: '#6a5030' },
  deep: { thorax: '#2a180c', thoraxDark: '#140c06', abdomen: '#4a3020', band: '#100804', head: '#241408', leg: '#2a1c10' },
  white: { thorax: '#b8b0a4', thoraxDark: '#7a7468', abdomen: '#d4ccc0', band: '#4a443c', head: '#a0988c', leg: '#8a8278' },
  green: { thorax: '#2a5a38', thoraxDark: '#143820', abdomen: '#3a6a44', band: '#0c2014', head: '#1e4028', leg: '#244830' },
  rainbow: { thorax: '#5a2848', thoraxDark: '#2a1840', abdomen: '#28485a', band: '#140c20', head: '#5a4830', leg: '#30245a' },
};

function morphOf(geneD, geneP, geneG, geneX, geneY) {
  const dark = (geneD || 0) >= 2;
  const mid = (geneP || 0) >= 2;
  const green = (geneG || 0) >= 2;
  if (dark && mid && green) {
    if ((geneX || 0) >= 2 && (geneY || 0) >= 2) return 'rainbow';
    return 'green';
  }
  if (dark && mid) return 'white';
  if (dark) return 'deep';
  if (mid) return 'mid';
  return 'wild';
}

function paintRainbow(seed, now) {
  const h = ((now || 0) * 0.09 + (seed || 0) * 47) % 360;
  COL.thorax = `hsl(${h}, 82%, 50%)`;
  COL.thoraxDark = `hsl(${(h + 48) % 360}, 72%, 38%)`;
  COL.abdomen = `hsl(${(h + 96) % 360}, 78%, 56%)`;
  COL.band = `hsl(${(h + 180) % 360}, 40%, 18%)`;
  COL.head = `hsl(${(h + 24) % 360}, 80%, 44%)`;
  COL.leg = `hsl(${(h + 60) % 360}, 48%, 36%)`;
  COL.eye = `hsl(${(h + 300) % 360}, 70%, 52%)`;
  COL.eyeDark = `hsl(${(h + 300) % 360}, 55%, 28%)`;
  COL.eyeHi = `hsl(${(h + 300) % 360}, 70%, 78%)`;
}

function applyBody(src, male, dead, now) {
  const morph = morphOf(src.geneD, src.geneP, src.geneG, src.geneX, src.geneY);
  if (morph === 'rainbow' && !dead) {
    paintRainbow(src.seed, now);
    COL.maleTip = male ? '#140c08' : null;
    return;
  }
  const p = (dead ? PALETTE_DEAD : PALETTE)[morph] || PALETTE.wild;
  COL.thorax = p.thorax;
  COL.thoraxDark = p.thoraxDark;
  COL.abdomen = p.abdomen;
  COL.band = p.band;
  COL.head = p.head;
  COL.leg = p.leg;
  COL.eye = '#d44532';
  COL.eyeDark = '#7a1810';
  COL.eyeHi = '#f4a090';
  COL.maleTip = male ? (dead ? '#100804' : '#140c08') : null;
}

function paintMaleTip(view) {
  if (!COL.maleTip) return;
  ctx.save();
  ctx.beginPath();
  if (view === 'dorsal') {
    ctx.moveTo(-0.55, 1.7);
    ctx.bezierCurveTo(-1.85, 2.5, -1.65, 4.2, 0, 5.35);
    ctx.bezierCurveTo(1.65, 4.2, 1.85, 2.5, 0.55, 1.7);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = COL.maleTip;
    ctx.beginPath();
    ctx.ellipse(0, 4.55, 1.7, 1.45, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.ellipse(2.15, 0.55, 1.85, 1.2, -0.1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = COL.maleTip;
    ctx.beginPath();
    ctx.ellipse(3.55, 0.55, 1.05, 1.15, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function strokeLeg(ax, ay, bx, by, cx, cy) {
  ctx.strokeStyle = COL.leg;
  ctx.lineWidth = 0.55;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.stroke();
}

function drawDorsalWing(side, angle) {
  ctx.save();
  ctx.translate(side * 1.5, 0.22);
  ctx.rotate(side * angle);
  ctx.fillStyle = COL.wing;
  ctx.strokeStyle = COL.vein;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(side * 2.2, -1.15, side * 4.5, -0.75, side * 5.15, 0.12);
  ctx.bezierCurveTo(side * 4.6, 1.15, side * 2.0, 1.25, side * 0.2, 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * 3.0, -0.12, side * 4.9, 0.16);
  ctx.stroke();
  ctx.restore();
}

function wingAngle(now, seed, phase) {
  return 0.12 + 0.5 * Math.sin(now * 0.55 + seed + phase);
}

function drawDorsalWingsFolded() {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(side * 0.28, 0.55);
    ctx.rotate(side * 0.08);
    ctx.fillStyle = COL.wing;
    ctx.strokeStyle = COL.vein;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(side * 0.7, 0.5, side * 0.9, 2.2, side * 0.25, 4.3);
    ctx.bezierCurveTo(side * -0.35, 4.5, 0, 2.0, 0, 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawDorsal(flying, now, seed, grooms) {
  const flap = flying ? wingAngle(now, seed, 0) : 0.85;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0.4, 4.0, 2.4, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  if (flying) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    drawDorsalWing(-1, wingAngle(now, seed, 0.9));
    drawDorsalWing(1, wingAngle(now, seed, 0.9));
    ctx.globalAlpha = 0.18;
    drawDorsalWing(-1, wingAngle(now, seed, 1.8));
    drawDorsalWing(1, wingAngle(now, seed, 1.8));
    ctx.restore();
    drawDorsalWing(-1, flap);
    drawDorsalWing(1, flap);
  } else {
    drawDorsalWingsFolded();
  }

  ctx.fillStyle = COL.abdomen;
  ctx.beginPath();
  ctx.moveTo(-0.55, 1.7);
  ctx.bezierCurveTo(-1.85, 2.5, -1.65, 4.2, 0, 5.35);
  ctx.bezierCurveTo(1.65, 4.2, 1.85, 2.5, 0.55, 1.7);
  ctx.closePath();
  ctx.fill();
  paintMaleTip('dorsal');
  ctx.strokeStyle = COL.band;
  ctx.lineWidth = 0.45;
  for (let i = 0; i < 4; i++) {
    const y = 2.25 + i * 0.68;
    const w = 1.35 - i * 0.18;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + 0.2, w, y);
    ctx.stroke();
  }

  ctx.fillStyle = COL.thorax;
  ctx.beginPath();
  ctx.ellipse(0, 1.85, 0.48, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0.4, 1.65, 1.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.thoraxDark;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(0, 0.3, 0.95, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = COL.head;
  ctx.beginPath();
  ctx.ellipse(0, -1.15, 0.48, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -1.85, 0.88, 0.74, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5a3a18';
  ctx.lineWidth = 0.28;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.3, -2.45);
    ctx.lineTo(side * 0.62, -3.05);
    ctx.stroke();
  }

  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(side * 0.5, -2.0, 0.12, side * 0.62, -1.85, 0.78);
    g.addColorStop(0, COL.eyeHi);
    g.addColorStop(0.45, COL.eye);
    g.addColorStop(1, COL.eyeDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(side * 0.7, -1.88, 0.58, 0.64, side * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  if (grooms) {
    const rub = Math.sin(now * 0.028);
    strokeLeg(-0.7, -1.1, -1.35, -1.7 + rub * 0.35, -0.85, -2.15 - rub * 0.2);
    strokeLeg(0.7, -1.1, 1.35, -1.7 - rub * 0.35, 0.85, -2.15 + rub * 0.2);
  }
}

function drawSide(now, seed, grooms) {
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0.3, 3.4, 2.6, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  const rub = grooms ? Math.sin(now * 0.028) : 0;
  if (grooms) {
    strokeLeg(-1.8, 0.15, -2.4, 0.55 + rub * 0.45, -2.15, 1.15 - rub * 0.35);
    strokeLeg(-1.55, 0.2, -2.15, 0.7 - rub * 0.4, -1.9, 1.25 + rub * 0.3);
  } else {
    strokeLeg(-1.1, 0.6, -2.0, 2.0, -2.4, 3.3);
  }
  strokeLeg(0.2, 0.8, -0.2, 2.2, -0.5, 3.5);
  strokeLeg(1.4, 0.9, 1.8, 2.3, 2.1, 3.6);

  ctx.fillStyle = COL.wing;
  ctx.strokeStyle = COL.vein;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.7);
  ctx.bezierCurveTo(0.5, -1.9, 3.0, -1.65, 4.35, -0.12);
  ctx.bezierCurveTo(3.7, 1.0, 1.35, 0.9, 0.15, 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.4, -0.55);
  ctx.quadraticCurveTo(2.35, -1.0, 4.1, -0.08);
  ctx.stroke();

  ctx.fillStyle = COL.abdomen;
  ctx.beginPath();
  ctx.ellipse(2.15, 0.55, 1.85, 1.2, -0.1, 0, Math.PI * 2);
  ctx.fill();
  paintMaleTip('side');
  ctx.strokeStyle = COL.band;
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 4; i++) {
    const x = 1.35 + i * 0.58;
    ctx.beginPath();
    ctx.moveTo(x, -0.3);
    ctx.lineTo(x + 0.12, 1.55);
    ctx.stroke();
  }

  ctx.fillStyle = COL.thorax;
  ctx.beginPath();
  ctx.ellipse(1.2, 0.32, 0.4, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.05, 0.15, 1.4, 1.28, 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COL.head;
  ctx.beginPath();
  ctx.ellipse(-1.4, 0.1, 0.4, 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2.1, 0.02, 0.82, 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5a3a18';
  ctx.lineWidth = 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2.55, -0.5);
  ctx.lineTo(-3.05, -1.02);
  ctx.stroke();

  const eg = ctx.createRadialGradient(-2.22, -0.18, 0.12, -2.1, 0.02, 0.75);
  eg.addColorStop(0, COL.eyeHi);
  eg.addColorStop(0.4, COL.eye);
  eg.addColorStop(1, COL.eyeDark);
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.ellipse(-2.25, -0.1, 0.62, 0.68, 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawOblique(flying, now, seed, grooms) {
  const flap = flying ? 0.5 + 0.35 * Math.sin(now * 0.55 + seed) : 0.2;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0.5, 4.6, 2.5, 1.0, 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (flying) {
    ctx.save();
    ctx.translate(1.15, -0.15);
    ctx.rotate(-0.05 + flap * 0.7);
  ctx.fillStyle = COL.wing;
  ctx.strokeStyle = COL.vein;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(2.0, -0.95, 4.35, -0.35, 4.85, 0.95);
  ctx.bezierCurveTo(3.7, 1.7, 1.35, 1.25, 0, 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.translate(-0.9, -0.2);
  ctx.rotate(-0.9 - flap * 0.15);
  ctx.fillStyle = COL.wing;
  ctx.beginPath();
  ctx.ellipse(1.7, 0.35, 2.15, 0.75, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(0.35, 0.35);
    ctx.rotate(0.55);
    ctx.fillStyle = COL.wing;
    ctx.strokeStyle = COL.vein;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.8, 0.4, 1.2, 2.0, 0.4, 3.6);
    ctx.bezierCurveTo(-0.3, 3.7, 0.1, 1.6, 0, 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = COL.abdomen;
  ctx.beginPath();
  ctx.ellipse(1.55, 2.05, 1.35, 1.75, 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COL.band;
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 4; i++) {
    const y = 1.2 + i * 0.62;
    ctx.beginPath();
    ctx.moveTo(0.55, y);
    ctx.lineTo(2.65, y + 0.22);
    ctx.stroke();
  }

  ctx.fillStyle = COL.thorax;
  ctx.beginPath();
  ctx.ellipse(0.7, 1.25, 0.4, 0.32, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.15, 0.2, 1.45, 1.35, 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COL.head;
  ctx.beginPath();
  ctx.ellipse(-0.35, -0.85, 0.4, 0.32, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.7, -1.5, 0.74, 0.64, 0.15, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(-0.88, -1.65, 0.12, -0.7, -1.45, 0.7);
  g.addColorStop(0, COL.eyeHi);
  g.addColorStop(0.4, COL.eye);
  g.addColorStop(1, COL.eyeDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-0.85, -1.52, 0.56, 0.6, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.eyeDark;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.15, -1.6, 0.28, 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawFly(fly, now) {
  const flying = fly.state === 'fly' || fly.state === 'flee';
  const grooms = !flying && !fly.crawling && fly.state !== 'mate';
  applyBody(fly, fly.sex === 'm', false, now);
  ctx.save();
  ctx.translate(fly.x, fly.y);
  if (fly.state === 'mate') {
    ctx.translate(fly.mateRole ? 5 : 0, fly.mateRole ? -4 : 0);
    ctx.rotate(Math.sin(now * 0.02 + fly.seed) * 0.18);
  }
  ctx.scale(fly.scale * (4 / 3), fly.scale * (4 / 3));
  ctx.rotate(fly.visHead + Math.PI / 2);
  drawDorsal(flying, now, fly.seed, grooms);
  ctx.restore();
}

function drawCorpse(c) {
  const saved = {
    eye: COL.eye, eyeDark: COL.eyeDark, eyeHi: COL.eyeHi,
    thorax: COL.thorax, thoraxDark: COL.thoraxDark,
    abdomen: COL.abdomen, band: COL.band, head: COL.head, leg: COL.leg,
    wing: COL.wing, maleTip: COL.maleTip,
  };
  COL.eye = '#4a120c';
  COL.eyeDark = '#2a0806';
  COL.eyeHi = '#7a4038';
  COL.wing = 'rgba(180,170,150,0.35)';
  applyBody(c, c.sex === 'm', true, 0);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale((c.scale || 1) * (4 / 3), (c.scale || 1) * (4 / 3));
  ctx.rotate((c.heading || 0) + Math.PI / 2);
  drawSide(0, c.seed || 0, false);
  ctx.restore();
  Object.assign(COL, saved);
}

function drawEgg(e) {
  const len = ADULT_LEN / 5;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);
  ctx.fillStyle = '#f4f1e8';
  ctx.strokeStyle = 'rgba(180,170,150,0.7)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.5, len * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLarva(L) {
  const len = larvaLen(L.instar);
  const thick = 1.1 + L.instar * 0.55;
  ctx.save();
  ctx.translate(L.x, L.y);
  ctx.scale(0.8, 0.8);
  ctx.rotate(L.heading);
  ctx.fillStyle = L.instar === 1 ? '#f3eee3' : L.instar === 2 ? '#e6dcc8' : '#d9cbb0';
  ctx.beginPath();
  ctx.ellipse(0, 0, len * 0.5, thick, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,80,0.25)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
}

function pupaColor(p, now) {
  const u = clamp((now - p.t) / pupaMs(), 0, 1);
  const r = 245 + (92 - 245) * u;
  const g = 240 + (58 - 240) * u;
  const b = 220 + (28 - 220) * u;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawPupa(p, now, empty) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(0.8, 0.8);
  ctx.rotate(p.rot || 0);
  ctx.fillStyle = empty ? '#6b3d1c' : pupaColor(p, now);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (empty) {
    ctx.strokeStyle = 'rgba(255,240,220,0.35)';
    ctx.beginPath();
    ctx.moveTo(-4, -1);
    ctx.lineTo(3, 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRag() {
  if (mouse.x < -1000) return;
  const s = ICON_PX;
  ctx.save();
  ctx.translate(mouse.x - s / 2, mouse.y - s / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(180,180,180,0.8)';
  ctx.lineWidth = 1;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  ctx.restore();
}

function drawSwatter() {
  if (mouse.x < -1000) return;
  const { sx, sy, scale } = swatterPose();
  ctx.save();
  ctx.translate(mouse.x, mouse.y);
  ctx.scale(sx * scale, sy * scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  if (swatterSprite) {
    ctx.drawImage(swatterSprite, -PADDLE_CX, -PADDLE_CY);
  } else {
    ctx.strokeStyle = '#ff4d8a';
    ctx.lineWidth = 4 / scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(HANDLE_X - PADDLE_CX, HANDLE_Y - PADDLE_CY);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 70, 140, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, PADDLE_RX, PADDLE_RY, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  if (swatterOn || ragOn) {
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    ctx.fillRect(0, 0, W, H);
  }
  for (const f of foods) drawFood(f);
  for (const e of eggs) drawEgg(e);
  for (const p of pupae) drawPupa(p, now, false);
  for (const L of larvae) drawLarva(L);
  for (const s of shells) drawPupa(s, now, true);
  punchIcons();
  for (const s of splats) drawSplat(s);
  for (const c of corpses) drawCorpse(c);
  for (const f of flies) drawFly(f, now);
  if (swatterOn) drawSwatter();
  if (ragOn) drawRag();
  drawFanfare(now);
}

function drawFanfare(now) {
  if (!fanfareUntil || now > fanfareUntil) return;
  const dur = 8000;
  const left = fanfareUntil - now;
  const t = 1 - left / dur;
  const alpha = t < 0.08 ? t / 0.08 : left < 900 ? left / 900 : 1;
  const line1 = '你孵出了概率1/1024的彩色果蝇！';
  const line2 = '快想办法扩大种群！';
  const list = screens.length ? screens : [{ x: 0, y: 0, w: W, h: H }];
  for (const s of list) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h * 0.28;
    const size = Math.min(72, Math.max(32, s.w / 16));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px "Microsoft YaHei UI","Microsoft YaHei",sans-serif`;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(6, size / 9);
    ctx.strokeStyle = 'rgba(0,0,0,0.62)';
    ctx.strokeText(line1, cx, cy);
    ctx.strokeText(line2, cx, cy + size * 1.25);
    const h = (now * 0.14) % 360;
    ctx.fillStyle = `hsl(${h}, 92%, 62%)`;
    ctx.fillText(line1, cx, cy);
    ctx.fillStyle = `hsl(${(h + 90) % 360}, 92%, 62%)`;
    ctx.fillText(line2, cx, cy + size * 1.25);
    ctx.restore();
  }
}

function checkClear() {
  if (!breed || cleared) return;
  if (flies.length === BREED_ADULTS && flies.every(isGreenMorph)) cleared = true;
}

function publishLife() {
  if (!window.fly || !window.fly.sendLife) return;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  for (const L of larvae) {
    if (L.instar === 1) l1 += 1;
    else if (L.instar === 2) l2 += 1;
    else l3 += 1;
  }
  let green = 0;
  let rainbow = 0;
  for (const f of flies) {
    const m = morphOf(f.geneD, f.geneP, f.geneG, f.geneX, f.geneY);
    if (m === 'rainbow') rainbow += 1;
    else if (m === 'green') green += 1;
  }
  window.fly.sendLife({
    eggs: eggs.length,
    l1,
    l2,
    l3,
    pupae: pupae.length,
    adults: flies.length,
    green,
    rainbow,
    breed,
    cleared,
    breedMs,
  });
}

const FLY_TS = [
  'restUntil', 'stillUntil', 'settleUntil', 'ignoreThreatUntil', 'scareUntil',
  'nextTurn', 'born', 'mealDoneAt', 'mateUntil', 'mateCool', 'dieAt',
  'takeoffUntil', 'leaveAt', 'burstUntil', 'eatBegan',
];

function packTimes(obj, keys, now) {
  const o = { ...obj };
  for (const k of keys) o[k] = obj[k] ? obj[k] - now : 0;
  return o;
}

function unpackTimes(obj, keys, now) {
  for (const k of keys) {
    if (obj[k]) obj[k] = now + obj[k];
  }
  return obj;
}

function snapshot() {
  const now = performance.now();
  const packFly = (f) => {
    const o = packTimes(f, FLY_TS, now);
    o.perch = null;
    o.target = null;
    o.crawlFrom = null;
    o.crawlTo = null;
    o.crawling = false;
    o.eatingFood = 0;
    return o;
  };
  return {
    v: 1,
    breed,
    cleared,
    breedMs,
    rainbowSeen,
    nextId,
    flies: flies.map(packFly),
    eggs: eggs.map((e) => packTimes({ ...e }, ['t'], now)),
    larvae: larvae.map((L) => packTimes({ ...L, eatingFood: 0 }, ['nextTurn'], now)),
    pupae: pupae.map((p) => packTimes({ ...p }, ['t'], now)),
    foods: foods.filter((f) => !f.infinite).map((f) => ({
      id: f.id,
      iconId: f.iconId,
      x: f.x,
      y: f.y,
      bits: f.bits,
      amount: f.amount,
      eaters: [],
      supply: f.supply,
      infinite: false,
      attract: f.attract,
    })),
    shells: shells.slice(),
    corpses: corpses.slice(),
    splats: splats.map((s) => packTimes({ ...s }, ['t'], now)),
  };
}

function applyRestore(data) {
  if (!data || data.v !== 1) {
    holdBoot = false;
    if (icons.length) boot();
    return;
  }
  const now = performance.now();
  breed = !!data.breed;
  cleared = !!data.cleared;
  breedMs = Number(data.breedMs) || 0;
  rainbowSeen = !!data.rainbowSeen;
  nextId = Number(data.nextId) || 1;
  flies = (data.flies || []).map((f) => unpackTimes({ ...f, perch: null, target: null, crawling: false, eatingFood: 0 }, FLY_TS, now));
  eggs = (data.eggs || []).map((e) => unpackTimes({ ...e }, ['t'], now));
  larvae = (data.larvae || []).map((L) => unpackTimes({ ...L, eatingFood: 0 }, ['nextTurn'], now));
  pupae = (data.pupae || []).map((p) => unpackTimes({ ...p }, ['t'], now));
  foods = data.foods || [];
  shells = data.shells || [];
  corpses = data.corpses || [];
  splats = (data.splats || []).map((s) => unpackTimes({ ...s }, ['t'], now));
  booted = true;
  holdBoot = false;
  extinctSince = 0;
  syncBinFood();
}

function flushSave() {
  if (!breed) return;
  if (window.fly && window.fly.sendSnapshot) window.fly.sendSnapshot(snapshot());
}

function startFresh() {
  holdBoot = false;
  breed = !flavorAnnoy;
  cleared = false;
  breedMs = 0;
  rainbowSeen = false;
  fanfareUntil = 0;
  raiseFanfare(false);
  if (!booted && icons.length) boot();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    if (breed && !paused && !cleared && booted) breedMs += dt * 1000;
    step(dt, now);
    tickFanfare(now);
    draw(now);
    lifeAcc += dt;
    if (lifeAcc > 0.4) {
      lifeAcc = 0;
      publishLife();
    }
    if (breed && booted) {
      snapAcc += dt;
      if (snapAcc > 8) {
        snapAcc = 0;
        flushSave();
      }
    }
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function trackTool(x, y) {
  if (!swatterOn && !ragOn) return;
  mouse.x = x;
  mouse.y = y;
  if (swatterOn) clampHandle();
  else {
    mouse.x = clamp(mouse.x, 0, W);
    mouse.y = clamp(mouse.y, 0, H);
    if (ragWipe) wipeAt(mouse.x, mouse.y);
  }
}

addEventListener('pointermove', (e) => {
  if (!swatterOn && !ragOn) return;
  trackTool(e.clientX, e.clientY);
}, { passive: true });

canvas.addEventListener('mousedown', (e) => {
  trackTool(e.clientX, e.clientY);
  if (swatterOn) swatAt(performance.now());
  if (ragOn) {
    ragWipe = true;
    wipeAt(mouse.x, mouse.y);
  }
});

addEventListener('mouseup', () => { ragWipe = false; });

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !(swatterOn || ragOn)) return;
  window.fly?.putAway?.();
});

const api = window.fly;
if (api) {
  api.onAmbient((d) => {
    if (d.grabbing != null) grabbing = !!d.grabbing;
    if (d.mouse) {
      if (swatterOn || ragOn) return;
      mouse.x = d.mouse.x;
      mouse.y = d.mouse.y;
      if (d.mouse.vx != null) {
        mouse.vx = d.mouse.vx;
        mouse.vy = d.mouse.vy;
        const s = Math.hypot(mouse.vx, mouse.vy);
        mouse.spd = s;
      }
    }
  });
  api.onIcons((d) => {
    icons = d.icons || [];
    const nearest = (x, y) => {
      let best = null;
      let bestD = 1e9;
      for (const ic of icons) {
        const c = iconPad(ic);
        const dd = Math.hypot(c.x - x, c.y - y);
        if (dd < bestD) { bestD = dd; best = ic; }
      }
      return best;
    };
    for (const f of flies) {
      if (f.perch) f.perch = nearest(f.x, f.y) || f.perch;
      if (f.target) f.target = icons.find((i) => i.name === f.target.name) || f.target;
    }
    for (const f of foods) {
      if (!icons.find((i) => i.id === f.iconId)) {
        const ic = nearest(f.x, f.y);
        if (ic) f.iconId = ic.id;
      }
    }
    if (!booted && !holdBoot && icons.length) boot();
    syncBinFood();
  });
  api.onSwatter((d) => {
    const was = swatterOn;
    swatterOn = !!d.on;
    rawMove = !!d.raw;
    document.documentElement.classList.toggle('swatter', swatterOn);
    if (swatterOn) ragOn = false;
    if (swatterOn && !was) playSwatterGrab();
    if (!swatterOn && was) stopSwatterMusic();
  });
  if (api.onRag) {
    api.onRag((d) => {
      const was = ragOn;
      ragOn = !!d.on;
      rawMove = !!d.raw;
      document.documentElement.classList.toggle('rag', ragOn);
      if (ragOn) swatterOn = false;
      if (ragOn && !was) playRagGrab();
      if (!ragOn && was) stopRagMusic();
    });
  }
  api.onSwatterMove?.((d) => {
    if (!swatterOn && !ragOn) return;
    if (d.x == null || d.y == null) return;
    trackTool(d.x, d.y);
  });
  api.onCmd((d) => {
    if (d.name === 'pause') paused = !!d.value;
    if (d.name === 'fast') fast = !!d.value;
    if (d.name === 'configure') {
      flavorAnnoy = !!d.annoy;
      breed = d.breed != null ? !!d.breed : !flavorAnnoy;
      if (d.watch != null) watch = !!d.watch;
    }
    if (d.name === 'watch') watch = !!d.value;
    if (d.name === 'breed') {
      if (!flavorAnnoy) {
        breed = !!d.value;
        if (breed) checkClear();
      }
    }
    if (d.name === 'addFly') spawnFromEdge(1, { morph: d.morph, sex: d.sex });
    if (d.name === 'scareAll') scareAll(performance.now());
    if (d.name === 'boot') boot();
    if (d.name === 'startFresh') startFresh();
    if (d.name === 'restore' && d.data) applyRestore(d.data);
    if (d.name === 'flush') flushSave();
  });
  api.onRetarget((d) => {
    if (d && d.screens && d.screens.length) screens = d.screens;
    resize();
  });
}
