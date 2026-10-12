import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('peek', {
  onDraw: (cb) => ipcRenderer.on('nest-draw', (_e, d) => cb(d)),
});
