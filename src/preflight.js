// Fast DNS preflight: reject nonexistent domains before any Chrome/Lighthouse work.
// A typo'd or dead domain currently costs 30-90s of rendering before failing —
// this turns NXDOMAIN into a ~1s, clearly-worded error.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const defaultLookup = (host) => lookup(host, { all: true });

/**
 * Resolve the hostname to prove the domain exists. Skips localhost and IP literals.
 * @param {string} hostname e.g. "example.com" or "[::1]"
 * @param {{lookupFn?: Function, timeoutMs?: number}} [opts]  lookupFn injectable for tests
 * @returns {Promise<true>}
 * @throws {Error} friendly message on NXDOMAIN / timeout / other lookup failure
 */
export async function checkDomainResolves(hostname, { lookupFn = defaultLookup, timeoutMs = 5000 } = {}) {
  const host = String(hostname).replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (isIP(host) || host === 'localhost') return true; // no DNS needed

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await lookupFn(host);
    return true;
  } catch (e) {
    const code = e.code || '';
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'EAI_AGAIN') {
      throw new Error(
        `"${host}" does not resolve (${code}) — it may not exist or is misspelled. Check the spelling, or try the "www." variant.`,
      );
    }
    if (e.name === 'AbortError' || code === 'ETIMEOUT') {
      throw new Error(`DNS lookup for "${host}" timed out after ${timeoutMs}ms.`);
    }
    throw new Error(`DNS lookup for "${host}" failed (${code || e.message}).`);
  } finally {
    clearTimeout(timer);
  }
}
