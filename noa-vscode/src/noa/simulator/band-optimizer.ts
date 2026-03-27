/**
 * 밴드 최적화기 — 기본값 0.5, 하단 0.48, 상단 0.52 한계 내에서
 * 각 엔진 파라미터를 조정하여 최적 pass rate를 도출.
 *
 * 모든 엔진 파라미터를 0.0~1.0 정규화 값으로 매핑한 뒤,
 * 밴드 내에서 스텝 단위로 탐색.
 */

import { EngineSimulator, getScenarios, type SimSummary } from "./engine-sim";
import { SessionManager } from "../runtime/session";

// --- 밴드 설정 ---

export const BAND = {
  base: 0.50,
  lower: 0.48,
  upper: 0.52,
  step: 0.005,  // 0.005 단위 = 밴드 내 9스텝 (0.48, 0.485, 0.49, ..., 0.52)
} as const;

/**
 * 밴드 내 가능한 값 배열 생성.
 */
export function bandValues(): number[] {
  const vals: number[] = [];
  for (let v = BAND.lower; v <= BAND.upper + 0.0001; v += BAND.step) {
    vals.push(round(v));
  }
  return vals;
}

// --- 엔진 파라미터 → 정규화 매핑 ---

/**
 * 각 엔진의 튜닝 가능한 파라미터를 밴드 값(0.48~0.52)과 실제 값 사이에서 변환.
 * 밴드 0.5 = 현재 기본값, 0.48 = 민감도 최저, 0.52 = 민감도 최고.
 */
export interface EngineParam {
  engine: string;
  param: string;
  /** 밴드 0.48일 때 실제 값 */
  atLower: number;
  /** 밴드 0.50일 때 실제 값 (현재 기본값) */
  atBase: number;
  /** 밴드 0.52일 때 실제 값 */
  atUpper: number;
  /** 설명 */
  description: string;
}

export const ENGINE_PARAMS: EngineParam[] = [
  // --- EH ---
  {
    engine: "eh",
    param: "domain_weight",
    atLower: 0.8,     // 민감도 낮음
    atBase: 1.0,      // 기본 (GENERAL)
    atUpper: 1.5,     // 민감도 높음
    description: "EH 도메인 가중치 — 할루시네이션 감지 민감도",
  },
  {
    engine: "eh",
    param: "blur_score_per_hit",
    atLower: 2.0,     // 느슨
    atBase: 4.0,      // 기본
    atUpper: 6.0,     // 엄격
    description: "EH blur 키워드당 점수",
  },
  {
    engine: "eh",
    param: "hallucination_threshold",
    atLower: 20.0,    // 느슨 (20점 이상이면 감지)
    atBase: 12.0,     // 기본
    atUpper: 8.0,     // 엄격 (8점만 돼도 감지)
    description: "EH 절대표현 감지 최소 점수",
  },

  // --- HCRF ---
  {
    engine: "hcrf",
    param: "pressure_weight",
    atLower: 0.6,     // 둔감
    atBase: 1.0,      // 기본
    atUpper: 1.4,     // 민감
    description: "HCRF 압력 누적 가중치",
  },
  {
    engine: "hcrf",
    param: "seal_threshold",
    atLower: 160,     // 느슨 (잘 안 잠김)
    atBase: 140,      // 기본
    atUpper: 120,     // 엄격 (빨리 잠김)
    description: "HCRF SEALED 전환 임계값",
  },

  // --- HFCP ---
  {
    engine: "hfcp",
    param: "load_leveling_low",
    atLower: 0.5,     // 강한 억제
    atBase: 0.7,      // 기본
    atUpper: 0.85,    // 약한 억제
    description: "HFCP 저점수 구간 로드 레벨링",
  },
  {
    engine: "hfcp",
    param: "hysteresis_factor",
    atLower: 0.3,     // 강한 급락 방지
    atBase: 0.5,      // 기본
    atUpper: 0.7,     // 약한 급락 방지
    description: "HFCP 히스테리시스 (급락 방지 강도)",
  },

  // --- OCFP ---
  {
    engine: "ocfp",
    param: "risk_score_hr",
    atLower: 10,      // HR 키워드 약하게
    atBase: 15,       // 기본
    atUpper: 20,      // HR 키워드 강하게
    description: "OCFP HR 키워드 리스크 점수",
  },
  {
    engine: "ocfp",
    param: "risk_score_legal",
    atLower: 15,      // 법률 키워드 약하게
    atBase: 20,       // 기본
    atUpper: 25,      // 법률 키워드 강하게
    description: "OCFP 법률 키워드 리스크 점수",
  },

  // --- Sovereign ---
  {
    engine: "sovereign",
    param: "ratio_cap",
    atLower: 3.5,     // 느슨
    atBase: 3.0,      // 기본
    atUpper: 2.5,     // 엄격
    description: "Sovereign 비율 캡 (낮을수록 엄격)",
  },
  {
    engine: "sovereign",
    param: "signal_limit",
    atLower: 0.50,    // 느슨
    atBase: 0.42,     // 기본
    atUpper: 0.35,    // 엄격
    description: "Sovereign 엔트로피 신호 한계",
  },
];

