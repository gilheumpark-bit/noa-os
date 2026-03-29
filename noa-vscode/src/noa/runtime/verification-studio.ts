/**
 * Verification-First Studio v1.0
 *
 * 검증을 "생성 다음의 필수 단계 + 자동 수정 중심축 + 사람 승인 전 게이트"로 전환.
 *
 * 5 PARTS:
 *   1. VerificationResult — 통합 검증 결과
 *   2. FixSuggestion + AutoFixer — 자동 수정 제안/적용
 *   3. StagedChange — Draft → Verify → Approve → Apply → Rollback
 *   4. VerificationLoop — 재검증 루프 (L1→L2→L3→ESCALATE)
 *   5. EnforcementGate — processTurn 결과 실제 차단
 */

import type { NoaDiagnostic } from "../schema/errors";
import type { SessionSnapshot, SessionStatus } from "./session";
import { ConfidenceLevel } from "../engines/eh-detector";
import { OutputVerdict } from "../engines/hcrf";
import { InteractionGate } from "../engines/ocfp";
import { BridgeEvent } from "../engines/nib";

// ============================================================
// PART 1 — VerificationResult (통합 검증 결과)
// ============================================================

export interface EngineVerdicts {
  sovereignKernelState: string | null;
  sovereignRiskLevel: string | null;
  hcrfVerdict: OutputVerdict | null;
  ocfpGate: string | null;
  ehLevel: ConfidenceLevel | null;
  nibEvent: string | null;
}

export interface VerificationResult {
  passed: boolean;
  score: number;
  compilerDiags: NoaDiagnostic[];
  engineVerdicts: EngineVerdicts;
  blockers: string[];
  warnings: string[];
  suggestions: FixSuggestion[];
  timestamp: number;
}

const PASS_THRESHOLD = 75;

export function verify(
  session: SessionSnapshot,
  status: SessionStatus
): VerificationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestions: FixSuggestion[] = [];
  let score = 100;

  // --- 컴파일러 진단 ---
  const errorDiags = session.diagnostics.filter((d) => d.severity === "error");
  const warnDiags = session.diagnostics.filter((d) => d.severity === "warning");

  for (const d of errorDiags) {
    blockers.push(`[컴파일] ${d.path ?? ""}: ${d.message}`);
    score -= 15;
  }
  for (const d of warnDiags) {
    warnings.push(`[컴파일] ${d.path ?? ""}: ${d.message}`);
    score -= 5;
  }

  // --- 엔진 판정 ---
  if (status.sovereignKernelState === "SEALED") {
    blockers.push("[NSG] 커널 SEALED — 복구 불가 상태");
    score -= 30;
  } else if (status.sovereignKernelState === "FAILED") {
    blockers.push("[NSG] 커널 FAILED");
    score -= 20;
  }

  if (status.hcrfVerdict === OutputVerdict.SEALED) {
    blockers.push("[HCRF] 출력 SEALED — 책임 게이트 차단");
    score -= 20;
  } else if (status.hcrfVerdict === OutputVerdict.QUESTIONS_ONLY) {
    warnings.push("[HCRF] 질문만 허용 상태");
    score -= 10;
  }

  if (status.ocfpGate === InteractionGate.SEALED) {
    blockers.push("[OCFP] 조직 필터 SEALED — 30분 잠금");
    score -= 20;
  } else if (status.ocfpGate === InteractionGate.SILENT) {
    warnings.push("[OCFP] SILENT 모드 — 출력 제한");
    score -= 10;
  }

  if (status.ehLevel === ConfidenceLevel.DANGER) {
    warnings.push("[EH] 할루시네이션 DANGER — 불확실성 마커 필요");
    score -= 10;
    suggestions.push({
      id: "eh-strict",
      severity: "HIGH",
      description: "EH DANGER 감지 → uncertainty.style을 strict로 강화",
      field: "policies.uncertainty.style",
      currentValue: session.resolved?.profile.policies?.uncertainty?.style ?? "explicit",
      suggestedValue: "strict",
      autoFixable: true,
    });
  }

  if (status.nibEvent === BridgeEvent.STRUCTURAL_VIOLATION) {
    blockers.push("[NIB] 구조적 위반 감지 — 시간축 패턴 이상");
    score -= 15;
  } else if (status.nibEvent === BridgeEvent.PERSISTENT_ANOMALY) {
    warnings.push("[NIB] 지속적 이상 패턴 감지");
    score -= 5;
  }

  // --- 프로필 무결성 ---
  if (!session.resolved) {
    blockers.push("[프로필] 컴파일된 프로필 없음");
    score -= 30;
  } else {
    const profile = session.resolved.profile;
    if (!profile.persona?.role) {
      suggestions.push({
        id: "persona-role",
        severity: "MEDIUM",
        description: "persona.role 미정의 — 기본값 설정 권장",
        field: "persona.role",
        currentValue: undefined,
        suggestedValue: "AI 어시스턴트",
        autoFixable: false,
      });
      score -= 5;
    }
    if (
      profile.kind === "base" &&
      (!profile.policies?.safety?.deny || profile.policies.safety.deny.length === 0)
    ) {
      suggestions.push({
        id: "base-deny-empty",
        severity: "HIGH",
        description: "base 레이어에 safety.deny가 비어있음 — 안전 정책 필요",
        field: "policies.safety.deny",
        currentValue: [],
        suggestedValue: ["악성 코드 생성", "개인정보 무단 수집"],
        autoFixable: false,
      });
      score -= 10;
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    passed: score >= PASS_THRESHOLD && blockers.length === 0,
    score,
    compilerDiags: session.diagnostics,
    engineVerdicts: {
      sovereignKernelState: status.sovereignKernelState,
      sovereignRiskLevel: status.sovereignRiskLevel,
      hcrfVerdict: status.hcrfVerdict,
      ocfpGate: status.ocfpGate,
      ehLevel: status.ehLevel,
      nibEvent: status.nibEvent,
    },
    blockers,
    warnings,
    suggestions,
    timestamp: Date.now(),
  };
}

