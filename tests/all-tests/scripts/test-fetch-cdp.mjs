import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:9222/devtools/page/429E52E1AA86A204A8197AF68C3978F0');
let msgId = 1;

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    id: msgId++,
    method: 'Runtime.evaluate',
    params: {
      expression: `
        (async () => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const r = await fetch('/api/health', { signal: controller.signal });
            clearTimeout(timeout);
            return { status: r.status, ok: r.ok, text: await r.text().then(t => t.slice(0, 200)) };
          } catch (e) {
            return { error: e.message, name: e.name };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log('Fetch result:', JSON.stringify(msg.result, null, 2));
    ws.close();
  }
});

setTimeout(() => ws.close(), 15000);
