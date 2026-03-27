import * as vscode from "vscode";

/**
 * 현재 활성 레이어 스택을 표시하는 사이드바 TreeView.
 * wear/strip/swap 시 갱신.
 */

export interface ActiveLayer {
  id: string;
  name: string;
  kind: string;
  priority: number;
  origin: string;
}

export class LayerStackProvider
  implements vscode.TreeDataProvider<LayerTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    LayerTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private stack: ActiveLayer[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getStack(): ActiveLayer[] {
    return [...this.stack];
  }

  pushLayer(layer: ActiveLayer): void {
    // priority 순 삽입
    this.stack.push(layer);
    this.stack.sort((a, b) => a.priority - b.priority);
    this.refresh();
  }

  removeLayer(id: string): void {
    this.stack = this.stack.filter((l) => l.id !== id);
    this.refresh();
  }

  clearStack(): void {
    this.stack = [];
    this.refresh();
  }

  swapLayer(oldId: string, newLayer: ActiveLayer): void {
    this.removeLayer(oldId);
    this.pushLayer(newLayer);
  }

  getTreeItem(element: LayerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): LayerTreeItem[] {
    if (this.stack.length === 0) {
      const empty = new LayerTreeItem(
        "레이어 없음 — Wear로 추가",
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    return this.stack.map((layer, index) => {
      const item = new LayerTreeItem(
        `${index + 1}. ${layer.name}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.description = `${layer.kind} · p${layer.priority}`;
      item.iconPath = new vscode.ThemeIcon(
        layer.kind === "base" ? "lock" : layer.kind === "session" ? "zap" : "file-text"
      );
      item.tooltip = `${layer.id} (${layer.origin})`;
      item.contextValue = "activeLayer";
      return item;
    });
  }
}

class LayerTreeItem extends vscode.TreeItem {}

export function registerLayerView(
  context: vscode.ExtensionContext
): LayerStackProvider {
  const provider = new LayerStackProvider();

  const treeView = vscode.window.createTreeView("noaLayerStack", {
    treeDataProvider: provider,
  });
  context.subscriptions.push(treeView);

  return provider;
}
