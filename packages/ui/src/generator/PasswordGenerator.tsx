// Design Ref: §FR-03 — strong password generator (CSRNG).

import { useCallback, useMemo, useState } from 'react';

import { getRandomBytes } from '@123pass/core-crypto';

export interface PasswordGeneratorProps {
  initialLength?: number;
  onChange?: (password: string) => void;
  className?: string;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';
const SYMBOL = '!@#$%^&*()-_=+[]{}|;:,.<>?';

export function generatePassword(opts: {
  length: number;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
}): string {
  const charset =
    (opts.lower ? LOWER : '') +
    (opts.upper ? UPPER : '') +
    (opts.digit ? DIGIT : '') +
    (opts.symbol ? SYMBOL : '');
  if (charset.length === 0) return '';
  // Use CSRNG; bias-rejection sample.
  const bytes = getRandomBytes(opts.length * 2);
  const out: string[] = [];
  let i = 0;
  while (out.length < opts.length && i < bytes.length) {
    const v = bytes[i]!;
    if (v < Math.floor(256 / charset.length) * charset.length) {
      out.push(charset[v % charset.length]!);
    }
    i += 1;
  }
  // Fallback: if rejection was too aggressive, top up greedily.
  while (out.length < opts.length) {
    const extra = getRandomBytes(1)[0]!;
    out.push(charset[extra % charset.length]!);
  }
  return out.join('');
}

export function PasswordGenerator({
  initialLength = 20,
  onChange,
  className,
}: PasswordGeneratorProps): JSX.Element {
  const [length, setLength] = useState(initialLength);
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(true);
  const [digit, setDigit] = useState(true);
  const [symbol, setSymbol] = useState(true);

  const password = useMemo(() => {
    return generatePassword({ length, lower, upper, digit, symbol });
  }, [length, lower, upper, digit, symbol]);

  const regenerate = useCallback(() => {
    const pw = generatePassword({ length, lower, upper, digit, symbol });
    onChange?.(pw);
  }, [length, lower, upper, digit, symbol, onChange]);

  return (
    <div className={className} data-testid="password-generator">
      <div data-testid="generated-password">{password}</div>
      <label>
        <span>Length: {length}</span>
        <input
          aria-label="length"
          type="range"
          min={8}
          max={128}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
        />
      </label>
      <label>
        <input
          aria-label="lowercase"
          type="checkbox"
          checked={lower}
          onChange={(e) => setLower(e.target.checked)}
        />
        Lowercase
      </label>
      <label>
        <input
          aria-label="uppercase"
          type="checkbox"
          checked={upper}
          onChange={(e) => setUpper(e.target.checked)}
        />
        Uppercase
      </label>
      <label>
        <input
          aria-label="digit"
          type="checkbox"
          checked={digit}
          onChange={(e) => setDigit(e.target.checked)}
        />
        Digits
      </label>
      <label>
        <input
          aria-label="symbol"
          type="checkbox"
          checked={symbol}
          onChange={(e) => setSymbol(e.target.checked)}
        />
        Symbols
      </label>
      <button type="button" onClick={regenerate}>
        Regenerate
      </button>
    </div>
  );
}
