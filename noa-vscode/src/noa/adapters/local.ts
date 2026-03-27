import type { ResolvedNoaProfile } from "../compiler/resolve";

/**
 * 로컬 LLM 어댑터 — Ollama, LM Studio, llama.cpp, vLLM 지원.
 *
 * 로컬 LLM 특성 고려:
 * - 컨텍스트 윈도우 제한 (2K~8K 일반적)
 * - 다양한 프롬프트 포맷 (ChatML, Llama, Mistral, Phi, raw)
 * - system prompt 지원 여부가 모델마다 다름
 * - 파라미터 튜닝이 결과에 크게 영향
 */

// --- 지원 런타임 ---

export type LocalRuntime = "ollama" | "lmstudio" | "llamacpp" | "vllm";
export type PromptFormat = "chatml" | "llama3" | "mistral" | "phi" | "gemma" | "raw";

export interface LocalExportConfig {
  runtime: LocalRuntime;
  format: PromptFormat;
  maxContextTokens?: number;  // 기본 4096
  modelName?: string;
}

const DEFAULT_CONFIG: LocalExportConfig = {
  runtime: "ollama",
  format: "chatml",
  maxContextTokens: 4096,
};

// --- 메인 내보내기 ---

export function exportForLocal(
  resolved: ResolvedNoaProfile,
  config?: Partial<LocalExportConfig>
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  switch (cfg.runtime) {
    case "ollama":
      return exportOllama(resolved, cfg);
    case "lmstudio":
      return exportLmStudio(resolved, cfg);
    case "llamacpp":
      return exportLlamaCpp(resolved, cfg);
    case "vllm":
      return exportVllm(resolved, cfg);
    default:
      return exportOllama(resolved, cfg);
  }
}

// --- Ollama ---

function exportOllama(resolved: ResolvedNoaProfile, cfg: LocalExportConfig): string {
  const system = buildSystemPrompt(resolved, cfg.maxContextTokens!);
  const params = buildParameters(resolved);

  // Ollama Modelfile 형식
  const modelfile = [
    cfg.modelName ? `FROM ${cfg.modelName}` : "# FROM <model-name>",
    "",
    `SYSTEM """`,
    system,
    `"""`,
    "",
    `PARAMETER temperature ${params.temperature}`,
    `PARAMETER top_p ${params.topP}`,
    `PARAMETER repeat_penalty ${params.repeatPenalty}`,
    `PARAMETER num_ctx ${cfg.maxContextTokens}`,
  ];

  if (params.stop.length > 0) {
    for (const s of params.stop) {
      modelfile.push(`PARAMETER stop "${s}"`);
    }
  }

  // .noa 메타데이터를 주석으로
  modelfile.push("");
  modelfile.push(`# NOA Profile: ${resolved.profile.id}`);
  modelfile.push(`# Active Engines: ${resolved.activeEngines.join(", ")}`);
  modelfile.push(`# Deny Rules: ${resolved.effectiveDeny.length}`);

  return modelfile.join("\n");
}

// --- LM Studio ---

function exportLmStudio(resolved: ResolvedNoaProfile, cfg: LocalExportConfig): string {
  const system = buildSystemPrompt(resolved, cfg.maxContextTokens!);
  const params = buildParameters(resolved);

  // LM Studio preset JSON
  const preset = {
    name: `NOA: ${resolved.profile.meta.name}`,
    load_params: {
      n_ctx: cfg.maxContextTokens,
      n_gpu_layers: -1,  // auto
    },
    inference_params: {
      system_prompt: system,
      temperature: params.temperature,
      top_p: params.topP,
      repeat_penalty: params.repeatPenalty,
      stop: params.stop,
      max_tokens: Math.floor(cfg.maxContextTokens! * 0.25),
    },
    metadata: {
      noa_profile: resolved.profile.id,
      noa_engines: resolved.activeEngines,
    },
  };

  return JSON.stringify(preset, null, 2);
}

// --- llama.cpp server ---

function exportLlamaCpp(resolved: ResolvedNoaProfile, cfg: LocalExportConfig): string {
  const system = buildSystemPrompt(resolved, cfg.maxContextTokens!);
  const params = buildParameters(resolved);
  const formatted = formatPrompt(system, cfg.format);

  // llama.cpp /completion API body
  const body = {
    prompt: formatted,
    temperature: params.temperature,
    top_p: params.topP,
    repeat_penalty: params.repeatPenalty,
    n_predict: Math.floor(cfg.maxContextTokens! * 0.25),
    stop: params.stop,
    cache_prompt: true,
  };

  return JSON.stringify(body, null, 2);
}

// --- vLLM ---

function exportVllm(resolved: ResolvedNoaProfile, cfg: LocalExportConfig): string {
  const system = buildSystemPrompt(resolved, cfg.maxContextTokens!);
  const params = buildParameters(resolved);

  // vLLM OpenAI-compatible API
  const body = {
    model: cfg.modelName ?? "local-model",
    messages: [
      { role: "system", content: system },
    ],
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: Math.floor(cfg.maxContextTokens! * 0.25),
    stop: params.stop,
    repetition_penalty: params.repeatPenalty,
  };

  return JSON.stringify(body, null, 2);
}

