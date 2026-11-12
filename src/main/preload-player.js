'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  report: (status) => ipcRenderer.send('player-status', status),
  onTitlebar: (fn) => ipcRenderer.on('titlebar', (_e, show) => fn(show)),
  windowControl: (cmd) => ipcRenderer.send('player-window', cmd),
  onCommand: (fn) => ipcRenderer.on('player-command', (_e, cmd) => fn(cmd)),
});
