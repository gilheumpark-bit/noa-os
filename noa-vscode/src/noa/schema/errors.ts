import type { ZodError } from "zod";

export type NoaErrorSeverity = "error" | "warning" | "info";

export interface NoaDiagnostic {
  severity: NoaErrorSeverity;
  message: string;
  path?: string;
  line?: number;
  source?: string;
}

export class NoaSchemaError extends Error {
  public readonly diagnostics: NoaDiagnostic[];

  constructor(message: string, diagnostics: NoaDiagnostic[]) {
    super(message);
    this.name = "NoaSchemaError";
    this.diagnostics = diagnostics;
  }

  static fromZodError(zodError: ZodError): NoaSchemaError {
    const diagnostics: NoaDiagnostic[] = zodError.issues.map((issue) => ({
      severity: "error" as const,
      message: issue.message,
      path: issue.path.join("."),
    }));
    return new NoaSchemaError(
      `스키마 검증 실패: ${zodError.issues.length}개 오류`,
      diagnostics
    );
  }
}

export class NoaLockViolationError extends Error {
  public readonly lockedField: string;
  public readonly attemptedBy: string;

  constructor(lockedField: string, attemptedBy: string) {
    super(
      `잠금 위반: "${lockedField}"은 상위 레이어에서 잠김 — "${attemptedBy}"에서 override 시도`
    );
    this.name = "NoaLockViolationError";
    this.lockedField = lockedField;
    this.attemptedBy = attemptedBy;
  }
}
