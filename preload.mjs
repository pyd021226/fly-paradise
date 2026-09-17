import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fly', {
  onAmbient: (cb) => ipcRenderer.on('ambient', (_e, d) => cb(d)),
  onIcons: (cb) => ipcRenderer.on('icons', (_e, d) => cb(d)),
  onCmd: (cb) => ipcRenderer.on('cmd', (_e, d) => cb(d)),
  onSwatter: (cb) => ipcRenderer.on('swatter', (_e, d) => cb(d)),
  onRag: (cb) => ipcRenderer.on('rag', (_e, d) => cb(d)),
  onSwatterMove: (cb) => ipcRenderer.on('swatter-move', (_e, d) => cb(d)),
  onRetarget: (cb) => ipcRenderer.on('retarget', (_e, d) => cb(d)),
  putAway: () => ipcRenderer.send('swatter-off'),
  sendLife: (s) => ipcRenderer.send('life-stats', s),
  sendSnapshot: (s) => ipcRenderer.send('snapshot', s),
  fanfare: (on) => ipcRenderer.send('fanfare', !!on),
});
