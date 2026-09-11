import { vi } from "vitest";

/**
 * A vault that is switched off: no passphrase, so bodies pass through in both
 * directions exactly as they did before any of this existed.
 *
 * Most component tests are not about encryption - they are about a pad that
 * autosaves or a list that names a verse - and they should keep testing that
 * without a Clerk session or a database behind them. The tests that are about
 * encryption build their own.
 */
export function vaultModuleMock(overrides: Record<string, unknown> = {}) {
  const api = {
    phase: "off" as const,
    status: null,
    unsealing: false,
    unlock: vi.fn(),
    lock: vi.fn(),
    refresh: vi.fn(),
    adoptKey: vi.fn(),
    toSaved: async (body: string) => ({ body }),
    toWriting: async (stored: string) => stored,
    sealNow: async (body: string) => body,
    openNow: async (stored: string) => stored,
    ...overrides,
  };

  return {
    useVault: () => api,
    VaultProvider: ({ children }: { children: React.ReactNode }) => children,
    VaultOffProvider: ({ children }: { children: React.ReactNode }) => children,
  };
}
