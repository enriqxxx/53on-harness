'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Options', {
  get: function () { return ipcRenderer.invoke('options:get'); },
  set: function (o) { return ipcRenderer.invoke('options:set', o); },
});
