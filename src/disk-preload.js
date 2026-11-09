'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const call = function (cb, s) { webFrame.executeJavaScript('(function(f,p){typeof f==="function"&&f(p)})(window[' + JSON.stringify(String(cb)) + '],' + JSON.stringify(s) + ')').catch(function () {}); };
const disk = function (v) { return function (a, b) { return ipcRenderer.sendSync('fs', v, a, b); }; };
contextBridge.exposeInMainWorld('FileSystemBridge', {
  handleCommand: disk('cmd'), fsRead: disk('read'), fsWrite: disk('write'), fsAppend: disk('append'), fsList: disk('list'),
  fsExists: disk('exists'), fsDelete: disk('del'), fsMkdir: disk('mkdir'), fsMediaSave: disk('media'), fsReadBase64: disk('b64'),
  fsRename: disk('rename'),
  fsDownload: function (url, dest, cb) { ipcRenderer.invoke('fs:dl', url, dest).then(function (r) { call(cb, r === 'ok' ? 'ok' : ''); }, function () { call(cb, ''); }); },
});
