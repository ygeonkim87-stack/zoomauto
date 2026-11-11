'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  loadVideo: (input) => ipcRenderer.invoke('load-video', input),
  command: (cmd) => ipcRenderer.invoke('player-command', cmd),
  zoomSharePlay: () => ipcRenderer.invoke('zoom-share-play'),
  zoomStop: () => ipcRenderer.invoke('zoom-stop'),
  videos: {
    list: () => ipcRenderer.invoke('videos-list'),
    add: (v) => ipcRenderer.invoke('videos-add', v),
    update: (id, v) => ipcRenderer.invoke('videos-update', id, v),
    remove: (id) => ipcRenderer.invoke('videos-remove', id),
    move: (id, d) => ipcRenderer.invoke('videos-move', id, d),
    play: (id) => ipcRenderer.invoke('videos-play', id),
  },
  onStatus: (fn) => ipcRenderer.on('player-status', (_e, s) => fn(s)),
  onZoomStatus: (fn) => ipcRenderer.on('zoom-status', (_e, s) => fn(s)),
});