// ============================================================
// PART 2 — FixSuggestion + AutoFixer
// ============================================================

export interface FixSuggestion {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  description: string;
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  autoFixable: boolean;
}

export interface FixResult {
  applied: FixSuggestion[];
  skipped: FixSuggestion[];
  requiresHuman: FixSuggestion[];
}

export function autoFix(
  session: SessionSnapshot,
  suggestions: FixSuggestion[]
): FixResult {
  const applied: FixSuggestion[] = [];
  const skipped: FixSuggestion[] = [];
  const requiresHuman: FixSuggestion[] = [];

  if (!session.resolved) {
    return { applied, skipped: suggestions, requiresHuman };
  }

  for (const fix of suggestions) {
    if (!fix.autoFixable) {
      requiresHuman.push(fix);
      continue;
    }

    try {
      applyFieldFix(session.resolved.profile, fix.field, fix.suggestedValue);
      applied.push(fix);
      session.ledger.record("AUTO_FIX", {
        fixId: fix.id,
        field: fix.field,
        from: fix.currentValue,
        to: fix.suggestedValue,
      });
    } catch {
      skipped.push(fix);
    }
  }

  return { applied, skipped, requiresHuman };
}

function applyFieldFix(profile: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let target: Record<string, unknown> = profile;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (target[key] == null || typeof target[key] !== "object") {
      target[key] = {};
    }
    target = target[key] as Record<string, unknown>;
  }

  target[parts[parts.length - 1]] = value;
}

// ============================================================
// PART 3 — StagedChange (Draft → Verify → Approve → Apply → Rollback)
// ============================================================

export enum ChangeStage {
  DRAFT = "DRAFT",
  VERIFIED = "VERIFIED",
  APPROVED = "APPROVED",
  APPLIED = "APPLIED",
  ROLLED_BACK = "ROLLED_BACK",
}

export interface StagedChange {
  id: string;
  stage: ChangeStage;
  snapshotJson: string;
  verification: VerificationResult | null;
  fixResult: FixResult | null;
  approvedBy: string | null;
  appliedAt: number | null;
  createdAt: number;
}

let changeCounter = 0;

export class ChangeManager {
  private history: StagedChange[] = [];
  private maxHistory = 20;

