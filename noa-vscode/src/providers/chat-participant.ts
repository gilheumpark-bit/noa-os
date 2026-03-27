import * as vscode from "vscode";
import type { SessionManager, SessionStatus } from "../noa/runtime/session";
import { explainField, buildProvenanceGraph } from "../noa/compiler/explain";

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
      // 텍스트를 엔진에 통과시켜 분석
      const text = args.join(" ");
      if (!text) {
        stream.markdown("사용법: `@noa process <텍스트>`");
        return;
      }
      try {
        const { status } = sessionMgr.processTurn(DEFAULT_SESSION, text);
        stream.markdown(
          `⚙️ **엔진 처리 결과**\n\n` +
          `- HFCP 점수: ${status.hfcpScore ?? "비활성"}\n` +
          `- HFCP Verdict: ${status.hfcpVerdict ?? "—"}\n` +
          `- EH 신뢰도: ${status.ehLevel ?? "비활성"}\n` +
          `- HCRF Verdict: ${status.hcrfVerdict ?? "비활성"}\n` +
          `- 활성 엔진: ${status.activeEngines.join(", ") || "없음"}`
        );
      } catch (e) {
        stream.markdown(`오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    default:
      stream.markdown(
        "**@noa 명령어 목록:**\n\n" +
        "- `@noa wear <name>` — 페르소나 입기\n" +
        "- `@noa strip <name>` — 페르소나 벗기\n" +
        "- `@noa swap <old> <new>` — 페르소나 교체\n" +
        "- `@noa explain [field]` — 규칙 적용 이유\n" +
        "- `@noa process <text>` — 텍스트 엔진 분석\n" +
        "- `@noa status` — 현재 상태 확인"
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

  return lines.join("\n");
}
