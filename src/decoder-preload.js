'use strict';
const { ipcRenderer } = require('electron');
ipcRenderer.on('dec:do', async (e, id, b) => {
  try {
    const a = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const n = a.length, c = a.numberOfChannels, out = new Float32Array(n);
    for (let k = 0; k < c; k++) { const d = a.getChannelData(k); for (let i = 0; i < n; i++) out[i] += d[i] / c; }
    ipcRenderer.send('dec:done', id, '', new Uint8Array(out.buffer));
  } catch (x) { ipcRenderer.send('dec:done', id, String((x && x.message) || x), null); }
});
