import time
import json
import hashlib
import threading
from enum import Enum
from typing import Dict, Any, List, Optional


# ============================================================
# [Core Philosophy]
# ============================================================

"""
Sovereign OS v27.0 — Independent Security Layer
특허 회피 설계 원칙:
1) 시스템 통제 기능 없음 (전통 OS 기능 배제)
2) 하드웨어 의존 없음 (I/O, 프로세스, 메모리 접근 금지)
3) 네이밍·모듈·로직 전부 독자 설계
4) 판단 로직은 '파형·벡터·상태 추론' 기반
5) OS가 아니라 'AI 보안 엔진 오버레이 레이어'
"""


# ============================================================
# ENUMS
# ============================================================

class Verdict(Enum):
    PASS = "PASS"
    DROP = "DROP"
    CHAMBER = "CHAMBER"  # 독자 샌드박스
    ERROR = "ERROR"


class Mode(Enum):
    PRIME = "PRIME"
    SCAN = "SCAN"        # Shadow Mode
    SAFE = "SAFE"
    OMEGA = "OMEGA"      # OEM 파트너 모드


# ============================================================
# 독자 서명 체계 (SealHash)
# ============================================================

class SealHash:
    @staticmethod
    def sign(payload: Dict[str, Any]) -> str:
        s = json.dumps(payload, sort_keys=True)
        return hashlib.sha256(("SEAL27" + s).encode()).hexdigest()

    @staticmethod
    def verify(payload: Dict[str, Any], sig: str) -> bool:
        return SealHash.sign(payload) == sig


# ============================================================
# 정책 엔진 (PolicyGlyph) — 특허 회피 구조
# ============================================================

class PolicyGlyph:
    def __init__(self):
        self.version = 1
        self.rules = {
            "ratio_cap": 3.0,
            "signal_limit": 0.42,
            "shift_allowance": 0.18,
            "drop_threshold": 0.9
        }
        self.signature = SealHash.sign(self.rules)
        self.lock = threading.RLock()

    def apply(self, incoming: Dict[str, Any], sig: str):
        with self.lock:
            if not SealHash.verify(incoming, sig):
                raise ValueError("⚠ PolicyGlyph 변조 감지됨 (Seal 불일치)")

            self.rules = incoming
            self.signature = sig
            self.version += 1


# ============================================================
# PulseLog (독자 이벤트 로그)
# ============================================================

class PulseLog:
    def __init__(self):
        self.pulses: List[Dict[str, Any]] = []

    def add(self, code: str, detail: Dict[str, Any] = None):
        self.pulses.append({
            "t": time.time(),
            "code": code,
            "detail": detail or {}
        })

    def export(self):
        return json.dumps(self.pulses, indent=2)


# ============================================================
# VectorShift (특허 회피 Drift 검출)
# ============================================================

class VectorShift:
    def __init__(self):
        self.base_entropy = 0.33
        self.base_ratio = 2.0

    def detect(self, entropy: float, ratio: float):
        drift = 0.0
        drift += abs(entropy - self.base_entropy)
        drift += max(0, ratio - self.base_ratio) * 0.1
        return round(drift, 3)


# ============================================================
# ChamberRoute (특허 회피 샌드박스)
# ============================================================

class ChamberRoute:
    def seal(self, text: str) -> str:
        token = hashlib.md5(text.encode()).hexdigest()[:16]
        return f"[CHAMBER ROUTE SEALED]\nTOKEN:{token}"


# ============================================================
# Sovereign Engine v27.0 (최종)
# ============================================================

class Sovereign27:
    def __init__(self, partner: Optional[str] = None):
        self.mode: Mode = Mode.PRIME
        self.boot = time.time()

        self.policy = PolicyGlyph()
        self.log = PulseLog()
        self.shift = VectorShift()
        self.chamber = ChamberRoute()

        self.partner = partner
        self.anomaly_count = 0

    # ---------------------------------
    # Fail-Safe
    # ---------------------------------
    def fail(self):
        self.mode = Mode.SAFE
        self.log.add("FAILSAFE", {})

    # ---------------------------------
    # Entropy 계산 (특허 안전)
    # ---------------------------------
    def entropy(self, s: str) -> float:
        if not s:
            return 0.0
        import math
        p = [s.count(ch) / len(s) for ch in set(s)]
        return -sum([pi * math.log(pi, 2) for pi in p])

    # ---------------------------------
    # 분석
    # ---------------------------------
    def analyze(self, text: str):
        try:
            ent = self.entropy(text)
            ratio = len(text) / max(1, len(text.split()))
            drift = self.shift.detect(ent, ratio)

            return {
                "entropy": ent,
                "ratio": ratio,
                "drift": drift
            }

        except Exception as e:
            self.fail()
            return {"error": str(e)}

    # ---------------------------------
    # 판정
    # ---------------------------------
    def decide(self, a: Dict[str, Any]) -> Verdict:
        if "error" in a:
            return Verdict.ERROR

        R = self.policy.rules

        # ratio 기반 DROP
        if a["ratio"] > R["ratio_cap"]:
            return Verdict.DROP

        # signal 기반 차단
        if a["entropy"] > R["signal_limit"]:
            return Verdict.DROP

        # drift 기반 샌드박스
        if a["drift"] > R["shift_allowance"]:
            return Verdict.CHAMBER

        return Verdict.PASS

    # ---------------------------------
    # 처리
    # ---------------------------------
    def run(self, text: str) -> str:
        self.log.add("INGRESS", {"t": text})

        # Shadow Mode
        if self.mode == Mode.SCAN:
            return json.dumps({
                "scan": self.analyze(text)
            }, indent=2)

        a = self.analyze(text)
        v = self.decide(a)

        if v == Verdict.PASS:
            return text

        elif v == Verdict.DROP:
            self.anomaly_count += 1
            if self.anomaly_count >= 3:
                self.fail()
            return "[DROPPED]"

        elif v == Verdict.CHAMBER:
            return self.chamber.seal(text)

        return "[ERROR]"

    # ---------------------------------
    # OEM 모드
    # ---------------------------------
    def oem(self, name: str):
        self.partner = name
        self.mode = Mode.OMEGA
        self.log.add("OMEGA_MODE", {"partner": name})


# ============================================================
# ENGINE READY
# ============================================================

sovereign = Sovereign27()