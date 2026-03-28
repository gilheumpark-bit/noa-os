/**
 * OCFP v2.0 — 조직/기업 필터 엔진 (TypeScript 이식)
 *
 * 설계서 §6.4 기준. 5파트 전부 이식.
 * Part 1: CorporateInteractionKernel (승인 게이트)
 * Part 2: CorporatePolicyEngine (리스크 분류)
 * Part 3: AuditLedger → ledger.ts로 통합
 * Part 4: OrgPersonaManager (조직 역할)
 * Part 5: AdminOverrideManager
 */

import { AegisLedger } from "./ledger";

// --- 상수 ---

export const RISK_LIMIT = 3;
export const SEAL_DURATION_MS = 30 * 60 * 1000; // 30분

// --- Part 1: CorporateInteractionKernel ---

export enum InteractionGate {
  NORMAL = "NORMAL",
  LIMITED = "LIMITED",
  SILENT = "SILENT",
  SEALED = "SEALED",
}

export interface KernelState {
  gate: InteractionGate;
  consecutiveRisks: number;
  sealedUntil: number | null;
  turnCount: number;
}

export function createKernelState(): KernelState {
  return {
    gate: InteractionGate.NORMAL,
    consecutiveRisks: 0,
    sealedUntil: null,
    turnCount: 0,
  };
}

export function updateKernelGate(
  state: KernelState,
  riskLevel: RiskLevel,
  riskLimit: number = RISK_LIMIT,
  sealDurationMs: number = SEAL_DURATION_MS
): KernelState {
  const now = Date.now();

  // SEALED 상태 해제 체크
  if (state.sealedUntil !== null && now >= state.sealedUntil) {
    state.gate = InteractionGate.NORMAL;
    state.sealedUntil = null;
    state.consecutiveRisks = 0;
  }

  if (state.gate === InteractionGate.SEALED) {
    state.turnCount++;
    return state;
  }

  // 리스크 누적
  if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
    state.consecutiveRisks++;
  } else {
    state.consecutiveRisks = Math.max(0, state.consecutiveRisks - 1);
  }

  // riskLimit 연속 리스크 → SEALED
  if (state.consecutiveRisks >= riskLimit) {
    state.gate = InteractionGate.SEALED;
    state.sealedUntil = now + sealDurationMs;
  } else if (riskLevel === RiskLevel.CRITICAL) {
    state.gate = InteractionGate.SILENT;
  } else if (riskLevel === RiskLevel.HIGH) {
    state.gate = InteractionGate.LIMITED;
  } else {
    state.gate = InteractionGate.NORMAL;
  }

  state.turnCount++;
  return state;
}

// --- Part 2: CorporatePolicyEngine ---

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export interface RiskAssessment {
  level: RiskLevel;
  flags: string[];
  score: number;
}

const HR_KEYWORDS = [
  "해고", "인사", "급여", "연봉", "성과평가", "징계",
  "termination", "salary", "performance review", "dismissal",
];
const LEGAL_KEYWORDS = [
  "소송", "계약", "법적", "위반", "배상", "고소",
  "lawsuit", "contract", "legal", "violation", "liability",
];
const EXTERNAL_KEYWORDS = [
  "외부 공개", "언론", "기자", "SNS 게시", "공시",
  "press release", "media", "public disclosure",
];
const IMPLICATION_KEYWORDS = [
  "함축", "의미", "암시", "해석 여지", "오해 소지",
  "implication", "interpreted as", "could be seen as",
];

export function assessRisk(text: string): RiskAssessment {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  let score = 0;

  // HR 민감도
  for (const kw of HR_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      flags.push(`HR: ${kw}`);
      score += 15;
    }
  }

  // 법률 민감도
  for (const kw of LEGAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      flags.push(`LEGAL: ${kw}`);
      score += 20;
    }
  }

  // 외부 해석 리스크
  for (const kw of EXTERNAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      flags.push(`EXTERNAL: ${kw}`);
      score += 25;
    }
  }

  // 함축 리스크
  for (const kw of IMPLICATION_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      flags.push(`IMPLICATION: ${kw}`);
      score += 10;
    }
  }

  let level: RiskLevel;
  if (score >= 60) level = RiskLevel.CRITICAL;
  else if (score >= 40) level = RiskLevel.HIGH;
  else if (score >= 20) level = RiskLevel.MEDIUM;
  else level = RiskLevel.LOW;

  return { level, flags, score };
}

// --- Part 4: OrgPersonaManager ---

export enum OrgRole {
  COMPANY = "COMPANY",
  LEGAL = "LEGAL",
  HR = "HR",
  SECURITY = "SECURITY",
  SUPPORT = "SUPPORT",
  INTERNAL = "INTERNAL",
}

export enum PersonaMode {
  PUBLIC = "PUBLIC",
  INTERNAL = "INTERNAL",
  CONFIDENTIAL = "CONFIDENTIAL",
}

