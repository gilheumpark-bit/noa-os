import * as vscode from "vscode";
import { registerCompileCommand } from "./commands/compile";
import { registerExportCommand } from "./commands/export";
import { registerExplainCommand } from "./commands/explain";
import { registerWardrobeView } from "./providers/wardrobe-view";
import { registerLayerView, type LayerStackProvider } from "./providers/layer-view";
import {
  registerDiagnostics,
  registerCompletion,
  registerHover,
  registerCodeLens,
} from "./providers/noa-language";
import { registerChatParticipant } from "./providers/chat-participant";
import { SessionManager } from "./noa/runtime/session";
import { NoaRegistry } from "./noa/runtime/registry";

const DEFAULT_SESSION = "default";

export function activate(context: vscode.ExtensionContext) {
  console.log("NOA Clothing Framework 활성화");

  // 런타임 초기화
  const registry = new NoaRegistry();
  const sessionMgr = new SessionManager();
  sessionMgr.createSession(DEFAULT_SESSION);

  // 프리셋 자동 등록 (비동기, 에러 시 경고만)
  loadPresetsIntoRegistry(registry, sessionMgr).catch((e) => {
    console.warn("프리셋 로드 실패:", e);
  });

  // .noa 파일 실시간 watcher — 생성/수정/삭제 추적
  const noaWatcher = vscode.workspace.createFileSystemWatcher("**/*.noa");
  noaWatcher.onDidCreate((uri) => {
    loadSinglePreset(uri, registry, sessionMgr);
  });
  noaWatcher.onDidChange((uri) => {
    loadSinglePreset(uri, registry, sessionMgr);
  });
  noaWatcher.onDidDelete((uri) => {
    const name = uri.path.split("/").pop()?.replace(".noa", "") ?? "";
    console.log(`NOA 프리셋 삭제 감지: ${name}`);
  });
  context.subscriptions.push(noaWatcher);

  // 상태바
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = "$(person) NOA: 없음";
  statusBar.tooltip = "현재 입힌 페르소나 없음";
  statusBar.command = "noa.wear";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // 사이드바
  const wardrobeProvider = registerWardrobeView(context);
  const layerProvider = registerLayerView(context);

  // Language Server
  registerDiagnostics(context);
  registerCompletion(context);
  registerHover(context);
  registerCodeLens(context);

  // Copilot Chat — 세션 매니저 연동
  registerChatParticipant(context, sessionMgr);

  // 명령 등록 — 세션 매니저 + UI 연동
  context.subscriptions.push(
    registerWearWithSession(sessionMgr, registry, layerProvider, statusBar),
    registerStripWithSession(sessionMgr, layerProvider, statusBar),
    registerSwapWithSession(sessionMgr, registry, layerProvider, statusBar),
    registerCompileCommand(context),
    registerExportCommand(context),
    registerExplainCommand(context)
  );
}

export function deactivate() {
  console.log("NOA Clothing Framework 비활성화");
}

// --- 세션 연동 명령 ---

