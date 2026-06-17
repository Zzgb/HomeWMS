import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  DEFAULT_MODEL,
} from "@/lib/constants";

// Provider instances (lazy, created once per request via key overrides)
let _openai: ReturnType<typeof createOpenAI>;
let _deepseek: ReturnType<typeof createOpenAI>;
let _openrouter: ReturnType<typeof createOpenAI>;
let _anthropic: ReturnType<typeof createAnthropic>;
let _google: ReturnType<typeof createGoogleGenerativeAI>;

// Key overrides for cloud deployments (set per-request from DB)
let _keyOverrides: Record<string, { apiKey: string; baseURL?: string }> | null = null;

export function setLLMKeyOverrides(overrides: Record<string, { apiKey: string; baseURL?: string }> | null) {
  _keyOverrides = overrides;
  _openai = undefined!; _deepseek = undefined!; _openrouter = undefined!;
  _anthropic = undefined!; _google = undefined!;
}

export function getLLMKey(provider: string): string | undefined {
  return _keyOverrides?.[provider]?.apiKey || undefined;
}

function resolveKey(provider: string, envKey: string | undefined): string {
  const override = _keyOverrides?.[provider];
  return override?.apiKey || envKey || "";
}

function resolveBaseURL(provider: string, defaultURL?: string): string | undefined {
  const override = _keyOverrides?.[provider];
  return override?.baseURL || defaultURL;
}

function getOpenAI() {
  if (!_openai) _openai = createOpenAI({ apiKey: resolveKey("openai", process.env.OPENAI_API_KEY) });
  return _openai;
}

function getDeepSeek() {
  if (!_deepseek)
    _deepseek = createOpenAI({
      apiKey: resolveKey("deepseek", process.env.DEEPSEEK_API_KEY),
      baseURL: resolveBaseURL("deepseek", "https://api.deepseek.com/v1"),
    });
  return _deepseek;
}

function getOpenRouter() {
  if (!_openrouter)
    _openrouter = createOpenAI({
      apiKey: resolveKey("openrouter", process.env.OPENROUTER_API_KEY),
      baseURL: resolveBaseURL("openrouter", "https://openrouter.ai/api/v1"),
    });
  return _openrouter;
}

function getAnthropic() {
  if (!_anthropic)
    _anthropic = createAnthropic({ apiKey: resolveKey("claude", process.env.ANTHROPIC_API_KEY) });
  return _anthropic;
}

function getGoogle() {
  if (!_google)
    _google = createGoogleGenerativeAI({
      apiKey: resolveKey("gemini", process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    });
  return _google;
}

export function getModel(modelId?: string): LanguageModel {
  const id = modelId || DEFAULT_MODEL;
  const slashIndex = id.indexOf("/");

  if (slashIndex === -1) {
    throw new Error(
      `Invalid model ID format: "${id}". Expected "provider/model-name"`
    );
  }

  const provider = id.slice(0, slashIndex);
  const model = id.slice(slashIndex + 1);

  switch (provider) {
    case "openai":
      return getOpenAI()(model);
    case "deepseek":
      return getDeepSeek().chat(model);
    case "claude":
      return getAnthropic()(model);
    case "gemini":
      return getGoogle()(model);
    case "openrouter":
      return getOpenRouter().chat(model);
    default:
      throw new Error(
        `Unknown provider: "${provider}". Supported: openai, deepseek, claude, gemini, openrouter`
      );
  }
}

/** Get a model with an explicit API key (for cloud deployments where keys come from DB) */
export function getModelWithKey(modelId: string, apiKey: string, baseURL?: string): LanguageModel {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid model ID: "${modelId}". Expected "provider/model-name"`);
  }

  const provider = modelId.slice(0, slashIndex);
  const model = modelId.slice(slashIndex + 1);

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey, baseURL })(model);
    case "deepseek":
      return createOpenAI({ apiKey, baseURL: baseURL || "https://api.deepseek.com/v1" }).chat(model);
    case "claude":
      return createAnthropic({ apiKey, baseURL })(model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey, baseURL })(model);
    case "openrouter":
      return createOpenAI({ apiKey, baseURL: baseURL || "https://openrouter.ai/api/v1" }).chat(model);
    default:
      throw new Error(`Unknown provider: "${provider}"`);
  }
}

export function getAvailableProviders(): string[] {
  const providers: string[] = [];
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.DEEPSEEK_API_KEY) providers.push("deepseek");
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude");
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) providers.push("gemini");
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  return providers;
}
