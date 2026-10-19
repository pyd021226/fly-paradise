import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fly', {
  onAmbient: (cb) => ipcRenderer.on('ambient', (_e, d) => cb(d)),
  onIcons: (cb) => ipcRenderer.on('icons', (_e, d) => cb(d)),
  onCmd: (cb) => ipcRenderer.on('cmd', (_e, d) => cb(d)),
  onSwatter: (cb) => ipcRenderer.on('swatter', (_e, d) => cb(d)),
  onRag: (cb) => ipcRenderer.on('rag', (_e, d) => cb(d)),
  onNet: (cb) => ipcRenderer.on('net', (_e, d) => cb(d)),
  onBottle: (cb) => ipcRenderer.on('bottle', (_e, d) => cb(d)),
  sendBottle: (s) => ipcRenderer.send('bottle', s),
  onSwatterMove: (cb) => ipcRenderer.on('swatter-move', (_e, d) => cb(d)),
  onRetarget: (cb) => ipcRenderer.on('retarget', (_e, d) => cb(d)),
  putAway: () => ipcRenderer.send('swatter-off'),
  sendLife: (s) => ipcRenderer.send('life-stats', s),
  sendSnapshot: (s) => ipcRenderer.send('snapshot', s),
  // 遇见索引上报：主进程落盘后回调，失败时追踪器会保留待写记录重试。
  sendCabinetReply: (payload) => ipcRenderer.send('cabinet-reply', payload),
  onCabinetRequest: (cb) => ipcRenderer.on('cabinet-request', (_e, d) => cb(d)),
  notifyCabinetRestored: (runId) => ipcRenderer.send('cabinet-restored', runId),
  seenEncounterColors: () => new Promise((resolve) => {
    const once = (_e, data) => { ipcRenderer.removeListener('encounter-seen-colors-result', once); resolve(data); };
    ipcRenderer.once('encounter-seen-colors-result', once);
    ipcRenderer.send('encounter-seen-colors');
  }),
  sendEncounter: (payload, cb) => {
    if (typeof cb === 'function') {
      const once = (_e, data) => { ipcRenderer.removeListener('encounter-result', once); cb(data); };
      ipcRenderer.once('encounter-result', once);
    }
    ipcRenderer.send('encounter-seen', payload);
  },
  fanfare: (on) => ipcRenderer.send('fanfare', !!on),
  signIn: (email, password) => ipcRenderer.invoke('fly-signin', { email, password }),
  signOut: () => ipcRenderer.invoke('fly-signout'),
  currentUser: () => ipcRenderer.invoke('fly-current-user'),
  spawnFly: (sex) => ipcRenderer.invoke('fly-spawn', { sex }),
  ensureGuest: () => ipcRenderer.invoke('fly-ensure-guest'),
  breed: (a, b, appendFrom, sex) => ipcRenderer.invoke('fly-breed', { a, b, appendFrom, sex }),
  submitRecord: (timeMs) => ipcRenderer.invoke('fly-submit-record', { timeMs }),
  submitMutation: (flyId) => ipcRenderer.invoke('fly-submit-mutation', { flyId }),
  addPoint: (n) => ipcRenderer.invoke('fly-add-point', { n }),
  getPoints: () => ipcRenderer.invoke('fly-get-points'),
  createListing: (kind, flyIds, note, want, instar, color, genes) => ipcRenderer.invoke('fly-create-listing', { kind, flyIds, note, want, instar, color, genes }),
  unlistListing: (id) => ipcRenderer.invoke('fly-unlist-listing', { id }),
  reportBug: (message, extra) => ipcRenderer.invoke('fly-report-bug', { message, extra }),
});
