import { SignUp } from "@clerk/nextjs";

import { AuthNotConfigured, AuthPanel } from "@/components/auth-panel";
import { privatePageMetadata } from "@/lib/metadata";

// Rendering <SignUp /> outside a <ClerkProvider> throws - and the layout only
// mounts the provider once a publishable key exists (see layout.tsx).
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export const metadata = privatePageMetadata("Sign up");

export default function SignUpPage() {
  return (
    <AuthPanel>
      {clerkEnabled ? <SignUp fallbackRedirectUrl="/" /> : <AuthNotConfigured />}
    </AuthPanel>
  );
}
