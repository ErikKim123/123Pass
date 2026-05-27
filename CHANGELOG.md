# Changelog

모든 주요 변경사항은 이 파일에서 추적합니다. [Keep a Changelog](https://keepachangelog.com/) 양식.

## [Unreleased]

### 추가 (FR-15 — Vault Export / Import)
- **`@123pass/core-crypto`**: `deriveSingleKey()` — Argon2id로 password+salt에서 단일 32바이트 키 도출. 마스터 패스워드와 도메인 분리된 export 패스워드 전용.
- **`@123pass/shared`**: `export.zod.ts` — 3개 포맷 zod 스키마 (123Pass-encrypted JSON v1, Bitwarden unencrypted JSON, 1Password 8 CSV).
- **`@123pass/vault-sdk`** — `usecases/export-vault.ts`:
  - `encryptForExport()`: 사용자 지정 export 패스워드 + 새 salt → Argon2id → AES-GCM. AAD가 `format|version|exportedAt`를 ciphertext에 바인딩 (메타데이터 변조 차단).
  - `decryptFromExport()`: round-trip 복호화. 잘못된 패스워드/변조된 파일은 `EXPORT_DECRYPT_FAILED`.
- **`@123pass/vault-sdk`** — `usecases/import-vault.ts`:
  - `detectImportFormat()`: 파일 시그니처 + 헤더 자동 감지.
  - `parseBitwardenJson()`: Bitwarden unencrypted JSON 파싱 (login/note/card/identity, custom fields, TOTP).
  - `parse1PasswordCsv()`: 1Password 8 CSV (RFC 4180, 따옴표 이스케이프, otpauth:// 처리).
- **VaultClient 신규 메서드**: `exportVault()`, `decryptExport()`, `parseImport()`, `importItems()`. import 항목은 모두 `createItem` 경로를 통과해 영지식 가드(`assertNoPlaintextLeak`)가 자동 적용됨.
- **`apps/web`** — `/settings` 페이지에 Export / Import 섹션 추가 (파일 다운로드 + 파일 업로드 + 암호화 export 패스워드 입력 UI).
- **테스트 +17**: round-trip, 잘못된 패스워드 거부, AAD 메타데이터 변조 거부, ciphertext tamper 거부, 평문 누출 0 확인, 포맷 자동 감지 4종, Bitwarden/1Password 파서 (커스텀 필드, 따옴표, otpauth, 빈 행 필터). vault-sdk 누적 23→40, 워크스페이스 누적 117→134.

### 보안 (FR-15)
- Export 파일은 평문 자격증명을 **절대** 직렬화하지 않음 — 시리얼라이즈 직전 AES-256-GCM으로 암호화.
- Export 패스워드 ≥ 12자 강제 (`EXPORT_PASSWORD_TOO_SHORT`).
- AAD 바인딩: `exportedAt` 변경 시 GCM 검증 실패 → 메타데이터 위조 차단.
- 단방향 도메인 분리: master password와 export password에 서로 다른 salt 사용.

## [0.1.0] - 2026-05-26 (MVP)

### 추가
- **인프라**: Turborepo + pnpm workspaces 모노레포 (`packages/*`, `apps/*`)
- **`@123pass/core-crypto`** — 순수 함수 crypto 라이브러리
  - Argon2id KDF (m=64MB, t=3, p=4, 도메인 분리 saltAuth/saltVault)
  - AES-256-GCM AEAD (12-byte IV, AAD, 16-byte authTag)
  - ECDH P-256 + HKDF-SHA256 (1:1 / 그룹 키 wrap, PFS)
  - HMAC-SHA256 결정론적 search hash (검색 가능 암호화)
  - BIP39 24-word 복구 시드
  - RFC 6238 TOTP (SHA1/256/512, 6-8 digits)
- **`@123pass/vault-sdk`** — Repository Pattern + UseCases
  - VaultClient + 17 메서드 (CRUD, share, group, sync, rotate)
  - 5개 Repository 어댑터 (InMemory, MockBrowser, ChromeStorage, SecureStore, TauriStore)
  - 영지식 누출 가드 (`assertNoPlaintextLeak`)
  - HIBP k-anonymity 통합
- **`@123pass/ui`** — 공유 React 컴포넌트
  - LockScreen / VaultItemList / VaultItemDetail / PasswordGenerator
  - TotpDisplay / SecurityAudit / RecoveryFlow
  - ShareDialog / IncomingSharesList / GroupList / CreateGroupDialog / GroupMembersPanel / InviteMemberDialog
- **`apps/web`** — Next.js 14 App Router (11 페이지: login/signup/vault/audit/settings/shares/groups/...)
- **`apps/extension`** — Chrome MV3 (popup + content autofill + background SW)
- **`apps/mobile`** — Expo + expo-router (생체인증, secure-store)
- **`apps/desktop`** — Tauri 2 (시스템 트레이, 전역 단축키)
- **Supabase 백엔드 스키마**: 8 테이블 + RLS + Realtime publication + `rotate_master_password` RPC
- **CI/CD**: GitHub Actions (web/extension/desktop/mobile 빌드)
- **Playwright E2E**: auth-flow, vault-crud, group-flow
- **117 단위/통합 테스트** (RFC 5869/6238 KAT 포함)

### 보안 결정 (Static-Enforced)
- ESLint로 `@noble/*` 격리 (core-crypto만)
- ESLint로 `@supabase/*` 격리 (vault-sdk만)
- ESLint로 `Math.random()` 차단 (전역)
- TypeScript strict + noUncheckedIndexedAccess + noImplicitOverride

### Performance
- BUNDLE-01: zxcvbn dynamic import — web First Load JS 개선
- HIBP k-anonymity (5-char prefix만 송신, suffix는 로컬 매칭)

### 알려진 제한
- Supabase live 검증 미수행 (사용자 측 Docker + supabase CLI 셋업 후 실행 필요)
- Argon2id 모바일 벤치마크 미수행 (실기기 필요)
- 외부 보안 전문가 리뷰 미실시 (출시 전 권장)
