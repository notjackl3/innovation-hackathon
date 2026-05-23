import { z } from "zod";
import { isMockMode, openai } from "./openai";

export interface ChatOpts {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  jsonSchema?: z.ZodTypeAny;
  mockResponse?: unknown;
}

export async function chatJson<T>(opts: ChatOpts): Promise<T> {
  if (isMockMode()) {
    if (opts.mockResponse === undefined) {
      throw new Error("mockResponse required when MOCK_AI=true");
    }
    if (opts.jsonSchema) {
      return opts.jsonSchema.parse(opts.mockResponse) as T;
    }
    return opts.mockResponse as T;
  }
  const model = opts.model ?? "gpt-4o-mini";
  const completion = await openai().chat.completions.create({
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.6,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  if (opts.jsonSchema) return opts.jsonSchema.parse(parsed) as T;
  return parsed as T;
}

export async function chatText(opts: Omit<ChatOpts, "jsonSchema"> & { mockResponse?: string }): Promise<string> {
  if (isMockMode()) {
    return opts.mockResponse ?? "Mock response.";
  }
  const model = opts.model ?? "gpt-4o-mini";
  const completion = await openai().chat.completions.create({
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.6,
  });
  return completion.choices[0]?.message?.content ?? "";
}
