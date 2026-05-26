// Re-computes TOTP code every second. Uses RFC 6238 from core-crypto.

import { useEffect, useState } from 'react';

import { totp, totpRemainingSeconds } from '@123pass/core-crypto';

export interface TotpTick {
  code: string;
  remainingSeconds: number;
  period: number;
}

export function useTotpTick(secret: string | undefined, period = 30): TotpTick | null {
  const [tick, setTick] = useState<TotpTick | null>(null);

  useEffect(() => {
    if (!secret) {
      setTick(null);
      return;
    }
    const update = (): void => {
      try {
        setTick({
          code: totp(secret, { period }),
          remainingSeconds: totpRemainingSeconds(period),
          period,
        });
      } catch {
        setTick(null);
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [secret, period]);

  return tick;
}