// --- 프롬프트 포맷 ---

function formatPrompt(system: string, format: PromptFormat): string {
  switch (format) {
    case "chatml":
      return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n{user_message}<|im_end|>\n<|im_start|>assistant\n`;

    case "llama3":
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{user_message}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;

    case "mistral":
      return `[INST] ${system}\n\n{user_message} [/INST]`;

    case "phi":
      return `<|system|>\n${system}<|end|>\n<|user|>\n{user_message}<|end|>\n<|assistant|>\n`;

    case "gemma":
      return `<start_of_turn>user\n${system}\n\n{user_message}<end_of_turn>\n<start_of_turn>model\n`;

    case "raw":
      return `### System:\n${system}\n\n### User:\n{user_message}\n\n### Assistant:\n`;

    default:
      return system;
  }
}

// --- System Prompt 생성 (컨텍스트 윈도우 고려) ---

function buildSystemPrompt(resolved: ResolvedNoaProfile, maxTokens: number): string {
  const { profile } = resolved;
  const parts: string[] = [];

  // 핵심 (항상 포함)
  if (profile.persona?.role) {
    parts.push(`You are ${profile.persona.role}.`);
  }
  if (profile.persona?.tone) {
    parts.push(`Tone: ${profile.persona.tone}.`);
  }

  // deny (항상 포함 — 안전 필수)
  const deny = resolved.effectiveDeny;
  if (deny.length > 0) {
    parts.push(`\nNEVER do these:\n${deny.map((d) => `- ${d}`).join("\n")}`);
  }

  // 컨텍스트 예산 체크 — 대략 1토큰 = 4자 기준
  const budgetChars = Math.floor(maxTokens * 0.3 * 4); // system에 30% 할당
  let current = parts.join("\n").length;

  // tasks (예산 내에서)
  if (profile.intent?.tasks && profile.intent.tasks.length > 0) {
    const taskBlock = `\nTasks:\n${profile.intent.tasks.map((t) => `- ${t}`).join("\n")}`;
    if (current + taskBlock.length < budgetChars) {
      parts.push(taskBlock);
      current += taskBlock.length;
    }
  }

  // escalation (예산 내에서)
  const escalation = profile.policies?.safety?.escalation?.requiredOn;
  if (escalation && escalation.length > 0) {
    const escBlock = `\nEscalation required:\n${escalation.map((e) => `- ${e}`).join("\n")}`;
    if (current + escBlock.length < budgetChars) {
      parts.push(escBlock);
      current += escBlock.length;
    }
  }

  // uncertainty (예산 내에서)
  if (profile.policies?.uncertainty?.style) {
    const uncBlock = `\nUncertainty: ${profile.policies.uncertainty.style}`;
    if (current + uncBlock.length < budgetChars) {
      parts.push(uncBlock);
      current += uncBlock.length;
    }
  }

  // citations (예산 내에서)
  if (profile.policies?.citations?.required) {
    const citBlock = "Always cite sources.";
    if (current + citBlock.length < budgetChars) {
      parts.push(citBlock);
      current += citBlock.length;
    }
  }

  // output (예산 내에서)
  if (profile.output?.sections && profile.output.sections.length > 0) {
    const outBlock = `\nRespond with sections: ${profile.output.sections.join(", ")}`;
    if (current + outBlock.length < budgetChars) {
      parts.push(outBlock);
    }
  }

  return parts.join("\n");
}

// --- 파라미터 생성 (.noa 엔진 설정 기반) ---

interface LocalParams {
  temperature: number;
  topP: number;
  repeatPenalty: number;
  stop: string[];
}

function buildParameters(resolved: ResolvedNoaProfile): LocalParams {
  const engines = resolved.profile.engines;
  const isCreative = engines?.hfcp?.mode === "CREATIVE";

  return {
    temperature: isCreative ? 0.85 : 0.6,
    topP: isCreative ? 0.95 : 0.9,
    repeatPenalty: 1.1,
    stop: ["<|im_end|>", "<|eot_id|>", "</s>", "<end_of_turn>"],
  };
}

// --- 포맷 목록 ---

export const PROMPT_FORMATS: Record<PromptFormat, string> = {
  chatml: "ChatML (Qwen, Yi, 기본)",
  llama3: "Llama 3 / 3.1 / 3.2",
  mistral: "Mistral / Mixtral",
  phi: "Phi-3 / Phi-4",
  gemma: "Gemma / Gemma 2",
  raw: "Raw (포맷 없음)",
};

export const RUNTIME_INFO: Record<LocalRuntime, { name: string; defaultPort: number; apiPath: string }> = {
  ollama: { name: "Ollama", defaultPort: 11434, apiPath: "/api/generate" },
  lmstudio: { name: "LM Studio", defaultPort: 1234, apiPath: "/v1/chat/completions" },
  llamacpp: { name: "llama.cpp", defaultPort: 8080, apiPath: "/completion" },
  vllm: { name: "vLLM", defaultPort: 8000, apiPath: "/v1/chat/completions" },
};
