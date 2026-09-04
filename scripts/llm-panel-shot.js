// Capture just the LLM second-opinion panel element after a full UI analysis.
// Usage: LLM panel must render server-side (server started with GEO_LLM_* env).
//   node scripts/llm-panel-shot.js <url> <out.png> [UI_URL]
import fs from 'node:fs';
import { launchChrome } from '../src/chrome.js';

const [targetUrl, outPath] = process.argv.slice(2);
if (!targetUrl || !outPath) { console.error('usage: node scripts/llm-panel-shot.js <url> <out.png>'); process.exit(1); }
const uiUrl = process.env.UI_URL || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = await launchChrome(['--window-size=1440,2400', '--force-device-scale-factor=1']);

try {
  const list = await fetch(`http://127.0.0.1:${chrome.port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new (await import('ws')).default(page.webSocketDebuggerUrl);
  await new Promise((res) => ws.once('open', res));
  const cdp = makeCdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  await cdp.send('Page.navigate', { url: uiUrl });
  await sleep(2500);

  // submit with LLM toggle on
  await cdp.send('Runtime.evaluate', {
    expression: `
      document.getElementById('urlInput').value = ${JSON.stringify(targetUrl)};
      document.getElementById('llmToggle').checked = true;
      document.getElementById('analyzeForm').requestSubmit();
    `,
  });

  // wait for the LLM panel to become visible with real content
  let ok = false;
  for (let i = 0; i < 150; i++) {
    await sleep(2000);
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const p = document.getElementById('llmPanel'); const b = document.getElementById('llmBody'); return { vis: !p.classList.contains('hidden'), len: b ? b.innerText.length : 0 }; })()`,
      returnByValue: true,
    });
    if (result.value.vis && result.value.len > 80) { ok = true; break; }
  }
  if (!ok) { console.error('LLM panel never rendered with content'); process.exit(2); }

  // dump panel text for verification (readable without vision)
  const txt = await cdp.send('Runtime.evaluate', {
    expression: `document.getElementById('llmBody').innerText`,
    returnByValue: true,
  });
  console.log('=== LLM PANEL TEXT ===\n' + String(txt.result.value).slice(0, 1200) + '\n=== END ===');

  // element rect (full-page coordinates) then clipped capture
  const rect = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const r = document.getElementById('llmPanel').getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; })()`,
    returnByValue: true,
  });
  const rc = rect.result.value;
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: Math.max(0, rc.x - 4), y: Math.max(0, rc.y - 4), width: rc.w + 8, height: rc.h + 8, scale: 1 },
  });
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
