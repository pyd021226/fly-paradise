import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('shopBridge', {
  session: () => ipcRenderer.invoke('fly-shop-session'),
});
