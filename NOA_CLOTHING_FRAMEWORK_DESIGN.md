# NOA Clothing Framework — VS Code Extension 설계서

## Context

기존 NOA 엔진 생태계(15개+ Python 파일)와 eh-universe-web 설계서를 통합하여,
**VS Code Extension**으로 "AI한테 입히는 옷" 프레임워크를 구현한다.

### 핵심 비유
- **몸** = AI 모델 (Copilot, Claude, GPT 등)
- **옷** = `.noa` 정의 파일 (정체성, 정책, 톤, 행동 규칙)
- **악세사리** = 스킬, MCP, 도구 연동

### 기존 자산
- **HFCP v2.7**: 대화 에너지/점수 시스템 → 옷의 골격
- **HCRF v1.2**: 책임 게이트 → 안전핀
- **EH v15.85~15.9**: 할루시네이션 탐지 → 원단 검수
- **OCFP v1.0~2.0**: 조직 필터링 → 유니폼 규정
- **TLMH v1.0~2.0**: 연구 파트너 모드 → 특수 작업복
- **Sovereign v27 / Aegis v28**: OS + 감사 로그 → 옷걸이/옷장
- **eh-universe-web 설계서**: 컴파일러 아키텍처 (Source → IR → Artifact)

---

## 1. Extension 구조

```
noa-vscode/
├── package.json                    # Extension manifest
├── src/
│   ├── extension.ts                # Entry point (activate/deactivate)
│   │
│   ├── noa/                        # 핵심 컴파일러 (eh-universe-web 설계 기반)
│   │   ├── schema/
│   │   │   ├── noa-schema.ts       # .noa YAML Pydantic → Zod 스키마
│   │   │   ├── migrations.ts       # 스키마 버전 마이그레이션
│   │   │   └── errors.ts           # 커스텀 에러 타입
│   │   │
│   │   ├── compiler/
│   │   │   ├── parse.ts            # YAML → NoaSourceFile
│   │   │   ├── normalize.ts        # Source → Normalized IR
│   │   │   ├── merge.ts            # 다중 레이어 병합 (필드별 전략)
│   │   │   ├── resolve.ts          # IR → ResolvedNoaProfile
│   │   │   ├── validate.ts         # 4단계 검증 (syntax/semantic/target/safety)
│   │   │   ├── explain.ts          # Provenance 추적 그래프
│   │   │   └── export.ts           # ResolvedProfile → Artifact
│   │   │
│   │   ├── adapters/
│   │   │   ├── claude.ts           # Claude system prompt 변환
│   │   │   ├── gpt.ts              # OpenAI system message 변환
│   │   │   ├── local.ts            # Ollama/LM Studio config 변환
│   │   │   └── copilot.ts          # GitHub Copilot Chat 연동
│   │   │
│   │   ├── runtime/
│   │   │   ├── session.ts          # 세션 상태 관리 (wear/strip/swap)
│   │   │   ├── registry.ts         # 프리셋 + 사용자 정의 레지스트리
│   │   │   └── accessories.ts      # MCP/스킬 마운트
│   │   │
│   │   └── engines/                # Python 엔진 로직 이식
│   │       ├── hfcp.ts             # HFCP v2.7 점수 시스템
│   │       ├── hcrf.ts             # HCRF v1.2 책임 게이트
│   │       ├── eh-detector.ts      # EH v15.9 할루시네이션 탐지
│   │       ├── ocfp.ts             # OCFP v2.0 조직 필터
│   │       ├── tlmh.ts             # TLMH v2.0 연구 모드
│   │       ├── sovereign.ts        # Sovereign v27 정책 엔진
│   │       └── ledger.ts           # Aegis v28 감사 로그
│   │
│   ├── providers/                  # VS Code UI 제공자
│   │   ├── wardrobe-view.ts        # 사이드바: 옷장 TreeView
│   │   ├── layer-view.ts           # 사이드바: 레이어 스택
│   │   ├── explain-view.ts         # 패널: Provenance 시각화
│   │   ├── preview-panel.ts        # 웹뷰: 컴파일 결과 프리뷰
│   │   ├── noa-language.ts         # .noa 언어 서버 (자동완성, 검증)
│   │   └── chat-participant.ts     # Copilot Chat 참가자
│   │
│   └── commands/
│       ├── wear.ts                 # 명령: NOA: Wear Persona
│       ├── strip.ts                # 명령: NOA: Strip Persona
│       ├── swap.ts                 # 명령: NOA: Swap Persona
│       ├── compile.ts              # 명령: NOA: Compile & Preview
│       ├── export.ts               # 명령: NOA: Export Artifact
│       └── explain.ts              # 명령: NOA: Explain Rules
│
├── presets/                        # 내장 프리셋 .noa 파일
│   ├── base/
│   │   └── secure.noa              # 기본 안전 레이어 (항상 적용)
│   ├── wardrobe/
│   │   ├── medical.noa
│   │   ├── legal.noa
│   │   ├── creative.noa
│   │   ├── education.noa
│   │   ├── research.noa            # TLMH 기반
│   │   └── enterprise.noa          # OCFP 기반
│   └── user/
│       └── default.noa             # 사용자 기본 선호
│
├── syntaxes/
│   └── noa.tmLanguage.json         # .noa 구문 하이라이팅
│
├── schemas/
│   └── noa-schema.json             # JSON Schema for YAML validation
│
├── media/                          # 아이콘, 웹뷰 리소스
├── tests/
└── tsconfig.json
```

