import * as vscode from "vscode";
import type { ProvenanceGraph, ProvenanceNode } from "../noa/compiler/explain";

/**
 * Explain View — Provenance 시각화 Webview.
 * "이 규칙이 왜 적용됐는지" 필드별 이력을 보여줌.
 */
export class ExplainPanel {
  private static instance: ExplainPanel | undefined;
  private panel: vscode.WebviewPanel;

  private constructor(extensionUri: vscode.Uri, column: vscode.ViewColumn) {
    this.panel = vscode.window.createWebviewPanel(
      "noaExplain",
      "NOA: Explain Rules",
      column,
      { enableScripts: false, localResourceRoots: [extensionUri] }
    );

    this.panel.onDidDispose(() => {
      ExplainPanel.instance = undefined;
    });
  }

  static show(extensionUri: vscode.Uri, graph: ProvenanceGraph): void {
    const column = vscode.ViewColumn.Beside;

    if (ExplainPanel.instance) {
      ExplainPanel.instance.panel.reveal(column);
    } else {
      ExplainPanel.instance = new ExplainPanel(extensionUri, column);
    }

    ExplainPanel.instance.update(graph);
  }

  private update(graph: ProvenanceGraph): void {
    this.panel.webview.html = this.buildHtml(graph);
  }

  private buildHtml(graph: ProvenanceGraph): string {
    const { nodes, summary } = graph;

    // 필드별로 그룹화
    const grouped = new Map<string, ProvenanceNode[]>();
    for (const node of nodes) {
      const list = grouped.get(node.field) ?? [];
      list.push(node);
      grouped.set(node.field, list);
    }

    const fieldSections = [...grouped.entries()]
      .map(([field, history]) => {
        const rows = history
          .map((n) => {
            const val = typeof n.value === "object"
              ? JSON.stringify(n.value)
              : String(n.value);
            return `<tr>
              <td>${escapeHtml(n.source)}</td>
              <td><code>${STRATEGY_LABELS[n.strategy]}</code></td>
              <td>${escapeHtml(val.length > 80 ? val.slice(0, 80) + "…" : val)}</td>
            </tr>`;
          })
          .join("");

        const isLocked = summary.lockedFields.includes(field);
        const isMonotonic = summary.monotonicFields.includes(field);
        const badge = isLocked ? " 🔒" : isMonotonic ? " ⛓️" : "";

        return `
          <details>
            <summary><strong>${escapeHtml(field)}</strong>${badge}</summary>
            <table>
              <thead><tr><th>레이어</th><th>전략</th><th>값</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </details>
        `;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOA Explain</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.6;
    }
    h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td {
      text-align: left;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 13px;
    }
    th { background: var(--vscode-textBlockQuote-background); }
    details { margin: 6px 0; }
    summary { cursor: pointer; font-size: 14px; padding: 4px 0; }
    code { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
    .layer-flow {
      font-size: 14px;
      padding: 8px 12px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 4px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <h2>🔍 Provenance — 규칙 적용 이력</h2>

  <div class="layer-flow">
    ${summary.layers.map((l, i) => `<strong>${escapeHtml(l)}</strong>${i < summary.layers.length - 1 ? " → " : ""}`).join("")}
  </div>

  <p>필드 ${summary.totalFields}개 · 레이어 ${summary.layerCount}개</p>

  ${fieldSections}
</body>
</html>`;
  }
}

const STRATEGY_LABELS: Record<string, string> = {
  override: "덮어쓰기",
  monotonic_union: "단조 합집합",
  union: "합집합",
  dedupe_append: "중복제거 추가",
  deep_merge: "깊은 병합",
  boolean_max: "불리언 최대",
  replace: "교체",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
