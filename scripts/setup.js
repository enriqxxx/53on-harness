// builds 53on-setup.exe (installer/setup.nsi) carrying dist/win-unpacked packed as 7z, with the 7-Zip and the NSIS that
// electron-builder resolves: fetched to its cache on first use, so a fresh PC builds too.
//   node scripts/setup.js [out.exe]    · a lab gives its own app and version (SETUP_APP, SETUP_VER) and moves the shortcuts
//   and the registry key (SETUP_DESK, SETUP_MENU, SETUP_KEY)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip'), { getMakeNsisPath, getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows');
const ROOT = path.join(__dirname, '..'), pkg = require(path.join(ROOT, 'package.json'));
const out = path.resolve(process.argv[2] || path.join(ROOT, pkg.build.directories.output, '53on-setup.exe'));
const app = path.resolve(process.env.SETUP_APP || path.join(ROOT, pkg.build.directories.output, 'win-unpacked'));
if (!fs.existsSync(path.join(app, '53on.exe'))) { console.error('no app to carry: ' + app); process.exit(1); }
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setup_pack_')), pack = path.join(tmp, 'app.7z');
  try {
    execFileSync(await getPath7za(), ['a', '-t7z', '-mx=9', '-bso0', '-bsp0', pack, '.\\*'], { cwd: app, stdio: 'inherit' });
    const lab = ['DESK', 'MENU', 'KEY'].filter((k) => process.env['SETUP_' + k]).map((k) => '-D' + k + '=' + process.env['SETUP_' + k]);
    const nsis = await getMakeNsisPath(), res = path.dirname(await getNsisPluginsPath());
    execFileSync(nsis.path, ['-V2', '-INPUTCHARSET', 'UTF8', '-DOUT=' + out, '-DPACK=' + pack, '-DRES=' + res, '-DVER=' + (process.env.SETUP_VER || pkg.version)]
      .concat(lab, path.join(ROOT, 'installer', 'setup.nsi')), { stdio: 'inherit', env: Object.assign({}, process.env, nsis.env) });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(out + ' · ' + fs.statSync(out).size + ' b');
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
