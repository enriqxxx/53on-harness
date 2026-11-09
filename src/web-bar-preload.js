'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('WebBar', {
  words: ipcRenderer.sendSync('web:words'),
  go: (op, u) => ipcRenderer.send('web:bar', String(op), String(u || '')),
  on: (cb) => ipcRenderer.on('web:at', (_e, s) => cb(s)),
});
