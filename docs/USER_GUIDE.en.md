# 123Pass User Guide

> **Zero-Knowledge** password manager. Not even the service provider can read your plaintext credentials.

## 1. First sign-up

1. Launch the web/mobile/desktop app → **Sign up**
2. Enter email + **master password** (≥12 chars)
3. Receive a **24-word recovery seed** and store it offline (paper / hardware vault)
4. You will be redirected to your vault.

## 2. Core concepts

| Term | Meaning |
|------|---------|
| **Master password** | The single secret that unlocks your vault. If lost, only the 24-word seed can recover it. |
| **Vault** | Your collection of credentials — every item is AES-256-GCM encrypted client-side. |
| **Auto-lock** | The vault locks after 5 minutes of inactivity (memzero on the in-memory key). |
| **Recovery seed** | BIP39 24-word — optional recovery method if you forget your master password. |

## 3. Daily use

### Add a new item
1. Vault → **+ New**
2. Pick a type (Login/Note/Card/TOTP) and fill name/URL/username/password
3. Click **Generate strong password** for a CSRNG-backed strong PW.

### Autofill (Chrome extension)
1. Click the toolbar icon → unlock your vault.
2. On any login form, click the icon again → matching items list.
3. Click an item → username + password fields are filled by the content script.

### Mobile (biometrics)
1. Sign up with your master password the first time.
2. Settings → **Biometric unlock** → enrol Face ID / fingerprint.
3. Subsequent launches: biometric unlocks instantly.

### Desktop (global shortcut)
- `Cmd/Ctrl+Shift+Space` — focus the search input from anywhere.
- System tray → Show / Quit.

## 4. Sharing

### 1:1 sharing
1. Select an item → **Share with another user**.
2. Recipient email + permission (Read / Read & Write).
3. Recipient sees the share in their **Shares** tab → **Accept** copies it into their vault.

### Family / team groups
1. **Groups** tab → **+ New group** → name it (e.g. "Family").
2. Open the group → **+ Invite** → enter member email + role.
3. Add group items — all members decrypt them with the same group key.

## 5. Security audit

**Vault → Audit**:
- **Weak passwords**: zxcvbn score ≤ 2
- **Reused passwords**: same PW across multiple items
- **Pwned passwords**: HIBP API check (k-anonymity, only the first 5 hex chars of SHA-1 leave the device)

## 6. Master password rotation

**Settings → Change master password**
- All vault items are re-encrypted under the new key (atomic RPC).
- You are logged out automatically — sign back in with the new PW.

## 7. Recovery

If you forget your master password:
1. Login page → **Forgot?**
2. Enter your 24-word seed → set a new master PW.
3. Your vault is preserved.

## 8. Zero-knowledge proof

- Server holds only ciphertext: `encrypted_private_key`, `encrypted_vault_items.ciphertext`, etc.
- Master password never crosses the wire (client-side Argon2id derives the key).
- Group sharing wraps the symmetric group key under each member's public key — server admins cannot unwrap.

Full security design: [Design Doc](02-design/features/123Pass-app.design.md) §7.

## 9. FAQ

**Q. New items don't appear on my other device.**
A. Without a Supabase backend the data lives only on the current device (mock mode). Configure Supabase per the root README to enable cloud sync.

**Q. I lost my recovery seed.**
A. Settings lets you regenerate it (master PW required). If both are lost, recovery is impossible by design.

**Q. The Chrome extension doesn't detect a login form.**
A. Some sites use non-standard forms. Manually click an item → **Copy pw** and paste.

---

**License**: MIT — see [LICENSE](../LICENSE).
