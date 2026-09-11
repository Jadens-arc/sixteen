import { webcrypto } from "node:crypto";
import "@testing-library/jest-dom/vitest";

// jsdom ships getRandomValues but no SubtleCrypto, and the browser half of the
// encryption is nothing but SubtleCrypto. Node's implementation is the same
// Web Crypto API, so the code under test is the code that ships.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}
