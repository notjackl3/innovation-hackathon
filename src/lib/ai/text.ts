import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { isMockMode, openai } from "./openai";

export interface ChatOpts<S extends z.ZodTypeAny = z.ZodTypeAny> {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  jsonSchema?: S;
  /** Stable schema name for OpenAI structured outputs. Defaults to "Output". */
  schemaName?: string;
  mockResponse?: unknown;
}

/**
 * Calls the chat model and returns a value that conforms to `jsonSchema`.
 *
 * Real mode uses OpenAI's `response_format: json_schema` (Structured Outputs),
 * which forces the model to produce an object matching the schema. Falls back
 * to plain json_object mode for models that don't support strict schema.
 */
export async function chatJson<T>(opts: ChatOpts): Promise<T> {
  if (isMockMode()) {
    if (opts.mockResponse === undefined) {
      throw new Error("mockResponse required when MOCK_AI=true");
    }
    if (opts.jsonSchema) return opts.jsonSchema.parse(opts.mockResponse) as T;
    return opts.mockResponse as T;
  }
  const model = opts.model ?? "gpt-4o-mini";

  // Try Structured Outputs (strict JSON-schema enforcement) first. If the
  // schema isn't strict-compatible (defaults, records, etc.) zodResponseFormat
  // or the API will reject it — fall back to plain json_object and rely on
  // zod parsing client-side.
  let responseFormat:
    | ReturnType<typeof zodResponseFormat>
    | { type: "json_object" };
  let usingStrictSchema = false;
  if (opts.jsonSchema) {
    try {
      responseFormat = zodResponseFormat(opts.jsonSchema, opts.schemaName ?? "Output");
      usingStrictSchema = true;
    } catch {
      responseFormat = { type: "json_object" as const };
    }
  } else {
    responseFormat = { type: "json_object" as const };
  }

  const messages = [
    { role: "system" as const, content: opts.system },
    { role: "user" as const, content: opts.user },
  ];

  let raw: string;
  try {
    const completion = await openai().chat.completions.create({
      model,
      messages,
      temperature: opts.temperature ?? 0.6,
      response_format: responseFormat,
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch (err) {
    // OpenAI may reject the strict schema at request time. Retry with json_object.
    if (usingStrictSchema) {
      const completion = await openai().chat.completions.create({
        model,
        messages,
        temperature: opts.temperature ?? 0.6,
        response_format: { type: "json_object" },
      });
      raw = completion.choices[0]?.message?.content ?? "{}";
    } else {
      throw err;
    }
  }

  const parsed = JSON.parse(raw);
  if (opts.jsonSchema) return opts.jsonSchema.parse(parsed) as T;
  return parsed as T;
}

export async function chatText(
  opts: Omit<ChatOpts, "jsonSchema"> & { mockResponse?: string }
): Promise<string> {
  if (isMockMode()) return opts.mockResponse ?? "Mock response.";
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
