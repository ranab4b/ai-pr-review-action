import { SYSTEM_PROMPT, buildUserPrompt } from './prompts/reviewPrompt';

export interface ReviewResult {
  summary: string;
  risks: string[];
  todoItems: string[];
}

export interface LlmClientOptions {
  apiKey: string;
  apiUrl: string;
  model: string;
  maxTokens?: number;
}

/**
 * Pulls the JSON object out of a raw LLM response body, tolerating the
 * occasional stray markdown fence or leading/trailing prose despite the
 * prompt asking for JSON only.
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in LLM response');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Normalizes a parsed JSON payload into a ReviewResult, defaulting any
 * missing or malformed fields so a partially-broken LLM response still
 * produces a usable, deterministic result.
 */
export function parseReviewResponse(text: string): ReviewResult {
  const parsed = extractJson(text) as Record<string, unknown>;

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    risks: toStringArray(parsed.risks),
    todoItems: toStringArray(parsed.todoItems)
  };
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Calls the LLM API and returns a structured review. Targets Anthropic's
 * Messages API by default (api-url/model are both configurable inputs).
 * Swapping providers means adjusting the request body and response
 * extraction below to match that provider's API shape.
 */
export async function reviewDiff(diff: string, options: LlmClientOptions): Promise<ReviewResult> {
  const { apiKey, apiUrl, model, maxTokens = 1024 } = options;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(diff) }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM API request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.find((block) => block.type === 'text')?.text;

  if (!text) {
    throw new Error('LLM API response contained no text content');
  }

  return parseReviewResponse(text);
}
