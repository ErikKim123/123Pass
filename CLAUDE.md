# 123Pass-app — Claude Code Project Rules

## Language Rules

- **Conversation**: 한국어
- **Code / Comments / Commits / PR**: English
- **`docs/`** 문서: 한국어 (PDCA 산출물)
- **README.md** / **CLAUDE.md**: 한국어 (개발자 안내)

## Project Conventions

### Architecture (Option C — Pragmatic Balance)

- `packages/core-crypto`: 순수 함수만. `@noble/*`만 외부 의존. 어떤 사이드이펙트도 없어야 함.
- `packages/vault-sdk`: Repository 인터페이스 + Supabase 구현. 다른 BaaS 어댑터로 교체 가능하도록 캡슐화.
- `packages/shared`: zod 스키마 + 타입. 어디서나 import 가능.
- `packages/ui`: React 공유 컴포넌트. Zustand store 포함.
- `apps/*`: vault-sdk, ui, shared만 import. `@supabase/*` 직접 import 금지.
- `@noble/*` 직접 import는 `packages/core-crypto/`에서만 허용 (ESLint rule로 강제).

### Naming

- 컴포넌트: `PascalCase.tsx`
- 유틸/일반 TS 파일: `kebab-case.ts`
- 폴더: `kebab-case`
- 함수/변수: `camelCase`
- 상수: `UPPER_SNAKE_CASE`
- 타입/인터페이스: `PascalCase`

### Crypto 작성 규칙

- 모든 crypto 함수는 입력/출력을 `Uint8Array` 또는 명시 타입으로
- 키는 사용 후 즉시 `memzero()`로 0-채움
- `crypto.getRandomValues` (Web) 또는 `randomBytes` (Node) 만 사용, `Math.random()` 절대 금지
- 새 알고리즘 추가 시 KAT(Known Answer Test) 벡터 반드시 동봉
- 단위 테스트 커버리지 ≥ 95%

### Git Commits

Conventional Commits:
- `feat(crypto): add Argon2id KDF`
- `feat(vault): implement share use case`
- `fix(web): handle vault lock timeout`
- `test(crypto): add RFC 5869 HKDF vectors`
- `docs: update Design §3.3 schema`

Scope: `crypto`, `vault`, `shared`, `ui`, `web`, `ext`, `mobile`, `desktop`, `supabase`, `ci`, `docs`

### Testing

- 단위 테스트: Vitest (`*.test.ts`)
- E2E: Playwright (`tests/e2e/*.spec.ts`)
- Mobile E2E: Detox
- crypto는 KAT 우선, 그 다음 property-based test 권장

## PDCA Phase 정보

현재 진행 모듈은 `docs/02-design/features/123Pass-app.design.md` §11.3 Session Guide 참조.
