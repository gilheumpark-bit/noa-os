# NOR — Neural Outfit Runtime

> "AI에게 옷을 입히다"

---

## Brand Identity

| 항목 | 내용 |
|------|------|
| **이름** | NOR |
| **풀네임** | Neural Outfit Runtime |
| **발음** | 노르 (한) / nɔːr (영) |
| **포지션** | AI 행동 제어 프레임워크 — 세계 최초 "AI Clothing" 카테고리 |
| **태그라인** | *Dress your AI.* |
| **확장자** | `.nor` |
| **동사형** | "NOR your AI" = AI에게 페르소나/정책/톤을 입힌다 |

---

## Brand Family

```
EH Universe (플랫폼)
│
├── NOA  — Neural Operating Architecture
│         AI의 뼈대. OS/엔진/규칙 코어.
│
├── NOR  — Neural Outfit Runtime
│         AI의 옷. 페르소나/정책/레이어 프레임워크.
│
└── ANS  — Adaptive Narrative System
          AI의 펜. 창작/서사 생성 엔진.
```

---

## NOR이 여는 새 카테고리: AI Clothing

### 기존 카테고리와의 차이

| 기존 카테고리 | 하는 일 | NOR과의 차이 |
|--------------|---------|-------------|
| Prompt Engineering | 매번 수동으로 지시 | NOR은 한 번 입히면 유지 |
| Custom GPTs | 단일 모델 프리셋 | NOR은 모델 무관, 레이어링 가능 |
| Guardrails | 입출력 필터링 | NOR은 필터가 아닌 정체성 부여 |
| LangChain | 개발자용 파이프라인 | NOR은 비개발자도 옷장에서 선택 |
| System Prompt | 텍스트 블록 | NOR은 컴파일 가능한 구조화 스키마 |

### AI Clothing이란?

> AI에게 **정체성, 행동 규칙, 톤, 정책**을 구조화된 파일(.nor)로 정의하고,
> 런타임에 **입히고, 벗기고, 갈아입히고, 겹쳐 입히는** 프레임워크.

**핵심 동사 4가지:**
- **Wear** — 옷 입히기 (페르소나 활성화)
- **Swap** — 갈아입기 (런타임 전환)
- **Layer** — 겹쳐입기 (정책 중첩)
- **Strip** — 벗기기 (기본 상태로 복원)

---

## .nor 파일 예시

```yaml
# medical-doctor.nor
kind: domain
name: "의료 전문가"
version: "1.0"

extends:
  - base/professional.nor

policies:
  tone: clinical
  disclaimer: required
  evidence_level: cite_source
  prohibited_actions:
    - diagnosis_without_disclaimer
    - medication_recommendation

personality:
  verbosity: concise
  formality: high
  emoji: never

layers:
  priority: 150  # domain 범위 (100-299)
  merge_strategy:
    policies: monotonic_union  # 안전 정책은 추가만 가능
    personality: override       # 성격은 덮어쓰기
```

---

## 숨은 의미: NOR Gate

논리 회로의 NOR 게이트는 **"기본값을 거부한다"**는 의미.

- 기본 AI = 벌거벗은 상태 (Not dressed)
- NOR = "기본이 아닌 것을 선택한다" = 옷을 입는다
- NOR gate는 모든 논리 회로를 구현할 수 있는 **범용 게이트** → NOR 하나로 모든 AI 행동을 정의할 수 있다

---

## 제품 라인업

```
NOR Free        — .nor 에디터 + 기본 옷 3벌
NOR Pro         — 무제한 레이어 + 전체 옷장 + 마켓 등록
NOR Team        — 유니폼(전사 정책) + 감사 로그
NOR Enterprise  — 컴플라이언스 + On-premise + SIEM 연동
NOR Wardrobe    — .nor 파일 마켓플레이스
```

---

## Go-to-Market 한 줄 요약

> **"프롬프트 엔지니어링의 시대는 끝났다. 이제 AI에게 옷을 입혀라."**

---

## Visual Identity Guide

### Color Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary** | Deep Navy | `#1a1a2e` | Background, header, gallery banner |
| **Secondary** | Electric Blue | `#0f3460` | Accent borders, links |
| **Accent** | Cyan Glow | `#16213e` | Hover states, highlights |
| **Safety** | Warm Amber | `#e94560` | Deny, SEAL, BLOCK indicators |
| **Success** | Emerald | `#0ead69` | ALLOW, PASSED, verified states |
| **Text** | Pearl White | `#eaeaea` | Primary text on dark |
| **Muted** | Slate Gray | `#7f8c8d` | Secondary text, descriptions |

### Icon Concept

**NOA 아이콘 (128x128 PNG):**
- 옷걸이 실루엣 + AI 뉴런 패턴
- 배경: `#1a1a2e` (Deep Navy)
- 전경: `#0ead69` (Emerald) 그라디언트
- 스타일: 미니멀, 단색, 둥근 모서리
- VS Code Marketplace 가독성 확보 (작은 사이즈에서도 인식 가능)

### Theme Application

**Dark Theme (기본):**
```
Background:  #1a1a2e
Surface:     #16213e
Border:      #0f3460
Text:        #eaeaea
Accent:      #0ead69
Danger:      #e94560
```

**Light Theme (대안):**
```
Background:  #f8f9fa
Surface:     #ffffff
Border:      #dee2e6
Text:        #212529
Accent:      #0f3460
Danger:      #dc3545
```

### Badge Style

배지는 `shields.io` 스타일 사용:
- `flat` 스타일 (둥근 모서리 없음)
- 색상: 버전=blue, 엔진=green, 테스트=brightgreen, 라이선스=yellow

---

## 연관 자산

- `NOA_CLOTHING_FRAMEWORK_DESIGN.md` — 기술 설계 원본
- `NOA_BUSINESS_POSITION.md` — 사업 포지셔닝
- `noa-vscode/` — VS Code Extension 구현체 (v1.1.0)
- `noa-vscode/README.md` — 제품 README (배지 + 아키텍처)
- `noa-vscode/CONTRIBUTING.md` — 기여 가이드
