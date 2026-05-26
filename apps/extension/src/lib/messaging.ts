// Typed wrapper around chrome.runtime / chrome.tabs.sendMessage.

export type AutofillPayload = {
  type: 'autofill';
  username?: string;
  password?: string;
};

export type DetectFormsRequest = { type: 'detect-forms' };

export type DetectFormsResponse = {
  type: 'detect-forms-result';
  hasLoginForm: boolean;
  hasPassword: boolean;
};

export type ExtensionMessage = AutofillPayload | DetectFormsRequest | DetectFormsResponse;

export async function sendToActiveTab<T extends ExtensionMessage>(
  tabId: number,
  message: T,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

export function onMessage(handler: (msg: ExtensionMessage, sender: chrome.runtime.MessageSender) => void | Promise<void>): void {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Wrap async handlers so chrome.runtime keeps the port open.
    const result = handler(msg as ExtensionMessage, sender);
    if (result instanceof Promise) {
      result.then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    sendResponse({ ok: true });
    return undefined;
  });
}
