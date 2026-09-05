// Dev helper: drive the local UI in a real Chrome, run an analysis,
// and capture a full-page PNG of the rendered report (for docs/demo).
// Usage: node scripts/ui-shot.js <url> <out.png>
import fs from 'node:fs';
import { launchChrome } from '../src/chrome.js';

const [targetUrl, outPath] = process.argv.slice(2);
if (!targetUrl || !outPath) {
  console.error('usage: node scripts/ui-shot.js <url> <out.png>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = await launchChrome(['--window-size=1440,2400', '--force-device-scale-factor=1']);

try {
  const { cdp } = await (async () => {
    const list = await fetch(`http://127.0.0.1:${chrome.port}/json/list`).then((r) => r.json());
    const page = list.find((t) => t.type === 'page') || list[0];
    const ws = new (await import('ws')).default(page.webSocketDebuggerUrl);
    await new Promise((res) => ws.once('open', res));
    return { cdp: makeCdp(ws) };
  })();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  // 1. open the UI
  await cdp.send('Page.navigate', { url: process.env.UI_URL || 'http://localhost:3100' });
  await sleep(2500);

  // 2. fill URL + click Analyze (GEO LLM analysis always runs server-side)
  await cdp.send('Runtime.evaluate', {
    expression: `
      document.getElementById('urlInput').value = ${JSON.stringify(targetUrl)};
      document.getElementById('analyzeForm').requestSubmit();
    `,
  });

  // 3. wait for report render (poll)
  let done = false;
  for (let i = 0; i < 180; i++) {
    await sleep(2000);
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `({ reportVisible: !document.getElementById('report').classList.contains('hidden'), btn: document.getElementById('goBtn').textContent })`,
      returnByValue: true,
    });
    if (result.value.reportVisible) { done = true; break; }
    if (result.value.btn === 'Analyze' && i > 3) { console.error('job failed or errored'); break; }
  }
  if (!done) { console.error('report never rendered'); process.exit(2); }

  await sleep(1500);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log(`saved ${outPath} (${Buffer.from(data, 'base64').length} bytes)`);
  process.exit(0);
} finally {
  await chrome.kill().catch(() => {});
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