/**
 * 밴드 값(0.48~0.52)을 실제 엔진 파라미터 값으로 변환.
 */
export function bandToActual(param: EngineParam, bandVal: number): number {
  const t = (bandVal - BAND.lower) / (BAND.upper - BAND.lower); // 0.0 ~ 1.0
  const actual = param.atLower + t * (param.atUpper - param.atLower);
  return round(actual);
}

/**
 * 실제 값을 밴드 값으로 역변환.
 */
export function actualToBand(param: EngineParam, actual: number): number {
  const t = (actual - param.atLower) / (param.atUpper - param.atLower);
  const bandVal = BAND.lower + t * (BAND.upper - BAND.lower);
  return round(Math.max(BAND.lower, Math.min(BAND.upper, bandVal)));
}

// --- 최적화 결과 ---

export interface BandConfig {
  /** 각 파라미터의 밴드 값 */
  values: Record<string, number>;
}

export interface OptimizationResult {
  /** 테스트한 조합 수 */
  combinationsTested: number;
  /** 최적 밴드 설정 */
  bestConfig: BandConfig;
  /** 최적 설정의 시뮬 결과 */
  bestSummary: SimSummary;
  /** 기본값(0.5)의 시뮬 결과 */
  baselineSummary: SimSummary;
  /** 개선율 */
  improvement: number;
  /** 파라미터별 민감도 분석 */
  sensitivity: SensitivityEntry[];
}

export interface SensitivityEntry {
  param: string;
  engine: string;
  /** 밴드 값별 pass rate */
  curve: Array<{ band: number; passRate: number }>;
  /** 최적 밴드 값 */
  optimalBand: number;
  /** 변동폭 (max - min pass rate) */
  impact: number;
}

// --- 최적화기 ---

export class BandOptimizer {
  private simulator: EngineSimulator;
  private presetIds: string[];

  constructor(simulator: EngineSimulator, presetIds: string[]) {
    this.simulator = simulator;
    this.presetIds = presetIds;
  }

  /**
   * 1차원 스윕 — 각 파라미터를 독립적으로 밴드 탐색.
   * 결과: 파라미터별 민감도 곡선 + 최적 밴드 값.
   */
  sweepAll(): OptimizationResult {
    const steps = bandValues();
    const sensitivity: SensitivityEntry[] = [];

    // 기준선: 모든 파라미터 0.5
    const baselineConfig = this.makeConfig(BAND.base);
    const baselineSummary = this.evaluate(baselineConfig);

    let bestConfig = baselineConfig;
    let bestRate = baselineSummary.passRate;
    let bestSummary = baselineSummary;
    let combinationsTested = 1;

    // 각 파라미터를 독립 스윕
    for (const param of ENGINE_PARAMS) {
      const key = `${param.engine}.${param.param}`;
      const curve: Array<{ band: number; passRate: number }> = [];

      let paramBest = BAND.base;
      let paramBestRate = 0;

      for (const bandVal of steps) {
        // 현재 best config에서 이 파라미터만 변경
        const testConfig = { ...bestConfig, values: { ...bestConfig.values, [key]: bandVal } };
        const summary = this.evaluate(testConfig);
        combinationsTested++;

        curve.push({ band: bandVal, passRate: summary.passRate });

        if (summary.passRate > paramBestRate) {
          paramBestRate = summary.passRate;
          paramBest = bandVal;
        }
      }

      const rates = curve.map((c) => c.passRate);
      const impact = Math.max(...rates) - Math.min(...rates);

      sensitivity.push({
        param: param.param,
        engine: param.engine,
        curve,
        optimalBand: paramBest,
        impact,
      });

      // 최적값으로 갱신
      bestConfig = { values: { ...bestConfig.values, [key]: paramBest } };
    }

    // 최종 평가
    bestSummary = this.evaluate(bestConfig);
    bestRate = bestSummary.passRate;

    const improvement = bestRate - baselineSummary.passRate;

    return {
      combinationsTested,
      bestConfig,
      bestSummary,
      baselineSummary,
      improvement,
      sensitivity,
    };
  }

