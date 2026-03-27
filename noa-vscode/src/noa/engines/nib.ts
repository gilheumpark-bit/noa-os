// ============================================================
// NOA Invariant Bridge (NIB) v1.0 — TypeScript Port
// 3 PARTS: Observation Adapter → Feature Core → Event Emitter
// ============================================================
// Purpose: Version-agnostic temporal pattern analysis
// - Sliding window over session turns
// - 7 invariant features (delta, trend, persistence, volatility, dispersion, recovery, complexity)
// - Shape-based event classification (no absolute thresholds)
// ============================================================

import { createHash } from 'crypto';

// ============================================================
// PART 1 — Invariant Observation Adapter (IOA)
// ============================================================
// Role:    Normalize heterogeneous signals into raw features
// Banned:  Classification, thresholds, event emission
// ============================================================

export interface RawObservation {
  timestamp: number;
  signal: number;
  baseline: number;
  variance: number;
  magnitude: number;
  sourceVersion: string;
  fingerprint: string;
}

export interface ObservationPayload {
  [key: string]: number | number[];
}

export interface ObservationAdapter {
  version: string;
  adapt(payload: ObservationPayload): { signal: number; baseline: number; variance: number; magnitude: number };
}

// --- Adapters for different signal sources ---

class HfcpScoreAdapter implements ObservationAdapter {
  version = 'hfcp_score';
  adapt(payload: ObservationPayload) {
    const score = Number(payload.score ?? 0);
    const prev = Number(payload.prev ?? score);
    return {
      signal: score,
      baseline: prev,
      variance: Math.abs(score - prev),
      magnitude: Math.abs(score - 50), // distance from neutral
    };
  }
}

class EhRiskAdapter implements ObservationAdapter {
  version = 'eh_risk';
  adapt(payload: ObservationPayload) {
    const risk = Number(payload.risk ?? 0);
    const threshold = Number(payload.threshold ?? 30);
    return {
      signal: risk,
      baseline: threshold,
      variance: Math.abs(risk - threshold),
      magnitude: risk,
    };
  }
}

class HcrfPressureAdapter implements ObservationAdapter {
  version = 'hcrf_pressure';
  adapt(payload: ObservationPayload) {
    const pressure = Number(payload.pressure ?? 0);
    const cap = Number(payload.cap ?? 140);
    return {
      signal: pressure,
      baseline: cap * 0.5,
      variance: Math.abs(pressure - cap * 0.5),
      magnitude: pressure / Math.max(cap, 1),
    };
  }
}

class TextLengthAdapter implements ObservationAdapter {
  version = 'text_length';
  adapt(payload: ObservationPayload) {
    const len = Number(payload.length ?? 0);
    const avg = Number(payload.avgLength ?? len);
    return {
      signal: len,
      baseline: avg,
      variance: Math.abs(len - avg),
      magnitude: Math.abs(len - avg) / Math.max(avg, 1),
    };
  }
}

