# 123Pass-app Planning Document

> **Summary**: Zero-Knowledge E2EE 기반 크로스플랫폼(웹/모바일/데스크톱) 비밀번호 관리 앱
>
> **Project**: 123Pass-app
> **Version**: 0.1.0
> **Author**: bandnara123@gmail.com
> **Date**: 2026-05-26
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 사용자가 여러 플랫폼(웹/모바일/데스크톱)에서 늘어나는 계정 자격증명을 안전하게 저장·동기화·자동입력하지 못해 비밀번호 재사용·약한 비밀번호·피싱 피해에 노출됨 |
| **Solution** | Zero-Knowledge E2EE(클라이언트 측 암호화) 기반의 Supabase/Firebase 백엔드를 활용한 크로스플랫폼 비밀번호 매니저. 마스터 패스워드 파생 키로 모든 데이터를 클라이언트에서 암복호화하여 서버는 암호문만 보유 |
| **Function/UX Effect** | 한 번의 마스터 패스워드 입력으로 모든 디바이스에서 안전한 vault 접근, 강력 패스워드 자동 생성·자동입력, 2FA/TOTP 통합, 실시간 디바이스 간 동기화, 안전한 가족/팀 공유 |
| **Core Value** | "비밀번호를 외울 필요 없이, 서비스 제공자도 못 보는 진정한 프라이버시" — 영지식 보안 + 풀(全)디바이스 편의성 동시 제공 |

---

## Context Anchor

> Auto-generated from Executive Summary. Propagated to Design/Do documents for context continuity.

| Key | Value |
|-----|-------|
| **WHY** | 자격증명 재사용/약한 비밀번호로 인한 보안 사고를 막고, 사용자가 직접 키를 통제하는 영지식 비밀번호 매니저 부재 (Bitwarden/1Password 대안 갈증) |
| **WHO** | 1차: 다중 디바이스를 쓰는 보안 의식 있는 개인 사용자 / 2차: 가족 단위 공유 / 3차: 소규모 팀 (5~20명) |
| **RISK** | (1) 마스터 패스워드 분실 시 복구 불가능한 영지식 모델의 본질적 위험 (2) BaaS(Supabase/Firebase) 보안 모델이 E2EE와 정합되는지 검증 필요 (3) 4개 플랫폼 동시 개발 리소스 부담 |
| **SUCCESS** | (1) 4개 플랫폼에서 동일 vault 1초 이내 동기화 (2) 클라이언트 측 키 도출 < 500ms (Argon2id) (3) 서버 DB 덤프 시 어떤 평문도 노출되지 않음 (감사 검증) (4) MVP 출시 후 90일 내 활성 사용자 1,000명 |
| **SCOPE** | Phase 1(코어 크립토+백엔드 스키마) → Phase 2(웹 앱+자동입력 확장) → Phase 3(모바일 앱) → Phase 4(데스크톱 앱) → Phase 5(공유/팀+감사) |

---

## 1. Overview

### 1.1 Purpose

사용자가 마스터 패스워드 하나로 자신의 모든 계정 자격증명(아이디/패스워드/2FA 시드/시큐어 노트)을 **클라이언트에서 암호화**하여 클라우드에 보관하고, 모든 보유 디바이스에서 즉시 동기화·자동입력할 수 있는 **영지식(Zero-Knowledge) E2EE 비밀번호 매니저**를 구축한다.

### 1.2 Background

- 일반 사용자의 평균 보유 온라인 계정은 100개 이상이나 80% 이상이 비밀번호를 재사용함 (보안 위험)
- 무료 매니저는 동기화 제한, 유료 매니저(1Password, Bitwarden, Dashlane)는 가격/락인 이슈
- 자국어 UX, 가족/팀 친화적 공유 모델, 개발자 친화 CLI/API 지원에 대한 시장 갭 존재
- 최근 LastPass 사고(2022) 이후 "서비스 제공자도 못 보는" 영지식 모델에 대한 신뢰가 핵심 가치로 부상

### 1.3 Related Documents

