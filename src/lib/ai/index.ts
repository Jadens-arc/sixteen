import { AnthropicProvider } from "./providers/anthropic";
import { OfflineProvider } from "./providers/offline";
import { OpenAiProvider } from "./providers/openai";
import type { DailyPromptResult, PromptProvider } from "./types";

const VALID_PROVIDER_IDS = ["anthropic", "openai", "offline"] as const;

function requireApiKey(providerId: string): string {
  const key = process.env.AI_API_KEY;
  if (!key) {
    throw new Error(`AI_API_KEY is required when AI_PROVIDER=${providerId}`);
  }
  return key;
}

export function resolveProvider(): PromptProvider {
  const providerId = process.env.AI_PROVIDER?.trim() || "offline";

  switch (providerId) {
    case "offline":
      return new OfflineProvider();
    case "anthropic":
      return new AnthropicProvider(requireApiKey(providerId), process.env.AI_MODEL);
    case "openai":
      return new OpenAiProvider(
        requireApiKey(providerId),
        process.env.AI_MODEL,
        process.env.AI_BASE_URL,
      );
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${providerId}". Valid values: ${VALID_PROVIDER_IDS.join(", ")}.`,
      );
  }
}

async function runProvider(
  provider: PromptProvider,
  input: { date: string; recentConcepts: string[] },
): Promise<DailyPromptResult> {
  const prompt = await provider.generate(input);
  return { prompt, source: provider.id, model: provider.model ?? null };
}

export async function generateDailyPrompt(input: {
  date: string;
  recentConcepts: string[];
}): Promise<DailyPromptResult> {
  let provider: PromptProvider;
  try {
    provider = resolveProvider();
  } catch (error) {
    console.error("Failed to resolve AI provider, falling back to offline:", error);
    return runProvider(new OfflineProvider(), input);
  }

  if (provider.id === "offline") {
    return runProvider(provider, input);
  }

  try {
    return await runProvider(provider, input);
  } catch (error) {
    console.error(`AI provider "${provider.id}" failed, falling back to offline:`, error);
    return runProvider(new OfflineProvider(), input);
  }
}
