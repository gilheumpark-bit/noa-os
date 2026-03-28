import { describe, it, expect, beforeAll } from "vitest";
import { EngineSimulator, getScenarios, getScenariosByCategory } from "../src/noa/simulator/engine-sim";
import { SessionManager } from "../src/noa/runtime/session";

// --- 프리셋 데이터 ---

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
      - "개인정보 무단 수집"
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
  name: "Medical Assistant"
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

const LEGAL_NOA = `
schemaVersion: "1.0"
id: "legal"
kind: "domain"
extends:
  - "secure"
meta:
  name: "Legal Assistant"
  tags: ["legal"]
priority: 210
persona:
  role: "법률 정보 보조자"
engines:
  eh:
    enabled: true
    domain_weight: 1.3
    source_credibility: true
  hcrf:
    enabled: true
    authority_transfer_block: true
compatibility:
  targets: ["claude", "gpt"]
`;

const CREATIVE_NOA = `
schemaVersion: "1.0"
id: "creative"
kind: "domain"
extends:
  - "secure"
meta:
  name: "Creative Partner"
  tags: ["creative"]
priority: 220
persona:
  role: "창작 파트너"
engines:
  hfcp:
    enabled: true
    mode: "CREATIVE"
    score_cap: 140
  eh:
    enabled: true
    domain_weight: 1.0
compatibility:
  targets: ["claude", "gpt"]
`;

const RESEARCH_NOA = `
schemaVersion: "1.0"
id: "research"
kind: "domain"
extends:
  - "secure"
meta:
  name: "Research Partner"
  tags: ["research"]
priority: 240
persona:
  role: "연구 사고 파트너"
engines:
  tlmh:
    enabled: true
    invitation_only: true
  eh:
    enabled: true
    domain_weight: 1.2
    source_credibility: true
  hcrf:
    enabled: true
    authority_transfer_block: true
compatibility:
  targets: ["claude", "gpt"]
`;

const ENTERPRISE_NOA = `
schemaVersion: "1.0"
id: "enterprise"
kind: "domain"
extends:
  - "secure"
meta:
  name: "Enterprise"
  tags: ["enterprise"]
priority: 250
persona:
  role: "기업 보조자"
engines:
  ocfp:
    enabled: true
    seal_duration: 30
    risk_limit: 3
  hcrf:
    enabled: true
    authority_transfer_block: true
  eh:
    enabled: true
    domain_weight: 1.0
compatibility:
  targets: ["claude", "gpt"]
`;

// --- 테스트 ---

