import type { ResolvedNoaProfile } from "./resolve";
import type { CompatibilityTarget } from "../schema/noa-schema";

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

// --- 어댑터 함수들 ---

type AdapterFn = (resolved: ResolvedNoaProfile) => string;

const ADAPTERS: Record<string, AdapterFn> = {
  claude: exportForClaude,
  gpt: exportForGpt,
  local: exportForLocal,
  copilot: exportForCopilot,
};

function exportForClaude(resolved: ResolvedNoaProfile): string {
  const { profile } = resolved;
  const lines: string[] = [];

  // System prompt 구성
  if (profile.persona?.role) {
    lines.push(`You are ${profile.persona.role}.`);
  }
  if (profile.persona?.tone) {
    lines.push(`Tone: ${profile.persona.tone}.`);
  }
  if (profile.persona?.audience) {
    lines.push(`Audience: ${profile.persona.audience}.`);
  }

  // Tasks
  if (profile.intent?.tasks && profile.intent.tasks.length > 0) {
    lines.push("");
    lines.push("## Tasks");
    for (const task of profile.intent.tasks) {
      lines.push(`- ${task}`);
    }
  }

  // Safety policies
  const deny = resolved.effectiveDeny;
  if (deny.length > 0) {
    lines.push("");
    lines.push("## Restrictions (NEVER do these)");
    for (const d of deny) {
      lines.push(`- ${d}`);
    }
  }

  // Escalation
  const escalation = profile.policies?.safety?.escalation?.requiredOn;
  if (escalation && escalation.length > 0) {
    lines.push("");
    lines.push("## Escalation Required");
    for (const e of escalation) {
      lines.push(`- ${e}`);
    }
  }

  // Uncertainty
  if (profile.policies?.uncertainty?.style) {
    lines.push("");
    lines.push(`Uncertainty handling: ${profile.policies.uncertainty.style}`);
  }

  // Citations
  if (profile.policies?.citations?.required) {
    lines.push("Always cite sources.");
  }

  // Output format
  if (profile.output?.format) {
    lines.push("");
    lines.push(`Output format: ${profile.output.format}`);
  }
  if (profile.output?.sections && profile.output.sections.length > 0) {
    lines.push(`Sections: ${profile.output.sections.join(", ")}`);
  }

  return lines.join("\n");
}

function exportForGpt(resolved: ResolvedNoaProfile): string {
  // GPT는 system message 형태 — Claude와 유사하지만 포맷이 약간 다름
  const { profile } = resolved;
  const parts: string[] = [];

  if (profile.persona?.role) {
    parts.push(`Role: ${profile.persona.role}`);
  }
  if (profile.persona?.tone) {
    parts.push(`Tone: ${profile.persona.tone}`);
  }

  if (profile.intent?.tasks && profile.intent.tasks.length > 0) {
    parts.push(`Tasks:\n${profile.intent.tasks.map((t) => `- ${t}`).join("\n")}`);
  }

  const deny = resolved.effectiveDeny;
  if (deny.length > 0) {
    parts.push(`Restrictions:\n${deny.map((d) => `- NEVER: ${d}`).join("\n")}`);
  }

  if (profile.policies?.citations?.required) {
    parts.push("Requirement: Always cite sources.");
  }

  if (profile.output?.format) {
    parts.push(`Output: ${profile.output.format}`);
  }

  return parts.join("\n\n");
}

function exportForLocal(resolved: ResolvedNoaProfile): string {
  // Ollama/LM Studio용 config JSON
  const { profile } = resolved;

  const config = {
    system: buildSystemPrompt(resolved),
    parameters: {
      temperature: profile.engines?.hfcp?.mode === "CREATIVE" ? 0.9 : 0.7,
    },
  };

  return JSON.stringify(config, null, 2);
}

function exportForCopilot(resolved: ResolvedNoaProfile): string {
  // GitHub Copilot Chat instructions
  const { profile } = resolved;
  const lines: string[] = [];

  lines.push("# Copilot Instructions");
  lines.push("");

  if (profile.persona?.role) {
    lines.push(`Act as: ${profile.persona.role}`);
  }

  const deny = resolved.effectiveDeny;
  if (deny.length > 0) {
    lines.push("");
    lines.push("## Do NOT");
    for (const d of deny) {
      lines.push(`- ${d}`);
    }
  }

  if (profile.intent?.tasks && profile.intent.tasks.length > 0) {
    lines.push("");
    lines.push("## Focus on");
    for (const task of profile.intent.tasks) {
      lines.push(`- ${task}`);
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(resolved: ResolvedNoaProfile): string {
  const { profile } = resolved;
  const parts: string[] = [];
  if (profile.persona?.role) parts.push(`You are ${profile.persona.role}.`);
  if (profile.persona?.tone) parts.push(`Tone: ${profile.persona.tone}.`);
  const deny = resolved.effectiveDeny;
  if (deny.length > 0) {
    parts.push(`Never: ${deny.join("; ")}.`);
  }
  return parts.join(" ");
}
