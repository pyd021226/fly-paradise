import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const FindWindowW = user32.func('void *__stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)');
const FindWindowExW = user32.func(
  'void *__stdcall FindWindowExW(void *hWndParent, void *hWndChildAfter, str16 lpszClass, str16 lpszWindow)',
);
const SendMessageTimeoutW = user32.func(
  'intptr __stdcall SendMessageTimeoutW(void *hWnd, uint32 Msg, uintptr wParam, uintptr lParam, uint32 fuFlags, uint32 uTimeout, void *lpdwResult)',
);
const SMTO_ABORTIFHUNG = 0x0002;
const smResult = Buffer.alloc(8);

function sendLv(hwnd, msg, wParam, lParam) {
  smResult.fill(0);
  const r = SendMessageTimeoutW(hwnd, msg, wParam, lParam || 0, SMTO_ABORTIFHUNG, 10, smResult);
  if (!r) return { ok: false, value: 0 };
  return { ok: true, value: Number(smResult.readBigUInt64LE(0)) };
}
const GetWindowThreadProcessId = user32.func(
  'uint32 __stdcall GetWindowThreadProcessId(void *hWnd, void *lpdwProcessId)',
);
const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void *hWnd, void *lpRect)');
const IsWindow = user32.func('bool __stdcall IsWindow(void *hWnd)');
const SetThreadDpiAwarenessContext = user32.func('void *__stdcall SetThreadDpiAwarenessContext(void *dpiContext)');

const OpenProcess = kernel32.func('void *__stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)');
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *hObject)');
const VirtualAllocEx = kernel32.func(
  'void *__stdcall VirtualAllocEx(void *hProcess, void *lpAddress, uintptr dwSize, uint32 flAllocationType, uint32 flProtect)',
);
const VirtualFreeEx = kernel32.func(
  'bool __stdcall VirtualFreeEx(void *hProcess, void *lpAddress, uintptr dwSize, uint32 dwFreeType)',
);
const ReadProcessMemory = kernel32.func(
  'bool __stdcall ReadProcessMemory(void *hProcess, void *lpBaseAddress, void *lpBuffer, uintptr nSize, uintptr *lpNumberOfBytesRead)',
);
const WriteProcessMemory = kernel32.func(
  'bool __stdcall WriteProcessMemory(void *hProcess, void *lpBaseAddress, void *lpBuffer, uintptr nSize, uintptr *lpNumberOfBytesWritten)',
);

const LVM_GETITEMCOUNT = 0x1004;
const LVM_GETITEMRECT = 0x100E;
const LVM_GETITEMTEXTW = 0x1073;
const LVIF_TEXT = 1;
const LVIR_ICON = 1;
const ACCESS = 0x0438;
const MEM_COMMIT = 0x1000;
const MEM_RELEASE = 0x8000;
const PAGE_READWRITE = 0x04;
const REMOTE_SIZE = 1024;

const init = Buffer.alloc(16);
const buf = Buffer.alloc(16);
const pidBuf = Buffer.alloc(4);
const wrBuf = Buffer.alloc(16);
const itemBuf = Buffer.alloc(64);
const textBuf = Buffer.alloc(520);

let sess = null;

function hwndVal(h) {
  if (h == null || h === 0) return 0n;
  if (typeof h === 'bigint') return h;
  if (typeof h === 'number') return BigInt(h >>> 0);
  if (Buffer.isBuffer(h)) {
    return h.length >= 8 ? h.readBigUInt64LE(0) : BigInt(h.readUInt32LE(0));
  }
  try { return BigInt(h); } catch { return 0n; }
}

function findListView() {
  const progman = FindWindowW('Progman', 'Program Manager');
  let def = FindWindowExW(progman, null, 'SHELLDLL_DefView', null);
  if (!hwndVal(def)) {
    let worker = null;
    for (let i = 0; i < 32; i++) {
      worker = FindWindowExW(null, worker, 'WorkerW', null);
      if (!hwndVal(worker)) break;
      def = FindWindowExW(worker, null, 'SHELLDLL_DefView', null);
      if (hwndVal(def)) break;
    }
  }
  if (!hwndVal(def)) return null;
  const lv = FindWindowExW(def, null, 'SysListView32', 'FolderView');
  return hwndVal(lv) ? lv : null;
}

