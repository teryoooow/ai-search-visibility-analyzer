import { describe, it, expect } from 'vitest';
import { checkDomainResolves } from '../src/preflight.js';

const resolveOk = async () => true;
const nxdomain = async () => {
  const e = new Error('getaddrinfo ENOTFOUND zz9x.invalid');
  e.code = 'ENOTFOUND';
  throw e;
};
const dnsTimeout = async () => {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  throw e;
};
const otherFailure = async () => {
  const e = new Error('getaddrinfo EAI_AGAIN dns.example');
  e.code = 'EAI_AGAIN';
  throw e;
};

describe('checkDomainResolves', () => {
  it('returns true when the domain resolves', async () => {
    await expect(checkDomainResolves('example.com', { lookupFn: resolveOk })).resolves.toBe(true);
  });
  it('skips DNS for localhost', async () => {
    await expect(checkDomainResolves('localhost', { lookupFn: () => { throw new Error('should not be called'); } })).resolves.toBe(true);
  });
  it('skips DNS for IPv4/IPv6 literals', async () => {
    await expect(checkDomainResolves('127.0.0.1', { lookupFn: () => { throw new Error('should not be called'); } })).resolves.toBe(true);
    await expect(checkDomainResolves('[::1]', { lookupFn: () => { throw new Error('should not be called'); } })).resolves.toBe(true);
  });
  it('rejects NXDOMAIN with a friendly message', async () => {
    await expect(checkDomainResolves('zz9x.invalid', { lookupFn: nxdomain })).rejects.toThrow(/does not resolve/);
  });
  it('rejects EAI_AGAIN (temporary resolver failure) with the same message', async () => {
    await expect(checkDomainResolves('example.com', { lookupFn: otherFailure })).rejects.toThrow(/does not resolve/);
  });
  it('reports lookup timeouts', async () => {
    await expect(checkDomainResolves('slow.example', { lookupFn: dnsTimeout })).rejects.toThrow(/timed out/);
  });
});
