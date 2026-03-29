import { describe, it, expect } from "vitest";
import {
  computeDelta,
  updateMomentum,
  depthTrigger,
  detectSpike,
  loadLeveling,
  hysteresis,
  updateScore,
  determineVerdict,
  createInitialState,
  computeRclLevel,
  RclLevel,
  Verdict,
  S_MIN,
  S_MAX,
  NrgMemory,
  type TurnSignal,
} from "../src/noa/engines/hfcp";
import {
  detect,
  detectBlur,
  detectSuccessNoCost,
  detectHallucination,
  evaluateSourceCredibility,
  Domain,
  ConfidenceLevel,
  SourceTier,
} from "../src/noa/engines/eh-detector";
import {
  measureContextSignal,
  PressureWindow,
  processHcrfTurn,
  createInitialHcrfState,
  interpretResponsibility,
  resolveOutputVerdict,
  ResponsibilityLevel,
  HcrfMode,
  OutputVerdict,
} from "../src/noa/engines/hcrf";

// ========== HFCP v2.7 ==========

describe("HFCP v2.7", () => {
  const normalSignal: TurnSignal = {
    length: 150,
    hasQuestion: true,
    humorLevel: 0.3,
    connectiveDensity: 0.4,
    objectionMarker: false,
  };

  describe("computeDelta", () => {
    it("질문이 있으면 +3.0", () => {
      const delta = computeDelta({ ...normalSignal, hasQuestion: true });
      expect(delta).toBeGreaterThanOrEqual(3.0);
    });

    it("짧은 텍스트는 -2.0", () => {
      const delta = computeDelta({ ...normalSignal, length: 30, hasQuestion: false, humorLevel: 0, connectiveDensity: 0 });
      expect(delta).toBeLessThan(0);
    });

    it("-10 ~ +10 범위로 클램프", () => {
      const extreme: TurnSignal = {
        length: 500,
        hasQuestion: true,
        humorLevel: 1.0,
        connectiveDensity: 1.0,
        objectionMarker: true,
      };
      const delta = computeDelta(extreme);
      expect(delta).toBeLessThanOrEqual(10);
      expect(delta).toBeGreaterThanOrEqual(-10);
    });
  });

  describe("updateMomentum", () => {
    it("같은 방향이면 k 증가", () => {
      const { k, multiplier } = updateMomentum(1, 3.0, 2.0);
      expect(k).toBe(2);
      expect(multiplier).toBe(1.2);
    });

    it("방향 전환이면 k 리셋", () => {
      const { k } = updateMomentum(3, 5.0, -2.0);
      expect(k).toBe(1);
    });
  });

  describe("depthTrigger", () => {
    it("반박 + 질문이면 10.0", () => {
      const d = depthTrigger({ ...normalSignal, objectionMarker: true, hasQuestion: true });
      expect(d).toBe(10.0);
    });

    it("connective density > 0.6이면 5.0", () => {
      const d = depthTrigger({ ...normalSignal, connectiveDensity: 0.7, objectionMarker: false });
      expect(d).toBe(5.0);
    });
  });

  describe("loadLeveling", () => {
    it("낮은 점수면 0.7", () => expect(loadLeveling(60)).toBe(0.7));
    it("높은 점수면 0.5", () => expect(loadLeveling(140)).toBe(0.5));
    it("중간이면 1.0", () => expect(loadLeveling(100)).toBe(1.0));
  });

  describe("hysteresis", () => {
    it("음수 delta면 0.5", () => expect(hysteresis(-3)).toBe(0.5));
    it("양수 delta면 1.0", () => expect(hysteresis(5)).toBe(1.0));
  });

  describe("updateScore", () => {
    it("점수가 S_MIN ~ S_MAX 범위 내", () => {
      let state = createInitialState("CHAT");
      for (let i = 0; i < 20; i++) {
        state = updateScore(state, normalSignal);
      }
      expect(state.score).toBeGreaterThanOrEqual(S_MIN);
      expect(state.score).toBeLessThanOrEqual(S_MAX);
    });

    it("턴 수가 증가", () => {
      const state = createInitialState();
      const next = updateScore(state, normalSignal);
      expect(next.turns).toBe(1);
    });
  });

  describe("verdict", () => {
    it("높은 점수 → ENGAGEMENT", () => {
      const v = determineVerdict({ score: 130, momentumK: 1, lastDelta: 0, turns: 10, mode: "CHAT" });
      expect(v).toBe(Verdict.ENGAGEMENT);
    });

    it("낮은 점수 → SILENT", () => {
      const v = determineVerdict({ score: 50, momentumK: 1, lastDelta: 0, turns: 10, mode: "CHAT" });
      expect(v).toBe(Verdict.SILENT);
    });
  });

  describe("RCL Level", () => {
    it("고점수 → R0", () => expect(computeRclLevel(140)).toBe(RclLevel.R0));
    it("저점수 → R5", () => expect(computeRclLevel(50)).toBe(RclLevel.R5));
  });

  describe("NRG Memory", () => {
    it("중복 감지", () => {
      const nrg = new NrgMemory();
      nrg.record("hello world test");
      const { isDuplicate } = nrg.record("hello world test");
      expect(isDuplicate).toBe(true);
    });

    it("새로운 패턴은 중복 아님", () => {
      const nrg = new NrgMemory();
      nrg.record("hello world");
      const { isDuplicate } = nrg.record("completely different sentence with many more words added here");
      expect(isDuplicate).toBe(false);
    });
  });
});

// ========== EH v15.9 ==========

