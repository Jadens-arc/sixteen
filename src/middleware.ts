import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

// "/" is public so anyone can read the day's prompt without an account; the
// sign-up prompt comes when they click the pad to write. Note that a server
// action posts back to the page it was called from, so this also stops the
// middleware from guarding the actions in src/actions/verse.ts - each of those
// calls requireUserId() itself, which is what actually keeps a verse private.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/cron(.*)",
]);

// clerkMiddleware() throws on every request, before our handler runs, when no
// publishable key is configured. A first Vercel deploy has no keys yet (they
// go in the dashboard after the build succeeds), so that would 500 every
// route, including the cron endpoint. Fall through untouched until keys land.
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Stepping aside leaves every route unauthenticated. Outside production that
// is the intended bootstrap state; in production it must never be reachable by
// accident - a key removed from the dashboard, or a deploy that predates one
// being added, would otherwise silently turn the whole app public. Nothing can
// actually read or write a verse in that state (requireUserId() throws once
// clerkMiddleware() hasn't run), but that is Clerk erroring rather than this
// app refusing, so refuse here explicitly.
function unconfigured(request: NextRequest): NextResponse {
  if (isPublicRoute(request)) return NextResponse.next();

  return new NextResponse(
    "Authentication is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, then redeploy.",
    { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export default clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (isPublicRoute(req)) return;
      // Without an explicit destination, a signed-out visitor gets rewritten to
      // a 404 rather than sent to the sign-in page this app ships.
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
      });
    })
  : process.env.NODE_ENV === "production"
    ? unconfigured
    : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
