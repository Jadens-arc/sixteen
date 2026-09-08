import { parseModelJson } from "../parse-json";
import { buildPromptMessages } from "../prompt-request";
import { generatedPromptSchema, type GeneratedPrompt, type PromptProvider } from "../types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-opus-5";
const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 1024;

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content: AnthropicContentBlock[];
}

export class AnthropicProvider implements PromptProvider {
  readonly id = "anthropic";
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || DEFAULT_MODEL;
  }

  async generate(input: {
    date: string;
    recentConcepts: string[];
  }): Promise<GeneratedPrompt> {
    const { system, user } = buildPromptMessages(input);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    const textBlock = data.content.find((block) => block.type === "text");
    if (!textBlock?.text) {
      throw new Error("Anthropic response contained no text block");
    }

    return generatedPromptSchema.parse(parseModelJson(textBlock.text));
  }
}
