import * as vscode from "vscode";

export function registerExportCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.export", async () => {
    const target = await vscode.window.showQuickPick(
      [
        { label: "Claude", description: "System prompt + tool hints" },
        { label: "GPT", description: "System message + tool hints" },
        { label: "Local", description: "config.json + prompt.txt (Ollama/LM Studio)" },
        { label: "Copilot", description: "Instructions + context" },
      ],
      {
        placeHolder: "내보낼 대상을 선택하세요",
        title: "NOA: Export Artifact",
      }
    );

    if (target) {
      vscode.window.showInformationMessage(
        `📦 ${target.label} 형식으로 내보내기 준비 완료 (Phase 2에서 구현)`
      );
    }
  });
}
