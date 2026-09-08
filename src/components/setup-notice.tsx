import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Matches the SCREAMING_SNAKE name in an error like "DATABASE_URL is not
// set. Add it to your environment...", so the card can name the variable
// without hardcoding which one went missing.
function envVarNamedIn(message: string): string | null {
  return message.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/)?.[0] ?? null;
}

// Driver errors can carry the connection string, so only the matched
// variable name reaches the browser. The full error goes to the server log.
export function SetupNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Page could not load:", error);

  const envVar = envVarNamedIn(message);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Not set up yet</CardTitle>
          <CardDescription>
            {envVar
              ? `Set ${envVar} in your environment, then reload.`
              : "Something this page depends on is not configured. Check the server logs for details."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            The README lists every variable this app needs.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
