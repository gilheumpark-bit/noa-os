import { parseNoaSource, type NoaSourceFile } from "./parse";
import { normalizeAll } from "./normalize";
import { mergeLayers, type MergedResult } from "./merge";
import { resolve, type ResolvedNoaProfile } from "./resolve";
import { validate } from "./validate";
import { buildProvenanceGraph, type ProvenanceGraph } from "./explain";
import { exportArtifact, exportAll, type ExportArtifact } from "./export";
import type { NoaDiagnostic } from "../schema/errors";
import type { CompatibilityTarget } from "../schema/noa-schema";

/**
 * 전체 컴파일 결과.
 */
export interface CompileResult {
  resolved: ResolvedNoaProfile;
  diagnostics: NoaDiagnostic[];
  provenance: ProvenanceGraph;
}

/**
 * 전체 컴파일 파이프라인:
 * Source(s) → Parse → Normalize → Merge → Resolve → Validate → Provenance
 */
export function compile(
  sources: Array<{ text: string; origin: string }>
): CompileResult {
  // 1. Parse
  const parsed: NoaSourceFile[] = sources.map((s) =>
    parseNoaSource(s.text, s.origin)
  );

  // Resolver: id로 파싱된 소스 찾기
  const sourceMap = new Map<string, NoaSourceFile>();
  for (const p of parsed) {
    sourceMap.set(p.file.id, p);
    // "base/secure" 형태의 참조도 지원
    const pathId = `${p.file.kind}/${p.file.id}`;
    sourceMap.set(pathId, p);
  }
  const resolver = (id: string) => sourceMap.get(id);

  // 2. Normalize (extends 해소 + priority 정렬)
  const { layers: normalized, unresolvedParents } = normalizeAll(parsed, resolver);

  // 3. Merge (필드별 전략 적용)
  const merged: MergedResult = mergeLayers(normalized);

  // 4. Resolve (최종 프로필 계산)
  const resolved = resolve(merged);

  // 5. Validate (semantic/target/safety 검증 + 미해소 부모 경고)
  const diagnostics = validate(resolved, unresolvedParents);

  // 6. Provenance graph
  const provenance = buildProvenanceGraph(resolved);

  return { resolved, diagnostics, provenance };
}

/**
 * 컴파일 + 특정 타겟으로 내보내기.
 */
export function compileAndExport(
  sources: Array<{ text: string; origin: string }>,
  target: CompatibilityTarget
): { result: CompileResult; artifact: ExportArtifact } {
  const result = compile(sources);
  const artifact = exportArtifact(result.resolved, target);
  return { result, artifact };
}

/**
 * 컴파일 + 모든 호환 타겟으로 내보내기.
 */
export function compileAndExportAll(
  sources: Array<{ text: string; origin: string }>
): { result: CompileResult; artifacts: ExportArtifact[] } {
  const result = compile(sources);
  const artifacts = exportAll(result.resolved);
  return { result, artifacts };
}
