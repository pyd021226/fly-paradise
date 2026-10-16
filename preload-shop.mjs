import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('shopBridge', {
  session: () => ipcRenderer.invoke('fly-shop-session'),
  unlist: (id) => ipcRenderer.invoke('fly-shop-unlist', { id }),
  buy: (id) => ipcRenderer.invoke('fly-shop-buy', { id }),
});
