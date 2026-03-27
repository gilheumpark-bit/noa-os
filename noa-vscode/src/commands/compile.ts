import * as vscode from "vscode";
import { compile } from "../noa/compiler/pipeline";
import { exportAll } from "../noa/compiler/export";
import { PreviewPanel } from "../providers/preview-panel";

export function registerCompileCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.compile", async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== "noa") {
      vscode.window.showWarningMessage("활성 .noa 파일이 없습니다.");
      return;
    }

    const text = editor.document.getText();
    const origin = vscode.workspace.asRelativePath(editor.document.uri);

    try {
      // extends로 참조하는 파일도 수집
      const sources = await collectSources(text, origin);
      const result = compile(sources);
      const artifacts = exportAll(result.resolved);

      // Preview 패널에 표시
      PreviewPanel.show(context.extensionUri, result, artifacts);

      const errorCount = result.diagnostics.filter((d) => d.severity === "error").length;
      const warnCount = result.diagnostics.filter((d) => d.severity === "warning").length;

      if (errorCount > 0) {
        vscode.window.showWarningMessage(
          `컴파일 완료 — 에러 ${errorCount}개, 경고 ${warnCount}개`
        );
      } else {
        vscode.window.showInformationMessage(
          `✅ 컴파일 완료 — 경고 ${warnCount}개, 어댑터 ${artifacts.length}종 생성`
        );
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `컴파일 실패: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
}

async function collectSources(
  text: string,
  origin: string
): Promise<Array<{ text: string; origin: string }>> {
  const sources: Array<{ text: string; origin: string }> = [{ text, origin }];

  // extends에 명시된 파일 탐색
  const extendsMatch = text.match(/extends:\s*\n((?:\s+-\s*"[^"]+"\s*\n?)+)/);
  if (extendsMatch) {
    const refs = [...extendsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      const files = await vscode.workspace.findFiles(
        `**/${ref}.noa`,
        "**/node_modules/**",
        1
      );
      if (files.length > 0) {
        const doc = await vscode.workspace.openTextDocument(files[0]);
        const refOrigin = vscode.workspace.asRelativePath(files[0]);
        // 재귀적으로 extends 탐색
        const nested = await collectSources(doc.getText(), refOrigin);
        for (const s of nested) {
          if (!sources.some((existing) => existing.origin === s.origin)) {
            sources.push(s);
          }
        }
      }
    }
  }

  return sources;
}
