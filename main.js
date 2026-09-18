// Transparent click-through overlay + a normal control window.
// Overlay spans the virtual desktop; the panel is the app the user opens.

import {
  app, BrowserWindow, screen, globalShortcut, ipcMain,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchLiveIcons } from './src/icons.js';
import { fetchIconRects } from './src/icon-rects.js';
import { startRawMouse, stopRawMouse } from './src/raw-mouse.js';
import { pinAboveDesktop, cursorOnDesktop, leftButtonDown, recycleBinHasItems, isRecycleBinName, doubleClickMs } from './src/desktop-layer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(HERE, 'assets', 'tray.png');

function loadFlavor() {
  if (process.env.FLY_FLAVOR === 'annoy') return 'annoy';
  try {
    const j = JSON.parse(fs.readFileSync(path.join(HERE, 'flavor.json'), 'utf8'));
    if (j && j.flavor === 'annoy') return 'annoy';
  } catch { /* breed */ }
  return 'breed';
}

const flavor = loadFlavor();
const isAnnoy = flavor === 'annoy';

let STATS_FILE = '';
let SAVE_FILE = '';
let SETTINGS_FILE = '';
let greenPeak = 0;
let savedRun = null;
let gate = false;
let breed = !isAnnoy;
let autoStart = isAnnoy;

let overlay = null;
let panel = null;
let swatterOn = false;
let ragOn = false;
let netOn = false;
let paused = false;
let fast = false;
let watch = false;
let mouseTimer = null;
let iconTimer = null;
let pinTimer = null;
let clickTimer = null;

function virtualBounds() {
  const all = screen.getAllDisplays();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of all) {
    x0 = Math.min(x0, d.bounds.x);
    y0 = Math.min(y0, d.bounds.y);
    x1 = Math.max(x1, d.bounds.x + d.bounds.width);
    y1 = Math.max(y1, d.bounds.y + d.bounds.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function send(channel, payload) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload);
}

function publishState() {
  if (panel && !panel.isDestroyed()) {
    panel.webContents.send('state', {
      swatterOn, ragOn, netOn, paused, fast, watch, breed, gate, autoStart, annoy: isAnnoy,
    });
  }
}

function raisePanelOverOverlay() {
  if (!panel || panel.isDestroyed()) return;
  panel.setAlwaysOnTop(true, 'screen-saver');
  panel.moveTop();
}

function toolOn() {
  return swatterOn || ragOn || netOn;
}

function putAwaySwatter() {
  if (!toolOn()) return;
  swatterOn = false;
  ragOn = false;
  netOn = false;
  applyTool();
}

function applyAutoStart() {
  const opts = { openAtLogin: autoStart, enabled: autoStart, name: '果蝇乐园' };
  if (app.isPackaged) {
    app.setLoginItemSettings({ ...opts, path: process.execPath, args: [] });
  } else {
    app.setLoginItemSettings({ ...opts, path: process.execPath, args: [HERE] });
  }
}

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (typeof s.openAtLogin === 'boolean') autoStart = s.openAtLogin;
  } catch { /* first run uses flavor default */ }
}

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ openAtLogin: autoStart })); } catch { /* */ }
}

function writeSave(data) {
  if (!SAVE_FILE || !data) return;
  try { fs.writeFileSync(SAVE_FILE, JSON.stringify(data)); } catch { /* */ }
  savedRun = data;
}

function clearSave() {
  savedRun = null;
  if (!SAVE_FILE) return;
  try { fs.unlinkSync(SAVE_FILE); } catch { /* */ }
}

function quitApp() {
  app.isQuitting = true;
  send('cmd', { name: 'flush' });
  setTimeout(() => app.quit(), 400);
}

function glueOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  const want = virtualBounds();
  overlay.setBounds({ x: want.x, y: want.y, width: want.width, height: want.height });
}

function overlayCursor() {
  if (!overlay || overlay.isDestroyed()) return null;
  const b = overlay.getBounds();
  const pt = screen.getCursorScreenPoint();
  return { x: pt.x - b.x, y: pt.y - b.y };
}

let toolCursorPending = false;
function pushToolCursor() {
  if (toolCursorPending) return;
  toolCursorPending = true;
  setImmediate(() => {
    toolCursorPending = false;
    const p = overlayCursor();
    if (p) send('swatter-move', p);
  });
}

function applyLayer() {
  if (!overlay || overlay.isDestroyed()) return;
  glueOverlay();
  send('cmd', { name: 'watch', value: watch });
  if (watch) {
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    overlay.setAlwaysOnTop(false);
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    pinAboveDesktop(overlay);
  }
  if (toolOn()) raisePanelOverOverlay();
  else if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(false);
}

