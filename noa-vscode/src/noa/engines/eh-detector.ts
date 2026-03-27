/**
 * EH v15.9 — 할루시네이션 탐지 엔진 (TypeScript 이식)
 *
 * 설계서 §6.3 기준.
 * 리스크 공식:
 *   raw_risk = blur + success_no_cost + hallucination
 *   weighted_risk = raw_risk × DOMAIN_WEIGHT[domain]
 *   source_adjust = (100 - credibility_score) × 0.1
 *   final_risk = min(weighted_risk + source_adjust, 100)
 *   eh_score = max(10, 100 - final_risk)
 */

// --- Domain 가중치 ---

export enum Domain {
  GENERAL = "GENERAL",
  MEDICAL = "MEDICAL",
  LEGAL = "LEGAL",
  FINANCE = "FINANCE",
  ACADEMIC = "ACADEMIC",
}

export const DOMAIN_WEIGHTS: Record<Domain, number> = {
  [Domain.GENERAL]: 1.0,
  [Domain.MEDICAL]: 1.4,
  [Domain.LEGAL]: 1.3,
  [Domain.FINANCE]: 1.35,
  [Domain.ACADEMIC]: 1.2,
};

// --- Confidence Level ---

export enum ConfidenceLevel {
  TRUST = "TRUST",       // < 30
  CAUTION = "CAUTION",   // 30 ~ 60
  DANGER = "DANGER",     // > 60
}

// --- Source Credibility ---

export enum SourceTier {
  HIGH = "HIGH",       // FDA, WHO, 대법원 등
  NEUTRAL = "NEUTRAL",
  LOW = "LOW",         // 블로그, SNS 등
}

const SOURCE_SCORES: Record<SourceTier, number> = {
  [SourceTier.HIGH]: 90,
  [SourceTier.NEUTRAL]: 50,
  [SourceTier.LOW]: 20,
};

// --- 탐지 모듈 ---

/**
 * blur() — 모호한 표현 키워드 매칭 → +4.0/hit
 */
const BLUR_KEYWORDS_KO = [
  "갑자기", "기적", "운명", "아마", "어쩌면", "대충", "느낌적으로",
  "보통은", "일반적으로", "많은 전문가들이",
];
const BLUR_KEYWORDS_EN = [
  "suddenly", "miracle", "destiny", "probably", "maybe", "roughly",
  "generally", "many experts",
];

export function detectBlur(text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of [...BLUR_KEYWORDS_KO, ...BLUR_KEYWORDS_EN]) {
    if (lower.includes(kw.toLowerCase())) hits++;
  }
  return hits * 4.0;
}

/**
 * successNoCost() — 비용 없는 성공 패턴 → +10.0
 */
const NO_COST_PATTERNS_KO = [
  "부작용 없이", "위험 없이", "리스크 없이", "무료로", "간단하게 해결",
  "누구나 가능", "실패할 수 없",
];
const NO_COST_PATTERNS_EN = [
  "no side effects", "risk-free", "guaranteed success", "foolproof",
  "no downside", "zero risk",
];

export function detectSuccessNoCost(text: string): number {
  const lower = text.toLowerCase();
  for (const pattern of [...NO_COST_PATTERNS_KO, ...NO_COST_PATTERNS_EN]) {
    if (lower.includes(pattern.toLowerCase())) return 10.0;
  }
  return 0;
}

/**
 * hallucination() — 절대 표현 탐지 → +12 ~ +18
 */
const ABSOLUTE_PATTERNS: Array<{ pattern: string; score: number }> = [
  // 한국어
  { pattern: "100%", score: 18 },
  { pattern: "완벽하게", score: 15 },
  { pattern: "원금보장", score: 18 },
  { pattern: "절대 안전", score: 16 },
  { pattern: "확실히", score: 12 },
  { pattern: "반드시", score: 14 },
  { pattern: "틀림없이", score: 14 },
  { pattern: "무조건", score: 16 },
  // 영어
  { pattern: "100%", score: 18 },
  { pattern: "perfectly", score: 15 },
  { pattern: "guaranteed", score: 16 },
  { pattern: "absolutely safe", score: 16 },
  { pattern: "certainly", score: 12 },
  { pattern: "without a doubt", score: 14 },
  { pattern: "impossible to fail", score: 18 },
];

export function detectHallucination(text: string): number {
  const lower = text.toLowerCase();
  let maxScore = 0;
  for (const { pattern, score } of ABSOLUTE_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      maxScore = Math.max(maxScore, score);
    }
  }
  return maxScore;
}

/**
 * sourceCredibility() — 출처 신뢰도 평가
 */
const HIGH_SOURCES = [
  "fda", "who", "cdc", "nih", "대법원", "헌법재판소", "금융위원회",
  "nature", "lancet", "nejm", "cochrane",
];
const LOW_SOURCES = [
  "블로그", "sns", "카페", "유튜브", "tiktok", "reddit", "quora",
  "개인 의견", "카더라",
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

// --- 리스크 계산 (핵심 공식) ---

export interface EhDetectionResult {
  rawRisk: number;
  weightedRisk: number;
  sourceAdjust: number;
  finalRisk: number;
  ehScore: number;
  confidenceLevel: ConfidenceLevel;
  flags: EhFlags;
}

export interface EhFlags {
  blurScore: number;
  successNoCostScore: number;
  hallucinationScore: number;
  sourceTier: SourceTier;
  sourceScore: number;
}

export interface EhConfig {
  domain: Domain;
  domainWeight?: number;        // .noa에서 오버라이드 가능
  enableSourceCredibility: boolean;
}

export function detect(
  text: string,
  config: EhConfig
): EhDetectionResult {
  const start = performance.now();

  // 4개 탐지 모듈 실행
  const blurScore = detectBlur(text);
  const successNoCostScore = detectSuccessNoCost(text);
  const hallucinationScore = detectHallucination(text);
  const { tier: sourceTier, score: sourceScore } = evaluateSourceCredibility(text);

  // 리스크 공식
  const rawRisk = blurScore + successNoCostScore + hallucinationScore;
  const weight = config.domainWeight ?? DOMAIN_WEIGHTS[config.domain];
  const weightedRisk = rawRisk * weight;

  const sourceAdjust = config.enableSourceCredibility
    ? (100 - sourceScore) * 0.1
    : 0;

  const finalRisk = Math.min(weightedRisk + sourceAdjust, 100);
  const ehScore = Math.max(10, 100 - finalRisk);

  // Confidence level
  let confidenceLevel: ConfidenceLevel;
  if (finalRisk < 30) confidenceLevel = ConfidenceLevel.TRUST;
  else if (finalRisk <= 60) confidenceLevel = ConfidenceLevel.CAUTION;
  else confidenceLevel = ConfidenceLevel.DANGER;

  return {
    rawRisk: round2(rawRisk),
    weightedRisk: round2(weightedRisk),
    sourceAdjust: round2(sourceAdjust),
    finalRisk: round2(finalRisk),
    ehScore: round2(ehScore),
    confidenceLevel,
    flags: {
      blurScore: round2(blurScore),
      successNoCostScore: round2(successNoCostScore),
      hallucinationScore: round2(hallucinationScore),
      sourceTier,
      sourceScore,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