function fingerprint(values: Record<string, number>): string {
  const raw = Object.keys(values).sort().map(k => `${k}:${values[k].toFixed(6)}`).join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export class InvariantObservationAdapter {
  private adapters = new Map<string, ObservationAdapter>();

  constructor() {
    for (const a of [new HfcpScoreAdapter(), new EhRiskAdapter(), new HcrfPressureAdapter(), new TextLengthAdapter()]) {
      this.adapters.set(a.version, a);
    }
  }

  registerAdapter(adapter: ObservationAdapter): void {
    this.adapters.set(adapter.version, adapter);
  }

  adapt(sourceVersion: string, payload: ObservationPayload): RawObservation {
    const adapter = this.adapters.get(sourceVersion);
    if (!adapter) { throw new Error(`NIB: Adapter not found: ${sourceVersion}`); }

    const raw = adapter.adapt(payload);
    return {
      timestamp: Date.now(),
      ...raw,
      sourceVersion,
      fingerprint: fingerprint(raw),
    };
  }

  listAdapters(): string[] {
    return [...this.adapters.keys()];
  }
}

// ============================================================
// PART 2 — Invariant Feature Core (IFC)
// ============================================================
// Role:    Compute 7 version-agnostic features from sliding window
// Banned:  Classification, event emission, thresholds
// ============================================================

export interface InvariantFeatureVector {
  timestamp: number;
  delta: number;
  trend: number;
  persistence: number;
  volatility: number;
  dispersion: number;
  recoveryIndex: number;
  complexity: number;
  fingerprint: string;
}

class FeatureWindow {
  private buffer: number[] = [];
  constructor(private maxSize: number = 12) {}

  push(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > this.maxSize) { this.buffer.shift(); }
  }

  values(): number[] { return [...this.buffer]; }
  get length(): number { return this.buffer.length; }

  mean(): number {
    if (!this.buffer.length) return 0;
    return this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
  }

  std(): number {
    if (this.buffer.length < 2) return 0;
    const m = this.mean();
    const variance = this.buffer.reduce((sum, v) => sum + (v - m) ** 2, 0) / this.buffer.length;
    return Math.sqrt(variance);
  }

  slope(): number {
    if (this.buffer.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < this.buffer.length; i++) {
      sum += this.buffer[i] - this.buffer[i - 1];
    }
    return sum / (this.buffer.length - 1);
  }
}

export class InvariantFeatureCore {
  private signalWin: FeatureWindow;
  private magnitudeWin: FeatureWindow;
  private varianceWin: FeatureWindow;
  private baselineWin: FeatureWindow;

  constructor(windowSize: number = 12) {
    this.signalWin = new FeatureWindow(windowSize);
    this.magnitudeWin = new FeatureWindow(windowSize);
    this.varianceWin = new FeatureWindow(windowSize);
    this.baselineWin = new FeatureWindow(windowSize);
  }

  ingest(raw: RawObservation): InvariantFeatureVector {
    this.signalWin.push(raw.signal);
    this.magnitudeWin.push(raw.magnitude);
    this.varianceWin.push(raw.variance);
    this.baselineWin.push(raw.baseline);

    const features = {
      delta: this.delta(),
      trend: this.signalWin.slope(),
      persistence: this.persistence(),
      volatility: this.varianceWin.std(),
      dispersion: this.dispersion(),
      recoveryIndex: this.recoveryIndex(),
      complexity: this.complexity(),
    };

    const fp = Object.keys(features).sort()
      .map(k => `${k}:${(features as any)[k].toFixed(6)}`).join('|');
    const hash = createHash('sha256').update(fp).digest('hex').slice(0, 28);

    return { timestamp: Date.now(), ...features, fingerprint: hash };
  }

  private delta(): number {
    const v = this.signalWin.values();
    return v.length < 2 ? 0 : v[v.length - 1] - v[v.length - 2];
  }

  private persistence(): number {
    const mags = this.magnitudeWin.values();
    if (!mags.length) return 0;
    const mean = this.magnitudeWin.mean();
    const sustained = mags.filter(m => m > mean).length;
    return sustained / mags.length;
  }

  private dispersion(): number {
    const sigStd = this.signalWin.std();
    const baseStd = this.baselineWin.std();
    return baseStd === 0 ? 0 : sigStd / baseStd;
  }

  private recoveryIndex(): number {
    const mags = this.magnitudeWin.values();
    if (mags.length < 3) return 1.0;
    const recent = mags.slice(-3);
    if (recent[0] === 0) return 1.0;
    return 1.0 - (recent[2] / Math.max(recent[0], 1e-6));
  }