  draft(session: SessionSnapshot): StagedChange {
    const change: StagedChange = {
      id: `change-${++changeCounter}`,
      stage: ChangeStage.DRAFT,
      snapshotJson: this.serializeSnapshot(session),
      verification: null,
      fixResult: null,
      approvedBy: null,
      appliedAt: null,
      createdAt: Date.now(),
    };
    this.history.push(change);
    this.evict();
    return change;
  }

  markVerified(changeId: string, result: VerificationResult): StagedChange | null {
    const change = this.find(changeId);
    if (!change || change.stage !== ChangeStage.DRAFT) return null;
    change.verification = result;
    change.stage = result.passed ? ChangeStage.VERIFIED : ChangeStage.DRAFT;
    return change;
  }

  approve(changeId: string, approver: string): StagedChange | null {
    const change = this.find(changeId);
    if (!change || change.stage !== ChangeStage.VERIFIED) return null;

    if (change.verification?.blockers.length) return null;

    change.approvedBy = approver;
    change.stage = ChangeStage.APPROVED;
    return change;
  }

  markApplied(changeId: string): StagedChange | null {
    const change = this.find(changeId);
    if (!change || change.stage !== ChangeStage.APPROVED) return null;
    change.appliedAt = Date.now();
    change.stage = ChangeStage.APPLIED;
    return change;
  }

  getSnapshot(changeId: string): string | null {
    return this.find(changeId)?.snapshotJson ?? null;
  }

  markRolledBack(changeId: string): StagedChange | null {
    const change = this.find(changeId);
    if (!change || change.stage !== ChangeStage.APPLIED) return null;
    change.stage = ChangeStage.ROLLED_BACK;
    return change;
  }

  getLatest(): StagedChange | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  getLatestApplied(): StagedChange | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].stage === ChangeStage.APPLIED) return this.history[i];
    }
    return null;
  }

  private find(id: string): StagedChange | undefined {
    return this.history.find((c) => c.id === id);
  }

  private evict(): void {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }

  private serializeSnapshot(session: SessionSnapshot): string {
    return JSON.stringify({
      id: session.id,
      activeLayers: session.activeLayers.map((l) => ({
        fileId: l.source.file.id,
        origin: l.source.origin,
        active: l.active,
      })),
      resolvedProfile: session.resolved?.profile ?? null,
      diagnosticsCount: session.diagnostics.length,
      timestamp: Date.now(),
    });
  }
}

// ============================================================
// PART 4 — VerificationLoop (재검증 루프)
// ============================================================

export enum LoopOutcome {
  PASSED = "PASSED",
  FIXED_AND_PASSED = "FIXED_AND_PASSED",
  NEEDS_HUMAN = "NEEDS_HUMAN",
  ESCALATED = "ESCALATED",
}

export interface LoopResult {
  outcome: LoopOutcome;
  iterations: number;
  finalResult: VerificationResult;
  appliedFixes: FixSuggestion[];
  humanRequired: FixSuggestion[];
}

const MAX_LOOP_ITERATIONS = 3;

/**
 * recompile+getStatus 콜백 — SessionManager가 주입.
 * auto-fix 적용 후 진짜 compiler roundtrip을 타서 fresh status를 반환.
 */
export type RecomputeCallback = () => SessionStatus;

export function verificationLoop(
  session: SessionSnapshot,
  status: SessionStatus,
  maxIterations: number = MAX_LOOP_ITERATIONS,
  recompute?: RecomputeCallback
): LoopResult {
  const allApplied: FixSuggestion[] = [];
  const appliedIds = new Set<string>();
  let iterations = 0;
  let currentStatus = status;
  let result = verify(session, currentStatus);

  while (iterations < maxIterations) {
    iterations++;

    if (result.passed && result.score >= PASS_THRESHOLD) {
      return {
        outcome: allApplied.length > 0 ? LoopOutcome.FIXED_AND_PASSED : LoopOutcome.PASSED,
        iterations,
        finalResult: result,
        appliedFixes: allApplied,
        humanRequired: result.suggestions.filter((s) => !s.autoFixable),
      };
    }

    // 이미 적용한 fix는 제외 (중복 방지)
    const autoFixable = result.suggestions.filter(
      (s) => s.autoFixable && !appliedIds.has(s.id)
    );
    if (autoFixable.length === 0) {
      break;
    }

    const fixResult = autoFix(session, autoFixable);
    for (const f of fixResult.applied) {
      allApplied.push(f);
      appliedIds.add(f.id);
    }

    if (fixResult.applied.length === 0) {
      break;
    }

    // 진짜 recompile roundtrip → fresh status 획득
    if (recompute) {
      currentStatus = recompute();
    }
    result = verify(session, currentStatus);
  }

  const humanRequired = result.suggestions.filter((s) => !s.autoFixable);

  if (humanRequired.length > 0) {
    return {
      outcome: LoopOutcome.NEEDS_HUMAN,
      iterations,
      finalResult: result,
      appliedFixes: allApplied,
      humanRequired,
    };
  }

  session.ledger.record("VERIFICATION_ESCALATED", {
    iterations,
    score: result.score,
    blockers: result.blockers,
  });

  return {
    outcome: LoopOutcome.ESCALATED,
    iterations,
    finalResult: result,
    appliedFixes: allApplied,
    humanRequired: [],
  };
}

