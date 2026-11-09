'use strict';
const http = require('http');
const { runPowerShell, runBash } = require('./spine.js');
const { classify } = require('./guard.js');
const { prune } = require('./prune.js');

const OLLAMA = { host: '127.0.0.1', port: 11434, path: '/v1/chat/completions' };
const MAX_ITER = 6;

const TOOLS = [
  { type: 'function', function: {
    name: 'PowerShell',
    description: 'Ejecuta un comando de PowerShell en ESTA PC (Windows) y devuelve su salida real. Úsalo para inspeccionar el sistema, archivos, procesos, versiones. NO inventes la respuesta: llama la herramienta.',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'El comando PowerShell' } }, required: ['command'] },
  }},
  { type: 'function', function: {
    name: 'Bash',
    description: 'Ejecuta un comando de bash (Git Bash) en ESTA PC y devuelve su salida real.',
    parameters: { type: 'object', properties: { command: { type: 'string', description: 'El comando bash' } }, required: ['command'] },
  }},
];

function chat(model, messages) {
  return new Promise(function (resolve, reject) {
    const body = JSON.stringify({ model: model, messages: messages, tools: TOOLS, stream: false });
    const req = http.request({
      host: OLLAMA.host, port: OLLAMA.port, path: OLLAMA.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, function (res) {
      let d = ''; res.on('data', function (c) { d += c; });
      res.on('end', function () { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('parse: ' + d.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function runOneTool(tc) {
  let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
  const cmd = args.command || '';
  const fn = tc.function.name === 'Bash' ? runBash : runPowerShell;
  const r = await fn(cmd);
  let text = r.outputText || '(sin salida)';
  if (r.timed_out) text += '\n[TIMEOUT]';
  else if (r.exit_code) text += '\n[exit ' + r.exit_code + ']';
  if (r.truncated) text += '\n[...salida truncada]';
  return text;
}

async function runAgent(userMsg, opts) {
  opts = opts || {};
  const model = opts.model || 'qwen3vl8b-ablit:latest';
  const onStep = opts.onStep || function () {};
  const confirm = opts.confirm || function () { return Promise.resolve(false); };
  const messages = [
    { role: 'system', content: 'Eres un asistente con acceso REAL a esta PC (Windows) por PowerShell y bash. Cuando necesites un dato del sistema o ejecutar algo, LLAMA la herramienta — nunca inventes la salida. El shell NO recuerda comandos previos (sin estado); usa rutas absolutas. Responde claro y corto.' },
    { role: 'user', content: userMsg },
  ];
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const resp = await chat(model, messages);
    const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
    if (!msg) { onStep({ type: 'answer', content: '(respuesta vacía del modelo)' }); return; }
    messages.push(msg);
    if (msg.tool_calls && msg.tool_calls.length) {
      for (const tc of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
        const cmd = args.command || '';
        const v = classify(cmd);
        onStep({ type: 'tool', name: tc.function.name, cmd: cmd, verdict: v });
        let allowed = v.risk === 'safe';
        if (!allowed) allowed = await confirm(cmd, v);        // 🔒 el DUEÑO decide
        if (!allowed) {
          onStep({ type: 'held', name: tc.function.name, cmd: cmd, reason: v.reason });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: '⛔ NO EJECUTADO — el usuario NO dio permiso (' + v.reason + '). Explícale qué harías y por qué, sin reintentar.' });
          continue;
        }
        const text = await runOneTool(tc);
        onStep({ type: 'result', name: tc.function.name, cmd: cmd, text: text });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: prune(text) });
      }
      continue;
    }
    onStep({ type: 'answer', content: msg.content || '(vacío)' });
    return;
  }
  onStep({ type: 'answer', content: '(tope de iteraciones)' });
}

module.exports = { runAgent };
