// Content script — runs in every http(s) page.
// Listens for `autofill` messages from the popup and writes credentials into detected form fields.
// Also detects when a login form is submitted so the popup can offer to save it.

interface AutofillMessage {
  type: 'autofill';
  username?: string;
  password?: string;
}

interface LoginSubmittedMessage {
  type: 'login-submitted';
  url: string;
  username: string;
  // Password is NOT sent over the message channel — only the field selector is — to avoid
  // plaintext credentials leaving the page context. The popup re-prompts the user before storing.
}

function findFields(): { username: HTMLInputElement | null; password: HTMLInputElement | null } {
  const password = document.querySelector<HTMLInputElement>(
    'input[type="password"]:not([disabled])',
  );

  // Username: an input near the password that looks like an identifier.
  let username: HTMLInputElement | null = null;
  if (password) {
    const form = password.closest('form');
    const scope = form ?? document;
    const candidates = Array.from(
      scope.querySelectorAll<HTMLInputElement>(
        'input[type="email"], input[type="text"], input[autocomplete="username"], input[name*="email" i], input[name*="user" i], input[name*="login" i]',
      ),
    );
    username = candidates.find((c) => !c.disabled && c.offsetParent !== null) ?? null;
  }

  return { username, password };
}

function setFieldValue(el: HTMLInputElement, value: string): void {
  // Use the native setter so React/Vue listeners pick up the change.
  const proto = Object.getPrototypeOf(el) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function performAutofill(msg: AutofillMessage): void {
  const { username, password } = findFields();
  if (msg.username && username) setFieldValue(username, msg.username);
  if (msg.password && password) setFieldValue(password, msg.password);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as { type?: string };
  if (m.type === 'autofill') {
    try {
      performAutofill(msg as AutofillMessage);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return false;
  }
  return false;
});

// Detect form submits so the popup can offer to save NEW logins.
// We send only metadata — never the password — through the runtime channel.
document.addEventListener(
  'submit',
  (e) => {
    const form = e.target as HTMLFormElement | null;
    if (!form) return;
    const { username, password } = findFields();
    if (!password || !password.value) return;
    const usernameValue = username?.value ?? '';
    const payload: LoginSubmittedMessage = {
      type: 'login-submitted',
      url: location.href,
      username: usernameValue,
    };
    chrome.runtime.sendMessage(payload).catch(() => {
      // Background may not be listening; ignore.
    });
  },
  true,
);
