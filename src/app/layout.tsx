import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";

import { AuthButtons } from "@/components/auth-buttons";
import { JsonLd } from "@/components/json-ld";
import { Toaster } from "@/components/ui/sonner";
import { clerkAppearance } from "@/lib/clerk-appearance";
import {
  siteDescription,
  siteKeywords,
  siteName,
  siteTagline,
  siteUrl,
  twitterHandle,
} from "@/lib/site";
import { siteGraph } from "@/lib/structured-data";
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
  // Everything relative below (canonicals, the OG image, the manifest) is
  // resolved against this, and Open Graph tags are invalid unless absolute.
  metadataBase: new URL(siteUrl),
  title: {
    // What a search result shows: what the thing is, then the brand. The
    // template keeps every other page's title in the same shape without
    // repeating the suffix by hand.
    default: `Sixteen - A free daily rap writing prompt, 16 bars at a time`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [...siteKeywords],
  applicationName: siteName,
  category: "education",
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    locale: "en_US",
    title: `Sixteen - A free daily rap writing prompt`,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `Sixteen - A free daily rap writing prompt`,
    description: siteDescription,
    ...(twitterHandle ? { creator: twitterHandle, site: twitterHandle } : {}),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Without these three, Google truncates the snippet and shows a
      // thumbnail-sized image. They are the difference between a listing that
      // answers the query in place and one that doesn't.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  // Phone numbers and dates get auto-linked by iOS otherwise, which mangles
  // bars that happen to look like one.
  formatDetection: { telephone: false, date: false, address: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  // The app is dark regardless of system preference (see globals.css), so the
  // browser chrome should be told once rather than guess from the first paint.
  themeColor: "#0d0d0d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

// Clerk's provider and components render nothing useful without a publishable
// key. A first Vercel deploy has no env vars yet (they're added in the
// dashboard after the build succeeds), so this must degrade to a plain shell
// rather than crash the build or the page.
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const signedInLinks = (
  <>
    <Link href="/archive" className="text-muted-foreground hover:text-foreground">
      Archive
    </Link>
    <Link href="/notebook" className="text-muted-foreground hover:text-foreground">
      Notebook
    </Link>
  </>
);

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
        <nav aria-label="Main" className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Today
          </Link>
          {/* The archive and the notebook hold a visitor's own verses, so
              they stay behind sign-in. Linking them while signed out would
              only bounce them to the sign-in page, which is what reading the
              day's prompt without an account is meant to avoid. */}
          {clerkEnabled ? <SignedIn>{signedInLinks}</SignedIn> : signedInLinks}
        </nav>
      </div>
      {clerkEnabled ? (
        <>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          {/* Where the avatar sits once there is one. */}
          <SignedOut>
            <AuthButtons />
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

// The home page only renders "How it works" and the FAQ while signed out, so
// these anchors only resolve while signed out. Signed in, the same row points
// at the two pages that actually hold something of yours.
const signedOutFooterLinks = (
  <>
    <Link href="/#how-it-works" className="hover:text-foreground">
      How it works
    </Link>
    <Link href="/#faq" className="hover:text-foreground">
      FAQ
    </Link>
  </>
);

const signedInFooterLinks = (
  <>
    <Link href="/archive" className="hover:text-foreground">
      Archive
    </Link>
    <Link href="/notebook" className="hover:text-foreground">
      Notebook
    </Link>
  </>
);

function Footer() {
  return (
    <footer className="text-muted-foreground mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-10 text-xs sm:px-8">
      <p>
        <strong className="text-foreground font-semibold">Sixteen</strong> -{" "}
        {siteTagline} A free daily rap writing prompt with a concept, a rhyme
        scheme, a pocket, constraints and a word bank.
      </p>
      <nav aria-label="Footer" className="flex flex-wrap gap-4">
        <Link href="/" className="hover:text-foreground">
          Today&rsquo;s prompt
        </Link>
        {clerkEnabled ? (
          <>
            <SignedIn>{signedInFooterLinks}</SignedIn>
            <SignedOut>{signedOutFooterLinks}</SignedOut>
          </>
        ) : (
          signedOutFooterLinks
        )}
      </nav>
    </footer>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        {children}
        <Footer />
        <Toaster />
        <JsonLd data={siteGraph()} />
        <Analytics />
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
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <Shell>{children}</Shell>
    </ClerkProvider>
  );
}
