import { parseModelJson } from "../parse-json";
import { buildPromptMessages } from "../prompt-request";
import { generatedPromptSchema, type GeneratedPrompt, type PromptProvider } from "../types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 20_000;

interface ChatCompletionResponse {
  choices: { message: { content: string | null } }[];
}

// Also serves any OpenAI-compatible chat-completions endpoint (Ollama,
// LM Studio, Groq) by pointing AI_BASE_URL elsewhere - the wire format is
// the same, only the host differs.
export class OpenAiProvider implements PromptProvider {
  readonly id = "openai";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
    baseUrl?: string,
  ) {
    this.model = model || DEFAULT_MODEL;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async generate(input: {
    date: string;
    recentConcepts: string[];
  }): Promise<GeneratedPrompt> {
    const { system, user } = buildPromptMessages(input);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message.content;
    if (!content) {
      throw new Error("OpenAI response contained no message content");
    }

    return generatedPromptSchema.parse(parseModelJson(content));
  }
}