---

## 2. `.noa` 파일 스펙 (eh-universe-web 설계서 기반)

```yaml
schemaVersion: "1.0"
id: "medical"
kind: "domain"                     # base | domain | user | session

extends:
  - "base/secure"                  # 상위 레이어 참조

meta:
  name: "Medical Assistant"
  description: "의료 상담용 페르소나와 안전 정책"
  tags: ["medical", "safety"]

priority: 200                      # base: 0-99, domain: 100-299, user: 300-599, session: 600+

persona:
  role: "근거 기반 의료 보조자"
  tone: "차분하고 명확함"
  audience: "일반 사용자"

intent:
  tasks:
    - "증상 관련 정보 정리"
    - "위험 신호 분류"

policies:
  safety:
    escalation:
      requiredOn:
        - "응급 증상"
        - "약물 상호작용 의심"
    deny:                          # monotonic union — 하위 레이어에서 제거 불가
      - "확정 진단 단정"
      - "처방 대체 행위"
    locks:                         # 잠긴 필드는 하위 override 차단
      - "policies.safety.deny"
  uncertainty:
    style: "explicit"              # explicit | minimal | strict
  citations:
    required: true

# 엔진 설정 (기존 Python 엔진 파라미터)
engines:
  hfcp:
    enabled: true
    mode: "CHAT"                   # CHAT | CREATIVE
    score_cap: 150
  eh:
    enabled: true
    domain_weight: 1.4             # 의료 가중치
    source_credibility: true
  hcrf:
    enabled: true
    authority_transfer_block: true
  ocfp:
    enabled: false                 # 기업용이 아니면 비활성
  tlmh:
    enabled: false

output:
  format: "markdown"
  sections:
    - "요약"
    - "가능성"
    - "권장 행동"

compatibility:
  targets: ["gpt", "claude", "local", "copilot"]

accessories:
  suggested:
    - "pubmed"
```

---

## 3. 레이어 병합 규칙 (eh-universe-web 설계서 준용)

| 필드 | 전략 | 비고 |
|------|------|------|
| `meta` | override | 표시 정보 |
| `persona.role` | override | locked면 불가 |
| `persona.tone` | override | |
| `intent.tasks` | dedupe append | 순서 유지 |
| `policies.safety.deny` | **monotonic union** | 하위에서 제거 불가 |
| `policies.safety.allow` | union | deny와 충돌 시 deny 우선 |
| `policies.safety.locks` | **monotonic union** | 잠긴 필드 하위 override 차단 |
| `policies.citations.required` | boolean max | true가 더 강함 |
| `engines.*` | deep merge | 개별 엔진 파라미터 |
| `output.sections` | replace (기본) | |
| `accessories.suggested` | dedupe append | |

---

## 4. 컴파일 파이프라인 (데이터 흐름)

