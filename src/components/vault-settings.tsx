"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  beginUnsealing,
  changePassphrase,
  enableVault,
  finishUnsealing,
  getVaultProgress,
  nextVersesToSeal,
  nextVersesToUnseal,
  storeConvertedVerse,
} from "@/actions/vault";
import { VaultUnlock } from "@/components/vault-unlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { countBars } from "@/lib/bars";
import {
  KDF_ITERATIONS,
  KDF_NAME,
  dataKeyId,
  deriveWrappingKey,
  generateDataKey,
  generateRecoveryCode,
  generateSalt,
  normalizeRecoveryCode,
  unwrapDataKey,
  wrapDataKey,
} from "@/lib/crypto/client";
import { useVault } from "@/lib/crypto/vault-context";

const MIN_PASSPHRASE = 10;

type Stage = "idle" | "passphrase" | "recovery" | "working";

export function VaultSettings() {
  const { userId } = useAuth();
  const vault = useVault();
  const { phase, status, unsealing, refresh, adoptKey, lock, sealNow, openNow } = vault;

  const [stage, setStage] = useState<Stage>("idle");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [typedBack, setTypedBack] = useState("");
  const [pendingKey, setPendingKey] = useState<Uint8Array | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Counted only for this page. The vault provider runs on every page and
  // deliberately does not ask for these.
  const [counts, setCounts] = useState({ versesToSeal: 0, versesSealed: 0 });

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await getVaultProgress());
    } catch {
      // A count is not worth an error banner over; the actions that matter
      // report their own failures.
    }
  }, []);

  useEffect(() => {
    if (phase !== "loading") void refreshCounts();
  }, [phase, refreshCounts]);

  function reset() {
    setStage("idle");
    setPendingKey(null);
    setPassphrase("");
    setConfirmation("");
    setRecoveryCode("");
    setTypedBack("");
  }

  function fail(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
    setProgress(null);
    setStage("idle");
  }

  /**
   * Converts every verse that still needs it, a batch at a time, in whichever
   * direction the account is going.
   *
   * Each verse is its own write, so closing the laptop halfway leaves a
   * notebook where some verses are sealed and some are not - a state the rest
   * of the app already handles, and one this picks up from unchanged next
   * time. That is why there is no transaction here and no attempt at one.
   */
  const convert = useCallback(
    async (direction: "seal" | "unseal") => {
      const next = direction === "seal" ? nextVersesToSeal : nextVersesToUnseal;
      const transform = direction === "seal" ? sealNow : openNow;
      const label = direction === "seal" ? "Sealing" : "Unlocking";

      let done = 0;
      for (;;) {
        const batch = await next();
        if (batch.length === 0) break;

        for (const verse of batch) {
          const body = await transform(verse.body);
          // The bar count is taken from whichever side of the conversion is
          // the writing, because that is the only side it can be counted on.
          const barCount =
            direction === "seal" ? countBars(verse.body) : countBars(body);

          await storeConvertedVerse({
            id: verse.id,
            expectedBody: verse.storedBody,
            body,
            barCount,
          });

          done += 1;
          setProgress(`${label} your verses - ${done} done`);
        }
      }

      setProgress(null);
      return done;
    },
    [sealNow, openNow],
  );

  function beginEnable() {
    setError(null);

    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`Use at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (passphrase !== confirmation) {
      setError("Those two passphrases are not the same.");
      return;
    }

    // The data key exists before the passphrase does and outlives any change
    // to it: what a passphrase protects is this key, not the verses directly,
    // which is what makes changing it cheap and losing it final.
    setPendingKey(generateDataKey());
    setRecoveryCode(generateRecoveryCode());
    setTypedBack("");
    setStage("recovery");
  }

  /**
   * Nothing is sealed until the recovery code has been typed back.
   *
   * This step is the difference between a privacy setting and a way to lose
   * everything you have written. A code shown once and clicked past is a code
   * nobody has, and the day that matters is the day the passphrase is
   * forgotten - by which point nobody, here or anywhere, can help.
   */
  async function confirmRecovery() {
    if (!userId || !pendingKey) return;
    setError(null);

    if (normalizeRecoveryCode(typedBack) !== recoveryCode) {
      setError("That is not the code above. Copy it somewhere safe, then type it back.");
      return;
    }

    setStage("working");
    try {
      const salt = generateSalt();
      const recoverySalt = generateSalt();
      const keyId = await dataKeyId(pendingKey);

      const [wrappedByPassphrase, wrappedByRecovery] = await Promise.all([
        deriveWrappingKey(passphrase, salt).then((wrapping) =>
          wrapDataKey(pendingKey, wrapping, userId),
        ),
        deriveWrappingKey(recoveryCode, recoverySalt).then((wrapping) =>
          wrapDataKey(pendingKey, wrapping, userId),
        ),
      ]);

      // The key is adopted before the account is marked sealed, so the
      // conversion below has something to seal with the moment it starts.
      await adoptKey(pendingKey, keyId, true);

      await enableVault({
        salt,
        recoverySalt,
        kdf: KDF_NAME,
        iterations: KDF_ITERATIONS,
        dataKeyId: keyId,
        wrappedByPassphrase,
        wrappedByRecovery,
      });

      await convert("seal");
      await refresh();
      await refreshCounts();
      reset();
      toast.success("Your notebook is locked.");
    } catch (caught) {
      fail(caught, "Could not turn the passphrase on.");
    }
  }

  async function sealRemaining() {
    setError(null);
    setStage("working");
    try {
      await convert("seal");
      await refresh();
      await refreshCounts();
      setStage("idle");
    } catch (caught) {
      fail(caught, "Could not finish sealing. Nothing has been lost - try again.");
    }
  }

  async function startDisable() {
    setError(null);
    setStage("working");
    try {
      await beginUnsealing();
      await refresh();
      await finishDisable();
    } catch (caught) {
      fail(caught, "Could not start unlocking.");
    }
  }

  async function finishDisable() {
    setError(null);
    setStage("working");
    try {
      await convert("unseal");

      // The server counts what is left rather than taking this side's word
      // for it. Deleting the key record early would strand any verse this
      // loop missed behind a wrapped key that no longer exists.
      const { remaining } = await finishUnsealing();
      await refreshCounts();
      if (remaining > 0) {
        setError(
          `${remaining} verses are still sealed, so the passphrase is still in ` +
            "place. Run it again.",
        );
        setStage("idle");
        return;
      }

      await lock();
      await refresh();
      reset();
      toast.success("Your notebook is no longer locked.");
    } catch (caught) {
      fail(caught, "Could not finish unlocking. Nothing has been lost - try again.");
    }
  }

  const busy = stage === "working";

  if (phase === "loading") {
    return <p className="text-muted-foreground text-sm">Checking...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {progress ? <p className="text-muted-foreground text-sm">{progress}</p> : null}

      {phase === "off" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-normal">
              Lock your notebook with a passphrase
            </CardTitle>
            <CardDescription>
              Your verses are already encrypted in the database. A passphrase
              goes further: they are sealed in your browser, with a key this app
              never receives, so nobody running it can read what you write.
              Search keeps working - it happens on this device instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {stage === "idle" ? (
              <>
                <p className="text-muted-foreground text-sm">
                  There is no way to reset a passphrase. You get one recovery
                  code, and if both are lost the verses are gone - including from
                  whoever runs this app.
                </p>
                <Button className="w-fit" onClick={() => setStage("passphrase")}>
                  Set a passphrase
                </Button>
              </>
            ) : null}

            {stage === "passphrase" ? (
              <div className="flex flex-col gap-3">
                <Input
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder={`Passphrase - ${MIN_PASSPHRASE} characters or more`}
                  aria-label="Passphrase"
                  autoComplete="new-password"
                  autoFocus
                  className="font-mono"
                />
                <Input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Type it again"
                  aria-label="Confirm passphrase"
                  autoComplete="new-password"
                  className="font-mono"
                />
                <div className="flex items-center gap-2">
                  <Button onClick={beginEnable}>Continue</Button>
                  <Button variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {stage === "recovery" || (stage === "working" && recoveryCode) ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  Write this down. It is the only way back in if you forget the
                  passphrase.
                </p>
                <p className="bg-muted rounded-md p-3 text-center font-mono text-base tracking-widest">
                  {recoveryCode}
                </p>
                <Input
                  value={typedBack}
                  onChange={(event) => setTypedBack(event.target.value)}
                  placeholder="Type the code back to confirm you have it"
                  aria-label="Confirm recovery code"
                  autoComplete="off"
                  autoFocus
                  className="font-mono"
                />
                <div className="flex items-center gap-2">
                  <Button onClick={confirmRecovery} disabled={busy}>
                    {busy ? "Sealing..." : "Lock my notebook"}
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {phase === "locked" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-normal">
              Your notebook is locked
            </CardTitle>
            <CardDescription>
              Unlock it here to change the passphrase or turn it off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VaultUnlock compact />
          </CardContent>
        </Card>
      ) : null}

      {phase === "unlocked" ? (
        <UnlockedPanel
          unsealing={unsealing}
          sealedCount={counts.versesSealed}
          remainingToSeal={counts.versesToSeal}
          busy={busy}
          onSealRemaining={sealRemaining}
          onDisable={startDisable}
          onFinishDisable={finishDisable}
          onLockDevice={async () => {
            await lock();
            toast.success("Locked on this device.");
          }}
          onChangePassphrase={async (current, next) => {
            if (!userId || !status?.salt || !status.wrappedByPassphrase) return;

            // The data key has to be rewrapped, and the key held in memory is
            // deliberately not readable back out - so the current passphrase
            // unwraps a fresh copy to rewrap. The key itself never changes,
            // which is why every sealed verse stays readable.
            const currentWrapping = await deriveWrappingKey(
              current,
              status.salt,
              status.iterations ?? undefined,
            );
            const raw = await unwrapDataKey(
              status.wrappedByPassphrase,
              currentWrapping,
              userId,
            );

            const salt = generateSalt();
            const wrapping = await deriveWrappingKey(next, salt);
            const wrappedByPassphrase = await wrapDataKey(raw, wrapping, userId);
            raw.fill(0);

            await changePassphrase({ salt, wrappedByPassphrase });
            await refresh();
            toast.success("Passphrase changed. Your recovery code still works.");
          }}
        />
      ) : null}
    </div>
  );
}

function UnlockedPanel({
  unsealing,
  sealedCount,
  remainingToSeal,
  busy,
  onSealRemaining,
  onDisable,
  onFinishDisable,
  onLockDevice,
  onChangePassphrase,
}: {
  unsealing: boolean;
  sealedCount: number;
  remainingToSeal: number;
  busy: boolean;
  onSealRemaining: () => Promise<void>;
  onDisable: () => Promise<void>;
  onFinishDisable: () => Promise<void>;
  onLockDevice: () => Promise<void>;
  onChangePassphrase: (current: string, next: string) => Promise<void>;
}) {
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  if (unsealing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal">
            Turning the passphrase off
          </CardTitle>
          <CardDescription>
            Your verses are being converted back to ones the server can read.
            This can be interrupted and picked up again - nothing is lost either
            way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onFinishDisable} disabled={busy}>
            {busy ? "Working..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-normal">
          Your notebook is sealed with your passphrase
        </CardTitle>
        <CardDescription>
          {sealedCount === 1 ? "1 verse is" : `${sealedCount} verses are`} sealed
          with a key that never leaves this device.
          {remainingToSeal > 0
            ? ` ${remainingToSeal} still need sealing.`
            : " Searching happens here, in this browser."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {remainingToSeal > 0 ? (
          <Button className="w-fit" onClick={onSealRemaining} disabled={busy}>
            {busy ? "Sealing..." : `Seal the remaining ${remainingToSeal}`}
          </Button>
        ) : null}

        {changing ? (
          <div className="flex flex-col gap-3">
            {changeError ? <p className="text-destructive text-sm">{changeError}</p> : null}
            <Input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              placeholder="Current passphrase"
              aria-label="Current passphrase"
              autoComplete="current-password"
              className="font-mono"
            />
            <Input
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              placeholder="New passphrase"
              aria-label="New passphrase"
              autoComplete="new-password"
              className="font-mono"
            />
            <div className="flex items-center gap-2">
              <Button
                disabled={next.length < MIN_PASSPHRASE}
                onClick={async () => {
                  setChangeError(null);
                  try {
                    await onChangePassphrase(current, next);
                    setChanging(false);
                    setCurrent("");
                    setNext("");
                  } catch (caught) {
                    setChangeError(
                      caught instanceof Error ? caught.message : "Could not change it.",
                    );
                  }
                }}
              >
                Change it
              </Button>
              <Button variant="ghost" onClick={() => setChanging(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setChanging(true)}>
              Change passphrase
            </Button>
            <Button variant="ghost" onClick={onLockDevice}>
              Lock this device
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-4">
          {confirmingOff ? (
            <>
              <p className="text-muted-foreground text-sm">
                Turning it off decrypts every verse and hands the server the key
                again. Your writing stays exactly where it is.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="destructive" onClick={onDisable} disabled={busy}>
                  {busy ? "Working..." : "Turn it off"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingOff(false)}>
                  Keep it on
                </Button>
              </div>
            </>
          ) : (
            <Button
              variant="ghost"
              className="text-muted-foreground w-fit px-0"
              onClick={() => setConfirmingOff(true)}
            >
              Turn off the passphrase
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