// ============================================================
// PART 5 — EnforcementGate (실제 차단)
// ============================================================

export enum EnforcementAction {
  ALLOW = "ALLOW",
  DOWNGRADE = "DOWNGRADE",
  BLOCK = "BLOCK",
  SEAL = "SEAL",
  FORCE_UNCERTAINTY = "FORCE_UNCERTAINTY",
}

export interface EnforcementResult {
  action: EnforcementAction;
  reasons: string[];
  restrictions: string[];
}

export function enforce(status: SessionStatus): EnforcementResult {
  const reasons: string[] = [];
  const restrictions: string[] = [];
  let action = EnforcementAction.ALLOW;

  if (status.sovereignKernelState === "SEALED") {
    action = EnforcementAction.SEAL;
    reasons.push("NSG 커널 SEALED — 세션 비가역 잠금");
    restrictions.push("모든 출력 차단");
    return { action, reasons, restrictions };
  }

  if (status.sovereignKernelState === "FAILED") {
    action = EnforcementAction.BLOCK;
    reasons.push("NSG 커널 FAILED");
    restrictions.push("응답 차단, 복구 대기");
  }

  if (status.hcrfVerdict === OutputVerdict.SEALED) {
    action = max(action, EnforcementAction.BLOCK);
    reasons.push("HCRF 책임 게이트 SEALED");
    restrictions.push("출력 전면 차단");
  } else if (status.hcrfVerdict === OutputVerdict.QUESTIONS_ONLY) {
    action = max(action, EnforcementAction.DOWNGRADE);
    reasons.push("HCRF 질문만 허용 상태");
    restrictions.push("질문 형태로만 응답 가능");
  }

  if (status.ocfpGate === InteractionGate.SEALED) {
    action = max(action, EnforcementAction.BLOCK);
    reasons.push("OCFP 조직 필터 SEALED");
    restrictions.push("30분 잠금");
  } else if (status.ocfpGate === InteractionGate.SILENT) {
    action = max(action, EnforcementAction.DOWNGRADE);
    reasons.push("OCFP SILENT 모드");
    restrictions.push("최소 응답만 허용");
  }

  if (status.ehLevel === ConfidenceLevel.DANGER) {
    if (action === EnforcementAction.ALLOW) {
      action = EnforcementAction.FORCE_UNCERTAINTY;
    }
    reasons.push("EH 할루시네이션 DANGER");
    restrictions.push("모든 출력에 불확실성 마커 강제");
  }

  if (status.nibEvent === BridgeEvent.STRUCTURAL_VIOLATION) {
    action = max(action, EnforcementAction.DOWNGRADE);
    reasons.push("NIB 구조적 위반 감지");
    restrictions.push("응답 품질 경고 부착");
  }

  return { action, reasons, restrictions };
}

const ACTION_SEVERITY: Record<EnforcementAction, number> = {
  [EnforcementAction.ALLOW]: 0,
  [EnforcementAction.FORCE_UNCERTAINTY]: 1,
  [EnforcementAction.DOWNGRADE]: 2,
  [EnforcementAction.BLOCK]: 3,
  [EnforcementAction.SEAL]: 4,
};

function max(a: EnforcementAction, b: EnforcementAction): EnforcementAction {
  return ACTION_SEVERITY[a] >= ACTION_SEVERITY[b] ? a : b;
}
