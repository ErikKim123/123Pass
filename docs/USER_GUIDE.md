# 123Pass 사용자 가이드

> **영지식(Zero-Knowledge)** 비밀번호 매니저. 서비스 제공자도 사용자의 평문 자격증명을 볼 수 없습니다.

## 1. 첫 가입

1. 웹/모바일/데스크톱 앱을 실행 → **회원가입**
2. 이메일 + **마스터 패스워드**(최소 12자) 입력
3. **24-word 복구 시드**를 받아 안전한 곳(종이/오프라인)에 보관
4. Vault로 자동 이동

## 2. 핵심 개념

| 용어 | 설명 |
|------|------|
| **마스터 패스워드** | vault 잠금을 해제하는 단 하나의 비밀번호. 분실 시 24-word 시드로만 복구 가능 |
| **Vault** | 자격증명 모음 — 모든 항목이 클라이언트에서 AES-256-GCM 암호화 |
| **자동 잠금** | 5분 비활성 시 vault 잠금 (메모리에서 키 0-채움) |
| **복구 시드** | BIP39 24-word — 마스터 패스워드 분실 시 vault 복구 (선택) |

## 3. 일상 사용

### 새 항목 추가
1. Vault → **+ New** 버튼
2. 종류(Login/Note/Card/TOTP) 선택 → 이름/URL/Username/Password 입력
3. **Generate strong password** 버튼으로 강력 패스워드 자동 생성

### 자동입력 (브라우저 확장)
1. Chrome 확장 아이콘 클릭 → vault 잠금 해제
2. 로그인 폼이 있는 페이지에서 확장 아이콘 다시 클릭
3. 매칭된 항목 클릭 → username + password 자동 채워짐

### 모바일 (생체인증)
1. 첫 가입 시 마스터 패스워드로 unlock
2. Settings → **Biometric unlock** 토글 → Face ID / 지문 등록
3. 이후 앱 실행 시 biometric으로 바로 unlock

### 데스크톱 (전역 단축키)
- `Cmd/Ctrl+Shift+Space` — 메인 윈도 검색창 포커스
- 시스템 트레이 아이콘 → Show / Quit

## 4. 공유

### 1:1 공유
1. Vault에서 항목 선택 → **Share with another user** 버튼
2. 수신자 이메일 + 권한(Read / Read & Write) 선택
3. 수신자는 **Shares** 탭에서 받은 공유 확인 → **Accept** → 본인 vault에 복사됨

### 가족/팀 그룹
1. **Groups** 탭 → **+ New group** → 그룹 이름 입력 (예: "Family")
2. 그룹 상세에서 **+ Invite** → 멤버 이메일 + 역할(Admin/Member) 지정
3. 그룹 항목을 추가하면 모든 멤버가 동일하게 복호화 가능

## 5. 보안 감사

**Vault → Audit** 메뉴에서:
- **Weak passwords**: zxcvbn 점수 ≤ 2
- **Reused passwords**: 같은 패스워드를 여러 곳에서 사용
- **Pwned passwords**: HIBP API로 유출 여부 확인 (버튼 클릭 시 실행 — 5-char 해시 prefix만 송신, 평문 절대 전송 안 함)

## 6. 마스터 패스워드 변경

**Settings → Change master password**
- 모든 vault 항목이 새 키로 재암호화됨 (RPC 트랜잭션)
- 변경 후 자동 로그아웃 → 새 PW로 다시 unlock

## 7. 복구

마스터 패스워드 분실 시:
1. 로그인 페이지 → **Forgot?** (또는 모바일 앱의 복구 흐름)
2. 24-word 시드 입력 → 신규 마스터 패스워드 설정
3. Vault 그대로 유지됨

## 8. 영지식 모델 확인

- 서버는 ciphertext(AES-256-GCM)만 저장 — `users.encrypted_private_key`, `encrypted_vault_items.ciphertext` 등
- 마스터 패스워드는 절대 서버로 전송되지 않음 (Argon2id로 클라이언트 측 키 도출)
- 공유 시 그룹 마스터 키는 각 멤버 공개키로만 wrap — 서버 admin도 unwrap 불가

자세한 보안 설계: [Design Doc](02-design/features/123Pass-app.design.md) §7 참조.

## 9. 자주 묻는 질문

**Q. 다른 디바이스에서 새 항목이 보이지 않아요.**
A. Supabase 백엔드를 연결하지 않았다면 데이터는 디바이스 로컬에만 저장됩니다 (mock 모드). 클라우드 동기화를 원하시면 README의 Supabase 셋업을 따라주세요.

**Q. 복구 시드를 잃어버렸어요.**
A. Settings에서 **재발급** 가능합니다 (마스터 PW 입력 후). 단, 마스터 PW도 모를 경우 복구 불가능합니다.

**Q. Chrome 확장이 페이지의 비밀번호 폼을 인식하지 못해요.**
A. 페이지가 비표준 폼 구조를 쓸 수 있습니다. 수동으로 항목을 클릭해 **Copy pw** 후 붙여넣으세요.

---

**라이선스**: MIT — [LICENSE](../LICENSE) 참조.
