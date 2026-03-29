/**
 * 세션 상태 관리 — wear / strip / swap 상태 머신.
 * 활성 레이어 스택을 관리하고 7개 엔진 상태를 유지.
 */

import { parseNoaSource, type NoaSourceFile } from "../compiler/parse";
import { normalizeAll } from "../compiler/normalize";
import { mergeLayers } from "../compiler/merge";
import { resolve, type ResolvedNoaProfile } from "../compiler/resolve";
import { validate } from "../compiler/validate";
import { buildProvenanceGraph, type ProvenanceGraph } from "../compiler/explain";
import { exportAll, type ExportArtifact } from "../compiler/export";
import type { NoaDiagnostic } from "../schema/errors";
import {
  createInitialState as createHfcpState,
  createInitialEcology,
  updateScore,
  determineVerdict,
  NrgMemory,
  RclLevel,
  computeRclLevel,
  updateMemoryEcology,
  type MemoryEcologyState,
  type HfcpState,
  type TurnSignal,
  type HfcpMode,
  type HfcpTuning,
} from "../engines/hfcp";
import {
  detect as ehDetect,
  type EhDetectionResult,
  type EhConfig,
  type EhTuning,
  Domain,
  ConfidenceLevel,
} from "../engines/eh-detector";
import {
  processHcrfTurn,
  createInitialHcrfState,
  createAuditEvent,
  type HcrfState,
  OutputVerdict,
  HcrfMode,
} from "../engines/hcrf";
import { OcfpEngine } from "../engines/ocfp";
import {
  processTlmhTurn,
  createInitialTlmhState,
  type TlmhState,
} from "../engines/tlmh";
import {
  SovereignGate,
  PolicyHint,
} from "../engines/sovereign";
import {
  InvariantBridge,
  BridgeEvent,
  type EventSnapshot as NibEventSnapshot,
} from "../engines/nib";
import {
  AegisLedger,
  createContextState,
  appendMessage,
  createMessageFrame,
  type ContextState,
} from "../engines/ledger";
import { AccessoryManager } from "./accessories";
import {
  enforce,
  EnforcementAction,
  type EnforcementResult,
  type VerificationResult,
  verify as verifySession,
  verificationLoop,
  ChangeManager,
  type LoopResult,
} from "./verification-studio";

// --- NIB → NSG PolicyHint 변환 맵 (static, 매 턴 재생성 방지) ---
const NIB_TO_NSG_HINT: Record<string, PolicyHint> = {
  [BridgeEvent.TRANSIENT_ANOMALY]: PolicyHint.SPIKE_WARNING,
  [BridgeEvent.PERSISTENT_ANOMALY]: PolicyHint.STRUCTURE_DRIFT,
  [BridgeEvent.STRUCTURAL_VIOLATION]: PolicyHint.ADVERSARIAL_BEHAVIOR,
};

// --- Session State ---

export interface SessionSnapshot {
  id: string;
  activeLayers: LayerEntry[];
  resolved: ResolvedNoaProfile | null;
  provenance: ProvenanceGraph | null;
  diagnostics: NoaDiagnostic[];
  engineStates: EngineStates;
  ledger: AegisLedger;
  accessories: AccessoryManager;
  createdAt: number;
  lastUpdated: number;
  /** NIB 피딩용 — 이전 턴 HFCP 점수 */
  prevHfcpScore: number;
  /** NIB 피딩용 — 텍스트 길이 러닝 평균 */
  avgTextLength: number;
  /** NIB 피딩용 — 총 턴 수 */
  turnCount: number;
  /** CoW 메시지 이력 (ledger.ts ContextState) */
  contextState: ContextState;
}

export interface LayerEntry {
  source: NoaSourceFile;
  active: boolean;
}

/** HCRF 런타임 튜닝 */
export interface HcrfTuning {
  pressureWeight?: number;
  sealThreshold?: number;
}

/** OCFP 런타임 튜닝 */
export interface OcfpTuning {
  riskScoreHr?: number;
  riskScoreLegal?: number;
}

/** Sovereign 런타임 튜닝 */
export interface SovereignTuning {
  ratioCap?: number;
  signalLimit?: number;
}

