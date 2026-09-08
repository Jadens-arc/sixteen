import { NextResponse } from "next/server";

import { getOrCreateTodayPrompt } from "@/lib/db/queries";

// Vercel Cron only sends GET. This route stays public in middleware (Vercel
// Cron carries no Clerk session) and relies entirely on the bearer check
// below - which is why an unset CRON_SECRET must fail closed in production.
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (secret) {
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 401 },
    );
  }

  const prompt = await getOrCreateTodayPrompt();
  return NextResponse.json({ ok: true, promptDate: prompt.promptDate });
}
