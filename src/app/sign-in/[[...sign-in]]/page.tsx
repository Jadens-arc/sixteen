import { SignIn } from "@clerk/nextjs";

// Rendering <SignIn /> outside a <ClerkProvider> throws - and the layout only
// mounts the provider once a publishable key exists (see layout.tsx).
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center p-6">
      {clerkEnabled ? (
        <SignIn fallbackRedirectUrl="/" />
      ) : (
        <p className="text-muted-foreground text-sm">
          Auth is not configured yet.
        </p>
      )}
    </div>
  );
}