/** 밴드 옵티마이저에서 주입하는 엔진 튜닝 오버라이드 */
export interface EngineTuningOverride {
  eh?: EhTuning;
  hfcp?: HfcpTuning;
  hcrf?: HcrfTuning;
  ocfp?: OcfpTuning;
  sovereign?: SovereignTuning;
}

export interface EngineStates {
  hfcp: HfcpState | null;
  hcrf: HcrfState | null;
  lastEhResult: EhDetectionResult | null;
  ocfp: OcfpEngine | null;
  tlmh: TlmhState | null;
  sovereign: SovereignGate | null;
  nib: InvariantBridge | null;
  lastNibEvent: NibEventSnapshot | null;
  nrgMemory: NrgMemory | null;
  memoryEcology: MemoryEcologyState | null;
}

export interface SessionStatus {
  layerNames: string[];
  hfcpScore: number | null;
  hfcpVerdict: string | null;
  ehLevel: ConfidenceLevel | null;
  hcrfVerdict: OutputVerdict | null;
  ocfpGate: string | null;
  tlmhInvocation: string | null;
  sovereignKernelState: string | null;
  sovereignRiskLevel: string | null;
  nibEvent: string | null;
  nibConfidence: number | null;
  rclLevel: RclLevel | null;
  activeEngines: string[];
  mountedAccessories: string[];
}

// --- Session Manager ---

export class SessionManager {
  private sessions = new Map<string, SessionSnapshot>();
  private sourceRegistry = new Map<string, NoaSourceFile>();

  registerSource(id: string, text: string, origin: string): void {
    const source = parseNoaSource(text, origin);
    this.sourceRegistry.set(id, source);
    const aliasId = `${source.file.kind}/${source.file.id}`;
    this.sourceRegistry.set(aliasId, source);
  }

