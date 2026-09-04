// Headless Chrome lifecycle + minimal CDP client.
// One Chrome instance serves two consumers: (1) our own rendered-DOM capture
// via CDP, (2) Lighthouse, which can attach to the same debugging port.

import { launch } from 'chrome-launcher';
import WebSocket from 'ws';

export async function launchChrome(extraFlags = []) {
  const chrome = await launch({
    chromeFlags: [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1360,940',
      '--disable-dev-shm-usage',
      ...extraFlags,
    ],
    logLevel: 'error',
  });
  return chrome;
}

/** Tiny CDP client over one WebSocket. */
export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        const cbs = this.listeners.get(msg.method) || [];
        for (const cb of cbs) cb(msg.params);
      }
    });
  }

  static async connect(port) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const target = list.find((t) => t.type === 'page') || list[0];
    if (!target) throw new Error('No CDP target available.');
    const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise((res, rej) => {
      ws.once('open', res);
      ws.once('error', rej);
    });
    return new CDP(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, cb) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(cb);
  }

  once(method) {
    return new Promise((resolve) => {
      const handler = (params) => {
        this.listeners.set(method, (this.listeners.get(method) || []).filter((h) => h !== handler));
        resolve(params);
      };
      this.on(method, handler);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* noop */
    }
  }
}

/** Open a fresh page target on the shared Chrome and return its CDP session. */
export async function newPage(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { cdp: new CDP(ws), targetId: target.id };
}

export async function closePage(port, targetId) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`);
  } catch {
    /* noop */
  }
}
