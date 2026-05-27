// Persists the most recently signed-in email so the login page can pre-fill it
// when a Supabase session is restored on page reload. Email is not a secret;
// the KDF params + master password are what unlock the vault.

const STORAGE_KEY = '__123pass_last_email__';

export function setLastEmail(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, email);
  } catch {
    // ignore quota
  }
}

export function getLastEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearLastEmail(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