function dropSess() {
  if (!sess) return;
  try { if (sess.remote) VirtualFreeEx(sess.proc, sess.remote, 0, MEM_RELEASE); } catch { /* */ }
  try { if (sess.proc) CloseHandle(sess.proc); } catch { /* */ }
  sess = null;
}

function openSess() {
  const lv = findListView();
  if (!lv) return null;
  GetWindowThreadProcessId(lv, pidBuf);
  const pid = pidBuf.readUInt32LE(0);
  if (!pid) return null;
  const proc = OpenProcess(ACCESS, false, pid);
  if (!hwndVal(proc)) return null;
  const remote = VirtualAllocEx(proc, null, REMOTE_SIZE, MEM_COMMIT, PAGE_READWRITE);
  if (!hwndVal(remote)) {
    CloseHandle(proc);
    return null;
  }
  return { lv, proc, remote, remoteN: hwndVal(remote), pid };
}

function ensureSess() {
  if (sess && IsWindow(sess.lv)) return sess;
  dropSess();
  sess = openSess();
  return sess;
}

function readItemName(s, index) {
  try {
    const textAddr = s.remoteN + 80n;
    const blob = Buffer.alloc(600);
    blob.writeUInt32LE(LVIF_TEXT, 16);
    blob.writeInt32LE(index, 20);
    blob.writeInt32LE(0, 24);
    blob.writeBigUInt64LE(textAddr, 40);
    blob.writeInt32LE(260, 48);
    if (!WriteProcessMemory(s.proc, s.remote, blob, 600, null)) return '';
    const sent = sendLv(s.lv, LVM_GETITEMTEXTW, index, s.remoteN + 16n);
    if (!sent.ok) return '';
    blob.fill(0);
    if (!ReadProcessMemory(s.proc, s.remote, blob, 600, null)) return '';
    const text = blob.slice(80);
    let end = 0;
    while (end + 1 < text.length && (text[end] || text[end + 1])) end += 2;
    return text.toString('utf16le', 0, end).trim();
  } catch {
    return '';
  }
}

export function fetchIconRects({ names = false } = {}) {
  try {
    try { SetThreadDpiAwarenessContext(-4); } catch { /* older Windows */ }
    const s = ensureSess();
    if (!s) return null;
    const cnt = sendLv(s.lv, LVM_GETITEMCOUNT, 0, 0);
    if (!cnt.ok || cnt.value < 1) {
      dropSess();
      return null;
    }
    if (!GetWindowRect(s.lv, wrBuf)) return null;
    const wrL = wrBuf.readInt32LE(0);
    const wrT = wrBuf.readInt32LE(4);
    const n = Math.min(cnt.value, 80);
    const out = [];
    for (let i = 0; i < n; i++) {
      init.writeInt32LE(LVIR_ICON, 0);
      for (let b = 4; b < 16; b++) init[b] = 0;
      if (!WriteProcessMemory(s.proc, s.remote, init, 16, null)) {
        dropSess();
        return null;
      }
      const rect = sendLv(s.lv, LVM_GETITEMRECT, i, s.remoteN);
      if (!rect.ok) {
        dropSess();
        return out.length ? out : null;
      }
      if (!ReadProcessMemory(s.proc, s.remote, buf, 16, null)) continue;
      const l = buf.readInt32LE(0);
      const t = buf.readInt32LE(4);
      const r = buf.readInt32LE(8);
      const btm = buf.readInt32LE(12);
      const w = r - l;
      const h = btm - t;
      if (w < 8 || h < 8) continue;
      const name = names ? (readItemName(s, i) || String(i)) : String(i);
      out.push({
        id: `live:${i}:${name}`,
        name,
        x: l + wrL,
        y: t + wrT,
        w,
        h,
        source: 'lv',
        physical: true,
      });
    }
    return out.length ? out : null;
  } catch (err) {
    dropSess();
    process.stderr.write(`[icons] ${err.message}\n`);
    return null;
  }
}
