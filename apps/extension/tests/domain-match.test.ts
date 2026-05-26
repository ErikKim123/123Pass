import { describe, expect, it } from 'vitest';

import { domainMatches, hostnameOf, registrableDomain } from '../src/shared/current-tab';

describe('hostnameOf', () => {
  it('extracts hostname from a URL', () => {
    expect(hostnameOf('https://mail.google.com/inbox')).toBe('mail.google.com');
  });

  it('returns null for invalid input', () => {
    expect(hostnameOf('not a url')).toBeNull();
  });

  it('lowercases the hostname', () => {
    expect(hostnameOf('https://MAIL.GOOGLE.com')).toBe('mail.google.com');
  });
});

describe('registrableDomain', () => {
  it('returns the eTLD+1 approximation', () => {
    expect(registrableDomain('mail.google.com')).toBe('google.com');
    expect(registrableDomain('accounts.google.com')).toBe('google.com');
    expect(registrableDomain('github.com')).toBe('github.com');
    expect(registrableDomain('a.b.c.example.org')).toBe('example.org');
  });

  it('handles single-label hostnames safely', () => {
    expect(registrableDomain('localhost')).toBe('localhost');
  });
});

describe('domainMatches', () => {
  it('matches subdomains of the same registrable domain', () => {
    expect(domainMatches('https://accounts.google.com', 'https://mail.google.com')).toBe(true);
  });

  it('does not match cross-domain', () => {
    expect(domainMatches('https://google.com', 'https://gmail.org')).toBe(false);
  });

  it('returns false when itemUrl is missing', () => {
    expect(domainMatches(undefined, 'https://example.com')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(domainMatches('not a url', 'https://example.com')).toBe(false);
    expect(domainMatches('https://example.com', 'not a url')).toBe(false);
  });

  it('matches exact host', () => {
    expect(domainMatches('https://example.com/login', 'https://example.com/profile')).toBe(true);
  });
});
