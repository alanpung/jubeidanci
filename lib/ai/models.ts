import { createProviderRegistry } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || "dummy",
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
});

const registry = createProviderRegistry({ google, openai });

export const AVAILABLE_MODELS: {
  id: string;
  label: string;
  provider: string;
}[] = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", provider: "google" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "google" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "google" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", provider: "google" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "o3-mini", label: "o3-mini", provider: "openai" },
];

/** Models available in the chat UI */
export const CHAT_AVAILABLE_MODELS = AVAILABLE_MODELS;

/** Author / admin emails. */
const DEFAULT_ADMINS = [
  "alan.pung@gmail.com",
  "alanpung@gmail.com",
  "alanpung@users.noreply.github.com",
];

const ADMIN_EMAILS: string[] = Array.from(
  new Set([
    ...DEFAULT_ADMINS,
    ...(process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ]),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (ADMIN_EMAILS.includes(normalized)) return true;
  if (
    normalized.startsWith("alan.pung") ||
    normalized.startsWith("alanpung")
  ) {
    return true;
  }
  return false;
}

/** Returns the model list appropriate for the given user email. */
export function getModelsForUser(_email: string | null | undefined) {
  return CHAT_AVAILABLE_MODELS;
}

export function getModel(id: string) {
  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === id);
  if (modelInfo) {
    return registry.languageModel(
      `${modelInfo.provider}:${modelInfo.id}` as Parameters<typeof registry.languageModel>[0],
    );
  }

  // Handle direct OpenAI model IDs
  if (id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3")) {
    return registry.languageModel(
      `openai:${id}` as Parameters<typeof registry.languageModel>[0],
    );
  }

  // Fallback if Gemini key is missing but OpenAI key is available
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

  if (!hasGeminiKey && hasOpenAIKey) {
    return registry.languageModel(
      "openai:gpt-4o-mini" as Parameters<typeof registry.languageModel>[0],
    );
  }

  const resolved = id.startsWith("gemini-") ? `google:${id}` : `google:gemini-3.5-flash`;
  return registry.languageModel(
    resolved as Parameters<typeof registry.languageModel>[0],
  );
}