  private complexity(): number {
    const vals = this.signalWin.values();
    if (!vals.length) return 0;
    const freq = new Map<number, number>();
    for (const v of vals) {
      const key = Math.round(v * 10);
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    const total = vals.length;
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  windowState(): { signal: number; variance: number; baseline: number } {
    return {
      signal: this.signalWin.length,
      variance: this.varianceWin.length,
      baseline: this.baselineWin.length,
    };
  }
}

// ============================================================
// PART 3 — Invariant Event Emitter (IEE)
// ============================================================
// Role:    Shape-based event classification (relative, no absolutes)
// Banned:  Policy, blocking, mutation
// ============================================================

export enum BridgeEvent {
  BACKGROUND = 'BACKGROUND',
  TRANSIENT_ANOMALY = 'TRANSIENT_ANOMALY',
  PERSISTENT_ANOMALY = 'PERSISTENT_ANOMALY',
  STRUCTURAL_VIOLATION = 'STRUCTURAL_VIOLATION',
}

export interface EventSnapshot {
  timestamp: number;
  event: BridgeEvent;
  confidence: number;
  contributingFeatures: Record<string, number>;
  fingerprint: string;
}

export class InvariantEventEmitter {
  private history: BridgeEvent[] = [];
  private maxHistory: number;

  constructor(historySize: number = 8) {
    this.maxHistory = historySize;
  }

  emit(feature: InvariantFeatureVector): EventSnapshot {
    const { event, confidence, factors } = this.classifyShape(feature);
    this.history.push(event);
    if (this.history.length > this.maxHistory) { this.history.shift(); }

    const fp = Object.keys(factors).sort()
      .map(k => `${k}:${factors[k].toFixed(6)}`).join('|');
    const hash = createHash('sha256').update(fp).digest('hex').slice(0, 28);

    return { timestamp: Date.now(), event, confidence, contributingFeatures: factors, fingerprint: hash };
  }

  private classifyShape(f: InvariantFeatureVector): { event: BridgeEvent; confidence: number; factors: Record<string, number> } {
    const dominance: Record<string, number> = {
      delta: Math.abs(f.delta),
      trend: Math.abs(f.trend),
      persistence: f.persistence,
      volatility: f.volatility,
      dispersion: f.dispersion,
      recoveryIndex: 1.0 - f.recoveryIndex,
      complexity: f.complexity,
    };

    const total = Object.values(dominance).reduce((a, b) => a + b, 0) || 1;
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(dominance)) {
      normalized[k] = v / total;
    }

    const sorted = Object.entries(normalized).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0][0];

    let event: BridgeEvent;

    if (f.persistence < 0.3 && f.recoveryIndex > 0.7) {
      event = BridgeEvent.BACKGROUND;
    } else if ((primary === 'delta' || primary === 'volatility') && f.recoveryIndex >= 0.5) {
      event = BridgeEvent.TRANSIENT_ANOMALY;
    } else if (f.persistence >= 0.6 && ['trend', 'dispersion', 'complexity'].includes(primary)) {
      event = BridgeEvent.PERSISTENT_ANOMALY;
    } else {
      event = BridgeEvent.STRUCTURAL_VIOLATION;
    }

    return { event, confidence: normalized[primary] ?? 0, factors: normalized };
  }

  recentEvents(): BridgeEvent[] { return [...this.history]; }

  summary(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of Object.values(BridgeEvent)) { counts[e] = 0; }
    for (const e of this.history) { counts[e] = (counts[e] ?? 0) + 1; }
    return counts;
  }
}

// ============================================================
// NIB FACADE — Full Pipeline
// ============================================================

export class InvariantBridge {
  readonly adapter: InvariantObservationAdapter;
  readonly featureCore: InvariantFeatureCore;
  readonly emitter: InvariantEventEmitter;

  constructor(windowSize: number = 12, historySize: number = 8) {
    this.adapter = new InvariantObservationAdapter();
    this.featureCore = new InvariantFeatureCore(windowSize);
    this.emitter = new InvariantEventEmitter(historySize);
  }

  process(sourceVersion: string, payload: ObservationPayload): EventSnapshot {
    const raw = this.adapter.adapt(sourceVersion, payload);
    const features = this.featureCore.ingest(raw);
    return this.emitter.emit(features);
  }

  diagnostics(): {
    adapters: string[];
    windowState: ReturnType<InvariantFeatureCore['windowState']>;
    recentEvents: BridgeEvent[];
    eventSummary: Record<string, number>;
  } {
    return {
      adapters: this.adapter.listAdapters(),
      windowState: this.featureCore.windowState(),
      recentEvents: this.emitter.recentEvents(),
      eventSummary: this.emitter.summary(),
    };
  }
}
