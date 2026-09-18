const $ = (id) => document.getElementById(id);
const api = window.panel;

function fmtMs(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function sexn(f, m) {
  return `${f || 0}雌 ${m || 0}雄`;
}

function ragWashHint(s) {
  const left = Number(s && s.washLeftMs) || 0;
  if (left <= 0) return '';
  return `抹布太脏了还在洗！${fmtMs(left)}`;
}

let lastLife = { cleared: false, breedMs: 0, breed: true };
let lastState = {};
let isAnnoy = false;

function ragWashing() {
  return (Number(lastLife.washLeftMs) || 0) > 0;
}

function paintRagBtn(rag) {
  const btn = $('rag');
  if (!btn) return;
  if (ragWashing()) {
    btn.textContent = `洗! ${fmtMs(lastLife.washLeftMs)}`;
    btn.classList.add('on');
  } else {
    btn.textContent = rag ? '收起抹布' : '拿出抹布';
    btn.classList.toggle('on', rag);
  }
}

function render(s) {
  lastState = s || {};
  const on = !!s.swatterOn;
  const rag = !!s.ragOn;
  const watch = !!s.watch;
  const breed = s.breed !== false;
  const gate = !!s.gate;
  const autoStart = !!s.autoStart;
  const fast = !!s.fast;
  isAnnoy = !!s.annoy;
  document.body.classList.toggle('gate', gate);
  const btn = $('swatter');
  btn.textContent = on ? '收起苍蝇拍' : '拿出苍蝇拍';
  btn.classList.toggle('on', on);
  paintRagBtn(rag);
  const net = !!s.netOn;
  $('net').classList.toggle('on', net);
  $('net').textContent = net ? '收起捕网' : '拿出捕网';
  $('xray').classList.toggle('on', watch);
  $('xray').textContent = watch ? '透视中' : '全图透视';
  $('fast').classList.toggle('on', fast);
  $('fast').textContent = fast ? '快进中 · 约 1.5 秒一档' : '快进 · 约 1.5 秒一档';
  $('autoStart').checked = autoStart;
  if (on) {
    $('hint').textContent = '拍子跟着鼠标。左键打。Esc 还鼠标；点退出或关窗口随时能关。';
  } else if (ragWashing()) {
    $('hint').textContent = ragWashHint(lastLife);
  } else if (rag) {
    const wash = ragWashHint(lastLife);
    $('hint').textContent = wash || '抹布跟着鼠标。按住拖动能擦掉汁、尸体和空蛹壳。Esc 收起。';
  } else if (net) {
    $('hint').textContent = '捕网跟着鼠标，不惊动。点击后 0.2 秒落下，圈里活物进瓶。Esc 收起。';
  } else if (fast) {
    $('hint').textContent = '快进：成熟、进食、交配、卵、蛹大约 1.5 秒。';
  } else if (watch) {
    $('hint').textContent = '全图透视：果蝇盖在所有窗口上面。再点关掉。';
  } else if (lastLife.cleared && breed) {
    $('hint').textContent = `通关！12 只全绿，用时 ${fmtMs(lastLife.breedMs)}。`;
  } else if (breed) {
    $('hint').textContent = '成虫最多 12，一窝 2–3 枚。12 只全绿通关。';
  } else {
    $('hint').textContent = '苍蝇在桌面上。吃过的会交配产卵。拍子打活的，抹布擦残迹。';
  }
}

let sex = 'm';

function setSex(next) {
  sex = next;
  $('sexM').checked = sex === 'm';
  $('sexF').checked = sex === 'f';
}

$('swatter').onclick = () => api.send('swatter');
$('rag').onclick = () => {
  if (ragWashing()) api.send('wash');
  else api.send('rag');
};
$('net').onclick = () => api.send('net');
let captureOpen = false;
function paintCapture() {
  const btn = $('capture');
  if (!btn) return;
  btn.classList.toggle('on', captureOpen);
  btn.textContent = captureOpen ? '收起捕捉' : '捕捉';
  const sec = $('captureSection');
  if (sec) sec.classList.toggle('open', captureOpen);
}
$('capture').onclick = () => {
  captureOpen = !captureOpen;
  paintCapture();
  api.send('capture', { open: captureOpen });
};
paintCapture();
$('xray').onclick = () => api.send('xray');
$('autoStart').onchange = () => api.send('autostart');
$('resume').onclick = () => api.send('resume');
$('restart').onclick = () => api.send('restart');
$('sexM').onchange = () => setSex($('sexM').checked ? 'm' : 'f');
$('sexF').onchange = () => setSex($('sexF').checked ? 'f' : 'm');
$('add').onclick = () => api.send('addFly', { sex });
$('scare').onclick = () => api.send('scareAll');
$('fast').onclick = () => api.send('fast');
$('quit').onclick = () => api.send('quit');

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    api.send('swatter-off');
  }
});

