// Global shortcut registration via the Tauri plugin.
// Cmd/Ctrl+Shift+Space toggles a quick-search popup window (handled by the Rust side).

import {
  isRegistered,
  register,
  unregisterAll,
} from '@tauri-apps/plugin-global-shortcut';

const QUICK_SEARCH_SHORTCUT = 'CommandOrControl+Shift+Space';

export async function registerHotkeys(onTrigger: () => void): Promise<void> {
  // Don't double-register if the user re-mounted the listener.
  if (await isRegistered(QUICK_SEARCH_SHORTCUT)) return;
  await register(QUICK_SEARCH_SHORTCUT, onTrigger);
}

export async function unregisterHotkeys(): Promise<void> {
  await unregisterAll();
}
