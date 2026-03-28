/**
 * NOA Sovereign Gate (NSG) v1.0 — TypeScript Port
 * 5 PARTS:
 *   1. Deterministic Authority Kernel (DAK) — FSM + event dispatch
 *   2. Sovereign Policy Engine (SPE) — risk accumulation + verdict
 *   3. Authority & Strike Gateway (ASG) — input canonicalization + strike lifecycle
 *   4. Immutable Audit Ledger (IARL) — hash chain + recovery advisor
 *   5. Spike Observer (BSSO) — metric delta observation
 *
 * Design: Kernel NEVER evaluates policy. Policy NEVER executes.
 *         Gateway NEVER issues verdicts. Ledger NEVER alters records.
 */

// --- SHA256 (Node.js crypto, fallback for browser) ---
function sha256(input: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.createHash('sha256').update(input).digest('hex');
  } catch {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = Math.imul(31, h) + input.charCodeAt(i) | 0;
    }
    return Math.abs(h).toString(16).padStart(16, '0').repeat(4).slice(0, 64);
  }
}

// ============================================================
// PART 1 — Deterministic Authority Kernel (DAK)
// ============================================================
// Role:    Absolute execution authority, irreversible sealing
// Banned:  Policy evaluation, content inspection
// ============================================================

export enum KernelState {
  INIT = 'INIT',
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  DEGRADED = 'DEGRADED',
  FAILED = 'FAILED',
  SEALED = 'SEALED',
  TERMINATED = 'TERMINATED',
}

export enum KernelEvent {
  BOOT = 'BOOT',
  START = 'START',
  EXECUTE = 'EXECUTE',
  HEARTBEAT = 'HEARTBEAT',
  ERROR = 'ERROR',
  RECOVER = 'RECOVER',
  SEAL = 'SEAL',
  SHUTDOWN = 'SHUTDOWN',
}

export enum ExecutionVerdict {
  ALLOW = 'ALLOW',
  DOWNGRADE = 'DOWNGRADE',
  BLOCK = 'BLOCK',
  SEAL = 'SEAL',
}

export interface KernelSnapshot {
  timestamp: number;
  state: KernelState;
  reason: string;
  meta: Record<string, unknown>;
  hash: string;
}

function snapshotHash(ts: number, state: KernelState, reason: string, meta: Record<string, unknown>): string {
  const raw = `${ts}|${state}|${reason}|${JSON.stringify(meta)}`;
  return sha256(raw).slice(0, 32);
}

export class DeterministicAuthorityKernel {
  kernelId: string;
  state: KernelState = KernelState.INIT;
  lastError: string | null = null;
  executionCount = 0;
  sealReason: string | null = null;
  snapshots: KernelSnapshot[] = [];

  private handlers: Record<KernelEvent, (payload: Record<string, unknown>) => void>;