function applyTool() {
  if (!overlay || overlay.isDestroyed()) return;
  const on = toolOn();
  overlay.setFocusable(on);
  overlay.setIgnoreMouseEvents(!on);
  globalShortcut.unregister('Escape');
  stopRawMouse(overlay);
  let raw = false;
  if (on) {
    overlay.focus();
    raw = startRawMouse(overlay, () => pushToolCursor());
    pushToolCursor();
    const ok = globalShortcut.register('Escape', putAwaySwatter);
    if (!ok) process.stderr.write('[tool] Escape shortcut failed\n');
  } else if (panel && !panel.isDestroyed()) {
    panel.focus();
  }
  applyLayer();
  send('swatter', { on: swatterOn, raw: swatterOn && raw });
  send('rag', { on: ragOn, raw: ragOn && raw });
  send('net', { on: netOn, raw: netOn && raw });
  publishState();
}

function createOverlay(b) {
  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    transparent: true,
    frame: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(HERE, 'preload.mjs'),
      backgroundThrottling: false,
      sandbox: false,
    },
  });
  win.setMinimumSize(1, 1);
  win.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setMenu(null);
  win.loadFile(path.join(HERE, 'renderer', 'overlay.html'));
  win.on('focus', () => {
    applyLayer();
  });
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      quitApp();
    }
  });
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) process.stderr.write(`[overlay] ${message} (${source}:${line})\n`);
  });
  return win;
}

