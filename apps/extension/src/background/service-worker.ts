// MV3 service worker — minimal lifecycle hooks.
// Does NOT touch the vault key. Just relays events and opens the popup.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.warn('[123Pass] Extension installed. Click the toolbar icon to unlock your vault.');
  }
});

// Optional: expose a "save login?" prompt when content scripts detect a successful login form submit.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if ((msg as { type?: string }).type === 'login-submitted') {
    // For MVP we just acknowledge — actual save flow lives in the popup once the user clicks the icon.
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
