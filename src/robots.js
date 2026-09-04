// robots.txt + sitemap.xml discovery over plain HTTP.
// Used for SEO crawl-access signals only (we are auditing on the owner's behalf).

import { fetchHeadish, HttpError } from './util.js';

export async function checkRobotsAndSitemap(origin) {
  const out = {
    robots: { status: 'unknown', detail: '', disallowsAll: false, sitemaps: [] },
    sitemap: { status: 'unknown', detail: '' },
  };

  let robotsRes = null;
  try {
    robotsRes = await fetchHeadish(`${origin}/robots.txt`, { timeoutMs: 10000 });
  } catch (e) {
    if (e instanceof HttpError) {
      out.robots = { status: e.status === 404 ? 'missing' : 'error', detail: `robots.txt → HTTP ${e.status}`, disallowsAll: false, sitemaps: [] };
      return finish(out);
    }
    out.robots = { status: 'error', detail: `robots.txt unreachable (${e.message})`, disallowsAll: false, sitemaps: [] };
    return finish(out);
  }

  if (!robotsRes.ok) {
    out.robots = { status: robotsRes.status === 404 ? 'missing' : 'error', detail: `robots.txt → HTTP ${robotsRes.status}`, disallowsAll: false, sitemaps: [] };
    return finish(out);
  }

  const body = robotsRes.head.toLowerCase();
  const userAgentAll = body.includes('user-agent: *');
  const disallowAll = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*($|\r?\n|#)/.test(body);
  const sitemaps = [...body.matchAll(/^sitemap:\s*(\S+)/gmi)].map((m) => m[1].trim());

  out.robots = {
    status: disallowAll && userAgentAll ? 'blocked' : 'ok',
    detail: disallowAll
      ? 'robots.txt blocks ALL crawlers (Disallow: / for user-agent: *)'
      : 'robots.txt is reachable and does not block crawling',
    disallowsAll: disallowAll,
    sitemaps,
  };

  // Sitemap: prefer one declared in robots.txt, else guess /sitemap.xml
  let sitemapUrl = sitemaps[0];
  let declared = true;
  if (!sitemapUrl) {
    sitemapUrl = `${origin}/sitemap.xml`;
    declared = false;
  }
  try {
    const sm = await fetchHeadish(sitemapUrl, { timeoutMs: 10000 });
    const isXml = (sm.headers['content-type'] || '').includes('xml') || /<(urlset|sitemapindex|url)/.test(sm.head);
    if (sm.ok && isXml) {
      out.sitemap = { status: 'ok', detail: `${declared ? 'Declared in robots.txt' : 'Found at'} ${sitemapUrl} (HTTP ${sm.status})` };
    } else if (sm.status === 404) {
      out.sitemap = { status: 'missing', detail: `No sitemap at ${sitemapUrl} (HTTP 404)` };
    } else {
      out.sitemap = { status: 'error', detail: `${sitemapUrl} → HTTP ${sm.status || 'unreachable'}` };
    }
  } catch (e) {
    out.sitemap = { status: 'error', detail: `Sitemap fetch failed (${e.message})` };
  }
  return finish(out);
}

function finish(out) {
  // Merge status into simple vocabulary used by analyzers.
  out.robotsStatus = out.robots.status; // ok | blocked | missing | error | unknown
  out.sitemapStatus = out.sitemap.status; // ok | missing | error | unknown
  return out;
}
