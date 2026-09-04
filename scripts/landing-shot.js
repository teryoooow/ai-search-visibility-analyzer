// Capture the analyzer landing UI (top of page) — dev helper for quick visual checks.
// Usage: node scripts/landing-shot.js <out.png> [h=height]
import { launchChrome } from '../src/chrome.js';

const outPath = process.argv[2] || 'landing.png';
const vh = Number(process.argv[3] || 900);
const chrome = await launchChrome([`--window-size=1440,${vh}`, '--force-device-scale-factor=1']);

try {
  const list = await fetch(`http://127.0.0.1:${chrome.port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new (await import('ws')).default(page.webSocketDebuggerUrl);
  await new Promise((res) => ws.once('open', res));
  const cdp = makeCdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.navigate', { url: 'http://localhost:3100' });
  await new Promise((r) => setTimeout(r, 3000));
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log('saved:', outPath, Buffer.from(data, 'base64').length, 'bytes');
  process.exit(0);
} catch (e) {
  console.error('ERR', e.message);
  process.exit(1);
}

function makeCdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });
  return {
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
  };
}
