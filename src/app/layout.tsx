import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sixteen",
  description: "One prompt a day. Sixteen bars against the clock.",
};

// Clerk's provider and components render nothing useful without a publishable
// key. A first Vercel deploy has no env vars yet (they're added in the
// dashboard after the build succeeds), so this must degrade to a plain shell
// rather than crash the build or the page.
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function Header() {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-widest uppercase"
        >
          Sixteen
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Today
          </Link>
          <Link
            href="/archive"
            className="text-muted-foreground hover:text-foreground"
          >
            Archive
          </Link>
        </nav>
      </div>
      {clerkEnabled ? (
        <>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal" />
          </SignedOut>
        </>
      ) : (
        <span className="text-muted-foreground text-xs">
          auth not configured
        </span>
      )}
    </header>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!clerkEnabled) {
    return <Shell>{children}</Shell>;
  }

  // Without these, Clerk sends signed-out visitors to its hosted Account
  // Portal at accounts.<domain> instead of the sign-in page this app ships.
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <Shell>{children}</Shell>
    </ClerkProvider>
  );
}