  createSession(sessionId: string = "default"): SessionSnapshot {
    const session: SessionSnapshot = {
      id: sessionId,
      activeLayers: [],
      resolved: null,
      provenance: null,
      diagnostics: [],
      engineStates: {
        hfcp: null,
        hcrf: null,
        lastEhResult: null,
        ocfp: null,
        tlmh: null,
        sovereign: null,
        nib: null,
        lastNibEvent: null,
        nrgMemory: null,
        memoryEcology: null,
      },
      ledger: new AegisLedger(),
      accessories: new AccessoryManager(),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      prevHfcpScore: 60,
      avgTextLength: 100,
      turnCount: 0,
      contextState: createContextState(sessionId),
    };
    session.ledger.record("SESSION_START", { sessionId });
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SessionSnapshot | undefined {
    return this.sessions.get(sessionId);
  }

  wear(sessionId: string, sourceId: string): {
    session: SessionSnapshot;
    verification: VerificationResult | null;
    rolledBack: boolean;
  } {
    const session = this.requireSession(sessionId);
    const source = this.sourceRegistry.get(sourceId);
    if (!source) {
      throw new Error(`소스를 찾을 수 없습니다: "${sourceId}"`);
    }

    if (session.activeLayers.some((l) => l.source.file.id === source.file.id)) {
      return { session, verification: null, rolledBack: false };
    }

    // 변경 전 스냅샷 저장 (롤백 대비)
    const change = this.changeManager.draft(session);
    const prevLayers = [...session.activeLayers];

    // 적용
    session.activeLayers.push({ source, active: true });
    this.recompile(session);

    // 검증 게이트 — 컴파일 후 diagnostics 에러가 있으면 자동 롤백
    const status = this.getStatus(session);
    const verification = verifySession(session, status);

    if (!verification.passed && verification.blockers.length > 0) {
      // 롤백: 이전 레이어 상태로 복원
      session.activeLayers = prevLayers;
      this.recompile(session);
      session.ledger.record("WEAR_ROLLED_BACK", {
        sourceId: source.file.id,
        reason: verification.blockers,
      });
      this.changeManager.markVerified(change.id, verification);
      return { session, verification, rolledBack: true };
    }

    session.ledger.record("WEAR", { sourceId: source.file.id });
    this.changeManager.markVerified(change.id, verification);
    return { session, verification, rolledBack: false };
  }

  strip(sessionId: string, sourceId: string): SessionSnapshot {
    const session = this.requireSession(sessionId);
    session.activeLayers = session.activeLayers.filter(
      (l) => l.source.file.id !== sourceId
    );
    this.recompile(session);
    session.ledger.record("STRIP", { sourceId });
    return session;
  }

  swap(sessionId: string, oldId: string, newId: string): SessionSnapshot {
    const session = this.requireSession(sessionId);
    const newSource = this.sourceRegistry.get(newId);
    if (!newSource) {
      throw new Error(`소스를 찾을 수 없습니다: "${newId}"`);
    }

    session.activeLayers = session.activeLayers.filter(
      (l) => l.source.file.id !== oldId
    );
    session.activeLayers.push({ source: newSource, active: true });
    this.recompile(session);
    session.ledger.record("SWAP", { oldId, newId: newSource.file.id });
    return session;
  }

  /**
   * 런타임 튜닝 오버라이드 — 밴드 옵티마이저에서 주입.
   */
  engineTuning: EngineTuningOverride = {};

  /**
   * 턴 처리 — 사용자 입력에 대해 7개 엔진 실행.
   */
  /** Verification-First Studio — 변경 관리 */
  changeManager = new ChangeManager();

  processTurn(
    sessionId: string,
    text: string,
    signal?: Partial<TurnSignal>
  ): {
    session: SessionSnapshot;
    status: SessionStatus;
    enforcement: EnforcementResult;
  } {
    const session = this.requireSession(sessionId);
    if (!session.resolved) {
      const status = this.getStatus(session);
      // no-profile → DOWNGRADE 강제 (프로필 없이 ALLOW는 안전 정책 위반)
      const enforcement: EnforcementResult = {
        action: EnforcementAction.DOWNGRADE,
        reasons: ["프로필 미적용 — NOA 정책 비활성 상태"],
        restrictions: ["기본 응답만 허용, 엔진 검증 없음"],
      };
      session.ledger.record("ENFORCEMENT", {
        action: enforcement.action,
        reasons: enforcement.reasons,
        noProfile: true,
      });
      return { session, status, enforcement };
    }

    const activeEngines = session.resolved.activeEngines;
    const engines = session.resolved.profile.engines;

    // 0. NRG Memory — 반복 감지 (HFCP humorLevel/connectiveDensity dampening)
    let nrgMutation = 0;
    if (session.engineStates.nrgMemory) {
      const { mutation } = session.engineStates.nrgMemory.record(text);
      nrgMutation = mutation;
    }

    // 1. HFCP 실행
    if (activeEngines.includes("hfcp") && session.engineStates.hfcp) {
      const turnSignal: TurnSignal = {
        length: text.length,
        hasQuestion: /[?？]/.test(text),
        humorLevel: (signal?.humorLevel ?? 0) * (1 - nrgMutation),
        connectiveDensity: (signal?.connectiveDensity ?? 0) * (1 - nrgMutation),
        objectionMarker: signal?.objectionMarker ?? false,
      };
      session.engineStates.hfcp = updateScore(
        session.engineStates.hfcp,
        turnSignal,
        this.engineTuning.hfcp
      );
    }

    // 2. EH 실행 (stateless — 매 턴 독립 실행, 결과만 보관)
    if (activeEngines.includes("eh")) {
      const domainWeight = engines?.eh?.domain_weight ?? 1.0;
      const ehConfig: EhConfig = {
        domain: this.inferDomain(domainWeight),
        domainWeight,
        enableSourceCredibility: engines?.eh?.source_credibility ?? false,
        tuning: this.engineTuning.eh,
      };
      session.engineStates.lastEhResult = ehDetect(text, ehConfig);
    }

    // 3. HCRF 실행 + Audit 이벤트 → Ledger 기록
    if (activeEngines.includes("hcrf") && session.engineStates.hcrf) {
      const hfcpScore = session.engineStates.hfcp?.score ?? 60;
      const { state, signal: hcrfSignal, responsibility, verdict } =
        processHcrfTurn(session.engineStates.hcrf, hfcpScore, text);
      session.engineStates.hcrf = state;

      const auditEvent = createAuditEvent(
        state,
        hcrfSignal,
        responsibility,
        verdict,
        hfcpScore
      );
      session.ledger.record("HCRF_TURN", auditEvent as Record<string, unknown>);
    }

    // 4. OCFP 실행
    if (activeEngines.includes("ocfp") && session.engineStates.ocfp) {
      session.engineStates.ocfp.process(text);
    }

    // 5. TLMH 실행
    if (activeEngines.includes("tlmh") && session.engineStates.tlmh) {
      const invitationOnly = engines?.tlmh?.invitation_only ?? true;
      const result = processTlmhTurn(
        session.engineStates.tlmh,
        text,
        invitationOnly
      );
      session.engineStates.tlmh = result.state;
    }

    // 턴 카운트 + 텍스트 길이 러닝 평균 갱신
    session.turnCount++;
    session.avgTextLength = session.avgTextLength + (text.length - session.avgTextLength) / session.turnCount;

    // 6. NIB — 엔진 결과를 시간축 패턴 분석에 투입
    if (session.engineStates.nib) {
      const nib = session.engineStates.nib;

      // HFCP 점수 변화를 NIB에 피딩 (실제 이전 턴 값 사용)
      if (session.engineStates.hfcp) {
        const hfcpScore = session.engineStates.hfcp.score;
        nib.process('hfcp_score', { score: hfcpScore, prev: session.prevHfcpScore });
        session.prevHfcpScore = hfcpScore;
      }

      // EH 리스크를 NIB에 피딩
      if (session.engineStates.lastEhResult) {
        nib.process('eh_risk', {
          risk: session.engineStates.lastEhResult.finalRisk,
          threshold: 30,
        });
      }

      // 텍스트 길이를 NIB에 피딩 (러닝 평균 사용)
      const nibEvent = nib.process('text_length', {
        length: text.length,
        avgLength: session.avgTextLength,
      });
      session.engineStates.lastNibEvent = nibEvent;

      session.ledger.record("NIB_EVENT", {
        event: nibEvent.event,
        confidence: nibEvent.confidence,
      });
    }

    // 7. Sovereign Gate — NIB 이벤트를 PolicyHint로 변환하여 투입
    if (session.engineStates.sovereign) {
      const sov = session.engineStates.sovereign;
      const nibEvent = session.engineStates.lastNibEvent;

      // NIB 이벤트 → NSG PolicyHint 변환
      if (nibEvent && nibEvent.event !== BridgeEvent.BACKGROUND) {
        const hint = NIB_TO_NSG_HINT[nibEvent.event] ?? PolicyHint.NONE;
        sov.policy.evaluate({ hint });
      }

      // 텍스트를 게이트웨이에 통과
      const sovResult = sov.process(text, sessionId);
      session.ledger.record("SOVEREIGN_VERDICT", {
        verdict: sovResult.verdict,
        kernelState: sovResult.kernelState,
        riskLevel: sovResult.riskLevel,
        gatewaySignal: sovResult.gatewaySignal,
      });
    }

    // 8. Memory Ecology 갱신 (HFCP 활성 시)
    if (session.engineStates.memoryEcology) {
      session.engineStates.memoryEcology = updateMemoryEcology(
        session.engineStates.memoryEcology,
        session.turnCount
      );
    }

    // 9. Context State 갱신 — CoW 메시지 이력 (최근 50턴)
    const frame = createMessageFrame(
      `turn-${session.turnCount}`,
      'USER',
      text.length > 200 ? text.slice(0, 200) : text,
    );
    session.contextState = appendMessage(session.contextState, frame);

    session.lastUpdated = Date.now();
    const status = this.getStatus(session);

    // 10. Enforcement Gate — 엔진 판정을 실제 차단으로 연결
    const enforcement = enforce(status);
    session.ledger.record("ENFORCEMENT", {
      action: enforcement.action,
      reasons: enforcement.reasons,
    });

    return { session, status, enforcement };
  }

  /**
   * 검증 루프 — 자동 수정 후 recompile → getStatus → verify 진짜 roundtrip.
   * ChangeManager와 연동: draft → verify → (결과에 따라 approve 대기)
   */
  runVerification(sessionId: string): LoopResult {
    const session = this.requireSession(sessionId);

    // 변경 전 스냅샷 저장 (rollback 대비)
    this.changeManager.draft(session);

    const status = this.getStatus(session);

    // recompute 콜백: auto-fix 후 recompile → fresh status (감사 기록 포함)
    const recompute = () => {
      this.recompile(session);
      session.ledger.record("RECOMPILE_AFTER_FIX", { sessionId });
      return this.getStatus(session);
    };

    const result = verificationLoop(session, status, 3, recompute);

    // ChangeManager stage 전이
    const latest = this.changeManager.getLatest();
    if (latest) {
      this.changeManager.markVerified(latest.id, result.finalResult);
    }

    return result;
  }

  /**
   * 마지막 적용된 변경을 롤백 — 세션을 스냅샷 시점으로 복원.
   */
  rollback(sessionId: string): boolean {
    const session = this.requireSession(sessionId);
    const latest = this.changeManager.getLatestApplied();
    if (!latest) return false;

    const snapshotJson = this.changeManager.getSnapshot(latest.id);
    if (!snapshotJson) return false;

    // 스냅샷에서 레이어 목록 복원
    try {
      const snap = JSON.parse(snapshotJson);
      session.activeLayers = [];
      for (const layerInfo of snap.activeLayers ?? []) {
        const source = this.sourceRegistry.get(layerInfo.fileId);
        if (source) {
          session.activeLayers.push({ source, active: layerInfo.active });
        }
      }
      this.recompile(session);
      this.changeManager.markRolledBack(latest.id);
      session.ledger.record("ROLLBACK", { changeId: latest.id });
      return true;
    } catch (e) {
      session.ledger.record("ROLLBACK_FAILED", {
        changeId: latest.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  getStatus(session: SessionSnapshot): SessionStatus {
    const layerNames = session.activeLayers.map((l) => l.source.file.meta.name);
    const hfcpScore = session.engineStates.hfcp?.score ?? null;
    const hfcpVerdict = hfcpScore !== null
      ? determineVerdict(session.engineStates.hfcp!)
      : null;
    const ehLevel = session.engineStates.lastEhResult?.confidenceLevel ?? null;

    // HCRF verdict — enum 직접 사용
    let hcrfVerdict: OutputVerdict | null = null;
    if (session.engineStates.hcrf) {
      const mode = session.engineStates.hcrf.mode;
      if (mode === HcrfMode.SEALED) hcrfVerdict = OutputVerdict.SEALED;
      else if (mode === HcrfMode.REVIEW) hcrfVerdict = OutputVerdict.QUESTIONS_ONLY;
      else hcrfVerdict = OutputVerdict.NO_OUTPUT;
    }

    // OCFP gate
    const ocfpGate = session.engineStates.ocfp
      ? session.engineStates.ocfp.getState().gate
      : null;

    // TLMH invocation
    const tlmhInvocation = session.engineStates.tlmh?.invocation ?? null;

    // Sovereign (NSG)
    const sovereignKernelState = session.engineStates.sovereign
      ? session.engineStates.sovereign.kernel.state
      : null;
    const sovereignRiskLevel = session.engineStates.sovereign
      ? session.engineStates.sovereign.policy.riskLevel
      : null;

    // NIB
    const nibEvent = session.engineStates.lastNibEvent?.event ?? null;
    const nibConfidence = session.engineStates.lastNibEvent?.confidence ?? null;

    // RCL Level — HFCP 점수 기반 반박 제어 수준
    const rclLevel = session.engineStates.hfcp
      ? computeRclLevel(session.engineStates.hfcp.score)
      : null;

    // Mounted accessories
    const mountedAccessories = session.accessories
      .getMounted()
      .map((a) => a.id);

    return {
      layerNames,
      hfcpScore,
      hfcpVerdict,
      ehLevel,
      hcrfVerdict,
      ocfpGate,
      tlmhInvocation,
      sovereignKernelState,
      sovereignRiskLevel,
      nibEvent,
      nibConfidence,
      rclLevel,
      activeEngines: session.resolved?.activeEngines ?? [],
      mountedAccessories,
    };
  }

  exportArtifacts(sessionId: string): ExportArtifact[] {
    const session = this.requireSession(sessionId);
    if (!session.resolved) {
      throw new Error("컴파일된 프로필이 없습니다. 먼저 wear 하세요.");
    }
    return exportAll(session.resolved);
  }

  // --- 내부 ---

  private requireSession(sessionId: string): SessionSnapshot {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`세션을 찾을 수 없습니다: "${sessionId}"`);
    }
    return session;
  }

  private recompile(session: SessionSnapshot): void {
    const sources = session.activeLayers
      .filter((l) => l.active)
      .map((l) => l.source);

    if (sources.length === 0) {
      session.resolved = null;
      session.provenance = null;
      session.diagnostics = [];
      session.engineStates = {
        hfcp: null, hcrf: null, lastEhResult: null,
        ocfp: null, tlmh: null, sovereign: null,
        nib: null, lastNibEvent: null,
        nrgMemory: null, memoryEcology: null,
      };
      session.accessories.unmountAll();
      session.lastUpdated = Date.now();
      return;
    }

    const resolver = (id: string) => this.sourceRegistry.get(id);
    const { layers: normalized, unresolvedParents } = normalizeAll(sources, resolver);
    const merged = mergeLayers(normalized);
    const resolved = resolve(merged);
    const diagnostics = validate(resolved, unresolvedParents);
    const provenance = buildProvenanceGraph(resolved);

    session.resolved = resolved;
    session.provenance = provenance;
    session.diagnostics = diagnostics;

    this.initEngines(session, resolved);

    // Accessory 마운트
    const suggested = resolved.profile.accessories?.suggested ?? [];
    session.accessories.unmountAll();
    session.accessories.mountSuggested(suggested);

    session.lastUpdated = Date.now();
  }

  private initEngines(
    session: SessionSnapshot,
    resolved: ResolvedNoaProfile
  ): void {
    const active = resolved.activeEngines;
    const config = resolved.profile.engines;

    // HFCP
    if (active.includes("hfcp")) {
      const mode: HfcpMode = (config?.hfcp?.mode as HfcpMode) ?? "CHAT";
      session.engineStates.hfcp = createHfcpState(mode);
      session.engineStates.nrgMemory = new NrgMemory();
      session.engineStates.memoryEcology = createInitialEcology();
    } else {
      session.engineStates.hfcp = null;
      session.engineStates.nrgMemory = null;
      session.engineStates.memoryEcology = null;
    }

    // HCRF
    if (active.includes("hcrf")) {
      const block = config?.hcrf?.authority_transfer_block ?? true;
      session.engineStates.hcrf = createInitialHcrfState(block);
    } else {
      session.engineStates.hcrf = null;
    }

    // EH — stateless, 결과만 보관
    session.engineStates.lastEhResult = null;

    // OCFP
    if (active.includes("ocfp")) {
      const sealDuration = (config?.ocfp?.seal_duration ?? 30) * 60 * 1000;
      const riskLimit = config?.ocfp?.risk_limit ?? 3;
      session.engineStates.ocfp = new OcfpEngine(session.ledger, {
        sealDuration,
        riskLimit,
      });
    } else {
      session.engineStates.ocfp = null;
    }

    // TLMH
    if (active.includes("tlmh")) {
      session.engineStates.tlmh = createInitialTlmhState();
    } else {
      session.engineStates.tlmh = null;
    }

    // Sovereign Gate (NSG) — 항상 활성 (5파트 보안 커널)
    session.engineStates.sovereign = new SovereignGate();

    // NIB (Invariant Bridge) — 항상 활성 (시간축 패턴 분석)
    session.engineStates.nib = new InvariantBridge(12, 8);
    session.engineStates.lastNibEvent = null;

    session.ledger.record("ENGINES_INIT", { activeEngines: [...active, "nib", "sovereign"] });
  }

  private inferDomain(weight: number): Domain {
    if (!Number.isFinite(weight) || weight < 0) return Domain.GENERAL;
    if (weight >= 1.35) return Domain.MEDICAL;
    if (weight >= 1.25) return Domain.FINANCE;
    if (weight >= 1.15) return Domain.LEGAL;
    if (weight >= 1.1) return Domain.ACADEMIC;
    return Domain.GENERAL;
  }
}
