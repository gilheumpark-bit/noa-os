/**
 * Copilot Instructions Writer — 경로 A
 *
 * wear/strip/swap 시 컴파일된 정책을 .github/copilot-instructions.md에 자동 기록.
 * Copilot이 이 파일을 자동으로 system prompt에 포함.
 *
 * 센티넬 마커로 사용자 내용 보존:
 *   <!-- NOA:BEGIN --> ... <!-- NOA:END -->
 */

import * as vscode from "vscode";
import { exportForCopilot } from "../noa/adapters/copilot";
import type { SessionSnapshot } from "../noa/runtime/session";

const SENTINEL_BEGIN = "<!-- NOA:BEGIN -->";
const SENTINEL_END = "<!-- NOA:END -->";
const FILE_PATH = ".github/copilot-instructions.md";

export class CopilotInstructionsWriter {
  /**
   * 세션 상태에 따라 copilot-instructions.md 동기화.
   * resolved가 있으면 NOA 섹션 기록, 없으면 NOA 섹션 제거.
   */
  async sync(session: SessionSnapshot): Promise<boolean> {
    const enabled = vscode.workspace
      .getConfiguration("noa")
      .get<boolean>("autoCopilotInstructions", true);

    if (!enabled) return false;

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return false;

    const root = folders[0].uri;
    const fileUri = vscode.Uri.joinPath(root, FILE_PATH);

    try {
      if (session.resolved) {
        const noaContent = exportForCopilot(session.resolved);
        const noaSection = `${SENTINEL_BEGIN}\n${noaContent}\n${SENTINEL_END}`;
        await this.writeSection(fileUri, noaSection);
      } else {
        await this.removeSection(fileUri);
      }
      return true;
    } catch (e) {
      console.warn("NOA: copilot-instructions.md 동기화 실패", e);
      return false;
    }
  }

  private async writeSection(uri: vscode.Uri, noaSection: string): Promise<void> {
    let existing = "";
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      existing = Buffer.from(raw).toString("utf-8");
    } catch {
      // 파일 없으면 새로 생성
    }

    // .github 디렉토리 보장
    const dir = vscode.Uri.joinPath(uri, "..");
    try {
      await vscode.workspace.fs.createDirectory(dir);
    } catch {
      // 이미 존재
    }

    const updated = this.replaceSentinelSection(existing, noaSection);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, "utf-8"));
  }

  private async removeSection(uri: vscode.Uri): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const existing = Buffer.from(raw).toString("utf-8");
      const updated = this.replaceSentinelSection(existing, "");
      if (updated.trim()) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(updated, "utf-8"));
      }
    } catch {
      // 파일 없으면 아무것도 안 함
    }
  }

  private replaceSentinelSection(content: string, newSection: string): string {
    const beginIdx = content.indexOf(SENTINEL_BEGIN);
    const endIdx = content.indexOf(SENTINEL_END);

    if (beginIdx !== -1 && endIdx !== -1) {
      const before = content.slice(0, beginIdx).trimEnd();
      const after = content.slice(endIdx + SENTINEL_END.length).trimStart();
      if (newSection) {
        return [before, newSection, after].filter(Boolean).join("\n\n");
      }
      return [before, after].filter(Boolean).join("\n\n");
    }

    if (newSection) {
      return content ? `${content.trimEnd()}\n\n${newSection}\n` : `${newSection}\n`;
    }
    return content;
  }
}
