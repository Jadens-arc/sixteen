import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Server-only modules, and what would happen if a browser bundle reached one.
 *
 * `@/lib/db/*` opens a database connection and `@/lib/crypto/server` imports
 * node:crypto, so a client component importing a *value* from either fails the
 * build with an unhandled-scheme error that names webpack rather than the
 * import that caused it. Importing a *type* is fine - types are erased - and
 * the lists do exactly that for their entry shapes, which is what makes this
 * easy to get wrong in a way nothing else catches.
 */
const SERVER_ONLY = ["@/lib/db/", "@/lib/crypto/server", "@/lib/vault-policy"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

function valueImports(source: string): string[] {
  // Everything but `import type ...`, which never reaches the bundle.
  const pattern = /^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm;
  return Array.from(source.matchAll(pattern), (match) => match[1]);
}

describe("client components", () => {
  const clientFiles = sourceFiles("src").filter((path) =>
    /^["']use client["']/.test(readFileSync(path, "utf8").trimStart()),
  );

  it("finds the client components to check", () => {
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  it.each(SERVER_ONLY)("never import a value from %s", (prefix) => {
    const offenders = clientFiles.filter((path) =>
      valueImports(readFileSync(path, "utf8")).some((specifier) =>
        specifier.startsWith(prefix),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
