import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('cabinet',{list:()=>ipcRenderer.invoke('cabinet-list'),back:()=>ipcRenderer.invoke('cabinet-back'),onRefresh:cb=>ipcRenderer.on('cabinet-refresh',()=>cb()),
onEscape:cb=>ipcRenderer.on('cabinet-escape',()=>cb()),
adults:()=>ipcRenderer.invoke('cabinet-adults'),
make:(arg)=>ipcRenderer.invoke('cabinet-make',arg),
note:(arg)=>ipcRenderer.invoke('cabinet-note',arg),
name:(arg)=>ipcRenderer.invoke('cabinet-name',arg),sell:(arg)=>ipcRenderer.invoke('cabinet-sell',arg)});
