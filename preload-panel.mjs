import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('panel', {
  send: (name, extra) => ipcRenderer.send('panel', { name, ...(extra || {}) }),
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  onLife: (cb) => ipcRenderer.on('life-stats', (_e, d) => cb(d)),
  ready: () => ipcRenderer.send('panel-ready'),
});
