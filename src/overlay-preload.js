const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__overlay', {
  onAction: (cb) => ipcRenderer.on('action', (_e, msg) => cb(msg)),
  send: (msg) => ipcRenderer.send('overlay-msg', msg),
  hotRect: (id, rect) => ipcRenderer.send('overlay-hotrect', { id, rect }),
});
