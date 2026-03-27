import type { ResolvedNoaProfile } from "../compiler/resolve";

/**
 * Ollama / LM Studio config JSON 변환.
 */
export function exportForLocal(resolved: ResolvedNoaProfile): string {
  const { profile } = resolved;

  const config = {
    system: buildSystemPrompt(resolved),
    parameters: {
      temperature: profile.engines?.hfcp?.mode === "CREATIVE" ? 0.9 : 0.7,
    },
  };

  return JSON.stringify(config, null, 2);
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
