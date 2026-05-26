// Design Ref: §7.1 V6.2.5 — wipe key material from memory after use.
// JavaScript cannot guarantee zeroization (GC moves arrays), but we wipe the
// reachable view to shorten the window where keys live in heap.

export function memzero(buf: Uint8Array | undefined | null): void {
  if (!buf) return;
  for (let i = 0; i < buf.length; i++) buf[i] = 0;
}
