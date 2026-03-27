import * as vscode from "vscode";

export function registerCompileCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.compile", async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.languageId !== "noa") {
      vscode.window.showWarningMessage("활성 .noa 파일이 없습니다.");
      return;
    }

    vscode.window.showInformationMessage(
      `⚙️ "${vscode.workspace.asRelativePath(editor.document.uri)}" 컴파일 중...`
    );

    // Phase 2에서 실제 컴파일 파이프라인 연결
  });
}
