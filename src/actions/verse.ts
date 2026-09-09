"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BAR_TARGET, MAX_VERSE_LENGTH, countBars } from "@/lib/bars";
import { requireUserId } from "@/lib/auth";
import { getVerseForPrompt, upsertVerse } from "@/lib/db/queries";
import type { Verse } from "@/lib/db/schema";

// A server action is a public HTTP endpoint, and its argument types are erased
// at runtime - nothing stops a caller from posting a 5 MB body or a promptId
// that isn't a uuid. Parse at the boundary instead of trusting the signature.
const saveVerseSchema = z.object({
  promptId: z.uuid(),
  body: z.string().max(MAX_VERSE_LENGTH),
});

const completeVerseSchema = z.object({
  promptId: z.uuid(),
});

export async function saveVerse(input: { promptId: string; body: string }): Promise<Verse> {
  const userId = await requireUserId();
  const { promptId, body } = saveVerseSchema.parse(input);

  const verse = await upsertVerse({
    promptId,
    userId,
    body,
  });

  return verse;
}

export async function completeVerse(input: { promptId: string }): Promise<Verse> {
  const userId = await requireUserId();
  const { promptId } = completeVerseSchema.parse(input);

  const existing = await getVerseForPrompt(promptId, userId);
  const body = existing?.body ?? "";

  if (countBars(body) < BAR_TARGET) {
    throw new Error(`A verse needs at least ${BAR_TARGET} bars to complete.`);
  }

  const verse = await upsertVerse({
    promptId,
    userId,
    body,
    completed: true,
  });

  revalidatePath("/");
  revalidatePath("/archive");
  return verse;
}
