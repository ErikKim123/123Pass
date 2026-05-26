// Helpers to derive the registrable domain of a URL.
// Stays in /shared so popup, background, and content can use the same canonicalisation.

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns the eTLD+1 approximation by dropping subdomains down to the last two labels.
 * Does NOT consult the Public Suffix List, so it treats "co.uk" as the registrable name.
 * That's acceptable for autofill matching where false negatives are far worse than false positives.
 */
export function registrableDomain(hostname: string): string {
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

export function domainMatches(itemUrl: string | undefined, currentUrl: string): boolean {
  if (!itemUrl) return false;
  const itemHost = hostnameOf(itemUrl);
  const currentHost = hostnameOf(currentUrl);
  if (!itemHost || !currentHost) return false;
  if (itemHost === currentHost) return true;
  return registrableDomain(itemHost) === registrableDomain(currentHost);
}

export async function getActiveTab(): Promise<{ id: number; url: string } | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) return null;
  return { id: tab.id, url: tab.url };
}
