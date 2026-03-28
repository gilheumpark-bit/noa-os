import * as vscode from "vscode";
import { NoaFileSchema } from "../noa/schema/noa-schema";
import { parse as parseYaml } from "yaml";

/**
 * .noa 파일용 Language Server 기능:
 * - 실시간 Zod 검증 (빨간 밑줄)
 * - 자동완성 (키워드)
 * - Hover 툴팁
 * - CodeLens (Compile | Preview | Explain)
 */

// --- Diagnostics (실시간 검증) ---

export function registerDiagnostics(
  context: vscode.ExtensionContext
): vscode.DiagnosticCollection {
  const diagnostics = vscode.languages.createDiagnosticCollection("noa");
  context.subscriptions.push(diagnostics);

  // 열려 있는 .noa 파일 검증
  if (vscode.window.activeTextEditor?.document.languageId === "noa") {
    validateDocument(vscode.window.activeTextEditor.document, diagnostics);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === "noa") {
        validateDocument(e.document, diagnostics);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === "noa") {
        validateDocument(doc, diagnostics);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
    })
  );

  return diagnostics;
}

function validateDocument(
  doc: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection
): void {
  const diags: vscode.Diagnostic[] = [];
  const text = doc.getText();

  try {
    const raw = parseYaml(text);
    if (raw && typeof raw === "object") {
      const result = NoaFileSchema.safeParse(raw);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const line = findLineForPath(text, issue.path);
          diags.push(
            new vscode.Diagnostic(
              new vscode.Range(line, 0, line, 999),
              `${issue.path.join(".")}: ${issue.message}`,
              vscode.DiagnosticSeverity.Error
            )
          );
        }
      }
    }
  } catch (e) {
    // YAML 파싱 에러
    diags.push(
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 999),
        `YAML 구문 오류: ${e instanceof Error ? e.message : String(e)}`,
        vscode.DiagnosticSeverity.Error
      )
    );
  }

  diagnostics.set(doc.uri, diags);
}

function findLineForPath(text: string, path: (string | number)[]): number {
  if (path.length === 0) return 0;
  const lines = text.split("\n");
  const target = String(path[path.length - 1]);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`${target}:`)) {
      return i;
    }
  }
  return 0;
}

// --- Completion (자동완성) ---

const TOP_LEVEL_KEYS = [
  { label: "schemaVersion", detail: "스키마 버전", insertText: 'schemaVersion: "1.0"' },
  { label: "id", detail: "고유 식별자", insertText: 'id: "${1:my-persona}"' },
  { label: "kind", detail: "레이어 종류", insertText: 'kind: "${1|base,domain,user,session|}"' },
  { label: "extends", detail: "상위 레이어 참조", insertText: "extends:\n  - \"${1:base/secure}\"" },
  { label: "meta", detail: "메타 정보", insertText: "meta:\n  name: \"${1:이름}\"\n  description: \"${2:설명}\"" },
  { label: "priority", detail: "병합 우선순위", insertText: "priority: ${1:0}" },
  { label: "persona", detail: "페르소나 설정", insertText: "persona:\n  role: \"${1:역할}\"\n  tone: \"${2:톤}\"" },
  { label: "intent", detail: "작업 의도", insertText: "intent:\n  tasks:\n    - \"${1:작업}\"" },
  { label: "policies", detail: "정책", insertText: "policies:\n  safety:\n    deny:\n      - \"${1:금지사항}\"" },
  { label: "engines", detail: "엔진 설정", insertText: "engines:\n  ${1|hfcp,eh,hcrf,ocfp,tlmh|}:\n    enabled: true" },
  { label: "output", detail: "출력 설정", insertText: "output:\n  format: \"${1|markdown,plaintext,json,html|}\"" },
  { label: "compatibility", detail: "호환 대상", insertText: "compatibility:\n  targets: [\"claude\", \"gpt\"]" },
  { label: "accessories", detail: "액세서리", insertText: "accessories:\n  suggested:\n    - \"${1:tool}\"" },
];

