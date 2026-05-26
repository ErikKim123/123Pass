import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TotpDisplay } from '../src';

describe('TotpDisplay', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders an empty placeholder when no secret is given', () => {
    render(<TotpDisplay secret={undefined} />);
    expect(screen.getByTestId('totp-empty')).toBeInTheDocument();
  });

  it('renders a 6-digit code (with grouping) for a valid base32 secret', () => {
    render(<TotpDisplay secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" />);
    const code = screen.getByTestId('totp-code');
    expect(code.textContent).toMatch(/^\d{3} \d{3}$/);
  });

  it('renders empty placeholder for malformed base32', () => {
    render(<TotpDisplay secret="!not-base32!" />);
    expect(screen.getByTestId('totp-empty')).toBeInTheDocument();
  });
});
