/**
 * 프리셋 + 사용자 정의 레지스트리.
 * .noa 파일을 디스커버리하고 ID로 조회 가능하게 관리.
 */

import type { NoaSourceFile } from "../compiler/parse";
import { parseNoaSource } from "../compiler/parse";

export interface RegistryEntry {
  id: string;
  name: string;
  kind: string;
  priority: number;
  origin: string;
  source: NoaSourceFile;
}

export class NoaRegistry {
  private entries = new Map<string, RegistryEntry>();

  /**
   * YAML 텍스트로 등록.
   */
  register(text: string, origin: string): RegistryEntry {
    const source = parseNoaSource(text, origin);
    const entry: RegistryEntry = {
      id: source.file.id,
      name: source.file.meta.name,
      kind: source.file.kind,
      priority: source.file.priority,
      origin,
      source,
    };
    this.entries.set(entry.id, entry);
    // kind/id 별칭
    this.entries.set(`${entry.kind}/${entry.id}`, entry);
    return entry;
  }

  /**
   * ID 또는 kind/id로 조회.
   */
  get(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * NoaSourceFile 조회 (extends resolver용).
   */
  getSource(id: string): NoaSourceFile | undefined {
    return this.entries.get(id)?.source;
  }

  /**
   * kind별 목록.
   */
  listByKind(kind: string): RegistryEntry[] {
    return [...this.entries.values()]
      .filter((e) => e.kind === kind && !e.id.includes("/"))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * 전체 목록 (중복 제거).
   */
  listAll(): RegistryEntry[] {
    const seen = new Set<string>();
    return [...this.entries.values()].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).sort((a, b) => a.priority - b.priority);
  }

  /**
   * 등록 해제.
   */
  unregister(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    this.entries.delete(`${entry.kind}/${id}`);
    return true;
  }

  /**
   * 전체 초기화.
   */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    // 중복 별칭 제외
    const ids = new Set<string>();
    for (const e of this.entries.values()) ids.add(e.id);
    return ids.size;
  }
}
