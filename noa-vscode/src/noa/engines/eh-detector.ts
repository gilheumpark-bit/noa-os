/**
 * EH v16.4-R — 할루시네이션 탐지 엔진 (원본 데이터 이식)
 *
 * 원본: EH OS v16.4-R Part 1 (Signal Extraction) + Part 2 (Constraint Matcher)
 *
 * 변경점 (v15.9 → v16.4-R):
 * - 도메인별 시그널 룰 테이블 6종 (General/Medical/Legal/Finance/Engineering/Public-Edu)
 * - 마이너스 가중치 (근거/출처 있으면 감산)
 * - 도메인별 임계값 분리 (Medical=15, Finance=20, Public=18, Legal=16)
 * - 제약 패턴 (ConstraintRule) 별도 매칭
 * - StateCode 4종 (PASS/CONTAINED/REFINED/MANUAL_EVENT)
 */

// --- Domain ---

export enum Domain {
  GENERAL = "GENERAL",
  MEDICAL = "MEDICAL",
  LEGAL = "LEGAL",
  FINANCE = "FINANCE",
  ACADEMIC = "ACADEMIC",
  ENGINEERING = "ENGINEERING",
  PUBLIC = "PUBLIC",
  EDUCATION = "EDUCATION",
}

export const DOMAIN_WEIGHTS: Record<Domain, number> = {
  [Domain.GENERAL]: 1.0,
  [Domain.MEDICAL]: 1.4,
  [Domain.LEGAL]: 1.3,
  [Domain.FINANCE]: 1.35,
  [Domain.ACADEMIC]: 1.2,
  [Domain.ENGINEERING]: 1.4,
  [Domain.PUBLIC]: 1.25,
  [Domain.EDUCATION]: 1.2,
};

// --- 도메인별 임계값 (원본 Part 5) ---

export const DOMAIN_THRESHOLDS: Record<Domain, { caution: number; danger: number }> = {
  [Domain.GENERAL]: { caution: 30, danger: 60 },
  [Domain.MEDICAL]: { caution: 15, danger: 40 },
  [Domain.LEGAL]: { caution: 16, danger: 45 },
  [Domain.FINANCE]: { caution: 20, danger: 50 },
  [Domain.ACADEMIC]: { caution: 25, danger: 55 },
  [Domain.ENGINEERING]: { caution: 15, danger: 40 },
  [Domain.PUBLIC]: { caution: 18, danger: 45 },
  [Domain.EDUCATION]: { caution: 18, danger: 45 },
};

// --- StateCode (원본 Part 0) ---

export enum StateCode {
  PASS = "STATE_00_PASS",
  CONTAINED = "STATE_42_CONTAINED",
  REFINED = "STATE_51_REFINED",
  MANUAL_EVENT = "STATE_99_MANUAL_EVENT",
}

// --- Confidence Level ---

export enum ConfidenceLevel {
  TRUST = "TRUST",
  CAUTION = "CAUTION",
  DANGER = "DANGER",
}

// --- Source Credibility ---

export enum SourceTier {
  HIGH = "HIGH",
  NEUTRAL = "NEUTRAL",
  LOW = "LOW",
}

const SOURCE_SCORES: Record<SourceTier, number> = {
  [SourceTier.HIGH]: 90,
  [SourceTier.NEUTRAL]: 50,
  [SourceTier.LOW]: 20,
};

// ============================================================
// SIGNAL RULES (원본 Part 1)
// ============================================================

export interface SignalRule {
  trigger: string;
  weight: number;  // 음수 가능 (감산)
  tag: string;
}

