'use strict';
const fs = require('fs'), path = require('path'), { app } = require('electron'), { execFile } = require('child_process');
const PSX = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const PS = Buffer.from("Add-Type -AssemblyName PresentationCore;$o=New-Object Windows.DataObject;$l=New-Object Collections.Specialized.StringCollection;[void]$l.Add($env:F);$o.SetFileDropList($l);$k=0;try{$o.SetImage([Windows.Media.Imaging.BitmapFrame]::Create([IO.File]::OpenRead($env:F),'None','OnLoad'))}catch{$k=3};[Windows.Clipboard]::SetDataObject($o,$true);exit $k", 'utf16le').toString('base64');
const name = (n) => path.basename(String(n || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'download';

function dir() { const d = (require('./settings').get().config.downloads || {}).dir; return d && fs.existsSync(d) ? d : app.getPath('downloads'); }
function free(n) {
  n = name(n);
  const d = dir(), x = path.extname(n), b = path.basename(n, x);
  let f = path.join(d, n);
  for (let i = 1; fs.existsSync(f); i++) f = path.join(d, b + ' (' + i + ')' + x);
  return f;
}
function save(f) { const t = free(path.basename(f)); fs.copyFileSync(f, t); return t; }
function stage(n, buf) {
  const d = path.join(app.getPath('temp'), '53on-share'), f = path.join(d, name(n));
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(f, buf);
  return f;
}
const copy = (f) => new Promise((ok) => execFile(PSX, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', PS],
  { env: Object.assign({}, process.env, { F: f }), windowsHide: true, timeout: 2e4 }, (e) => ok(!e ? 'image' : e.code === 3 ? 'file' : '')));

module.exports = { dir, free, save, stage, copy };