```
.noa Source(s)
    │
    ▼
[parse.ts] YAML → NoaSourceFile[]
    │
    ▼
[normalize.ts] → Normalized IR (extends 해소, 기본값 채움)
    │
    ▼
[merge.ts] → 다중 레이어 병합 (필드별 전략 적용)
    │
    ▼
[resolve.ts] → ResolvedNoaProfile (provenance 포함)
    │
    ▼
[validate.ts] → 4단계 검증 (error/warning/info)
    │
    ├──▶ [explain.ts] → Provenance Graph (UI용)
    │
    ▼
[adapters/*.ts] → 모델별 Artifact
    │
    ├── claude.ts → ClaudeArtifact { systemPrompt, toolHints }
    ├── gpt.ts    → GptArtifact { systemMessage, toolHints }
    ├── local.ts  → LocalArtifact { config.json, prompt.txt }
    └── copilot.ts → CopilotArtifact { instructions, context }
```

---

## 5. VS Code 통합 포인트

### 5.1 사이드바: NOA Wardrobe
- TreeView로 프리셋/사용자 정의 .noa 파일 탐색
- 드래그앤드롭으로 레이어 순서 변경
- 현재 활성 레이어 스택 표시
- 아이콘으로 kind 구분 (base=🔒, domain=📋, user=👤, session=⚡)

### 5.2 에디터: .noa Language Support
- YAML 구문 하이라이팅 + NOA 전용 키워드 색상
- Zod 스키마 기반 실시간 검증 (빨간 밑줄)
- 자동완성: `policies.safety.deny` 치면 후보 제안
- hover 시 필드 설명 툴팁
- CodeLens: 파일 상단에 "Compile | Preview | Explain" 링크

### 5.3 패널: Explain View (Webview)
- "이 규칙이 왜 적용됐는지" 시각화
- 각 필드별 provenance: 어느 레이어에서 왔는지
- 충돌 해소 과정 타임라인

### 5.4 Copilot Chat 참가자
```
@noa wear medical
@noa explain policies.safety.deny
@noa swap creative
@noa status
```
- Chat Participant API로 등록
- 현재 세션에 입힌 옷이 Copilot 응답에 반영

### 5.5 명령 팔레트
- `NOA: Wear Persona` → QuickPick으로 프리셋 선택
- `NOA: Strip Persona` → 현재 스택에서 제거
- `NOA: Swap Persona` → 원자적 교체
- `NOA: Compile & Preview` → 컴파일 결과 웹뷰 표시
- `NOA: Export for Claude/GPT/Local` → 클립보드 복사 or 파일 저장
- `NOA: Explain` → Explain View 열기

### 5.6 상태바
```
[👔 medical + secure] [HFCP: 72] [EH: TRUST]
```
- 현재 입은 옷 이름
- HFCP 점수 (실시간)
- EH 상태 (TRUST/CAUTION/DANGER)

---

## 6. Python 엔진 → TypeScript 이식: 구체적 재사용 매핑

### 6.1 HFCP v2.7 → `engines/hfcp.ts`
**원본:** `모델별정리/15/HFCP/HFCP Engine v2.7 — FULL CODE.py`

**그대로 이식하는 것:**
```
점수 공식 (핵심):
  S_{t+1} = clip( (S_t + Δ*M + D + Σ) * L * H, 50, 150 )

  Δ (Base Delta):
    +3.0 if has_question
    +humor_level * 2.0
    +connective_density * 4.0
    +3.0 if objection_marker
    +1.5 if length > 300, -2.0 if length < 50
    clamp to [-10, +10]

  M (Momentum): k연속 같은 방향 → 1.0/1.2/1.5/2.0
  D (Depth): objection+question → 10.0, density>0.6 → 5.0
  Σ (Spike): |변화| ≥ 15 → ±12.0 보정
  L (Load Leveling): score≤70 → 0.7, ≥130 → 0.5, else 1.0
  H (Hysteresis): delta<0 → 0.5 (급락 방지)
```

**이식 대상 클래스/함수:**
- `TurnSignal` → interface (length, has_question, humor_level, connective_density, objection_marker)
- `HFCPState` → interface (score=60, momentum_k=1, last_delta=0, turns=0, mode=CHAT)
- `Verdict` → enum (ENGAGEMENT, NORMAL_FREE, NORMAL_ANALYSIS, LIMITED, SILENT, STOP_CREATIVE)
- `compute_delta()`, `update_momentum()`, `depth_trigger()`, `detect_spike()`
- `load_leveling()`, `hysteresis()`, `update_score()` ← **핵심 함수 7개 전부 이식**
- `NRGMemory` (반복 방지) → signature 기반 mutation 로직
- `RCLLevel` (반박 제어) → R0~R5 단계 제한
- `MemoryEcologyState` → MII/MDS 지표, 180일 주기, freshness decay

