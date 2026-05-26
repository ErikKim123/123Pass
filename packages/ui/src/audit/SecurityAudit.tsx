// Design Ref: §FR-10 / §5.4 — security audit panel.
// BUNDLE-01: zxcvbn is loaded lazily on first audit run (keeps ~700KB out of initial bundle).
// HIBP k-anonymity is also lazy and only runs on user gesture.

import { useEffect, useMemo, useState } from 'react';

import type { DecryptedItem } from '@123pass/vault-sdk';

import { loadZxcvbn } from './lazy-zxcvbn';

export interface AuditFindings {
  weak: DecryptedItem[];
  reused: DecryptedItem[][];
  pwned: Array<{ item: DecryptedItem; count: number }>;
  score: number;
}

const BLANK_AUDIT: AuditFindings = {
  weak: [],
  reused: [],
  pwned: [],
  score: 100,
};

export async function computeAuditAsync(items: DecryptedItem[]): Promise<AuditFindings> {
  const zxcvbn = await loadZxcvbn();
  const passwords: { item: DecryptedItem; pw: string; score: number }[] = [];
  for (const item of items) {
    const pw = item.payload.password;
    if (!pw) continue;
    passwords.push({ item, pw, score: zxcvbn(pw).score });
  }

  const weak = passwords.filter((p) => p.score <= 2).map((p) => p.item);

  const byPw = new Map<string, DecryptedItem[]>();
  for (const { item, pw } of passwords) {
    const list = byPw.get(pw) ?? [];
    list.push(item);
    byPw.set(pw, list);
  }
  const reused = Array.from(byPw.values()).filter((group) => group.length > 1);

  const penalty = weak.length * 5 + reused.length * 10;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { weak, reused, pwned: [], score };
}

/** Heuristic sync fallback — keeps the existing unit tests independent of zxcvbn. */
export function computeAudit(items: DecryptedItem[]): AuditFindings {
  const passwords: { item: DecryptedItem; pw: string }[] = [];
  for (const item of items) {
    const pw = item.payload.password;
    if (!pw) continue;
    passwords.push({ item, pw });
  }
  const isWeak = (pw: string): boolean => {
    if (pw.length < 10) return true;
    if (/^[a-z]+$/.test(pw)) return true; // all lowercase
    if (/^[A-Z]+$/.test(pw)) return true; // all uppercase
    if (/^\d+$/.test(pw)) return true; // all digits
    if (/^(?:password|qwerty|12345)/i.test(pw)) return true; // common prefixes
    return false;
  };
  const weak = passwords.filter((p) => isWeak(p.pw)).map((p) => p.item);

  const byPw = new Map<string, DecryptedItem[]>();
  for (const { item, pw } of passwords) {
    const list = byPw.get(pw) ?? [];
    list.push(item);
    byPw.set(pw, list);
  }
  const reused = Array.from(byPw.values()).filter((group) => group.length > 1);

  const penalty = weak.length * 5 + reused.length * 10;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { weak, reused, pwned: [], score };
}

export interface SecurityAuditProps {
  items: DecryptedItem[];
  className?: string;
}

export function SecurityAudit({ items, className }: SecurityAuditProps): JSX.Element {
  const [findings, setFindings] = useState<AuditFindings>(BLANK_AUDIT);
  const [loading, setLoading] = useState(false);
  const [hibpRunning, setHibpRunning] = useState(false);

  const itemKey = useMemo(() => items.map((i) => `${i.id}:${i.version}`).join(','), [items]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void computeAuditAsync(items)
      .then((a) => {
        if (!cancelled) setFindings(a);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemKey, items]);

  const runHibp = async (): Promise<void> => {
    setHibpRunning(true);
    try {
      const { sha1HexOfPassword, fetchPwnedRange } = await import('@123pass/vault-sdk');
      const hits: Array<{ item: DecryptedItem; count: number }> = [];
      for (const item of items) {
        const pw = item.payload.password;
        if (!pw) continue;
        const hash = await sha1HexOfPassword(pw);
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5).toUpperCase();
        const range = await fetchPwnedRange(prefix);
        const hit = range.find((r) => r.suffix === suffix);
        if (hit) hits.push({ item, count: hit.count });
      }
      setFindings((prev) => ({ ...prev, pwned: hits }));
    } catch {
      // Silent — HIBP issues must not break the audit panel.
    } finally {
      setHibpRunning(false);
    }
  };

  return (
    <section className={className} data-testid="security-audit">
      <header>
        <h2>Security Audit</h2>
        <span data-testid="audit-score">{loading ? '…' : findings.score}</span>
      </header>
      <div>
        <h3>Weak passwords ({findings.weak.length})</h3>
        <ul data-testid="weak-list">
          {findings.weak.map((i) => (
            <li key={i.id} data-id={i.id}>
              {i.payload.name}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Reused passwords ({findings.reused.length} groups)</h3>
        <ul data-testid="reused-list">
          {findings.reused.map((group, idx) => (
            <li key={idx}>{group.map((i) => i.payload.name).join(' / ')}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Pwned passwords ({findings.pwned.length})</h3>
        <button
          type="button"
          onClick={() => void runHibp()}
          disabled={hibpRunning}
          data-testid="check-hibp"
        >
          {hibpRunning ? 'Checking…' : 'Check Have I Been Pwned'}
        </button>
        <ul data-testid="pwned-list">
          {findings.pwned.map((p) => (
            <li key={p.item.id}>
              {p.item.payload.name} — seen {p.count.toLocaleString()} times in leaks
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
