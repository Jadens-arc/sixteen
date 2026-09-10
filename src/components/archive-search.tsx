"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_SEARCH_LENGTH } from "@/lib/search";

const SEARCH_DEBOUNCE_MS = 300;

export function archiveHref(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `/archive?q=${encodeURIComponent(trimmed)}` : "/archive";
}

/**
 * The query lives in the URL, not in this component: the archive searches
 * verse bodies that never all come down to the browser, so every keystroke
 * has to reach the server anyway - and a search worth keeping is a link worth
 * sharing with yourself. The form still works with JavaScript off; the
 * debounced replace() is what makes it feel live when it's on.
 */
export function ArchiveSearch({ query }: { query: string }) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  // Follow the URL when it changes underneath us - a Clear link, or the back
  // button after a search - so the field never disagrees with the results.
  useEffect(() => {
    setValue(query);
  }, [query]);

  useEffect(() => {
    if (value.trim() === query) return;

    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(archiveHref(value), { scroll: false });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, query, router]);

  return (
    <form
      action="/archive"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => {
          router.replace(archiveHref(value), { scroll: false });
        });
      }}
      className="flex items-center gap-2"
      role="search"
    >
      <Input
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_SEARCH_LENGTH}
        placeholder="Search your verses and prompts"
        aria-label="Search the archive"
        className="font-mono"
      />
      {value ? (
        <Button type="button" variant="ghost" onClick={() => setValue("")}>
          Clear
        </Button>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {isPending ? "Searching" : ""}
      </span>
    </form>
  );
}
