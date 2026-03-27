import * as vscode from "vscode";

export function registerWearCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("noa.wear", async () => {
    const presets = await discoverPresets();

    if (presets.length === 0) {
      vscode.window.showWarningMessage("사용 가능한 .noa 프리셋이 없습니다.");
      return;
    }

    const picked = await vscode.window.showQuickPick(presets, {
      placeHolder: "입힐 페르소나를 선택하세요",
      title: "NOA: Wear Persona",
    });

    if (picked) {
      vscode.window.showInformationMessage(`👔 "${picked.label}" 페르소나를 입었습니다.`);
    }
  });
}

interface PresetItem extends vscode.QuickPickItem {
  filePath: string;
}

async function discoverPresets(): Promise<PresetItem[]> {
  const files = await vscode.workspace.findFiles("**/*.noa", "**/node_modules/**");
  return files.map((uri) => {
    const name = uri.path.split("/").pop()?.replace(".noa", "") ?? "unknown";
    return {
      label: name,
      description: vscode.workspace.asRelativePath(uri),
      filePath: uri.fsPath,
    };
  });
}
