# 123Pass-app Design Document

> **Summary**: Zero-Knowledge E2EE 기반 크로스플랫폼 비밀번호 매니저 — Option C (Pragmatic Balance) 아키텍처
>
> **Project**: 123Pass-app
> **Version**: 0.1.0
> **Author**: bandnara123@gmail.com
> **Date**: 2026-05-26
> **Status**: Draft
> **Planning Doc**: [123Pass-app.plan.md](../../01-plan/features/123Pass-app.plan.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 | [Schema Definition](../../01-plan/schema.md) | ❌ (TODO) |
| Phase 2 | [Coding Conventions](../../01-plan/conventions.md) | ❌ (TODO) |
| Phase 3 | [Mockup](../mockup/123Pass-app.md) | ❌ (TODO) |
| Phase 4 | [API Spec](../api/123Pass-app.md) | N/A (Supabase auto-gen) |

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | Bitwarden/1Password 대안 갈증 + LastPass 사고 이후 영지식 모델 신뢰 가치 부상. 사용자가 직접 키를 통제하는 영지식 PW 매니저 부재 |
| **WHO** | 1차: 다중 디바이스 보안 의식 사용자 / 2차: 가족 공유(2~6명) / 3차: 소규모 팀(5~20명) |
| **RISK** | (1) 마스터 패스워드 분실 시 복구 불가 (2) BaaS-E2EE 정합성 검증 필요 (3) 4개 플랫폼 동시 개발 리소스 부담 |
| **SUCCESS** | (1) 디바이스 간 < 1초 동기화 (2) 키 도출 < 500ms (Argon2id) (3) DB 덤프 시 평문 0 (4) 90일 1,000 MAU |
| **SCOPE** | Phase 1 코어 크립토+백엔드 스키마 → Phase 2 웹+확장 → Phase 3 모바일 → Phase 4 데스크톱 → Phase 5 공유/감사 |

---

## 1. Overview

### 1.1 Design Goals

- **영지식 모델 강제**: 서버 코드 어디에서도 평문 자격증명에 접근 불가능하도록 아키텍처 차원에서 보장
- **크로스플랫폼 코드 재사용 ≥ 70%**: 코어 crypto/vault-sdk를 TypeScript로 작성하여 4개 클라이언트 공통 사용
- **BaaS 교체 가능성**: vault-sdk 내부 Repository 추상화로 Supabase ↔ Firebase ↔ 자가호스팅 전환 가능
- **테스트 가능성**: crypto 모듈 단위 테스트 ≥ 95%, vault-sdk는 Repository mock으로 격리 테스트
- **점진 출시**: 웹 → 확장 → 모바일 → 데스크톱 순으로 모듈별 독립 출시

### 1.2 Design Principles

- **Pragmatic Balance**: 보안 핵심(crypto, vault-sdk)은 Clean Layer 적용, 그 외(UI, 앱)는 단순 구조 유지
- **Pure Crypto Core**: `core-crypto`는 부수효과 없는 순수 함수 모음, 입출력 명시 — 감사 용이
- **Repository Pattern (Selective)**: vault-sdk에서만 Repository 추상화 — 다른 곳은 직접 호출 허용
- **Type-First**: 모든 도메인 타입은 `@123pass/shared`에 정의 + zod 스키마로 런타임 검증
- **Fail-Closed Security**: 키 도출 실패, 무결성 실패 시 평문 노출 대신 명시적 에러
- **Defense in Depth**: 클라이언트 암호화 + RLS + 키 분리 + 클립보드 자동 클리어 + 자동 잠금

---

## 2. Architecture Options (v1.7.0)

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 단일 core 패키지 | Ports & Adapters 엄격 | 패키지 분리 + 실용 내부 |
| **New Files (est.)** | ~80 | ~200 | ~130 |
| **Modified Files** | 0 (신규) | 0 (신규) | 0 (신규) |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | Low (4주) | High (8주+) | Medium (6주) |
| **Risk** | High (BaaS 락인) | Medium (오버엔지) | Low (균형) |
| **Recommendation** | PoC, 1인 | 대형 팀 | **Default choice** |

**Selected**: **Option C — Pragmatic Balance** — **Rationale**: 보안 도메인(crypto)은 순수 함수로 격리하여 감사 용이성 확보, vault-sdk는 Repository 추상화로 BaaS 교체 가능성 유지, 나머지는 단순 구조로 4개 플랫폼 동시 개발 부담 최소화. MVP 6주 타임라인에 정합.

### 2.1 Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                  │
│  ┌────────┐  ┌───────────┐  ┌─────────┐  ┌──────────┐            │
│  │  Web   │  │ Extension │  │ Mobile  │  │ Desktop  │            │
│  │Next.js │  │ Chrome MV3│  │  RN/Expo│  │  Tauri   │            │
│  └───┬────┘  └─────┬─────┘  └────┬────┘  └─────┬────┘            │
│      │             │              │             │                 │
│      └─────────────┴──────────────┴─────────────┘                 │
│                       │                                            │
│                       ▼                                            │
│              ┌──────────────────────┐                              │
│              │  @123pass/vault-sdk   │ ◀── Repository 인터페이스   │
│              │  (CRUD, Sync, Share)  │                              │
│              └──────────┬───────────┘                              │
│                         │                                          │
│                         ▼                                          │
│              ┌──────────────────────┐                              │
│              │ @123pass/core-crypto │ ◀── 순수 함수 (Argon2id,    │
│              │   (KDF, AEAD, ECDH)  │      AES-GCM, ECDH-P256)    │
│              └──────────────────────┘                              │
└─────────────────────────┬────────────────────────────────────────┘
                          │ (HTTPS, 암호문만)
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                      BACKEND (Supabase)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  Auth       │  │ PostgreSQL  │  │  Realtime (WebSocket)    │  │
│  │ (email+OTP) │  │  + RLS      │  │  (sync 채널)              │  │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘  │
│  ▲                                                                │
│  └── 평문 자격증명 절대 접근 불가 — 암호문 + 메타데이터만 저장 ──── │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow (Vault 잠금 해제 → 항목 추가 시나리오)

```
1. User → 마스터 패스워드 입력
2. Client → core-crypto: deriveKeys(password, salt)
            ├── authHash (서버 인증용, Argon2id)
            └── vaultKey (vault 암호화용, Argon2id, salt 다름)
3. Client → Supabase Auth: signIn(email, authHash)
4. Server → JWT 발급 (vaultKey는 절대 전송 안 됨)
5. Client → vault-sdk.list(): 암호문 fetch
6. Client → core-crypto: AES-GCM decrypt(ciphertext, vaultKey) → 평문 vault
7. User → 새 항목 추가
8. Client → core-crypto: AES-GCM encrypt(item, vaultKey) → 암호문
9. Client → vault-sdk.create(ciphertext): Supabase insert
10. Supabase Realtime → 다른 디바이스에 INSERT 이벤트 broadcast
11. Other Devices → vault-sdk subscription → 자동 fetch + decrypt
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `apps/web` | `vault-sdk`, `ui`, `shared` | Next.js vault 관리 UI |
| `apps/extension` | `vault-sdk`, `core-crypto`, `shared` | 자동입력 + content script |
| `apps/mobile` | `vault-sdk`, `ui`, `shared`, `expo-secure-store` | 생체인증 + vault UI |
| `apps/desktop` | `vault-sdk`, `ui`, `shared`, `@tauri-apps/api` | 트레이 + 단축키 |
| `vault-sdk` | `core-crypto`, `shared`, `@supabase/supabase-js` | CRUD + Sync + Share |
| `core-crypto` | `@noble/hashes`, `@noble/ciphers`, `@noble/curves` | 순수 crypto 함수 |
| `ui` | `react`, `tailwindcss` | 공유 컴포넌트 |
| `shared` | `zod` | 타입 + 검증 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
// shared/types/vault.ts

// 서버에 저장되는 형태 (모두 암호화된 상태)
interface EncryptedVaultItem {
  id: string;                  // UUID
  userId: string;              // owner FK
  ciphertext: string;          // base64 — AES-256-GCM 암호문 (plaintext = VaultItemPayload)
  iv: string;                  // base64 — GCM IV (12 bytes)
  authTag: string;             // base64 — GCM auth tag (16 bytes)
  itemType: 'login' | 'note' | 'card' | 'identity' | 'totp';  // 메타데이터 (검색용)
  // 검색을 위한 결정론적 해시 (HMAC-SHA256, 키는 vaultKey 파생) — 평문 노출 없이 검색 가능
  searchHash: string | null;   // hex — null이면 검색 불가
  folderId: string | null;     // FK to folders (옵션)
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;             // CRDT 충돌 해결용 모노토닉 카운터
}

// 클라이언트에서 복호화 후 사용 형태 (절대 서버 전송 X)
interface VaultItemPayload {
  name: string;                // "Gmail (개인)"
  url?: string;                // "https://mail.google.com"
  username?: string;
  password?: string;
  notes?: string;
  totpSecret?: string;         // base32 (TOTP 시드)
  customFields?: { name: string; value: string; type: 'text' | 'password' }[];
  tags?: string[];
}

// 사용자 — Supabase Auth와 1:1
interface User {
  id: string;                  // = auth.users.id
  email: string;
  // 클라이언트가 등록 시 결정하는 KDF 파라미터 (디바이스 마이그레이션 대비)
  kdfParams: {
    algorithm: 'argon2id';
    memoryCost: number;        // 65536 (64MB)
    timeCost: number;          // 3
    parallelism: number;       // 4
    saltAuth: string;          // base64 — authHash 도출용 salt
    saltVault: string;         // base64 — vaultKey 도출용 salt
  };
  publicKey: string;           // base64 — ECDH P-256 공개키 (공유 수신용)
  // privateKey는 서버에 평문 저장 X. vaultKey로 암호화하여 저장
  encryptedPrivateKey: { ciphertext: string; iv: string; authTag: string };
  recoveryEnabled: boolean;    // 24-word seed 발급 여부
  createdAt: string;
}

// 공유 (1:1)
interface SharedItem {
  id: string;
  itemId: string;              // FK to encrypted_vault_items
  fromUserId: string;
  toUserId: string;
  // 수신자 공개키로 암호화된 vaultKey wrapping (AES-256-GCM)
  // authTag는 무결성 검증을 위한 16바이트 GCM tag (base64). v0.2에서 추가됨.
  wrappedKey: { ciphertext: string; iv: string; authTag: string; ephemeralPublicKey: string };
  permission: 'read' | 'write';
  createdAt: string;
  acceptedAt: string | null;
}

// 그룹 공유 (가족/팀)
interface Group {
  id: string;
  name: string;                // "우리 가족" — 그룹 정보 자체는 평문(개인정보 아님)
  ownerId: string;
  // 그룹 마스터 키 (대칭) — 각 멤버의 공개키로 래핑하여 저장
  createdAt: string;
}

interface GroupMember {
  groupId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  wrappedGroupKey: { ciphertext: string; iv: string; authTag: string; ephemeralPublicKey: string };
  joinedAt: string;
}

interface GroupItem {
  id: string;
  groupId: string;
  // 그룹 키로 암호화된 vault 항목
  ciphertext: string;
  iv: string;
  authTag: string;
  itemType: string;
  createdBy: string;
  createdAt: string;
  version: number;
}

// 보안 감사 (메타데이터만)
interface AuditEvent {
  id: string;
  userId: string;
  eventType: 'login' | 'item_created' | 'item_updated' | 'item_deleted' | 'share_created' | 'master_pw_changed';
  ipAddress: string;           // 해시 처리 권장
  userAgent: string;
  // 평문 항목 데이터 절대 포함 X
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

### 3.2 Entity Relationships

```
[User] 1 ──── N [EncryptedVaultItem]
   │
   ├── 1 ──── N [Folder]
   │
   ├── 1 ──── N [SharedItem] (from)
   ├── 1 ──── N [SharedItem] (to)
   │
   ├── 1 ──── N [GroupMember]
   │              │
   │              └── N ──── 1 [Group] 1 ──── N [GroupItem]
   │
   └── 1 ──── N [AuditEvent]
```

### 3.3 Database Schema (Supabase / PostgreSQL)

```sql
-- 모든 테이블에 RLS(Row Level Security) 적용 필수

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  kdf_params jsonb not null,
  public_key text not null,
  encrypted_private_key jsonb not null,
  recovery_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table users enable row level security;
create policy "users_self_read" on users for select using (auth.uid() = id);
create policy "users_self_update" on users for update using (auth.uid() = id);

create table folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- 폴더명도 암호화 (사용자 정보 누출 방지)
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  created_at timestamptz not null default now()
);
alter table folders enable row level security;
create policy "folders_owner" on folders for all using (auth.uid() = user_id);

