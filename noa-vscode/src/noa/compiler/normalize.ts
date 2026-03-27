import type { NoaFile } from "../schema/noa-schema";
import type { NoaSourceFile } from "./parse";

/**
 * 정규화된 IR — extends 해소 전, 기본값이 채워진 상태.
 */
export interface NormalizedLayer {
  file: NoaFile;
  origin: string;
  extendsResolved: boolean;
}

/**
 * extends 참조를 해소하고 기본값을 채운 정규화 IR을 반환.
 *
 * @param source   파싱된 소스 파일
 * @param resolver extends에 명시된 ID로 NoaSourceFile을 찾는 함수
 */
export function normalize(
  source: NoaSourceFile,
  resolver: (id: string) => NoaSourceFile | undefined
): NormalizedLayer[] {
  const layers: NormalizedLayer[] = [];
  const visited = new Set<string>();

  collectLayers(source, resolver, layers, visited);

  // priority 오름차순 정렬 (낮은 priority가 먼저 = base가 밑)
  layers.sort((a, b) => a.file.priority - b.file.priority);

  return layers;
}

function collectLayers(
  source: NoaSourceFile,
  resolver: (id: string) => NoaSourceFile | undefined,
  layers: NormalizedLayer[],
  visited: Set<string>
): void {
  if (visited.has(source.file.id)) {
    return; // 순환 참조 방지
  }
  visited.add(source.file.id);

  // extends 부모부터 재귀 수집
  for (const parentId of source.file.extends) {
    const parent = resolver(parentId);
    if (parent) {
      collectLayers(parent, resolver, layers, visited);
    }
    // 부모를 찾지 못하면 무시 (validate에서 경고)
  }

  layers.push({
    file: source.file,
    origin: source.origin,
    extendsResolved: true,
  });
}

/**
 * 여러 소스를 한번에 정규화.
 * 최상위 소스의 extends 체인까지 전부 펼침.
 */
export function normalizeAll(
  sources: NoaSourceFile[],
  resolver: (id: string) => NoaSourceFile | undefined
): NormalizedLayer[] {
  const allLayers: NormalizedLayer[] = [];
  const seen = new Set<string>();

  for (const src of sources) {
    const normalized = normalize(src, resolver);
    for (const layer of normalized) {
      if (!seen.has(layer.file.id)) {
        seen.add(layer.file.id);
        allLayers.push(layer);
      }
    }
  }

  allLayers.sort((a, b) => a.file.priority - b.file.priority);
  return allLayers;
}
