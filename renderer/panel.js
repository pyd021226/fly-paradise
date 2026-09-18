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

const JAR_COL = {
  wild: '#d4a056', mid: '#aa743c', deep: '#4a2c12', white: '#f3eee4', green: '#1aa85a', rainbow: '#e23d7a',
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
let jarSel = 0;
const jarCv = $('jar');
const jarCtx = jarCv ? jarCv.getContext('2d') : null;

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
    const col = JAR_COL[jarMorph(u)] || JAR_COL.wild;
    jarCtx.save();
    jarCtx.translate(x, y);
    jarCtx.rotate(u.heading || 0);
    jarCtx.fillStyle = col;
    if (u.kind === 'egg') {
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      jarCtx.fill();
    } else if (u.kind === 'larva') {
      const len = 5 + (u.instar || 1) * 3;
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, len, 2.2, 0, 0, Math.PI * 2);
      jarCtx.fill();
    } else if (u.kind === 'pupa') {
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
      jarCtx.fill();
    } else {
      jarCtx.beginPath();
      jarCtx.ellipse(0, 0, 6, 3.2, 0, 0, Math.PI * 2);
      jarCtx.fill();
      jarCtx.fillStyle = '#222';
      jarCtx.beginPath();
      jarCtx.arc(-4, 0, 1.4, 0, Math.PI * 2);
      jarCtx.fill();
    }
    if (u.id === jarSel) {
      jarCtx.strokeStyle = '#ffffff';
      jarCtx.lineWidth = 2;
      jarCtx.beginPath();
      jarCtx.arc(0, 0, 11, 0, Math.PI * 2);
      jarCtx.stroke();
    }
    jarCtx.restore();
  }
  const msg = $('jarMsg');
  if (msg) msg.textContent = jarState.hint || '';
}

if (jarCv) {
  jarCv.onclick = (e) => {
    const r = jarCv.getBoundingClientRect();
    const px = (e.clientX - r.left) * (jarCv.width / r.width);
    const py = (e.clientY - r.top) * (jarCv.height / r.height);
    const sx = jarCv.width / (jarState.w || 180);
    const sy = jarCv.height / (jarState.h || 320);
    let best = 0;
    let bd = 22;
    for (const u of jarState.units || []) {
      const d = Math.hypot(u.x * sx - px, u.y * sy - py);
      if (d < bd) { bd = d; best = u.id; }
    }
    jarSel = best;
    drawJar();
  };
}
if ($('jarKill')) $('jarKill').onclick = () => { if (jarSel) api.send('jarKill', { id: jarSel }); };
if ($('jarFree')) $('jarFree').onclick = () => { if (jarSel) api.send('jarFree', { id: jarSel }); };

if (api.onBottle) {
  api.onBottle((d) => {
    jarState = d || jarState;
    if (jarSel && !(jarState.units || []).some((u) => u.id === jarSel)) jarSel = 0;
    drawJar();
  });
}

api.ready();
