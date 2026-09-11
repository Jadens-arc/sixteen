import { MAX_SEALED_LENGTH, MAX_VERSE_LENGTH } from "@/lib/bars";
import { isSealed, isUserSealed } from "@/lib/crypto/envelope";
import { getUserKey } from "@/lib/db/vault";
import type { BodyInput } from "@/lib/db/queries";

/**
 * Decides what one incoming save is allowed to be.
 *
 * A server action is a public endpoint, so this is not a formality. The rules
 * exist because the two modes must not bleed into each other:
 *
 *   - An account with no passphrase may not send sealed bodies. Accepting one
 *     would store a verse nothing can ever open, since no key exists for it.
 *   - An account with a passphrase may not send plaintext. That would be the
 *     browser quietly leaking the writing the passphrase was turned on to
 *     protect - a client bug that looks like a working save.
 *
 * The exception is an account midway through unsealing, which is allowed both:
 * that is exactly the state where the browser is turning sealed verses back
 * into readable ones, one at a time.
 */
export async function resolveBodyInput(
  userId: string,
  input: { body: string; barCount?: number },
): Promise<BodyInput> {
  const record = await getUserKey(userId);
  const sealed = isUserSealed(input.body);

  // Rejected ahead of the mode checks: a v1 envelope arriving from a browser
  // is never right in any mode, and neither is a format from the future.
  if (!sealed && isSealed(input.body)) {
    throw new Error("That verse arrived in a form this app does not accept from a browser.");
  }

  if (!record) {
    if (sealed) {
      throw new Error(
        "This account has no passphrase set, so a sealed verse could never be " +
          "opened again. Nothing was saved.",
      );
    }
    if (input.body.length > MAX_VERSE_LENGTH) {
      throw new Error("That verse is too long.");
    }
    return { sealed: false, body: input.body };
  }

  if (sealed) {
    if (input.body.length > MAX_SEALED_LENGTH) {
      throw new Error("That verse is too long.");
    }
    if (input.barCount === undefined) {
      throw new Error(
        "A sealed verse has to carry its own bar count - the server cannot read it.",
      );
    }
    return { sealed: true, body: input.body, barCount: input.barCount };
  }

  // Plaintext from here down. An empty body is the one plaintext an active
  // vault may write: there is nothing in it to protect, and the notebook
  // leans on an emptied verse still reading as empty.
  if (record.state === "active" && input.body.length > 0) {
    throw new Error(
      "Your notebook is locked, so this verse should have been sealed before " +
        "it was sent. Nothing was saved. Reload the page and unlock it.",
    );
  }

  if (input.body.length > MAX_VERSE_LENGTH) {
    throw new Error("That verse is too long.");
  }

  return { sealed: false, body: input.body };
}
