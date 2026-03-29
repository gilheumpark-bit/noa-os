import type { ResolvedNoaProfile } from "./resolve";
import type { CompatibilityTarget } from "../schema/noa-schema";
import { exportForClaude } from "../adapters/claude";
import { exportForGpt } from "../adapters/gpt";
import { exportForLocal } from "../adapters/local";
import { exportForCopilot } from "../adapters/copilot";

/**
 * 내보내기 결과물 — 어댑터별로 형태가 다름.
 */
export interface ExportArtifact {
  target: CompatibilityTarget;
  content: string;
  metadata: {
    sourceId: string;
    exportedAt: string;
    activeEngines: string[];
  };
}

type AdapterFn = (resolved: ResolvedNoaProfile, ...args: unknown[]) => string;

const ADAPTERS: Record<string, AdapterFn> = {
  claude: exportForClaude,
  gpt: exportForGpt,
  local: exportForLocal,
  copilot: exportForCopilot,
};

/**
 * ResolvedNoaProfile을 지정된 타겟에 맞게 내보내기.
 */
export function exportArtifact(
  resolved: ResolvedNoaProfile,
  target: CompatibilityTarget
): ExportArtifact {
  const adapter = ADAPTERS[target];
  if (!adapter) {
    throw new Error(`지원하지 않는 내보내기 대상: ${target}`);
  }

  return {
    target,
    content: adapter(resolved),
    metadata: {
      sourceId: resolved.profile.id,
      exportedAt: new Date().toISOString(),
      activeEngines: resolved.activeEngines,
    },
  };
}

/**
 * 모든 호환 타겟에 대해 내보내기.
 */
export function exportAll(resolved: ResolvedNoaProfile): ExportArtifact[] {
  const targets = resolved.profile.compatibility?.targets ?? ["claude", "gpt"];
  return targets.map((t) => exportArtifact(resolved, t));
}
