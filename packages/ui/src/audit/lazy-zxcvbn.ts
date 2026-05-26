// Dynamic-import wrapper for zxcvbn so the wordlist (~700KB) stays out of the initial bundle.
// Design Ref: BUNDLE-01 (analysis v0.3 §9).

type ZxcvbnResult = { score: 0 | 1 | 2 | 3 | 4 };
type ZxcvbnFn = (password: string) => ZxcvbnResult;

let cachedFn: ZxcvbnFn | null = null;

export async function loadZxcvbn(): Promise<ZxcvbnFn> {
  if (cachedFn) return cachedFn;
  const mod = await import('zxcvbn');
  // zxcvbn ships as either a CJS default export or named; normalise.
  const fn = (mod as { default?: ZxcvbnFn }).default ?? (mod as unknown as ZxcvbnFn);
  cachedFn = fn;
  return fn;
}

export function isZxcvbnLoaded(): boolean {
  return cachedFn !== null;
}
