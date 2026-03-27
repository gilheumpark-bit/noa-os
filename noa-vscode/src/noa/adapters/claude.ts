import type { ResolvedNoaProfile } from "../compiler/resolve";

/**
 * Claude system prompt 변환.
 */
export function exportForClaude(resolved: ResolvedNoaProfile): string {
  const { profile } = resolved;
  const lines: string[] = [];

  if (profile.persona?.role) {
    lines.push(`You are ${profile.persona.role}.`);
  }
  if (profile.persona?.tone) {
    lines.push(`Tone: ${profile.persona.tone}.`);
  }
  if (profile.persona?.audience) {
    lines.push(`Audience: ${profile.persona.audience}.`);
  }

  if (profile.intent?.tasks && profile.intent.tasks.length > 0) {
    lines.push("");
    lines.push("## Tasks");
    for (const task of profile.intent.tasks) {
      lines.push(`- ${task}`);
    }
  }

  const deny = resolved.effectiveDeny;
  if (deny.length > 0) {
    lines.push("");
    lines.push("## Restrictions (NEVER do these)");
    for (const d of deny) {
      lines.push(`- ${d}`);
    }
  }

  const escalation = profile.policies?.safety?.escalation?.requiredOn;
  if (escalation && escalation.length > 0) {
    lines.push("");
    lines.push("## Escalation Required");
    for (const e of escalation) {
      lines.push(`- ${e}`);
    }
  }

  if (profile.policies?.uncertainty?.style) {
    lines.push("");
    lines.push(`Uncertainty handling: ${profile.policies.uncertainty.style}`);
  }

  if (profile.policies?.citations?.required) {
    lines.push("Always cite sources.");
  }

  if (profile.output?.format) {
    lines.push("");
    lines.push(`Output format: ${profile.output.format}`);
  }
  if (profile.output?.sections && profile.output.sections.length > 0) {
    lines.push(`Sections: ${profile.output.sections.join(", ")}`);
  }

  return lines.join("\n");
}
