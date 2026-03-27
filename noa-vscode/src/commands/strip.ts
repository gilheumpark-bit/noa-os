import * as vscode from "vscode";

export function registerStripCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.strip", async () => {
    vscode.window.showInformationMessage("현재 페르소나를 벗었습니다.");
  });
}
