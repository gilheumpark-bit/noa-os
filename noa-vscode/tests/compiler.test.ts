import { describe, it, expect } from "vitest";
import { parseNoaSource } from "../src/noa/compiler/parse";
import { normalize } from "../src/noa/compiler/normalize";
import { mergeLayers } from "../src/noa/compiler/merge";
import { resolve } from "../src/noa/compiler/resolve";
import { validate } from "../src/noa/compiler/validate";
import { buildProvenanceGraph, traceField, explainField } from "../src/noa/compiler/explain";
import { compile, compileAndExport } from "../src/noa/compiler/pipeline";
import { NoaLockViolationError, NoaSchemaError } from "../src/noa/schema/errors";

// --- 테스트 데이터 ---

const SECURE_BASE = `
schemaVersion: "1.0"
id: "secure"
kind: "base"
meta:
  name: "Secure Base"
  tags: ["safety"]
priority: 0
persona:
  role: "안전 기반 보조자"
  tone: "신중함"
policies:
  safety:
    deny:
      - "악성 코드 생성"
      - "개인정보 무단 수집"
    locks:
      - "policies.safety.deny"
    escalation:
      requiredOn:
        - "생명 위협"
  uncertainty:
    style: "explicit"
  citations:
    required: false
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

const MEDICAL_DOMAIN = `
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
  role: "근거 기반 의료 보조자"
  tone: "차분하고 명확함"
  audience: "일반 사용자"
intent:
  tasks:
    - "증상 관련 정보 정리"
    - "위험 신호 분류"
policies:
  safety:
    deny:
      - "확정 진단 단정"
    escalation:
      requiredOn:
        - "약물 상호작용 의심"
  citations:
    required: true
engines:
  hfcp:
    enabled: true
    mode: "CHAT"
    score_cap: 150
  eh:
    enabled: true
    domain_weight: 1.4
output:
  format: "markdown"
  sections:
    - "요약"
    - "가능성"
    - "권장 행동"
compatibility:
  targets: ["claude", "gpt", "local"]
accessories:
  suggested:
    - "pubmed"
`;

// --- Parse 테스트 ---

describe("parse", () => {
  it("유효한 .noa YAML을 파싱한다", () => {
    const result = parseNoaSource(SECURE_BASE, "base/secure.noa");
    expect(result.file.id).toBe("secure");
    expect(result.file.kind).toBe("base");
    expect(result.origin).toBe("base/secure.noa");
  });

  it("잘못된 YAML을 거부한다", () => {
    expect(() => parseNoaSource("{{invalid", "bad.noa")).toThrow(NoaSchemaError);
  });

  it("필수 필드 누락 시 에러", () => {
    const invalid = `
schemaVersion: "1.0"
kind: "base"
meta:
  name: "test"
`;
    expect(() => parseNoaSource(invalid, "missing-id.noa")).toThrow(NoaSchemaError);
  });
});

// --- Normalize 테스트 ---

describe("normalize", () => {
  it("extends 체인을 해소한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([
      ["secure", secureSource],
      ["base/secure", secureSource],
    ]);

    const layers = normalize(medicalSource, (id) => sourceMap.get(id));

    expect(layers.length).toBe(2);
    expect(layers[0].file.id).toBe("secure"); // base 먼저
    expect(layers[1].file.id).toBe("medical"); // domain 나중
  });

  it("순환 참조를 방지한다", () => {
    const selfRef = `
schemaVersion: "1.0"
id: "loop"
kind: "domain"
extends:
  - "loop"
meta:
  name: "Loop"
