/**
 * Prompt Composer — 시스템 프롬프트 조합 + 엔진 메타데이터.
 *
 * ResolvedNoaProfile + 타겟 → 어댑터 호출 + 엔진 상태 메타 부착.
 */

import type { ResolvedNoaProfile } from "../noa/compiler/resolve";
import type { SessionStatus } from "../noa/runtime/session";
import { exportForClaude } from "../noa/adapters/claude";
import { exportForGpt } from "../noa/adapters/gpt";
import { exportForCopilot } from "../noa/adapters/copilot";

export type PromptTarget = "claude" | "gpt" | "copilot";

export function composeSystemPrompt(
  resolved: ResolvedNoaProfile,
  status: SessionStatus,
  target: PromptTarget = "copilot"
): string {
  let base: string;

  switch (target) {
    case "claude":
      base = exportForClaude(resolved);
      break;
    case "gpt":
      base = exportForGpt(resolved);
      break;
    case "copilot":
    default:
      base = exportForCopilot(resolved);
      break;
  }

  const meta = buildEngineMeta(status);
  return `${base}\n\n${meta}`;
}

function buildEngineMeta(status: SessionStatus): string {
  const lines: string[] = [
    "<!-- NOA Engine Context (do not remove) -->",
  ];

  if (status.activeEngines.length > 0) {
    lines.push(`Active engines: ${status.activeEngines.join(", ")}`);
  }
  if (status.hfcpScore != null) {
    lines.push(`HFCP score: ${status.hfcpScore} (${status.hfcpVerdict ?? "—"})`);
  }
  if (status.ehLevel) {
    lines.push(`EH confidence: ${status.ehLevel}`);
  }
  if (status.hcrfVerdict) {
    lines.push(`HCRF mode: ${status.hcrfVerdict}`);
  }
  if (status.sovereignKernelState) {
    lines.push(`NSG kernel: ${status.sovereignKernelState}`);
  }
  if (status.rclLevel != null) {
    lines.push(`RCL level: ${status.rclLevel}`);
  }

  return lines.join("\n");
}
