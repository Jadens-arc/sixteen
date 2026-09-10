import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The frame around Clerk's own sign-in and sign-up cards. Clerk draws the
// card itself (themed in lib/clerk-appearance.ts) and titles it with the app
// name, so this only adds the line that says what someone is signing up to
// do - and centres the card on the dark page instead of pinning it top-left.
export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-md flex-col items-center justify-center gap-6 p-6">
      <p className="text-muted-foreground text-center text-sm text-balance">
        One prompt a day. Sixteen bars against the clock.
      </p>
      {children}
    </main>
  );
}

// Same shape as the setup notice a missing DATABASE_URL gets, so a half-set-up
// deploy reads the same wherever someone lands in it.
export function AuthNotConfigured() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Auth is not set up yet</CardTitle>
        <CardDescription>
          Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment, then
          reload.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
