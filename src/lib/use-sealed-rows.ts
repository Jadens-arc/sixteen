"use client";

import { useEffect, useRef, useState } from "react";

import { useVault } from "@/lib/crypto/vault-context";

/**
 * Turns a list of entries from the server into rows to render, opening any
 * that are sealed on the way.
 *
 * The server sends sealed entries unfiltered - it cannot match a search
 * against a verse it cannot read - so `resolve` is also where a sealed row
 * gets its search applied, by returning null for one that does not match.
 * That keeps one rule for both kinds of row: the server filters what it can
 * read, this filters what only the browser can.
 */
export function useSealedRows<Entry, Row>(
  entries: Entry[],
  options: {
    /** The ciphertext for a sealed entry, or null when the server could read it. */
    sealedBodyOf: (entry: Entry) => string | null;
    /** Builds the row. `body` is the opened writing, or null for an unsealed entry. */
    resolve: (entry: Entry, body: string | null) => Row | null;
  },
): { rows: Row[]; pending: boolean; error: string | null } {
  const { phase, toWriting } = useVault();
  const [state, setState] = useState<{ rows: Row[]; pending: boolean; error: string | null }>({
    rows: [],
    pending: true,
    error: null,
  });

  // Read when the effect runs rather than depended on, so a parent rebuilding
  // its callbacks every render cannot restart the work.
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const { sealedBodyOf, resolve } = latest.current;
    const anySealed = entries.some((entry) => sealedBodyOf(entry) !== null);

    // Nothing sealed: no key needed, and no reason to make the list wait for
    // one. This is the path every account without a passphrase takes.
    if (!anySealed) {
      const rows = entries
        .map((entry) => resolve(entry, null))
        .filter((row): row is Row => row !== null);
      setState({ rows, pending: false, error: null });
      return;
    }

    if (phase !== "unlocked") {
      setState({ rows: [], pending: phase === "loading", error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, pending: true, error: null }));

    (async () => {
      const rows: Row[] = [];

      for (const entry of entries) {
        const sealed = sealedBodyOf(entry);
        const body = sealed === null ? null : await toWriting(sealed);
        const row = resolve(entry, body);
        if (row !== null) rows.push(row);
      }

      if (!cancelled) setState({ rows, pending: false, error: null });
    })().catch((caught: unknown) => {
      if (cancelled) return;
      setState({
        rows: [],
        pending: false,
        error: caught instanceof Error ? caught.message : "These verses could not be opened.",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [entries, phase, toWriting]);

  return state;
}
