// Render capture: drives a real Chrome tab to the target URL, waits for the
// page to settle, then grabs (a) the fully rendered HTML, (b) a screenshot,
// (c) response facts of the main document. Lighthouse runs on the same Chrome.

import { CDP, newPage, closePage, launchChrome } from './chrome.js';
import { normalizeUrl } from './util.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Renders `url`, waits for stability, returns:
 * { html, screenshotDataUrl, httpStatus, finalUrl, mimeType }
 */
export async function captureRendered(url, { settleMs = 2500, maxWaitMs = 45000, port } = {}) {
  const debugPort = port ?? (await ensureChrome()).port;
  const { cdp, targetId } = await newPage(debugPort);

  const docMeta = { document: null };
  cdp.on('Network.responseReceived', (p) => {
    if (p.type === 'Document' && p.response) {
      docMeta.document = {
        status: p.response.status,
        mimeType: p.response.mimeType,
        finalUrl: p.response.url,
        headers: p.response.headers,
      };
    }
  });

  try {
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setUserAgentOverride', { userAgent: UA });
    await cdp.send('Runtime.enable');

    const loadEvent = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await Promise.race([loadEvent, sleep(maxWaitMs)]);

    // let client-side rendering / late content finish
    await sleep(settleMs);
    await waitReady(cdp, maxWaitMs);

    const doc = docMeta.document;
    if (doc && !(doc.mimeType || '').includes('html')) {
      throw new Error(`Target returned ${doc.mimeType || 'non-HTML'} content (HTTP ${doc.status}) — nothing to analyze.`);
    }
    // Note: some sites (e.g. Wikipedia) serve a 404 status line with the real
    // page content. We analyze whatever renders and surface the status as an
    // explicit HTTP-status check in the SEO category instead of hard-failing.

    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'document.documentElement ? document.documentElement.outerHTML : "<html></html>"',
      returnByValue: true,
    });
    const html = result.value || '<html></html>';

    let shot = null;
    try {
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 55,
        captureBeyondViewport: false,
      });
      shot = data; // base64 jpeg
    } catch {
      /* screenshots are best-effort */
    }

    return {
      html,
      screenshotDataUrl: shot ? `data:image/jpeg;base64,${shot}` : null,
      httpStatus: doc?.status ?? 0,
      finalUrl: doc?.finalUrl ?? normalizeUrl(url),
      mimeType: doc?.mimeType || 'text/html',
    };
  } finally {
    cdp.close();
    await closePage(debugPort, targetId).catch(() => {});
  }
}

async function waitReady(cdp, maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (result.value === 'complete') return;
    await sleep(400);
  }
}

/** Shared Chrome instance for the whole run (also used by Lighthouse). */
let sharedChrome = null;
export async function ensureChrome() {
  if (!sharedChrome) {
    sharedChrome = await launchChrome();
  }
  return sharedChrome;
}

export async function closeChrome() {
  if (sharedChrome) {
    try {
      // chrome-launcher's kill() may return a promise or undefined depending on version
      await (sharedChrome.kill() ?? Promise.resolve());
    } catch {
      /* already gone */
    }
    sharedChrome = null;
  }
}

export function chromePort() {
  return sharedChrome?.port ?? null;
}
