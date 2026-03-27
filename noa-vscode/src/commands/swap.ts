import * as vscode from "vscode";

export function registerSwapCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.swap", async () => {
    const files = await vscode.workspace.findFiles("**/*.noa", "**/node_modules/**");
    const items = files.map((uri) => ({
      label: uri.path.split("/").pop()?.replace(".noa", "") ?? "unknown",
      description: vscode.workspace.asRelativePath(uri),
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "교체할 페르소나를 선택하세요",
      title: "NOA: Swap Persona",
    });

    if (picked) {
      vscode.window.showInformationMessage(`🔄 "${picked.label}" 페르소나로 교체했습니다.`);
    }
  });
}
