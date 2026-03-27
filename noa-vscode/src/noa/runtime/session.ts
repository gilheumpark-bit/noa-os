/**
 * 세션 상태 관리 — wear / strip / swap 상태 머신.
 * 활성 레이어 스택을 관리하고 엔진 상태를 유지.
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
  updateScore,
  determineVerdict,
  type HfcpState,
  type TurnSignal,
  type HfcpMode,
  Verdict as HfcpVerdict,
} from "../engines/hfcp";
import {
  detect as ehDetect,
  type EhDetectionResult,
  type EhConfig,
  Domain,
  ConfidenceLevel,
} from "../engines/eh-detector";
import {
  processHcrfTurn,
  createInitialHcrfState,
  type HcrfState,
  type OutputVerdict,
} from "../engines/hcrf";

// --- Session State ---

export interface SessionSnapshot {
  id: string;
  activeLayers: LayerEntry[];
  resolved: ResolvedNoaProfile | null;
  provenance: ProvenanceGraph | null;
  diagnostics: NoaDiagnostic[];
  engineStates: EngineStates;
  createdAt: number;
  lastUpdated: number;
}

export interface LayerEntry {
  source: NoaSourceFile;
  active: boolean;
}

export interface EngineStates {
  hfcp: HfcpState | null;
  hcrf: HcrfState | null;
  lastEhResult: EhDetectionResult | null;
}

export interface SessionStatus {
  layerNames: string[];
  hfcpScore: number | null;
  hfcpVerdict: string | null;
  ehLevel: ConfidenceLevel | null;
  hcrfVerdict: OutputVerdict | null;
  activeEngines: string[];
}

// --- Session Manager ---

export class SessionManager {
  private sessions = new Map<string, SessionSnapshot>();
  private sourceRegistry = new Map<string, NoaSourceFile>();

  /**
   * 소스 레지스트리에 .noa 소스를 등록.
   */
  registerSource(id: string, text: string, origin: string): void {
    const source = parseNoaSource(text, origin);
    this.sourceRegistry.set(id, source);
    // extends 참조용 별칭도 등록
    const aliasId = `${source.file.kind}/${source.file.id}`;
    this.sourceRegistry.set(aliasId, source);
  }

  /**
   * 세션 생성.
   */
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
      },
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SessionSnapshot | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * wear — 페르소나 입기.
   */
  wear(sessionId: string, sourceId: string): SessionSnapshot {
    const session = this.requireSession(sessionId);
    const source = this.sourceRegistry.get(sourceId);
    if (!source) {
      throw new Error(`소스를 찾을 수 없습니다: "${sourceId}"`);
    }

    // 이미 입고 있으면 무시
    if (session.activeLayers.some((l) => l.source.file.id === source.file.id)) {
      return session;
    }

    session.activeLayers.push({ source, active: true });
    this.recompile(session);
    return session;
  }

  /**
   * strip — 페르소나 벗기.
   */
  strip(sessionId: string, sourceId: string): SessionSnapshot {
    const session = this.requireSession(sessionId);
    session.activeLayers = session.activeLayers.filter(
      (l) => l.source.file.id !== sourceId
    );
    this.recompile(session);
    return session;
  }

  /**
   * swap — 원자적 교체. oldId를 벗고 newId를 입음.
   */
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
    return session;
  }

  /**
   * 턴 처리 — 사용자 입력에 대해 엔진들 실행.
   */
  processTurn(
    sessionId: string,
    text: string,
    signal?: Partial<TurnSignal>
  ): {
    session: SessionSnapshot;
    status: SessionStatus;
  } {
    const session = this.requireSession(sessionId);
    if (!session.resolved) {
      return { session, status: this.getStatus(session) };
    }

    const activeEngines = session.resolved.activeEngines;
    const engines = session.resolved.profile.engines;

    // HFCP 실행
    if (activeEngines.includes("hfcp") && session.engineStates.hfcp) {
      const turnSignal: TurnSignal = {
        length: text.length,
        hasQuestion: /[?？]/.test(text),
        humorLevel: signal?.humorLevel ?? 0,
        connectiveDensity: signal?.connectiveDensity ?? 0,
        objectionMarker: signal?.objectionMarker ?? false,
      };
      session.engineStates.hfcp = updateScore(
        session.engineStates.hfcp,
        turnSignal
      );
    }

    // EH 실행
    if (activeEngines.includes("eh")) {
      const domainWeight = engines?.eh?.domain_weight ?? 1.0;
      const ehConfig: EhConfig = {
        domain: this.inferDomain(domainWeight),
        domainWeight,
        enableSourceCredibility: engines?.eh?.source_credibility ?? false,
      };
      session.engineStates.lastEhResult = ehDetect(text, ehConfig);
    }

    // HCRF 실행
    if (activeEngines.includes("hcrf") && session.engineStates.hcrf) {
      const hfcpScore = session.engineStates.hfcp?.score ?? 60;
      const { state } = processHcrfTurn(
        session.engineStates.hcrf,
        hfcpScore,
        text
      );
      session.engineStates.hcrf = state;
    }

    session.lastUpdated = Date.now();
    return { session, status: this.getStatus(session) };
  }

  /**
   * 현재 세션 상태 요약.
   */
  getStatus(session: SessionSnapshot): SessionStatus {
    const layerNames = session.activeLayers.map((l) => l.source.file.meta.name);
    const hfcpScore = session.engineStates.hfcp?.score ?? null;
    const hfcpVerdict = hfcpScore !== null
      ? determineVerdict(session.engineStates.hfcp!).toString()
      : null;
    const ehLevel = session.engineStates.lastEhResult?.confidenceLevel ?? null;
    const hcrfVerdict = session.engineStates.hcrf
      ? getLastHcrfVerdict(session.engineStates.hcrf)
      : null;

    return {
      layerNames,
      hfcpScore,
      hfcpVerdict,
      ehLevel,
      hcrfVerdict,
      activeEngines: session.resolved?.activeEngines ?? [],
    };
  }

  /**
   * 내보내기 — 현재 세션의 resolved profile로 artifacts 생성.
   */
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
      session.engineStates = { hfcp: null, hcrf: null, lastEhResult: null };
      session.lastUpdated = Date.now();
      return;
    }

    const resolver = (id: string) => this.sourceRegistry.get(id);
    const normalized = normalizeAll(sources, resolver);
    const merged = mergeLayers(normalized);
    const resolved = resolve(merged);
    const diagnostics = validate(resolved);
    const provenance = buildProvenanceGraph(resolved);

    session.resolved = resolved;
    session.provenance = provenance;
    session.diagnostics = diagnostics;

    // 엔진 초기화
    this.initEngines(session, resolved);
    session.lastUpdated = Date.now();
  }

  private initEngines(
    session: SessionSnapshot,
    resolved: ResolvedNoaProfile
  ): void {
    const engines = resolved.activeEngines;
    const config = resolved.profile.engines;

    // HFCP
    if (engines.includes("hfcp")) {
      const mode: HfcpMode =
        (config?.hfcp?.mode as HfcpMode) ?? "CHAT";
      session.engineStates.hfcp = createHfcpState(mode);
    } else {
      session.engineStates.hfcp = null;
    }

    // HCRF
    if (engines.includes("hcrf")) {
      const block = config?.hcrf?.authority_transfer_block ?? true;
      session.engineStates.hcrf = createInitialHcrfState(block);
    } else {
      session.engineStates.hcrf = null;
    }

    // EH는 stateless — 매 턴마다 실행
    session.engineStates.lastEhResult = null;
  }

  private inferDomain(weight: number): Domain {
    if (weight >= 1.35) return Domain.MEDICAL;
    if (weight >= 1.25) return Domain.FINANCE;
    if (weight >= 1.15) return Domain.LEGAL;
    if (weight >= 1.1) return Domain.ACADEMIC;
    return Domain.GENERAL;
  }
}

function getLastHcrfVerdict(state: HcrfState): OutputVerdict | null {
  // HCRF 상태에서 현재 mode 기반 verdict 추론
  const { processHcrfTurn: _ , ...rest } = { processHcrfTurn };
  // 간이 추론: mode가 SEALED면 SEALED
  if (state.mode === "SEALED") return "SEALED" as OutputVerdict;
  if (state.mode === "REVIEW") return "QUESTIONS_ONLY" as OutputVerdict;
  return "NO_OUTPUT" as OutputVerdict;
}
