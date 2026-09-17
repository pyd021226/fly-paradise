import koffi from 'koffi';

const user32 = koffi.load('user32.dll');

const POINT = koffi.struct('POINT', {
  x: 'int32',
  y: 'int32',
});

const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)');
const WindowFromPoint = user32.func('void *__stdcall WindowFromPoint(POINT pt)');
const GetAncestor = user32.func('void *__stdcall GetAncestor(void *hWnd, uint32 gaFlags)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hWnd, void *lpClassName, int nMaxCount)');
const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int vKey)');
const SetWindowPos = user32.func(
  'bool __stdcall SetWindowPos(void *hWnd, void *hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)',
);

const GA_ROOT = 2;
const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_PIN = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE;

const DESKTOP = new Set([
  'Progman',
  'WorkerW',
  'SHELLDLL_DefView',
  'SysListView32',
  '#32769',
  'XamlExplorerHostIslandWindow',
  'Windows.UI.Composition.DesktopWindowContentBridge',
  'Microsoft.UI.Content.DesktopChildSiteBridge',
  'Windows.UI.Input.InputSite.WindowClass',
]);

function hwndVal(h) {
  if (h == null || h === 0) return 0n;
  if (typeof h === 'bigint') return h;
  if (typeof h === 'number') return BigInt(h >>> 0);
  if (Buffer.isBuffer(h)) {
    return h.length >= 8 ? h.readBigUInt64LE(0) : BigInt(h.readUInt32LE(0));
  }
  try { return BigInt(h); } catch { return 0n; }
}

function className(hwnd) {
  if (!hwndVal(hwnd)) return '';
  const buf = Buffer.alloc(128);
  const n = GetClassNameW(hwnd, buf, 64);
  if (!n) return '';
  return buf.toString('utf16le', 0, n * 2);
}

function nativeHwnd(win) {
  if (!win || win.isDestroyed?.()) return 0n;
  try {
    return hwndVal(win.getNativeWindowHandle());
  } catch {
    return 0n;
  }
}

export function pinAboveDesktop(win) {
  const h = nativeHwnd(win);
  if (!h) return;
  try {
    SetWindowPos(h, HWND_BOTTOM, 0, 0, 0, 0, SWP_PIN);
  } catch (err) {
    process.stderr.write(`[z] pin failed ${err.message}\n`);
  }
}

export function cursorOnDesktop(overlay, panel) {
  const pt = {};
  if (!GetCursorPos(pt)) return false;
  const hwnd = WindowFromPoint(pt);
  if (!hwndVal(hwnd)) return false;
  const root = GetAncestor(hwnd, GA_ROOT) || hwnd;
  const ov = nativeHwnd(overlay);
  const pn = nativeHwnd(panel);
  const hv = hwndVal(hwnd);
  const rv = hwndVal(root);
  if (ov && (hv === ov || rv === ov)) return true;
  if (pn && (hv === pn || rv === pn)) return false;
  return DESKTOP.has(className(hwnd)) || DESKTOP.has(className(root));
}

export function leftButtonDown() {
  return (GetAsyncKeyState(0x01) & 0x8000) !== 0;
}

const GetDoubleClickTime = user32.func('uint32 __stdcall GetDoubleClickTime()');

export function doubleClickMs() {
  const t = GetDoubleClickTime();
  return t > 0 ? t : 500;
}

const shell32 = koffi.load('shell32.dll');
const SHQUERYRBINFO = koffi.struct('SHQUERYRBINFO', {
  cbSize: 'uint32',
  _pad: 'uint32',
  i64Size: 'int64',
  i64NumItems: 'int64',
});
const SHQueryRecycleBinW = shell32.func(
  'int32 __stdcall SHQueryRecycleBinW(void *pszRootPath, _Inout_ SHQUERYRBINFO *pSHQueryRBInfo)',
);

export function recycleBinHasItems() {
  try {
    const info = { cbSize: 24, _pad: 0, i64Size: 0n, i64NumItems: 0n };
    const hr = SHQueryRecycleBinW(null, info);
    if (hr < 0) return false;
    return Number(info.i64NumItems) > 0;
  } catch {
    return false;
  }
}

export function isRecycleBinName(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return false;
  return s === '回收站' || s === 'recycle bin' || s.includes('回收站') || s.includes('recycle bin');
}
