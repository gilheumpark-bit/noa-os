import type { NoaFile } from "../schema/noa-schema";
import type { MergedResult, ProvenanceEntry } from "./merge";

/**
 * ResolvedNoaProfile — 최종 해석된 프로필.
 * 병합 완료 후 provenance 정보 포함.
 */
export interface ResolvedNoaProfile {
  /** 병합 + 해석된 최종 .noa 프로필 */
  profile: NoaFile;
  /** 각 필드의 출처 추적 */
  provenance: ProvenanceEntry[];
  /** 해석 메타데이터 */
  resolvedAt: string;
  /** 활성 엔진 목록 */
  activeEngines: string[];
  /** 최종 deny 목록 (전체 레이어 통합) */
  effectiveDeny: string[];
  /** 최종 allow 목록 (deny 제외) */
  effectiveAllow: string[];
  /** 잠긴 필드 목록 */
  lockedFields: string[];
}

/**
 * MergedResult를 최종 ResolvedNoaProfile로 해석.
 * 엔진 활성 상태, deny/allow 최종값, 잠긴 필드 등을 계산.
 */
export function resolve(merged: MergedResult): ResolvedNoaProfile {
  const { profile, provenance } = merged;

  // 활성 엔진 추출
  const activeEngines: string[] = [];
  if (profile.engines) {
    for (const [name, config] of Object.entries(profile.engines)) {
      if (config && typeof config === 'object' && 'enabled' in config && (config as { enabled?: unknown }).enabled === true) {
        activeEngines.push(name);
      }
    }
  }

  // deny/allow 최종값
  const effectiveDeny = profile.policies?.safety?.deny ?? [];
  const effectiveAllow = (profile.policies?.safety?.allow ?? []).filter(
    (item) => !effectiveDeny.includes(item)
  );

  // 잠긴 필드
  const lockedFields = profile.policies?.safety?.locks ?? [];

  return {
    profile,
    provenance,
    resolvedAt: new Date().toISOString(),
    activeEngines,
    effectiveDeny,
    effectiveAllow,
    lockedFields,
  };
}
