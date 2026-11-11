'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  loadVideo: (input) => ipcRenderer.invoke('load-video', input),
  command: (cmd) => ipcRenderer.invoke('player-command', cmd),
  zoomSharePlay: () => ipcRenderer.invoke('zoom-share-play'),
  zoomStop: () => ipcRenderer.invoke('zoom-stop'),
  onStatus: (fn) => ipcRenderer.on('player-status', (_e, s) => fn(s)),
  onZoomStatus: (fn) => ipcRenderer.on('zoom-status', (_e, s) => fn(s)),
});
