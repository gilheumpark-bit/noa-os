import * as vscode from "vscode";
import type { SessionManager, SessionStatus } from "../noa/runtime/session";
import { explainField } from "../noa/compiler/explain";
import { exportArtifact } from "../noa/compiler/export";
import type { CompatibilityTarget } from "../noa/schema/noa-schema";
import { LoopOutcome, EnforcementAction } from "../noa/runtime/verification-studio";

/**
 * Copilot Chat Participant — @noa 명령어 처리.
 * 세션 매니저와 연동하여 실제 wear/strip/swap/explain/status 동작.
 */

const PARTICIPANT_ID = "noa.chatParticipant";
const DEFAULT_SESSION = "default";

let sessionMgr: SessionManager | null = null;

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  manager: SessionManager
): void {
  sessionMgr = manager;

  if (!vscode.chat?.createChatParticipant) {
    console.warn("NOA: VS Code Chat Participant API 미지원 — @noa 명령 비활성");
    return;
  }

  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    handleChatRequest
  );
  participant.iconPath = new vscode.ThemeIcon("person");
  context.subscriptions.push(participant);
}

async function handleChatRequest(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken
): Promise<void> {
  if (!sessionMgr) {
    stream.markdown("NOA 세션 매니저가 초기화되지 않았습니다.");
    return;
  }

  const prompt = request.prompt.trim();
  const [command, ...args] = prompt.split(/\s+/);

  // 세션 없으면 자동 생성
  if (!sessionMgr.getSession(DEFAULT_SESSION)) {
    sessionMgr.createSession(DEFAULT_SESSION);
  }

  switch (command) {
    case "wear": {
      const name = args[0];
      if (!name) {
        stream.markdown("사용법: `@noa wear <preset-name>`");
        return;
      }
      try {
        sessionMgr.wear(DEFAULT_SESSION, name);
        const status = formatStatus(sessionMgr);
        stream.markdown(`👔 **${name}** 페르소나를 입었습니다.\n\n${status}`);
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "strip": {
      const name = args[0];
      if (!name) {
        stream.markdown("사용법: `@noa strip <preset-name>`");
        return;
      }
      try {
        sessionMgr.strip(DEFAULT_SESSION, name);
        const status = formatStatus(sessionMgr);
        stream.markdown(`🚫 **${name}** 페르소나를 벗었습니다.\n\n${status}`);
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "swap": {
      if (args.length < 2) {
        stream.markdown("사용법: `@noa swap <old> <new>`");
        return;
      }
      try {
        sessionMgr.swap(DEFAULT_SESSION, args[0], args[1]);
        const status = formatStatus(sessionMgr);
        stream.markdown(
          `🔄 **${args[0]}** → **${args[1]}** 교체 완료.\n\n${status}`
        );
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "explain": {
      const session = sessionMgr.getSession(DEFAULT_SESSION);
      if (!session?.resolved || !session.provenance) {
        stream.markdown("컴파일된 프로필이 없습니다. 먼저 `@noa wear`를 실행하세요.");
        return;
      }

      if (args.length > 0) {
        const fieldPath = args.join(".");
        const explanation = explainField(session.provenance, fieldPath);
        stream.markdown(`🔍 **${fieldPath}**\n\n\`\`\`\n${explanation}\n\`\`\``);
      } else {
        const summary = session.provenance.summary;
        stream.markdown(
          `🔍 **Provenance 요약**\n\n` +
          `- 레이어: ${summary.layers.join(" → ")}\n` +
          `- 필드 수: ${summary.totalFields}\n` +
          `- 잠긴 필드: ${summary.lockedFields.join(", ") || "없음"}\n` +
          `- 단조 필드: ${summary.monotonicFields.join(", ") || "없음"}`
        );
      }
      break;
    }

    case "status": {
      const status = formatStatus(sessionMgr);
      stream.markdown(`📊 **NOA 상태**\n\n${status}`);
      break;
    }

    case "process": {
      const text = args.join(" ");
      if (!text) {
        stream.markdown("사용법: `@noa process <텍스트>`");
        return;
      }
      try {
        const { status, enforcement } = sessionMgr.processTurn(DEFAULT_SESSION, text);
        const rows = [
          `| 엔진 | 결과 | 상세 |`,
          `|------|------|------|`,
          `| HFCP | ${status.hfcpScore ?? "—"} | ${status.hfcpVerdict ?? "비활성"} / RCL: ${status.rclLevel ?? "—"} |`,
          `| EH | ${status.ehLevel ?? "—"} | 신뢰도 수준 |`,
          `| HCRF | ${status.hcrfVerdict ?? "—"} | 책임 게이트 |`,
          `| OCFP | ${status.ocfpGate ?? "—"} | 조직 필터 |`,
          `| TLMH | ${status.tlmhInvocation ?? "—"} | 연구 모드 |`,
          `| NSG | ${status.sovereignKernelState ?? "—"} | Risk: ${status.sovereignRiskLevel ?? "—"} |`,
          `| NIB | ${status.nibEvent ?? "—"} | Confidence: ${status.nibConfidence != null ? (status.nibConfidence * 100).toFixed(0) + "%" : "—"} |`,
        ];
        const enfLine = enforcement.action !== EnforcementAction.ALLOW
          ? `\n\n**Enforcement: ${enforcement.action}** — ${enforcement.reasons.join(", ")}`
          : "";
        stream.markdown(`**엔진 분석 결과**\n\n${rows.join("\n")}${enfLine}`);
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "list": {
      const session = sessionMgr.getSession(DEFAULT_SESSION);
      if (!session) {
        stream.markdown("세션이 없습니다.");
        return;
      }
      const layers = session.activeLayers.map(
        (l) => `- **${l.source.file.meta.name}** (${l.source.file.kind}, p${l.source.file.priority})`
      );
      stream.markdown(
        `**등록된 레이어 (${layers.length}개)**\n\n` +
        (layers.length > 0 ? layers.join("\n") : "없음 — `@noa wear` 로 입히세요")
      );
      break;
    }

    case "validate": {
      const session = sessionMgr.getSession(DEFAULT_SESSION);
      if (!session?.diagnostics) {
        stream.markdown("컴파일된 프로필이 없습니다.");
        return;
      }
      const diags = session.diagnostics;
      if (diags.length === 0) {
        stream.markdown("검증 통과 — 문제 없음.");
      } else {
        const rows = diags.map(
          (d) => `- [${d.severity.toUpperCase()}] ${d.path ?? ""}: ${d.message}`
        );
        stream.markdown(`**검증 결과 (${diags.length}건)**\n\n${rows.join("\n")}`);
      }
      break;
    }

    case "export": {
      const target = (args[0] ?? "claude") as CompatibilityTarget;
      const session = sessionMgr.getSession(DEFAULT_SESSION);
      if (!session?.resolved) {
        stream.markdown("컴파일된 프로필이 없습니다. 먼저 `@noa wear`를 실행하세요.");
        return;
      }
      try {
        const artifact = exportArtifact(session.resolved, target);
        stream.markdown(
          `**${target} 내보내기 완료**\n\n\`\`\`\n${artifact.content.slice(0, 1000)}${artifact.content.length > 1000 ? "\n...(truncated)" : ""}\n\`\`\``
        );
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "ledger": {
      const session = sessionMgr.getSession(DEFAULT_SESSION);
      if (!session) {
        stream.markdown("세션이 없습니다.");
        return;
      }
      const count = parseInt(args[0] ?? "5", 10);
      const events = session.ledger.getRecent(count);
      if (events.length === 0) {
        stream.markdown("감사 로그가 비어있습니다.");
      } else {
        const rows = events.map(
          (e) => `- [${new Date(e.timestamp).toLocaleTimeString()}] **${e.eventType}** \`${e.hash.slice(0, 12)}...\``
        );
        stream.markdown(`**최근 감사 로그 (${events.length}건)**\n\n${rows.join("\n")}`);
      }
      break;
    }

    case "verify": {
      try {
        const loopResult = sessionMgr.runVerification(DEFAULT_SESSION);
        const icon = loopResult.outcome === LoopOutcome.PASSED ? "pass" :
                     loopResult.outcome === LoopOutcome.FIXED_AND_PASSED ? "warning" : "error";
        const lines = [
          `**검증 결과: ${loopResult.outcome}** (${loopResult.iterations}회 반복, ${loopResult.finalResult.score}점)`,
          "",
        ];
        if (loopResult.appliedFixes.length > 0) {
          lines.push(`**자동 수정 ${loopResult.appliedFixes.length}건:**`);
          for (const f of loopResult.appliedFixes) {
            lines.push(`- [${f.severity}] ${f.description}`);
          }
          lines.push("");
        }
        if (loopResult.humanRequired.length > 0) {
          lines.push(`**수동 수정 필요 ${loopResult.humanRequired.length}건:**`);
          for (const f of loopResult.humanRequired) {
            lines.push(`- [${f.severity}] ${f.description} (${f.field})`);
          }
          lines.push("");
        }
        if (loopResult.finalResult.blockers.length > 0) {
          lines.push(`**차단 사유:**`);
          for (const b of loopResult.finalResult.blockers) {
            lines.push(`- ${b}`);
          }
        }
        stream.markdown(lines.join("\n"));
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "rollback": {
      const mgr = sessionMgr.changeManager;
      const latest = mgr.getLatestApplied();
      if (!latest) {
        stream.markdown("롤백할 변경이 없습니다.");
        return;
      }
      mgr.markRolledBack(latest.id);
      stream.markdown(
        `**롤백 완료** — 변경 ${latest.id}를 롤백했습니다.\n\n` +
        `이전 상태 스냅샷이 복원 준비됨. \`@noa wear\`로 다시 입혀주세요.`
      );
      break;
    }

    default:
      stream.markdown(
        "**@noa 명령어 목록:**\n\n" +
        "| 명령 | 설명 |\n" +
        "|------|------|\n" +
        "| `wear <name>` | 페르소나 입기 |\n" +
        "| `strip <name>` | 페르소나 벗기 |\n" +
        "| `swap <old> <new>` | 페르소나 교체 |\n" +
        "| `explain [field]` | 규칙 적용 이유 |\n" +
        "| `process <text>` | 텍스트 엔진 분석 (전 엔진 테이블) |\n" +
        "| `status` | 현재 상태 확인 |\n" +
        "| `list` | 등록된 레이어 목록 |\n" +
        "| `validate` | 현재 프로필 검증 |\n" +
        "| `verify` | 검증 루프 실행 (자동 수정 + 재검증) |\n" +
        "| `rollback` | 마지막 변경 롤백 |\n" +
        "| `export [target]` | Claude/GPT/Local 내보내기 |\n" +
        "| `ledger [n]` | 최근 감사 로그 (기본 5) |"
      );
  }
}

function formatStatus(mgr: SessionManager): string {
  const session = mgr.getSession(DEFAULT_SESSION);
  if (!session) return "세션 없음";

  const status = mgr.getStatus(session);
  const lines: string[] = [];

  lines.push(`- 레이어: ${status.layerNames.join(", ") || "없음"}`);
  lines.push(`- 활성 엔진: ${status.activeEngines.join(", ") || "없음"}`);

  if (status.hfcpScore !== null) {
    lines.push(`- HFCP: ${status.hfcpScore} (${status.hfcpVerdict})`);
  }
  if (status.ehLevel !== null) {
    lines.push(`- EH: ${status.ehLevel}`);
  }
  if (status.hcrfVerdict !== null) {
    lines.push(`- HCRF: ${status.hcrfVerdict}`);
  }
  if (status.ocfpGate !== null) {
    lines.push(`- OCFP: ${status.ocfpGate}`);
  }
  if (status.tlmhInvocation !== null) {
    lines.push(`- TLMH: ${status.tlmhInvocation}`);
  }
  if (status.sovereignKernelState !== null) {
    lines.push(`- NSG Kernel: ${status.sovereignKernelState} (Risk: ${status.sovereignRiskLevel ?? "—"})`);
  }
  if (status.nibEvent !== null) {
    const conf = status.nibConfidence != null ? ` (${(status.nibConfidence * 100).toFixed(0)}%)` : "";
    lines.push(`- NIB: ${status.nibEvent}${conf}`);
  }
  if (status.mountedAccessories.length > 0) {
    lines.push(`- 악세사리: ${status.mountedAccessories.join(", ")}`);
  }

  return lines.join("\n");
}
