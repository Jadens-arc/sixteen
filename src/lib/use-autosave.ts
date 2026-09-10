"use client";

import { useEffect, useRef, useState } from "react";

export const AUTOSAVE_DELAY_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Autosaves as you write",
  saving: "Saving",
  saved: "Saved",
  error: "Not saved - keep writing, it will retry",
};

/**
 * Saves a value once the writer stops typing, and reports where that stands.
 *
 * A failed save deliberately does not retry on a timer: the snapshot stays
 * behind, so the next keystroke is what tries again. That is why the error
 * label tells someone to keep writing rather than to do something about it.
 */
export function useAutosave<T>({
  value,
  save,
  onError,
  delayMs = AUTOSAVE_DELAY_MS,
}: {
  value: T;
  save: (value: T) => Promise<void>;
  onError?: () => void;
  delayMs?: number;
}): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const serialized = JSON.stringify(value);
  const [savedSnapshot, setSavedSnapshot] = useState(serialized);

  // The effect keys off the serialized value alone. Everything else is read
  // when the timer fires, so a parent that rebuilds its callbacks on every
  // render - which is every render, for an inline arrow - cannot restart the
  // debounce and leave a verse unsaved while someone keeps typing.
  const latest = useRef({ value, save, onError });
  latest.current = { value, save, onError };

  useEffect(() => {
    if (serialized === savedSnapshot) return;

    setStatus("saving");
    const timer = setTimeout(async () => {
      try {
        await latest.current.save(latest.current.value);
        setSavedSnapshot(serialized);
        setStatus("saved");
      } catch {
        setStatus("error");
        latest.current.onError?.();
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [serialized, savedSnapshot, delayMs]);

  return status;
}
