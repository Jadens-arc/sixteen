"use server";

import { revalidatePath } from "next/cache";

import { BAR_TARGET, countBars } from "@/lib/bars";
import { requireUserId } from "@/lib/auth";
import { getVerseForPrompt, upsertVerse } from "@/lib/db/queries";
import type { Verse } from "@/lib/db/schema";

export async function saveVerse(input: { promptId: string; body: string }): Promise<Verse> {
  const userId = await requireUserId();

  const verse = await upsertVerse({
    promptId: input.promptId,
    userId,
    body: input.body,
  });

  revalidatePath("/");
  return verse;
}

export async function completeVerse(input: { promptId: string }): Promise<Verse> {
  const userId = await requireUserId();

  const existing = await getVerseForPrompt(input.promptId, userId);
  const body = existing?.body ?? "";

  if (countBars(body) < BAR_TARGET) {
    throw new Error(`A verse needs at least ${BAR_TARGET} bars to complete.`);
  }

  const verse = await upsertVerse({
    promptId: input.promptId,
    userId,
    body,
    completed: true,
  });

  revalidatePath("/");
  revalidatePath("/archive");
  return verse;
}
