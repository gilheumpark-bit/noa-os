import type { ResolvedNoaProfile } from "../compiler/resolve";

/**
 * GitHub Copilot Chat instructions 변환.
 */
export function exportForCopilot(resolved: ResolvedNoaProfile): string {
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
