import * as vscode from "vscode";
import { compile } from "../noa/compiler/pipeline";
import { exportArtifact } from "../noa/compiler/export";
import type { CompatibilityTarget } from "../noa/schema/noa-schema";

export function registerExportCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.export", async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== "noa") {
      vscode.window.showWarningMessage("활성 .noa 파일이 없습니다.");
      return;
    }

    const target = await vscode.window.showQuickPick(
      [
        { label: "Claude", description: "System prompt + tool hints", value: "claude" as CompatibilityTarget },
        { label: "GPT", description: "System message + tool hints", value: "gpt" as CompatibilityTarget },
        { label: "Local", description: "config.json (Ollama/LM Studio)", value: "local" as CompatibilityTarget },
        { label: "Copilot", description: "Instructions + context", value: "copilot" as CompatibilityTarget },
      ],
      {
        placeHolder: "내보낼 대상을 선택하세요",
        title: "NOA: Export Artifact",
      }
    );

    if (!target) return;

    try {
      const text = editor.document.getText();
      const origin = vscode.workspace.asRelativePath(editor.document.uri);

      // extends 수집
      const sources = await collectExportSources(text, origin);
      const result = compile(sources);
      const artifact = exportArtifact(result.resolved, target.value);

      // 클립보드에 복사 or 새 문서로 열기
      const action = await vscode.window.showQuickPick(
        ["클립보드에 복사", "새 탭에서 열기"],
        { placeHolder: "내보내기 결과 처리 방법" }
      );

      if (action === "클립보드에 복사") {
        await vscode.env.clipboard.writeText(artifact.content);
        vscode.window.showInformationMessage(
          `📋 ${target.label} 아티팩트가 클립보드에 복사되었습니다.`
        );
      } else if (action === "새 탭에서 열기") {
        const lang = target.value === "local" ? "json" : "markdown";
        const doc = await vscode.workspace.openTextDocument({
          content: artifact.content,
          language: lang,
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `내보내기 실패: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
}

async function collectExportSources(
  text: string,
  origin: string
): Promise<Array<{ text: string; origin: string }>> {
  const sources: Array<{ text: string; origin: string }> = [{ text, origin }];

  const extendsMatch = text.match(/extends:\s*\n((?:\s+-\s*"[^"]+"\s*\n?)+)/);
  if (extendsMatch) {
    const refs = [...extendsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      const files = await vscode.workspace.findFiles(`**/${ref}.noa`, "**/node_modules/**", 1);
      if (files.length > 0) {
        const doc = await vscode.workspace.openTextDocument(files[0]);
        const refOrigin = vscode.workspace.asRelativePath(files[0]);
        if (!sources.some((s) => s.origin === refOrigin)) {
          sources.push({ text: doc.getText(), origin: refOrigin });
        }
      }
    }
  }

  return sources;
}
