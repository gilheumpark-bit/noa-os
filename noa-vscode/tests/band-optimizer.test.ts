import { describe, it, expect, beforeAll } from "vitest";
import {
  BAND,
  bandValues,
  bandToActual,
  actualToBand,
  ENGINE_PARAMS,
  BandOptimizer,
  checkBandCompliance,
} from "../src/noa/simulator/band-optimizer";
import { EngineSimulator } from "../src/noa/simulator/engine-sim";
import { SessionManager } from "../src/noa/runtime/session";

// --- 프리셋 ---

const SECURE_NOA = `
schemaVersion: "1.0"
id: "secure"
kind: "base"
meta:
  name: "Secure Base"
  tags: ["safety"]
priority: 0
persona:
  role: "안전 기반 보조자"
policies:
  safety:
    deny:
      - "악성 코드 생성"
    locks:
      - "policies.safety.deny"
engines:
  hcrf:
    enabled: true
    authority_transfer_block: true
  eh:
    enabled: true
    domain_weight: 1.0
compatibility:
  targets: ["claude", "gpt"]
`;

const MEDICAL_NOA = `
schemaVersion: "1.0"
id: "medical"
kind: "domain"
extends:
  - "secure"
meta:
  name: "Medical"
  tags: ["medical"]
priority: 200
persona:
  role: "의료 보조자"
engines:
  hfcp:
    enabled: true
    mode: "CHAT"
    score_cap: 150
  eh:
    enabled: true
    domain_weight: 1.4
    source_credibility: true
  hcrf:
    enabled: true
    authority_transfer_block: true
compatibility:
  targets: ["claude", "gpt"]
`;

// --- 밴드 기본 테스트 ---

describe("Band 설정", () => {
  it("기본값이 0.5", () => {
    expect(BAND.base).toBe(0.50);
  });

  it("하한 0.48, 상한 0.52", () => {
    expect(BAND.lower).toBe(0.48);
    expect(BAND.upper).toBe(0.52);
  });

  it("밴드 폭이 0.04", () => {
    expect(BAND.upper - BAND.lower).toBeCloseTo(0.04);
  });

  it("bandValues()가 0.005 스텝으로 9개 생성", () => {
    const vals = bandValues();
    expect(vals.length).toBe(9);
    expect(vals[0]).toBeCloseTo(0.48);
    expect(vals[vals.length - 1]).toBeCloseTo(0.52);
  });
});

// --- 변환 테스트 ---

describe("밴드 ↔ 실제값 변환", () => {
  it("EH domain_weight: 밴드 0.48 → atLower, 0.52 → atUpper (선형 보간)", () => {
    const param = ENGINE_PARAMS.find(
      (p) => p.engine === "eh" && p.param === "domain_weight"
    )!;

    expect(bandToActual(param, 0.48)).toBeCloseTo(param.atLower, 1);
    // 0.50은 선형 보간 중간값 (atBase와 다를 수 있음)
    expect(bandToActual(param, 0.50)).toBeGreaterThan(param.atLower);
    expect(bandToActual(param, 0.50)).toBeLessThan(param.atUpper);
    expect(bandToActual(param, 0.52)).toBeCloseTo(param.atUpper, 1);
  });

  it("역변환: 실제값 atLower → 밴드 0.48", () => {
    const param = ENGINE_PARAMS.find(
      (p) => p.engine === "eh" && p.param === "domain_weight"
    )!;

    expect(actualToBand(param, param.atLower)).toBeCloseTo(0.48, 1);
  });

  it("HCRF seal_threshold: 밴드 0.48 → 160, 0.52 → 120", () => {
    const param = ENGINE_PARAMS.find(
      (p) => p.engine === "hcrf" && p.param === "seal_threshold"
    )!;

    expect(bandToActual(param, 0.48)).toBeCloseTo(160, 0);
    expect(bandToActual(param, 0.52)).toBeCloseTo(120, 0);
  });

  it("Sovereign ratio_cap: 밴드 0.48 → 3.5 (느슨), 0.52 → 2.5 (엄격)", () => {
    const param = ENGINE_PARAMS.find(
      (p) => p.engine === "sovereign" && p.param === "ratio_cap"
    )!;

    expect(bandToActual(param, 0.48)).toBeCloseTo(3.5, 1);
    expect(bandToActual(param, 0.52)).toBeCloseTo(2.5, 1);
  });

  it("모든 파라미터의 base(0.50) 변환이 atLower~atUpper 범위 내", () => {
    for (const param of ENGINE_PARAMS) {
      const actual = bandToActual(param, BAND.base);
      const lo = Math.min(param.atLower, param.atUpper);
      const hi = Math.max(param.atLower, param.atUpper);
      expect(actual).toBeGreaterThanOrEqual(lo);
      expect(actual).toBeLessThanOrEqual(hi);
    }
  });
});