- Requirements: (이 문서)
- References:
  - OWASP ASVS V6 (Cryptography) — https://owasp.org/www-project-application-security-verification-standard/
  - NIST SP 800-63B (Digital Identity)
  - Bitwarden Security Whitepaper (참고용 영지식 아키텍처)
  - RFC 6238 (TOTP)

---

## 2. Scope

### 2.1 In Scope (MVP)

- [ ] **코어 크립토 모듈** (공통 라이브러리): Argon2id 키 도출, AES-256-GCM 암복호화, 키 래핑, CSRNG 패스워드 생성기
- [ ] **인증 시스템**: 마스터 패스워드 → 인증 해시(서버) + 암호화 키(클라이언트) 분리
- [ ] **Vault 코어**: 자격증명 CRUD (사이트/아이디/패스워드/노트/태그/즐겨찾기)
- [ ] **패스워드 생성기**: 길이/문자셋/단어조합(diceware) 옵션
- [ ] **클라우드 동기화**: 디바이스 간 실시간 동기화 (Supabase Realtime 또는 Firestore)
- [ ] **웹 앱 (Next.js)**: vault 관리 UI + 마스터 패스워드 잠금/해제
- [ ] **브라우저 확장 (Chrome MV3)**: 로그인 폼 감지 + 자동입력
- [ ] **모바일 앱 (React Native or Flutter)**: iOS/Android 공통, vault 관리 + 생체인증 잠금
- [ ] **데스크톱 앱 (Tauri 또는 Electron)**: Windows/macOS/Linux, 시스템 트레이 + 단축키
- [ ] **2FA/TOTP 관리**: RFC 6238 TOTP 시드 저장 + 6자리 코드 표시
- [ ] **보안 감사**: 약한/중복/유출(Have I Been Pwned API) 패스워드 탐지
- [ ] **아이템 공유**: 1:1 공유 (수신자 공개키 암호화), 가족/팀 그룹 (대칭키 래핑)

### 2.2 Out of Scope (MVP 이후)

