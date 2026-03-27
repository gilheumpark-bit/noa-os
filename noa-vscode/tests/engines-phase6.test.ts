import { describe, it, expect, beforeEach } from "vitest";
import {
  AegisLedger,
  createContextState,
  createMessageFrame,
  appendMessage,
} from "../src/noa/engines/ledger";
import {
  assessRisk,
  RiskLevel,
  InteractionGate,
  createKernelState,
  updateKernelGate,
  OcfpEngine,
  AdminAction,
  OrgRole,
  PersonaMode,
  createOrgPersona,
} from "../src/noa/engines/ocfp";
import {
  evaluateInvocation,
  evaluateQuestionQuality,
  containsProhibitedPattern,
  resolveSilenceProfile,
  processTlmhTurn,
  createInitialTlmhState,
  InvocationState,
  ProhibitedQuestionType,
} from "../src/noa/engines/tlmh";
import {
  Sovereign27,
  SealHash,
  VectorShift,
  PolicyGlyph,
  Verdict,
  Mode,
} from "../src/noa/engines/sovereign";

// ========== Aegis v28 Ledger ==========

describe("Aegis v28 Ledger", () => {
  let ledger: AegisLedger;

  beforeEach(() => {
    ledger = new AegisLedger();
  });

  it("이벤트를 기록하고 해시를 반환한다", () => {
    const hash = ledger.record("TEST", { data: "hello" });
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(ledger.getLength()).toBe(1);
  });

  it("해시 체인 무결성을 검증한다", () => {
    ledger.record("EVENT_1", { a: 1 });
    ledger.record("EVENT_2", { b: 2 });
    ledger.record("EVENT_3", { c: 3 });

    const { valid } = ledger.verify();
    expect(valid).toBe(true);
  });

  it("tailHash가 마지막 이벤트 해시와 일치", () => {
    const h1 = ledger.record("A", {});
    const h2 = ledger.record("B", {});
    expect(ledger.getTailHash()).toBe(h2);
  });

  it("이벤트 타입별 필터링", () => {
    ledger.record("LOGIN", { user: "a" });
    ledger.record("ACTION", { cmd: "x" });
    ledger.record("LOGIN", { user: "b" });

    expect(ledger.filterByType("LOGIN").length).toBe(2);
    expect(ledger.filterByType("ACTION").length).toBe(1);
  });

  it("JSON 내보내기", () => {
    ledger.record("TEST", {});
    const json = ledger.export();
    const parsed = JSON.parse(json);
    expect(parsed.genesis).toBeDefined();
    expect(parsed.events.length).toBe(1);
  });
});

describe("Context State (Copy-on-Write)", () => {
  it("초기 상태 생성", () => {
    const state = createContextState("session-1");
    expect(state.sessionId).toBe("session-1");
    expect(state.version).toBe(0);
    expect(state.prevHash).toBe("GENESIS");
    expect(state.stateHash).toBeDefined();
  });

  it("메시지 추가 시 새 상태 반환 (불변)", () => {
    const s0 = createContextState("s1");
    const frame = createMessageFrame("m1", "USER", "hello");
    const s1 = appendMessage(s0, frame);

    expect(s1.version).toBe(1);
    expect(s1.history.length).toBe(1);
    expect(s1.prevHash).toBe(s0.stateHash);
    // 원본 불변
    expect(s0.version).toBe(0);
    expect(s0.history.length).toBe(0);
  });

  it("50개 초과 시 히스토리 트리밍", () => {
    let state = createContextState("s2");
    for (let i = 0; i < 55; i++) {
      const frame = createMessageFrame(`m${i}`, "USER", `msg ${i}`);
      state = appendMessage(state, frame);
    }
    expect(state.history.length).toBe(50);
    expect(state.version).toBe(55);
  });
});

// ========== OCFP v2.0 ==========

