import { auth } from "@clerk/nextjs/server";

// Null for a signed-out visitor - the home page renders for them, minus
// anything of theirs. This still throws when Clerk itself is misconfigured
// (auth() needs clerkMiddleware() to have run), so a broken setup surfaces as
// a setup notice rather than as a silently signed-out app.
export async function getUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export async function requireUserId(): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new Error("Unauthenticated");
  return userId;
}
