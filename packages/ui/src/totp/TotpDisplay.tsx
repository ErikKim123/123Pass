// Design Ref: §FR-09 / §5.4 — TOTP code display with countdown ring.

import { useTotpTick } from '../hooks/use-totp-tick';

export interface TotpDisplayProps {
  secret: string | undefined;
  period?: number;
  className?: string;
}

export function TotpDisplay({ secret, period = 30, className }: TotpDisplayProps): JSX.Element {
  const tick = useTotpTick(secret, period);
  if (!tick) {
    return (
      <div className={className} data-testid="totp-empty">
        —
      </div>
    );
  }
  const pretty = tick.code.length === 6 ? `${tick.code.slice(0, 3)} ${tick.code.slice(3)}` : tick.code;
  return (
    <div className={className} data-testid="totp-display">
      <span data-testid="totp-code">{pretty}</span>
      <span data-testid="totp-remaining">{tick.remainingSeconds}s</span>
    </div>
  );
}
