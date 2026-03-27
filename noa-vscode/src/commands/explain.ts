import * as vscode from "vscode";

export function registerExplainCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.explain", async () => {
    vscode.window.showInformationMessage(
      "📖 Explain View — Phase 2에서 Provenance 시각화 구현 예정"
    );
  });
}
