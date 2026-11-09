'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('CodexPanel', {
  watch: function () { return ipcRenderer.invoke('panel:watch'); },
  refresh: function () { return ipcRenderer.invoke('panel:refresh'); },
  drag: function (on, h) { ipcRenderer.send('panel:drag', !!on, +h || 0); },
  close: function () { ipcRenderer.send('panel:toggle', false); },
  open: function () { ipcRenderer.send('panel:toggle', true); },
  flip: function () { ipcRenderer.send('panel:toggle'); },
  onEntry: function (f) { ipcRenderer.on('panel:entry', function (e, x) { f(x); }); },
  onTab: function (f) { ipcRenderer.on('panel:tab', function (e, t) { f(t); }); },
  onState: function (f) { ipcRenderer.on('panel:state', function (e, o) { f(o); }); },
  onNotes: function (f) { ipcRenderer.on('panel:notes', function (e, l, n) { f(l, n); }); },
  note: function (tag) { ipcRenderer.send('panel:note', String(tag || '')); },
  seen: function (clear) { ipcRenderer.send('panel:notes', !!clear); },
});
