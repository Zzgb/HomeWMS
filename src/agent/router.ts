import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  DEFAULT_MODEL,
} from "@/lib/constants";

// Provider instances (lazy, created once)
let _openai: ReturnType<typeof createOpenAI>;
let _deepseek: ReturnType<typeof createOpenAI>;
let _openrouter: ReturnType<typeof createOpenAI>;
let _anthropic: ReturnType<typeof createAnthropic>;
let _google: ReturnType<typeof createGoogleGenerativeAI>;

function getOpenAI() {
  if (!_openai) _openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

function getDeepSeek() {
  if (!_deepseek)
    _deepseek = createOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY!,
      baseURL: "https://api.deepseek.com/v1",
    });
  return _deepseek;
}

function getOpenRouter() {
  if (!_openrouter)
    _openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseURL: "https://openrouter.ai/api/v1",
    });
  return _openrouter;
}

function getAnthropic() {
  if (!_anthropic)
    _anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

function getGoogle() {
  if (!_google)
    _google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
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

export function getAvailableProviders(): string[] {
  const providers: string[] = [];
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.DEEPSEEK_API_KEY) providers.push("deepseek");
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude");
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) providers.push("gemini");
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  return providers;
}
