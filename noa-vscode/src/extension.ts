import * as vscode from "vscode";
import { registerWearCommand } from "./commands/wear";
import { registerStripCommand } from "./commands/strip";
import { registerSwapCommand } from "./commands/swap";
import { registerCompileCommand } from "./commands/compile";
import { registerExportCommand } from "./commands/export";
import { registerExplainCommand } from "./commands/explain";

export function activate(context: vscode.ExtensionContext) {
  console.log("NOA Clothing Framework 활성화");

  // 명령 등록
  context.subscriptions.push(
    registerWearCommand(context),
    registerStripCommand(context),
    registerSwapCommand(context),
    registerCompileCommand(context),
    registerExportCommand(context),
    registerExplainCommand(context)
  );

  // 상태바 아이템
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = "$(person) NOA: 없음";
  statusBar.tooltip = "현재 입힌 페르소나 없음";
  statusBar.command = "noa.wear";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {
  console.log("NOA Clothing Framework 비활성화");
}
