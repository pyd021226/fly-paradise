import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { createCpuBalancer, openCpuApi } from '../src/cpu-affinity.js';

let balancer, cpuStatus = 'not started', initialCpuSets;

// Isolated hidden window: does not start the game or modify its save/settings.
app.setPath('userData', fileURLToPath(new URL('../.benchmark-profile', import.meta.url)));
const timeout = setTimeout(() => { console.error('Benchmark timed out'); app.exit(1); }, 120000);
ipcMain.on('benchmark-result', (_event, result) => {
  balancer?.dispose();
  const check = openCpuApi().attach(process.pid);
  const restored = JSON.stringify(check.read()) === JSON.stringify(initialCpuSets);
  check.close();
  console.log(JSON.stringify({ ...result, cpuStatus, restored, gpu: app.getGPUFeatureStatus() }, null, 2));
  clearTimeout(timeout);
  app.exit(result.error || !restored ? 1 : 0);
});
app.whenReady().then(async () => {
console.log('Electron ready');
const win = new BrowserWindow({ show: false, webPreferences: {
  nodeIntegration: true, contextIsolation: false, backgroundThrottling: false,
} });
win.webContents.on('console-message', (_event, level, message) => {
  if (level >= 2) console.error(message);
});
win.webContents.on('render-process-gone', (_event, details) => console.error(details));
await win.loadFile(fileURLToPath(new URL('./benchmark-render.html', import.meta.url)));
console.log('Benchmark page loaded');
const initial = openCpuApi().attach(process.pid);
initialCpuSets = initial.read();
initial.close();
balancer = createCpuBalancer({ getRendererPid: () => win.webContents.getOSProcessId(), report: s => { cpuStatus = s; } });
balancer.setPopulation(192);
}).catch(error => { console.error(error); app.exit(1); });
