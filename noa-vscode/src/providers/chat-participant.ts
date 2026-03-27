import * as vscode from "vscode";

/**
 * Copilot Chat Participant — @noa 명령어 처리.
 * Phase 5에서 세션 관리와 연동. 여기서는 등록 + 라우팅 골격만 구현.
 *
 * 사용: @noa wear medical / @noa explain / @noa status / @noa swap creative
 */

const PARTICIPANT_ID = "noa.chatParticipant";

export function registerChatParticipant(
  context: vscode.ExtensionContext
): void {
  // Chat Participant API 존재 여부 확인
  if (!vscode.chat?.createChatParticipant) {
    // API 미지원 환경 (VS Code 버전 낮거나 Copilot 미설치)
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
  const prompt = request.prompt.trim();
  const [command, ...args] = prompt.split(/\s+/);

  switch (command) {
    case "wear":
      stream.markdown(
        `👔 **${args[0] ?? "?"}** 페르소나를 입히는 중...\n\n` +
        `\`NOA: Wear Persona\` 명령을 실행하세요.`
      );
      break;

    case "strip":
      stream.markdown("현재 페르소나를 벗는 중...");
      break;

    case "swap":
      stream.markdown(
        `🔄 **${args[0] ?? "?"}** 페르소나로 교체 요청.\n\n` +
        `\`NOA: Swap Persona\` 명령을 실행하세요.`
      );
      break;

    case "explain":
      if (args.length > 0) {
        stream.markdown(
          `🔍 \`${args.join(".")}\` 필드의 적용 이력을 조회합니다.\n\n` +
          `\`NOA: Explain Rules\` 명령으로 전체 Provenance를 확인하세요.`
        );
      } else {
        stream.markdown(
          "🔍 Explain View를 열어 전체 규칙 적용 이력을 확인합니다."
        );
      }
      break;

    case "status":
      stream.markdown(
        "📊 **NOA 상태**\n\n" +
        "- 활성 레이어: (Phase 5에서 세션 연동)\n" +
        "- 활성 엔진: (Phase 5에서 연동)"
      );
      break;

    default:
      stream.markdown(
        "**@noa 명령어 목록:**\n\n" +
        "- `@noa wear <name>` — 페르소나 입기\n" +
        "- `@noa strip` — 페르소나 벗기\n" +
        "- `@noa swap <name>` — 페르소나 교체\n" +
        "- `@noa explain [field]` — 규칙 적용 이유\n" +
        "- `@noa status` — 현재 상태 확인"
      );
  }
}