export function registerCompletion(
  context: vscode.ExtensionContext
): void {
  const provider = vscode.languages.registerCompletionItemProvider(
    "noa",
    {
      provideCompletionItems(doc, position) {
        const lineText = doc.lineAt(position).text;
        const items: vscode.CompletionItem[] = [];

        // 최상위 키 (들여쓰기 없는 줄)
        if (position.character === 0 || lineText.trim() === "") {
          for (const key of TOP_LEVEL_KEYS) {
            const item = new vscode.CompletionItem(
              key.label,
              vscode.CompletionItemKind.Property
            );
            item.detail = key.detail;
            item.insertText = new vscode.SnippetString(key.insertText);
            items.push(item);
          }
        }

        // kind 값 자동완성
        if (lineText.match(/kind:\s*/)) {
          for (const k of ["base", "domain", "user", "session"]) {
            items.push(
              new vscode.CompletionItem(k, vscode.CompletionItemKind.EnumMember)
            );
          }
        }

        // engines 하위 키
        if (lineText.match(/^\s{2}\w/) && doc.getText().includes("engines:")) {
          for (const e of ["hfcp", "eh", "hcrf", "ocfp", "tlmh"]) {
            const item = new vscode.CompletionItem(
              e,
              vscode.CompletionItemKind.Module
            );
            item.insertText = new vscode.SnippetString(
              `${e}:\n    enabled: true`
            );
            items.push(item);
          }
        }

        return items;
      },
    },
    "" // 트리거 없이 항상 제안
  );
  context.subscriptions.push(provider);
}

// --- Hover (툴팁) ---

const FIELD_DOCS: Record<string, string> = {
  schemaVersion: "스키마 버전. 현재 1.0만 지원.",
  id: "이 .noa 파일의 고유 식별자. extends에서 참조할 때 사용.",
  kind: "레이어 종류: base(0-99), domain(100-299), user(300-599), session(600+)",
  extends: "상위 레이어 참조 목록. 병합 시 상위가 먼저 적용됨.",
  priority: "병합 우선순위. 낮을수록 먼저 적용(base). kind에 따라 범위 제한.",
  deny: "금지 목록. monotonic union — 하위 레이어에서 제거 불가.",
  allow: "허용 목록. deny와 충돌 시 deny가 우선.",
  locks: "잠긴 필드 목록. 하위 레이어에서 override 차단.",
  hfcp: "HFCP v2.7 — 대화 에너지/점수 시스템. mode: CHAT|CREATIVE",
  eh: "EH v15.9 — 할루시네이션 탐지. domain_weight로 민감도 조절.",
  hcrf: "HCRF v1.2 — 책임 게이트. authority_transfer_block으로 권한 이양 차단.",
  ocfp: "OCFP v2.0 — 조직/기업 필터. seal_duration(분), risk_limit(횟수).",
  tlmh: "TLMH v2.0 — 연구 파트너 모드. invitation_only: 명시적 초대만 허용.",
  sovereign: "Sovereign Gate (NSG) v1.0 — 5파트 보안 커널. FSM + 정책 + 게이트웨이 + 감사 + 스파이크. 항상 활성.",
  nib: "Invariant Bridge (NIB) v1.0 — 시간축 패턴 분석. 슬라이딩 윈도우 7특징 추출. 항상 활성.",
};

export function registerHover(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerHoverProvider("noa", {
    provideHover(doc, position) {
      const wordRange = doc.getWordRangeAtPosition(position, /[\w.-]+/);
      if (!wordRange) return;

      const word = doc.getText(wordRange);
      const description = FIELD_DOCS[word];
      if (!description) return;

      return new vscode.Hover(
        new vscode.MarkdownString(`**${word}** — ${description}`)
      );
    },
  });
  context.subscriptions.push(provider);
}

// --- CodeLens ---

export function registerCodeLens(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerCodeLensProvider("noa", {
    provideCodeLenses(doc) {
      const topRange = new vscode.Range(0, 0, 0, 0);
      return [
        new vscode.CodeLens(topRange, {
          title: "$(gear) Compile",
          command: "noa.compile",
          tooltip: "이 .noa 파일을 컴파일",
        }),
        new vscode.CodeLens(topRange, {
          title: "$(export) Export",
          command: "noa.export",
          tooltip: "컴파일 결과 내보내기",
        }),
        new vscode.CodeLens(topRange, {
          title: "$(info) Explain",
          command: "noa.explain",
          tooltip: "규칙 적용 이유 확인",
        }),
      ];
    },
  });
  context.subscriptions.push(provider);
}
