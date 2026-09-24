import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('panel', {
  send: (name, extra) => ipcRenderer.send('panel', { name, ...(extra || {}) }),
  onState: (cb) => ipcRenderer.on('state', (_e, d) => cb(d)),
  onLife: (cb) => ipcRenderer.on('life-stats', (_e, d) => cb(d)),
  onBottle: (cb) => ipcRenderer.on('bottle', (_e, d) => cb(d)),
  ready: () => ipcRenderer.send('panel-ready'),
  signIn: (email, password) => ipcRenderer.invoke('fly-signin', { email, password }),
  signOut: () => ipcRenderer.invoke('fly-signout'),
  currentUser: () => ipcRenderer.invoke('fly-current-user'),
  getLeaderboard: () => ipcRenderer.invoke('fly-leaderboard'),
  listListings: () => ipcRenderer.invoke('fly-list-listings'),
  unlistListing: (id) => ipcRenderer.invoke('fly-unlist-listing', { id }),
  listOffers: () => ipcRenderer.invoke('fly-list-offers'),
  acceptOffer: (id) => ipcRenderer.invoke('fly-accept-offer', { id }),
  rejectOffer: (id) => ipcRenderer.invoke('fly-reject-offer', { id }),
  claimOffer: (id) => ipcRenderer.invoke('fly-claim-offer', { id }),
  createListing: (kind, flyIds, note, want, instar, color) => ipcRenderer.invoke('fly-create-listing', { kind, flyIds, note, want, instar, color }),
  addPoint: (n) => ipcRenderer.invoke('fly-add-point', { n }),
  getPoints: () => ipcRenderer.invoke('fly-get-points'),
});
