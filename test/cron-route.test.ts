import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getOrCreateTodayPrompt: vi.fn(async () => ({ promptDate: "2026-09-08" })),
}));

const { GET } = await import("@/app/api/cron/daily-prompt/route");

const ENDPOINT = "http://localhost/api/cron/daily-prompt";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/daily-prompt", () => {
  it("rejects a request with no bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "shh");
    const response = await GET(new Request(ENDPOINT));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "shh");
    const response = await GET(
      new Request(ENDPOINT, { headers: { authorization: "Bearer wrong" } }),
    );
    expect(response.status).toBe(401);
  });

  it("accepts the correct bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "shh");
    const response = await GET(
      new Request(ENDPOINT, { headers: { authorization: "Bearer shh" } }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects every request when CRON_SECRET is unset in production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(new Request(ENDPOINT));
    expect(response.status).toBe(401);
  });
});
