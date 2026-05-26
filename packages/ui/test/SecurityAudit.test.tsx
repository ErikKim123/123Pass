import { describe, expect, it } from 'vitest';

import type { DecryptedItem } from '@123pass/vault-sdk';

import { computeAudit } from '../src';


function fake(id: string, password: string | undefined, name = id): DecryptedItem {
  return {
    id,
    itemType: 'login',
    favorite: false,
    folderId: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    payload: { name, password },
  };
}

describe('computeAudit', () => {
  it('returns max score for an empty vault', () => {
    const a = computeAudit([]);
    expect(a.score).toBe(100);
    expect(a.weak).toEqual([]);
    expect(a.reused).toEqual([]);
  });

  it('flags weak passwords', () => {
    const items = [fake('1', '12345'), fake('2', 'password'), fake('3', 'aB$rTq9wE2vN!7xLk@4z')];
    const a = computeAudit(items);
    const weakIds = a.weak.map((i) => i.id);
    expect(weakIds).toContain('1');
    expect(weakIds).toContain('2');
    expect(weakIds).not.toContain('3');
  });

  it('groups reused passwords', () => {
    const items = [fake('1', 'samepass'), fake('2', 'samepass'), fake('3', 'different')];
    const a = computeAudit(items);
    expect(a.reused.length).toBe(1);
    expect(a.reused[0]!.map((i) => i.id).sort()).toEqual(['1', '2']);
  });

  it('penalises score for weaknesses', () => {
    const all = computeAudit([fake('1', '12345'), fake('2', '12345')]); // weak + reused
    expect(all.score).toBeLessThan(100);
  });
});
