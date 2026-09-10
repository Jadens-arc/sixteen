"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MAX_VERSE_LENGTH } from "@/lib/bars";
import { requireUserId } from "@/lib/auth";
import {
  createNotebookVerse,
  deleteNotebookVerse,
  updateNotebookVerse,
} from "@/lib/db/queries";
import type { Verse } from "@/lib/db/schema";

// Same reasoning as src/actions/verse.ts: a server action is a public endpoint
// and its argument types are gone by the time it runs, so the boundary parses
// rather than trusts. requireUserId() is what scopes each of these to one
// person's notebook - the queries take the id it returns and match on it.
const bodySchema = z.string().max(MAX_VERSE_LENGTH);

const createSchema = z.object({ body: bodySchema });
const saveSchema = z.object({ id: z.uuid(), body: bodySchema });
const deleteSchema = z.object({ id: z.uuid() });

export async function createVerseNote(input: { body: string }): Promise<Verse> {
  const userId = await requireUserId();
  const { body } = createSchema.parse(input);

  const verse = await createNotebookVerse({ userId, body });

  revalidatePath("/notebook");
  return verse;
}

export async function saveVerseNote(input: {
  id: string;
  body: string;
}): Promise<Verse> {
  const userId = await requireUserId();
  const { id, body } = saveSchema.parse(input);

  const verse = await updateNotebookVerse({ id, userId, body });
  // Somebody else's verse, a daily verse, or one that has been deleted. All
  // three read the same from here, which is the point.
  if (!verse) throw new Error("That verse is not in your notebook.");

  return verse;
}

export async function deleteVerseNote(input: { id: string }): Promise<void> {
  const userId = await requireUserId();
  const { id } = deleteSchema.parse(input);

  const deleted = await deleteNotebookVerse({ id, userId });
  if (!deleted) throw new Error("That verse is not in your notebook.");

  revalidatePath("/notebook");
}
