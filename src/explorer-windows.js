import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PS1 = path.join(HERE, 'explorer-windows.ps1');

const BIN_RE = /recycle|645ff040|\$recycle\.bin/i;

export function nestKeyFromExplorer(pathStr, url) {
  const u = String(url || '');
  const p = String(pathStr || '');
  if (BIN_RE.test(u) || BIN_RE.test(p)) return ':bin';
  const n = p.replace(/\//g, '\\').replace(/\\+$/, '').trim();
  return n ? n.toLowerCase() : null;
}

export function fetchExplorerWindows(timeoutMs = 2500) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', PS1],
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const data = JSON.parse(stdout.trim() || '[]');
          const arr = Array.isArray(data) ? data : (data ? [data] : []);
          resolve(arr.map((w) => ({
            hwnd: Number(w.hwnd) || 0,
            path: String(w.path || ''),
            url: String(w.url || ''),
            nestKey: nestKeyFromExplorer(w.path, w.url),
          })).filter((w) => w.hwnd && w.nestKey));
        } catch {
          resolve([]);
        }
      },
    );
  });
}