/** 공통 시그널 (전 도메인) */
const BASE_SIGNALS: SignalRule[] = [
  // blur
  { trigger: "갑자기", weight: 4, tag: "TEMPORAL_BLUR" },
  { trigger: "기적", weight: 6, tag: "NON_DETERMINISTIC_TERM" },
  { trigger: "운명", weight: 4, tag: "NON_DETERMINISTIC_TERM" },
  { trigger: "아마", weight: 4, tag: "TEMPORAL_BLUR" },
  { trigger: "어쩌면", weight: 4, tag: "TEMPORAL_BLUR" },
  { trigger: "대충", weight: 4, tag: "TEMPORAL_BLUR" },
  { trigger: "느낌적으로", weight: 5, tag: "TEMPORAL_BLUR" },
  { trigger: "보통은", weight: 3, tag: "TEMPORAL_BLUR" },
  { trigger: "일반적으로", weight: 3, tag: "TEMPORAL_BLUR" },
  { trigger: "많은 전문가들이", weight: 8, tag: "VAGUE_AUTHORITY" },
  { trigger: "연구에 따르면", weight: 10, tag: "UNVERIFIED_REFERENCE" },
  { trigger: "전문가들은 말한다", weight: 8, tag: "VAGUE_AUTHORITY" },
  { trigger: "통계적으로", weight: 8, tag: "MISSING_DATA" },
  { trigger: "사실이다", weight: 12, tag: "ASSERTION_WITHOUT_EVIDENCE" },
  // success_no_cost
  { trigger: "부작용 없이", weight: 10, tag: "NO_COST_SUCCESS" },
  { trigger: "위험 없이", weight: 10, tag: "NO_COST_SUCCESS" },
  { trigger: "리스크 없이", weight: 10, tag: "NO_COST_SUCCESS" },
  { trigger: "간단하게 해결", weight: 8, tag: "NO_COST_SUCCESS" },
  // absolute
  { trigger: "100%", weight: 18, tag: "ABSOLUTE_CLAIM" },
  { trigger: "완벽하게", weight: 15, tag: "ABSOLUTE_CLAIM" },
  { trigger: "원금보장", weight: 18, tag: "ABSOLUTE_CLAIM" },
  { trigger: "절대 안전", weight: 16, tag: "ABSOLUTE_CLAIM" },
  { trigger: "확실히", weight: 12, tag: "ABSOLUTE_CLAIM" },
  { trigger: "반드시", weight: 14, tag: "ABSOLUTE_CLAIM" },
  { trigger: "틀림없이", weight: 14, tag: "ABSOLUTE_CLAIM" },
  { trigger: "무조건", weight: 16, tag: "ABSOLUTE_CLAIM" },
  // 영어
  { trigger: "suddenly", weight: 4, tag: "TEMPORAL_BLUR" },
  { trigger: "miracle", weight: 6, tag: "NON_DETERMINISTIC_TERM" },
  { trigger: "guaranteed", weight: 16, tag: "ABSOLUTE_CLAIM" },
  { trigger: "risk-free", weight: 10, tag: "NO_COST_SUCCESS" },
  { trigger: "no side effects", weight: 10, tag: "NO_COST_SUCCESS" },
  { trigger: "100%", weight: 18, tag: "ABSOLUTE_CLAIM" },
  { trigger: "perfectly", weight: 15, tag: "ABSOLUTE_CLAIM" },
  { trigger: "certainly", weight: 12, tag: "ABSOLUTE_CLAIM" },
  { trigger: "impossible to fail", weight: 18, tag: "ABSOLUTE_CLAIM" },
  // ★ 감산 시그널 — 근거가 있으면 리스크 감소
  { trigger: "출처", weight: -4, tag: "REFERENCE_PRESENT" },
  { trigger: "근거", weight: -4, tag: "REFERENCE_PRESENT" },
  { trigger: "법령", weight: -4, tag: "LEGAL_BASIS_PRESENT" },
  { trigger: "데이터", weight: -3, tag: "DATA_PRESENT" },
  { trigger: "자료", weight: -3, tag: "DATA_PRESENT" },
  { trigger: "논문", weight: -3, tag: "ACADEMIC_SOURCE" },
];

