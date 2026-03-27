/**
 * HCRF v1.2 — 책임 게이트 엔진 (TypeScript 이식)
 *
 * 설계서 §6.2 기준.
 * 5파트 구조:
 *   Part 0: Identity (불변 원칙)
 *   Part 1: Context Signal 측정
 *   Part 2: Pressure 누적 (5턴 윈도우)
 *   Part 3: Mode 상태 머신 + Hysteresis
 *   Part 4: Output 거버넌스
 *   Part 5: Audit 연동
 */

// --- 상수 ---

export const SCORE_MIN = 50;
export const SCORE_MAX = 150;
export const QUESTION_ONLY_THRESHOLD = 120;
export const SEAL_THRESHOLD = 140;
export const PRESSURE_WINDOW_SIZE = 5;
export const HYSTERESIS_TURNS = 2;

// --- Enums ---

export enum ResponsibilityLevel {
  HUMAN_OWNED = "HUMAN_OWNED",
  HUMAN_ACK_REQUIRED = "HUMAN_ACK_REQUIRED",
  HUMAN_CONFIRM_REQUIRED = "HUMAN_CONFIRM_REQUIRED",
  BLOCKED = "BLOCKED",
}

export enum HcrfMode {
  MONITOR = "MONITOR",
  REVIEW = "REVIEW",
  SEALED = "SEALED",
}

export enum OutputVerdict {
  NO_OUTPUT = "NO_OUTPUT",
  QUESTIONS_ONLY = "QUESTIONS_ONLY",
  CONTEXT_ALERT = "CONTEXT_ALERT",
  SEALED = "SEALED",
}

// --- Part 1: Context Signal ---

export interface ContextSignal {
  ambiguityLevel: number;            // 0.0 ~ 1.0
  implicationRisk: number;           // 0.0 ~ 1.0
  authorityTransferAttempt: boolean;
  orgImpact: number;                 // 0.0 ~ 1.0
}

export function measureContextSignal(
  text: string,
  blockAuthorityTransfer: boolean
): ContextSignal {
  const lower = text.toLowerCase();

  // 모호성 감지
  const ambiguityMarkers = [
    "아마", "어쩌면", "그럴 수도", "maybe", "perhaps", "might",
    "불확실", "모르겠", "unclear",
  ];
  let ambiguityHits = 0;
  for (const m of ambiguityMarkers) {
    if (lower.includes(m)) ambiguityHits++;
  }
  const ambiguityLevel = Math.min(ambiguityHits * 0.2, 1.0);

  // 함축 리스크 감지
  const riskMarkers = [
    "책임", "결정", "최종", "확정", "승인", "허가",
    "responsibility", "decide", "authorize", "approve", "final",
  ];
  let riskHits = 0;
  for (const m of riskMarkers) {
    if (lower.includes(m)) riskHits++;
  }
  const implicationRisk = Math.min(riskHits * 0.25, 1.0);

  // 권한 이양 시도 감지
  const transferMarkers = [
    "너가 결정해", "알아서 해", "네가 판단해",
    "you decide", "it's up to you", "take over",
    "대신 해줘", "위임",
  ];
  let authorityTransferAttempt = false;
  if (blockAuthorityTransfer) {
    for (const m of transferMarkers) {
      if (lower.includes(m)) {
        authorityTransferAttempt = true;
        break;
      }
    }
  }

  // 조직 영향도
  const orgMarkers = [
    "전사", "부서", "조직", "회사", "경영",
    "company-wide", "department", "organization", "corporate",
  ];
  let orgHits = 0;
  for (const m of orgMarkers) {
    if (lower.includes(m)) orgHits++;
  }
  const orgImpact = Math.min(orgHits * 0.3, 1.0);

  return { ambiguityLevel, implicationRisk, authorityTransferAttempt, orgImpact };
}

// --- Part 2: Pressure Window (5턴 롤링) ---

export class PressureWindow {
  private buffer: number[] = [];

  push(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > PRESSURE_WINDOW_SIZE) {
      this.buffer.shift();
    }
  }

  getAverage(): number {
    if (this.buffer.length === 0) return 0;
    const sum = this.buffer.reduce((a, b) => a + b, 0);
    return sum / this.buffer.length;
  }

  getMax(): number {
    if (this.buffer.length === 0) return 0;
    return Math.max(...this.buffer);
  }

  getLength(): number {
    return this.buffer.length;
  }
}

// --- Part 3: Mode 상태 머신 ---

export interface HcrfState {
  mode: HcrfMode;
  pressure: PressureWindow;
  hysteresisCounter: number;  // 모드 전환 후 안정화 카운터
  turnCount: number;
  authorityTransferBlock: boolean;
}

