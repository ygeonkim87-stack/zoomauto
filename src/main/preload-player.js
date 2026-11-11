'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  report: (status) => ipcRenderer.send('player-status', status),
  onCommand: (fn) => ipcRenderer.on('player-command', (_e, cmd) => fn(cmd)),
});