**상수:**
```
S_MIN=50, S_MAX=150, CREATIVE_SPIKE_CAP=140
SPIKE_THRESHOLD=15, AUTO_TUNE_EPSILON=0.03
EPOCH_DAYS=4, SOFT_SILENCE_DENSITY=0.65, DEEP_SILENCE_DENSITY=0.80
```

---

### 6.2 HCRF v1.2 → `engines/hcrf.ts`
**원본:** `모델별정리/15/HFCP/HCRF v1.2 .py`

**이식 대상:**
- `ResponsibilityLevel` enum → HUMAN_OWNED / HUMAN_ACK_REQUIRED / HUMAN_CONFIRM_REQUIRED / BLOCKED
- `HCRFMode` enum → MONITOR / REVIEW / SEALED
- `OutputVerdict` enum → NO_OUTPUT / QUESTIONS_ONLY / CONTEXT_ALERT / SEALED
- `ContextSignal` interface → ambiguity_level, implication_risk, authority_transfer_attempt, org_impact
- `PressureWindow` → 5턴 롤링 윈도우, deque → circular buffer
- `interpret_responsibility()` → score + context → responsibility level 매핑
- `resolve_output_verdict()` → responsibility → 출력 형태 결정

**핵심 로직:**
```
Part 0: Identity (불변 원칙 - 로직 없음)
Part 1: Context Signal 측정 (ambiguity, implication, authority transfer)
Part 2: Pressure 누적 (5턴 윈도우)
Part 3: Mode 상태 머신 + Hysteresis (2턴 안정화)
Part 4: Output 거버넌스 (verdict 선택)
Part 5: Audit + 오케스트레이션
```

**상수:** `SCORE_MIN=50, SCORE_MAX=150, QUESTION_ONLY_THRESHOLD=120, SEAL_THRESHOLD=140`

---

### 6.3 EH v15.9 → `engines/eh-detector.ts`
**원본:** `모델별정리/15/NOA 비서 코어 (Secretary Core)_v15.9 내손안의비서 회사용 풀기능.py`

**이식 대상:**
- `Domain` enum → GENERAL(1.0) / MEDICAL(1.4) / LEGAL(1.3) / FINANCE(1.35) / ACADEMIC(1.2)
- `ConfidenceLevel` enum → TRUST(<30) / CAUTION(30~60) / DANGER(>60)
- `DetectionModules`:
  - `blur()` → 키워드 매칭 (갑자기, 기적, 운명 등) → +4.0/hit
  - `success_no_cost()` → 비용없는 성공 패턴 → +10.0
  - `hallucination()` → 절대 표현 (100%, 완벽, 원금보장) → +12~18
  - `source_credibility()` → HIGH(FDA,WHO,대법원)/NEUTRAL/LOW(블로그,SNS)

**리스크 공식:**
```
raw_risk = blur + success_no_cost + hallucination
weighted_risk = raw_risk × DOMAIN_WEIGHT[domain]
source_adjust = (100 - credibility_score) × 0.1
final_risk = min(weighted_risk + source_adjust, 100)
eh_score = max(10, 100 - final_risk)
```

**감사 로그:** timestamp, text, domain, flags, processing_ms → v28 AegisLedger와 통합

---

### 6.4 OCFP v2.0 → `engines/ocfp.ts`
**원본:** `모델별정리/15/HFCP/OCFP Engine v2.0 — FULL CODE.py`

**이식 대상 (5파트 전부):**
- Part 1 `CorporateInteractionKernel` → 승인 게이트 (NORMAL/LIMITED/SILENT/SEALED)
  - 3연속 리스크 → SEALED (30분), `RISK_LIMIT=3`, `SEAL_DURATION=30min`
- Part 2 `CorporatePolicyEngine` → 리스크 분류 (LOW/MEDIUM/HIGH/CRITICAL)
  - 민감도 탐지: HR/법률/외부해석/함축 리스크
- Part 3 `CorporateAuditLedger` → SHA256 해시 체이닝 (v28 AegisLedger와 동일 패턴 → **통합**)
- Part 4 `OrgPersonaManager` → 조직 역할 (COMPANY/LEGAL/HR/SECURITY/SUPPORT/INTERNAL)
  - `PersonaMode` → PUBLIC/INTERNAL/CONFIDENTIAL
