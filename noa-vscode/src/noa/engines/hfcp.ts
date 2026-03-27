/**
 * HFCP v2.7 — 대화 에너지/점수 시스템 (TypeScript 이식)
 *
 * 설계서 §6.1 기준.
 * 핵심 공식: S_{t+1} = clip( (S_t + Δ*M + D + Σ) * L * H, 50, 150 )
 */

// --- 상수 ---

export const S_MIN = 50;
export const S_MAX = 150;
export const CREATIVE_SPIKE_CAP = 140;
export const SPIKE_THRESHOLD = 15;
export const AUTO_TUNE_EPSILON = 0.03;
export const EPOCH_DAYS = 4;
export const SOFT_SILENCE_DENSITY = 0.65;
export const DEEP_SILENCE_DENSITY = 0.80;

// --- 타입 ---

export type HfcpMode = "CHAT" | "CREATIVE";

export interface TurnSignal {
  length: number;
  hasQuestion: boolean;
  humorLevel: number;       // 0.0 ~ 1.0
  connectiveDensity: number; // 0.0 ~ 1.0
  objectionMarker: boolean;
}

export interface HfcpState {
  score: number;
  momentumK: number;
  lastDelta: number;
  turns: number;
  mode: HfcpMode;
}

export enum Verdict {
  ENGAGEMENT = "ENGAGEMENT",
  NORMAL_FREE = "NORMAL_FREE",
  NORMAL_ANALYSIS = "NORMAL_ANALYSIS",
  LIMITED = "LIMITED",
  SILENT = "SILENT",
  STOP_CREATIVE = "STOP_CREATIVE",
}

// --- NRG Memory (반복 방지) ---

export interface NrgSignature {
  hash: string;
  count: number;
  lastSeen: number;
}

export class NrgMemory {
  private signatures = new Map<string, NrgSignature>();
  private maxSize = 100;

  record(text: string): { isDuplicate: boolean; mutation: number } {
    const hash = this.simpleHash(text);
    const existing = this.signatures.get(hash);

    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      const mutation = Math.min(existing.count * 0.15, 0.8);
      return { isDuplicate: true, mutation };
    }

    this.signatures.set(hash, { hash, count: 1, lastSeen: Date.now() });
    this.evict();
    return { isDuplicate: false, mutation: 0 };
  }

  private simpleHash(text: string): string {
    // 간단한 구조 시그니처 (길이 버킷 + 첫 단어)
    const words = text.trim().split(/\s+/);
    const lenBucket = Math.floor(words.length / 5) * 5;
    const firstWord = words[0]?.toLowerCase() ?? "";
    return `${lenBucket}:${firstWord}`;
  }

  private evict(): void {
    if (this.signatures.size <= this.maxSize) return;
    // LRU 제거
    let oldest: string | undefined;
    let oldestTime = Infinity;
    for (const [hash, sig] of this.signatures) {
      if (sig.lastSeen < oldestTime) {
        oldestTime = sig.lastSeen;
        oldest = hash;
      }
    }
    if (oldest) this.signatures.delete(oldest);
  }
}

// --- RCL Level (반박 제어) ---

export enum RclLevel {
  R0 = 0, // 제한 없음
  R1 = 1, // 경고
  R2 = 2, // 1회 반박 허용
  R3 = 3, // 질문만 허용
  R4 = 4, // 요약만 허용
  R5 = 5, // 침묵
}

export function computeRclLevel(score: number): RclLevel {
  if (score >= 130) return RclLevel.R0;
  if (score >= 110) return RclLevel.R1;
  if (score >= 90) return RclLevel.R2;
  if (score >= 70) return RclLevel.R3;
  if (score >= 55) return RclLevel.R4;
  return RclLevel.R5;
}

// --- 핵심 함수 7개 ---

/**
 * Δ (Base Delta) 계산
 */
export function computeDelta(signal: TurnSignal): number {
  let delta = 0;

  if (signal.hasQuestion) delta += 3.0;
  delta += signal.humorLevel * 2.0;
  delta += signal.connectiveDensity * 4.0;
  if (signal.objectionMarker) delta += 3.0;

  if (signal.length > 300) delta += 1.5;
  else if (signal.length < 50) delta -= 2.0;

  return clamp(delta, -10, 10);
}

/**
 * M (Momentum) — k연속 같은 방향
 */
export function updateMomentum(
  currentK: number,
  lastDelta: number,
  newDelta: number
): { k: number; multiplier: number } {
  const sameDirection =
    (lastDelta >= 0 && newDelta >= 0) || (lastDelta < 0 && newDelta < 0);

  const k = sameDirection ? currentK + 1 : 1;

  const MOMENTUM_TABLE: Record<number, number> = {
    1: 1.0,
    2: 1.2,
    3: 1.5,
  };
  const multiplier = MOMENTUM_TABLE[Math.min(k, 3)] ?? 2.0;

  return { k, multiplier };
}