function registerWearWithSession(
  sessionMgr: SessionManager,
  registry: NoaRegistry,
  layerProvider: LayerStackProvider,
  statusBar: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand("noa.wear", async () => {
    const entries = registry.listAll();
    if (entries.length === 0) {
      vscode.window.showWarningMessage("등록된 .noa 프리셋이 없습니다.");
      return;
    }

    const items = entries.map((e) => ({
      label: e.name,
      description: `${e.kind} · p${e.priority}`,
      id: e.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "입힐 페르소나를 선택하세요",
      title: "NOA: Wear Persona",
    });

    if (!picked) return;

    try {
      sessionMgr.wear(DEFAULT_SESSION, picked.id);
      const session = sessionMgr.getSession(DEFAULT_SESSION);
      if (!session) return;
      const status = sessionMgr.getStatus(session);

      // Layer View 갱신
      layerProvider.clearStack();
      for (const layer of session.activeLayers) {
        layerProvider.pushLayer({
          id: layer.source.file.id,
          name: layer.source.file.meta.name,
          kind: layer.source.file.kind,
          priority: layer.source.file.priority,
          origin: layer.source.origin,
        });
      }

      // 상태바 갱신
      updateStatusBar(statusBar, status);
      vscode.window.showInformationMessage(`👔 "${picked.label}" 입었습니다.`);
    } catch (e) {
      vscode.window.showErrorMessage(
        `Wear 실패: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
}

function registerStripWithSession(
  sessionMgr: SessionManager,
  layerProvider: LayerStackProvider,
  statusBar: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand("noa.strip", async () => {
    const session = sessionMgr.getSession(DEFAULT_SESSION);
    if (!session || session.activeLayers.length === 0) {
      vscode.window.showWarningMessage("벗을 페르소나가 없습니다.");
      return;
    }

    const items = session.activeLayers.map((l) => ({
      label: l.source.file.meta.name,
      description: l.source.file.id,
      id: l.source.file.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "벗을 페르소나를 선택하세요",
      title: "NOA: Strip Persona",
    });

    if (!picked) return;

    sessionMgr.strip(DEFAULT_SESSION, picked.id);
    layerProvider.removeLayer(picked.id);

    const updated = sessionMgr.getSession(DEFAULT_SESSION);
    if (updated) updateStatusBar(statusBar, sessionMgr.getStatus(updated));
    vscode.window.showInformationMessage(`🚫 "${picked.label}" 벗었습니다.`);
  });
}

function registerSwapWithSession(
  sessionMgr: SessionManager,
  registry: NoaRegistry,
  layerProvider: LayerStackProvider,
  statusBar: vscode.StatusBarItem
): vscode.Disposable {
  return vscode.commands.registerCommand("noa.swap", async () => {
    const session = sessionMgr.getSession(DEFAULT_SESSION);
    if (!session || session.activeLayers.length === 0) {
      vscode.window.showWarningMessage("교체할 현재 페르소나가 없습니다.");
      return;
    }

    // 현재 입고 있는 것 선택
    const currentItems = session.activeLayers.map((l) => ({
      label: l.source.file.meta.name,
      id: l.source.file.id,
    }));
    const oldPick = await vscode.window.showQuickPick(currentItems, {
      placeHolder: "교체할 현재 페르소나",
      title: "NOA: Swap — 벗을 페르소나",
    });
    if (!oldPick) return;

    // 새로 입을 것 선택
    const entries = registry.listAll().filter((e) => e.id !== oldPick.id);
    const newItems = entries.map((e) => ({
      label: e.name,
      description: `${e.kind} · p${e.priority}`,
      id: e.id,
    }));
    const newPick = await vscode.window.showQuickPick(newItems, {
      placeHolder: "새로 입을 페르소나",
      title: "NOA: Swap — 입을 페르소나",
    });
    if (!newPick) return;

    try {
      sessionMgr.swap(DEFAULT_SESSION, oldPick.id, newPick.id);
      const updated = sessionMgr.getSession(DEFAULT_SESSION);
      if (!updated) return;

      layerProvider.clearStack();
      for (const layer of updated.activeLayers) {
        layerProvider.pushLayer({
          id: layer.source.file.id,
          name: layer.source.file.meta.name,
          kind: layer.source.file.kind,
          priority: layer.source.file.priority,
          origin: layer.source.origin,
        });
      }

      updateStatusBar(statusBar, sessionMgr.getStatus(updated));
      vscode.window.showInformationMessage(
        `🔄 "${oldPick.label}" → "${newPick.label}" 교체 완료.`
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `Swap 실패: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  });
}

// --- 상태바 갱신 ---

function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  status: {
    layerNames: string[];
    hfcpScore: number | null;
    ehLevel: string | null;
    sovereignKernelState: string | null;
    sovereignRiskLevel: string | null;
    nibEvent: string | null;
    nibConfidence: number | null;
  }
): void {
  if (status.layerNames.length === 0) {
    statusBar.text = "$(person) NOA: 없음";
    statusBar.tooltip = "현재 입힌 페르소나 없음";
    return;
  }

  const names = status.layerNames.join(" + ");
  const hfcp = status.hfcpScore !== null ? ` [HFCP:${status.hfcpScore}]` : "";
  const eh = status.ehLevel ? ` [EH:${status.ehLevel}]` : "";
  const sov = status.sovereignKernelState ? ` [NSG:${status.sovereignKernelState}]` : "";
  const nib = status.nibEvent && status.nibEvent !== "BACKGROUND"
    ? ` [NIB:${status.nibEvent}]`
    : "";

  statusBar.text = `$(person) ${names}${hfcp}${eh}${sov}${nib}`;
  statusBar.tooltip = [
    `활성 레이어: ${names}`,
    status.sovereignRiskLevel ? `리스크: ${status.sovereignRiskLevel}` : null,
    status.nibConfidence != null ? `NIB 확신도: ${(status.nibConfidence * 100).toFixed(0)}%` : null,
  ].filter(Boolean).join(" | ");
}

// --- 프리셋 로드 ---

async function loadPresetsIntoRegistry(
  registry: NoaRegistry,
  sessionMgr: SessionManager
): Promise<void> {
  const files = await vscode.workspace.findFiles(
    "**/*.noa",
    "**/node_modules/**"
  );

  for (const uri of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      const entry = registry.register(text, uri.fsPath);
      // 세션 매니저에도 소스 등록
      sessionMgr.registerSource(entry.id, text, uri.fsPath);
    } catch (e) {
      console.warn(`NOA 프리셋 파싱 실패: ${uri.fsPath}`, e);
    }
  }
}

async function loadSinglePreset(
  uri: vscode.Uri,
  registry: NoaRegistry,
  sessionMgr: SessionManager
): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();
    const entry = registry.register(text, uri.fsPath);
    sessionMgr.registerSource(entry.id, text, uri.fsPath);
    console.log(`NOA 프리셋 등록/갱신: ${entry.name}`);
  } catch (e) {
    console.warn(`NOA 프리셋 파싱 실패: ${uri.fsPath}`, e);
  }
}