api.onState(render);
if (api.onLife) {
  let last = { eggs: 0, l1: 0, l2: 0, l3: 0, pupae: 0, adults: 0, green: 0, greenPeak: 0, rainbow: 0, breed: true, cleared: false, breedMs: 0 };
  api.onLife((s) => {
    last = { ...last, ...s };
    lastLife = last;
    const el = $('stats');
    if (!el) return;
    let line = `成虫 ${last.adults || 0}（${sexn(last.adultF, last.adultM)}）　卵 ${last.eggs || 0}　蛆 ${last.l1 || 0}/${last.l2 || 0}/${last.l3 || 0}　蛹 ${last.pupae || 0}`;
    line += `<span class="m">褐色（A_B_C_/A_B_cc） ${sexn(last.wildF, last.wildM)}</span>`;
    line += `<span class="m">中褐（A_bbC_/A_bbcc） ${sexn(last.midF, last.midM)}</span>`;
    line += `<span class="m">深褐（aaB_C_/aaB_cc） ${sexn(last.deepF, last.deepM)}</span>`;
    line += `<span class="m">白色（aabbC_） ${sexn(last.whiteF, last.whiteM)}</span>`;
    line += `<span class="m">绿色（aabbcc） ${sexn(last.greenF, last.greenM)}</span>`;
    if (last.rainbow) line += `<span class="m">彩虹（aabbccxx） ${sexn(last.rainbowF, last.rainbowM)}</span>`;
    if (isAnnoy) line += `<span class="m">绿峰值 ${last.greenPeak || 0}</span>`;
    if (last.breed) {
      line += `<br>${last.cleared ? '通关' : '计时'} ${fmtMs(last.breedMs)}`;
    }
    el.innerHTML = line;
    paintRagBtn(!!lastState.ragOn);
    const wash = ragWashHint(last);
    if (wash) $('hint').textContent = wash;
    const hint = $('hint');
    if (hint && last.cleared && last.breed && !document.body.classList.contains('gate') && !wash) {
      const sw = $('swatter');
      if (sw && !sw.classList.contains('on') && !$('rag').classList.contains('on')) {
        hint.textContent = `通关！12 只全绿，用时 ${fmtMs(lastLife.breedMs)}。`;
      }
    }
  });
}

const JAR_PAL = {
  wild: { thorax: '#d4a056', thoraxDark: '#b07a38', abdomen: '#ead7aa', band: '#2e2014', head: '#c48a48', leg: '#c6a66c' },
  mid: { thorax: '#aa743c', thoraxDark: '#c49050', abdomen: '#c8a878', band: '#3a2410', head: '#8e5c28', leg: '#966834' },
  deep: { thorax: '#4a2c12', thoraxDark: '#8a5a28', abdomen: '#6b4524', band: '#1a0e08', head: '#3a220e', leg: '#4a3218' },
  white: { thorax: '#f3eee4', thoraxDark: '#d8d0c4', abdomen: '#fffcf6', band: '#6b6358', head: '#efe8dc', leg: '#c4b8a8' },
  green: { thorax: '#1aa85a', thoraxDark: '#c8f080', abdomen: '#148a48', band: '#0d3a20', head: '#127a40', leg: '#1a5a32' },
  rainbow: { thorax: '#e23d7a', thoraxDark: '#7a3dff', abdomen: '#3dd4e2', band: '#1a1030', head: '#f0c040', leg: '#6a4cff' },
};

function jarMorph(u) {
  const dark = (u.geneD || 0) >= 2;
  const mid = (u.geneP || 0) >= 2;
  const green = (u.geneG || 0) >= 2;
  if (dark && mid && green) {
    if ((u.geneX || 0) >= 2 && (u.geneY || 0) >= 2) return 'rainbow';
    return 'green';
  }
  if (dark && mid) return 'white';
  if (dark) return 'deep';
  if (mid) return 'mid';
  return 'wild';
}

let jarState = { w: 180, h: 320, units: [], hint: '' };
let jarSel = new Set();
const jarCv = $('jar');
const jarCtx = jarCv ? jarCv.getContext('2d') : null;

