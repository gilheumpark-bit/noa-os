import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "../src/noa/runtime/session";
import { NoaRegistry } from "../src/noa/runtime/registry";

const SECURE_NOA = `
schemaVersion: "1.0"
id: "secure"
kind: "base"
meta:
  name: "Secure Base"
  tags: ["safety"]
priority: 0
persona:
  role: "안전 기반 보조자"
policies:
  safety:
    deny:
      - "악성 코드 생성"
    locks:
      - "policies.safety.deny"
engines:
  hcrf:
    enabled: true
    authority_transfer_block: true
  eh:
    enabled: true
    domain_weight: 1.0
compatibility:
  targets: ["claude", "gpt"]
`;

const MEDICAL_NOA = `
schemaVersion: "1.0"
id: "medical"
kind: "domain"
extends:
  - "secure"
meta:
  name: "Medical Assistant"
  tags: ["medical"]
priority: 200
persona:
  role: "의료 보조자"
  tone: "차분함"
engines:
  hfcp:
    enabled: true
    mode: "CHAT"
    score_cap: 150
  eh:
    enabled: true
    domain_weight: 1.4
    source_credibility: true
compatibility:
  targets: ["claude", "gpt"]
`;

describe("NoaRegistry", () => {
  let registry: NoaRegistry;

  beforeEach(() => {
    registry = new NoaRegistry();
  });

  it("소스를 등록하고 조회한다", () => {
    registry.register(SECURE_NOA, "presets/base/secure.noa");
    const entry = registry.get("secure");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Secure Base");
  });

  it("kind/id 별칭으로 조회 가능", () => {
    registry.register(SECURE_NOA, "presets/base/secure.noa");
    expect(registry.get("base/secure")).toBeDefined();
  });

  it("전체 목록 반환", () => {
    registry.register(SECURE_NOA, "base.noa");
    registry.register(MEDICAL_NOA, "medical.noa");
    expect(registry.size).toBe(2);
    expect(registry.listAll().length).toBe(2);
  });

  it("kind별 필터링", () => {
    registry.register(SECURE_NOA, "base.noa");
    registry.register(MEDICAL_NOA, "medical.noa");
    expect(registry.listByKind("base").length).toBe(1);
    expect(registry.listByKind("domain").length).toBe(1);
  });
});

describe("SessionManager", () => {
  let mgr: SessionManager;

  beforeEach(() => {
    mgr = new SessionManager();
    mgr.registerSource("secure", SECURE_NOA, "base.noa");
    mgr.registerSource("medical", MEDICAL_NOA, "medical.noa");
    mgr.createSession("test");
  });

  it("세션을 생성한다", () => {
    const session = mgr.getSession("test");
    expect(session).toBeDefined();
    expect(session!.activeLayers.length).toBe(0);
  });

  it("wear로 페르소나를 입는다", () => {
    mgr.wear("test", "medical");
    const session = mgr.getSession("test")!;
    expect(session.activeLayers.length).toBeGreaterThan(0);
    expect(session.resolved).not.toBeNull();
  });

  it("wear 후 엔진이 초기화된다", () => {
    mgr.wear("test", "medical");
    const session = mgr.getSession("test")!;
    expect(session.engineStates.hfcp).not.toBeNull();
    expect(session.engineStates.hfcp!.score).toBe(60);
    expect(session.engineStates.hcrf).not.toBeNull();
  });

  it("strip으로 페르소나를 벗는다", () => {
    mgr.wear("test", "medical");
    mgr.strip("test", "medical");
    const session = mgr.getSession("test")!;
    // secure는 extends로 자동 포함되었으므로 medical만 제거
    // 여기서는 secure도 별도 wear하지 않았으므로 빈 스택
    expect(session.activeLayers.length).toBe(0);
  });

  it("swap으로 원자적 교체", () => {
    mgr.registerSource("creative", `
schemaVersion: "1.0"
id: "creative"
kind: "domain"
meta:
  name: "Creative"
priority: 220
persona:
  role: "창작 파트너"
engines:
  hfcp:
    enabled: true
    mode: "CREATIVE"
compatibility:
  targets: ["claude"]
`, "creative.noa");

    mgr.wear("test", "medical");
    mgr.swap("test", "medical", "creative");
    const session = mgr.getSession("test")!;
    const ids = session.activeLayers.map((l) => l.source.file.id);
    expect(ids).toContain("creative");
    expect(ids).not.toContain("medical");
  });

  it("processTurn으로 엔진을 실행한다", () => {
    mgr.wear("test", "medical");
    const { status } = mgr.processTurn("test", "이 약의 부작용이 있나요?");
    expect(status.hfcpScore).not.toBeNull();
    expect(status.ehLevel).not.toBeNull();
    expect(status.activeEngines.length).toBeGreaterThan(0);
  });

  it("getStatus로 상태 요약을 반환한다", () => {
    mgr.wear("test", "medical");
    const session = mgr.getSession("test")!;
    const status = mgr.getStatus(session);
    expect(status.layerNames.length).toBeGreaterThan(0);
    expect(status.activeEngines).toContain("hfcp");
    expect(status.activeEngines).toContain("eh");
  });

  it("exportArtifacts로 내보내기한다", () => {
    mgr.wear("test", "medical");
    const artifacts = mgr.exportArtifacts("test");
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts[0].target).toBeDefined();
    expect(artifacts[0].content.length).toBeGreaterThan(0);
  });

  it("존재하지 않는 소스로 wear 시 에러", () => {
    expect(() => mgr.wear("test", "nonexistent")).toThrow();
  });

  it("중복 wear는 무시", () => {
    mgr.wear("test", "medical");
    const before = mgr.getSession("test")!.activeLayers.length;
    mgr.wear("test", "medical");
    const after = mgr.getSession("test")!.activeLayers.length;
    expect(after).toBe(before);
  });

  it("wear는 verification 결과를 반환한다", () => {
    const { verification, rolledBack } = mgr.wear("test", "medical");
    expect(rolledBack).toBe(false);
    expect(verification).not.toBeNull();
    expect(verification!.passed).toBe(true);
  });

  it("wear 검증 게이트 — 정상 프로필은 롤백 안 됨", () => {
    const { session, rolledBack } = mgr.wear("test", "medical");
    expect(rolledBack).toBe(false);
    expect(session.activeLayers.length).toBeGreaterThan(0);
  });

  it("rollback — 적용된 변경 복구", () => {
    mgr.wear("test", "medical");
    // rollback 대상이 없으면 false
    const result = mgr.rollback("test");
    // ChangeManager에 APPLIED 상태가 없으므로 false
    expect(result).toBe(false);
  });
});
