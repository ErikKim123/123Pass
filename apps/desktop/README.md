# @123pass/desktop

Tauri 2.x 기반 데스크톱 앱. Web 기술(React + Vite)로 UI를 작성하고 Rust shell이 OS 통합(시스템 트레이, 전역 단축키, 키체인)을 담당합니다.

## 사전 요구사항

- **Node.js 20+** (workspace root와 동일)
- **pnpm 9+**
- **Rust toolchain** (`rustup` 권장):
  - macOS: `xcode-select --install`
  - Windows: Visual Studio C++ Build Tools
  - Linux: 패키지 매니저로 `libwebkit2gtk-4.1-dev` 등 설치
- 자세한 사항: https://tauri.app/start/prerequisites/

## 실행

```bash
# 의존성 설치 (workspace root에서)
pnpm install

# 개발 모드 (Rust + Vite 동시 실행)
pnpm --filter @123pass/desktop tauri:dev

# 프로덕션 빌드
pnpm --filter @123pass/desktop tauri:build
# → src-tauri/target/release/ 에 .dmg / .msi / .AppImage 생성
```

## 영지식 모델 유지

- 모든 자격증명은 `vault-sdk` 통해서만 통과 — Tauri Rust 측은 ciphertext만 봅니다
- `@tauri-apps/plugin-store`는 JSON 평문이지만, vault 항목은 이미 클라이언트에서 AES-GCM 암호화된 후 저장됨
- vaultKey는 React 측 메모리에만 존재, 5분 비활성 시 auto-lock

## 전역 단축키

`Cmd/Ctrl+Shift+Space` — 메인 윈도 검색창 포커스