  constructor() {
    this.kernelId = `nsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.handlers = {
      [KernelEvent.BOOT]: (p) => this.onBoot(p),
      [KernelEvent.START]: (p) => this.onStart(p),
      [KernelEvent.EXECUTE]: (p) => this.onExecute(p),
      [KernelEvent.HEARTBEAT]: (p) => this.onHeartbeat(p),
      [KernelEvent.ERROR]: (p) => this.onError(p),
      [KernelEvent.RECOVER]: (p) => this.onRecover(p),
      [KernelEvent.SEAL]: (p) => this.onSeal(p),
      [KernelEvent.SHUTDOWN]: (p) => this.onShutdown(p),
    };
    this.snap('kernel_init', {});
  }

  private snap(reason: string, meta: Record<string, unknown>): void {
    const ts = Date.now();
    const h = snapshotHash(ts, this.state, reason, meta);
    this.snapshots.push({ timestamp: ts, state: this.state, reason, meta, hash: h });
  }

  private transition(newState: KernelState, reason: string, meta: Record<string, unknown> = {}): void {
    if (this.state === KernelState.SEALED) {
      throw new Error('Kernel is SEALED and immutable');
    }
    this.state = newState;
    this.snap(reason, meta);
  }

  dispatch(event: KernelEvent, payload: Record<string, unknown> = {}): void {
    const handler = this.handlers[event];
    if (!handler) { throw new Error(`Unhandled event: ${event}`); }
    try {
      handler(payload);
    } catch (e) {
      this.lastError = String(e);
      if (this.state !== KernelState.SEALED) {
        this.transition(KernelState.FAILED, 'kernel_exception', { error: this.lastError });
      }
      throw e;
    }
  }

  private onBoot(_p: Record<string, unknown>): void {
    if (this.state !== KernelState.INIT) throw new Error('BOOT only from INIT');
    this.transition(KernelState.IDLE, 'boot');
  }

  private onStart(_p: Record<string, unknown>): void {
    if (this.state !== KernelState.IDLE && this.state !== KernelState.DEGRADED) {
      throw new Error('START invalid in current state');
    }
    this.transition(KernelState.RUNNING, 'start');
  }

  private onExecute(p: Record<string, unknown>): void {
    if (this.state !== KernelState.RUNNING && this.state !== KernelState.DEGRADED) {
      throw new Error('EXECUTE invalid in current state');
    }
    const verdict = p.verdict as ExecutionVerdict;
    if (!verdict) throw new Error('EXECUTE requires verdict');

    if (verdict === ExecutionVerdict.ALLOW) {
      this.executionCount++;
      this.snap('execute_allow', { count: this.executionCount });
    } else if (verdict === ExecutionVerdict.DOWNGRADE) {
      this.executionCount++;
      this.transition(KernelState.DEGRADED, 'execute_downgrade', { count: this.executionCount });
    } else if (verdict === ExecutionVerdict.BLOCK) {
      this.transition(KernelState.IDLE, 'execute_block');
    } else if (verdict === ExecutionVerdict.SEAL) {
      this.transition(KernelState.SEALED, 'execute_seal', { count: this.executionCount });
    }
  }

  private onHeartbeat(_p: Record<string, unknown>): void {
    if (this.state !== KernelState.RUNNING && this.state !== KernelState.DEGRADED) {
      throw new Error('HEARTBEAT invalid');
    }
    this.snap('heartbeat', {});
  }

  private onError(p: Record<string, unknown>): void {
    this.lastError = String(p.reason ?? 'unspecified');
    this.transition(KernelState.DEGRADED, 'error_signal', { reason: this.lastError });
  }

  private onRecover(_p: Record<string, unknown>): void {
    if (this.state !== KernelState.DEGRADED && this.state !== KernelState.FAILED) {
      throw new Error('RECOVER invalid');
    }
    this.lastError = null;
    this.transition(KernelState.IDLE, 'recover');
  }

  private onSeal(p: Record<string, unknown>): void {
    this.sealReason = String(p.reason ?? 'external_seal');
    this.transition(KernelState.SEALED, 'seal', { reason: this.sealReason });
  }

  private onShutdown(_p: Record<string, unknown>): void {
    this.transition(KernelState.TERMINATED, 'shutdown');
  }

  stats(): Record<string, unknown> {
    return {
      kernelId: this.kernelId,
      state: this.state,
      executions: this.executionCount,
      lastError: this.lastError,
      sealed: this.state === KernelState.SEALED,
      snapshots: this.snapshots.length,
    };
  }
}

// ============================================================
// PART 2 — Sovereign Policy Engine (SPE)
// ============================================================
// Role:    Risk accumulation + decay + verdict emission
// Banned:  Execution, kernel mutation, user output
// ============================================================

export enum RiskLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum PolicyHint {
  NONE = 'NONE',
  SPIKE_WARNING = 'SPIKE_WARNING',
  STRUCTURE_DRIFT = 'STRUCTURE_DRIFT',
  ENTROPY_SURGE = 'ENTROPY_SURGE',
  REPEAT_PATTERN = 'REPEAT_PATTERN',
  ADVERSARIAL_BEHAVIOR = 'ADVERSARIAL_BEHAVIOR',
}

interface PolicyRule {
  maxScore: number;
  verdict: ExecutionVerdict;
  risk: RiskLevel;
}

export interface PolicySnapshot {
  timestamp: number;
  risk: RiskLevel;
  verdict: ExecutionVerdict;
  score: number;
  reason: string;
  hash: string;
}

export class SovereignPolicyEngine {
  riskScore = 0;
  riskLevel: RiskLevel = RiskLevel.NONE;
  errorCount = 0;
  spikeCount = 0;
  adversarialCount = 0;
  lastUpdate: number = Date.now();
  history: PolicySnapshot[] = [];

  private rules: PolicyRule[] = [
    { maxScore: 0.9, verdict: ExecutionVerdict.ALLOW, risk: RiskLevel.LOW },
    { maxScore: 2.0, verdict: ExecutionVerdict.DOWNGRADE, risk: RiskLevel.MEDIUM },
    { maxScore: 4.0, verdict: ExecutionVerdict.BLOCK, risk: RiskLevel.HIGH },
    { maxScore: Infinity, verdict: ExecutionVerdict.SEAL, risk: RiskLevel.CRITICAL },
  ];

  evaluate(options: { error?: boolean; hint?: PolicyHint }): ExecutionVerdict {
    const { error = false, hint = PolicyHint.NONE } = options;
    const now = Date.now();

    this.applyDecay(now);
    this.accumulate(error, hint);
    const { verdict, risk } = this.judge();

    const ts = now;
    const raw = `${ts}|${risk}|${verdict}|${this.riskScore.toFixed(4)}|${hint}`;
    const h = sha256(raw).slice(0, 32);

    this.history.push({ timestamp: ts, risk, verdict, score: this.riskScore, reason: hint, hash: h });
    return verdict;
  }

  private accumulate(error: boolean, hint: PolicyHint): void {
    if (error) { this.errorCount++; this.riskScore += 1.2; }

    const hintScores: Partial<Record<PolicyHint, { score: number; field: 'spikeCount' | 'adversarialCount' }>> = {
      [PolicyHint.SPIKE_WARNING]: { score: 0.6, field: 'spikeCount' },
      [PolicyHint.STRUCTURE_DRIFT]: { score: 0.9, field: 'spikeCount' },
      [PolicyHint.ENTROPY_SURGE]: { score: 1.1, field: 'spikeCount' },
      [PolicyHint.REPEAT_PATTERN]: { score: 0.8, field: 'adversarialCount' },
      [PolicyHint.ADVERSARIAL_BEHAVIOR]: { score: 1.5, field: 'adversarialCount' },
    };

    const entry = hintScores[hint];
    if (entry) {
      this[entry.field]++;
      this.riskScore += entry.score;
    }
  }

  private applyDecay(now: number): void {
    const elapsed = now - this.lastUpdate;
    if (elapsed < 30_000) return; // 30s minimum
    const decaySteps = Math.floor(elapsed / 60_000);
    if (decaySteps > 0) {
      this.riskScore = Math.max(0, this.riskScore - 0.15 * decaySteps);
      this.lastUpdate = now;
    }
  }

  private judge(): { verdict: ExecutionVerdict; risk: RiskLevel } {
    for (const rule of this.rules) {
      if (this.riskScore <= rule.maxScore) {
        this.riskLevel = rule.risk;
        return { verdict: rule.verdict, risk: rule.risk };
      }
    }
    this.riskLevel = RiskLevel.CRITICAL;
    return { verdict: ExecutionVerdict.SEAL, risk: RiskLevel.CRITICAL };
  }

  stats(): Record<string, unknown> {
    return {
      riskLevel: this.riskLevel,
      riskScore: +this.riskScore.toFixed(4),
      errors: this.errorCount,
      spikes: this.spikeCount,
      adversarial: this.adversarialCount,
      snapshots: this.history.length,
    };
  }
}

// ============================================================
// PART 3 — Authority & Strike Gateway (ASG)
// ============================================================
// Role:    Input canonicalization, strike lifecycle, pattern detection
// Banned:  Verdict, kernel mutation, policy
// ============================================================

export enum GatewaySignal {
  PASS = 'PASS',
  SOFT_FLAG = 'SOFT_FLAG',
  STRIKE = 'STRIKE',
  HARD_FLAG = 'HARD_FLAG',
  BLOCKED = 'BLOCKED',
}

const STRIKE_TEMPBAN = 3;
const STRIKE_PERMBAN = 5;
const STRIKE_DECAY_INTERVAL = 86_400_000; // 24h in ms
const TEMPBAN_DURATION = 2_592_000_000;   // 30d in ms
const MAX_TEXT_LENGTH = 6000;

interface UserRecord {
  strikes: number;
  blockedUntil: number;
  lastSeen: number;
}

const META_ATTACK = /system|instruction|ignore|override|prompt/i;
const HALLU_PROBE = /hallu|허구|거짓말|만들어|fabricat/i;
const REPETITION = /(.)\1{6,}/;

export class AuthorityStrikeGateway {
  private registry = new Map<string, UserRecord>();

  canonicalize(text: string): string {
    return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  inspect(payload: string, subjectId: string): { signal: GatewaySignal; strikes: number; reason: string } {
    const now = Date.now();

    if (!payload || payload.length > MAX_TEXT_LENGTH) {
      return { signal: GatewaySignal.BLOCKED, strikes: 0, reason: 'length_violation' };
    }

    let user = this.registry.get(subjectId);
    if (!user) {
      user = { strikes: 0, blockedUntil: 0, lastSeen: now };
      this.registry.set(subjectId, user);
    }

    // Decay
    const elapsed = now - user.lastSeen;
    if (elapsed > 0) {
      const decay = Math.floor(elapsed / STRIKE_DECAY_INTERVAL);
      if (decay > 0) { user.strikes = Math.max(0, user.strikes - decay); }
    }
    user.lastSeen = now;

    if (now < user.blockedUntil) {
      return { signal: GatewaySignal.BLOCKED, strikes: user.strikes, reason: 'active_ban' };
    }

    const canon = this.canonicalize(payload);
    let signal = GatewaySignal.PASS;
    let reason = 'clean';

    if (META_ATTACK.test(canon)) {
      user.strikes++; signal = GatewaySignal.STRIKE; reason = 'meta_attack';
    } else if (HALLU_PROBE.test(canon)) {
      user.strikes++; signal = GatewaySignal.STRIKE; reason = 'hallucination_probe';
    } else if (REPETITION.test(canon)) {
      signal = GatewaySignal.SOFT_FLAG; reason = 'repetition_pattern';
    }

    if (user.strikes >= STRIKE_PERMBAN) {
      user.blockedUntil = Infinity; signal = GatewaySignal.BLOCKED; reason = 'permaban';
    } else if (user.strikes >= STRIKE_TEMPBAN) {
      user.blockedUntil = now + TEMPBAN_DURATION; signal = GatewaySignal.HARD_FLAG; reason = 'tempban';
    }

    return { signal, strikes: user.strikes, reason };
  }

  stats(): Record<string, unknown> {
    const now = Date.now();
    return {
      subjects: this.registry.size,
      activeBans: [...this.registry.values()].filter(u => now < u.blockedUntil).length,
    };
  }
}

// ============================================================
// PART 4 — Immutable Audit Ledger (IARL)
// ============================================================
// Role:    Append-only hash chain, chain verification, recovery advisor
// Banned:  Record alteration, policy judgment, kernel actions
// ============================================================

export enum AuditEventType {
  GATEWAY_SIGNAL = 'GATEWAY_SIGNAL',
  POLICY_VERDICT = 'POLICY_VERDICT',
  KERNEL_TRANSITION = 'KERNEL_TRANSITION',
  RECOVERY_RECOMMEND = 'RECOVERY_RECOMMEND',
  SYSTEM_SEALED = 'SYSTEM_SEALED',
  SHUTDOWN = 'SHUTDOWN',
}

export enum RecoveryLevel {
  NONE = 'NONE',
  RESET = 'RESET',
  SAFE_RESTART = 'SAFE_RESTART',
  FULL_SEAL = 'FULL_SEAL',
}

export interface AuditRecord {
  index: number;
  timestamp: number;
  event: AuditEventType;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

function recordHash(index: number, ts: number, event: AuditEventType, payload: Record<string, unknown>, prevHash: string): string {
  const raw = `${index}|${ts}|${event}|${JSON.stringify(payload)}|${prevHash}`;
  return sha256(raw);
}

export class ImmutableAuditLedger {
  private records: AuditRecord[] = [];
  private genesisHash: string;

  constructor() {
    this.genesisHash = sha256('NSG_IARL_GENESIS_v1.0');
  }

  append(event: AuditEventType, payload: Record<string, unknown>): AuditRecord {
    const index = this.records.length;
    const prev = this.records.length ? this.records[this.records.length - 1].hash : this.genesisHash;
    const ts = Date.now();
    const h = recordHash(index, ts, event, payload, prev);

    const record: AuditRecord = { index, timestamp: ts, event, payload, prevHash: prev, hash: h };
    this.records.push(record);
    return record;
  }

  verify(): boolean {
    let prev = this.genesisHash;
    for (const r of this.records) {
      const expected = recordHash(r.index, r.timestamp, r.event, r.payload, prev);
      if (r.prevHash !== prev || r.hash !== expected) return false;
      prev = r.hash;
    }
    return true;
  }

  export(): AuditRecord[] { return [...this.records]; }

  stats(): Record<string, unknown> {
    return { records: this.records.length, integrityOk: this.verify() };
  }

  recommendRecovery(): RecoveryLevel {
    const recent = this.records.slice(-10);
    const critical = recent.filter(r =>
      r.event === AuditEventType.SYSTEM_SEALED || r.event === AuditEventType.KERNEL_TRANSITION
    ).length;

    let level: RecoveryLevel;
    if (critical >= 3) level = RecoveryLevel.FULL_SEAL;
    else if (critical >= 2) level = RecoveryLevel.SAFE_RESTART;
    else if (critical >= 1) level = RecoveryLevel.RESET;
    else level = RecoveryLevel.NONE;

    this.append(AuditEventType.RECOVERY_RECOMMEND, { level });
    return level;
  }
}

// ============================================================
// PART 5 — Spike Observer (BSSO)
// ============================================================
// Role:    Metric delta observation (advisory only)
// Banned:  Verdicts, blocking, mutation
// ============================================================

export interface MetricSnapshot {
  functionCount: number;
  avgLineLength: number;
  maxNestingDepth: number;
  branchCount: number;
  exceptionDensity: number;
  entropyScore: number;
  hash: string;
}

export enum SpikeHint {
  NONE = 'NONE',
  SPIKE_WARNING = 'SPIKE_WARNING',
  STRUCTURE_DRIFT = 'STRUCTURE_DRIFT',
  ENTROPY_SURGE = 'ENTROPY_SURGE',
}

export class SpikeObserver {
  private spikeThreshold: number;
  private entropyThreshold: number;

  constructor(spikeThreshold = 2.5, entropyThreshold = 0.35) {
    this.spikeThreshold = spikeThreshold;
    this.entropyThreshold = entropyThreshold;
  }

  snapshot(code: string): MetricSnapshot {
    const lines = code.split('\n');
    const functions = (code.match(/\bfunction\b|=>\s*[{(]/g) ?? []).length;
    const branches = (code.match(/\bif\b|\belse\b|\bswitch\b|\bcase\b/g) ?? []).length;
    const exceptions = (code.match(/\bcatch\b/g) ?? []).length;
    const avgLen = lines.reduce((s, l) => s + l.length, 0) / Math.max(lines.length, 1);
    const depth = this.estimateDepth(lines);
    const entropy = this.entropy(code);

    const values = { functions, branches, exceptions, avgLen: +avgLen.toFixed(2), depth, entropy: +entropy.toFixed(4) };
    const raw = Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join('|');
    const h = sha256(raw).slice(0, 32);

    return {
      functionCount: functions,
      avgLineLength: avgLen,
      maxNestingDepth: depth,
      branchCount: branches,
      exceptionDensity: exceptions / Math.max(lines.length, 1),
      entropyScore: entropy,
      hash: h,
    };
  }

  observe(prev: MetricSnapshot | null, curr: MetricSnapshot): SpikeHint {
    if (!prev) return SpikeHint.NONE;

    const d = (a: number, b: number): number => a === 0 ? 0 : Math.abs(b - a) / Math.max(Math.abs(a), 1);

    const deltas = {
      functions: d(prev.functionCount, curr.functionCount),
      branches: d(prev.branchCount, curr.branchCount),
      depth: d(prev.maxNestingDepth, curr.maxNestingDepth),
      entropy: d(prev.entropyScore, curr.entropyScore),
    };

    if (deltas.depth > this.spikeThreshold) return SpikeHint.STRUCTURE_DRIFT;
    if (deltas.entropy > this.entropyThreshold) return SpikeHint.ENTROPY_SURGE;
    if (Math.max(...Object.values(deltas)) > this.spikeThreshold) return SpikeHint.SPIKE_WARNING;
    return SpikeHint.NONE;
  }

  private estimateDepth(lines: string[]): number {
    let depth = 0, max = 0;
    for (const l of lines) {
      const s = l.trimStart();
      if (/^(if|for|while|function|class|switch)\b/.test(s) || s.includes('{')) { depth++; max = Math.max(max, depth); }
      if (s.includes('}') || /^(return|break|continue)\b/.test(s)) { depth = Math.max(0, depth - 1); }
    }
    return max;
  }

  private entropy(text: string): number {
    if (!text.length) return 0;
    const freq = new Map<string, number>();
    for (const c of text) { freq.set(c, (freq.get(c) ?? 0) + 1); }
    let e = 0;
    for (const v of freq.values()) {
      const p = v / text.length;
      e -= p * Math.log2(p);
    }
    return e;
  }
}

// ============================================================
// SOVEREIGN GATE FACADE
// ============================================================

export class SovereignGate {
  readonly kernel: DeterministicAuthorityKernel;
  readonly policy: SovereignPolicyEngine;
  readonly gateway: AuthorityStrikeGateway;
  readonly ledger: ImmutableAuditLedger;
  readonly spikeObserver: SpikeObserver;

  constructor() {
    this.kernel = new DeterministicAuthorityKernel();
    this.policy = new SovereignPolicyEngine();
    this.gateway = new AuthorityStrikeGateway();
    this.ledger = new ImmutableAuditLedger();
    this.spikeObserver = new SpikeObserver();

    this.kernel.dispatch(KernelEvent.BOOT);
    this.kernel.dispatch(KernelEvent.START);
  }

  /**
   * Full pipeline: Gateway → Policy → Kernel → Ledger
   */
  process(text: string, subjectId: string = 'default'): {
    gatewaySignal: GatewaySignal;
    verdict: ExecutionVerdict;
    kernelState: KernelState;
    riskLevel: RiskLevel;
  } {
    // 1. Gateway inspection
    const gw = this.gateway.inspect(text, subjectId);
    this.ledger.append(AuditEventType.GATEWAY_SIGNAL, { signal: gw.signal, reason: gw.reason });

    if (gw.signal === GatewaySignal.BLOCKED) {
      return { gatewaySignal: gw.signal, verdict: ExecutionVerdict.BLOCK, kernelState: this.kernel.state, riskLevel: this.policy.riskLevel };
    }

    // 2. Policy evaluation
    const hint = gw.signal === GatewaySignal.STRIKE ? PolicyHint.ADVERSARIAL_BEHAVIOR
      : gw.signal === GatewaySignal.SOFT_FLAG ? PolicyHint.REPEAT_PATTERN
      : PolicyHint.NONE;

    const verdict = this.policy.evaluate({ error: false, hint });
    this.ledger.append(AuditEventType.POLICY_VERDICT, { verdict, hint, score: this.policy.riskScore });

    // 3. Kernel execution
    if (this.kernel.state !== KernelState.SEALED && this.kernel.state !== KernelState.TERMINATED) {
      this.kernel.dispatch(KernelEvent.EXECUTE, { verdict });
      this.ledger.append(AuditEventType.KERNEL_TRANSITION, { state: this.kernel.state });
    }

    return {
      gatewaySignal: gw.signal,
      verdict,
      kernelState: this.kernel.state,
      riskLevel: this.policy.riskLevel,
    };
  }

  stats(): Record<string, unknown> {
    return {
      kernel: this.kernel.stats(),
      policy: this.policy.stats(),
      gateway: this.gateway.stats(),
      ledger: this.ledger.stats(),
    };
  }
}