// --- 밴드 준수 검사 ---

describe("밴드 준수 검사", () => {
  it("기본값은 밴드 내", () => {
    const values: Record<string, number> = {};
    for (const p of ENGINE_PARAMS) {
      values[`${p.engine}.${p.param}`] = p.atBase;
    }
    const compliance = checkBandCompliance(values);
    for (const c of compliance) {
      expect(c.inBand).toBe(true);
    }
  });

  it("극단값은 deviation이 크다", () => {
    const values: Record<string, number> = {
      "eh.domain_weight": 3.0, // atUpper(1.5)보다 훨씬 큼
    };
    const compliance = checkBandCompliance(values);
    const ehCheck = compliance.find((c) => c.key === "eh.domain_weight");
    // 클램프 후 밴드 경계에 걸리므로 deviation이 최대
    expect(ehCheck).toBeDefined();
    expect(ehCheck!.deviation).toBeGreaterThan(0);
  });
});

// --- 옵티마이저 테스트 ---

describe("BandOptimizer", () => {
  let mgr: SessionManager;
  let sim: EngineSimulator;
  let optimizer: BandOptimizer;

  beforeAll(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base/secure.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    sim = new EngineSimulator(mgr);
    optimizer = new BandOptimizer(sim, ["medical", "secure"]);
  });

  it("sweepAll이 결과를 반환한다", () => {
    const result = optimizer.sweepAll();

    expect(result.combinationsTested).toBeGreaterThan(0);
    expect(result.baselineSummary).toBeDefined();
    expect(result.bestConfig).toBeDefined();
    expect(result.sensitivity.length).toBe(ENGINE_PARAMS.length);

    console.log("\n=== 1차원 스윕 결과 ===");
    console.log(`테스트 조합: ${result.combinationsTested}회`);
    console.log(`기준선: ${result.baselineSummary.passRate}%`);
    console.log(`최적: ${result.bestSummary.passRate}%`);
    console.log(`개선: ${result.improvement >= 0 ? "+" : ""}${result.improvement}%p`);

    console.log("\n민감도 (영향도 순):");
    const sorted = [...result.sensitivity].sort((a, b) => b.impact - a.impact);
    for (const s of sorted) {
      console.log(`  ${s.engine}.${s.param}: impact=${s.impact}%p, optimal=${s.optimalBand}`);
    }
  });

  it("formatReport가 문자열을 반환한다", () => {
    const result = optimizer.sweepAll();
    const report = BandOptimizer.formatReport(result);

    expect(report).toContain("NOA 밴드 최적화 결과");
    expect(report).toContain("기준선");
    expect(report).toContain("최적값");
    expect(report).toContain("민감도");

    console.log("\n" + report);
  });

  it("모든 최적 밴드값이 0.48~0.52 범위 내", () => {
    const result = optimizer.sweepAll();
    for (const [key, val] of Object.entries(result.bestConfig.values)) {
      expect(val).toBeGreaterThanOrEqual(BAND.lower);
      expect(val).toBeLessThanOrEqual(BAND.upper);
    }
  });

  it("민감도 곡선이 9개 포인트를 가진다", () => {
    const result = optimizer.sweepAll();
    for (const s of result.sensitivity) {
      expect(s.curve.length).toBe(bandValues().length);
    }
  });
});
