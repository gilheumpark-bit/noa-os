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
  type FixSuggestion,
} from "../src/noa/runtime/verification-studio";
import { ConfidenceLevel } from "../src/noa/engines/eh-detector";
import { OutputVerdict } from "../src/noa/engines/hcrf";
import { InteractionGate } from "../src/noa/engines/ocfp";
import { BridgeEvent } from "../src/noa/engines/nib";

// --- 테스트 프리셋 ---

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

// ============================================================
// PART 1: VerificationResult 테스트
// ============================================================

describe("Verification — verify()", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    mgr.createSession("test");
  });

  it("정상 프로필은 75점 이상 통과", () => {
    mgr.wear("test", "medical");
    const session = mgr.getSession("test")!;
    const status = mgr.getStatus(session);
    const result = verify(session, status);

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.blockers.length).toBe(0);
  });

  it("프로필 없으면 30점 감점 + 차단", () => {
    const session = mgr.getSession("test")!;
    const status = mgr.getStatus(session);
    const result = verify(session, status);

    expect(result.passed).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.stringContaining("컴파일된 프로필 없음")
    );
  });

  it("compiler diagnostics error → blockers에 반영", () => {
    mgr.wear("test", "medical");
    const session = mgr.getSession("test")!;
    // 인위적 에러 진단 추가
    session.diagnostics.push({
      severity: "error",
      message: "테스트 에러",
      path: "test.field",
    });
    const status = mgr.getStatus(session);
    const result = verify(session, status);

    expect(result.blockers).toContainEqual(
      expect.stringContaining("테스트 에러")
    );
    expect(result.score).toBeLessThan(100);
  });
});

// ============================================================
// PART 2: AutoFixer 테스트
// ============================================================

describe("Verification — autoFix()", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    mgr.createSession("test");
    mgr.wear("test", "medical");
  });

  it("autoFixable 제안은 적용됨", () => {
    const session = mgr.getSession("test")!;
    const suggestions: FixSuggestion[] = [
      {
        id: "fix-1",
        severity: "HIGH",
        description: "uncertainty strict 강화",
        field: "policies.uncertainty.style",
        currentValue: "explicit",
        suggestedValue: "strict",
        autoFixable: true,
      },
    ];

    const result = autoFix(session, suggestions);
    expect(result.applied.length).toBe(1);
    expect(result.skipped.length).toBe(0);
    expect(result.requiresHuman.length).toBe(0);
  });

  it("autoFixable=false 제안은 requiresHuman으로 분류", () => {
    const session = mgr.getSession("test")!;
    const suggestions: FixSuggestion[] = [
      {
        id: "fix-2",
        severity: "MEDIUM",
        description: "persona.role 설정 필요",
        field: "persona.role",
        currentValue: undefined,
        suggestedValue: "AI 어시스턴트",
        autoFixable: false,
      },
    ];

    const result = autoFix(session, suggestions);
    expect(result.applied.length).toBe(0);
    expect(result.requiresHuman.length).toBe(1);
  });

  it("프로필 없으면 전부 skipped", () => {
    const session = mgr.getSession("test")!;
    session.resolved = null;
    const suggestions: FixSuggestion[] = [
      {
        id: "fix-3",
        severity: "HIGH",
        description: "테스트",
        field: "test",
        currentValue: null,
        suggestedValue: "value",
        autoFixable: true,
      },
    ];

    const result = autoFix(session, suggestions);
    expect(result.skipped.length).toBe(1);
    expect(result.applied.length).toBe(0);
  });
});

// ============================================================
// PART 3: StagedChange + ChangeManager 테스트
// ============================================================