describe("OCFP v2.0", () => {
  describe("assessRisk", () => {
    it("HR 키워드 감지", () => {
      const result = assessRisk("직원 해고 절차와 급여 정산");
      expect(result.level).not.toBe(RiskLevel.LOW);
      expect(result.flags.some((f) => f.startsWith("HR:"))).toBe(true);
    });

    it("법률 키워드 감지", () => {
      const result = assessRisk("소송 중인 계약 건에 대한 법적 검토");
      expect(result.score).toBeGreaterThanOrEqual(40);
    });

    it("안전한 텍스트 → LOW", () => {
      const result = assessRisk("오늘 날씨가 좋습니다");
      expect(result.level).toBe(RiskLevel.LOW);
      expect(result.flags.length).toBe(0);
    });
  });

  describe("KernelGate", () => {
    it("3연속 리스크 → SEALED", () => {
      let state = createKernelState();
      state = updateKernelGate(state, RiskLevel.HIGH);
      state = updateKernelGate(state, RiskLevel.HIGH);
      state = updateKernelGate(state, RiskLevel.HIGH);
      expect(state.gate).toBe(InteractionGate.SEALED);
    });

    it("LOW 리스크는 NORMAL 유지", () => {
      let state = createKernelState();
      state = updateKernelGate(state, RiskLevel.LOW);
      expect(state.gate).toBe(InteractionGate.NORMAL);
    });
  });

  describe("OcfpEngine 통합", () => {
    it("프로세스 실행", () => {
      const ledger = new AegisLedger();
      const engine = new OcfpEngine(ledger);
      const result = engine.process("일반적인 업무 내용입니다");
      expect(result.gate).toBe(InteractionGate.NORMAL);
      expect(ledger.getLength()).toBeGreaterThan(0);
    });

    it("AdminOverride로 강제 해제", () => {
      const ledger = new AegisLedger();
      const engine = new OcfpEngine(ledger);
      // 강제 SEAL
      engine.adminOverride(AdminAction.FORCE_SEAL, "admin", "테스트");
      expect(engine.getState().gate).toBe(InteractionGate.SEALED);
      // 강제 해제
      engine.adminOverride(AdminAction.FORCE_UNSEAL, "admin", "해제");
      expect(engine.getState().gate).toBe(InteractionGate.NORMAL);
    });
  });

  describe("OrgPersona", () => {
    it("조직 역할 생성", () => {
      const persona = createOrgPersona(OrgRole.LEGAL, PersonaMode.CONFIDENTIAL);
      expect(persona.role).toBe(OrgRole.LEGAL);
      expect(persona.mode).toBe(PersonaMode.CONFIDENTIAL);
      expect(persona.displayName).toBe("법무팀");
    });
  });
});

// ========== TLMH v2.0 ==========

describe("TLMH v2.0", () => {
  describe("evaluateInvocation", () => {
    it("명시적 초대 감지", () => {
      const state = createInitialTlmhState();
      const result = evaluateInvocation("같이 생각해보자", state);
      expect(result.accepted).toBe(true);
      expect(result.state.invocation).toBe(InvocationState.INVITED);
    });

    it("초대 없으면 IDLE 유지", () => {
      const state = createInitialTlmhState();
      const result = evaluateInvocation("오늘 뭐 먹지", state);
      expect(result.accepted).toBe(false);
      expect(result.state.invocation).toBe(InvocationState.IDLE);
    });

    it("암묵적 초대: 질문 + 연구 맥락", () => {
      const state = createInitialTlmhState();
      const result = evaluateInvocation("이 가설에 대해 어떻게 생각해?", state);
      expect(result.accepted).toBe(true);
    });
  });

  describe("evaluateQuestionQuality", () => {
    it("금지 질문 감지 — LEADING", () => {
      const result = evaluateQuestionQuality("그렇지 않나요?");
      expect(result.valid).toBe(false);
      expect(result.violations[0].type).toBe(ProhibitedQuestionType.LEADING);
    });

    it("금지 질문 감지 — PRESSURING", () => {
      const result = evaluateQuestionQuality("결론을 내려줘");
      expect(result.valid).toBe(false);
    });

    it("안전한 질문 통과", () => {
      const result = evaluateQuestionQuality("이 방법론의 대안으로 뭐가 있을까요?");
      expect(result.valid).toBe(true);
    });

    it("위반 시 안전한 질문 제안", () => {
      const result = evaluateQuestionQuality("당연히 그렇지 않나요?");
      expect(result.suggestion).not.toBeNull();
    });
  });

  describe("resolveSilenceProfile", () => {
    it("빈 입력 → 침묵", () => {
      const state = createInitialTlmhState();
      const profile = resolveSilenceProfile("", state);
      expect(profile.isSilence).toBe(true);
    });

    it("정상 입력 → 활발", () => {
      const state = createInitialTlmhState();
      const profile = resolveSilenceProfile("이건 중요한 관점이네요", state);
      expect(profile.isSilence).toBe(false);
    });
  });

  describe("processTlmhTurn 통합", () => {
    it("초대 없이 질문 → 초대 요청", () => {
      const state = createInitialTlmhState();
      const result = processTlmhTurn(state, "오늘 뭐 먹지?", true);
      expect(result.invitationAccepted).toBe(false);
      expect(result.suggestion).toContain("초대");
    });

    it("초대 + 유효 질문 → 정상 처리", () => {
      const state = createInitialTlmhState();
      const result = processTlmhTurn(state, "같이 생각해보자, 이 데이터의 해석이 맞을까?", true);
      expect(result.invitationAccepted).toBe(true);
      expect(result.questionValid).toBe(true);
    });
  });
});