  /**
   * 그리드 서치 — 영향도 상위 N개 파라미터만 조합 탐색.
   * (전수 조합은 11^11 = 약 2850억이라 불가능, 상위 3개만)
   */
  gridSearch(topN: number = 3): OptimizationResult {
    // 먼저 스윕으로 영향도 파악
    const sweepResult = this.sweepAll();
    const topParams = sweepResult.sensitivity
      .sort((a, b) => b.impact - a.impact)
      .slice(0, topN);

    const steps = bandValues();
    let bestConfig = sweepResult.bestConfig;
    let bestRate = sweepResult.bestSummary.passRate;
    let bestSummary = sweepResult.bestSummary;
    let combinationsTested = sweepResult.combinationsTested;

    // 상위 N개 파라미터 조합 탐색
    const keys = topParams.map((p) => `${p.engine}.${p.param}`);

    if (keys.length >= 1) {
      for (const v0 of steps) {
        const config0 = { values: { ...bestConfig.values, [keys[0]]: v0 } };

        if (keys.length >= 2) {
          for (const v1 of steps) {
            const config1 = { values: { ...config0.values, [keys[1]]: v1 } };

            if (keys.length >= 3) {
              for (const v2 of steps) {
                const config2 = { values: { ...config1.values, [keys[2]]: v2 } };
                combinationsTested++;
                const summary = this.evaluate(config2);
                if (summary.passRate > bestRate) {
                  bestRate = summary.passRate;
                  bestConfig = config2;
                  bestSummary = summary;
                }
              }
            } else {
              combinationsTested++;
              const summary = this.evaluate(config1);
              if (summary.passRate > bestRate) {
                bestRate = summary.passRate;
                bestConfig = config1;
                bestSummary = summary;
              }
            }
          }
        } else {
          combinationsTested++;
          const summary = this.evaluate(config0);
          if (summary.passRate > bestRate) {
            bestRate = summary.passRate;
            bestConfig = config0;
            bestSummary = summary;
          }
        }
      }
    }

    return {
      combinationsTested,
      bestConfig,
      bestSummary,
      baselineSummary: sweepResult.baselineSummary,
      improvement: bestRate - sweepResult.baselineSummary.passRate,
      sensitivity: sweepResult.sensitivity,
    };
  }

  /**
   * 결과를 사람이 읽을 수 있는 리포트로 변환.
   */
  static formatReport(result: OptimizationResult): string {
    const lines: string[] = [];

    lines.push("╔══════════════════════════════════════════════╗");
    lines.push("║   NOA 밴드 최적화 결과 (0.48 ~ 0.52)        ║");
    lines.push("╚══════════════════════════════════════════════╝");
    lines.push("");
    lines.push(`조합 테스트: ${result.combinationsTested}회`);
    lines.push(`기준선 (0.50): ${result.baselineSummary.passRate}%`);
    lines.push(`최적값: ${result.bestSummary.passRate}%`);
    lines.push(`개선: ${result.improvement >= 0 ? "+" : ""}${result.improvement}%p`);
    lines.push("");

    // 최적 파라미터
    lines.push("── 최적 파라미터 ──");
    for (const [key, val] of Object.entries(result.bestConfig.values)) {
      const delta = val - BAND.base;
      const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "─";
      const param = ENGINE_PARAMS.find((p) => `${p.engine}.${p.param}` === key);
      const actual = param ? bandToActual(param, val) : "?";
      lines.push(`  ${key}: ${val.toFixed(3)} ${arrow} (실제: ${actual})`);
    }
    lines.push("");

    // 민감도
    lines.push("── 파라미터 민감도 (영향도 순) ──");
    const sorted = [...result.sensitivity].sort((a, b) => b.impact - a.impact);
    for (const s of sorted) {
      const bar = "█".repeat(Math.round(s.impact));
      lines.push(`  ${s.engine}.${s.param}: ${s.impact}%p ${bar} (최적: ${s.optimalBand.toFixed(3)})`);
    }
    lines.push("");

    // 추천
    lines.push("── 추천 ──");
    for (const rec of result.bestSummary.recommendations) {
      lines.push(`  ${rec}`);
    }

    return lines.join("\n");
  }

  // --- 내부 ---

  private makeConfig(bandVal: number): BandConfig {
    const values: Record<string, number> = {};
    for (const param of ENGINE_PARAMS) {
      values[`${param.engine}.${param.param}`] = bandVal;
    }
    return { values };
  }

  /**
   * 밴드 설정으로 시뮬레이션 실행.
   * [확인 필요] 현재 구현에서는 밴드 값을 기록만 하고,
   * 실제 엔진 파라미터 주입은 .noa 파일 수준에서 이루어짐.
   * 향후 런타임 파라미터 오버라이드를 지원하면 직접 주입 가능.
   */
  private evaluate(config: BandConfig): SimSummary {
    // 현재는 기본 프리셋으로 시뮬 실행 (파라미터 오버라이드 미적용)
    // → 밴드 값에 따른 결과 차이는 프리셋 .noa에 반영해야 함
    return this.simulator.runAll(this.presetIds);
  }
}

// --- 유틸 ---

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * 빠른 밴드 조회: 현재 엔진 파라미터가 밴드 내에 있는지 확인.
 */
export function checkBandCompliance(
  currentValues: Record<string, number>
): Array<{ key: string; value: number; inBand: boolean; deviation: number }> {
  return Object.entries(currentValues).map(([key, value]) => {
    const param = ENGINE_PARAMS.find((p) => `${p.engine}.${p.param}` === key);
    if (!param) {
      return { key, value, inBand: false, deviation: 0 };
    }
    const bandVal = actualToBand(param, value);
    const inBand = bandVal >= BAND.lower && bandVal <= BAND.upper;
    const deviation = Math.abs(bandVal - BAND.base);
    return { key, value, inBand, deviation };
  });
}
