# AI Team Process & Workflow

## 1. Team Composition

### Lead (Orchestrator & Production Gate)

**Mission:** Context management + final approval.

**Strategy:**
- PRD(Product Requirements Document)와 System Architecture 파일을 최상위에 두고, 팀원 에이전트들이 기준을 벗어나지 않는지 감시.

**Production Gate Tips:**
- Vercel 배포: `.env` 누락 + Build Error 사전 스캔.
- 보안: API Key 하드코딩 여부 `grep` 수준 자동화 검사.

### Dev Part

| Role | Scope |
|------|-------|
| **FE (Team 1)** | `src/components`, `src/hooks`, `src/styles` |
| **BE (Team 2)** | `src/app/api`, `src/lib/db`, `src/types` |
| **Shared** | `types/shared.ts` — Lead가 먼저 정의, 통신 규격 충돌 방지 |

### QA (Team 3: 75-Point Gate)

- **미구현 탐지:** `TODO` 주석, 빈 함수 탐지 -> Fail.
- **75점 기준:** Happy Path + 에러 핸들링 검증.

---

## 2. Collaboration Workflow

| Step | Owner | Activity | Output |
|------|-------|----------|--------|
| 1. Design | Lead | Architecture design + file structure assignment | `architecture.md`, `tasks.json` |
| 2. Implement | FE / BE | Code within assigned directories | Feature-level Commit / PR |
| 3. Verify | QA | Unimplemented scan + edge case testing | `QA_Report.md` (Pass/Fail) |
| 4. Gate | Lead (Gate) | Security, patent, benchmark, deploy readiness | Final Merge + Deploy |

---

## 3. NOA Project Mapping

NOA Clothing Framework 프로젝트에서의 적용:

- **Lead Gate** = `Verification-First Studio` (5중 잠금 ChangeManager + 75점 게이트)
- **QA** = `noa-3persona-review` 스킬 (Safety/Performance/Conciseness 3관점 검사)
- **미구현 탐지** = `verify()` 통합 검증 (compiler diagnostics + 9엔진 집계)
- **자동 수정** = `autoFix()` + `verificationLoop()` (recompile roundtrip, 3회 제한)
- **Production Gate** = `enforce()` EnforcementGate (ALLOW~SEAL 5단계)
- **CI Gate** = GitHub Actions (typecheck → lint → test → build → smoke)

---

## 4. Verification-First 워크플로

```
[변경 요청]
    │
    ▼
[ChangeManager.draft()] ── 스냅샷 저장
    │
    ▼
[recompile + verify()] ── 75점 게이트
    │
    ├── 통과 → [VERIFIED]
    │              │
    │              ▼
    │         [approve()] ── 사람 승인
    │              │
    │              ▼
    │         [markApplied()]
    │              │
    │              ▼
    │         [APPLIED] ◄── rollback 가능
    │
    └── 실패 → [autoFix()] ── 자동 수정
                   │
                   ▼
              [recompile → verify] ── 재검증 (최대 3회)
                   │
                   ├── 통과 → [VERIFIED] (위와 동일)
                   └── 3회 실패 → [ESCALATED] → 사람에게 넘김
```

---

## 5. 감사 추적 보장

모든 성공/실패 경로에서 Ledger 기록:
- WEAR / WEAR_ROLLED_BACK
- ENFORCEMENT (no-profile 포함)
- AUTO_FIX / RECOMPILE_AFTER_FIX
- ROLLBACK / ROLLBACK_FAILED
- VERIFICATION_ESCALATED

---

*Last updated: 2026-03-29*
