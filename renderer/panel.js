const $ = (id) => document.getElementById(id);
const api = window.panel;

let isAnnoy = false;

function render(s) {
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
  $('rag').textContent = rag ? '收起抹布' : '拿出抹布';
  $('rag').classList.toggle('on', rag);
  $('xray').classList.toggle('on', watch);
  $('xray').textContent = watch ? '透视中' : '全图透视';
  $('fast').classList.toggle('on', fast);
  $('fast').textContent = fast ? '快进中' : '快进';
  $('autoStart').checked = autoStart;
  if (on) {
    $('hint').textContent = '拍子跟着鼠标，左键拍打。最小化面板可沉浸使用，Esc 收起。';
  } else if (rag) {
    $('hint').textContent = '抹布跟着鼠标。按住拖动能擦掉汁和空蛹壳。Esc 收起。';
  } else if (fast) {
    $('hint').textContent = '快进：成熟、进食、交配、卵、蛹大约 1.5 秒。';
  } else if (watch) {
    $('hint').textContent = '全图透视：果蝇盖在所有窗口上面。再点关掉。';
  } else if (breed) {
    $('hint').textContent = '成虫最多 12，一窝 2–3 枚。慢慢观察它们繁衍。';
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
$('rag').onclick = () => api.send('rag');
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
    const el = $('stats');
    if (!el) return;
    const cell = (label, value, compact = false) => `<div class="life-cell"><b class="life-value${compact ? ' compact' : ''}">${value || 0}</b><span class="life-label">${label}</span></div>`;
    const morph = (label, value, color) => `<span class="morph"><span class="morph-name"><i class="dot" style="background:${color}"></i>${label}</span><b>${value || 0}</b></span>`;
    let line = `<div class="life-grid">${cell('成虫', last.adults)}${cell('卵', last.eggs)}${cell('蛆', `${last.l1 || 0}/${last.l2 || 0}/${last.l3 || 0}`, true)}${cell('蛹', last.pupae)}</div>`;
    line += `<div class="morph-grid">${morph('褐色', last.wild, '#d4a056')}${morph('中褐', last.mid, '#aa743c')}${morph('深褐', last.deep, '#4a2c12')}${morph('白色', last.white, '#f3eee4')}${morph('绿色', last.green, '#1aa85a')}`;
    if (isAnnoy) line += morph('绿峰值', last.greenPeak, '#73c86c');
    line += '</div>';
    el.innerHTML = line;
  });
}
api.ready();
