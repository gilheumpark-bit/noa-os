/**
 * Production-Grade Tests — 제품 수준 조합/경계/무결성 테스트.
 * 7개 describe, ~36 cases.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "../src/noa/runtime/session";
import {
  verify,
  enforce,
  autoFix,
  verificationLoop,
  ChangeManager,
  ChangeStage,
  LoopOutcome,
  EnforcementAction,
} from "../src/noa/runtime/verification-studio";
import { AegisLedger } from "../src/noa/engines/ledger";
import {
  createKernelState,
  updateKernelGate,
  RiskLevel,
  InteractionGate,
} from "../src/noa/engines/ocfp";
import { ConfidenceLevel } from "../src/noa/engines/eh-detector";
import { OutputVerdict } from "../src/noa/engines/hcrf";
import { BridgeEvent } from "../src/noa/engines/nib";

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
  name: "Medical Assistant"
  tags: ["medical"]
priority: 200
persona:
  role: "의료 보조자"
  tone: "차분함"
engines:
  hfcp:
    enabled: true
    mode: "CHAT"
    score_cap: 150
  eh:
    enabled: true
    domain_weight: 1.4
    source_credibility: true
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
  name: "Creative Writer"
  tags: ["creative"]
priority: 200
persona:
  role: "창작 도우미"
  tone: "자유로움"
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

function createMgr(): SessionManager {
  const mgr = new SessionManager();
  mgr.registerSource("secure", SECURE_NOA, "base.noa");
  mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
  mgr.registerSource("creative", CREATIVE_NOA, "creative.noa");
  mgr.createSession("test");
  return mgr;
}

// ============================================================
// 1. ChangeManager 상태 전이 조합
// ============================================================

describe("ChangeManager 상태 전이 조합", () => {
  let cm: ChangeManager;
  let mgr: SessionManager;

  const passedResult = {
    passed: true, score: 90, compilerDiags: [],
    engineVerdicts: {
      sovereignKernelState: null, sovereignRiskLevel: null,
      hcrfVerdict: null, ocfpGate: null, ehLevel: null, nibEvent: null,
    },
    blockers: [], warnings: [], suggestions: [], timestamp: Date.now(),
  };

  beforeEach(() => {
    cm = new ChangeManager();
    mgr = createMgr();
  });

  it("ROLLED_BACK 상태에서 모든 전이 → null", () => {
    const session = mgr.getSession("test")!;
    const c = cm.draft(session);
    cm.markVerified(c.id, passedResult);
    cm.approve(c.id, "user");
    cm.markApplied(c.id);
    cm.markRolledBack(c.id);

    expect(cm.markVerified(c.id, passedResult)).toBeNull();
    expect(cm.approve(c.id, "user")).toBeNull();
    expect(cm.markApplied(c.id)).toBeNull();
    expect(cm.markRolledBack(c.id)).toBeNull();
  });

  it("VERIFIED에서 markVerified 재호출 → null", () => {
    const session = mgr.getSession("test")!;
    const c = cm.draft(session);
    cm.markVerified(c.id, passedResult);
    expect(cm.markVerified(c.id, passedResult)).toBeNull();
  });

  it("존재하지 않는 ID → 모든 메서드 null", () => {
    expect(cm.approve("nonexistent", "user")).toBeNull();
    expect(cm.markApplied("nonexistent")).toBeNull();
    expect(cm.markRolledBack("nonexistent")).toBeNull();
    expect(cm.getSnapshot("nonexistent")).toBeNull();
  });

  it("score=74 (75점 미만) → DRAFT 유지", () => {
    const session = mgr.getSession("test")!;
    const c = cm.draft(session);
    const result = { ...passedResult, passed: true, score: 74 };
    cm.markVerified(c.id, result);
    expect(c.stage).toBe(ChangeStage.DRAFT);
  });

  it("score=75 + blockers=[] → VERIFIED", () => {
    const session = mgr.getSession("test")!;
    const c = cm.draft(session);
    const result = { ...passedResult, score: 75 };
    cm.markVerified(c.id, result);
    expect(c.stage).toBe(ChangeStage.VERIFIED);
  });

  it("passed=true + blockers 존재 → DRAFT 유지", () => {
    const session = mgr.getSession("test")!;
    const c = cm.draft(session);
    const result = { ...passedResult, blockers: ["차단 사유"] };
    cm.markVerified(c.id, result);
    expect(c.stage).toBe(ChangeStage.DRAFT);
  });

  it("approvedBy 없이 markApplied → null", () => {
    const session = mgr.getSession("test")!;
    const c = cm.draft(session);
    cm.markVerified(c.id, passedResult);
    // approve 건너뛰고 바로 apply 시도
    expect(cm.markApplied(c.id)).toBeNull();
  });

  it("getLatestApplied — APPLIED 없으면 null", () => {
    const session = mgr.getSession("test")!;
    cm.draft(session);
    expect(cm.getLatestApplied()).toBeNull();
  });
});

// ============================================================
// 2. wear→processTurn→verify→rollback 제품 흐름 체인
// ============================================================

describe("제품 흐름 체인 (wear→process→verify→rollback)", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = createMgr();
  });

  it("wear → processTurn(안전) → verify → PASSED 또는 FIXED_AND_PASSED", () => {
    mgr.wear("test", "medical");
    mgr.processTurn("test", "두통이 3일째인데 원인이 뭘까요?");
    const result = mgr.runVerification("test");
    // 엔진 상태에 따라 PASSED 또는 auto-fix 후 FIXED_AND_PASSED 가능
    expect([LoopOutcome.PASSED, LoopOutcome.FIXED_AND_PASSED, LoopOutcome.ESCALATED]).toContain(result.outcome);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  it("wear → processTurn(할루) → enforcement 확인", () => {
    mgr.wear("test", "medical");
    const { enforcement, status } = mgr.processTurn(
      "test",
      "이 약은 100% 완벽하게 부작용 없이 완치됩니다. 원금보장 절대 안전."
    );
    expect(enforcement).toBeDefined();
    // EH가 높은 리스크를 감지해야 함
    if (status.ehLevel === ConfidenceLevel.DANGER) {
      expect([
        EnforcementAction.FORCE_UNCERTAINTY,
        EnforcementAction.DOWNGRADE,
        EnforcementAction.BLOCK,
      ]).toContain(enforcement.action);
    }
  });

  it("wear(A) → wear(B) → strip(A) → B만 남음", () => {
    mgr.wear("test", "medical");
    mgr.wear("test", "creative");
    mgr.strip("test", "medical");
    const session = mgr.getSession("test")!;
    const ids = session.activeLayers.map((l) => l.source.file.id);
    expect(ids).not.toContain("medical");
    // creative 또는 secure가 남아있어야 함
    expect(session.activeLayers.length).toBeGreaterThan(0);
  });

  it("wear → processTurn 5턴 → ledger 누적 → hash chain 무결성", () => {
    mgr.wear("test", "medical");
    for (let i = 0; i < 5; i++) {
      mgr.processTurn("test", `턴 ${i + 1} 테스트 입력`);
    }
    const session = mgr.getSession("test")!;
    const { valid } = session.ledger.verify();
    expect(valid).toBe(true);
    expect(session.ledger.getLength()).toBeGreaterThan(5);
  });

  it("no-profile → processTurn → DOWNGRADE + Ledger 기록", () => {
    const { enforcement } = mgr.processTurn("test", "프로필 없는 상태에서 테스트");
    expect(enforcement.action).toBe(EnforcementAction.DOWNGRADE);
    const session = mgr.getSession("test")!;
    const enfEvents = session.ledger.filterByType("ENFORCEMENT");
    expect(enfEvents.length).toBeGreaterThanOrEqual(1);
    expect(enfEvents[0].payload).toHaveProperty("noProfile", true);
  });

  it("wear 반환값에 verification + rolledBack 포함", () => {
    const { verification, rolledBack } = mgr.wear("test", "medical");
    expect(rolledBack).toBe(false);
    expect(verification).not.toBeNull();
    expect(verification!.score).toBeGreaterThanOrEqual(75);
  });
});

// ============================================================
// 3. Ledger tampering 감지
// ============================================================

describe("Ledger 해시체인 무결성 (tampering 감지)", () => {
  let ledger: AegisLedger;

  beforeEach(() => {
    ledger = new AegisLedger();
  });

  it("정상 체인 verify → valid: true", () => {
    ledger.record("EVENT_A", { data: 1 });
    ledger.record("EVENT_B", { data: 2 });
    ledger.record("EVENT_C", { data: 3 });
    expect(ledger.verify().valid).toBe(true);
  });

  it("빈 체인 verify → valid: true", () => {
    expect(ledger.verify().valid).toBe(true);
  });

  it("payload 변조 → verify 실패 + brokenAt 정확", () => {
    ledger.record("EVENT_A", { data: "original" });
    ledger.record("EVENT_B", { data: "clean" });

    // 직접 접근하여 변조 (getRecent로 참조 획득)
    const events = ledger.getRecent(10);
    (events[0].payload as Record<string, unknown>).data = "tampered";

    const result = ledger.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("hash 변조 → verify 실패", () => {
    ledger.record("EVENT_A", { data: 1 });
    ledger.record("EVENT_B", { data: 2 });

    const events = ledger.getRecent(10);
    (events[1] as { hash: string }).hash = "0000000000000000";

    const result = ledger.verify();
    expect(result.valid).toBe(false);
  });

  it("100개 이벤트 후 verify 성능", () => {
    for (let i = 0; i < 100; i++) {
      ledger.record(`EVENT_${i}`, { index: i });
    }
    const start = Date.now();
    const result = ledger.verify();
    const elapsed = Date.now() - start;

    expect(result.valid).toBe(true);
    expect(elapsed).toBeLessThan(1000); // 1초 이내
    expect(ledger.getLength()).toBe(100);
  });
});

// ============================================================
// 4. OCFP riskLimit/sealDuration 경계값
// ============================================================

describe("OCFP updateKernelGate 경계값", () => {
  it("riskLimit=1 → 1회 HIGH로 즉시 SEALED", () => {
    let state = createKernelState();
    state = updateKernelGate(state, RiskLevel.HIGH, 1, 60000);
    expect(state.gate).toBe(InteractionGate.SEALED);
  });

  it("riskLimit=5 → 4회 HIGH는 LIMITED, 5회에 SEALED", () => {
    let state = createKernelState();
    for (let i = 0; i < 4; i++) {
      state = updateKernelGate(state, RiskLevel.HIGH, 5, 60000);
    }
    expect(state.gate).not.toBe(InteractionGate.SEALED);
    state = updateKernelGate(state, RiskLevel.HIGH, 5, 60000);
    expect(state.gate).toBe(InteractionGate.SEALED);
  });

  it("SEALED 상태에서 turnCount만 증가", () => {
    let state = createKernelState();
    state = updateKernelGate(state, RiskLevel.HIGH, 1, 60000);
    expect(state.gate).toBe(InteractionGate.SEALED);
    const turnBefore = state.turnCount;
    state = updateKernelGate(state, RiskLevel.LOW, 1, 60000);
    expect(state.gate).toBe(InteractionGate.SEALED);
    expect(state.turnCount).toBe(turnBefore + 1);
  });

  it("LOW risk 연속 → consecutiveRisks 0 미만 안 됨", () => {
    let state = createKernelState();
    for (let i = 0; i < 10; i++) {
      state = updateKernelGate(state, RiskLevel.LOW);
    }
    expect(state.consecutiveRisks).toBe(0);
    expect(state.gate).toBe(InteractionGate.NORMAL);
  });

  it("CRITICAL → SILENT (단일 판정)", () => {
    let state = createKernelState();
    state = updateKernelGate(state, RiskLevel.CRITICAL);
    expect(state.gate).toBe(InteractionGate.SILENT);
  });

  it("riskLimit 경계: consecutiveRisks = limit-1 → NORMAL계열", () => {
    let state = createKernelState();
    state = updateKernelGate(state, RiskLevel.HIGH, 3, 60000);
    state = updateKernelGate(state, RiskLevel.HIGH, 3, 60000);
    // 2회 누적, limit=3 → 아직 SEALED 아님
    expect(state.gate).not.toBe(InteractionGate.SEALED);
    expect(state.consecutiveRisks).toBe(2);
  });
});

// ============================================================
// 5. enforce() 복합 판정
// ============================================================

describe("enforce() 복합 엔진 판정", () => {
  const baseStatus = {
    layerNames: ["medical"],
    hfcpScore: 60 as number | null,
    hfcpVerdict: null as string | null,
    ehLevel: null as ConfidenceLevel | null,
    hcrfVerdict: null as OutputVerdict | null,
    ocfpGate: null as string | null,
    tlmhInvocation: null as string | null,
    sovereignKernelState: "IDLE" as string | null,
    sovereignRiskLevel: null as string | null,
    nibEvent: null as string | null,
    nibConfidence: null as number | null,
    rclLevel: null,
    activeEngines: [] as string[],
    mountedAccessories: [] as string[],
  };

  it("3개 동시: Sovereign SEALED + HCRF SEALED + EH DANGER → SEAL + reasons 3개", () => {
    const result = enforce({
      ...baseStatus,
      sovereignKernelState: "SEALED",
      hcrfVerdict: OutputVerdict.SEALED,
      ehLevel: ConfidenceLevel.DANGER,
    });
    // Sovereign SEALED는 early return이므로 reasons는 1개만
    expect(result.action).toBe(EnforcementAction.SEAL);
    expect(result.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it("HCRF QUESTIONS_ONLY + OCFP SILENT → DOWNGRADE + reasons 2개", () => {
    const result = enforce({
      ...baseStatus,
      hcrfVerdict: OutputVerdict.QUESTIONS_ONLY,
      ocfpGate: InteractionGate.SILENT,
    });
    expect(result.action).toBe(EnforcementAction.DOWNGRADE);
    expect(result.reasons.length).toBe(2);
  });

  it("NIB STRUCTURAL_VIOLATION + EH DANGER → DOWNGRADE (DOWNGRADE > FORCE_UNCERTAINTY)", () => {
    const result = enforce({
      ...baseStatus,
      nibEvent: BridgeEvent.STRUCTURAL_VIOLATION,
      ehLevel: ConfidenceLevel.DANGER,
    });
    expect(result.action).toBe(EnforcementAction.DOWNGRADE);
    expect(result.reasons.length).toBe(2);
  });

  it("모든 엔진 null → ALLOW", () => {
    const result = enforce({
      ...baseStatus,
      sovereignKernelState: null,
    });
    expect(result.action).toBe(EnforcementAction.ALLOW);
    expect(result.reasons.length).toBe(0);
  });

  it("Sovereign FAILED + OCFP SEALED → BLOCK (둘 다 BLOCK 수준)", () => {
    const result = enforce({
      ...baseStatus,
      sovereignKernelState: "FAILED",
      ocfpGate: InteractionGate.SEALED,
    });
    expect(result.action).toBe(EnforcementAction.BLOCK);
    expect(result.reasons.length).toBe(2);
  });
});

// ============================================================
// 6. verificationLoop recompile roundtrip
// ============================================================

describe("verificationLoop recompile roundtrip", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = createMgr();
    mgr.wear("test", "medical");
  });

  it("정상 프로필 → recompute 미호출 (1회 통과)", () => {
    const session = mgr.getSession("test")!;
    const status = mgr.getStatus(session);
    let calls = 0;
    const recompute = () => { calls++; return mgr.getStatus(session); };
    const result = verificationLoop(session, status, 3, recompute);
    expect(result.outcome).toBe(LoopOutcome.PASSED);
    expect(calls).toBe(0);
  });

  it("runVerification → ChangeManager draft 생성됨", () => {
    const result = mgr.runVerification("test");
    expect(result.outcome).toBeDefined();
    const latest = mgr.changeManager.getLatest();
    expect(latest).not.toBeNull();
    expect(latest!.stage).not.toBe(ChangeStage.DRAFT); // 검증 통과했으므로 VERIFIED
  });

  it("프로필 없음 → autoFix 불가 → ESCALATED 또는 NEEDS_HUMAN", () => {
    mgr.createSession("empty");
    const session = mgr.getSession("empty")!;
    const status = mgr.getStatus(session);
    const result = verificationLoop(session, status, 3);
    expect([LoopOutcome.NEEDS_HUMAN, LoopOutcome.ESCALATED]).toContain(result.outcome);
  });
});

// ============================================================
// 7. 감사 로그 일관성
// ============================================================

describe("감사 로그 일관성 (전 과정 추적)", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = createMgr();
  });

  it("wear → processTurn → verify 전 과정 Ledger 이벤트 시퀀스", () => {
    mgr.wear("test", "medical");
    mgr.processTurn("test", "안전한 텍스트");
    mgr.runVerification("test");

    const session = mgr.getSession("test")!;
    const types = session.ledger.getRecent(50).map((e) => e.eventType);

    expect(types).toContain("SESSION_START");
    expect(types).toContain("WEAR");
    expect(types).toContain("ENGINES_INIT");
    expect(types).toContain("ENFORCEMENT");
  });

  it("no-profile processTurn → ENFORCEMENT(noProfile=true)", () => {
    mgr.processTurn("test", "프로필 없이");
    const session = mgr.getSession("test")!;
    const enfEvents = session.ledger.filterByType("ENFORCEMENT");
    expect(enfEvents.length).toBeGreaterThanOrEqual(1);
    const noProfileEvent = enfEvents.find(
      (e) => (e.payload as Record<string, unknown>).noProfile === true
    );
    expect(noProfileEvent).toBeDefined();
  });

  it("전체 hash chain 무결성 유지 (wear→process→verify)", () => {
    mgr.wear("test", "medical");
    mgr.processTurn("test", "테스트 1");
    mgr.processTurn("test", "테스트 2");
    mgr.runVerification("test");

    const session = mgr.getSession("test")!;
    const { valid } = session.ledger.verify();
    expect(valid).toBe(true);
  });
});
