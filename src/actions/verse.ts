"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BAR_TARGET, MAX_SEALED_LENGTH, MAX_VERSE_LENGTH, countBars } from "@/lib/bars";
import { requireUserId } from "@/lib/auth";
import { getVerseForPrompt, upsertVerse, type VerseView } from "@/lib/db/queries";
import { resolveBodyInput } from "@/lib/vault-policy";

// A server action is a public HTTP endpoint, and its argument types are erased
// at runtime - nothing stops a caller from posting a 5 MB body or a promptId
// that isn't a uuid. Parse at the boundary instead of trusting the signature.
//
// The cap here is the sealed one because a sealed body is bigger than the
// writing it carries; resolveBodyInput() applies the tighter plaintext cap to
// anything that arrives readable.
const saveVerseSchema = z.object({
  promptId: z.uuid(),
  body: z.string().max(MAX_SEALED_LENGTH),
  // Sent only by a browser holding a passphrase, which is the only place a
  // sealed verse can be counted.
  barCount: z.number().int().min(0).max(MAX_VERSE_LENGTH).optional(),
});

const completeVerseSchema = z.object({
  promptId: z.uuid(),
});

export async function saveVerse(input: {
  promptId: string;
  body: string;
  barCount?: number;
}): Promise<VerseView> {
  const userId = await requireUserId();
  const { promptId, body, barCount } = saveVerseSchema.parse(input);

  return upsertVerse({
    promptId,
    userId,
    body: await resolveBodyInput(userId, { body, barCount }),
  });
}

export async function completeVerse(input: { promptId: string }): Promise<VerseView> {
  const userId = await requireUserId();
  const { promptId } = completeVerseSchema.parse(input);

  const existing = await getVerseForPrompt(promptId, userId);

  // A sealed verse cannot be counted here, so the count stored alongside it -
  // written by the browser that could read it - is what the gate reads. That
  // makes the sixteen-bar minimum advisory for a locked notebook rather than
  // enforced, which is the honest cost of the server not being able to look.
  const barCount = existing?.sealed ? existing.barCount : countBars(existing?.body ?? "");

  if (barCount < BAR_TARGET) {
    throw new Error(`A verse needs at least ${BAR_TARGET} bars to complete.`);
  }

  const verse = await upsertVerse({
    promptId,
    userId,
    // Stored exactly as it already is. Re-sending the body it came with keeps
    // completing a verse from being a way to rewrite one.
    body: existing?.sealed
      ? { sealed: true, body: existing.body, barCount: existing.barCount }
      : { sealed: false, body: existing?.body ?? "" },
    completed: true,
  });

  revalidatePath("/");
  revalidatePath("/archive");
  return verse;
}