export interface OrgPersona {
  role: OrgRole;
  mode: PersonaMode;
  displayName: string;
}

export function createOrgPersona(
  role: OrgRole,
  mode: PersonaMode = PersonaMode.PUBLIC
): OrgPersona {
  const DISPLAY_NAMES: Record<OrgRole, string> = {
    [OrgRole.COMPANY]: "회사 대표",
    [OrgRole.LEGAL]: "법무팀",
    [OrgRole.HR]: "인사팀",
    [OrgRole.SECURITY]: "보안팀",
    [OrgRole.SUPPORT]: "고객지원",
    [OrgRole.INTERNAL]: "내부용",
  };
  return { role, mode, displayName: DISPLAY_NAMES[role] };
}

// --- Part 5: AdminOverrideManager ---

export enum AdminAction {
  OVERRIDE_APPROVE = "OVERRIDE_APPROVE",
  FORCE_SEAL = "FORCE_SEAL",
  FORCE_UNSEAL = "FORCE_UNSEAL",
  CHANGE_MODE = "CHANGE_MODE",
  RESET_RISK = "RESET_RISK",
}

export interface AdminOverride {
  action: AdminAction;
  performedBy: string;
  timestamp: number;
  reason: string;
}

export class AdminOverrideManager {
  private overrides: AdminOverride[] = [];
  private ledger: AegisLedger;

  constructor(ledger: AegisLedger) {
    this.ledger = ledger;
  }

  execute(
    action: AdminAction,
    performedBy: string,
    reason: string,
    kernelState: KernelState
  ): KernelState {
    const override: AdminOverride = {
      action,
      performedBy,
      timestamp: Date.now(),
      reason,
    };
    this.overrides.push(override);

    // 감사 로그 기록
    this.ledger.record("ADMIN_OVERRIDE", {
      action,
      performedBy,
      reason,
    });

    switch (action) {
      case AdminAction.FORCE_SEAL:
        kernelState.gate = InteractionGate.SEALED;
        kernelState.sealedUntil = Date.now() + SEAL_DURATION_MS;
        break;
      case AdminAction.FORCE_UNSEAL:
        kernelState.gate = InteractionGate.NORMAL;
        kernelState.sealedUntil = null;
        kernelState.consecutiveRisks = 0;
        break;
      case AdminAction.RESET_RISK:
        kernelState.consecutiveRisks = 0;
        kernelState.gate = InteractionGate.NORMAL;
        break;
      case AdminAction.OVERRIDE_APPROVE:
        if (kernelState.gate !== InteractionGate.SEALED) {
          kernelState.gate = InteractionGate.NORMAL;
        }
        break;
      case AdminAction.CHANGE_MODE:
        // 모드 변경은 OrgPersona에서 처리
        break;
    }

    return kernelState;
  }

  getHistory(): AdminOverride[] {
    return [...this.overrides];
  }
}

// --- 통합 OCFP 엔진 ---

export interface OcfpConfig {
  sealDuration?: number;  // ms
  riskLimit?: number;
}

export class OcfpEngine {
  private kernelState: KernelState;
  private persona: OrgPersona;
  private adminMgr: AdminOverrideManager;
  private ledger: AegisLedger;
  private config: Required<OcfpConfig>;

  constructor(ledger: AegisLedger, config: OcfpConfig = {}) {
    this.ledger = ledger;
    this.kernelState = createKernelState();
    this.persona = createOrgPersona(OrgRole.COMPANY);
    this.adminMgr = new AdminOverrideManager(ledger);
    this.config = {
      sealDuration: config.sealDuration ?? SEAL_DURATION_MS,
      riskLimit: config.riskLimit ?? RISK_LIMIT,
    };
  }

  process(text: string): {
    gate: InteractionGate;
    risk: RiskAssessment;
    persona: OrgPersona;
  } {
    const risk = assessRisk(text);

    this.kernelState = updateKernelGate(
      this.kernelState,
      risk.level,
      this.config.riskLimit,
      this.config.sealDuration
    );

    // 감사 로그
    this.ledger.record("OCFP_PROCESS", {
      gate: this.kernelState.gate,
      riskLevel: risk.level,
      riskScore: risk.score,
      flags: risk.flags,
    });

    return {
      gate: this.kernelState.gate,
      risk,
      persona: this.persona,
    };
  }

  setPersona(role: OrgRole, mode: PersonaMode): void {
    this.persona = createOrgPersona(role, mode);
  }

  adminOverride(
    action: AdminAction,
    performedBy: string,
    reason: string
  ): void {
    this.kernelState = this.adminMgr.execute(
      action,
      performedBy,
      reason,
      this.kernelState
    );
  }

  getState(): KernelState {
    return { ...this.kernelState };
  }
}
