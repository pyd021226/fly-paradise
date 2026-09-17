import koffi from 'koffi';

const WM_INPUT = 0x00FF;
const RID_INPUT = 0x10000003;
const RIDEV_INPUTSINK = 0x00000100;
const RIDEV_REMOVE = 0x00000001;
const RIM_TYPEMOUSE = 0;
const HEADER_SIZE = 24;
const RID_SIZE = 16;

const user32 = koffi.load('user32.dll');
const RegisterRawInputDevices = user32.func(
  'int __stdcall RegisterRawInputDevices(void *pRawInputDevices, uint32 uiNumDevices, uint32 cbSize)',
);
const GetRawInputData = user32.func(
  'uint32 __stdcall GetRawInputData(uint64 hRawInput, uint32 uiCommand, void *pData, uint32 *pcbSize, uint32 cbSizeHeader)',
);

let hooked = null;

function makeRid(hwnd, flags) {
  const buf = Buffer.alloc(RID_SIZE);
  buf.writeUInt16LE(1, 0);
  buf.writeUInt16LE(2, 2);
  buf.writeUInt32LE(flags, 4);
  if (hwnd && !(flags & RIDEV_REMOVE)) {
    hwnd.copy(buf, 8, 0, Math.min(8, hwnd.length));
  }
  return buf;
}

function handleFromLParam(lParam) {
  if (Buffer.isBuffer(lParam)) {
    if (lParam.length >= 8) return lParam.readBigUInt64LE(0);
    if (lParam.length >= 4) return BigInt(lParam.readUInt32LE(0));
  }
  return BigInt(lParam);
}

function parseMouse(lParam) {
  const h = handleFromLParam(lParam);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(64, 0);
  const data = Buffer.alloc(64);
  const n = GetRawInputData(h, RID_INPUT, data, size, HEADER_SIZE);
  if (n === 0xFFFFFFFF || n === 0) return null;
  if (data.readUInt32LE(0) !== RIM_TYPEMOUSE) return null;
  const flags = data.readUInt16LE(24);
  if (flags & 0x01) return null;
  const dx = data.readInt32LE(36);
  const dy = data.readInt32LE(40);
  if (!dx && !dy) return null;
  return { dx, dy };
}

export function startRawMouse(win, onDelta) {
  stopRawMouse(win);
  const hwnd = win.getNativeWindowHandle();
  const ok = RegisterRawInputDevices(makeRid(hwnd, RIDEV_INPUTSINK), 1, RID_SIZE);
  if (!ok) {
    process.stderr.write('[raw-mouse] RegisterRawInputDevices failed\n');
    return false;
  }
  win.hookWindowMessage(WM_INPUT, (_wParam, lParam) => {
    try {
      const d = parseMouse(lParam);
      if (d) onDelta(d.dx, d.dy);
    } catch (err) {
      process.stderr.write(`[raw-mouse] ${err.message}\n`);
    }
  });
  hooked = win;
  return true;
}

export function stopRawMouse(win) {
  const target = win || hooked;
  if (!target || target.isDestroyed?.()) {
    hooked = null;
    return;
  }
  try { target.unhookWindowMessage(WM_INPUT); } catch { /* already gone */ }
  try {
    RegisterRawInputDevices(makeRid(null, RIDEV_REMOVE), 1, RID_SIZE);
  } catch { /* ignore */ }
  hooked = null;
}