/** 도메인 특화 시그널 (원본 Part 1 + Trinity/Engineering/Finance/Public-Edu) */
const DOMAIN_SIGNALS: Partial<Record<Domain, SignalRule[]>> = {
  [Domain.MEDICAL]: [
    { trigger: "완치", weight: 10, tag: "ABSOLUTE_MEDICAL_CLAIM" },
    { trigger: "진단", weight: 8, tag: "MED_DIAGNOSIS_ATTEMPT" },
    { trigger: "처방", weight: 8, tag: "MED_PRESCRIPTION_ATTEMPT" },
    { trigger: "부작용 없음", weight: 12, tag: "NO_SIDE_EFFECT" },
    // 감산: 의학적 근거
    { trigger: "임상", weight: -3, tag: "CLINICAL_EVIDENCE" },
    { trigger: "가이드라인", weight: -3, tag: "GUIDELINE_PRESENT" },
  ],
  [Domain.LEGAL]: [
    { trigger: "자동 갱신", weight: 10, tag: "AUTO_RENEWAL" },
    { trigger: "책임 한정", weight: 10, tag: "LEGAL_LIMIT_EVASION" },
    { trigger: "별도 합의", weight: 8, tag: "SEPARATE_AGREEMENT" },
    { trigger: "등등", weight: 6, tag: "VAGUE_ENUMERATION" },
    // 감산
    { trigger: "조항", weight: -4, tag: "CLAUSE_REFERENCE" },
    { trigger: "판례", weight: -3, tag: "CASE_LAW_PRESENT" },
  ],
  [Domain.FINANCE]: [
    { trigger: "확정 수익", weight: 12, tag: "NUMERIC_ASSERTION" },
    { trigger: "보장", weight: 8, tag: "UNCONDITIONAL_GUARANTEE" },
    { trigger: "수익", weight: 6, tag: "FIN_RETURN_MENTION" },
    { trigger: "리스크 없음", weight: 15, tag: "RISK_DENIAL" },
    { trigger: "급등", weight: 8, tag: "HYPE_LANGUAGE" },
    { trigger: "폭등", weight: 8, tag: "HYPE_LANGUAGE" },
    { trigger: "손실 없음", weight: 12, tag: "NO_RISK_ASSERTION" },
    // 감산
    { trigger: "%", weight: -2, tag: "NUMERIC_PRESENT" },
    { trigger: "원", weight: -2, tag: "CURRENCY_PRESENT" },
  ],
  [Domain.ENGINEERING]: [
    { trigger: "오차 없음", weight: 12, tag: "ABSOLUTE_PRECISION" },
    { trigger: "완벽", weight: 12, tag: "ABSOLUTE_CLAIM" },
    { trigger: "안전함", weight: 8, tag: "UNVERIFIED_SAFETY" },
    { trigger: "문제없음", weight: 8, tag: "UNVERIFIED_CLEARANCE" },
    // 감산
    { trigger: "kN", weight: -4, tag: "ENGINEERING_METRIC" },
    { trigger: "MPa", weight: -4, tag: "ENGINEERING_METRIC" },
    { trigger: "+/-", weight: -3, tag: "TOLERANCE_SPECIFIED" },
    { trigger: "도면", weight: -3, tag: "BLUEPRINT_PRESENT" },
  ],
  [Domain.PUBLIC]: [
    { trigger: "최대한 지원", weight: 8, tag: "UNBOUNDED_SUPPORT" },
    { trigger: "즉시 시행", weight: 8, tag: "IMMEDIATE_POLICY" },
    { trigger: "긍정 검토", weight: 6, tag: "VAGUE_APPROVAL" },
    { trigger: "예외 적용", weight: 8, tag: "EXCEPTION_NO_CLAUSE" },
    // 감산
    { trigger: "법령", weight: -4, tag: "LEGAL_BASIS_PRESENT" },
  ],
  [Domain.EDUCATION]: [
    { trigger: "합격 확실", weight: 15, tag: "EDU_GUARANTEE" },
    { trigger: "등급 보장", weight: 10, tag: "EDU_GUARANTEE" },
    { trigger: "개인적 소견", weight: 8, tag: "SUBJECTIVE_BIAS" },
    { trigger: "성실한 편", weight: 6, tag: "SUBJECTIVE_BIAS" },
  ],
};

// ============================================================
// CONSTRAINT RULES (원본 Part 2)
// ============================================================

export interface ConstraintRule {
  pattern: string;
  tag: string;
}

const DOMAIN_CONSTRAINTS: Partial<Record<Domain, ConstraintRule[]>> = {
  [Domain.FINANCE]: [
    { pattern: "확정 수익", tag: "ABSOLUTE_RETURN" },
    { pattern: "손실 없음", tag: "NO_RISK_ASSERTION" },
    { pattern: "원금 보장", tag: "PRINCIPAL_GUARANTEE" },
  ],
  [Domain.PUBLIC]: [
    { pattern: "최대한 지원", tag: "UNBOUNDED_SUPPORT" },
    { pattern: "즉시 시행", tag: "IMMEDIATE_POLICY" },
  ],
  [Domain.MEDICAL]: [
    { pattern: "부작용 없음", tag: "NO_SIDE_EFFECT" },
    { pattern: "완치 가능", tag: "ABSOLUTE_CURE" },
  ],
  [Domain.LEGAL]: [
    { pattern: "자동 갱신", tag: "AUTO_RENEWAL" },
    { pattern: "책임 면제", tag: "LIABILITY_WAIVER" },
  ],
  [Domain.ENGINEERING]: [
    { pattern: "오차 없음", tag: "ZERO_TOLERANCE" },
    { pattern: "안전 확인", tag: "UNVERIFIED_SAFETY" },
  ],
  [Domain.EDUCATION]: [
    { pattern: "합격 확실", tag: "ENTRANCE_GUARANTEE" },
    { pattern: "등급 보장", tag: "GRADE_GUARANTEE" },
  ],
};