create table encrypted_vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  item_type text not null check (item_type in ('login','note','card','identity','totp')),
  search_hash text,
  folder_id uuid references folders(id) on delete set null,
  favorite boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table encrypted_vault_items enable row level security;
create policy "vault_owner" on encrypted_vault_items for all using (auth.uid() = user_id);
create index vault_user_updated_idx on encrypted_vault_items (user_id, updated_at desc);
create index vault_search_idx on encrypted_vault_items (user_id, search_hash);

create table shared_items (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references encrypted_vault_items(id) on delete cascade,
  from_user_id uuid not null references users(id),
  to_user_id uuid not null references users(id),
  wrapped_key jsonb not null,
  permission text not null check (permission in ('read','write')),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table shared_items enable row level security;
create policy "share_participant" on shared_items
  for select using (auth.uid() in (from_user_id, to_user_id));
create policy "share_create" on shared_items
  for insert with check (auth.uid() = from_user_id);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  wrapped_group_key jsonb not null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table group_members enable row level security;
create policy "group_member_self_read" on group_members
  for select using (auth.uid() = user_id);

create table group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  item_type text not null,
  created_by uuid not null references users(id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table group_items enable row level security;
create policy "group_item_member" on group_items
  for all using (
    exists (select 1 from group_members where group_id = group_items.group_id and user_id = auth.uid())
  );

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table audit_events enable row level security;
create policy "audit_self_read" on audit_events for select using (auth.uid() = user_id);
create index audit_user_time_idx on audit_events (user_id, created_at desc);

-- Realtime 구독 활성화
alter publication supabase_realtime add table encrypted_vault_items;
alter publication supabase_realtime add table group_items;
alter publication supabase_realtime add table shared_items;
```

---

## 4. API Specification

Dynamic level (Supabase BaaS) — vault-sdk는 Supabase JS SDK를 통해 직접 호출. 별도 백엔드 API 서버 없음.

### 4.1 Endpoint List (Supabase auto-generated REST + RPC)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/v1/signup` | 회원가입 (email + authHash) | None |
| POST | `/auth/v1/token?grant_type=password` | 로그인 (authHash) | None |
| POST | `/auth/v1/logout` | 로그아웃 | Required |
| GET | `/rest/v1/users?id=eq.{id}` | 사용자 KDF 파라미터 + public key 조회 | Required |
| GET | `/rest/v1/encrypted_vault_items?user_id=eq.{uid}` | Vault 전체 조회 | Required (RLS) |
| POST | `/rest/v1/encrypted_vault_items` | Vault 항목 생성 | Required (RLS) |
| PATCH | `/rest/v1/encrypted_vault_items?id=eq.{id}` | Vault 항목 수정 | Required (RLS) |
| DELETE | `/rest/v1/encrypted_vault_items?id=eq.{id}` | Vault 항목 삭제 | Required (RLS) |
| POST | `/rest/v1/shared_items` | 1:1 공유 생성 | Required (RLS) |
| POST | `/rest/v1/rpc/rotate_master_password` | 마스터 PW 변경 (RPC, 모든 vault 재암호화 트랜잭션) | Required |
| WS | `/realtime/v1/websocket` | 실시간 vault 변경 구독 | Required |

### 4.2 Detailed Specification

#### `POST /rest/v1/encrypted_vault_items` (vault-sdk가 호출)

**Request:**
```json
{
  "ciphertext": "base64...",
  "iv": "base64...",
  "auth_tag": "base64...",
  "item_type": "login",
  "search_hash": "hex...",
  "folder_id": null,
  "favorite": false,
  "version": 1
}
```
> 클라이언트는 절대 평문 username/password/url을 본 엔드포인트에 전송하지 않는다.

**Response (201 Created):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "ciphertext": "base64...",
  "iv": "...",
  "auth_tag": "...",
  "item_type": "login",
  "created_at": "2026-05-26T10:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: zod 검증 실패 (vault-sdk가 사전 검증)
- `401 Unauthorized`: JWT 만료/누락
- `403 Forbidden`: RLS 위반 시도
- `429 Too Many Requests`: rate limit (분당 60 INSERT)

### 4.3 RPC: rotate_master_password

```sql
-- Supabase edge function or PL/pgSQL — 트랜잭션 보장
-- 입력: 신규 authHash + 재암호화된 vault 전체 + 신규 encryptedPrivateKey
-- 동작: 동일 트랜잭션 내에서 users.kdf_params 갱신, 모든 vault 항목 ciphertext 교체
```

---

## 5. UI/UX Design

### 5.1 Screen Layout (Web)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo] 123Pass        [Search]            [+ New]  [⚙] [Lock]  │ ← Header
├──────────┬──────────────────────────────────────────────────────┤
│  Sidebar │  Item List                  │  Item Detail (pane)    │
│          │                             │                        │
│ All      │  ┌───────────────────────┐  │  Name: Gmail (개인)    │
│ Favorites│  │ ★ Gmail (개인)         │  │  URL:  mail.google.com │
│ Logins   │  │   me@gmail.com         │  │  User: me@gmail.com    │
│ Notes    │  │ ─────────────────────  │  │  Pass: ●●●●●  [👁][📋] │
│ Cards    │  │ ☆ AWS Console          │  │  TOTP: 482 193 (15s)   │
│ TOTP     │  │   ops@company.com      │  │                        │
│ Shared   │  │ ─────────────────────  │  │  [Edit] [Delete]       │
│ Trash    │  │ ☆ Github               │  │                        │
│          │  │ ...                    │  │                        │
│ Groups   │  └───────────────────────┘  │                        │
│ - Family │                              │                        │
│ - Team   │                              │                        │
└──────────┴──────────────────────────────┴────────────────────────┘
```

### 5.2 User Flow

```
[Landing] → [Sign Up] → [Master PW 설정] → [Recovery Seed 발급(24-word)] → [Vault Dashboard]

[Landing] → [Login] → [Master PW 입력] → [Unlock + Decrypt] → [Vault Dashboard]
                                                                  │
                                                                  ├── [+ New Item] → [Fill Form] → [Save (encrypt + sync)]
                                                                  ├── [Search] → [filter by searchHash]
                                                                  ├── [Item Click] → [Detail Pane]
                                                                  ├── [Copy Password] → [클립보드 30초 자동 클리어]
                                                                  ├── [Share Item] → [수신자 선택 + ECDH 키 교환]
                                                                  └── [Inactive 5min] → [Auto Lock]

[Browser Extension] → [Detect Login Form] → [Match by URL+searchHash] → [Suggest Autofill]
                                                                            └── [User Approves] → [vault-sdk decrypt + fill]

[Mobile] → [Biometric Unlock] → [vault-sdk decrypt] → [Vault]
                                                        └── [Backup PW] (fallback to master PW)
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `<VaultLockScreen>` | `packages/ui/src/lock/` | 마스터 PW 입력 + biometric (mobile) |
| `<VaultSidebar>` | `packages/ui/src/sidebar/` | 카테고리/폴더/그룹 네비 |
| `<VaultItemList>` | `packages/ui/src/list/` | 가상화된 항목 리스트 |
| `<VaultItemDetail>` | `packages/ui/src/detail/` | 항목 상세, 편집, 복사 |
| `<PasswordGenerator>` | `packages/ui/src/generator/` | 길이/문자셋/diceware |
| `<TotpDisplay>` | `packages/ui/src/totp/` | 6자리 + 남은 시간 ring |
| `<SecurityAudit>` | `packages/ui/src/audit/` | 약/중복/유출 점수 |
| `<ShareDialog>` | `packages/ui/src/share/` | 1:1 공유 + 그룹 공유 |
| `<RecoveryFlow>` | `packages/ui/src/recovery/` | 24-word seed 발급/입력 |

### 5.4 Page UI Checklist

#### Login Page (`/login`)
- [ ] Input: Email (type=email, required)
- [ ] Input: Master Password (type=password, required, autocomplete=current-password)
- [ ] Button: Login (disabled until both filled)
- [ ] Link: Sign up
- [ ] Link: Forgot? (→ Recovery flow)
- [ ] Toast: 로그인 실패 시 "이메일 또는 마스터 패스워드가 올바르지 않습니다" (탈취 단서 최소화)

#### Vault Dashboard (`/vault`)
- [ ] Header: Logo / Search input / `+ New` button / Settings / Lock 버튼
- [ ] Sidebar: All / Favorites / Logins / Notes / Cards / TOTP / Shared / Trash / Groups(N)
- [ ] List: 가상화된 아이템 카드 (★ 즐겨찾기, name, username, 마지막 사용 시각)
- [ ] Detail Pane: 선택 시 표시 (name, url, username, password 마스킹+눈/복사, totp 코드+ring, notes)
- [ ] Auto-lock 카운트다운: 5분 비활성 시 vault 잠금 (visual indicator 없음 — 보안)
- [ ] Empty State: "첫 비밀번호를 저장하세요" + `+ New` 큰 버튼

#### New / Edit Item Modal
- [ ] Field: Name (required)
- [ ] Field: URL (optional, with favicon preview)
- [ ] Field: Username
- [ ] Field: Password (with Show/Generate 버튼)
- [ ] Generator Inline: 길이 슬라이더 (8-128), 대문자/소문자/숫자/특수문자 토글, diceware 토글
- [ ] Strength Meter: zxcvbn 점수 0-4 시각화
- [ ] Field: Notes (multiline)
- [ ] Field: Tags (chip input)
- [ ] Field: TOTP Secret (선택, base32 입력 또는 QR 스캔 — 모바일만)
- [ ] Button: Save (encrypts → vault-sdk.create → sync)
- [ ] Button: Cancel

#### Security Audit Page (`/vault/audit`)
- [ ] Score Card: 전체 보안 점수 0-100
- [ ] Section: Weak Passwords (zxcvbn ≤ 2 항목 리스트)
- [ ] Section: Reused Passwords (해시 매칭 — 평문 노출 X)
- [ ] Section: Pwned Passwords (HIBP API range query 결과)
- [ ] Section: Old Passwords (1년+ 미변경)
- [ ] Per-item Action: "패스워드 변경" 버튼

#### Settings Page (`/settings`)
- [ ] Section: Account (email 표시, 마스터 PW 변경 버튼)
- [ ] Section: Recovery (seed 재발급, biometric 토글)
- [ ] Section: Auto-lock (1/5/15/30분 라디오)
- [ ] Section: Clipboard Clear (10/30/60초 라디오)
- [ ] Section: Sharing (들어온 공유 요청, 활성 공유 관리)
- [ ] Section: Devices (로그인된 디바이스 리스트 + 강제 로그아웃)
- [ ] Section: Export / Import (encrypted JSON 다운로드)
- [ ] Section: Delete Account (30일 grace period 안내)

#### Browser Extension Popup
- [ ] State: Locked → master PW 입력
- [ ] State: Unlocked → 현재 탭 도메인과 매칭되는 vault 항목 리스트
- [ ] Button: Autofill (선택 항목 → 폼 채우기)
- [ ] Button: Generate Password (현재 폼에 강력 PW 삽입)
- [ ] Button: Save Login (form submit 감지 시 자동 제안)
- [ ] Link: Open Vault (웹 앱 새 탭)

#### Mobile App (Vault)
- [ ] Lock Screen: Face ID / 지문 + 마스터 PW 폴백
- [ ] Bottom Tab: Vault / Generator / Audit / Settings
- [ ] List: 풀투리프레시 + 무한스크롤
- [ ] Detail: 패스워드 탭 → 자동 클립보드 복사 + 30s 클리어 토스트
- [ ] iOS: AutoFill Provider extension (시스템 통합)
- [ ] Android: Autofill Framework 통합

#### Desktop App (Tauri)
- [ ] System Tray: 빠른 검색 + 잠금/해제
- [ ] Global Shortcut: Cmd/Ctrl+Shift+Space → 검색 팝업
- [ ] Settings: 시작 시 자동 실행, 잠금 후 트레이 최소화

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | Message (사용자) | Cause | Handling |
|------|---------|-------|----------|
| `AUTH_INVALID_CREDENTIALS` | 이메일 또는 마스터 패스워드가 올바르지 않습니다 | 로그인 실패 (이메일/PW 구분 안 함) | 입력 폼 에러 |
| `AUTH_RATE_LIMITED` | 잠시 후 다시 시도해주세요 (5분) | 5회 연속 실패 | Lock + countdown |
| `CRYPTO_KEY_DERIVATION_FAILED` | 키 생성에 실패했습니다. 마스터 패스워드를 다시 입력하세요 | Argon2id 실행 실패 (메모리 부족 등) | 폴백 파라미터 시도 후 실패 시 에러 |
| `CRYPTO_DECRYPT_FAILED` | 데이터 복호화에 실패했습니다 | GCM auth tag 검증 실패 (변조 의심) | 해당 항목 격리, 사용자 알림, 감사 로그 |
| `VAULT_VERSION_CONFLICT` | 다른 디바이스에서 먼저 수정되었습니다 | 동시 수정 충돌 | last-writer-wins 또는 사용자 선택 UI |
| `SHARE_RECIPIENT_NOT_FOUND` | 수신자를 찾을 수 없습니다 | 공유 대상 이메일 미가입 | 초대 링크 발송 옵션 제시 |
| `NET_OFFLINE` | 오프라인입니다. 로컬 변경은 복귀 시 동기화됩니다 | 네트워크 끊김 | 오프라인 큐에 저장 |
| `SUPABASE_RLS_DENIED` | 접근 권한이 없습니다 | RLS 정책 위반 (이론상 발생 안 됨) | 즉시 로그아웃 + 보안 알림 |
| `RECOVERY_INVALID_SEED` | 복구 시드가 올바르지 않습니다 | 24-word 검증 실패 (BIP39 checksum) | 입력 재시도 |

### 6.2 Error Response Format

```json
{
  "error": {
    "code": "VAULT_VERSION_CONFLICT",
    "message": "다른 디바이스에서 먼저 수정되었습니다",
    "details": {
      "localVersion": 5,
      "remoteVersion": 7,
      "itemId": "uuid"
    }
  }
}
```

### 6.3 Crypto 실패 격리 정책

- `CRYPTO_DECRYPT_FAILED`: 단일 항목 격리 → 다른 항목은 정상 노출 (전체 vault 잠그지 않음)
- `KDF_FAILED`: 전체 unlock 차단 → 사용자에게 폴백 파라미터 시도 안내
- 모든 crypto 에러는 audit_events에 기록 (서버 측 변조 탐지 가능)

---

## 7. Security Considerations

### 7.1 OWASP ASVS V6 (Cryptography) Level 2 체크리스트

- [x] **V6.2.1**: 인증된 암호화 (AES-256-GCM) 사용
- [x] **V6.2.2**: 키 도출 함수로 Argon2id 사용 (m=64MB, t=3, p=4)
- [x] **V6.2.3**: 랜덤은 CSRNG(`crypto.getRandomValues`)만 사용
- [x] **V6.2.4**: IV/Nonce는 12바이트 random, 재사용 금지
- [x] **V6.2.5**: 키는 메모리에 최소 시간만 상주, 사용 후 0으로 채움
- [x] **V6.2.6**: PFS (ECDH 키 교환 시 ephemeral key 사용)
- [x] **V6.3.1**: 비밀번호 비교는 timing-safe 함수 사용

### 7.2 Threat Model (요약)

| Threat | Mitigation |
|--------|-----------|
| 서버 DB 덤프 (BaaS 침해) | 영지식 — ciphertext만 존재, vaultKey 없음 |
| 서버 admin 악의적 조회 | RLS 정책 + 영지식 모델 — admin도 평문 못 봄 |
| MITM (전송 중 가로채기) | TLS 강제 + ciphertext만 전송 — 평문 보호 |
| 클라이언트 메모리 덤프 | Auto-lock + 사용 후 키 0-채움 + secure context |
| 키로거 (마스터 PW 입력) | 본질적 위험 — biometric/하드웨어 키 옵션 권장 (Phase 5+) |
| 클립보드 스니핑 | 자동 클리어 (10/30/60s), 알림 |
| 무차별 대입 (마스터 PW) | Argon2id (수십초 비용) + 서버 측 rate limit (5회/5분) |
| 단말 분실 (모바일) | OS 보안 저장소 + biometric + 원격 로그아웃 |
| 공유 데이터 누출 | 수신자 공개키로만 wrap — 다른 사용자 복호화 불가 |
| Replay attack (sync) | version 카운터 + JWT exp + Realtime 인증 |
| XSS (web) | 마스터 PW 입력 시 ServiceWorker isolation, CSP strict |

### 7.3 Cryptographic Choices

```typescript
// 키 도출 (core-crypto/src/kdf.ts)
KDF: Argon2id
  memoryCost: 65536  // 64 MB
  timeCost: 3
  parallelism: 4
  outputLength: 32   // 256-bit key

// salt 분리 (인증과 vault 키 도메인 분리)
saltAuth = random(16)   // 인증 서버 전송용
saltVault = random(16)  // vault 암호화용 — 서버에 저장 OK (혼자선 무의미)

// 대칭 암호화
AEAD: AES-256-GCM
  IV: random(12) per encryption
  AAD: itemId (replay 방지)
  authTag: 16 bytes

// 비대칭 (공유)
KEM: ECDH P-256 (Web Crypto API 표준)
KDF: HKDF-SHA256 (ECDH 결과 → wrapping key)

// 검색 가능 암호 (결정론적)
SearchHash: HMAC-SHA256(searchKey, normalize(url|name))
  searchKey = HKDF(vaultKey, "search-v1") -- vaultKey 파생
```

### 7.4 Implementation Security Checks

- [ ] 모든 crypto 모듈 단위 테스트 ≥ 95%
- [ ] WebCrypto Subtle API 우선, polyfill은 모바일에서만 noble-* 사용
- [ ] 의존성 audit: `pnpm audit` CI 단계 통과 (high 이상 0건)
- [ ] CSP: `default-src 'self'; script-src 'self'; object-src 'none'`
- [ ] Web Vault: ServiceWorker로 마스터 PW 입력 isolation 검토
- [ ] Mobile: `expo-secure-store` (iOS Keychain / Android Keystore) 활용
- [ ] Desktop (Tauri): `tauri::api::secret` 사용, Rust 측에서 키 0-채움
- [ ] Browser Extension: MV3 service worker, content script 격리
- [ ] 외부 보안 리뷰 (Phase 4 이후 1회 의무)

---

## 8. Test Plan (v2.3.0)

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L0: Crypto Unit | core-crypto 함수별 — KAT (Known Answer Test) | Vitest | Do |
| L1: vault-sdk Unit | Repository mock으로 격리 | Vitest | Do |
| L2: API Tests | Supabase 엔드포인트 + RLS | Playwright request | Do |
| L3: UI Action Tests | 웹/확장 페이지 액션 | Playwright | Do |
| L4: E2E Scenario | 다중 디바이스 sync 시나리오 | Playwright + Detox(mobile) | Do |
| L5: Security/Pentest | OWASP 시나리오, RLS 우회 시도 | 수동 + ZAP | Pre-launch |

### 8.2 L1: API Test Scenarios

| # | Endpoint | Method | Test Description | Expected Status | Expected Response |
|---|----------|--------|-----------------|:--------------:|-------------------|
| 1 | `/auth/v1/signup` | POST | 회원가입 (email + authHash) | 200 | `.session.access_token` 존재 |
| 2 | `/auth/v1/token` | POST | 잘못된 authHash 로그인 | 400 | `.error_description` 존재 (이메일/PW 구분 X) |
| 3 | `/rest/v1/encrypted_vault_items` | GET | 자기 vault 조회 | 200 | `.data` 배열, 모두 user_id 일치 |
| 4 | `/rest/v1/encrypted_vault_items` | POST | 정상 ciphertext 저장 | 201 | `.data.id` 존재 |
| 5 | `/rest/v1/encrypted_vault_items` | POST | 평문 password 필드 포함 | 400 | zod 거부 (vault-sdk 단계) |
| 6 | `/rest/v1/encrypted_vault_items?user_id=eq.{otherId}` | GET | 타인 vault 조회 시도 | 200 | 빈 배열 (RLS) |
| 7 | `/rest/v1/encrypted_vault_items` | PATCH | 타인 항목 수정 시도 | 403 | RLS denied |
| 8 | `/rest/v1/encrypted_vault_items` | POST × 60 | rate limit 초과 | 429 | retry-after |
| 9 | WS `/realtime` | SUB | vault 변경 시 INSERT 이벤트 수신 | event 도착 | `.new.id` 일치 |

### 8.3 L3: UI Action Test Scenarios

| # | Page | Action | Expected Result | Data Verification |
|---|------|--------|----------------|-------------------|
| 1 | `/login` | 정상 자격증명 입력 → Login | `/vault` 이동, 사이드바 표시 | localStorage에 vaultKey 미저장 (메모리만) |
| 2 | `/login` | 잘못된 PW 입력 | 에러 토스트 | 동일 메시지 (이메일 노출 X) |
| 3 | `/vault` | + New → Login 작성 → Save | 리스트에 새 항목 추가 | 네트워크 탭: ciphertext만 전송 |
| 4 | `/vault` | 항목 클릭 → 패스워드 복사 | 30초 후 클립보드 클리어 | clipboard API 호출 검증 |
| 5 | `/vault` | 5분 대기 (또는 모킹) | Vault 잠금 화면 | vaultKey 메모리 0 확인 |
| 6 | `/vault/audit` | 페이지 진입 | 약한/중복/유출 항목 표시 | HIBP range query만 호출 (해시 일부만) |
| 7 | Extension popup | 도메인 매칭 | 매칭 항목 추천 | content script가 폼에 채움 |

### 8.4 L4: E2E Scenario Test Scenarios

| # | Scenario | Steps | Success Criteria |
|---|----------|-------|-----------------|
| 1 | 회원가입 → vault 추가 → 다른 디바이스 sync | Web signup → 항목 추가 → Mobile 로그인 → 항목 표시 | 1초 이내 sync, 모든 디바이스에서 평문 일치 |
| 2 | 마스터 PW 변경 | Settings → 변경 → 새 PW로 로그인 | 모든 vault 항목 정상 복호화 |
| 3 | 1:1 공유 | A → 항목 공유(to: B@email) → B 로그인 → 수신함 → accept → 복호화 | B가 평문 확인, A 외 누구도 못 복호화 |
| 4 | Recovery seed로 복구 | A 가입 → seed 다운 → 로그아웃 → 다른 디바이스 → seed 입력 + 신규 PW | vault 정상 복호화 |
| 5 | DB 덤프 시뮬레이션 | Supabase SQL 직접 조회 | 어떤 평문 password도 없음 (감사) |
| 6 | 오프라인 작성 | 네트워크 차단 → 항목 추가 → 네트워크 복귀 | 큐 처리 후 정상 sync |
| 7 | Extension 자동입력 | 로그인 폼 페이지 → popup → autofill | username/password 정확히 입력됨 |

### 8.5 Seed Data Requirements

| Entity | Minimum Count | Key Fields Required |
|--------|:------------:|---------------------|
| users | 3 | (test1, test2, test3@example.com) — A/B/C |
| encrypted_vault_items | 30 (10 per user) | login/note/totp 골고루, 일부 favorite |
| shared_items | 2 | A → B (read), A → B (write) |
| groups + group_members | 1 그룹 + 3 멤버 | 가족 시나리오 |

> Do phase: `packages/vault-sdk/test/seed.ts` 작성 후 CI에서 실행.

---

## 9. Clean Architecture

### 9.1 Layer Structure (Pragmatic — core-crypto / vault-sdk만 엄격 적용)

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation** | UI 컴포넌트 + 페이지 | `apps/*/src/`, `packages/ui/src/` |
| **Application** | Use cases (UnlockVault, ShareItem 등) | `packages/vault-sdk/src/usecases/` |
| **Domain** | 엔티티, 타입, crypto 계약 | `packages/shared/src/`, `packages/vault-sdk/src/domain/` |
| **Infrastructure** | Supabase 클라이언트, secure storage | `packages/vault-sdk/src/infrastructure/`, `apps/*/src/lib/` |
| **Crypto Core** | 순수 함수 — KDF/AEAD/ECDH | `packages/core-crypto/src/` (별도 추적) |

### 9.2 Dependency Rules

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  apps/web,extension,mobile,desktop                           │
│           │                                                  │
│           ▼                                                  │
│  packages/ui ──→ packages/vault-sdk                          │
│                          │                                   │
│              ┌───────────┼────────────┐                      │
│              ▼           ▼            ▼                      │
│   packages/shared  packages/core-crypto  @supabase/sdk      │
│   (타입, zod)      (순수 함수, 무의존)    (외부 인프라)       │
│                                                              │
│  Rules:                                                       │
│  - core-crypto는 어디서도 의존 가능, 무엇에도 의존 안 함     │
│  - vault-sdk는 core-crypto, shared, supabase-js만 의존       │
│  - apps는 vault-sdk + ui + shared만 의존 (Supabase 직접 X)   │
│  - shared는 zod만 의존                                       │
└──────────────────────────────────────────────────────────────┘
```

### 9.3 File Import Rules

| From | Can Import | Cannot Import |
|------|-----------|---------------|
| `apps/*` | `@123pass/ui`, `@123pass/vault-sdk`, `@123pass/shared` | `@supabase/*` directly, `@123pass/core-crypto` direct (vault-sdk 통해) |
| `packages/ui` | `@123pass/shared`, react/RN | vault-sdk, supabase |
| `packages/vault-sdk` | `@123pass/core-crypto`, `@123pass/shared`, `@supabase/supabase-js` | UI 패키지, apps |
| `packages/core-crypto` | `@noble/*` only | 그 외 모든 것 |
| `packages/shared` | `zod` only | 그 외 모든 것 |

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| `<VaultDashboard>` | Presentation | `apps/web/src/app/vault/page.tsx` |
| `<VaultItemList>` | Presentation (shared) | `packages/ui/src/list/VaultItemList.tsx` |
| `unlockVault()` use case | Application | `packages/vault-sdk/src/usecases/unlockVault.ts` |
| `ShareItemUseCase` | Application | `packages/vault-sdk/src/usecases/shareItem.ts` |
| `VaultItem` 타입 + zod | Domain (shared) | `packages/shared/src/types/vault.ts` |
| `VaultRepository` 인터페이스 | Domain | `packages/vault-sdk/src/domain/repository.ts` |
| `SupabaseVaultRepository` | Infrastructure | `packages/vault-sdk/src/infrastructure/supabase-vault-repo.ts` |
| `deriveKeys()` | Crypto Core | `packages/core-crypto/src/kdf.ts` |
| `encryptItem()` | Crypto Core | `packages/core-crypto/src/aead.ts` |

---

## 10. Coding Convention Reference

### 10.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| Components | PascalCase | `VaultItemList`, `LockScreen` |
| Functions | camelCase | `deriveKeys()`, `encryptItem()` |
| Constants | UPPER_SNAKE_CASE | `ARGON2_MEMORY_COST`, `AUTO_LOCK_MS` |
| Types/Interfaces | PascalCase | `VaultItem`, `KdfParams` |
| Files (component) | PascalCase.tsx | `VaultItemList.tsx` |
| Files (utility) | kebab-case.ts | `derive-keys.ts`, `auto-lock.ts` |
| Folders | kebab-case | `vault-sdk/`, `core-crypto/` |
| Packages | `@123pass/{name}` | `@123pass/core-crypto` |

### 10.2 Import Order

```typescript
// 1. External libraries
import { useState } from 'react'
import { z } from 'zod'

// 2. @123pass workspace packages
import { deriveKeys } from '@123pass/core-crypto'
import { VaultRepository } from '@123pass/vault-sdk'
import type { VaultItem } from '@123pass/shared'

// 3. Internal (app) absolute
import { Button } from '@/components/ui'

// 4. Relative
import { useUnlockVault } from './hooks'

// 5. Types only
import type { Session } from '@supabase/supabase-js'
```

### 10.3 Environment Variables

| Prefix | Purpose | Scope | Example |
|--------|---------|-------|---------|
| `NEXT_PUBLIC_` | 클라 노출 OK | Browser | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_` (server) | 서버 전용 | Server | `SUPABASE_SERVICE_ROLE_KEY` (절대 클라 X) |
| `EXPO_PUBLIC_` | Expo 클라 노출 | Mobile | `EXPO_PUBLIC_SUPABASE_URL` |
| `TAURI_` (build) | 빌드 시 주입 | Build | `TAURI_PRIVATE_KEY` (서명) |

### 10.4 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| Component naming | PascalCase, 1 컴포넌트 / 파일 |
| File organization | feature 폴더 내부에 components/hooks/lib 평탄 구조 |
| State management | Zustand store는 `packages/ui/src/stores/`, 페이지 로컬은 `useState`/`useReducer` |
| Error handling | Result<T, AppError> 패턴 (vault-sdk 외부 노출용) |
| Async | always async/await, no `.then()` chain |
| Date | 모든 timestamp는 ISO8601 string으로 직렬화 |
| Crypto | core-crypto만 사용, 다른 곳에서 crypto 모듈 import 금지 (ESLint rule) |

---

## 11. Implementation Guide

### 11.1 File Structure (Monorepo)

```
123pass-app/
├── apps/
│   ├── web/                               # Next.js (App Router)
│   │   ├── src/app/
│   │   │   ├── (auth)/{login,signup}/page.tsx
│   │   │   ├── (vault)/vault/page.tsx
│   │   │   ├── (vault)/vault/audit/page.tsx
│   │   │   ├── (vault)/settings/page.tsx
│   │   │   └── api/ (only if needed for HIBP proxy)
│   │   ├── src/components/             # web-only components
│   │   ├── src/lib/supabase-client.ts
│   │   ├── next.config.js
│   │   └── tailwind.config.ts
│   ├── extension/                          # Chrome MV3
│   │   ├── src/
│   │   │   ├── popup/index.tsx
│   │   │   ├── content/autofill.ts
│   │   │   └── background/index.ts
│   │   ├── manifest.json
│   │   └── vite.config.ts
│   ├── mobile/                             # React Native + Expo
│   │   ├── app/                            # expo-router
│   │   │   ├── (auth)/login.tsx
│   │   │   ├── (vault)/index.tsx
│   │   │   └── (vault)/[id].tsx
│   │   ├── lib/secure-store.ts             # expo-secure-store wrapper
│   │   └── app.json
│   └── desktop/                            # Tauri
│       ├── src/                            # React (Vite)
│       └── src-tauri/                      # Rust
├── packages/
│   ├── core-crypto/
│   │   ├── src/
│   │   │   ├── kdf.ts                      # Argon2id deriveKeys
│   │   │   ├── aead.ts                     # AES-GCM encrypt/decrypt
│   │   │   ├── ecdh.ts                     # ECDH P-256 + HKDF
│   │   │   ├── search-hash.ts              # HMAC-SHA256 searchable
│   │   │   ├── recovery.ts                 # BIP39 seed phrase
│   │   │   ├── random.ts                   # CSRNG wrappers
│   │   │   └── index.ts
│   │   ├── test/                           # KAT 벡터 + 단위 테스트
│   │   └── package.json
│   ├── vault-sdk/
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── repository.ts           # VaultRepository 인터페이스
│   │   │   │   └── errors.ts
│   │   │   ├── usecases/
│   │   │   │   ├── unlock-vault.ts
│   │   │   │   ├── create-item.ts
│   │   │   │   ├── update-item.ts
│   │   │   │   ├── delete-item.ts
│   │   │   │   ├── share-item.ts
│   │   │   │   ├── rotate-master-password.ts
│   │   │   │   └── sync.ts                 # Realtime 구독
│   │   │   ├── infrastructure/
│   │   │   │   └── supabase-vault-repo.ts
│   │   │   └── index.ts                    # createVaultClient()
│   │   └── test/
│   ├── ui/                                  # 공유 React 컴포넌트
│   │   ├── src/
│   │   │   ├── lock/LockScreen.tsx
│   │   │   ├── list/VaultItemList.tsx
│   │   │   ├── detail/VaultItemDetail.tsx
│   │   │   ├── generator/PasswordGenerator.tsx
│   │   │   ├── totp/TotpDisplay.tsx
│   │   │   └── stores/vault-store.ts       # Zustand
│   │   └── package.json
│   └── shared/
│       ├── src/
│       │   ├── types/{vault,user,share,audit}.ts
│       │   ├── schemas/{vault-item,user}.zod.ts
│       │   └── constants.ts                # ARGON2_MEMORY_COST 등
│       └── package.json
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                   # § 3.3 스키마
│   │   └── 0002_rls_policies.sql
│   └── seed.sql
├── docs/                                    # PDCA
├── tests/
│   └── e2e/                                 # Playwright + Detox
├── .github/workflows/
│   ├── ci.yml                               # lint, type, test
│   ├── deploy-web.yml                       # Vercel
│   ├── build-mobile.yml                     # EAS
│   ├── build-extension.yml
│   └── build-desktop.yml                    # Tauri Action
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json
```

### 11.2 Implementation Order

1. [ ] **Module 1**: Monorepo + 빌드 인프라 (Turborepo, ESLint, Vitest, Playwright)
2. [ ] **Module 2**: `@123pass/shared` (타입 + zod 스키마) + `@123pass/core-crypto` (순수 함수 + KAT)
3. [ ] **Module 3**: Supabase 프로젝트 + 마이그레이션 + RLS + Realtime
4. [ ] **Module 4**: `@123pass/vault-sdk` (Repository + UseCases + Sync) — Repository mock으로 단위 테스트
5. [ ] **Module 5**: `@123pass/ui` (공유 컴포넌트, Zustand store)
6. [ ] **Module 6**: `apps/web` (Next.js, auth + vault + audit + settings)
7. [ ] **Module 7**: `apps/extension` (MV3, popup + autofill content script)
8. [ ] **Module 8**: `apps/mobile` (Expo, 생체인증 + vault)
9. [ ] **Module 9**: `apps/desktop` (Tauri, tray + 단축키)
10. [ ] **Module 10**: 공유 (1:1) + 그룹(가족/팀) 기능 across all clients
11. [ ] **Module 11**: 보안 감사 (zxcvbn + HIBP) + 외부 보안 리뷰

### 11.3 Session Guide

> 다중 세션 점진 구현 권장. `/pdca do 123Pass-app --scope module-N`으로 모듈별 실행.

#### Module Map

| Module | Scope Key | Description | Estimated Turns |
|--------|-----------|-------------|:---------------:|
| 인프라 구축 | `module-1` | Monorepo (Turborepo+pnpm), TS config, lint, test 셋업 | 20-25 |
| 코어 타입+크립토 | `module-2` | `shared` 타입/zod, `core-crypto` KDF/AEAD/ECDH + KAT | 35-45 |
| Supabase 백엔드 | `module-3` | 프로젝트 생성, 마이그레이션, RLS, Realtime, seed | 20-25 |
| vault-sdk | `module-4` | Repository + UseCases (unlock/CRUD/share/sync) + 단위 테스트 | 40-50 |
| ui 패키지 | `module-5` | 공유 컴포넌트 (LockScreen, List, Detail, Generator, TOTP, Audit) | 35-45 |
| 웹 앱 | `module-6` | Next.js auth + vault + audit + settings + Playwright E2E | 45-55 |
| 확장 | `module-7` | MV3 popup + autofill content script + 빌드 파이프라인 | 30-40 |
| 모바일 앱 | `module-8` | Expo router + 생체인증 + secure-store + Detox E2E | 50-60 |
| 데스크톱 앱 | `module-9` | Tauri shell + tray + 글로벌 단축키 + 자동 업데이트 | 35-45 |
| 공유/그룹 | `module-10` | 1:1 공유 + 가족/팀 그룹 across 4 클라이언트 | 40-50 |
| 감사+런칭 준비 | `module-11` | zxcvbn, HIBP, 외부 보안 리뷰 대응, 문서, 배포 | 30-40 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| Session 1 | Plan + Design (완료) | 전체 | 30-35 |
| Session 2 | Do | `--scope module-1,module-2` | 50-60 |
| Session 3 | Do | `--scope module-3,module-4` | 55-70 |
| Session 4 | Do | `--scope module-5,module-6` | 70-90 |
| Session 5 | Check + Iterate (web MVP) | 웹 한정 분석/개선 | 40-50 |
| Session 6 | Do | `--scope module-7` (Extension) | 30-40 |
| Session 7 | Do | `--scope module-8` (Mobile) | 50-60 |
| Session 8 | Do | `--scope module-9` (Desktop) | 35-45 |
| Session 9 | Do | `--scope module-10,module-11` | 60-80 |
| Session 10 | Check + QA + Report (전체) | E2E + 외부 리뷰 + 출시 | 60-90 |

> **권장**: 보안 핵심(module-2) 완료 후 외부 보안 전문가 1차 리뷰 추천. module-3 진입 전 BaaS 영지식 PoC 검증.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-26 | Initial draft — Option C (Pragmatic Balance) 아키텍처 채택 | bandnara123@gmail.com |
