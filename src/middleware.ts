import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/cron(.*)",
]);

// clerkMiddleware() throws on every request, before our handler runs, when no
// publishable key is configured. A first Vercel deploy has no keys yet (they
// go in the dashboard after the build succeeds), so that would 500 every
// route, including the cron endpoint. Fall through untouched until keys land.
const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (isPublicRoute(req)) return;
      // Without an explicit destination, a signed-out visitor gets rewritten to
      // a 404 rather than sent to the sign-in page this app ships.
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
      });
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
