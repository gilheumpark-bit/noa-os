/**
 * 스키마 버전 마이그레이션.
 * 현재 v1.0만 존재하므로 패스스루 + 버전 체크만 수행.
 */

const CURRENT_VERSION = "1.0";

export function migrateIfNeeded(raw: Record<string, unknown>): Record<string, unknown> {
  const version = typeof raw.schemaVersion === 'string' ? raw.schemaVersion : "1.0";

  if (version === CURRENT_VERSION) {
    return raw;
  }

  // 향후 버전 추가 시 여기에 마이그레이션 로직 삽입
  // e.g. if (version === "0.9") return migrateFrom09(raw);

  throw new Error(
    `지원하지 않는 schemaVersion: "${version}". 현재 지원: ${CURRENT_VERSION}`
  );
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