- Part 5 `AdminOverrideManager` → 관리자 액션 (OVERRIDE_APPROVE, FORCE_SEAL 등)
  - `ExternalIntegration` hooks (Slack, Email, SIEM) → accessory로 재활용

---

### 6.5 TLMH v2.0 → `engines/tlmh.ts`
**원본:** `모델별정리/15/HFCP/TLMH 2.0.py`

**이식 대상:**
- `InvocationState` → IDLE / INVITED / SEALED (초대 기반 진입)
- `evaluate_invocation()` → 명시적 초대만 허용, 암묵적은 question+role_request 필요
- `evaluate_question_quality()` → 5종 금지 질문 필터:
  - LEADING (답을 암시), PRESSURING (결론 강요), DEFENSIVE (변호 유도)
  - META_LOOP (질문에 대한 질문), REDUNDANT (기정사실 반복)
- `contains_prohibited_pattern()` → 40+ 금지 표현 목록
- `resolve_silence_profile()` → 침묵 = 인지적 공간 (거부가 아님)
- Safe question templates: "이 아이디어에서 가장 덜 탐구된 부분은?"

**핵심 원칙:** AI는 판단하지 않음, 결론 내리지 않음, 관점만 빌려줌, 모든 아이디어 소유권은 연구자

---

### 6.6 Sovereign v27 → `engines/sovereign.ts`
**원본:** `모델별정리/16/.../os/Sovereign OS v27.py`

**이식 대상:**
- `PolicyGlyph` → 정책 규칙 (ratio_cap, signal_limit, shift_allowance, drop_threshold)
- `SealHash` → SHA256 서명/검증 ("SEAL27" + payload)
- `VectorShift` → 엔트로피 + 비율 드리프트 감지 (base_entropy=0.33, base_ratio=2.0)
- `ChamberRoute` → 샌드박스 격리 (MD5 토큰 발행)
- `Verdict` enum → PASS / DROP / CHAMBER / ERROR
- `Mode` enum → PRIME / SCAN / SAFE / OMEGA
- 3단계 파이프라인: `analyze()` → `decide()` → `run()`

---

### 6.7 Aegis v28 → `engines/ledger.ts`
**원본:** `모델별정리/16/.../os/noa_os_v28_core.py`

**이식 대상:**
- `AegisLedger` → 해시 체인 감사 로그 (OCFP Part 3와 통합)
  - `record(event_type, payload) → event_hash`
  - H(prev_hash | timestamp | event_type | payload_json) = SHA256
  - Genesis hash: SHA256("NOA_GENESIS")
- `ContextState` (frozen) → 불변 세션 스냅샷 + state_hash
- `MessageFrame` (frozen) → 메시지 단위 + fingerprint
- `ContextManager.append_message()` → Copy-on-Write 패턴 (dataclass.replace → spread operator)
- `NOAKernel.process_input()` → atomic transaction 패턴 (read → validate → transition → commit → audit)

**통합 포인트:** OCFP AuditLedger + v28 AegisLedger → 단일 `engines/ledger.ts`로 통합

---

### 6.8 엔진 현황 (구현 완료)

| 엔진 | 버전 | 역할 | 감사 | 상태 |
|------|------|------|------|------|
| HFCP | v2.7 | 대화 에너지/점수 + NrgMemory + RclLevel + MemoryEcology | × | ✅ 세션 연동 |
| EH | v16.4-R | 6도메인 할루시네이션 탐지 (원본 v15.9에서 업그레이드) | ○ | ✅ |
| HCRF | v1.2 | 5파트 책임 게이트 | ○ | ✅ |
| OCFP | v2.0 | 5파트 조직 필터 (riskLimit/sealDuration config 실적용) | ○ | ✅ |
| TLMH | v2.0 | 초대 기반 연구 모드 | × | ✅ |
| **NSG** | **v1.0** | **5파트 보안 커널 (DAK+SPE+ASG+IARL+BSSO)** — Sovereign v27 대체 | ○ | ✅ |
| Ledger | v28 | 해시체인 감사 로그 + ContextState CoW | ○ | ✅ |
| **NIB** | **v1.0** | **시간축 패턴 분석 (Invariant Bridge)** — 신규 | ○ | ✅ |
| **Band Opt** | **v1.0** | **0.48~0.52 한계 밴드 엔진 파라미터 최적화 (11개 파라미터)** | × | ✅ |

