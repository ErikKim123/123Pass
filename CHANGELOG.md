# Changelog

모든 주요 변경사항은 이 파일에서 추적합니다. [Keep a Changelog](https://keepachangelog.com/) 양식.

## [Unreleased]

### DB4 — Supabase Auth 세션 통합 (2026-05-27)
- **VaultRepository 인터페이스 확장**: `currentSession()`, `onAuthStateChange(handler)` 추가 (`AuthEventType`, `AuthSession`, `AuthStateChange`, `AuthUnsubscribe` 타입).
- **SupabaseRepository** 구현: `supabase.auth.onAuthStateChange`를 4개 정규화된 이벤트(`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `INITIAL_SESSION`)로 매핑. `USER_DELETED`는 `SIGNED_OUT`으로 통합.
- **5개 어댑터 모두 동일 contract 구현**: SupabaseRepository, InMemoryRepository, MockBrowserRepository (web), SecureStoreRepository (mobile), TauriStoreRepository (desktop), ChromeStorageRepository (extension).
- **`VaultClient.signOutFully()`**: 새 메서드. `lock()`으로 in-memory vaultKey/privateKey 즉시 wipe + `repo.signOut()`으로 Supabase JWT 폐기. 기존 `lock()`은 "잠깐 잠그기" 용도로 유지.
- **VaultProvider** 갱신: repo의 `onAuthStateChange`를 구독해서 (a) 세션 변경 시 마지막 email을 `localStorage`에 저장 (b) out-of-band `SIGNED_OUT` 이벤트(token 만료/다른 탭 로그아웃/서버 측 revoke) 발생 시 in-memory vault 즉시 lock.
- **`apps/web/src/lib/last-email.ts`** 신규 헬퍼: localStorage에 마지막 email 저장/조회/삭제.
- **`LockScreen`에 `initialEmail` prop 추가**: 페이지 로드 시 마지막 사용 email 자동 pre-fill (마스터 PW만 입력하면 unlock).
- **`/recover` 페이지** 신규: `RecoveryFlow mode="restore"`로 24-word BIP39 시드 검증. 실제 마스터 PW reset은 후속 작업으로 명시 (현재는 시드 형식 검증만).
- **(vault) layout에 "Sign out" 버튼 추가**: 기존 "Lock"과 분리. Lock = 메모리 키만 wipe (Supabase 세션 유지), Sign out = 완전 종료 (JWT 폐기).
- **신규 6 테스트** (`auth-lifecycle.test.ts`): INITIAL_SESSION 이벤트, SIGNED_IN/SIGNED_OUT 전이, currentSession null 처리, unsubscribe 동작, signOutFully의 lock+repo.signOut 합성, idempotency.
- 워크스페이스 테스트 143 → 149 (+6 auth), typecheck 12/12, lint 8/8, 0 regression.

### DB3 — PGlite 기반 Database 타입 자동 생성 (2026-05-27)
- 신규 스크립트 `scripts/gen-types/gen-types.mjs` 추가 (`pnpm db:gen-types`).
- PGlite로 8개 마이그레이션을 적용한 후 `information_schema` + `pg_proc`를 introspect하여 supabase 공식 `gen types typescript` 출력과 동일한 스타일의 `Database` 타입 생성.
- 출력 위치: `packages/vault-sdk/src/infrastructure/database.types.generated.ts` (auto-generated, 305 lines).
- 생성된 타입 구조:
  - 상위 `Json` 재귀 타입
  - `Tables.<name>.{Row, Insert, Update, Relationships}` — Insert는 DB default/nullable 컬럼이 optional, Update는 모두 optional
  - `Views.<name>.Row` + `Relationships: []`
  - `Functions.<name>.Args/Returns`
  - `Enums` / `CompositeTypes` stub
- `supabase-client.ts`가 이제 generated Database 타입을 import → SDK의 `GenericSchema` 제약 만족 → 강제 `as any` 캐스팅 없이 동작.
- Drift 감지: `pnpm db:check-types`로 generated 출력과 commit된 파일을 비교, drift 시 exit code 1 (CI에 추가 권장).
- Hand-written `database.types.ts`는 domain-friendly types(literal unions `ItemType` / `role` / `permission`, 구조화된 `KdfParams`)로 유지. SupabaseRepository는 `this.db` 캐스트로 generated wire-format ↔ domain narrowing 경계를 어댑터에 봉인.
- 향후 작업: 진짜 Supabase 프로젝트가 연결되면 `supabase gen types typescript`로 교체, hand-written domain types와 wire-format types의 통합 가능.

### DB1 — SupabaseRepository 어댑터 구현 (2026-05-27, ADAPTER-01 해소)
- 신규 파일 `packages/vault-sdk/src/infrastructure/supabase-repository.ts` 추가 — `VaultRepository` 인터페이스의 프로덕션 어댑터 구현체.
- 28개 메서드 모두 구현: 인증(signUp/signIn/signOut/currentUserId), 사용자 프로필, vault item CRUD(낙관적 동시성 포함), 공유, 그룹/멤버/그룹 item, master password rotation(RPC), Realtime 구독.
- 영지식 경계 유지: 모든 메서드가 `{ ciphertext, iv, authTag }` 형태만 받음. 평문 자격증명 통과 경로 없음. RLS가 2차 방어선.
- `apps/web/src/lib/supabase.ts` 갱신: env가 설정되면 mock 대신 실제 `SupabaseRepository` 반환. mock fallback은 env 누락 시에만.
- TypeScript 타입 시스템 워크어라운드: `@supabase/postgrest-js@2.106`의 `GenericSchema` 제약(`Record<string, unknown>`)이 우리의 hand-written `Database` 타입의 specific Row 필드와 호환되지 않음 (index signature 없는 타입은 strict mode에서 Record로 추론 안 됨). 해결: `this.sb`는 typed `TypedSupabaseClient`로 유지하고, `from()/rpc()` 호출에 한해 untyped `SupabaseClient`로 내부 캐스트(`this.db` getter). 모든 payload는 여전히 typed `UserRecord`/`EncryptedItemInsert` 등에서 만들어지므로 호출 site 안전성은 유지됨.
- `database.types.ts`에 각 Table에 `Relationships: []` 필드 추가 (`@supabase/postgrest-js@2.106` 요구사항).
- 신규 4개 smoke 테스트(`test/supabase-repository.test.ts`): 인스턴스화 + 인터페이스 conformance + signUp 호출 forwarding + signIn 실패 시 `AUTH_INVALID_CREDENTIALS` 매핑 + rotateMasterPassword RPC 호출.
- 워크스페이스 테스트 139 → 143 (+4), typecheck 12/12, lint 8/8, 0 regression.
- 향후 작업: `supabase gen types typescript`로 자동 생성된 `Database` 타입으로 교체 → 더 이상 캐스팅 불필요.

### DB2 — PGlite 기반 마이그레이션 자동 검증 (2026-05-27, RUNTIME-01 부분 해소)
- 신규 스크립트 `scripts/db-verify/verify.mjs` 추가 (`pnpm db:verify`).
- Docker/Supabase CLI 없이 8개 마이그레이션(0001~0008)을 실제 PostgreSQL 16 (PGlite WASM)에 적용하여 검증.
- Supabase 호환 stub 작성: `auth.users`, `auth.uid()`, `authenticated`/`service_role` 롤, `supabase_realtime` publication, 기본 public schema grants.
- 검증 결과:
  - **🐛 실제 버그 발견 및 수정**: `0007_realtime.sql`의 `ALTER PUBLICATION ... DROP TABLE IF EXISTS` 구문이 PG 15/16에서 미지원. `DO $$ ... exception when undefined_object` 블록으로 idempotent 패턴 교체.
  - ✅ 8/8 마이그레이션 적용 성공
  - ✅ 스키마: 8 테이블, 8 RLS 활성, 19 정책, 20 인덱스, 4 함수(`is_group_admin`, `is_group_member`, `rotate_master_password`, `touch_updated_at`), 1 뷰(`user_directory`), 3 realtime publication 엔트리
  - ✅ 9/9 RLS behavior assertions 통과:
    - 사용자 간 `public.users`/`encrypted_vault_items` 행 격리
    - 익명 세션은 0행 반환
    - 크로스 사용자 INSERT는 RLS WITH CHECK로 차단
    - `user_directory` 뷰가 `kdf_params` 등 비공개 컬럼 누출 안 함
    - `rotate_master_password`가 미인증 시 `AUTH_REQUIRED`, 잘못된 kdf_params 시 `KDF_PARAMS_INVALID` 발생
- 한계: Supabase Auth JWT 흐름, 실제 Realtime broadcast, Storage policies는 PGlite로 검증 불가 (실제 `supabase start` 필요).

### FR-15 — E2E Playwright 시나리오 추가 (2026-05-27)
- 신규 spec `tests/e2e/fr15-export-import.spec.ts` 추가 (6개 시나리오):
  1. **암호화 export 라운드트립** — 사용자 A 가입 → 항목 생성 → export → 사용자 B(별도 context) 가입 → import → 동일 항목 복호화 확인. 다운로드된 파일에 평문 비밀 비포함 검증.
  2. **잘못된 export 패스워드 거부** — 정확한 비밀번호로 export 후 틀린 비밀번호로 import 시도 → `import-error` 표시 확인.
  3. **Bitwarden JSON import** — login + secureNote 타입 2개 import 후 vault에 등장 확인.
  4. **1Password CSV import** — 따옴표 이스케이프 + 콤마 포함 notes + otpauth:// secret 파싱 검증.
  5. **알 수 없는 포맷 거부** — 임의 CSV → `import-error`에 "recognize|format" 메시지.
  6. **Export password 12자 미만 비활성화** — 빈/짧은/12자+ 입력별 버튼 disabled/enabled 상태 검증.
- 기존 3개 spec(`auth-flow`, `vault-crud`, `group-flow`)과 동일 패턴. Playwright runner 자체 설치는 별도 작업으로 남아있음(MVP 리포트 §3.3 "작성됨" 상태 유지).

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
