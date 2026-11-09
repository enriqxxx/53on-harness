'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ShellNav', {
  home: function () { ipcRenderer.send('nav:home'); },
  messages: function () { ipcRenderer.send('nav:messages'); },
  ai: function () { ipcRenderer.send('nav:ai'); },
  t: function () { return ipcRenderer.sendSync('i18n:bar') || {}; },   // its words, in the Arnés's language (i18n.js)
  onAi: function (cb) { ipcRenderer.on('nav:ai', function (_e, on) { cb(!!on); }); },   // the page's AI in Play or not
  onState: function (cb) { ipcRenderer.on('nav:state', function (_e, s) { cb(s); }); },
});

contextBridge.exposeInMainWorld('ShellMode', {
  get: function () { return ipcRenderer.invoke('codex:mode:get'); },
  set: function (m) { return ipcRenderer.invoke('codex:mode:set', m); },
});

contextBridge.exposeInMainWorld('ShellApp', {
  fullscreen: function () { ipcRenderer.send('app:fullscreen-toggle'); },
  menu: function () { ipcRenderer.send('app:menu'); },
  onFocus: function (cb) { ipcRenderer.on('shell:focus', function (_e, b) { cb(b); }); },
  onNotify: function (cb) { ipcRenderer.on('shell:notify', function (_e, n) { cb(n); }); },
  onUpdate: function (cb) { ipcRenderer.on('shell:update', function (_e, u) { cb(u); }); },
  update: function () { ipcRenderer.send('app:update'); },
});
