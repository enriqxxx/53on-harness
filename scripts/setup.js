// builds 53on-setup.exe (installer/setup.nsi) carrying dist/win-unpacked packed as 7z, with the 7-Zip and the NSIS that
// electron-builder resolves: fetched to its cache on first use, so a fresh PC builds too.
//   node scripts/setup.js [out.exe]    · a lab gives its own app and version (SETUP_APP, SETUP_VER) and moves the shortcuts
//   and the registry key (SETUP_DESK, SETUP_MENU, SETUP_KEY)
// Azure Artifact Signing (package.json "sign") only with AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET set: labs and forks
// build unsigned. Timestamped, so the signature outlives its 3-day certificate
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip'), { getMakeNsisPath, getNsisPluginsPath } = require('app-builder-lib/out/toolsets/windows');
const ROOT = path.join(__dirname, '..'), pkg = require(path.join(ROOT, 'package.json'));
const out = path.resolve(process.argv[2] || path.join(ROOT, pkg.build.directories.output, '53on-setup.exe'));
const app = path.resolve(process.env.SETUP_APP || path.join(ROOT, pkg.build.directories.output, 'win-unpacked'));
if (!fs.existsSync(path.join(app, '53on.exe'))) { console.error('no app to carry: ' + app); process.exit(1); }
const az = !process.env.SETUP_APP && process.env.AZURE_CLIENT_SECRET && pkg.sign;
const sign = (p) => az && execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', "$ErrorActionPreference = 'Stop'\n" +
  "if (-not (Get-Module -ListAvailable TrustedSigning)) { Install-PackageProvider NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null; Install-Module TrustedSigning -MinimumVersion 0.5.0 -Force -Repository PSGallery -Scope CurrentUser }\n" +
  "Get-ChildItem -LiteralPath $env:SIGN_PATH -Recurse -File | Where-Object { $_.Extension -eq '.exe' -and (Get-AuthenticodeSignature -LiteralPath $_.FullName).Status -ne 'Valid' } | ForEach-Object {\n" +
  " Invoke-TrustedSigning -Endpoint $env:SIGN_EP -CodeSigningAccountName $env:SIGN_ACC -CertificateProfileName $env:SIGN_PROF -TimestampRfc3161 http://timestamp.acs.microsoft.com -TimestampDigest SHA256 -FileDigest SHA256 -Files $_.FullName }"],
  { stdio: 'inherit', env: Object.assign({}, process.env, { SIGN_PATH: p, SIGN_EP: az.endpoint, SIGN_ACC: az.codeSigningAccountName, SIGN_PROF: az.certificateProfileName }) });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setup_pack_')), pack = path.join(tmp, 'app.7z');
  try {
    sign(app);
    execFileSync(await getPath7za(), ['a', '-t7z', '-mx=9', '-bso0', '-bsp0', pack, '.\\*'], { cwd: app, stdio: 'inherit' });
    const lab = ['DESK', 'MENU', 'KEY'].filter((k) => process.env['SETUP_' + k]).map((k) => '-D' + k + '=' + process.env['SETUP_' + k]);
    const nsis = await getMakeNsisPath(), res = path.dirname(await getNsisPluginsPath());
    execFileSync(nsis.path, ['-V2', '-INPUTCHARSET', 'UTF8', '-DOUT=' + out, '-DPACK=' + pack, '-DRES=' + res, '-DVER=' + (process.env.SETUP_VER || pkg.version)]
      .concat(lab, path.join(ROOT, 'installer', 'setup.nsi')), { stdio: 'inherit', env: Object.assign({}, process.env, nsis.env) });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  sign(out);
  console.log(out + ' · ' + fs.statSync(out).size + ' b' + (az ? ' · signed' : ''));
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
