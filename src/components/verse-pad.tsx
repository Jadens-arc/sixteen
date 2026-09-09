"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { completeVerse, saveVerse } from "@/actions/verse";
import { BarMeter } from "@/components/bar-meter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BAR_TARGET, MAX_VERSE_LENGTH, countBars } from "@/lib/bars";
import { cn } from "@/lib/utils";

const AUTOSAVE_DELAY_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Autosaves as you write",
  saving: "Saving",
  saved: "Saved",
  error: "Not saved - keep writing, it will retry",
};

export function VersePad({
  promptId,
  initialBody,
  initialCompletedAt,
}: {
  promptId: string;
  initialBody: string;
  initialCompletedAt: string | null;
}) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [completedAt, setCompletedAt] = useState(initialCompletedAt);
  const [isCompleting, setIsCompleting] = useState(false);

  const barCount = countBars(body);
  const isDone = Boolean(completedAt);
  const canComplete = barCount >= BAR_TARGET && !isDone;

  useEffect(() => {
    if (body === savedBody) return;

    setStatus("saving");
    const timer = setTimeout(async () => {
      try {
        await saveVerse({ promptId, body });
        setSavedBody(body);
        setStatus("saved");
      } catch {
        setStatus("error");
        toast.error("Could not save your verse. Check your connection.");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [body, promptId, savedBody]);

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
          {STATUS_LABEL[status]}
        </span>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={isDone}
        maxLength={MAX_VERSE_LENGTH}
        placeholder="Bar one goes here."
        aria-label="Verse"
        className="min-h-64 resize-none font-mono text-base leading-relaxed sm:min-h-80"
      />

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-sm">
          {Math.min(barCount, BAR_TARGET)} / {BAR_TARGET} bars
        </span>
        <Button onClick={handleComplete} disabled={!canComplete || isCompleting}>
          {isDone ? "Done" : "Mark 16 done"}
        </Button>
      </div>
    </div>
  );
}
