# Supabase Setup

Design Ref: §3.3, §4 — Supabase 백엔드 셋업 가이드.

## 1. 로컬 개발 (권장: 영지식 모델 검증 환경)

### 사전 요구사항
- [Supabase CLI](https://supabase.com/docs/guides/cli) 설치 (`npm i -g supabase` 또는 `scoop install supabase`)
- Docker Desktop (Supabase 로컬 스택 구동용)

### 실행

```bash
cd C:\Users\bandn\source\123pass-app
supabase init   # 최초 1회. .supabase/ 폴더 생성됨 (gitignore에 추가 권장)
supabase start  # PostgreSQL + Auth + Realtime + Studio 컨테이너 시작
```

`supabase start`가 완료되면 출력에 표시되는 값들을 `.env.local`에 복사:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<출력의 anon key>
SUPABASE_SERVICE_ROLE_KEY=<출력의 service_role key — 서버 전용>
```

### 마이그레이션 적용

```bash
supabase db reset  # 모든 마이그레이션 0001~0008 순차 실행
```

또는 개별:
```bash
supabase migration up
```

### Studio (GUI)
http://127.0.0.1:54323

## 2. 프로덕션 (Supabase Cloud)

1. https://supabase.com/dashboard 에서 프로젝트 생성
2. Project Settings → API → URL과 anon key를 `.env.production` 또는 Vercel Secret에 설정
3. CLI 로그인 + 링크:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
4. 마이그레이션 푸시:
   ```bash
   supabase db push
   ```

## 3. 마이그레이션 파일 인덱스

| 파일 | 목적 |
|------|------|
| `0001_extensions.sql` | pgcrypto, uuid-ossp |
| `0002_users.sql` | users 테이블 + RLS + user_directory view |
| `0003_vault.sql` | folders, encrypted_vault_items + RLS + 인덱스 |
| `0004_sharing.sql` | shared_items (1:1 공유) + RLS |
| `0005_groups.sql` | groups, group_members, group_items + RLS 헬퍼 함수 |
| `0006_audit.sql` | audit_events + RLS |
| `0007_realtime.sql` | Realtime publication 등록 (vault/shared/group items) |
| `0008_rpc_rotate.sql` | rotate_master_password 원자적 RPC |

## 4. 영지식 모델 보안 체크리스트

- [ ] 모든 테이블 `enable row level security` ✅ (마이그레이션에서 강제)
- [ ] 평문 자격증명 컬럼 0개 — `ciphertext/iv/auth_tag`만 사용
- [ ] `auth.uid() = user_id` 패턴으로 타 사용자 데이터 차단
- [ ] Service role key는 절대 클라이언트에 노출 금지 (서버 환경 변수에만)
- [ ] `supabase db diff` 결과가 마이그레이션 파일과 동기화

## 5. RLS Live 검증 (module-4 진입 후 자동화 예정)

`packages/vault-sdk/test/`에서 두 명의 테스트 사용자(A, B)를 만든 뒤:
- A의 anon key로 B의 vault 항목 조회 시도 → 빈 배열 반환 검증
- A의 anon key로 B의 vault 항목 UPDATE 시도 → 0 row affected 검증
- A의 anon key로 `auth.users` 직접 조회 시도 → 403 검증