function createPanel() {
  const win = new BrowserWindow({
    width: 540,
    height: 640,
    useContentSize: true,
    minWidth: 480,
    minHeight: 320,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    title: '果蝇乐园',
    icon: ICON,
    backgroundColor: '#f4efe6',
    webPreferences: {
      preload: path.join(HERE, 'preload-panel.mjs'),
      sandbox: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(HERE, 'renderer', 'panel.html'));
  win.on('close', () => {
    app.isQuitting = true;
  });
  win.on('closed', () => {
    panel = null;
    quitApp();
  });
  win.webContents.on('did-finish-load', publishState);
  return win;
}

function overlayScreens() {
  if (!overlay || overlay.isDestroyed()) return [];
  const b = overlay.getBounds();
  return screen.getAllDisplays().map((d) => ({
    x: d.bounds.x - b.x,
    y: d.bounds.y - b.y,
    w: d.bounds.width,
    h: d.bounds.height,
  }));
}

function publishGeometry() {
  if (!overlay || overlay.isDestroyed()) return;
  const b = overlay.getBounds();
  send('retarget', { width: b.width, height: b.height, screens: overlayScreens() });
  publishIcons();
}

let lastLive = null;
const launches = new Map();
let lmbWas = false;
let press = null;
let lastClick = null;
const LAUNCH_MS = 30 * 60 * 1000;

function pruneLaunches() {
  const now = Date.now();
  for (const [k, t] of launches) {
    if (now - t > LAUNCH_MS) launches.delete(k);
  }
}

function iconKeyAt(pt) {
  if (!lastLive || !lastLive.length) return null;
  for (const ic of lastLive) {
    const tl = screen.screenToDipPoint({ x: ic.x, y: ic.y });
    const br = screen.screenToDipPoint({ x: ic.x + ic.w, y: ic.y + ic.h * 2 });
    if (pt.x >= tl.x && pt.x <= br.x && pt.y >= tl.y && pt.y <= br.y) {
      return ic.name || ic.id;
    }
  }
  return null;
}

function trackDesktopClicks() {
  const down = leftButtonDown();
  const pt = screen.getCursorScreenPoint();
  if (down && !lmbWas) {
    press = { x: pt.x, y: pt.y, key: iconKeyAt(pt) };
  }
  if (!down && lmbWas && press) {
    const dist = Math.hypot(pt.x - press.x, pt.y - press.y);
    if (dist <= 8 && press.key) {
      const now = Date.now();
      const windowMs = doubleClickMs();
      if (lastClick && lastClick.key === press.key && now - lastClick.t <= windowMs) {
        launches.set(press.key, now);
      }
      lastClick = { t: now, key: press.key };
    }
    press = null;
  }
  lmbWas = down;
}

function toOverlayIcons(list, physical) {
  if (!overlay || overlay.isDestroyed()) return [];
  const b = overlay.getBounds();
  return list.map((ic) => {
    let x = ic.x;
    let y = ic.y;
    let w = ic.w;
    let h = ic.h;
    if (physical) {
      const tl = screen.screenToDipPoint({ x, y });
      const br = screen.screenToDipPoint({ x: x + w, y: y + h });
      x = tl.x;
      y = tl.y;
      w = br.x - tl.x;
      h = br.y - tl.y;
    }
    return { ...ic, x: x - b.x, y: y - b.y, w, h };
  });
}

let uiaNames = null;
let nameAt = 0;
let binAt = 0;
let binHasCached = false;
let binName = '';
let binIndex = -1;

function fakeName(name) {
  const s = String(name || '').trim();
  return !s || /^\d+$/.test(s);
}

function recycleCached() {
  const now = Date.now();
  if (now - binAt > 2000) {
    binAt = now;
    binHasCached = recycleBinHasItems();
  }
  return binHasCached;
}

function keepNames(live) {
  if (!lastLive || !lastLive.length) return live;
  return live.map((ic, i) => {
    if (!fakeName(ic.name)) return ic;
    const prev = lastLive[i];
    if (!prev || fakeName(prev.name)) return ic;
    return { ...ic, name: prev.name, id: `live:${i}:${prev.name}` };
  });
}

function mergeNames(live) {
  if (!uiaNames || !uiaNames.length) return live;
  return live.map((ic) => {
    let best = null;
    let bd = 1e9;
    const cx = ic.x + ic.w / 2;
    const cy = ic.y + ic.h / 2;
    for (const n of uiaNames) {
      const d = Math.hypot(cx - (n.x + n.w / 2), cy - (n.y + n.h / 2));
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best || bd >= 90) return ic;
    const next = { ...ic };
    if (best.c && best.c.length) next.c = best.c;
    if (!fakeName(best.name) && fakeName(ic.name)) {
      next.name = String(best.name);
      next.id = `live:${ic.id}:${best.name}`;
    }
    return next;
  });
}

function rememberBin(list) {
  list.forEach((ic, i) => {
    if (isRecycleBinName(ic.name)) {
      binName = String(ic.name);
      binIndex = i;
    }
  });
}

function decorateIcons(list, physical) {
  const binHas = recycleCached();
  return toOverlayIcons(list, physical).map((ic, i) => {
    const isBin = isRecycleBinName(ic.name)
      || (binName && ic.name === binName)
      || (binIndex >= 0 && i === binIndex);
    return {
      ...ic,
      recycleBin: !!(binHas && isBin),
      lastLaunch: launches.get(ic.name) || launches.get(ic.id) || 0,
    };
  });
}

function publishIcons() {
  if (!overlay || overlay.isDestroyed()) return;
  if (toolOn()) return;
  const now = Date.now();
  if (now - nameAt > 8000) {
    nameAt = now;
    fetchLiveIcons().then((slow) => {
      if (slow && slow.length) uiaNames = slow;
    });
  }
  const live = fetchIconRects({ names: !binName });
  if (live && live.length) {
    lastLive = mergeNames(keepNames(live));
    rememberBin(lastLive);
    pruneLaunches();
    send('icons', { icons: decorateIcons(lastLive, true) });
    return;
  }
  if (lastLive && lastLive.length) send('icons', { icons: decorateIcons(lastLive, true) });
}

let prevCursor = null;

function pollMouse() {
  if (!overlay || overlay.isDestroyed()) return;
  if (!toolOn() && !watch && !cursorOnDesktop(overlay, panel)) {
    prevCursor = null;
    send('ambient', { mouse: { x: -9999, y: -9999, vx: 0, vy: 0 }, grabbing: false });
    return;
  }
  const b = overlay.getBounds();
  const c = screen.getCursorScreenPoint();
  let vx = 0;
  let vy = 0;
  if (prevCursor) {
    vx = (c.x - prevCursor.x) * 30;
    vy = (c.y - prevCursor.y) * 30;
  }
  prevCursor = { x: c.x, y: c.y };
  send('ambient', {
    mouse: { x: c.x - b.x, y: c.y - b.y, vx, vy },
    grabbing: leftButtonDown(),
  });
}

function refitDesktop() {
  const want = virtualBounds();
  if (overlay && !overlay.isDestroyed()) {
    overlay.setBounds({ x: want.x, y: want.y, width: want.width, height: want.height });
    pinAboveDesktop(overlay);
  }
  publishGeometry();
}

app.commandLine.appendSwitch('enable-transparent-visuals');
app.setAppUserModelId(isAnnoy ? 'com.desktopfly.welfare' : 'com.desktopfly.pet');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!panel || panel.isDestroyed()) return;
    if (panel.isMinimized()) panel.restore();
    panel.show();
    panel.focus();
  });

  app.whenReady().then(() => {
    STATS_FILE = path.join(app.getPath('userData'), 'fly-stats.json');
    SAVE_FILE = path.join(app.getPath('userData'), 'fly-save.json');
    SETTINGS_FILE = path.join(app.getPath('userData'), 'fly-settings.json');
    loadSettings();
    applyAutoStart();
    try {
      const s = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      greenPeak = Number(s.greenPeak) || 0;
    } catch { /* first run */ }
    try {
      const run = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
      if (!isAnnoy && run && run.v === 1 && run.breed) {
        savedRun = run;
        gate = true;
      }
    } catch { /* no run */ }
    overlay = createOverlay(virtualBounds());
    overlay.webContents.once('did-finish-load', () => {
      publishGeometry();
      send('cmd', { name: 'configure', annoy: isAnnoy, watch, breed });
      if (!gate) send('cmd', { name: 'startFresh' });
      applyLayer();
    });
    overlay.on('resize', publishGeometry);
    overlay.on('move', publishGeometry);

    panel = createPanel();
    panel.once('ready-to-show', () => panel.show());
    panel.show();

    setTimeout(() => {
      if (!overlay || overlay.isDestroyed()) return;
      mouseTimer = setInterval(pollMouse, 1000 / 30);
      iconTimer = setInterval(publishIcons, 400);
      clickTimer = setInterval(() => {
        if (!toolOn()) trackDesktopClicks();
      }, 50);
      pinTimer = setInterval(() => {
        if (!overlay || overlay.isDestroyed() || toolOn()) return;
        applyLayer();
      }, 2000);
    }, 800);

    ipcMain.on('snapshot', (_e, data) => {
      if (data && data.breed) writeSave(data);
    });

    ipcMain.on('fanfare', (_e, on) => {
      if (!overlay || overlay.isDestroyed()) return;
      if (on) {
        overlay.setAlwaysOnTop(true, 'screen-saver');
        overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } else {
        applyLayer();
      }
    });

    ipcMain.on('bottle', (_e, data) => {
      if (panel && !panel.isDestroyed()) panel.webContents.send('bottle', data);
    });

    ipcMain.on('swatter-off', putAwaySwatter);

    ipcMain.on('life-stats', (_e, s) => {
      if (isAnnoy) {
        const g = Number(s && s.green) || 0;
        if (g > greenPeak) {
          greenPeak = g;
          try { fs.writeFileSync(STATS_FILE, JSON.stringify({ greenPeak })); } catch { /* */ }
        }
      }
      if (panel && !panel.isDestroyed()) {
        panel.webContents.send('life-stats', isAnnoy ? { ...s, greenPeak } : { ...s, greenPeak: 0 });
      }
    });

    ipcMain.on('panel-ready', () => {
      publishState();
      if (panel && !panel.isDestroyed()) {
        panel.webContents.send('life-stats', isAnnoy ? { greenPeak } : { greenPeak: 0 });
      }
    });

    ipcMain.on('panel', (_e, msg) => {
      const name = msg?.name;
      if (name === 'swatter') {
        swatterOn = !swatterOn;
        if (swatterOn) { ragOn = false; netOn = false; }
        applyTool();
      } else if (name === 'rag') {
        ragOn = !ragOn;
        if (ragOn) { swatterOn = false; netOn = false; }
        applyTool();
      } else if (name === 'net') {
        netOn = !netOn;
        if (netOn) { swatterOn = false; ragOn = false; }
        applyTool();
      } else if (name === 'jarKill' || name === 'jarFree') {
        send('cmd', { name, id: msg.id });
      } else if (name === 'wash') {
        send('cmd', { name: 'wash' });
      } else if (name === 'swatter-off') {
        putAwaySwatter();
      } else if (name === 'addFly') {
        send('cmd', { name: 'addFly', morph: msg.morph, sex: msg.sex });
      } else if (name === 'scareAll') {
        send('cmd', { name: 'scareAll' });
      } else if (name === 'pause') {
        paused = !paused;
        send('cmd', { name: 'pause', value: paused });
        publishState();
      } else if (name === 'fast') {
        fast = !fast;
        send('cmd', { name: 'fast', value: fast });
        publishState();
      } else if (name === 'xray') {
        watch = !watch;
        applyLayer();
        publishState();
      } else if (name === 'autostart') {
        autoStart = !autoStart;
        applyAutoStart();
        saveSettings();
        publishState();
      } else if (name === 'resume') {
        if (isAnnoy) return;
        gate = false;
        breed = true;
        if (savedRun) send('cmd', { name: 'restore', data: savedRun });
        else send('cmd', { name: 'startFresh' });
        publishState();
      } else if (name === 'restart') {
        if (isAnnoy) return;
        gate = false;
        breed = true;
        clearSave();
        send('cmd', { name: 'startFresh' });
        publishState();
      } else if (name === 'quit') {
        quitApp();
      }
    });

    screen.on('display-removed', refitDesktop);
    screen.on('display-added', refitDesktop);
    screen.on('display-metrics-changed', refitDesktop);
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
app.on('before-quit', () => {
  app.isQuitting = true;
  if (overlay && !overlay.isDestroyed()) stopRawMouse(overlay);
  globalShortcut.unregisterAll();
  clearInterval(mouseTimer);
  clearInterval(iconTimer);
  clearInterval(pinTimer);
  clearInterval(clickTimer);
});