function jarDrawFly(u) {
  const pal = JAR_PAL[jarMorph(u)] || JAR_PAL.wild;
  const male = u.sex === 'm';
  const t = performance.now();
  const seed = u.seed || 0;
  const C = {
    wing: 'rgba(248,250,252,0.5)',
    vein: 'rgba(70,70,70,0.4)',
    eye: '#d44532',
    eyeDark: '#7a1810',
    eyeHi: '#f4a090',
  };
  // shadow
  jarCtx.fillStyle = 'rgba(0,0,0,0.16)';
  jarCtx.beginPath();
  jarCtx.ellipse(0.4, 4.0, 2.4, 1.1, 0, 0, Math.PI * 2);
  jarCtx.fill();
  // wings (flying)
  const wing = (side, ang) => {
    jarCtx.save();
    jarCtx.translate(side * 1.5, 0.22);
    jarCtx.rotate(side * ang);
    jarCtx.fillStyle = C.wing;
    jarCtx.strokeStyle = C.vein;
    jarCtx.lineWidth = 0.35;
    jarCtx.beginPath();
    jarCtx.moveTo(0, 0);
    jarCtx.bezierCurveTo(side * 2.2, -1.15, side * 4.5, -0.75, side * 5.15, 0.12);
    jarCtx.bezierCurveTo(side * 4.6, 1.15, side * 2.0, 1.25, side * 0.2, 0.4);
    jarCtx.closePath();
    jarCtx.fill();
    jarCtx.stroke();
    jarCtx.beginPath();
    jarCtx.moveTo(0, 0);
    jarCtx.quadraticCurveTo(side * 3.0, -0.12, side * 4.9, 0.16);
    jarCtx.stroke();
    jarCtx.restore();
  };
  const a0 = 0.12 + 0.5 * Math.sin(t * 0.55 + seed);
  jarCtx.globalAlpha = 0.28;
  wing(-1, a0 + 0.9);
  wing(1, a0 + 0.9);
  jarCtx.globalAlpha = 0.18;
  wing(-1, a0 + 1.8);
  wing(1, a0 + 1.8);
  jarCtx.globalAlpha = 1;
  wing(-1, a0);
  wing(1, a0);
  // abdomen
  jarCtx.fillStyle = pal.abdomen;
  jarCtx.beginPath();
  jarCtx.moveTo(-0.55, 1.7);
  jarCtx.bezierCurveTo(-1.85, 2.5, -1.65, 4.2, 0, 5.35);
  jarCtx.bezierCurveTo(1.65, 4.2, 1.85, 2.5, 0.55, 1.7);
  jarCtx.closePath();
  jarCtx.fill();
  if (male) {
    jarCtx.save();
    jarCtx.beginPath();
    jarCtx.moveTo(-0.55, 1.7);
    jarCtx.bezierCurveTo(-1.85, 2.5, -1.65, 4.2, 0, 5.35);
    jarCtx.bezierCurveTo(1.65, 4.2, 1.85, 2.5, 0.55, 1.7);
    jarCtx.closePath();
    jarCtx.clip();
    jarCtx.fillStyle = '#140c08';
    jarCtx.beginPath();
    jarCtx.ellipse(0, 4.55, 1.7, 1.45, 0, 0, Math.PI * 2);
    jarCtx.fill();
    jarCtx.restore();
  }
  jarCtx.strokeStyle = pal.band;
  jarCtx.lineWidth = 0.45;
  for (let i = 0; i < 4; i++) {
    const y = 2.25 + i * 0.68;
    const w = 1.35 - i * 0.18;
    jarCtx.beginPath();
    jarCtx.moveTo(-w, y);
    jarCtx.quadraticCurveTo(0, y + 0.2, w, y);
    jarCtx.stroke();
  }
  // thorax
  jarCtx.fillStyle = pal.thorax;
  jarCtx.beginPath();
  jarCtx.ellipse(0, 1.85, 0.48, 0.32, 0, 0, Math.PI * 2);
  jarCtx.fill();
  jarCtx.beginPath();
  jarCtx.ellipse(0, 0.4, 1.65, 1.35, 0, 0, Math.PI * 2);
  jarCtx.fill();
  jarCtx.fillStyle = pal.thoraxDark;
  jarCtx.globalAlpha = 0.35;
  jarCtx.beginPath();
  jarCtx.ellipse(0, 0.3, 0.95, 0.9, 0, 0, Math.PI * 2);
  jarCtx.fill();
  jarCtx.globalAlpha = 1;
  // head
  jarCtx.fillStyle = pal.head;
  jarCtx.beginPath();
  jarCtx.ellipse(0, -1.15, 0.48, 0.36, 0, 0, Math.PI * 2);
  jarCtx.fill();
  jarCtx.beginPath();
  jarCtx.ellipse(0, -1.85, 0.88, 0.74, 0, 0, Math.PI * 2);
  jarCtx.fill();
  // antennae
  jarCtx.strokeStyle = '#5a3a18';
  jarCtx.lineWidth = 0.28;
  jarCtx.lineCap = 'round';
  for (const side of [-1, 1]) {
    jarCtx.beginPath();
    jarCtx.moveTo(side * 0.3, -2.45);
    jarCtx.lineTo(side * 0.62, -3.05);
    jarCtx.stroke();
  }
  // eyes
  for (const side of [-1, 1]) {
    const g = jarCtx.createRadialGradient(side * 0.5, -2.0, 0.12, side * 0.62, -1.85, 0.78);
    g.addColorStop(0, C.eyeHi);
    g.addColorStop(0.45, C.eye);
    g.addColorStop(1, C.eyeDark);
    jarCtx.fillStyle = g;
    jarCtx.beginPath();
    jarCtx.ellipse(side * 0.7, -1.88, 0.58, 0.64, side * 0.18, 0, Math.PI * 2);
    jarCtx.fill();
  }
}