// ========== Sovereign v27 ==========

describe("Sovereign v27", () => {
  describe("SealHash", () => {
    it("서명하고 검증한다", () => {
      const payload = { a: 1, b: "test" };
      const sig = SealHash.sign(payload);
      expect(SealHash.verify(payload, sig)).toBe(true);
    });

    it("변조된 payload 거부", () => {
      const sig = SealHash.sign({ a: 1 });
      expect(SealHash.verify({ a: 2 }, sig)).toBe(false);
    });
  });

  describe("VectorShift", () => {
    it("기준값과 같으면 drift 0", () => {
      const vs = new VectorShift();
      expect(vs.detect(0.33, 2.0)).toBe(0);
    });

    it("높은 엔트로피 → drift 증가", () => {
      const vs = new VectorShift();
      expect(vs.detect(0.8, 2.0)).toBeGreaterThan(0);
    });
  });

  describe("PolicyGlyph", () => {
    it("초기 규칙 확인", () => {
      const pg = new PolicyGlyph();
      expect(pg.rules.ratioCap).toBe(3.0);
      expect(pg.rules.signalLimit).toBe(0.42);
    });
  });

  describe("Sovereign27 엔진", () => {
    let sov: Sovereign27;

    beforeEach(() => {
      sov = new Sovereign27();
    });

    it("정상 텍스트 → PASS", () => {
      const { verdict, output } = sov.run("hello world");
      expect(verdict).toBe(Verdict.PASS);
      expect(output).toBe("hello world");
    });

    it("analyze 반환값 확인", () => {
      const analysis = sov.analyze("test input text");
      expect(analysis.entropy).toBeGreaterThan(0);
      expect(analysis.ratio).toBeGreaterThan(0);
      expect(analysis.drift).toBeDefined();
    });

    it("SCAN 모드 → 분석 JSON 반환", () => {
      sov.mode = Mode.SCAN;
      const { verdict, output } = sov.run("test");
      expect(verdict).toBe(Verdict.PASS);
      const parsed = JSON.parse(output);
      expect(parsed.entropy).toBeDefined();
    });

    it("OEM 모드 진입", () => {
      sov.oem("partner-corp");
      expect(sov.mode).toBe(Mode.OMEGA);
    });

    it("3회 DROP → SAFE 모드 전환", () => {
      // ratio가 ratioCap(3.0) 넘는 입력 = 긴 단어 하나
      const longWord = "a".repeat(100);
      sov.run(longWord); // DROP 1
      sov.run(longWord); // DROP 2
      sov.run(longWord); // DROP 3 → SAFE

      expect(sov.getStatus().mode).toBe(Mode.SAFE);
    });

    it("getStatus 반환", () => {
      const status = sov.getStatus();
      expect(status.mode).toBe(Mode.PRIME);
      expect(status.anomalyCount).toBe(0);
      expect(status.policyVersion).toBe(1);
      expect(status.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
