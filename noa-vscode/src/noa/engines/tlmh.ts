/**
 * TLMH v2.0 — 연구 파트너 모드 엔진 (TypeScript 이식)
 *
 * 설계서 §6.5 기준.
 * 핵심 원칙: AI는 판단하지 않음, 결론 내리지 않음, 관점만 빌려줌.
 * 모든 아이디어 소유권은 연구자.
 */

// --- Invocation State ---

export enum InvocationState {
  IDLE = "IDLE",
  INVITED = "INVITED",
  SEALED = "SEALED",
}

// --- 금지 질문 유형 ---

export enum ProhibitedQuestionType {
  LEADING = "LEADING",           // 답을 암시
  PRESSURING = "PRESSURING",     // 결론 강요
  DEFENSIVE = "DEFENSIVE",       // 변호 유도
  META_LOOP = "META_LOOP",       // 질문에 대한 질문
  REDUNDANT = "REDUNDANT",       // 기정사실 반복
}

// --- 금지 패턴 (40+) ---

const PROHIBITED_PATTERNS: Array<{
  pattern: string;
  type: ProhibitedQuestionType;
}> = [
  // LEADING — 답을 암시
  { pattern: "그렇지 않나요", type: ProhibitedQuestionType.LEADING },
  { pattern: "맞지 않나요", type: ProhibitedQuestionType.LEADING },
  { pattern: "당연히", type: ProhibitedQuestionType.LEADING },
  { pattern: "분명히", type: ProhibitedQuestionType.LEADING },
  { pattern: "확실히 그렇죠", type: ProhibitedQuestionType.LEADING },
  { pattern: "isn't it obvious", type: ProhibitedQuestionType.LEADING },
  { pattern: "don't you think", type: ProhibitedQuestionType.LEADING },
  { pattern: "clearly", type: ProhibitedQuestionType.LEADING },
  { pattern: "obviously", type: ProhibitedQuestionType.LEADING },

  // PRESSURING — 결론 강요
  { pattern: "결론을 내려", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "빨리 답해", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "한마디로", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "결국 뭐야", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "핵심만", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "just tell me", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "bottom line", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "give me the answer", type: ProhibitedQuestionType.PRESSURING },
  { pattern: "yes or no", type: ProhibitedQuestionType.PRESSURING },

  // DEFENSIVE — 변호 유도
  { pattern: "왜 틀렸다고 생각해", type: ProhibitedQuestionType.DEFENSIVE },
  { pattern: "반박해봐", type: ProhibitedQuestionType.DEFENSIVE },
  { pattern: "네 의견이 맞다고 증명", type: ProhibitedQuestionType.DEFENSIVE },
  { pattern: "defend your position", type: ProhibitedQuestionType.DEFENSIVE },
  { pattern: "prove me wrong", type: ProhibitedQuestionType.DEFENSIVE },
  { pattern: "justify", type: ProhibitedQuestionType.DEFENSIVE },

  // META_LOOP — 질문에 대한 질문
  { pattern: "왜 그런 질문을", type: ProhibitedQuestionType.META_LOOP },
  { pattern: "내 질문이 이상해", type: ProhibitedQuestionType.META_LOOP },
  { pattern: "왜 대답을 안 해", type: ProhibitedQuestionType.META_LOOP },
  { pattern: "why are you asking", type: ProhibitedQuestionType.META_LOOP },
  { pattern: "why won't you answer", type: ProhibitedQuestionType.META_LOOP },
  { pattern: "what kind of question", type: ProhibitedQuestionType.META_LOOP },

  // REDUNDANT — 기정사실 반복
  { pattern: "이미 알고 있듯이", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "말했듯이", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "이미 확인된", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "다 아는 사실", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "as we know", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "as I said", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "we already established", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "it's a fact that", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "everyone knows", type: ProhibitedQuestionType.REDUNDANT },
  { pattern: "needless to say", type: ProhibitedQuestionType.REDUNDANT },
];

// --- Safe Question Templates ---

export const SAFE_QUESTION_TEMPLATES = [
  "이 아이디어에서 가장 덜 탐구된 부분은?",
  "이 가설의 가장 약한 고리는 어디인가요?",
  "반대 입장에서 보면 어떤 근거가 가능할까요?",
  "이 방법론의 대안으로 뭐가 있을까요?",
  "이 결과를 다른 맥락에서 해석하면?",
  "현재 증거만으로 어디까지 말할 수 있나요?",
  "이 연구의 경계 조건(boundary condition)은?",
  "누락된 변수가 있다면 뭘까요?",
];

// --- Core Logic ---

export interface TlmhState {
  invocation: InvocationState;
  turnCount: number;
  silenceCount: number;  // 연속 침묵 횟수
}

export function createInitialTlmhState(): TlmhState {
  return {
    invocation: InvocationState.IDLE,
    turnCount: 0,
    silenceCount: 0,
  };
}

/**
 * 초대 평가 — 명시적 초대만 허용.
 */