// ============================================================
// SOURCE CREDIBILITY
// ============================================================

const HIGH_SOURCES = [
  "fda", "who", "cdc", "nih", "대법원", "헌법재판소", "금융위원회",
  "nature", "lancet", "nejm", "cochrane", "ieee", "iso",
  "교육부", "국토교통부", "한국은행",
];
const LOW_SOURCES = [
  "블로그", "sns", "카페", "유튜브", "tiktok", "reddit", "quora",
  "개인 의견", "카더라", "찌라시", "루머",
];

export function evaluateSourceCredibility(text: string): {
  tier: SourceTier;
  score: number;
} {
  const lower = text.toLowerCase();
  for (const src of HIGH_SOURCES) {
    if (lower.includes(src)) return { tier: SourceTier.HIGH, score: SOURCE_SCORES[SourceTier.HIGH] };
  }
  for (const src of LOW_SOURCES) {
    if (lower.includes(src)) return { tier: SourceTier.LOW, score: SOURCE_SCORES[SourceTier.LOW] };
  }
  return { tier: SourceTier.NEUTRAL, score: SOURCE_SCORES[SourceTier.NEUTRAL] };
}

// ============================================================
// SIGNAL EXTRACTION (원본 Part 1 패턴)
// ============================================================

export interface SignalResult {
  weight: number;
  tags: string[];
}

/**
 * 시그널 추출 — 공통 + 도메인 특화 룰 적용.
 * 마이너스 가중치로 감산 가능. 최종 weight는 0 이상.
 */
export function extractSignals(text: string, domain: Domain): SignalResult {
  const lower = text.toLowerCase();
  let weight = 0;
  const tags: string[] = [];
  const seen = new Set<string>(); // 중복 트리거 방지

  // 공통 시그널
  for (const rule of BASE_SIGNALS) {
    if (lower.includes(rule.trigger.toLowerCase()) && !seen.has(rule.trigger)) {
      seen.add(rule.trigger);
      weight += rule.weight;
      tags.push(rule.tag);
    }
  }

  // 도메인 특화 시그널
  const domainRules = DOMAIN_SIGNALS[domain] ?? [];
  for (const rule of domainRules) {
    if (lower.includes(rule.trigger.toLowerCase()) && !seen.has(rule.trigger)) {
      seen.add(rule.trigger);
      weight += rule.weight;
      tags.push(rule.tag);
    }
  }

  // 최소 0 (원본 Part 1 normalization guard)
  if (weight < 0) weight = 0;

  return { weight, tags };
}

// ============================================================
// CONSTRAINT MATCHING (원본 Part 2 패턴)
// ============================================================

export interface ConstraintResult {
  matched: boolean;
  tags: string[];
}

export function matchConstraints(text: string, domain: Domain): ConstraintResult {
  const lower = text.toLowerCase();
  const rules = DOMAIN_CONSTRAINTS[domain] ?? [];
  const matchedTags: string[] = [];

  for (const rule of rules) {
    if (lower.includes(rule.pattern.toLowerCase())) {
      matchedTags.push(rule.tag);
    }
  }

  return { matched: matchedTags.length > 0, tags: matchedTags };
}

// ============================================================
// STATE TRANSITION (원본 Part 3 패턴)
// ============================================================

export interface TransitionPolicy {
  weightThreshold: number;
  matchState: StateCode;
  weightState: StateCode;
  defaultState: StateCode;
}

const DOMAIN_POLICIES: Partial<Record<Domain, TransitionPolicy>> = {
  [Domain.FINANCE]: {
    weightThreshold: 20,
    matchState: StateCode.CONTAINED,
    weightState: StateCode.CONTAINED,
    defaultState: StateCode.PASS,
  },
  [Domain.MEDICAL]: {
    weightThreshold: 15,
    matchState: StateCode.CONTAINED,
    weightState: StateCode.CONTAINED,
    defaultState: StateCode.PASS,
  },
  [Domain.PUBLIC]: {
    weightThreshold: 18,
    matchState: StateCode.CONTAINED,
    weightState: StateCode.REFINED,
    defaultState: StateCode.PASS,
  },
  [Domain.LEGAL]: {
    weightThreshold: 16,
    matchState: StateCode.REFINED,
    weightState: StateCode.REFINED,
    defaultState: StateCode.PASS,
  },
  [Domain.ENGINEERING]: {
    weightThreshold: 15,
    matchState: StateCode.CONTAINED,
    weightState: StateCode.CONTAINED,
    defaultState: StateCode.PASS,
  },
  [Domain.EDUCATION]: {
    weightThreshold: 18,
    matchState: StateCode.CONTAINED,
    weightState: StateCode.REFINED,
    defaultState: StateCode.PASS,
  },
};

