import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../src/util.js';

describe('normalizeUrl — accepted inputs', () => {
  it('prepends https:// to a bare domain', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });
  it('accepts a full https URL and keeps path/query', () => {
    expect(normalizeUrl('https://example.com/blog/post?q=seo#x')).toBe('https://example.com/blog/post?q=seo#x');
  });
  it('accepts http:// (redirect-following handles upgrade)', () => {
    expect(normalizeUrl('http://example.com/')).toBe('http://example.com/');
  });
  it('handles subdomains and multi-label TLDs', () => {
    expect(normalizeUrl('sub.domain.co.uk/x')).toBe('https://sub.domain.co.uk/x');
  });
  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com/');
  });
  it('allows localhost with a port (local dev)', () => {
    expect(normalizeUrl('localhost:3100')).toBe('https://localhost:3100/');
  });
  it('allows IP addresses with a port', () => {
    expect(normalizeUrl('127.0.0.1:8080/health')).toBe('https://127.0.0.1:8080/health');
  });
  it('accepts punycode (IDN) hosts', () => {
    expect(normalizeUrl('https://xn--r8jz45g.jp/')).toBe('https://xn--r8jz45g.jp/');
    expect(normalizeUrl('https://例え.jp/')).toBe('https://xn--r8jz45g.jp/');
  });
});

describe('normalizeUrl — rejected inputs', () => {
  const bad = (input, re) => {
    expect(() => normalizeUrl(input), JSON.stringify(input)).toThrow(re);
  };
  it('rejects empty / whitespace-only input', () => {
    bad('', /No URL/);
    bad('   ', /No URL/);
    bad(null, /No URL/);
  });
  it('rejects a single word with no domain (typo or intranet guess)', () => {
    bad('hello', /domain/);
    bad('myproject', /domain/);
  });
  it('rejects spaces inside the hostname', () => {
    bad('my site.com', /valid URL/);
    bad('https://exa mple.com', /valid URL/);
    bad('https://my%20site.com', /valid URL/);
  });
  it('rejects non-http(s) schemes', () => {
    bad('javascript:alert(1)', /Only http/);
    bad('ftp://files.example.com', /Only http/);
    bad('file:///etc/passwd', /Only http/);
  });
  it('rejects URLs with embedded credentials', () => {
    bad('https://user:pass@example.com', /credentials/);
    bad('user:pass@example.com', /credentials/);
  });
  it('rejects structurally broken URLs', () => {
    bad('https://', /valid URL/);
    bad('https://.com', /valid URL/);
    bad('https://example..com', /valid URL/);
  });
  it('rejects absurdly long input', () => {
    bad('example.com/' + 'a'.repeat(3000), /too long/i);
  });
  it('rejects hostnames with non-DNS characters', () => {
    bad('asdfg=hjgjh.com', /hostname/);
    bad('foo_bar.com', /hostname/);
    bad('-bad.com', /hostname/);
    bad('bad-.com', /hostname/);
  });
  it('rejects implausible TLDs (numeric or too short)', () => {
    bad('example.c', /real domain/);
    bad('example.123', /valid URL/); // Node's parser rejects numeric final labels outright
    bad('999.999.999.999', /valid URL/); // invalid IPv4, rejected by Node's parser
  });
});