- SSO/SAML 엔터프라이즈 인증 통합
- Yubikey 등 하드웨어 키 통합 (Phase 5+)
- 자가 호스팅 백엔드 (BaaS 의존도 줄이는 작업)
- 패스키(Passkey/WebAuthn) 저장
- 다크웹 모니터링 자동화
- 결제/유료 플랜 (수익화는 별도 마일스톤)
- Linux GUI 패키지 최적화 (snap/flatpak)
- Safari/Firefox 브라우저 확장 (MVP는 Chromium 계열만)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 마스터 패스워드로 회원가입/로그인 (클라이언트에서 Argon2id로 인증 해시 + 암호화 키 분리 도출) | High | Pending |
| FR-02 | Vault 아이템 CRUD (사이트, 아이디, 패스워드, URL, 노트, 태그) — 클라이언트 측 AES-256-GCM 암호화 | High | Pending |
| FR-03 | 강력 패스워드 자동 생성기 (길이 8-128, 대소문자/숫자/특수문자 토글, diceware 단어형) | High | Pending |
| FR-04 | 디바이스 간 실시간 동기화 — 변경 발생 시 1초 이내 타 디바이스 반영 | High | Pending |
| FR-05 | 웹 앱: 로그인 → vault 잠금해제 → CRUD UI | High | Pending |
| FR-06 | Chrome 확장: 로그인 폼 감지, 자동입력, 신규 가입 시 vault 저장 제안 | High | Pending |
| FR-07 | 모바일 앱 (iOS/Android): 생체인증(Face ID/지문) 잠금해제, vault CRUD, 클립보드 자동 클리어 | High | Pending |
| FR-08 | 데스크톱 앱: 시스템 트레이 상주, 전역 단축키로 빠른 검색/복사 | Medium | Pending |
| FR-09 | TOTP 시드 저장 및 6자리 OTP 코드 실시간 표시 (RFC 6238) | Medium | Pending |
| FR-10 | 보안 감사: 약한 패스워드 / 중복 사용 / Have I Been Pwned 유출 검사 | Medium | Pending |
| FR-11 | 1:1 아이템 공유 (수신자 공개키 ECDH 키 교환) | Medium | Pending |
| FR-12 | 가족/팀 그룹 공유 (그룹 마스터 키 래핑) | Low | Pending |
| FR-13 | 마스터 패스워드 변경 (모든 vault 항목 재암호화) | Medium | Pending |
| FR-14 | 복구 키 (24-word seed phrase) 발급 — 마스터 패스워드 분실 대비 | High | Pending |
| FR-15 | Vault 내보내기/가져오기 (암호화 JSON, Bitwarden/1Password CSV import) | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| **Security** | Zero-Knowledge: 서버에 평문 자격증명 절대 없음 | DB 덤프 감사 + 코드 리뷰 + 제3자 침투 테스트 |
| **Cryptography** | Argon2id (m=64MB, t=3, p=4), AES-256-GCM, ECDH P-256 | OWASP ASVS V6, NIST 표준 준수 검증 |
| **Performance (Crypto)** | 마스터 패스워드 → 키 도출 < 500ms (모바일), < 200ms (데스크톱) | 디바이스별 벤치마크 |
| **Performance (Sync)** | 디바이스 간 변경 전파 < 1초 (Realtime 채널) | E2E 테스트 |
| **Performance (UI)** | Vault 잠금해제 후 첫 화면 표시 < 1.5초 (100개 아이템 기준) | Lighthouse, RN Perf monitor |
| **Availability** | API 가용성 99.9% (BaaS SLA에 의존) | Supabase/Firebase 상태 페이지 모니터링 |
| **Accessibility** | WCAG 2.1 AA (웹) | axe-core 자동 검사 + 수동 검증 |
| **Privacy** | 사용자 분석/텔레메트리 옵트인, 텔레메트리는 평문 메타데이터 미포함 | 코드 리뷰 |
| **Compliance** | GDPR 데이터 삭제권 (계정 삭제 시 30일 내 모든 암호문 파기) | 운영 절차 + 자동화 |

---

## 4. Success Criteria

### 4.1 Definition of Done (MVP)

- [ ] FR-01 ~ FR-07, FR-09, FR-10, FR-14 구현 완료
- [ ] 4개 플랫폼(웹/Chrome 확장/iOS/Android/데스크톱)에서 동일 vault 정상 동기화
- [ ] 서버 DB 덤프 시 어떤 평문 자격증명도 노출되지 않음 (감사 시나리오 통과)
- [ ] 단위 테스트 커버리지 ≥ 80% (특히 crypto 모듈 ≥ 95%)
- [ ] E2E 테스트: 회원가입 → vault 추가 → 다른 디바이스 동기화 → 자동입력 시나리오 통과
- [ ] OWASP ASVS V6 Cryptography Level 2 체크리스트 100% 통과
- [ ] 1명 이상 외부 보안 전문가 코드 리뷰 완료
- [ ] 사용자 문서 (Korean + English) 작성

### 4.2 Quality Criteria

- [ ] Crypto 모듈: 테스트 커버리지 ≥ 95%, 모든 키 길이/알고리즘 NIST/OWASP 준수
- [ ] 전체 코드: 테스트 커버리지 ≥ 80%
- [ ] Zero lint errors / Zero TypeScript strict errors
- [ ] 모든 플랫폼 빌드 성공 (CI/CD 그린)
- [ ] Bundle size: 웹 첫 로드 < 200KB gzip
- [ ] Lighthouse Performance ≥ 90 (웹)
- [ ] Mobile cold start < 2초 (iPhone 12 / Pixel 6 기준)

### 4.3 Business / Adoption Criteria (출시 후 90일)

