import type { NoaFile } from "../schema/noa-schema";
import type { NormalizedLayer } from "./normalize";
import { NoaLockViolationError } from "../schema/errors";

/**
 * Provenance: 각 필드가 어느 레이어에서 왔는지 추적.
 */
export interface ProvenanceEntry {
  field: string;
  value: unknown;
  source: string; // origin
  strategy: MergeStrategy;
}

export type MergeStrategy =
  | "override"
  | "monotonic_union"
  | "union"
  | "dedupe_append"
  | "deep_merge"
  | "boolean_max"
  | "replace";

export interface MergedResult {
  profile: NoaFile;
  provenance: ProvenanceEntry[];
}

/**
 * 설계서 §3 병합 규칙에 따라 다중 레이어를 병합.
 * 낮은 priority → 높은 priority 순서로 적용 (layers는 이미 정렬됨).
 */
export function mergeLayers(layers: NormalizedLayer[]): MergedResult {
  if (layers.length === 0) {
    throw new Error("병합할 레이어가 없습니다.");
  }

  const provenance: ProvenanceEntry[] = [];
  const activeLocks = new Set<string>();

  // 첫 레이어를 기본값으로
  let merged = structuredClone(layers[0].file);
  recordProvenance(provenance, merged, layers[0].origin);
  collectLocks(merged, activeLocks);

  // 나머지 레이어를 순서대로 병합
  for (let i = 1; i < layers.length; i++) {
    const layer = layers[i];
    merged = applyLayer(merged, layer.file, layer.origin, activeLocks, provenance);
    collectLocks(layer.file, activeLocks);
  }

  return { profile: merged, provenance };
}

