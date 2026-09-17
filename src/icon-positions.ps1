$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class DesktopIconPos {
  [DllImport("user32.dll")]
  static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
  [DllImport("user32.dll")]
  static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")]
  static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")]
  static extern bool BitBlt(IntPtr a, int x, int y, int cx, int cy, IntPtr b, int x1, int y1, int rop);
  [DllImport("kernel32.dll")]
  static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")]
  static extern IntPtr VirtualAllocEx(IntPtr h, IntPtr a, uint s, uint t, uint p);
  [DllImport("kernel32.dll")]
  static extern bool VirtualFreeEx(IntPtr h, IntPtr a, uint s, uint t);
  [DllImport("kernel32.dll")]
  static extern bool ReadProcessMemory(IntPtr h, IntPtr a, byte[] b, int n, out int r);
  [DllImport("kernel32.dll")]
  static extern bool WriteProcessMemory(IntPtr h, IntPtr a, byte[] b, int n, out int w);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  const uint LVM_GETITEMCOUNT = 0x1004;
  const uint LVM_GETITEMRECT = 0x100E;
  const int LVIR_ICON = 1;
  const uint ACCESS = 0x0438;
  const uint MEM_COMMIT = 0x1000;
  const uint MEM_RELEASE = 0x8000;
  const uint PAGE_READWRITE = 0x04;
  const int SRCCOPY = 0x00CC0020;

  static IntPtr FindListView() {
    IntPtr progman = FindWindow("Progman", "Program Manager");
    IntPtr def = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
    if (def == IntPtr.Zero) {
      EnumWindows((h, l) => {
        IntPtr d = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (d != IntPtr.Zero) { def = d; return false; }
        return true;
      }, IntPtr.Zero);
    }
    if (def == IntPtr.Zero) return IntPtr.Zero;
    return FindWindowEx(def, IntPtr.Zero, "SysListView32", "FolderView");
  }

  static string Contour(int sx, int sy, int w, int h) {
    if (w < 8 || h < 8 || w > 160 || h > 160) return "[]";
    Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    Graphics g = Graphics.FromImage(bmp);
    IntPtr hdc = g.GetHdc();
    IntPtr scr = GetDC(IntPtr.Zero);
    BitBlt(hdc, 0, 0, w, h, scr, sx, sy, SRCCOPY);
    g.ReleaseHdc(hdc);
    ReleaseDC(IntPtr.Zero, scr);
    g.Dispose();
    BitmapData bd = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    int stride = Math.Abs(bd.Stride);
    byte[] pix = new byte[stride * h];
    Marshal.Copy(bd.Scan0, pix, 0, pix.Length);
    bmp.UnlockBits(bd);
    bmp.Dispose();
    int[] cx4 = { 0, w - 1, 0, w - 1 };
    int[] cy4 = { 0, 0, h - 1, h - 1 };
    int cr = 0, cg = 0, cb = 0;
    for (int i = 0; i < 4; i++) {
      int o = cy4[i] * stride + cx4[i] * 4;
      cb += pix[o]; cg += pix[o + 1]; cr += pix[o + 2];
    }
    cr /= 4; cg /= 4; cb /= 4;
    bool[] fg = new bool[w * h];
    int sxn = 0, syn = 0, fn = 0;
    for (int y = 0; y < h; y++) {
      for (int x = 0; x < w; x++) {
        int o = y * stride + x * 4;
        int d = Math.Abs(pix[o + 2] - cr) + Math.Abs(pix[o + 1] - cg) + Math.Abs(pix[o] - cb);
        if (d > 42) { fg[y * w + x] = true; sxn += x; syn += y; fn++; }
      }
    }
    if (fn < 10) return "[]";
    double mx = sxn / (double)fn, my = syn / (double)fn;
    List<int[]> raw = new List<int[]>();
    for (int y = 1; y < h - 1; y++) {
      for (int x = 1; x < w - 1; x++) {
        if (!fg[y * w + x]) continue;
        if (!fg[y * w + x - 1] || !fg[y * w + x + 1] || !fg[(y - 1) * w + x] || !fg[(y + 1) * w + x])
          raw.Add(new int[] { x, y });
      }
    }
    if (raw.Count < 6) return "[]";
    raw.Sort((a, b) => Math.Atan2(a[1] - my, a[0] - mx).CompareTo(Math.Atan2(b[1] - my, b[0] - mx)));
    int step = Math.Max(1, raw.Count / 22);
    StringBuilder s = new StringBuilder();
    s.Append("[");
    bool first = true;
    for (int i = 0; i < raw.Count; i += step) {
      if (!first) s.Append(",");
      first = false;
      s.Append("[" + raw[i][0] + "," + raw[i][1] + "]");
    }
    s.Append("]");
    return s.ToString();
  }

  public static string Dump() {
    try { SetThreadDpiAwarenessContext((IntPtr)(-4)); } catch {}
    IntPtr lv = FindListView();
    if (lv == IntPtr.Zero) return "[]";
    int count = SendMessage(lv, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
    if (count <= 0) return "[]";
    uint pid;
    GetWindowThreadProcessId(lv, out pid);
    IntPtr proc = OpenProcess(ACCESS, false, pid);
    if (proc == IntPtr.Zero) return "[]";
    IntPtr remote = VirtualAllocEx(proc, IntPtr.Zero, 16, MEM_COMMIT, PAGE_READWRITE);
    if (remote == IntPtr.Zero) { CloseHandle(proc); return "[]"; }
    RECT wr;
    GetWindowRect(lv, out wr);
    var sb = new StringBuilder();
    sb.Append("[");
    bool first = true;
    byte[] init = new byte[16];
    byte[] buf = new byte[16];
    int written, read;
    int n = Math.Min(count, 200);
    for (int i = 0; i < n; i++) {
      Array.Clear(init, 0, 16);
      BitConverter.GetBytes(LVIR_ICON).CopyTo(init, 0);
      if (!WriteProcessMemory(proc, remote, init, 16, out written)) continue;
      SendMessage(lv, LVM_GETITEMRECT, new IntPtr(i), remote);
      if (!ReadProcessMemory(proc, remote, buf, 16, out read) || read < 16) continue;
      int l = BitConverter.ToInt32(buf, 0);
      int t = BitConverter.ToInt32(buf, 4);
      int r = BitConverter.ToInt32(buf, 8);
      int btm = BitConverter.ToInt32(buf, 12);
      int w = r - l;
      int h = btm - t;
      if (w < 8 || h < 8) continue;
      int x = l + wr.Left;
      int y = t + wr.Top;
      string c = Contour(x, y, w, h);
      if (!first) sb.Append(",");
      first = false;
      sb.Append("{\"name\":\"" + i + "\",\"x\":" + x + ",\"y\":" + y + ",\"w\":" + w + ",\"h\":" + h + ",\"c\":" + c + "}");
    }
    sb.Append("]");
    VirtualFreeEx(proc, remote, 0, MEM_RELEASE);
    CloseHandle(proc);
    return sb.ToString();
  }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'DesktopIconPos').Type) {
  Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing -Language CSharp
}
[DesktopIconPos]::Dump()
