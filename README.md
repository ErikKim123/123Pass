# 123Pass-app

> Zero-Knowledge E2EE 기반 크로스플랫폼 비밀번호 매니저 — Web / Browser Extension / Mobile / Desktop

마스터 패스워드 하나로 모든 디바이스에서 안전하게 자격증명을 보관·동기화·자동입력합니다. 서버는 암호문만 보유하며, 어떤 평문도 절대 노출되지 않습니다.

## 핵심 가치

- **영지식(Zero-Knowledge)**: 클라이언트에서 마스터 패스워드 파생 키로 모든 데이터를 암호화. 서버 운영자도 평문에 접근 불가능.
- **크로스플랫폼**: Web (Next.js) / Chrome Extension (MV3) / Mobile (Expo) / Desktop (Tauri)
- **공유 코어**: TypeScript로 작성된 `@123pass/core-crypto`, `@123pass/vault-sdk`를 4개 클라이언트가 공유
- **OWASP ASVS V6 Cryptography Level 2 준수**

## 아키텍처

```
apps/
├── web/          Next.js App Router
├── extension/    Chrome MV3
├── mobile/       React Native + Expo
└── desktop/      Tauri (Rust + JS)

packages/
├── core-crypto/  Argon2id + AES-256-GCM + ECDH P-256 (순수 함수)
├── vault-sdk/    Vault CRUD + Sync + Share (Repository pattern)
├── ui/           공유 React 컴포넌트
└── shared/       타입 + zod 스키마

supabase/         스키마 + RLS + Realtime
```

자세한 설계는 [docs/02-design/features/123Pass-app.design.md](docs/02-design/features/123Pass-app.design.md)를 참조하세요.

## 시작하기

### 사전 요구사항

- Node.js >= 20.11.0 (`.nvmrc` 참조)
- pnpm >= 9.0.0 (`corepack enable pnpm`)

### 설치

```bash
pnpm install
```

### 개발 명령

```bash
pnpm test              # 모든 패키지 단위 테스트
pnpm test:coverage     # 커버리지 포함 (core-crypto는 ≥95% 필수)
pnpm lint              # ESLint
pnpm typecheck         # TypeScript strict 검증
pnpm build             # 모든 패키지 빌드
```

## 보안 모델

- **KDF**: Argon2id (memory=64MB, iterations=3, parallelism=4)
- **AEAD**: AES-256-GCM (12-byte random IV per encryption, 16-byte authTag)
- **공유 (1:1)**: ECDH P-256 + HKDF-SHA256로 vault key wrapping
- **검색**: HMAC-SHA256 결정론적 해시 (평문 노출 없이 검색)
- **복구**: BIP39 24-word seed phrase (선택 발급)

## PDCA 문서

- [Plan](docs/01-plan/features/123Pass-app.plan.md)
- [Design](docs/02-design/features/123Pass-app.design.md)
- [Analysis](docs/03-analysis/) (TBD)
- [Report](docs/04-report/) (TBD)

## 라이선스

TBD
