/**
 * Sovereign v27 — 보안 정책 엔진 (TypeScript 이식)
 *
 * 설계서 §6.6 기준.
 * 3단계 파이프라인: analyze() → decide() → run()
 */

// --- Enums ---

export enum Verdict {
  PASS = "PASS",
  DROP = "DROP",
  CHAMBER = "CHAMBER",  // 샌드박스 격리
  ERROR = "ERROR",
}

export enum Mode {
  PRIME = "PRIME",
  SCAN = "SCAN",     // 감사 모드
  SAFE = "SAFE",
  OMEGA = "OMEGA",   // OEM 파트너 모드
}

// --- SealHash (서명/검증) ---

function sha256Sync(input: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto") as typeof import("crypto");
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
  } catch {
    // fallback
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(16, "0");
  }
}

export class SealHash {
  static sign(payload: Record<string, unknown>): string {
    const s = JSON.stringify(payload, Object.keys(payload).sort());
    return sha256Sync("SEAL27" + s);
  }

  static verify(payload: Record<string, unknown>, sig: string): boolean {
    return SealHash.sign(payload) === sig;
  }
}

// --- PolicyGlyph ---

export interface PolicyRules {
  ratioCap: number;
  signalLimit: number;
  shiftAllowance: number;
  dropThreshold: number;
}

const DEFAULT_RULES: PolicyRules = {
  ratioCap: 3.0,
  signalLimit: 0.42,
  shiftAllowance: 0.18,
  dropThreshold: 0.9,
};

export class PolicyGlyph {
  version: number = 1;
  rules: PolicyRules;
  private signature: string;

  constructor(rules?: Partial<PolicyRules>) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.signature = SealHash.sign(this.rules as unknown as Record<string, unknown>);
  }

  apply(incoming: Partial<PolicyRules>, sig: string): void {
    // 서명 검증 후 업데이트
    const payload = { ...this.rules, ...incoming };
    if (!SealHash.verify(payload as unknown as Record<string, unknown>, sig)) {
      throw new Error("PolicyGlyph: 서명 검증 실패 — 변조 감지");
    }
    this.rules = payload;
    this.signature = sig;
    this.version++;
  }

  getSignature(): string {
    return this.signature;
  }
}

// --- VectorShift (이상 드리프트 감지) ---

export class VectorShift {
  private baseEntropy = 0.33;
  private baseRatio = 2.0;

  detect(entropy: number, ratio: number): number {
    let drift = 0;
    drift += Math.abs(entropy - this.baseEntropy);
    drift += Math.max(0, ratio - this.baseRatio) * 0.1;
    return Math.round(drift * 1000) / 1000;
  }
}

// --- ChamberRoute (샌드박스 토큰) ---

export class ChamberRoute {
  seal(text: string): string {
    // MD5 토큰 발행 (간이 해시)
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    const token = Math.abs(hash).toString(16).padStart(16, "0").slice(0, 16);
    return `[CHAMBER ROUTE SEALED]\nTOKEN:${token}`;
  }
}

// --- PulseLog ---

export interface Pulse {
  timestamp: number;
  code: string;
  detail: Record<string, unknown>;
}

export class PulseLog {
  private pulses: Pulse[] = [];

  add(code: string, detail: Record<string, unknown> = {}): void {
    this.pulses.push({ timestamp: Date.now(), code, detail });
  }

  export(): string {
    return JSON.stringify(this.pulses, null, 2);
  }

  getRecent(count: number): Pulse[] {
    return this.pulses.slice(-count);
  }
}

// --- Shannon Entropy ---

function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 1000) / 1000;
}

// --- Analysis Result ---

export interface AnalysisResult {
  entropy: number;
  ratio: number;
  drift: number;
  error?: string;
}

// --- Sovereign27 (메인 엔진) ---

export class Sovereign27 {
  mode: Mode = Mode.PRIME;
  private boot: number = Date.now();
  private policy: PolicyGlyph;
  private log: PulseLog;
  private shift: VectorShift;
  private chamber: ChamberRoute;
  private partner: string | null;
  private anomalyCount: number = 0;

  constructor(partner?: string) {
    this.policy = new PolicyGlyph();
    this.log = new PulseLog();
    this.shift = new VectorShift();
    this.chamber = new ChamberRoute();
    this.partner = partner ?? null;

    if (partner) {
      this.mode = Mode.OMEGA;
    }
  }

  /**
   * 안전 모드로 전환.
   */
  fail(): void {
    this.mode = Mode.SAFE;
    this.log.add("FAILSAFE", { previousMode: this.mode });
  }

  /**
   * Step 1: 분석.
   */
  analyze(text: string): AnalysisResult {
    try {
      const entropy = shannonEntropy(text);
      const words = text.split(/\s+/).filter(Boolean);
      const ratio = text.length / Math.max(1, words.length);
      const drift = this.shift.detect(entropy, ratio);
      return { entropy, ratio, drift };
    } catch (e) {
      return { entropy: 0, ratio: 0, drift: 0, error: String(e) };
    }
  }

  /**
   * Step 2: 판정.
   */
  decide(analysis: AnalysisResult): Verdict {
    if (analysis.error) return Verdict.ERROR;

    const R = this.policy.rules;

    if (analysis.ratio > R.ratioCap) return Verdict.DROP;
    if (analysis.entropy > R.signalLimit) return Verdict.DROP;
    if (analysis.drift > R.shiftAllowance) return Verdict.CHAMBER;

    return Verdict.PASS;
  }

  /**
   * Step 3: 실행.
   */
  run(text: string): { verdict: Verdict; output: string } {
    this.log.add("INGRESS", { length: text.length, mode: this.mode });

    // SCAN 모드: 분석만 반환
    if (this.mode === Mode.SCAN) {
      const analysis = this.analyze(text);
      return {
        verdict: Verdict.PASS,
        output: JSON.stringify(analysis, null, 2),
      };
    }

    const analysis = this.analyze(text);
    const verdict = this.decide(analysis);

    this.log.add("VERDICT", { verdict, ...analysis });

    switch (verdict) {
      case Verdict.PASS:
        return { verdict, output: text };

      case Verdict.DROP:
        this.anomalyCount++;
        if (this.anomalyCount >= 3) {
          this.fail();
        }
        return { verdict, output: "[DROPPED]" };

      case Verdict.CHAMBER:
        return { verdict, output: this.chamber.seal(text) };

      case Verdict.ERROR:
        return { verdict, output: "[ERROR]" };

      default:
        return { verdict: Verdict.ERROR, output: "[ERROR]" };
    }
  }

  /**
   * OEM 파트너 모드 진입.
   */
  oem(name: string): void {
    this.partner = name;
    this.mode = Mode.OMEGA;
    this.log.add("OMEGA_MODE", { partner: name });
  }

  /**
   * 현재 상태 요약.
   */
  getStatus(): {
    mode: Mode;
    anomalyCount: number;
    policyVersion: number;
    uptimeMs: number;
  } {
    return {
      mode: this.mode,
      anomalyCount: this.anomalyCount,
      policyVersion: this.policy.version,
      uptimeMs: Date.now() - this.boot,
    };
  }

  getPulseLog(): PulseLog {
    return this.log;
  }
}