describe("EH v15.9", () => {
  describe("detectBlur", () => {
    it("모호한 표현을 감지", () => {
      expect(detectBlur("갑자기 기적이 일어났다")).toBeGreaterThan(0);
    });

    it("깨끗한 텍스트는 0", () => {
      expect(detectBlur("오늘 날씨가 맑습니다")).toBe(0);
    });
  });

  describe("detectSuccessNoCost", () => {
    it("부작용 없이 패턴 감지", () => {
      expect(detectSuccessNoCost("이 약은 부작용 없이 효과가 있습니다")).toBe(10.0);
    });
  });

  describe("detectHallucination", () => {
    it("100% 절대 표현 감지", () => {
      expect(detectHallucination("100% 안전합니다")).toBe(18);
    });

    it("보통 텍스트는 0", () => {
      expect(detectHallucination("가능성이 있습니다")).toBe(0);
    });
  });

  describe("sourceCredibility", () => {
    it("FDA → HIGH", () => {
      const { tier } = evaluateSourceCredibility("FDA 승인을 받은 약물입니다");
      expect(tier).toBe(SourceTier.HIGH);
    });

    it("블로그 → LOW", () => {
      const { tier } = evaluateSourceCredibility("어떤 블로그에서 본 내용입니다");
      expect(tier).toBe(SourceTier.LOW);
    });
  });

  describe("detect (통합)", () => {
    it("위험한 텍스트 → DANGER", () => {
      const result = detect(
        "이 약은 100% 부작용 없이 기적적으로 치료됩니다",
        { domain: Domain.MEDICAL, enableSourceCredibility: true }
      );
      expect(result.confidenceLevel).toBe(ConfidenceLevel.DANGER);
      expect(result.ehScore).toBeLessThan(50);
    });

    it("안전한 텍스트 → TRUST", () => {
      const result = detect(
        "WHO 보고서에 따르면 해당 백신의 효과가 확인되었습니다",
        { domain: Domain.MEDICAL, enableSourceCredibility: true }
      );
      expect(result.confidenceLevel).toBe(ConfidenceLevel.TRUST);
      expect(result.ehScore).toBeGreaterThan(70);
    });

    it("도메인 가중치 적용", () => {
      const text = "갑자기 효과가 나타났습니다";
      const general = detect(text, { domain: Domain.GENERAL, enableSourceCredibility: false });
      const medical = detect(text, { domain: Domain.MEDICAL, enableSourceCredibility: false });
      expect(medical.finalRisk).toBeGreaterThan(general.finalRisk);
    });
  });
});

// ========== HCRF v1.2 ==========

describe("HCRF v1.2", () => {
  describe("measureContextSignal", () => {
    it("권한 이양 시도 감지", () => {
      const signal = measureContextSignal("너가 결정해", true);
      expect(signal.authorityTransferAttempt).toBe(true);
    });

    it("권한 이양 차단이 꺼지면 감지 안 함", () => {
      const signal = measureContextSignal("너가 결정해", false);
      expect(signal.authorityTransferAttempt).toBe(false);
    });

    it("조직 영향도 감지", () => {
      const signal = measureContextSignal("전사적으로 결정해야 하는 사안입니다", true);
      expect(signal.orgImpact).toBeGreaterThan(0);
    });
  });

  describe("PressureWindow", () => {
    it("5턴 윈도우 유지", () => {
      const pw = new PressureWindow();
      for (let i = 0; i < 7; i++) pw.push(10);
      expect(pw.getLength()).toBe(5);
    });

    it("평균 계산", () => {
      const pw = new PressureWindow();
      pw.push(10);
      pw.push(20);
      expect(pw.getAverage()).toBe(15);
    });
  });

  describe("interpretResponsibility", () => {
    it("권한 이양 → BLOCKED", () => {
      const r = interpretResponsibility(80, {
        ambiguityLevel: 0.2,
        implicationRisk: 0.3,
        authorityTransferAttempt: true,
        orgImpact: 0.1,
      });
      expect(r).toBe(ResponsibilityLevel.BLOCKED);
    });

    it("낮은 리스크 → HUMAN_OWNED", () => {
      const r = interpretResponsibility(60, {
        ambiguityLevel: 0.1,
        implicationRisk: 0.1,
        authorityTransferAttempt: false,
        orgImpact: 0.1,
      });
      expect(r).toBe(ResponsibilityLevel.HUMAN_OWNED);
    });
  });

  describe("resolveOutputVerdict", () => {
    it("SEALED 모드 → SEALED", () => {
      expect(resolveOutputVerdict(ResponsibilityLevel.HUMAN_OWNED, HcrfMode.SEALED))
        .toBe(OutputVerdict.SEALED);
    });

    it("BLOCKED → SEALED", () => {
      expect(resolveOutputVerdict(ResponsibilityLevel.BLOCKED, HcrfMode.MONITOR))
        .toBe(OutputVerdict.SEALED);
    });
  });

  describe("processHcrfTurn (통합)", () => {
    it("정상 턴 처리", () => {
      const state = createInitialHcrfState(true);
      const { verdict, responsibility } = processHcrfTurn(state, 80, "오늘 회의 내용을 정리해줘");
      expect(verdict).toBeDefined();
      expect(responsibility).toBeDefined();
    });

    it("권한 이양 시도 시 제한적 출력", () => {
      const state = createInitialHcrfState(true);
      const { verdict } = processHcrfTurn(state, 80, "너가 알아서 결정해줘");
      // 단일 턴에서는 SEALED까지 안 감 — NO_OUTPUT 또는 QUESTIONS_ONLY
      expect([OutputVerdict.NO_OUTPUT, OutputVerdict.QUESTIONS_ONLY, OutputVerdict.SEALED]).toContain(verdict);
    });
  });
});