- [ ] 활성 사용자 ≥ 1,000명
- [ ] 평균 디바이스 수 ≥ 2.0개/사용자
- [ ] 7일 리텐션 ≥ 50%
- [ ] App Store 리뷰 평점 ≥ 4.3

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **마스터 패스워드 분실로 vault 영구 손실** | High | High | 복구 키(24-word seed) 의무 발급 + UX로 안전 보관 가이드, 옵션으로 신뢰할 만한 연락처 위임 복구 |
| **BaaS(Supabase/Firebase)와 E2EE 정합성 부족** | High | Medium | Plan/Design 단계에서 두 BaaS의 RLS/보안 모델 PoC 비교, 클라이언트 측에서 모든 암복호화 처리하고 BaaS는 단순 암호문 저장소로만 사용 |
| **4개 플랫폼 동시 개발 리소스 부족** | High | High | 코어 crypto/sync 로직을 공유 라이브러리(TypeScript)로 분리, 웹→확장→모바일→데스크톱 순차 단계적 출시 |
| **Chrome MV3 자동입력 권한/스토어 심사** | Medium | Medium | MV3 권한 최소화, 콘텐츠 스크립트 격리, 사전 Chrome Web Store 정책 검토 |
| **서버 측 키 유출 (BaaS 계정 탈취)** | Medium | Low | 영지식 모델이라 서버에 키 없음. BaaS 계정에 2FA 강제, IP 허용 목록, 감사 로그 모니터링 |
| **사이드채널 공격 (메모리 덤프, 키로거)** | Medium | Low | 잠금 해제된 vault 자동 잠금(5분 비활성), 클립보드 자동 클리어(30초), 메모리 0 채우기 |
| **모바일 키체인/Keystore 호환성 이슈** | Medium | Medium | 플랫폼 네이티브 보안 저장소(iOS Keychain, Android Keystore) 활용, BiometricPrompt API 표준 사용 |
| **법규 (수출/암호 규제)** | Low | Low | Open-source 일반 암호화 라이브러리 사용으로 EAR 5D002 면제, 배포 국가별 사전 검토 |

---

## 6. Impact Analysis

> **Purpose**: 신규 프로젝트이므로 기존 컨슈머 영향은 없음. 다만 외부 의존(BaaS 선택)이 모든 후속 단계에 영향을 미치므로 명시.

### 6.1 Changed Resources

신규 프로젝트 — 변경되는 리소스 없음. 단, 다음 신규 리소스가 모든 클라이언트에 공유됨:

| Resource | Type | Change Description |
|----------|------|--------------------|
| `@123pass/core-crypto` | 신규 공유 라이브러리 (TS) | Argon2id 키 도출, AES-GCM 암복호화, ECDH 공유 키 |
| `@123pass/vault-sdk` | 신규 공유 라이브러리 (TS) | Vault CRUD + Sync 클라이언트 |
| Supabase/Firebase 프로젝트 | 신규 BaaS 자원 | Auth, DB(또는 Firestore), Realtime |
| Chrome Web Store extension | 신규 배포 채널 | MV3 확장 |
| App Store / Google Play | 신규 배포 채널 | 모바일 앱 |

### 6.2 Current Consumers

해당 없음 (신규 프로젝트).

### 6.3 Verification

- [ ] BaaS 선택 (Supabase vs Firebase) PoC: RLS/보안 규칙으로 영지식 모델 검증
- [ ] `@123pass/core-crypto` 라이브러리는 모든 클라이언트(웹/확장/모바일/데스크톱)에서 동일 코드 사용 — 단위 테스트 100% 통과
- [ ] 마이그레이션 전략: 마스터 패스워드 변경 시 모든 vault 항목 재암호화 절차 검증

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites, portfolios | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend, SaaS MVPs | ☑ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic, complex architectures | ☐ |

