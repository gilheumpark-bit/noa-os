/**
 * Enforcement Bridge — 경로 B
 *
 * AI 모델 호출을 enforcement로 래핑.
 * BLOCK→차단, SEAL→잠금, DOWNGRADE→제한, FORCE_UNCERTAINTY→마커, ALLOW→정상.
 */

import * as vscode from "vscode";
import type { SessionManager, SessionStatus } from "../noa/runtime/session";
import { EnforcementAction, type EnforcementResult } from "../noa/runtime/verification-studio";
import { composeSystemPrompt } from "./prompt-composer";

const DEFAULT_SESSION = "default";

export interface EnforcedResponse {
  blocked: boolean;
  action: EnforcementAction;
  reasons: string[];
}

/**
 * 사용자 질문을 enforcement 파이프라인 통과 후 AI에 전달.
 *
 * @param sessionMgr SessionManager
 * @param userPrompt 사용자 입력
 * @param request VS Code Chat Request (model 접근용)
 * @param stream VS Code Chat Response Stream
 * @param token CancellationToken
 */
export async function executeWithEnforcement(
  sessionMgr: SessionManager,
  userPrompt: string,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<EnforcedResponse> {
  const session = sessionMgr.getSession(DEFAULT_SESSION);
  if (!session || !session.resolved) {
    stream.markdown("프로필이 없습니다. `@noa wear <preset>` 으로 먼저 입혀주세요.");
    return { blocked: true, action: EnforcementAction.DOWNGRADE, reasons: ["no profile"] };
  }

  // 1. 엔진 통과 + enforcement 판정
  const { status, enforcement } = sessionMgr.processTurn(DEFAULT_SESSION, userPrompt);

  // 2. Enforcement 분기
  switch (enforcement.action) {
    case EnforcementAction.SEAL:
      stream.markdown(
        "**[NOA SEAL]** 세션이 비가역적으로 잠겼습니다.\n\n" +
        `사유: ${enforcement.reasons.join(", ")}\n\n` +
        "새 세션을 시작하려면 `@noa strip` 후 `@noa wear`를 실행하세요."
      );
      return { blocked: true, action: EnforcementAction.SEAL, reasons: enforcement.reasons };

    case EnforcementAction.BLOCK:
      stream.markdown(
        "**[NOA BLOCK]** 이 요청은 안전 정책에 의해 차단되었습니다.\n\n" +
        `사유: ${enforcement.reasons.join(", ")}\n` +
        `제한: ${enforcement.restrictions.join(", ")}`
      );
      return { blocked: true, action: EnforcementAction.BLOCK, reasons: enforcement.reasons };

    case EnforcementAction.DOWNGRADE: {
      const systemPrompt = composeSystemPrompt(session.resolved, status) +
        "\n\n[RESTRICTION] " + enforcement.restrictions.join("\n[RESTRICTION] ");

      stream.markdown("*[NOA DOWNGRADE] 제한된 응답 모드*\n\n");
      await callModel(systemPrompt, userPrompt, request, stream, token);
      return { blocked: false, action: EnforcementAction.DOWNGRADE, reasons: enforcement.reasons };
    }

    case EnforcementAction.FORCE_UNCERTAINTY: {
      const systemPrompt = composeSystemPrompt(session.resolved, status);
      stream.markdown("*[NOA] 이 응답에는 불확실한 정보가 포함될 수 있습니다.*\n\n");
      await callModel(systemPrompt, userPrompt, request, stream, token);

      const conf = status.nibConfidence != null ? `${(status.nibConfidence * 100).toFixed(0)}%` : "—";
      stream.markdown(`\n\n---\n*[NOA 엔진] EH: ${status.ehLevel ?? "—"} | NIB 확신도: ${conf}*`);
      return { blocked: false, action: EnforcementAction.FORCE_UNCERTAINTY, reasons: enforcement.reasons };
    }

    case EnforcementAction.ALLOW:
    default: {
      const systemPrompt = composeSystemPrompt(session.resolved, status);
      await callModel(systemPrompt, userPrompt, request, stream, token);
      return { blocked: false, action: EnforcementAction.ALLOW, reasons: [] };
    }
  }
}

/**
 * VS Code Chat API로 모델 호출.
 */
async function callModel(
  systemPrompt: string,
  userPrompt: string,
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  try {
    const messages = [
      vscode.LanguageModelChatMessage.User(`[System Instructions]\n${systemPrompt}`),
      vscode.LanguageModelChatMessage.User(userPrompt),
    ];

    const models = await vscode.lm.selectChatModels({ family: "gpt-4o" });
    const model = models[0] ?? (await vscode.lm.selectChatModels())[0];

    if (!model) {
      stream.markdown("사용 가능한 AI 모델이 없습니다.");
      return;
    }

    const response = await model.sendRequest(messages, {}, token);

    for await (const chunk of response.text) {
      stream.markdown(chunk);
    }
  } catch (e) {
    stream.markdown(`\n\n*모델 호출 실패: ${e instanceof Error ? e.message : String(e)}*`);
  }
}