const DEFAULT_POLICY: TransitionPolicy = {
  weightThreshold: 25,
  matchState: StateCode.CONTAINED,
  weightState: StateCode.REFINED,
  defaultState: StateCode.PASS,
};

export function resolveState(
  signal: SignalResult,
  constraint: ConstraintResult,
  domain: Domain
): StateCode {
  const policy = DOMAIN_POLICIES[domain] ?? DEFAULT_POLICY;

  if (constraint.matched) return policy.matchState;
  if (signal.weight >= policy.weightThreshold) return policy.weightState;
  return policy.defaultState;
}

// ============================================================
// MAIN DETECT (통합)
// ============================================================

export interface EhDetectionResult {
  signal: SignalResult;
  constraint: ConstraintResult;
  stateCode: StateCode;
  finalRisk: number;
  ehScore: number;
  confidenceLevel: ConfidenceLevel;
  sourceTier: SourceTier;
  sourceScore: number;
}

export interface EhTuning {
  blurScorePerHit?: number;
  hallucinationMinScore?: number;
}

export interface EhConfig {
  domain: Domain;
  domainWeight?: number;
  enableSourceCredibility: boolean;
  tuning?: EhTuning;
}

export function detect(text: string, config: EhConfig): EhDetectionResult {
  const domain = config.domain;
  const weight = config.domainWeight ?? DOMAIN_WEIGHTS[domain];

  // 1. Signal Extraction (Part 1)
  const signal = extractSignals(text, domain);

  // 2. Constraint Matching (Part 2)
  const constraint = matchConstraints(text, domain);

  // 3. State Transition (Part 3)
  const stateCode = resolveState(signal, constraint, domain);

  // 4. Risk Calculation
  const { tier: sourceTier, score: sourceScore } = evaluateSourceCredibility(text);
  const weightedRisk = signal.weight * weight;
  const sourceAdjust = config.enableSourceCredibility
    ? (100 - sourceScore) * 0.1
    : 0;
  const finalRisk = Math.min(
    weightedRisk + sourceAdjust + (constraint.matched ? 10 : 0),
    100
  );
  const ehScore = Math.max(10, 100 - finalRisk);

  // 5. Confidence Level (도메인별 임계값)
  const thresholds = DOMAIN_THRESHOLDS[domain];
  let confidenceLevel: ConfidenceLevel;
  if (finalRisk < thresholds.caution) confidenceLevel = ConfidenceLevel.TRUST;
  else if (finalRisk <= thresholds.danger) confidenceLevel = ConfidenceLevel.CAUTION;
  else confidenceLevel = ConfidenceLevel.DANGER;

  return {
    signal,
    constraint,
    stateCode,
    finalRisk: round2(finalRisk),
    ehScore: round2(ehScore),
    confidenceLevel,
    sourceTier,
    sourceScore,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// 독립 탐지 유틸리티 — 단일 신호 빠른 조회 (테스트 및 개별 사용)
// ============================================================

export function detectBlur(text: string, scorePerHit: number = 4.0): number {
  const lower = text.toLowerCase();
  let hits = 0;
  const blurTags = BASE_SIGNALS.filter((r) => r.tag === "TEMPORAL_BLUR" || r.tag === "NON_DETERMINISTIC_TERM");
  for (const rule of blurTags) {
    if (lower.includes(rule.trigger.toLowerCase())) hits++;
  }
  return hits * scorePerHit;
}

export function detectSuccessNoCost(text: string): number {
  const lower = text.toLowerCase();
  const noCostRules = BASE_SIGNALS.filter((r) => r.tag === "NO_COST_SUCCESS");
  for (const rule of noCostRules) {
    if (lower.includes(rule.trigger.toLowerCase())) return 10.0;
  }
  return 0;
}

export function detectHallucination(text: string, minScore: number = 0): number {
  const lower = text.toLowerCase();
  let maxScore = 0;
  const absoluteRules = BASE_SIGNALS.filter((r) => r.tag === "ABSOLUTE_CLAIM");
  for (const rule of absoluteRules) {
    if (lower.includes(rule.trigger.toLowerCase()) && rule.weight >= minScore) {
      maxScore = Math.max(maxScore, rule.weight);
    }
  }
  return maxScore;
}
