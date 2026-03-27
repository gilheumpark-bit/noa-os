import type { ResolvedNoaProfile } from "../compiler/resolve";

/**
 * OpenAI GPT system message 변환.
 */
export function exportForGpt(resolved: ResolvedNoaProfile): string {
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
