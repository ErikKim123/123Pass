# Changelog

모든 주요 변경사항은 이 파일에서 추적합니다. [Keep a Changelog](https://keepachangelog.com/) 양식.

## [Unreleased]

### BUNDLE-01 마무리 — Tree-shaking 활성화 (2026-05-27)
- **`"sideEffects": false`**를 4개 내부 패키지(`@123pass/core-crypto`, `@123pass/shared`, `@123pass/vault-sdk`, `@123pass/ui`) `package.json`에 추가.
- 근본 원인: 누락된 sideEffects 플래그로 webpack/Next.js가 barrel re-export(`export * from`)를 통한 모든 모듈을 강제 포함시켰음. 이제 사용되지 않은 export(예: BIP39 wordlist, HIBP SHA-1, TOTP, recovery)가 페이지별로 정확히 tree-shaken됨.

**Next.js First Load JS 변화** (모든 페이지 < 200 KB 달성):

| Page | Before | After | Reduction |
|------|-------:|------:|----------:|
| /vault | 211 KB | **103 KB** | **−108 KB (−51%)** |
| /vault/audit | 210 KB | 90.4 KB | −120 KB |
| /settings | 211 KB | 104 KB | −107 KB |
| /groups | 210 KB | 115 KB | −95 KB |
| /groups/[id] | 211 KB | 129 KB | −82 KB |
| /shares | 210 KB | 128 KB | −82 KB |
| /login | 220 KB | 173 KB | −47 KB |
| /signup | 221 KB | 190 KB | −31 KB |

- BUNDLE-01 목표(200 KB) 대비 /vault는 49% 여유.
- 영지식 가드/검증 0건 회귀: typecheck 12/12, lint 8/8, tests 139/139.

### FR-15 — 플랫폼 UI 확장 (2026-05-27)
- **`apps/extension`** (Chrome MV3): Popup에 Settings 토글 추가. 영구 새 패널에서 Export(Blob 다운로드) + Import(파일 input + 암호화 export password 입력) 흐름 제공. 빌드 후 203 modules (이전 187 → +16).
- **`apps/desktop`** (Tauri 2): App 헤더에 Settings 토글 추가. WebView 표준 Blob/URL.createObjectURL로 파일 다운로드, `<input type="file">`로 import. 신규 Tauri 플러그인 의존성 추가 없음.
- **`apps/mobile`** (Expo + React Native): Settings 화면에 Export/Import 섹션 추가. `expo-document-picker` 없이 `expo-clipboard` 기반 — Export는 암호화 JSON을 클립보드로 복사, Import는 multiline TextInput에 paste 또는 클립보드 자동 읽기. 새 의존성 0.
- 4개 플랫폼 모두 동일한 `EXPORT_FORMAT_ID` 상수와 `formatImportSummary` 패턴 사용 → 일관된 UX.
- typecheck 12/12, lint 8/8, tests 139/139, extension vite build 통과, 0 regression.

### FR-15 백로그 갭 해결 (2026-05-27)
- **갭 #3 (KAT 벡터)**: `export-import.test.ts`에 frozen v1 export blob KAT 추가. 향후 `deriveSingleKey` / AAD 구성 / AES-GCM 모드 변경 시 backward-compat 회귀를 즉시 catch.
- **갭 #5 (version 거부)**: zod `literal(1)`이 `version: 2` 및 알 수 없는 `format` 값을 schema boundary에서 명시적으로 거부함을 검증하는 테스트 2개 추가.
- **갭 #4 (importItems 부분 실패 보고)**: `VaultClient.importItems`가 이제 `failures: Array<{ name, reason }>`를 반환. UI는 실패한 항목 이름과 사유를 표시 (최대 5개 미리보기 + "and N more"). 실패 사유에는 페이로드 비밀이 포함되지 않음.
- vault-sdk 테스트 +5 (40→45), 워크스페이스 누적 134→139.

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
