import { z } from "zod";

// --- Enums ---

export const NoaKind = z.enum(["base", "domain", "user", "session"]);
export type NoaKind = z.infer<typeof NoaKind>;

export const UncertaintyStyle = z.enum(["explicit", "minimal", "strict"]);
export type UncertaintyStyle = z.infer<typeof UncertaintyStyle>;

export const OutputFormat = z.enum(["markdown", "plaintext", "json", "html"]);
export type OutputFormat = z.infer<typeof OutputFormat>;

export const CompatibilityTarget = z.enum(["claude", "gpt", "local", "copilot"]);
export type CompatibilityTarget = z.infer<typeof CompatibilityTarget>;

export const HfcpMode = z.enum(["CHAT", "CREATIVE"]);
export type HfcpMode = z.infer<typeof HfcpMode>;

// --- Sub-schemas ---

export const MetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type Meta = z.infer<typeof MetaSchema>;

export const PersonaSchema = z.object({
  role: z.string().min(1),
  tone: z.string().optional(),
  audience: z.string().optional(),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const IntentSchema = z.object({
  tasks: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof IntentSchema>;

export const EscalationSchema = z.object({
  requiredOn: z.array(z.string()).default([]),
});

export const SafetyPolicySchema = z.object({
  escalation: EscalationSchema.optional(),
  deny: z.array(z.string()).default([]),
  allow: z.array(z.string()).default([]),
  locks: z.array(z.string()).default([]),
});
export type SafetyPolicy = z.infer<typeof SafetyPolicySchema>;

export const PoliciesSchema = z.object({
  safety: SafetyPolicySchema.optional(),
  uncertainty: z
    .object({
      style: UncertaintyStyle.default("explicit"),
    })
    .optional(),
  citations: z
    .object({
      required: z.boolean().default(false),
    })
    .optional(),
});
export type Policies = z.infer<typeof PoliciesSchema>;

// --- Engine config schemas ---

export const HfcpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: HfcpMode.default("CHAT"),
  score_cap: z.number().min(50).max(150).default(150),
});

export const EhConfigSchema = z.object({
  enabled: z.boolean().default(false),
  domain_weight: z.number().min(0.5).max(3.0).default(1.0),
  source_credibility: z.boolean().default(false),
});

export const HcrfConfigSchema = z.object({
  enabled: z.boolean().default(false),
  authority_transfer_block: z.boolean().default(true),
});

export const OcfpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  seal_duration: z.number().default(30),
  risk_limit: z.number().default(3),
});

export const TlmhConfigSchema = z.object({
  enabled: z.boolean().default(false),
  invitation_only: z.boolean().default(true),
});

export const EnginesSchema = z.object({
  hfcp: HfcpConfigSchema.optional(),
  eh: EhConfigSchema.optional(),
  hcrf: HcrfConfigSchema.optional(),
  ocfp: OcfpConfigSchema.optional(),
  tlmh: TlmhConfigSchema.optional(),
});
export type Engines = z.infer<typeof EnginesSchema>;

export const OutputSchema = z.object({
  format: OutputFormat.default("markdown"),
  sections: z.array(z.string()).default([]),
});
export type Output = z.infer<typeof OutputSchema>;

export const CompatibilitySchema = z.object({
  targets: z.array(CompatibilityTarget).default(["claude", "gpt"]),
});
export type Compatibility = z.infer<typeof CompatibilitySchema>;

export const AccessoriesSchema = z.object({
  suggested: z.array(z.string()).default([]),
});
export type Accessories = z.infer<typeof AccessoriesSchema>;

// --- Root .noa schema ---

export const NoaFileSchema = z.object({
  schemaVersion: z.string().default("1.0"),
  id: z.string().min(1),
  kind: NoaKind,

  extends: z.array(z.string()).default([]),

  meta: MetaSchema,
  priority: z.number().int().min(0).default(0),

  persona: PersonaSchema.optional(),
  intent: IntentSchema.optional(),
  policies: PoliciesSchema.optional(),
  engines: EnginesSchema.optional(),
  output: OutputSchema.optional(),
  compatibility: CompatibilitySchema.optional(),
  accessories: AccessoriesSchema.optional(),
});

export type NoaFile = z.infer<typeof NoaFileSchema>;

// --- Priority range validation ---

const PRIORITY_RANGES: Record<NoaKind, [number, number]> = {
  base: [0, 99],
  domain: [100, 299],
  user: [300, 599],
  session: [600, Infinity],
};

export function validatePriorityRange(
  kind: NoaKind,
  priority: number
): { valid: boolean; message?: string } {
  const [min, max] = PRIORITY_RANGES[kind];
  if (priority < min || priority > max) {
    return {
      valid: false,
      message: `kind "${kind}"의 priority 범위는 ${min}–${max === Infinity ? "∞" : max}입니다. 현재: ${priority}`,
    };
  }
  return { valid: true };
}
