# Changelog

모든 주요 변경사항은 이 파일에서 추적합니다. [Keep a Changelog](https://keepachangelog.com/) 양식.

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
