export type ProviderPrefix = "openai" | "deepseek" | "claude" | "gemini" | "openrouter";

export interface ModelId {
  provider: ProviderPrefix;
  model: string;
}

export interface StoreConfig {
  modelId?: string;
  memorySize?: number;
}

export interface SummarizedOperation {
  timestamp: string;
  userMessage: string;
  action: string;
}

export const AVAILABLE_MODELS: { provider: ProviderPrefix; models: string[] }[] = [
  {
    provider: "deepseek",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
  {
    provider: "openai",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-nano"],
  },
  {
    provider: "claude",
    models: ["claude-haiku-4-20250514", "claude-sonnet-4-20250514", "claude-opus-4-20250514"],
  },
  {
    provider: "gemini",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    provider: "openrouter",
    models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4-20250514", "google/gemini-2.5-flash", "deepseek/deepseek-v4-flash"],
  },
];
