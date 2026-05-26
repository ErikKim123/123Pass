// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { signUpAndUnlockArgsSchema } from '@/lib/signup-schema';

// Mock next/navigation since the smoke test imports a component that uses useRouter indirectly.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

describe('smoke', () => {
  it('signup schema accepts a valid input', () => {
    const ok = signUpAndUnlockArgsSchema.safeParse({
      email: 'a@b.com',
      password: 'long-enough-master-pw-123',
      confirm: 'long-enough-master-pw-123',
    });
    expect(ok.success).toBe(true);
  });

  it('signup schema rejects mismatched confirm', () => {
    const bad = signUpAndUnlockArgsSchema.safeParse({
      email: 'a@b.com',
      password: 'long-enough-master-pw-123',
      confirm: 'different-pw-1234567890',
    });
    expect(bad.success).toBe(false);
  });

  it('renders a minimal DOM element (jsdom sanity)', () => {
    render(<div data-testid="hello">hi</div>);
    expect(screen.getByTestId('hello')).toBeDefined();
  });
});
