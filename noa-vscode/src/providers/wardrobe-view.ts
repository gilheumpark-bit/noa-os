import * as vscode from "vscode";
import * as path from "path";

export interface WardrobeItem {
  id: string;
  name: string;
  kind: "base" | "domain" | "user" | "session";
  uri: vscode.Uri;
  priority: number;
}

const KIND_ICONS: Record<string, string> = {
  base: "lock",
  domain: "file-text",
  user: "person",
  session: "zap",
};

export class WardrobeTreeProvider
  implements vscode.TreeDataProvider<WardrobeTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    WardrobeTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: WardrobeItem[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async loadFromWorkspace(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*.noa",
      "**/node_modules/**"
    );
    this.items = [];

    for (const uri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const idMatch = text.match(/^id:\s*"?([^"\n]+)"?/m);
        const nameMatch = text.match(/^\s+name:\s*"?([^"\n]+)"?/m);
        const kindMatch = text.match(/^kind:\s*"?([^"\n]+)"?/m);
        const priorityMatch = text.match(/^priority:\s*(\d+)/m);

        this.items.push({
          id: idMatch?.[1] ?? path.basename(uri.fsPath, ".noa"),
          name: nameMatch?.[1] ?? idMatch?.[1] ?? "unknown",
          kind: (kindMatch?.[1] as WardrobeItem["kind"]) ?? "domain",
          uri,
          priority: priorityMatch ? parseInt(priorityMatch[1], 10) : 0,
        });
      } catch {
        // 파싱 실패 시 무시
      }
    }

    this.items.sort((a, b) => a.priority - b.priority);
    this.refresh();
  }

  getTreeItem(element: WardrobeTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): WardrobeTreeItem[] {
    const groups = new Map<string, WardrobeItem[]>();
    for (const item of this.items) {
      const list = groups.get(item.kind) ?? [];
      list.push(item);
      groups.set(item.kind, list);
    }

    const result: WardrobeTreeItem[] = [];
    for (const kind of ["base", "domain", "user", "session"] as const) {
      const list = groups.get(kind);
      if (!list || list.length === 0) continue;

      // 그룹 헤더
      const header = new WardrobeTreeItem(
        `${KIND_LABELS[kind]} (${list.length})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      header.contextValue = "group";
      result.push(header);

      // 개별 아이템
      for (const item of list) {
        const treeItem = new WardrobeTreeItem(
          item.name,
          vscode.TreeItemCollapsibleState.None
        );
        treeItem.description = `priority: ${item.priority}`;
        treeItem.iconPath = new vscode.ThemeIcon(KIND_ICONS[item.kind]);
        treeItem.command = {
          command: "vscode.open",
          title: "Open",
          arguments: [item.uri],
        };
        treeItem.contextValue = "noaFile";
        treeItem.tooltip = `${item.id} (${item.kind})`;
        result.push(treeItem);
      }
    }

    return result;
  }
}

class WardrobeTreeItem extends vscode.TreeItem {}

const KIND_LABELS: Record<string, string> = {
  base: "Base",
  domain: "Domain",
  user: "User",
  session: "Session",
};

export function registerWardrobeView(
  context: vscode.ExtensionContext
): WardrobeTreeProvider {
  const provider = new WardrobeTreeProvider();

  const treeView = vscode.window.createTreeView("noaWardrobe", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // 워크스페이스 로드 시 + .noa 파일 변경 시 새로고침
  provider.loadFromWorkspace();

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.noa");
  watcher.onDidCreate(() => provider.loadFromWorkspace());
  watcher.onDidChange(() => provider.loadFromWorkspace());
  watcher.onDidDelete(() => provider.loadFromWorkspace());
  context.subscriptions.push(watcher);

  return provider;
}
