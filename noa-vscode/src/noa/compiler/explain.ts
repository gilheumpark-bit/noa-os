import type { ProvenanceEntry, MergeStrategy } from "./merge";
import type { ResolvedNoaProfile } from "./resolve";

/**
 * Provenance 그래프 노드 — UI(Explain View)에서 시각화에 사용.
 */
export interface ProvenanceNode {
  field: string;
  value: unknown;
  source: string;
  strategy: MergeStrategy;
  depth: number; // 레이어 깊이 (0 = base)
}

export interface ProvenanceGraph {
  nodes: ProvenanceNode[];
  summary: ProvenanceSummary;
}

export interface ProvenanceSummary {
  totalFields: number;
  layerCount: number;
  layers: string[];
  lockedFields: string[];
  monotonicFields: string[];
}

/**
 * ResolvedNoaProfile로부터 Provenance 그래프를 생성.
 * "이 규칙이 왜 적용됐는지" 시각화용.
 */
export function buildProvenanceGraph(resolved: ResolvedNoaProfile): ProvenanceGraph {
  const { provenance, lockedFields } = resolved;

  // 레이어 순서 추출 (등장 순)
  const layerOrder: string[] = [];
  const layerSet = new Set<string>();
  for (const entry of provenance) {
    if (!layerSet.has(entry.source)) {
      layerSet.add(entry.source);
      layerOrder.push(entry.source);
    }
  }

  // 노드 생성
  const nodes: ProvenanceNode[] = provenance.map((entry) => ({
    field: entry.field,
    value: entry.value,
    source: entry.source,
    strategy: entry.strategy,
    depth: layerOrder.indexOf(entry.source),
  }));

  // monotonic 필드 추출
  const monotonicFields = provenance
    .filter((e) => e.strategy === "monotonic_union")
    .map((e) => e.field);
  const uniqueMonotonic = [...new Set(monotonicFields)];

  return {
    nodes,
    summary: {
      totalFields: new Set(provenance.map((e) => e.field)).size,
      layerCount: layerOrder.length,
      layers: layerOrder,
      lockedFields,
      monotonicFields: uniqueMonotonic,
    },
  };
}

/**
 * 특정 필드의 provenance 히스토리를 추적.
 * 해당 필드가 어떤 레이어들을 거쳐 현재 값이 되었는지 반환.
 */
export function traceField(
  graph: ProvenanceGraph,
  fieldPath: string
): ProvenanceNode[] {
  return graph.nodes.filter((n) => n.field === fieldPath);
}

/**
 * 사람이 읽을 수 있는 설명 텍스트 생성.
 */
export function explainField(
  graph: ProvenanceGraph,
  fieldPath: string
): string {
  const history = traceField(graph, fieldPath);
  if (history.length === 0) {
    return `"${fieldPath}" — 설정 이력 없음 (기본값 사용)`;
  }

  const lines = history.map((node) => {
    const strategyLabel = STRATEGY_LABELS[node.strategy];
    const valueStr =
      typeof node.value === "object"
        ? JSON.stringify(node.value)
        : String(node.value);
    return `  [${node.source}] ${strategyLabel} → ${valueStr}`;
  });

  return [`"${fieldPath}" 이력:`, ...lines].join("\n");
}

const STRATEGY_LABELS: Record<MergeStrategy, string> = {
  override: "덮어쓰기",
  monotonic_union: "단조 합집합 (제거 불가)",
  union: "합집합",
  dedupe_append: "중복 제거 추가",
  deep_merge: "깊은 병합",
  boolean_max: "불리언 최대값",
  replace: "교체",
};