export function createInitialHcrfState(
  authorityTransferBlock: boolean = true
): HcrfState {
  return {
    mode: HcrfMode.MONITOR,
    pressure: new PressureWindow(),
    hysteresisCounter: 0,
    turnCount: 0,
    authorityTransferBlock,
  };
}

/**
 * Part 1 + Part 2 + Part 3 통합:
 * Context Signal 측정 → Pressure 누적 → Mode 전이
 */
export function processHcrfTurn(
  state: HcrfState,
  hfcpScore: number,
  text: string
): {
  state: HcrfState;
  signal: ContextSignal;
  responsibility: ResponsibilityLevel;
  verdict: OutputVerdict;
} {
  // Part 1: Context Signal
  const signal = measureContextSignal(text, state.authorityTransferBlock);

  // Part 2: Pressure 계산 — 복합 지표
  const pressureValue =
    signal.ambiguityLevel * 30 +
    signal.implicationRisk * 40 +
    (signal.authorityTransferAttempt ? 30 : 0) +
    signal.orgImpact * 20;
  state.pressure.push(pressureValue);

  // Part 3: Mode 전이
  const avgPressure = state.pressure.getAverage();
  const combinedScore = hfcpScore + avgPressure;

  // Hysteresis: 모드 전환 후 HYSTERESIS_TURNS 동안 안정화
  if (state.hysteresisCounter > 0) {
    state.hysteresisCounter--;
  } else {
    const newMode = determineMode(combinedScore, signal);
    if (newMode !== state.mode) {
      state.mode = newMode;
      state.hysteresisCounter = HYSTERESIS_TURNS;
    }
  }

  state.turnCount++;

  // Part 4: Responsibility + Verdict
  const responsibility = interpretResponsibility(hfcpScore, signal);
  const verdict = resolveOutputVerdict(responsibility, state.mode);

  return { state, signal, responsibility, verdict };
}

function determineMode(combinedScore: number, signal: ContextSignal): HcrfMode {
  if (signal.authorityTransferAttempt) return HcrfMode.SEALED;
  if (combinedScore >= SEAL_THRESHOLD) return HcrfMode.SEALED;
  if (combinedScore >= QUESTION_ONLY_THRESHOLD) return HcrfMode.REVIEW;
  return HcrfMode.MONITOR;
}

// --- Part 4: Responsibility + Output Governance ---

export function interpretResponsibility(
  hfcpScore: number,
  signal: ContextSignal
): ResponsibilityLevel {
  if (signal.authorityTransferAttempt) return ResponsibilityLevel.BLOCKED;

  const risk = signal.implicationRisk + signal.orgImpact;

  if (risk > 1.2) return ResponsibilityLevel.BLOCKED;
  if (risk > 0.8 || hfcpScore >= SEAL_THRESHOLD) return ResponsibilityLevel.HUMAN_CONFIRM_REQUIRED;
  if (risk > 0.4 || hfcpScore >= QUESTION_ONLY_THRESHOLD) return ResponsibilityLevel.HUMAN_ACK_REQUIRED;
  return ResponsibilityLevel.HUMAN_OWNED;
}

export function resolveOutputVerdict(
  responsibility: ResponsibilityLevel,
  mode: HcrfMode
): OutputVerdict {
  if (mode === HcrfMode.SEALED) return OutputVerdict.SEALED;

  switch (responsibility) {
    case ResponsibilityLevel.BLOCKED:
      return OutputVerdict.SEALED;
    case ResponsibilityLevel.HUMAN_CONFIRM_REQUIRED:
      return OutputVerdict.CONTEXT_ALERT;
    case ResponsibilityLevel.HUMAN_ACK_REQUIRED:
      return OutputVerdict.QUESTIONS_ONLY;
    case ResponsibilityLevel.HUMAN_OWNED:
      return mode === HcrfMode.REVIEW
        ? OutputVerdict.QUESTIONS_ONLY
        : OutputVerdict.NO_OUTPUT;
    default:
      return OutputVerdict.NO_OUTPUT;
  }
}

// --- Part 5: Audit (ledger 연동용 이벤트 생성) ---

export interface HcrfAuditEvent {
  turnCount: number;
  mode: HcrfMode;
  responsibility: ResponsibilityLevel;
  verdict: OutputVerdict;
  signal: ContextSignal;
  hfcpScore: number;
  timestamp: number;
}

export function createAuditEvent(
  state: HcrfState,
  signal: ContextSignal,
  responsibility: ResponsibilityLevel,
  verdict: OutputVerdict,
  hfcpScore: number
): HcrfAuditEvent {
  return {
    turnCount: state.turnCount,
    mode: state.mode,
    responsibility,
    verdict,
    signal,
    hfcpScore,
    timestamp: Date.now(),
  };
}