function drawJar() {
  if (!jarCtx || !jarCv) return;
  const w = jarCv.width;
  const h = jarCv.height;
  const sx = w / (jarState.w || 180);
  const sy = h / (jarState.h || 320);
  jarCtx.clearRect(0, 0, w, h);
  jarCtx.fillStyle = 'rgba(255,255,255,0.28)';
  jarCtx.fillRect(8, 8, w - 16, h - 16);
  for (const u of jarState.units || []) {
    const x = u.x * sx;
    const y = u.y * sy;
    jarCtx.save();
    jarCtx.translate(x, y);
    if (u.kind === 'egg') {
      jarCtx.rotate(u.heading || 0);
      jarCtx.fillStyle = '#f4f1e8';
      jarCtx.strokeStyle = 'rgba(180,170,150,0.7)';
      jarCtx.lineWidth = 0.6;
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, 4.5, 2, 0, 0, Math.PI * 2);
      jarCtx.fill();
      jarCtx.stroke();
    } else if (u.kind === 'larva') {
      jarCtx.rotate(u.heading || 0);
      const len = 5 + (u.instar || 1) * 3;
      jarCtx.fillStyle = u.instar === 1 ? '#f3eee3' : u.instar === 2 ? '#e6dcc8' : '#d9cbb0';
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, len, 2.2, 0, 0, Math.PI * 2);
      jarCtx.fill();
      jarCtx.strokeStyle = 'rgba(120,100,80,0.25)';
      jarCtx.lineWidth = 0.7;
      jarCtx.stroke();
    } else if (u.kind === 'pupa') {
      jarCtx.rotate(u.heading || 0);
      jarCtx.fillStyle = '#caa060';
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
      jarCtx.fill();
      jarCtx.strokeStyle = 'rgba(40,20,10,0.35)';
      jarCtx.lineWidth = 0.8;
      jarCtx.stroke();
    } else {
      jarCtx.save();
      const k = (u.scale || 1) * 2.0;
      jarCtx.scale(k, k);
      jarCtx.rotate(u.heading || 0);
      jarDrawFly(u);
      jarCtx.restore();
    }
    if (jarSel.has(u.id)) {
      jarCtx.setLineDash([]);
      jarCtx.strokeStyle = '#ffffff';
      jarCtx.lineWidth = 1.5;
      jarCtx.beginPath();
      jarCtx.arc(0, 0, 14, 0, Math.PI * 2);
      jarCtx.stroke();
    }
    jarCtx.restore();
  }
  const msg = $('jarMsg');
  if (msg) msg.textContent = jarState.hint || '';
}

if (jarCv) {
  jarCv.onclick = null;
}
if ($('jarAll')) $('jarAll').onclick = () => api.send('jarSelectAll');
if ($('jarKill')) $('jarKill').onclick = () => api.send('jarKillSel');
if ($('jarFree')) $('jarFree').onclick = () => api.send('jarFreeSel');

if (api.onBottle) {
  api.onBottle((d) => {
    const msg = $('jarMsg');
    if (msg) msg.textContent = (d && d.hint) || '';
  });
}

api.ready();