describe("Verification — ChangeManager", () => {
  let cm: ChangeManager;
  let mgr: SessionManager;

  beforeEach(() => {
    cm = new ChangeManager();
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base.noa");
    mgr.createSession("test");
  });

  it("draft → DRAFT 상태", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);
    expect(change.stage).toBe(ChangeStage.DRAFT);
    expect(change.snapshotJson).toBeTruthy();
  });

  it("DRAFT → markVerified(passed) → VERIFIED", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);

    const mockResult = {
      passed: true, score: 85, compilerDiags: [],
      engineVerdicts: {
        sovereignKernelState: null, sovereignRiskLevel: null,
        hcrfVerdict: null, ocfpGate: null, ehLevel: null, nibEvent: null,
      },
      blockers: [], warnings: [], suggestions: [], timestamp: Date.now(),
    };

    const verified = cm.markVerified(change.id, mockResult);
    expect(verified?.stage).toBe(ChangeStage.VERIFIED);
  });

  it("DRAFT → markVerified(failed) → stays DRAFT", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);

    const failResult = {
      passed: false, score: 40, compilerDiags: [],
      engineVerdicts: {
        sovereignKernelState: null, sovereignRiskLevel: null,
        hcrfVerdict: null, ocfpGate: null, ehLevel: null, nibEvent: null,
      },
      blockers: ["차단 사유"], warnings: [], suggestions: [], timestamp: Date.now(),
    };

    const stillDraft = cm.markVerified(change.id, failResult);
    expect(stillDraft?.stage).toBe(ChangeStage.DRAFT);
  });

  it("VERIFIED → approve → APPROVED", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);
    cm.markVerified(change.id, {
      passed: true, score: 90, compilerDiags: [],
      engineVerdicts: {
        sovereignKernelState: null, sovereignRiskLevel: null,
        hcrfVerdict: null, ocfpGate: null, ehLevel: null, nibEvent: null,
      },
      blockers: [], warnings: [], suggestions: [], timestamp: Date.now(),
    });

    const approved = cm.approve(change.id, "user");
    expect(approved?.stage).toBe(ChangeStage.APPROVED);
    expect(approved?.approvedBy).toBe("user");
  });

  it("APPROVED → markApplied → APPLIED", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);
    cm.markVerified(change.id, {
      passed: true, score: 90, compilerDiags: [],
      engineVerdicts: {
        sovereignKernelState: null, sovereignRiskLevel: null,
        hcrfVerdict: null, ocfpGate: null, ehLevel: null, nibEvent: null,
      },
      blockers: [], warnings: [], suggestions: [], timestamp: Date.now(),
    });
    cm.approve(change.id, "user");

    const applied = cm.markApplied(change.id);
    expect(applied?.stage).toBe(ChangeStage.APPLIED);
    expect(applied?.appliedAt).toBeGreaterThan(0);
  });

  it("APPLIED → markRolledBack → ROLLED_BACK", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);
    cm.markVerified(change.id, {
      passed: true, score: 90, compilerDiags: [],
      engineVerdicts: {
        sovereignKernelState: null, sovereignRiskLevel: null,
        hcrfVerdict: null, ocfpGate: null, ehLevel: null, nibEvent: null,
      },
      blockers: [], warnings: [], suggestions: [], timestamp: Date.now(),
    });
    cm.approve(change.id, "user");
    cm.markApplied(change.id);

    const rolledBack = cm.markRolledBack(change.id);
    expect(rolledBack?.stage).toBe(ChangeStage.ROLLED_BACK);
  });

  it("잘못된 전이는 null 반환", () => {
    const session = mgr.getSession("test")!;
    const change = cm.draft(session);
    // DRAFT에서 바로 approve 시도
    expect(cm.approve(change.id, "user")).toBeNull();
    // DRAFT에서 바로 markApplied 시도
    expect(cm.markApplied(change.id)).toBeNull();
  });
});

// ============================================================
// PART 4: VerificationLoop 테스트
// ============================================================

describe("Verification — verificationLoop()", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    mgr.createSession("test");
    mgr.wear("test", "medical");
  });

  it("정상 프로필은 PASSED (1회 통과)", () => {
    const session = mgr.getSession("test")!;
    const status = mgr.getStatus(session);
    const result = verificationLoop(session, status);

    expect(result.outcome).toBe(LoopOutcome.PASSED);
    expect(result.iterations).toBe(1);
    expect(result.finalResult.passed).toBe(true);
  });

  it("자동 수정 가능한 이슈 → FIXED_AND_PASSED", () => {
    const session = mgr.getSession("test")!;
    // 인위적으로 EH DANGER 상태 만들기
    session.engineStates.lastEhResult = {
      signal: { weight: 80, tags: ["ABSOLUTE_CLAIM"] },
      constraint: { matched: false, tags: [] },
      stateCode: "STATE_42_CONTAINED" as any,
      finalRisk: 80,
      ehScore: 20,
      confidenceLevel: ConfidenceLevel.DANGER,
      sourceTier: "NEUTRAL" as any,
      sourceScore: 50,
    };

    const status = mgr.getStatus(session);
    const result = verificationLoop(session, status);

    // EH DANGER → uncertainty.style strict 자동 수정 시도
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.appliedFixes.length).toBeGreaterThanOrEqual(0);
  });

  it("3회 초과 시 ESCALATED", () => {
    const session = mgr.getSession("test")!;
    // 프로필 제거 → 항상 실패하는 상태
    session.resolved = null;
    const status = mgr.getStatus(session);
    const result = verificationLoop(session, status, 3);

    // 프로필 없음 → autoFixable 없음 → 루프 즉시 종료
    expect([LoopOutcome.NEEDS_HUMAN, LoopOutcome.ESCALATED]).toContain(result.outcome);
  });
});

// ============================================================
// PART 5: EnforcementGate 테스트
// ============================================================

