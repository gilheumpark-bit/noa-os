import * as vscode from "vscode";
import type { CompileResult } from "../noa/compiler/pipeline";
import type { ExportArtifact } from "../noa/compiler/export";

/**
 * 컴파일 결과 프리뷰 Webview 패널.
 * Compile & Preview 명령 시 열림.
 */
export class PreviewPanel {
  private static instance: PreviewPanel | undefined;
  private panel: vscode.WebviewPanel;

  private constructor(
    extensionUri: vscode.Uri,
    column: vscode.ViewColumn
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "noaPreview",
      "NOA: Compile Preview",
      column,
      {
        enableScripts: false,
        localResourceRoots: [extensionUri],
      }
    );

    this.panel.onDidDispose(() => {
      PreviewPanel.instance = undefined;
    });
  }

  static show(
    extensionUri: vscode.Uri,
    result: CompileResult,
    artifacts: ExportArtifact[]
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (PreviewPanel.instance) {
      PreviewPanel.instance.panel.reveal(column);
    } else {
      PreviewPanel.instance = new PreviewPanel(extensionUri, column);
    }

    PreviewPanel.instance.update(result, artifacts);
  }

  private update(result: CompileResult, artifacts: ExportArtifact[]): void {
    this.panel.webview.html = this.buildHtml(result, artifacts);
  }

  private buildHtml(
    result: CompileResult,
    artifacts: ExportArtifact[]
  ): string {
    const { resolved, diagnostics, provenance } = result;
    const profile = resolved.profile;

    const diagHtml = diagnostics.length > 0
      ? diagnostics
          .map((d) => {
            const icon = d.severity === "error" ? "🔴" : d.severity === "warning" ? "🟡" : "🔵";
            return `<li>${icon} <code>${d.path ?? ""}</code> ${escapeHtml(d.message)}</li>`;
          })
          .join("\n")
      : "<li>검증 통과 ✅</li>";

    const artifactTabs = artifacts
      .map(
        (a) =>
          `<details>
            <summary><strong>${a.target.toUpperCase()}</strong></summary>
            <pre>${escapeHtml(a.content)}</pre>
          </details>`
      )
      .join("\n");

    const provenanceSummary = `
      <ul>
        <li>레이어: ${provenance.summary.layers.join(" → ")}</li>
        <li>필드 수: ${provenance.summary.totalFields}</li>
        <li>잠긴 필드: ${provenance.summary.lockedFields.join(", ") || "없음"}</li>
        <li>단조 필드: ${provenance.summary.monotonicFields.join(", ") || "없음"}</li>
      </ul>
    `;

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOA Compile Preview</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      padding: 16px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.6;
    }
    h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
    pre {
      background: var(--vscode-textBlockQuote-background);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 13px;
    }
    code { font-family: var(--vscode-editor-font-family, monospace); }
    details { margin: 8px 0; }
    summary { cursor: pointer; font-size: 14px; }
    ul { padding-left: 20px; }
    .tag {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      margin: 2px;
    }
  </style>
</head>
<body>
  <h2>📋 프로필: ${escapeHtml(profile.meta.name)}</h2>
  <p>
    <span class="tag">${profile.kind}</span>
    <span class="tag">priority: ${profile.priority}</span>
    ${resolved.activeEngines.map((e) => `<span class="tag">${e}</span>`).join(" ")}
  </p>

  ${profile.persona?.role ? `<p><strong>Role:</strong> ${escapeHtml(profile.persona.role)}</p>` : ""}
  ${profile.persona?.tone ? `<p><strong>Tone:</strong> ${escapeHtml(profile.persona.tone)}</p>` : ""}

  <h2>🔒 Safety</h2>
  <p><strong>Deny (${resolved.effectiveDeny.length}):</strong></p>
  <ul>${resolved.effectiveDeny.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>

  <h2>📊 검증</h2>
  <ul>${diagHtml}</ul>

  <h2>🔍 Provenance</h2>
  ${provenanceSummary}

  <h2>📦 Artifacts</h2>
  ${artifactTabs}
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
