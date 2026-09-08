import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveProvider } from "@/lib/ai";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { OfflineProvider } from "@/lib/ai/providers/offline";
import { OpenAiProvider } from "@/lib/ai/providers/openai";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveProvider", () => {
  it("defaults to offline when AI_PROVIDER is unset", () => {
    vi.stubEnv("AI_PROVIDER", "");
    expect(resolveProvider()).toBeInstanceOf(OfflineProvider);
  });

  it("resolves the anthropic provider when a key is present", () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_API_KEY", "test-key");
    const provider = resolveProvider();

    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.id).toBe("anthropic");
  });

  it("resolves the openai provider when a key is present", () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("AI_API_KEY", "test-key");
    const provider = resolveProvider();

    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider.id).toBe("openai");
  });

  it("throws naming the valid provider ids for an unknown value", () => {
    vi.stubEnv("AI_PROVIDER", "made-up-provider");
    expect(() => resolveProvider()).toThrow(/anthropic, openai, offline/);
  });

  it("throws when an api-backed provider is selected without a key", () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_API_KEY", "");
    expect(() => resolveProvider()).toThrow(/AI_API_KEY/);
  });
});
