import { parse as parseYaml } from "yaml";
import { NoaFileSchema, type NoaFile } from "../schema/noa-schema";
import { NoaSchemaError } from "../schema/errors";
import { migrateIfNeeded } from "../schema/migrations";

export interface NoaSourceFile {
  file: NoaFile;
  origin: string; // 파일 경로 또는 식별자
  rawText: string;
}

/**
 * YAML 텍스트를 파싱하여 NoaSourceFile로 변환.
 * 스키마 검증 + 마이그레이션 포함.
 */
export function parseNoaSource(text: string, origin: string): NoaSourceFile {
  let raw: Record<string, unknown>;
  try {
    raw = parseYaml(text) as Record<string, unknown>;
  } catch (e) {
    throw new NoaSchemaError(`YAML 파싱 실패 (${origin})`, [
      {
        severity: "error",
        message: e instanceof Error ? e.message : String(e),
        source: origin,
      },
    ]);
  }

  if (raw === null || typeof raw !== "object") {
    throw new NoaSchemaError(`유효한 YAML 객체가 아님 (${origin})`, [
      { severity: "error", message: "최상위가 객체여야 합니다.", source: origin },
    ]);
  }

  const migrated = migrateIfNeeded(raw);
  const result = NoaFileSchema.safeParse(migrated);

  if (!result.success) {
    throw NoaSchemaError.fromZodError(result.error);
  }

  return {
    file: result.data,
    origin,
    rawText: text,
  };
}

/**
 * 여러 YAML 텍스트를 한꺼번에 파싱.
 */
export function parseMultiple(
  sources: Array<{ text: string; origin: string }>
): NoaSourceFile[] {
  return sources.map((s) => parseNoaSource(s.text, s.origin));
}
