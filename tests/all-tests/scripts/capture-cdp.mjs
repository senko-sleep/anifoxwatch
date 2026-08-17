import WebSocket from 'ws';
import fs from 'fs';

const pageDebuggerUrl = 'ws://localhost:9222/devtools/page/429E52E1AA86A204A8197AF68C3978F0';

const ws = new WebSocket(pageDebuggerUrl);
const errors = [];
const warnings = [];
const logs = [];
let msgId = 1;

ws.on('open', () => {
  console.log('Connected to Edge debugger');
  ws.send(JSON.stringify({ id: msgId++, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: msgId++, method: 'Log.enable' }));
  ws.send(JSON.stringify({ id: msgId++, method: 'Network.enable' }));
  ws.send(JSON.stringify({ id: msgId++, method: 'Page.reload', ignoreCache: false }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.method === 'Runtime.consoleAPICalled') {
    const type = msg.params.type;
    const text = msg.params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
    if (type === 'error') errors.push(`[console.error] ${text}`);
    else if (type === 'warning') warnings.push(`[console.warn] ${text}`);
    else logs.push(`[console.${type}] ${text}`);
  }
  
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(`[Exception] ${msg.params.exceptionDetails?.text || msg.params.exceptionDetails?.exception?.description || 'Unknown'}`);
  }
  
  if (msg.method === 'Network.responseReceived') {
    const resp = msg.params.response;
    if (resp.status >= 400) {
      errors.push(`[HTTP ${resp.status}] ${resp.url}`);
    }
  }
});

ws.on('close', () => {
  console.log('Connection closed');
  console.log(`Errors (${errors.length}):`, errors.slice(0, 30));
  console.log(`Warnings (${warnings.length}):`, warnings.slice(0, 10));
  console.log(`Logs (${logs.length}):`, logs.slice(0, 30));
  
  const result = { errors, warnings, logs };
  fs.writeFileSync('console-capture-cdp.json', JSON.stringify(result, null, 2));
});

setTimeout(() => {
  ws.close();
}, 20000);