export function evaluateInvocation(
  text: string,
  state: TlmhState
): { state: TlmhState; accepted: boolean; reason: string } {
  const lower = text.toLowerCase();

  // 명시적 초대 패턴
  const explicitPatterns = [
    "같이 생각해", "함께 보자", "의견 줘", "관점 빌려줘",
    "어떻게 생각해", "검토해줘", "피드백 줘",
    "let's think together", "your perspective", "review this",
    "what do you think", "give feedback",
  ];

  const isExplicit = explicitPatterns.some((p) => lower.includes(p));

  if (isExplicit) {
    state.invocation = InvocationState.INVITED;
    return { state, accepted: true, reason: "명시적 초대 감지" };
  }

  // 암묵적: question + role_request 동시 필요
  const hasQuestion = /[?？]/.test(text);
  const roleRequest = ["연구", "논문", "가설", "research", "hypothesis", "paper"]
    .some((kw) => lower.includes(kw));

  if (hasQuestion && roleRequest) {
    state.invocation = InvocationState.INVITED;
    return { state, accepted: true, reason: "암묵적 초대 (질문 + 연구 맥락)" };
  }

  return { state, accepted: false, reason: "초대 없음 — IDLE 유지" };
}

/**
 * 질문 품질 평가 — 5종 금지 질문 필터.
 */
export function evaluateQuestionQuality(text: string): {
  valid: boolean;
  violations: Array<{ type: ProhibitedQuestionType; pattern: string }>;
  suggestion: string | null;
} {
  const lower = text.toLowerCase();
  const violations: Array<{ type: ProhibitedQuestionType; pattern: string }> = [];

  for (const { pattern, type } of PROHIBITED_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      violations.push({ type, pattern });
    }
  }

  if (violations.length === 0) {
    return { valid: true, violations: [], suggestion: null };
  }

  // 안전한 질문 제안
  const suggestion = SAFE_QUESTION_TEMPLATES[
    Math.floor(Math.random() * SAFE_QUESTION_TEMPLATES.length)
  ];

  return { valid: false, violations, suggestion };
}

/**
 * 금지 패턴 포함 여부 (단순 불리언).
 */
export function containsProhibitedPattern(text: string): boolean {
  const lower = text.toLowerCase();
  return PROHIBITED_PATTERNS.some(({ pattern }) =>
    lower.includes(pattern.toLowerCase())
  );
}

/**
 * 침묵 프로필 해석 — 침묵 = 인지적 공간 (거부가 아님).
 */
export interface SilenceProfile {
  isSilence: boolean;
  interpretation: string;
  suggestedResponse: string;
}

export function resolveSilenceProfile(
  text: string,
  state: TlmhState
): SilenceProfile {
  const trimmed = text.trim();

  // 빈 입력 또는 극히 짧은 입력을 침묵으로 간주
  if (trimmed.length === 0 || trimmed.length <= 3) {
    state.silenceCount++;
    return {
      isSilence: true,
      interpretation:
        state.silenceCount >= 3
          ? "연장된 침묵 — 사고가 깊어지고 있을 수 있음"
          : "침묵 = 인지적 공간. 거부가 아님.",
      suggestedResponse:
        state.silenceCount >= 3
          ? "필요할 때 언제든 다시 초대해주세요."
          : "생각할 시간을 드리겠습니다.",
    };
  }

  state.silenceCount = 0;
  return {
    isSilence: false,
    interpretation: "활발한 상호작용",
    suggestedResponse: "",
  };
}

// --- 통합 TLMH 엔진 ---

export interface TlmhProcessResult {
  state: TlmhState;
  invitationAccepted: boolean;
  questionValid: boolean;
  violations: Array<{ type: ProhibitedQuestionType; pattern: string }>;
  silenceProfile: SilenceProfile;
  suggestion: string | null;
}

export function processTlmhTurn(
  state: TlmhState,
  text: string,
  invitationOnly: boolean = true
): TlmhProcessResult {
  // 1. 침묵 체크
  const silenceProfile = resolveSilenceProfile(text, state);
  if (silenceProfile.isSilence) {
    state.turnCount++;
    return {
      state,
      invitationAccepted: state.invocation === InvocationState.INVITED,
      questionValid: true,
      violations: [],
      silenceProfile,
      suggestion: null,
    };
  }

  // 2. 초대 평가 (IDLE 상태일 때만)
  let invitationAccepted = state.invocation === InvocationState.INVITED;
  if (state.invocation === InvocationState.IDLE && invitationOnly) {
    const inv = evaluateInvocation(text, state);
    state = inv.state;
    invitationAccepted = inv.accepted;

    if (!invitationAccepted) {
      state.turnCount++;
      return {
        state,
        invitationAccepted: false,
        questionValid: true,
        violations: [],
        silenceProfile,
        suggestion: "명시적으로 초대해주세요. 예: '같이 생각해보자'",
      };
    }
  }

  // 3. 질문 품질 평가
  const quality = evaluateQuestionQuality(text);

  state.turnCount++;
  return {
    state,
    invitationAccepted,
    questionValid: quality.valid,
    violations: quality.violations,
    silenceProfile,
    suggestion: quality.suggestion,
  };
}