**Rationale**: BaaS(Supabase/Firebase) 기반 + 다중 클라이언트 풀스택 SaaS MVP 형태이므로 **Dynamic** 레벨이 적합. 단, 보안 도메인 특성상 crypto/vault 모듈은 Enterprise 수준의 레이어 분리를 부분 적용한다 (Hybrid 접근).

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| **Monorepo 도구** | Nx / Turborepo / pnpm workspaces | Turborepo + pnpm workspaces | 4개 플랫폼 + 공유 라이브러리 관리, Vercel 친화 |
| **공유 언어** | TypeScript / Rust / Dart | TypeScript | 웹/확장/모바일(RN)/데스크톱(Tauri JS or Electron) 모두 TS 코어 재사용 |
| **웹 프레임워크** | Next.js / Vite SPA / Remix | Next.js (App Router) | bkit Dynamic 표준, SSR + 정적 export 모두 가능 |
| **State Management** | Context / Zustand / Redux / Jotai | Zustand | 가벼움 + 비동기 지원 + RN 공유 가능 |
| **API Client** | fetch / axios / react-query / Supabase SDK | Supabase JS SDK + TanStack Query | BaaS 공식 SDK, Realtime 채널 활용 |
| **Form Handling** | react-hook-form / formik / native | react-hook-form + zod | 타입 안전 + 검증 |
| **Styling** | Tailwind / CSS Modules / styled-components | Tailwind CSS | 4개 플랫폼 일부에서 일관 적용 (웹/확장), 모바일은 Tamagui or NativeWind |
| **모바일 프레임워크** | React Native / Flutter / Expo | React Native + Expo (EAS) | TS 코어 재사용 극대화, Expo로 빌드/배포 간소화 |
| **데스크톱 프레임워크** | Electron / Tauri / Neutralino | Tauri (Rust 백엔드 + JS UI) | Electron 대비 메모리 1/5, 보안 강점, 단 모바일 Sync 코드 일부 재사용 가능 |
| **백엔드 (BaaS)** | Supabase / Firebase | **Supabase (1차안)** | PostgreSQL + Row Level Security가 영지식 모델 검증에 더 명시적, OSS 자가호스팅 옵션 |
| **암호화** | Web Crypto API / libsodium-wrappers / noble-crypto | noble-crypto + Web Crypto | 순수 JS 구현, 모든 플랫폼 동작, 감사 가능 |
| **Key Derivation** | PBKDF2 / Argon2id / scrypt | **Argon2id** | OWASP/NIST 권장, 메모리하드 |
| **Testing** | Jest / Vitest / Playwright | Vitest (단위) + Playwright (E2E) + Detox (RN E2E) | 빠른 단위 + 크로스플랫폼 E2E |
| **CI/CD** | GitHub Actions / Vercel / EAS | GitHub Actions + Vercel(웹) + EAS(모바일) + Tauri Action(데스크톱) | 모노레포 친화 |

### 7.3 Clean Architecture Approach

