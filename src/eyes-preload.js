const { ipcRenderer, contextBridge } = require('electron');
contextBridge.exposeInMainWorld('__eyes', {
  onGrab: (cb) => ipcRenderer.on('grab', (_e, job) => cb(job)),
  done: (id, r) => ipcRenderer.send('eyes-done', { id: id, r: r }),
});
