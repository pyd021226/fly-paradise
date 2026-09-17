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

let lastLife = { cleared: false, breedMs: 0, breed: true };

function render(s) {
  const on = !!s.swatterOn;
  const rag = !!s.ragOn;
  const watch = !!s.watch;
  const breed = s.breed !== false;
  const gate = !!s.gate;
  const autoStart = !!s.autoStart;
  document.body.classList.toggle('gate', gate);
  const btn = $('swatter');
  btn.textContent = on ? '收起苍蝇拍' : '拿出苍蝇拍';
  btn.classList.toggle('on', on);
  $('rag').textContent = rag ? '收起抹布' : '拿出抹布';
  $('rag').classList.toggle('on', rag);
  $('xray').classList.toggle('on', watch);
  $('xray').textContent = watch ? '透视中' : '全图透视';
  $('autoStart').classList.toggle('on', autoStart);
  $('autoStart').textContent = autoStart ? '开机启动：开' : '开机启动';
  if (on) {
    $('hint').textContent = '拍子跟着鼠标。左键打。Esc 还鼠标；点退出或关窗口随时能关。';
  } else if (rag) {
    $('hint').textContent = '抹布跟着鼠标。按住拖动能擦掉汁和空蛹壳。Esc 收起。';
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
  $('sexM').classList.toggle('on', sex === 'm');
  $('sexF').classList.toggle('on', sex === 'f');
}

$('swatter').onclick = () => api.send('swatter');
$('rag').onclick = () => api.send('rag');
$('xray').onclick = () => api.send('xray');
$('autoStart').onclick = () => api.send('autostart');
$('resume').onclick = () => api.send('resume');
$('restart').onclick = () => api.send('restart');
$('sexM').onclick = () => setSex('m');
$('sexF').onclick = () => setSex('f');
$('add').onclick = () => api.send('addFly', { sex });
$('scare').onclick = () => api.send('scareAll');
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
    const rain = last.rainbow ? `　虹 ${last.rainbow}` : '';
    let line = `卵 ${last.eggs || 0}　蛆 ${last.l1 || 0}/${last.l2 || 0}/${last.l3 || 0}　蛹 ${last.pupae || 0}<br>成虫 ${last.adults || 0}　绿 ${last.green || 0}${rain}　绿峰值 ${last.greenPeak || 0}`;
    if (last.breed) {
      line += `<br>${last.cleared ? '通关' : '计时'} ${fmtMs(last.breedMs)}`;
    }
    el.innerHTML = line;
    const hint = $('hint');
    if (hint && last.cleared && last.breed && !document.body.classList.contains('gate')) {
      const sw = $('swatter');
      if (sw && !sw.classList.contains('on') && !$('rag').classList.contains('on')) {
        hint.textContent = `通关！12 只全绿，用时 ${fmtMs(lastLife.breedMs)}。`;
      }
    }
  });
}
api.ready();