### 6.9 Verification-First Studio (신규)

검증을 "생성 다음의 필수 단계 + 자동 수정 중심축 + 사람 승인 전 게이트"로 전환:

| 컴포넌트 | 역할 |
|---------|------|
| `verify()` | 통합 검증 (컴파일러 + 9엔진 집계, 75점 게이트) |
| `autoFix()` | 자동 수정 (필드 경로 기반 FixSuggestion 적용) |
| `ChangeManager` | 5중 잠금 상태 머신 (DRAFT→VERIFIED→APPROVED→APPLIED→ROLLED_BACK) |
| `verificationLoop()` | 재검증 루프 (RecomputeCallback → recompile roundtrip, 3회 제한) |
| `enforce()` | EnforcementGate (ALLOW→FORCE_UNCERTAINTY→DOWNGRADE→BLOCK→SEAL) |

**5중 잠금:**
1. 상태 잠금: snapshot draft 시점 1회 고정
2. 전이 잠금: 허용된 전이만 가능
3. 검증 잠금: passed + score>=75 + blockers===0 필수
4. 적용 잠금: snapshot + approvedBy 존재 필수
5. 복구 잠금: APPLIED + snapshotJson 존재 필수

---

## 7. 구현 현황 (Phase 1~6 + 고도화 완료)

| Phase | 범위 | 상태 |
|-------|------|------|
| 1 | Extension 스캐폴딩 + 스키마 | ✅ |
| 2 | 컴파일러 7단계 + 어댑터 4종 | ✅ |
| 3 | VS Code UI 6종 + 프리셋 10개 | ✅ |
| 4 | 엔진 이식 1차 (HFCP/EH/HCRF) | ✅ |
| 5 | 런타임 + Chat (12개 @noa 명령) | ✅ |
| 6 | 나머지 엔진 (OCFP/TLMH/NSG/NIB) + 배포 준비 | ✅ |
| 고도화 | Band Optimizer 11파라미터 + 시나리오 48개 + Verification Studio | ✅ |
| CI | GitHub Actions (typecheck→lint→test→build→smoke) | ✅ |

**프로젝트 규모:** 39 소스 파일, 9,041줄, 테스트 8파일, 프리셋 10개

---

## 8. @noa 명령어 (12개)

| 명령 | 설명 |
|------|------|
| `wear <name>` | 페르소나 입기 (검증 게이트 + 자동 롤백) |
| `strip <name>` | 페르소나 벗기 |
| `swap <old> <new>` | 원자적 교체 |
| `explain [field]` | 규칙 적용 이유 (Provenance) |
| `process <text>` | 9엔진 분석 (엔진별 테이블 + Enforcement) |
| `status` | 현재 상태 |
| `list` | 활성 레이어 목록 |
| `validate` | 프로필 검증 |
| `verify` | 검증 루프 (자동 수정 + 재검증 + 에스컬레이션) |
| `rollback` | 마지막 변경 실제 복원 |
| `export [target]` | Claude/GPT/Local 내보내기 |
| `ledger [n]` | 최근 감사 로그 |

---

## 9. 감사 로그 추적 범위

모든 성공/실패 경로에서 Ledger 기록 보장:

| 이벤트 | 기록 시점 |
|--------|----------|
| SESSION_START | 세션 생성 |
| WEAR / WEAR_ROLLED_BACK | wear 성공/검증 실패 롤백 |
| STRIP / SWAP | 벗기/교체 |
| ENGINES_INIT | 엔진 초기화 |
| HCRF_TURN / NIB_EVENT / SOVEREIGN_VERDICT | 엔진별 턴 결과 |
| ENFORCEMENT | 차단/다운그레이드 판정 (no-profile 포함) |
| AUTO_FIX | 자동 수정 적용 |
| RECOMPILE_AFTER_FIX | 수정 후 재컴파일 |
| VERIFICATION_ESCALATED | 검증 루프 에스컬레이션 |
| ROLLBACK / ROLLBACK_FAILED | 롤백 성공/실패 |
| ADMIN_OVERRIDE / OCFP_PROCESS | 관리자 액션 / 조직 필터 |
