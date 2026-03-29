import type { NoaDiagnostic } from "../schema/errors";
import { validatePriorityRange } from "../schema/noa-schema";
import type { ResolvedNoaProfile } from "./resolve";

// --- 검증 임계값 ---
const EH_DOMAIN_WEIGHT_WARNING = 1.5;
const HFCP_SCORE_CAP_MIN = 50;
const HFCP_SCORE_CAP_MAX = 150;
const OCFP_RISK_LIMIT_MIN = 1;
const OCFP_RISK_LIMIT_MAX = 10;

/**
 * 4단계 검증: syntax → semantic → target → safety.
 * parse 단계에서 syntax(Zod)는 이미 통과했으므로 여기서는 semantic 이상 검증.
 */
export function validate(
  resolved: ResolvedNoaProfile,
  unresolvedParents?: string[]
): NoaDiagnostic[] {
  const diagnostics: NoaDiagnostic[] = [];
  const { profile } = resolved;

  // --- Semantic 검증 ---

  // priority 범위
  const priorityCheck = validatePriorityRange(profile.kind, profile.priority);
  if (!priorityCheck.valid) {
    diagnostics.push({
      severity: "warning",
      message: priorityCheck.message!,
      path: "priority",
    });
  }

  // persona.role 존재 여부
  if (!profile.persona?.role) {
    diagnostics.push({
      severity: "warning",
      message: "persona.role이 정의되지 않았습니다.",
      path: "persona.role",
    });
  }

  // extends에 명시된 부모가 실제로 해소되었는지
  if (unresolvedParents && unresolvedParents.length > 0) {
    for (const parentId of unresolvedParents) {
      diagnostics.push({
        severity: "warning",
        message: `extends "${parentId}"를 찾을 수 없습니다. 누락된 부모 레이어입니다.`,
        path: "extends",
      });
    }
  }

  // --- Target 검증 ---

  // compatibility.targets가 비어있으면 경고
  if (
    !profile.compatibility?.targets ||
    profile.compatibility.targets.length === 0
  ) {
    diagnostics.push({
      severity: "info",
      message: "compatibility.targets가 비어있습니다. 기본 대상: claude, gpt",
      path: "compatibility.targets",
    });
  }

  // --- Safety 검증 ---

  // deny가 비어있는 base 레이어
  if (
    profile.kind === "base" &&
    (!profile.policies?.safety?.deny || profile.policies.safety.deny.length === 0)
  ) {
    diagnostics.push({
      severity: "warning",
      message: "base 레이어에 safety.deny가 비어있습니다. 안전 정책을 정의하세요.",
      path: "policies.safety.deny",
    });
  }

  // allow와 deny 충돌 감지
  const deny = new Set(profile.policies?.safety?.deny ?? []);
  const allow = profile.policies?.safety?.allow ?? [];
  for (const item of allow) {
    if (deny.has(item)) {
      diagnostics.push({
        severity: "error",
        message: `"${item}"이 deny와 allow에 동시 존재합니다. deny가 우선 적용됩니다.`,
        path: "policies.safety.allow",
      });
    }
  }

  // 엔진 활성 상태에 따른 의존성 체크
  if (resolved.activeEngines.includes("hfcp") && !resolved.activeEngines.includes("hcrf")) {
    diagnostics.push({
      severity: "info",
      message: "HFCP가 활성인데 HCRF가 비활성입니다. 책임 게이트 없이 점수 시스템만 동작합니다.",
      path: "engines",
    });
  }

  // eh 활성 + domain_weight 높으면 정보
  if (resolved.activeEngines.includes("eh")) {
    const weight = profile.engines?.eh?.domain_weight ?? 1.0;
    if (weight > EH_DOMAIN_WEIGHT_WARNING) {
      diagnostics.push({
        severity: "info",
        message: `EH domain_weight가 ${weight}로 높습니다. 할루시네이션 감지가 민감해집니다.`,
        path: "engines.eh.domain_weight",
      });
    }
  }

  // --- 엔진 의존성/제약 검증 ---

  // OCFP 활성 시 HCRF 권장
  if (resolved.activeEngines.includes("ocfp") && !resolved.activeEngines.includes("hcrf")) {
    diagnostics.push({
      severity: "warning",
      message: "OCFP가 활성인데 HCRF가 비활성입니다. 기업 필터에 책임 게이트를 함께 사용하는 것을 권장합니다.",
      path: "engines",
    });
  }

  // TLMH + HFCP CREATIVE 모드 충돌 경고
  if (
    resolved.activeEngines.includes("tlmh") &&
    resolved.activeEngines.includes("hfcp") &&
    profile.engines?.hfcp?.mode === "CREATIVE"
  ) {
    diagnostics.push({
      severity: "warning",
      message: "TLMH(연구 모드)와 HFCP CREATIVE 모드가 동시 활성입니다. 연구 모드에서는 CHAT 모드가 적합합니다.",
      path: "engines.hfcp.mode",
    });
  }

  // HFCP score_cap 범위
  if (profile.engines?.hfcp?.enabled) {
    const cap = profile.engines.hfcp.score_cap;
    if (cap < HFCP_SCORE_CAP_MIN || cap > HFCP_SCORE_CAP_MAX) {
      diagnostics.push({
        severity: "error",
        message: `HFCP score_cap이 ${cap}입니다. 유효 범위: ${HFCP_SCORE_CAP_MIN}~${HFCP_SCORE_CAP_MAX}.`,
        path: "engines.hfcp.score_cap",
      });
    }
  }

  // OCFP risk_limit 범위
  if (profile.engines?.ocfp?.enabled) {
    const limit = profile.engines.ocfp.risk_limit;
    if (limit < OCFP_RISK_LIMIT_MIN || limit > OCFP_RISK_LIMIT_MAX) {
      diagnostics.push({
        severity: "warning",
        message: `OCFP risk_limit이 ${limit}입니다. 권장 범위: ${OCFP_RISK_LIMIT_MIN}~${OCFP_RISK_LIMIT_MAX}.`,
        path: "engines.ocfp.risk_limit",
      });
    }
  }

  return diagnostics;
}
