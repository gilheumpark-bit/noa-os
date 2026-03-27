/**
 * Aegis v28 — 감사 로그 (해시 체인) + OCFP Part 3 통합
 *
 * 설계서 §6.7 기준.
 * H(prev_hash | timestamp | event_type | payload_json) = SHA256
 * Genesis hash: SHA256("NOA_GENESIS")
 */

// --- SHA256 구현 (Web Crypto 불가 환경 대비, 순수 TS) ---

/**
 * 간이 SHA256 — 브라우저/Node 환경 모두 지원.
 * VS Code extension은 Node 환경이므로 crypto 모듈 사용.
 */
async function sha256(input: string): Promise<string> {
  // Node.js 환경
  try {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
  } catch {
    // fallback: 간이 해시 (테스트용)
    return simpleFallbackHash(input);
  }
}

function sha256Sync(input: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto") as typeof import("crypto");
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
  } catch {
    return simpleFallbackHash(input);
  }
}

function simpleFallbackHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

// --- Genesis ---

const GENESIS_SEED = "NOA_GENESIS";

function computeGenesisHash(): string {
  return sha256Sync(GENESIS_SEED);
}

// --- Event 타입 ---

export interface LedgerEvent {
  index: number;
  timestamp: number;
  eventType: string;
  payload: Record<string, unknown>;
  hash: string;
  prevHash: string;
}

// --- AegisLedger ---

export class AegisLedger {
  private chain: LedgerEvent[] = [];
  private lastHash: string;

  constructor() {
    this.lastHash = computeGenesisHash();
  }

  /**
   * 이벤트 기록. 해시 체인에 추가.
   * H(prev_hash | timestamp | event_type | payload_json) = SHA256
   */
  record(eventType: string, payload: Record<string, unknown>): string {
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
    const raw = `${this.lastHash}|${timestamp}|${eventType}|${payloadStr}`;
    const eventHash = sha256Sync(raw);

    const event: LedgerEvent = {
      index: this.chain.length,
      timestamp,
      eventType,
      payload,
      hash: eventHash,
      prevHash: this.lastHash,
    };

    this.chain.push(event);
    this.lastHash = eventHash;

    return eventHash;
  }

  /**
   * 체인 무결성 검증.
   */
  verify(): { valid: boolean; brokenAt?: number } {
    let prevHash = computeGenesisHash();

    for (let i = 0; i < this.chain.length; i++) {
      const event = this.chain[i];

      if (event.prevHash !== prevHash) {
        return { valid: false, brokenAt: i };
      }

      const payloadStr = JSON.stringify(
        event.payload,
        Object.keys(event.payload).sort()
      );
      const raw = `${event.prevHash}|${event.timestamp}|${event.eventType}|${payloadStr}`;
      const expectedHash = sha256Sync(raw);

      if (event.hash !== expectedHash) {
        return { valid: false, brokenAt: i };
      }

      prevHash = event.hash;
    }

    return { valid: true };
  }

  /**
   * 현재 체인 끝 해시.
   */
  getTailHash(): string {
    return this.lastHash;
  }

  /**
   * 전체 이벤트 수.
   */
  getLength(): number {
    return this.chain.length;
  }

  /**
   * 최근 N개 이벤트 조회.
   */
  getRecent(count: number): LedgerEvent[] {
    return this.chain.slice(-count);
  }

  /**
   * 이벤트 타입별 필터.
   */
  filterByType(eventType: string): LedgerEvent[] {
    return this.chain.filter((e) => e.eventType === eventType);
  }

  /**
   * JSON 내보내기.
   */
  export(): string {
    return JSON.stringify({
      genesis: computeGenesisHash(),
      tailHash: this.lastHash,
      length: this.chain.length,
      events: this.chain,
    }, null, 2);
  }
}

// --- Context State (불변 세션 스냅샷) ---

export interface ContextState {
  sessionId: string;
  history: readonly MessageFrame[];
  variables: Record<string, unknown>;
  lastUpdated: number;
  version: number;
  prevHash: string;
  stateHash: string;
}

export interface MessageFrame {
  msgId: string;
  role: "SYSTEM" | "USER" | "ASSISTANT" | "KERNEL";
  content: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  fingerprint: string;
}

/**
 * MessageFrame 생성 + fingerprint 계산.
 */
export function createMessageFrame(
  msgId: string,
  role: MessageFrame["role"],
  content: string,
  metadata: Record<string, unknown> = {}
): MessageFrame {
  const timestamp = Date.now();
  const raw = `${msgId}|${role}|${content}|${timestamp}`;
  const fingerprint = sha256Sync(raw);

  return { msgId, role, content, timestamp, metadata, fingerprint };
}

/**
 * ContextState 생성 (초기).
 */
export function createContextState(sessionId: string): ContextState {
  const state: Omit<ContextState, "stateHash"> = {
    sessionId,
    history: [],
    variables: {},
    lastUpdated: Date.now(),
    version: 0,
    prevHash: "GENESIS",
  };

  const stateHash = computeStateHash(state);
  return { ...state, stateHash };
}

/**
 * Copy-on-Write 패턴으로 메시지 추가.
 */
const MAX_CONTEXT_HISTORY = 50;

export function appendMessage(
  state: ContextState,
  frame: MessageFrame
): ContextState {
  const history = [...state.history, frame];
  const trimmed = history.length > MAX_CONTEXT_HISTORY
    ? history.slice(-MAX_CONTEXT_HISTORY)
    : history;

  const next: Omit<ContextState, "stateHash"> = {
    sessionId: state.sessionId,
    history: trimmed,
    variables: { ...state.variables },
    lastUpdated: Date.now(),
    version: state.version + 1,
    prevHash: state.stateHash,
  };

  const stateHash = computeStateHash(next);
  return { ...next, stateHash };
}

function computeStateHash(
  state: Omit<ContextState, "stateHash">
): string {
  const raw = `${state.sessionId}|${state.version}|${state.prevHash}|${state.lastUpdated}|${state.history.length}`;
  return sha256Sync(raw);
}