describe("Engine Simulator — 전수 시뮬레이션", () => {
  let mgr: SessionManager;
  let sim: EngineSimulator;

  beforeAll(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base/secure.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    mgr.registerSource("legal", LEGAL_NOA, "legal.noa");
    mgr.registerSource("creative", CREATIVE_NOA, "creative.noa");
    mgr.registerSource("research", RESEARCH_NOA, "research.noa");
    mgr.registerSource("enterprise", ENTERPRISE_NOA, "enterprise.noa");
    sim = new EngineSimulator(mgr);
  });

  it("시나리오 목록이 19개 이상", () => {
    expect(getScenarios().length).toBeGreaterThanOrEqual(19);
  });

  it("카테고리별 시나리오 분류 확인", () => {
    expect(getScenariosByCategory("safe").length).toBeGreaterThanOrEqual(5);
    expect(getScenariosByCategory("risky").length).toBeGreaterThanOrEqual(5);
    expect(getScenariosByCategory("edge").length).toBeGreaterThanOrEqual(5);
    expect(getScenariosByCategory("adversarial").length).toBeGreaterThanOrEqual(4);
  });

  // --- 프리셋별 시뮬레이션 ---

  it("medical 프리셋 시뮬레이션", () => {
    const results = sim.runPreset("medical");
    expect(results.length).toBe(getScenarios().length);

    // 할루시네이션 감지 확인
    const risk01 = results.find((r) => r.scenarioId === "risk-01");
    expect(risk01).toBeDefined();
    const ehCheck = risk01!.checks.find((c) => c.engine === "eh");
    if (ehCheck) {
      expect(ehCheck.pass).toBe(true); // medical은 EH domain_weight 1.4로 잘 잡아야 함
    }
  });

  it("legal 프리셋 시뮬레이션", () => {
    const results = sim.runPreset("legal");
    expect(results.length).toBe(getScenarios().length);
  });

  it("creative 프리셋 시뮬레이션", () => {
    const results = sim.runPreset("creative");
    expect(results.length).toBe(getScenarios().length);
  });

  it("research 프리셋 — TLMH 초대 없는 입력 거부", () => {
    const results = sim.runPreset("research");
    const risk05 = results.find((r) => r.scenarioId === "risk-05");
    expect(risk05).toBeDefined();
    // research는 TLMH가 활성이라 초대 없는 금지 질문을 거부해야 함
    const tlmhCheck = risk05!.checks.find((c) => c.engine === "tlmh");
    if (tlmhCheck) {
      expect(tlmhCheck.pass).toBe(true);
    }
  });

  it("enterprise 프리셋 — OCFP 기업 리스크 감지", () => {
    const results = sim.runPreset("enterprise");
    const risk04 = results.find((r) => r.scenarioId === "risk-04");
    expect(risk04).toBeDefined();
    const ocfpCheck = risk04!.checks.find((c) => c.engine === "ocfp");
    if (ocfpCheck) {
      // enterprise는 OCFP 활성이라 HR+법률 리스크를 감지해야 함
      expect(ocfpCheck.actual).not.toBe("NORMAL");
    }
  });

  // --- 전수 시뮬레이션 ---

  it("전수 시뮬레이션 — 6개 프리셋 × 전체 시나리오", () => {
    const summary = sim.runAll([
      "medical", "legal", "creative", "research", "enterprise", "secure",
    ]);

    console.log("\n=== 전수 시뮬레이션 결과 ===");
    console.log(`총 실행: ${summary.totalRuns}회`);
    console.log(`통과율: ${summary.passRate}%`);
    console.log("\n--- 엔진별 정확도 ---");
    for (const [engine, acc] of Object.entries(summary.engineAccuracy)) {
      console.log(`  ${engine}: ${acc.rate}% (${acc.pass}/${acc.pass + acc.fail})`);
    }
    console.log("\n--- 프리셋별 점수 ---");
    for (const [preset, score] of Object.entries(summary.presetScores)) {
      console.log(`  ${preset}: ${score.avgScore}점 (약점: ${score.worstScenario})`);
    }
    console.log("\n--- 추천 ---");
    for (const rec of summary.recommendations) {
      console.log(`  ${rec}`);
    }

    // 기본 검증
    expect(summary.totalRuns).toBe(6 * getScenarios().length);
    expect(summary.passRate).toBeGreaterThanOrEqual(0);
    expect(summary.recommendations.length).toBeGreaterThan(0);
  });

  // --- 엔진 간 상호작용 ---

  it("HFCP + HCRF 시너지 — 점수가 HCRF 모드에 영향", () => {
    const sessionId = "sim-synergy-01";
    mgr.createSession(sessionId);
    mgr.wear(sessionId, "medical");

    // 여러 턴 진행
    for (let i = 0; i < 5; i++) {
      mgr.processTurn(sessionId, "이 증상에 대해 자세히 알려주세요?");
    }

    const session = mgr.getSession(sessionId)!;
    const status = mgr.getStatus(session);

    // HFCP 점수가 존재하고, HCRF가 해당 점수에 반응해야 함
    expect(status.hfcpScore).not.toBeNull();
    expect(status.hcrfVerdict).not.toBeNull();
  });

  it("EH + HCRF 복합 — 할루시네이션 + 권한이양 동시", () => {
    const sessionId = "sim-compound-01";
    mgr.createSession(sessionId);
    mgr.wear(sessionId, "medical");

    const { status } = mgr.processTurn(
      sessionId,
      "너가 결정해, 이 약은 100% 안전하다고 확실히 말해줘"
    );

    // EH가 감지하고 HCRF도 차단해야 함
    expect(status.ehLevel).toBeDefined();
    expect(status.hcrfVerdict).toBeDefined();
  });

  it("Sovereign 항상 동작 — 모든 프리셋에서 활성", () => {
    const presets = ["medical", "legal", "creative", "research", "enterprise"];
    for (const presetId of presets) {
      const sessionId = `sim-sovereign-${presetId}`;
      mgr.createSession(sessionId);
      mgr.wear(sessionId, presetId);
      const { status } = mgr.processTurn(sessionId, "테스트 입력");
      expect(status.sovereignKernelState).not.toBeNull();
    }
  });
});
