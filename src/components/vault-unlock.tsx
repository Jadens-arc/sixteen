"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { looksLikeRecoveryCode } from "@/lib/crypto/client";
import { useVault } from "@/lib/crypto/vault-context";

/**
 * The prompt that stands in for anything sealed while this browser does not
 * hold the key. It is deliberately not a modal over the app: a locked verse is
 * not an error state to dismiss, it is the setting working.
 */
export function VaultUnlock({ compact = false }: { compact?: boolean }) {
  const { unlock } = useVault();
  const [secret, setSecret] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (secret.length === 0) return;

    setIsWorking(true);
    setError(null);
    try {
      await unlock(secret, { recovery: useRecovery, remember });
      setSecret("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setIsWorking(false);
    }
  }

  const invalidCode = useRecovery && secret.length > 0 && !looksLikeRecoveryCode(secret);

  const form = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        type={useRecovery ? "text" : "password"}
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
        placeholder={useRecovery ? "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" : "Your passphrase"}
        aria-label={useRecovery ? "Recovery code" : "Passphrase"}
        autoComplete={useRecovery ? "off" : "current-password"}
        autoFocus
        className="font-mono"
      />

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {invalidCode ? (
        <p className="text-muted-foreground text-xs">
          A recovery code is 25 characters in five groups.
        </p>
      ) : null}

      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="accent-foreground"
        />
        Stay unlocked on this device
      </label>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground px-0"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setSecret("");
            setError(null);
          }}
        >
          {useRecovery ? "Use passphrase" : "Use recovery code"}
        </Button>
        <Button type="submit" disabled={isWorking || secret.length === 0}>
          {isWorking ? "Unlocking" : "Unlock"}
        </Button>
      </div>
    </form>
  );

  if (compact) return form;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-normal">This notebook is locked</CardTitle>
        <CardDescription>
          Your verses are sealed with your passphrase. Nothing here - and nobody
          running this app - can read them without it.
        </CardDescription>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
