"use client";

import { useState } from "react";
import { toast } from "sonner";

import { completeVerse, saveVerse } from "@/actions/verse";
import { BarMeter } from "@/components/bar-meter";
import { SealedBody } from "@/components/sealed-body";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BAR_TARGET, MAX_VERSE_LENGTH, countBars } from "@/lib/bars";
import { useVault } from "@/lib/crypto/vault-context";
import { SAVE_STATUS_LABEL, useAutosave } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

/**
 * The pad, once the verse is readable. Split from the wrapper below so that it
 * mounts with the real text already in hand: its autosave compares against
 * whatever it started with, and starting empty would make the first render
 * look like an edit and write it straight back.
 */
function Pad({
  promptId,
  initialBody,
  initialCompletedAt,
}: {
  promptId: string;
  initialBody: string;
  initialCompletedAt: string | null;
}) {
  const { toSaved } = useVault();
  const [body, setBody] = useState(initialBody);
  const [completedAt, setCompletedAt] = useState(initialCompletedAt);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const barCount = countBars(body);
  const isDone = Boolean(completedAt);
  const canComplete = barCount >= BAR_TARGET && !isDone;

  // A finished verse reads as finished, but nothing about it is frozen: the
  // pad reopens on demand so a weak bar can still be fixed a week later. The
  // autosave that follows leaves completedAt alone (see upsertVerse), so
  // editing a verse never takes back the day it completed.
  const isLocked = isDone && !isEditing;

  const status = useAutosave({
    value: body,
    save: async (next) => {
      // toSaved() seals the verse when this account has a passphrase, and
      // hands back the bar count with it - the server cannot count what it
      // cannot read.
      await saveVerse({ promptId, ...(await toSaved(next)) });
    },
    onError: () => toast.error("Could not save your verse. Check your connection."),
  });

  const statusLabel = isLocked ? "Done - reopen to edit" : SAVE_STATUS_LABEL[status];

  async function handleComplete() {
    setIsCompleting(true);
    try {
      await completeVerse({ promptId });
      setCompletedAt(new Date().toISOString());
    } catch {
      toast.error("Could not mark this verse done. Try again.");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <BarMeter barCount={barCount} />
        <span
          className={cn(
            "text-xs font-medium",
            status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={isLocked}
        maxLength={MAX_VERSE_LENGTH}
        placeholder="Bar one goes here."
        aria-label="Verse"
        className="min-h-64 resize-none font-mono text-base leading-relaxed sm:min-h-80"
      />

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-sm">
          {Math.min(barCount, BAR_TARGET)} / {BAR_TARGET} bars
        </span>
        {isDone ? (
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? "Done editing" : "Edit"}
          </Button>
        ) : (
          <Button onClick={handleComplete} disabled={!canComplete || isCompleting}>
            Mark 16 done
          </Button>
        )}
      </div>
    </div>
  );
}

export function VersePad({
  promptId,
  initialBody,
  initialSealed,
  initialCompletedAt,
}: {
  promptId: string;
  initialBody: string;
  initialSealed: boolean;
  initialCompletedAt: string | null;
}) {
  return (
    <SealedBody stored={initialBody} sealed={initialSealed}>
      {(body) => (
        <Pad
          promptId={promptId}
          initialBody={body}
          initialCompletedAt={initialCompletedAt}
        />
      )}
    </SealedBody>
  );
}
