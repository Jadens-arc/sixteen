"use client";

import { useEffect, useState, type ReactNode } from "react";

import { VaultUnlock } from "@/components/vault-unlock";
import { useVault } from "@/lib/crypto/vault-context";

/**
 * Stands between a stored body and anything that wants to render it.
 *
 * A verse arrives from the server either as writing or as ciphertext, and the
 * difference is not the caller's problem: this resolves it, shows the unlock
 * prompt if the key is missing, and only then renders. The render prop matters
 * more than it looks - the pad inside mounts with the real text as its initial
 * state, so its autosave starts out in step rather than immediately writing
 * back what it just finished decrypting.
 */
export function SealedBody({
  stored,
  sealed,
  children,
}: {
  stored: string;
  sealed: boolean;
  children: (body: string) => ReactNode;
}) {
  const { phase, toWriting } = useVault();
  const [body, setBody] = useState<string | null>(sealed ? null : stored);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sealed) {
      setBody(stored);
      return;
    }
    if (phase !== "unlocked") {
      setBody(null);
      return;
    }

    let cancelled = false;
    toWriting(stored)
      .then((opened) => {
        if (!cancelled) setBody(opened);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "This verse could not be opened.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sealed, stored, phase, toWriting]);

  if (error) {
    return (
      <p className="text-destructive font-mono text-sm">
        {error}
      </p>
    );
  }

  if (body === null) {
    if (phase === "locked") return <VaultUnlock />;
    return (
      <p className="text-muted-foreground font-mono text-sm">
        {phase === "loading" ? "Checking..." : "Opening..."}
      </p>
    );
  }

  return <>{children(body)}</>;
}
