"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { createVerseNote, deleteVerseNote, saveVerseNote } from "@/actions/notebook";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_VERSE_LENGTH, countBars } from "@/lib/bars";
import { SAVE_STATUS_LABEL, useAutosave } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

function barLabel(count: number): string {
  return count === 1 ? "1 bar" : `${count} bars`;
}

/**
 * The pad for a verse with no prompt behind it. A blank page opens with no row
 * in the database - the first autosave is what creates one - so opening the
 * notebook, thinking better of it and leaving costs nothing and leaves nothing.
 */
export function NotebookPad({
  id: initialId,
  initialBody,
}: {
  id: string | null;
  initialBody: string;
}) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [body, setBody] = useState(initialBody);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // A create is slower than the debounce that started it, so a fast writer can
  // reach a second save while the first is still in flight. Both wait on this
  // one promise rather than each inserting a row of their own.
  const pendingCreate = useRef<Promise<{ id: string; body: string }> | null>(null);

  async function persist(next: string) {
    if (id) {
      await saveVerseNote({ id, body: next });
      return;
    }

    pendingCreate.current ??= createVerseNote({ body: next }).catch((error) => {
      // Clear the slot so the next keystroke starts a new attempt instead of
      // awaiting a promise that has already rejected.
      pendingCreate.current = null;
      throw error;
    });

    const created = await pendingCreate.current;
    setId(created.id);
    // Swap the URL under the blank page so a reload, a share or the back
    // button lands on the verse that now exists.
    //
    // The History API rather than router.replace(): /notebook/new and
    // /notebook/[id] are different route segments, so a router navigation
    // tears this pad down mid-keystroke and mounts a fresh one on whatever
    // the server had a moment ago. Everything typed while the create was in
    // flight goes with it - the text on screen, and the debounce that was
    // about to save it. Next patches replaceState, so the router still knows
    // where it is; nothing re-renders, which is the entire point.
    window.history.replaceState(null, "", `/notebook/${created.id}`);

    // The save that lost the race carries newer text than the one that created
    // the row, so it still has something to write.
    if (created.body !== next) await saveVerseNote({ id: created.id, body: next });
  }

  const status = useAutosave({
    value: body,
    save: persist,
    onError: () => toast.error("Could not save this verse. Check your connection."),
  });

  async function handleDelete() {
    if (!id) return;

    setIsDeleting(true);
    try {
      await deleteVerseNote({ id });
      router.push("/notebook");
      router.refresh();
    } catch {
      setIsDeleting(false);
      setIsConfirmingDelete(false);
      toast.error("Could not delete this verse. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-sm">
          {barLabel(countBars(body))}
        </span>
        <span
          className={cn(
            "text-xs font-medium",
            status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {SAVE_STATUS_LABEL[status]}
        </span>
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_VERSE_LENGTH}
        placeholder="Whatever you just thought of."
        aria-label="Verse"
        autoFocus={!initialId}
        className="min-h-72 resize-none font-mono text-base leading-relaxed sm:min-h-96"
      />

      {id ? (
        <div className="flex items-center justify-end gap-2">
          {isConfirmingDelete ? (
            <>
              <span className="text-muted-foreground text-xs">
                Delete this verse for good?
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                Delete
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setIsConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
