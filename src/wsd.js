'use strict';
const http = require('http'), crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', MAX = 64 * 1024 * 1024;   // a long voice is a few MB

function frame(op, b) {
  const n = b.length, h = Buffer.alloc(n < 126 ? 2 : n < 65536 ? 4 : 10);
  h[0] = 0x80 | op;
  if (n < 126) h[1] = n; else if (n < 65536) { h[1] = 126; h.writeUInt16BE(n, 2); } else { h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, b]);
}

function peer(sock, head) {
  const on = { message: [], close: [] }, parts = [];
  let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0), size = 0, live = true;
  const emit = (k, v) => on[k].forEach((f) => { try { f(v); } catch (_) {} });
  const end = () => { if (!live) return; live = false; try { sock.destroy(); } catch (_) {} emit('close'); };
  const bye = (b) => { if (!live) return; live = false; try { sock.end(frame(8, b)); } catch (_) {} emit('close'); };
  const eat = () => {
    while (live && buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 15;
      let n = buf[1] & 127, o = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); o = 4; }
      else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); o = 10; }
      if (!(buf[1] & 0x80) || (buf[0] & 0x70) || size + n > MAX) return end();   // a client masks every frame; no RSV was agreed
      if (buf.length < o + 4 + n) return;
      const k = buf.subarray(o, o + 4), p = Buffer.from(buf.subarray(o + 4, o + 4 + n));
      for (let i = 0; i < n; i++) p[i] ^= k[i & 3];
      buf = buf.subarray(o + 4 + n);
      if (op === 8) return bye(p.subarray(0, 2));
      if (op === 9) { try { sock.write(frame(10, p)); } catch (_) {} continue; }
      if (op === 10) continue;
      parts.push(p); size += n;
      if (!fin) continue;
      const t = Buffer.concat(parts).toString('utf8');
      parts.length = 0; size = 0;
      let m = null;
      try { m = JSON.parse(t); } catch (_) {}
      if (m && typeof m === 'object') emit('message', m);
    }
  };
  sock.on('data', (d) => { buf = buf.length ? Buffer.concat([buf, d]) : d; eat(); });
  sock.on('close', end);
  sock.on('error', end);
  setImmediate(eat);   // the upgrade's head may already hold a frame
  return {
    send: (o) => { if (live) { try { sock.write(frame(1, Buffer.from(JSON.stringify(o)))); } catch (_) {} } },
    on: (k, f) => { on[k].push(f); },
    close: () => bye(Buffer.from([3, 232])),   // 1000: normal
  };
}

function listen(port, onPeer) {
  return new Promise((resolve) => {
    const peers = new Set();
    const srv = http.createServer((q, r) => { r.writeHead(426); r.end(); });
    srv.on('upgrade', (q, sock, head) => {
      sock.on('error', () => {});
      const key = String(q.headers['sec-websocket-key'] || '');
      if (q.headers.origin != null || !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(q.headers.host || '') || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
        try { sock.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); } catch (_) {}
        return;
      }
      sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        crypto.createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n');
      sock.setNoDelay(true);
      const p = peer(sock, head);
      peers.add(p);
      p.on('close', () => peers.delete(p));
      onPeer(p);
    });
    srv.on('error', (e) => resolve({ ok: false, error: e && e.code === 'EADDRINUSE' ? 'port_taken:' + port : 'door_failed' }));
    srv.listen(port, '127.0.0.1', () => resolve({ ok: true, close: () => { for (const p of peers) p.close(); try { srv.close(); } catch (_) {} } }));
  });
}

module.exports = { listen: listen };
