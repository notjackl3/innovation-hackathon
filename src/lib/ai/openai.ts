import OpenAI from "openai";

let cached: OpenAI | null = null;

export function isMockMode(): boolean {
  if (process.env.MOCK_AI === "true") return true;
  if (!process.env.OPENAI_API_KEY) return true;
  return false;
}

export function openai(): OpenAI {
  if (cached) return cached;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing — call isMockMode() first");
  }
  cached = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cached;
}