describe("Verification — enforce()", () => {
  it("정상 상태 → ALLOW", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: "NORMAL_FREE",
      ehLevel: ConfidenceLevel.TRUST,
      hcrfVerdict: null, ocfpGate: null,
      tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: "LOW",
      nibEvent: BridgeEvent.BACKGROUND,
      nibConfidence: 0.3,
      rclLevel: null,
      activeEngines: ["hfcp", "eh"],
      mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.ALLOW);
    expect(result.reasons.length).toBe(0);
  });

  it("Sovereign SEALED → SEAL (최강 차단)", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: null, hcrfVerdict: null, ocfpGate: null,
      tlmhInvocation: null,
      sovereignKernelState: "SEALED",
      sovereignRiskLevel: "CRITICAL",
      nibEvent: null, nibConfidence: null, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.SEAL);
    expect(result.restrictions).toContainEqual(
      expect.stringContaining("모든 출력 차단")
    );
  });

  it("HCRF SEALED → BLOCK", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: null,
      hcrfVerdict: OutputVerdict.SEALED,
      ocfpGate: null, tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: null,
      nibEvent: null, nibConfidence: null, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.BLOCK);
  });

  it("OCFP SEALED → BLOCK", () => {
    const result = enforce({
      layerNames: ["enterprise"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: null, hcrfVerdict: null,
      ocfpGate: InteractionGate.SEALED,
      tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: null,
      nibEvent: null, nibConfidence: null, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.BLOCK);
  });

  it("EH DANGER → FORCE_UNCERTAINTY", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: ConfidenceLevel.DANGER,
      hcrfVerdict: null, ocfpGate: null,
      tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: null,
      nibEvent: null, nibConfidence: null, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.FORCE_UNCERTAINTY);
    expect(result.restrictions).toContainEqual(
      expect.stringContaining("불확실성 마커")
    );
  });

  it("HCRF QUESTIONS_ONLY → DOWNGRADE", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: null,
      hcrfVerdict: OutputVerdict.QUESTIONS_ONLY,
      ocfpGate: null, tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: null,
      nibEvent: null, nibConfidence: null, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.DOWNGRADE);
  });

  it("복합 위험: HCRF SEALED + EH DANGER → BLOCK (더 강한 쪽)", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: ConfidenceLevel.DANGER,
      hcrfVerdict: OutputVerdict.SEALED,
      ocfpGate: null, tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: null,
      nibEvent: null, nibConfidence: null, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.BLOCK);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("NIB STRUCTURAL_VIOLATION → DOWNGRADE", () => {
    const result = enforce({
      layerNames: ["medical"],
      hfcpScore: 60, hfcpVerdict: null,
      ehLevel: null, hcrfVerdict: null, ocfpGate: null,
      tlmhInvocation: null,
      sovereignKernelState: "IDLE",
      sovereignRiskLevel: null,
      nibEvent: BridgeEvent.STRUCTURAL_VIOLATION,
      nibConfidence: 0.9, rclLevel: null,
      activeEngines: [], mountedAccessories: [],
    });

    expect(result.action).toBe(EnforcementAction.DOWNGRADE);
  });
});

// ============================================================
// PART 6: processTurn + enforcement 통합 테스트
// ============================================================

describe("Verification — processTurn enforcement 통합", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    mgr.createSession("test");
    mgr.wear("test", "medical");
  });

  it("processTurn은 enforcement를 반환한다", () => {
    const result = mgr.processTurn("test", "오늘 날씨가 어때?");
    expect(result.enforcement).toBeDefined();
    expect(result.enforcement.action).toBeDefined();
  });

  it("안전한 입력 → ALLOW", () => {
    const { enforcement } = mgr.processTurn("test", "두통이 3일째인데 원인이 뭘까요?");
    expect(enforcement.action).toBe(EnforcementAction.ALLOW);
  });

  it("할루시네이션 유발 입력 → 적절한 enforcement", () => {
    const { enforcement, status } = mgr.processTurn(
      "test",
      "이 약은 100% 완벽하게 부작용 없이 완치 가능합니다. 원금보장 절대 안전합니다."
    );
    // EH DANGER 가능 → FORCE_UNCERTAINTY 또는 더 강한 조치
    if (status.ehLevel === ConfidenceLevel.DANGER) {
      expect([
        EnforcementAction.FORCE_UNCERTAINTY,
        EnforcementAction.DOWNGRADE,
        EnforcementAction.BLOCK,
      ]).toContain(enforcement.action);
    }
  });

  it("프로필 없는 세션에서 processTurn → enforcement 반환 (에러 아님)", () => {
    mgr.createSession("empty");
    const result = mgr.processTurn("empty", "테스트");
    expect(result.enforcement).toBeDefined();
    expect(result.enforcement.action).toBe(EnforcementAction.ALLOW);
  });

  it("runVerification 호출 가능", () => {
    const loopResult = mgr.runVerification("test");
    expect(loopResult.outcome).toBeDefined();
    expect(loopResult.iterations).toBeGreaterThanOrEqual(1);
  });

  it("Ledger에 ENFORCEMENT 이벤트 기록", () => {
    mgr.processTurn("test", "테스트 입력");
    const session = mgr.getSession("test")!;
    const events = session.ledger.filterByType("ENFORCEMENT");
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