function applyLayer(
  base: NoaFile,
  overlay: NoaFile,
  origin: string,
  locks: Set<string>,
  provenance: ProvenanceEntry[]
): NoaFile {
  const result = structuredClone(base);

  // meta: override
  if (overlay.meta) {
    checkLock("meta", locks, origin);
    result.meta = { ...result.meta, ...overlay.meta };
    provenance.push({ field: "meta", value: result.meta, source: origin, strategy: "override" });
  }

  // persona: override (필드별)
  if (overlay.persona) {
    if (overlay.persona.role) {
      checkLock("persona.role", locks, origin);
      result.persona = { ...result.persona, role: overlay.persona.role };
      provenance.push({ field: "persona.role", value: overlay.persona.role, source: origin, strategy: "override" });
    }
    if (overlay.persona.tone) {
      checkLock("persona.tone", locks, origin);
      if (!result.persona) result.persona = { role: "" };
      result.persona.tone = overlay.persona.tone;
      provenance.push({ field: "persona.tone", value: overlay.persona.tone, source: origin, strategy: "override" });
    }
    if (overlay.persona.audience) {
      if (!result.persona) result.persona = { role: "" };
      result.persona.audience = overlay.persona.audience;
      provenance.push({ field: "persona.audience", value: overlay.persona.audience, source: origin, strategy: "override" });
    }
  }

  // intent.tasks: dedupe append
  if (overlay.intent?.tasks && overlay.intent.tasks.length > 0) {
    const existing = result.intent?.tasks ?? [];
    const merged = dedupeAppend(existing, overlay.intent.tasks);
    if (!result.intent) result.intent = { tasks: [] };
    result.intent.tasks = merged;
    provenance.push({ field: "intent.tasks", value: merged, source: origin, strategy: "dedupe_append" });
  }

  // policies.safety.deny: monotonic union (제거 불가)
  if (overlay.policies?.safety?.deny) {
    const existing = result.policies?.safety?.deny ?? [];
    const merged = monotonicUnion(existing, overlay.policies.safety.deny);
    ensurePoliciesSafety(result);
    result.policies!.safety!.deny = merged;
    provenance.push({ field: "policies.safety.deny", value: merged, source: origin, strategy: "monotonic_union" });
  }

  // policies.safety.allow: union (deny와 충돌 시 deny 우선)
  if (overlay.policies?.safety?.allow) {
    const deny = result.policies?.safety?.deny ?? [];
    const existing = result.policies?.safety?.allow ?? [];
    const merged = union(existing, overlay.policies.safety.allow).filter(
      (item) => !deny.includes(item)
    );
    ensurePoliciesSafety(result);
    result.policies!.safety!.allow = merged;
    provenance.push({ field: "policies.safety.allow", value: merged, source: origin, strategy: "union" });
  }

  // policies.safety.locks: monotonic union
  if (overlay.policies?.safety?.locks) {
    const existing = result.policies?.safety?.locks ?? [];
    const merged = monotonicUnion(existing, overlay.policies.safety.locks);
    ensurePoliciesSafety(result);
    result.policies!.safety!.locks = merged;
    provenance.push({ field: "policies.safety.locks", value: merged, source: origin, strategy: "monotonic_union" });
  }

  // policies.safety.escalation.requiredOn: dedupe append
  if (overlay.policies?.safety?.escalation?.requiredOn) {
    const existing = result.policies?.safety?.escalation?.requiredOn ?? [];
    const merged = dedupeAppend(existing, overlay.policies.safety.escalation.requiredOn);
    ensurePoliciesSafety(result);
    if (!result.policies!.safety!.escalation) {
      result.policies!.safety!.escalation = { requiredOn: [] };
    }
    result.policies!.safety!.escalation.requiredOn = merged;
    provenance.push({ field: "policies.safety.escalation.requiredOn", value: merged, source: origin, strategy: "dedupe_append" });
  }

  // policies.citations.required: boolean max (true가 더 강함)
  if (overlay.policies?.citations?.required !== undefined) {
    checkLock("policies.citations.required", locks, origin);
    const current = result.policies?.citations?.required ?? false;
    const merged = current || overlay.policies.citations.required;
    if (!result.policies) result.policies = {};
    if (!result.policies.citations) result.policies.citations = {};
    result.policies.citations.required = merged;
    provenance.push({ field: "policies.citations.required", value: merged, source: origin, strategy: "boolean_max" });
  }

  // policies.uncertainty.style: override
  if (overlay.policies?.uncertainty?.style) {
    checkLock("policies.uncertainty.style", locks, origin);
    if (!result.policies) result.policies = {};
    if (!result.policies.uncertainty) result.policies.uncertainty = {};
    result.policies.uncertainty.style = overlay.policies.uncertainty.style;
    provenance.push({ field: "policies.uncertainty.style", value: overlay.policies.uncertainty.style, source: origin, strategy: "override" });
  }

  // engines: deep merge
  if (overlay.engines) {
    checkLock("engines", locks, origin);
    result.engines = deepMerge(result.engines ?? {}, overlay.engines) as NoaFile["engines"];
    provenance.push({ field: "engines", value: result.engines, source: origin, strategy: "deep_merge" });
  }

  // output.sections: replace
  if (overlay.output?.sections && overlay.output.sections.length > 0) {
    if (!result.output) result.output = { format: "markdown", sections: [] };
    result.output.sections = [...overlay.output.sections];
    provenance.push({ field: "output.sections", value: result.output.sections, source: origin, strategy: "replace" });
  }

  // output.format: override
  if (overlay.output?.format) {
    if (!result.output) result.output = { format: "markdown", sections: [] };
    result.output.format = overlay.output.format;
    provenance.push({ field: "output.format", value: overlay.output.format, source: origin, strategy: "override" });
  }

  // accessories.suggested: dedupe append
  if (overlay.accessories?.suggested && overlay.accessories.suggested.length > 0) {
    const existing = result.accessories?.suggested ?? [];
    const merged = dedupeAppend(existing, overlay.accessories.suggested);
    if (!result.accessories) result.accessories = { suggested: [] };
    result.accessories.suggested = merged;
    provenance.push({ field: "accessories.suggested", value: merged, source: origin, strategy: "dedupe_append" });
  }

  // compatibility: targets + local override
  if (overlay.compatibility) {
    if (overlay.compatibility.targets) {
      if (!result.compatibility) result.compatibility = { targets: [] };
      result.compatibility.targets = [...overlay.compatibility.targets];
      provenance.push({ field: "compatibility.targets", value: result.compatibility.targets, source: origin, strategy: "override" });
    }
    if (overlay.compatibility.local) {
      if (!result.compatibility) result.compatibility = { targets: [] };
      result.compatibility.local = { ...result.compatibility.local, ...overlay.compatibility.local };
      provenance.push({ field: "compatibility.local", value: result.compatibility.local, source: origin, strategy: "deep_merge" });
    }
  }

  return result;
}

// --- 병합 유틸리티 ---

function monotonicUnion(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing);
  for (const item of incoming) {
    set.add(item);
  }
  return [...set];
}

function union(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

function dedupeAppend(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const result = [...existing];
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function checkLock(field: string, locks: Set<string>, origin: string): void {
  if (locks.has(field)) {
    throw new NoaLockViolationError(field, origin);
  }
}

function collectLocks(file: NoaFile, locks: Set<string>): void {
  if (file.policies?.safety?.locks) {
    for (const lock of file.policies.safety.locks) {
      locks.add(lock);
    }
  }
}

function ensurePoliciesSafety(file: NoaFile): void {
  if (!file.policies) file.policies = {};
  if (!file.policies.safety) file.policies.safety = {};
}

function recordProvenance(
  provenance: ProvenanceEntry[],
  file: NoaFile,
  origin: string
): void {
  provenance.push({ field: "(base)", value: file.id, source: origin, strategy: "override" });
}