/**
 * D (Depth Trigger) — 반박 + 질문 감지
 */
export function depthTrigger(signal: TurnSignal): number {
  if (signal.objectionMarker && signal.hasQuestion) return 10.0;
  if (signal.connectiveDensity > 0.6) return 5.0;
  return 0;
}

/**
 * Σ (Spike Detection) — 급변 보정
 */
export function detectSpike(
  currentScore: number,
  rawChange: number
): number {
  if (Math.abs(rawChange) >= SPIKE_THRESHOLD) {
    return rawChange > 0 ? 12.0 : -12.0;
  }
  return 0;
}

/**
 * L (Load Leveling) — 극단값 억제
 */
export function loadLeveling(score: number, lowFactor: number = 0.7): number {
  if (score <= 70) return lowFactor;
  if (score >= 130) return 0.5;
  return 1.0;
}

/**
 * H (Hysteresis) — 급락 방지
 */
export function hysteresis(delta: number, factor: number = 0.5): number {
  return delta < 0 ? factor : 1.0;
}

/** 런타임 튜닝 파라미터 */
export interface HfcpTuning {
  loadLevelingLow?: number;   // 기본 0.7
  hysteresisFactor?: number;  // 기본 0.5
}

/**
 * 점수 갱신 (수정된 공식)
 * S_{t+1} = clip( S_t + (Δ*M + D + Σ) * L * H, 50, 150 )
 *
 * 변경점: L, H를 delta에만 적용 (기존: 전체 score에 곱해서 1턴 만에 바닥)
 */
export function updateScore(state: HfcpState, signal: TurnSignal, tuning?: HfcpTuning): HfcpState {
  const delta = computeDelta(signal);
  const { k, multiplier } = updateMomentum(state.momentumK, state.lastDelta, delta);
  const depth = depthTrigger(signal);

  const rawChange = delta * multiplier + depth;
  const spike = detectSpike(state.score, rawChange);
  const L = loadLeveling(state.score, tuning?.loadLevelingLow);
  const H = hysteresis(delta, tuning?.hysteresisFactor);

  const cap = state.mode === "CREATIVE" ? CREATIVE_SPIKE_CAP : S_MAX;
  const newScore = clamp(
    state.score + (rawChange + spike) * L * H,
    S_MIN,
    cap
  );

  return {
    score: Math.round(newScore * 100) / 100,
    momentumK: k,
    lastDelta: delta,
    turns: state.turns + 1,
    mode: state.mode,
  };
}

// --- Verdict 결정 ---

export function determineVerdict(state: HfcpState): Verdict {
  const { score, mode } = state;

  if (mode === "CREATIVE") {
    if (score <= S_MIN) return Verdict.STOP_CREATIVE;
  }

  if (score >= 120) return Verdict.ENGAGEMENT;
  if (score >= 90) return Verdict.NORMAL_FREE;
  if (score >= 70) return Verdict.NORMAL_ANALYSIS;
  if (score >= 55) return Verdict.LIMITED;
  return Verdict.SILENT;
}

// --- Memory Ecology (MII/MDS 지표) ---

export interface MemoryEcologyState {
  mii: number;  // Memory Integration Index
  mds: number;  // Memory Decay Score
  lastEpoch: number;
  freshnessDecay: number;
}

export function updateMemoryEcology(
  ecology: MemoryEcologyState,
  interactionCount: number
): MemoryEcologyState {
  const now = Date.now();
  const daysSinceEpoch = (now - ecology.lastEpoch) / (1000 * 60 * 60 * 24);

  // 180일 주기
  const decayFactor = Math.max(0, 1 - daysSinceEpoch / 180);
  const newMds = ecology.mds * decayFactor;

  // MII: 상호작용이 많을수록 증가
  const miiDelta = Math.min(interactionCount * 0.01, 0.1);
  const newMii = Math.min(ecology.mii + miiDelta, 1.0);

  return {
    mii: Math.round(newMii * 1000) / 1000,
    mds: Math.round(newMds * 1000) / 1000,
    lastEpoch: daysSinceEpoch >= EPOCH_DAYS ? now : ecology.lastEpoch,
    freshnessDecay: decayFactor,
  };
}

// --- 유틸 ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// --- 초기 상태 팩토리 ---

export function createInitialState(mode: HfcpMode = "CHAT"): HfcpState {
  return {
    score: 60,
    momentumK: 1,
    lastDelta: 0,
    turns: 0,
    mode,
  };
}

export function createInitialEcology(): MemoryEcologyState {
  return {
    mii: 0,
    mds: 1.0,
    lastEpoch: Date.now(),
    freshnessDecay: 1.0,
  };
}
