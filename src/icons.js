import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PS1 = path.join(HERE, 'icon-positions.ps1');

function listNames(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !SKIP.has(e.name.toLowerCase()))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function readMetric(name, fallback) {
  try {
    const out = execFileSync('reg', [
      'query', 'HKCU\\Control Panel\\Desktop\\WindowMetrics', '/v', name,
    ], { encoding: 'utf8', timeout: 1500, windowsHide: true });
    const m = out.match(/REG_SZ\s+(-?\d+)/);
    if (!m) return fallback;
    const px = Math.abs(Number(m[1])) / 15;
    return px > 40 && px < 200 ? px : fallback;
  } catch {
    return fallback;
  }
}

export function listDesktopIconsGrid(screen) {
  const primary = screen.getPrimaryDisplay();
  const work = primary.workArea;
  const scale = primary.scaleFactor || 1;
  const names = [
    ...listNames(path.join(os.homedir(), 'Desktop')),
    ...listNames('C:\\Users\\Public\\Desktop'),
  ];
  const seen = new Set();
  const unique = names.filter((n) => (seen.has(n) ? false : seen.add(n)));

  const cellW = readMetric('IconSpacing', 76 * scale) / scale;
  const cellH = readMetric('IconVerticalSpacing', 92 * scale) / scale;
  const padX = 4;
  const padY = 2;
  const maxRows = Math.max(1, Math.floor((work.height - padY) / Math.max(48, cellH)));
  const iconW = Math.min(64, Math.max(40, cellW - 8));
  const iconH = Math.min(72, Math.max(40, cellH - 8));

  return unique.map((name, i) => {
    const row = i % maxRows;
    const col = Math.floor(i / maxRows);
    return {
      id: `${col}:${row}:${name}`,
      name,
      x: work.x + padX + col * cellW,
      y: work.y + padY + row * cellH,
      w: iconW,
      h: iconH,
      source: 'grid',
    };
  });
}

export function fetchLiveIcons(timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', PS1],
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const data = JSON.parse(stdout.trim());
          const arr = Array.isArray(data) ? data : [data];
          if (!arr.length || arr[0] == null) return resolve(null);
          resolve(arr.map((ic, i) => ({
            id: `live:${i}:${ic.name}`,
            name: String(ic.name || ''),
            x: Number(ic.x),
            y: Number(ic.y),
            w: Number(ic.w),
            h: Number(ic.h),
            c: Array.isArray(ic.c) ? ic.c : [],
            source: 'uia',
            physical: true,
          })));
        } catch {
          resolve(null);
        }
      },
    );
  });
}
