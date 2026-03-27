import * as vscode from "vscode";
import { compile } from "../noa/compiler/pipeline";
import { buildProvenanceGraph } from "../noa/compiler/explain";
import { ExplainPanel } from "../providers/explain-view";

export function registerExplainCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.explain", async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== "noa") {
      vscode.window.showWarningMessage("활성 .noa 파일이 없습니다.");
      return;
    }

    try {
      const text = editor.document.getText();
      const origin = vscode.workspace.asRelativePath(editor.document.uri);

      // extends 수집
      const sources = await collectExplainSources(text, origin);
      const result = compile(sources);

      // Explain View 열기
      ExplainPanel.show(context.extensionUri, result.provenance);

      vscode.window.showInformationMessage(
        `🔍 Provenance — ${result.provenance.summary.layerCount}개 레이어, ${result.provenance.summary.totalFields}개 필드`
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `Explain 실패: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
}

async function collectExplainSources(
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