priority: 100
`;
    const source = parseNoaSource(selfRef, "loop.noa");
    const layers = normalize(source, (id) =>
      id === "loop" ? source : undefined
    );
    // 순환이어도 1개만 나와야 함
    expect(layers.length).toBe(1);
  });
});

// --- Merge 테스트 ---

describe("merge", () => {
  it("deny를 monotonic union으로 병합한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([
      ["secure", secureSource],
      ["base/secure", secureSource],
    ]);

    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);

    const deny = merged.profile.policies?.safety?.deny ?? [];
    expect(deny).toContain("악성 코드 생성");
    expect(deny).toContain("개인정보 무단 수집");
    expect(deny).toContain("확정 진단 단정");
    expect(deny.length).toBe(3);
  });

  it("persona.role을 override한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);

    expect(merged.profile.persona?.role).toBe("근거 기반 의료 보조자");
  });

  it("citations.required는 boolean max로 병합한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);

    // secure: false, medical: true → true
    expect(merged.profile.policies?.citations?.required).toBe(true);
  });

  it("intent.tasks를 dedupe append한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);

    expect(merged.profile.intent?.tasks).toContain("증상 관련 정보 정리");
    expect(merged.profile.intent?.tasks).toContain("위험 신호 분류");
  });

  it("engines를 deep merge한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);

    // secure의 hcrf + medical의 hfcp, eh 병합
    expect(merged.profile.engines?.hcrf?.enabled).toBe(true);
    expect(merged.profile.engines?.hfcp?.enabled).toBe(true);
    expect(merged.profile.engines?.eh?.domain_weight).toBe(1.4); // medical이 override
  });

  it("escalation.requiredOn을 dedupe append한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);

    const requiredOn = merged.profile.policies?.safety?.escalation?.requiredOn ?? [];
    expect(requiredOn).toContain("생명 위협");
    expect(requiredOn).toContain("약물 상호작용 의심");
  });
});

// --- Resolve 테스트 ---

describe("resolve", () => {
  it("활성 엔진 목록을 계산한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);
    const resolved = resolve(merged);

    expect(resolved.activeEngines).toContain("hcrf");
    expect(resolved.activeEngines).toContain("eh");
    expect(resolved.activeEngines).toContain("hfcp");
  });

  it("effectiveDeny에 전체 deny가 포함된다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);
    const resolved = resolve(merged);

    expect(resolved.effectiveDeny.length).toBe(3);
  });
});

// --- Validate 테스트 ---

describe("validate", () => {
  it("정상 프로필에 에러 없음", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);
    const resolved = resolve(merged);
    const diagnostics = validate(resolved);

    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBe(0);
  });
});

// --- Explain 테스트 ---

describe("explain", () => {
  it("provenance 그래프를 생성한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);
    const resolved = resolve(merged);
    const graph = buildProvenanceGraph(resolved);

    expect(graph.summary.layerCount).toBe(2);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it("필드 이력을 추적한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);
    const resolved = resolve(merged);
    const graph = buildProvenanceGraph(resolved);

    const denyHistory = traceField(graph, "policies.safety.deny");
    expect(denyHistory.length).toBeGreaterThanOrEqual(1);
  });

  it("사람이 읽을 수 있는 설명을 생성한다", () => {
    const secureSource = parseNoaSource(SECURE_BASE, "base/secure.noa");
    const medicalSource = parseNoaSource(MEDICAL_DOMAIN, "wardrobe/medical.noa");

    const sourceMap = new Map([["secure", secureSource]]);
    const layers = normalize(medicalSource, (id) => sourceMap.get(id));
    const merged = mergeLayers(layers);
    const resolved = resolve(merged);
    const graph = buildProvenanceGraph(resolved);

    const explanation = explainField(graph, "policies.safety.deny");
    expect(explanation).toContain("단조 합집합");
  });
});

// --- Pipeline 통합 테스트 ---

describe("pipeline", () => {
  it("전체 컴파일 파이프라인이 동작한다", () => {
    const result = compile([
      { text: SECURE_BASE, origin: "base/secure.noa" },
      { text: MEDICAL_DOMAIN, origin: "wardrobe/medical.noa" },
    ]);

    expect(result.resolved.profile.id).toBeDefined();
    expect(result.diagnostics).toBeDefined();
    expect(result.provenance.nodes.length).toBeGreaterThan(0);
  });

  it("Claude 어댑터로 내보내기한다", () => {
    const { artifact } = compileAndExport(
      [
        { text: SECURE_BASE, origin: "base/secure.noa" },
        { text: MEDICAL_DOMAIN, origin: "wardrobe/medical.noa" },
      ],
      "claude"
    );

    expect(artifact.target).toBe("claude");
    expect(artifact.content).toContain("근거 기반 의료 보조자");
    expect(artifact.content).toContain("악성 코드 생성");
  });

  it("GPT 어댑터로 내보내기한다", () => {
    const { artifact } = compileAndExport(
      [
        { text: SECURE_BASE, origin: "base/secure.noa" },
        { text: MEDICAL_DOMAIN, origin: "wardrobe/medical.noa" },
      ],
      "gpt"
    );

    expect(artifact.target).toBe("gpt");
    expect(artifact.content).toContain("Role:");
  });

  it("Local 어댑터로 내보내기한다", () => {
    const { artifact } = compileAndExport(
      [
        { text: SECURE_BASE, origin: "base/secure.noa" },
        { text: MEDICAL_DOMAIN, origin: "wardrobe/medical.noa" },
      ],
      "local"
    );

    expect(artifact.target).toBe("local");
    const parsed = JSON.parse(artifact.content);
    expect(parsed.system).toBeDefined();
    expect(parsed.parameters.temperature).toBeDefined();
  });
});
