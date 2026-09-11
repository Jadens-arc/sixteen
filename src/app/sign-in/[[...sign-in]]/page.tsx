import { SignIn } from "@clerk/nextjs";

import { AuthNotConfigured, AuthPanel } from "@/components/auth-panel";
import { privatePageMetadata } from "@/lib/metadata";

// Rendering <SignIn /> outside a <ClerkProvider> throws - and the layout only
// mounts the provider once a publishable key exists (see layout.tsx).
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const metadata = privatePageMetadata("Sign in");

export default function SignInPage() {
  return (
    <AuthPanel>
      {clerkEnabled ? <SignIn fallbackRedirectUrl="/" /> : <AuthNotConfigured />}
    </AuthPanel>
  );
}