```
Selected Level: Dynamic (Hybrid — crypto/vault 모듈만 Enterprise 레이어링)

Folder Structure (Monorepo):
┌──────────────────────────────────────────────────────┐
│ 123pass-app/                                         │
│ ├── apps/                                            │
│ │   ├── web/              # Next.js (vault UI)       │
│ │   ├── extension/        # Chrome MV3               │
│ │   ├── mobile/           # React Native + Expo      │
│ │   └── desktop/          # Tauri                    │
│ ├── packages/                                        │
│ │   ├── core-crypto/      # Argon2id, AES-GCM, ECDH  │
│ │   │   └── (domain/application/infra 레이어)         │
│ │   ├── vault-sdk/        # Vault CRUD + Sync client │
│ │   │   └── (domain/application/infra 레이어)         │
│ │   ├── ui/               # 공유 React 컴포넌트      │
│ │   └── config/           # tsconfig, eslint 공유    │
│ ├── supabase/             # 스키마, RLS, migration   │
│ ├── docs/                 # 기획/설계/분석/리포트    │
│ ├── pnpm-workspace.yaml                              │
│ └── turbo.json                                       │
└──────────────────────────────────────────────────────┘
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

신규 프로젝트이므로 모두 미설정:

- [ ] `CLAUDE.md` (작성 예정 — Plan 승인 후 Design 단계 시작 전)
- [ ] `docs/01-plan/conventions.md` (Phase 2 산출물 — 신규 작성 필요)
- [ ] `CONVENTIONS.md` (선택)
- [ ] ESLint 설정 (`.eslintrc.*` — 신규)
- [ ] Prettier 설정 (`.prettierrc` — 신규)
- [ ] TypeScript 설정 (`tsconfig.json` — 신규, strict 모드)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | missing | 파일: kebab-case, 컴포넌트/타입: PascalCase, 함수/변수: camelCase, 환경변수: SCREAMING_SNAKE_CASE | High |
| **Folder structure** | missing | Monorepo 7.3 구조 + 각 패키지 내부 `src/domain`, `src/application`, `src/infrastructure` (crypto/vault만) | High |
| **Import order** | missing | builtin → external → @123pass/* → relative, ESLint import/order 적용 | Medium |
| **Environment variables** | missing | `.env.local` (gitignore), `SUPABASE_URL`, `SUPABASE_ANON_KEY` 등 | High |
| **Error handling** | missing | Result<T,E> 패턴 (vault-sdk), 사용자 노출 메시지는 코드 분리 | High |
| **Git commit** | missing | Conventional Commits, scope: `crypto`/`vault`/`web`/`ext`/`mobile`/`desktop` | Medium |
| **Branch** | missing | trunk-based, `main` + short-lived feature branches | Medium |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Client | ☐ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anonymous Key | Client | ☐ |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 관리용 (절대 클라 노출 금지) | Server | ☐ |
| `NEXT_PUBLIC_APP_URL` | 앱 URL (확장과 통신용) | Client | ☐ |
| `HIBP_API_KEY` | Have I Been Pwned API (선택) | Server/Worker | ☐ |
| `EXPO_PROJECT_ID` | Expo EAS 프로젝트 ID | Build | ☐ |
| `TAURI_PRIVATE_KEY` | Tauri 자동 업데이트 서명키 | Build | ☐ |
| `SENTRY_DSN` | 에러 모니터링 (옵트인) | Client/Server | ☐ |

### 8.4 Pipeline Integration

bkit 9-phase Development Pipeline 적용:

| Phase | Status | Document Location | Command |
|-------|:------:|-------------------|---------|
| Phase 1 (Schema) | ☐ | `docs/01-plan/schema.md` | `/pipeline-next` |
| Phase 2 (Convention) | ☐ | `docs/01-plan/conventions.md` | `/pipeline-next` |
| Phase 3 (Mockup) | ☐ | `docs/01-plan/mockup/` | `/pipeline-next` |
| Phase 4 (API) | ☐ | `docs/02-design/api.md` | `/pipeline-next` |
| Phase 5 (Design System) | ☐ | `docs/02-design/design-system/` | `/pipeline-next` |
| Phase 6 (UI Integration) | ☐ | `docs/02-design/ui-integration.md` | `/pipeline-next` |
| Phase 7 (SEO/Security) | ☐ | `docs/02-design/security.md` | `/pipeline-next` |
| Phase 8 (Review) | ☐ | `docs/03-analysis/` | `/pipeline-next` |
| Phase 9 (Deployment) | ☐ | `docs/02-design/deployment.md` | `/pipeline-next` |

---

## 9. Next Steps

1. [ ] **Plan 리뷰 및 승인** (사용자) — 본 문서 검토
2. [ ] **Phase 1 (Schema)**: vault 아이템/사용자/공유 그룹 데이터 모델 + crypto 키 스키마 정의
3. [ ] **Phase 2 (Convention)**: 코딩 컨벤션 문서화
4. [ ] **BaaS PoC**: Supabase RLS로 영지식 모델 검증 (vs Firebase 옵션 비교)
5. [ ] **Design 문서 작성** (`/pdca design 123Pass-app`) — 3-Architecture Options 비교
6. [ ] **Design Anchor**: 디자인 시스템 토큰 잠금 (옵션)
7. [ ] **Implementation 시작**: 코어 crypto → vault-sdk → 웹 → 확장 → 모바일 → 데스크톱

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-26 | Initial draft — 크로스플랫폼 비밀번호 매니저 MVP 계획 | bandnara123@gmail.com |
