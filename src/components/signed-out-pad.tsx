"use client";

import { SignUpButton } from "@clerk/nextjs";

import { AuthButtons } from "@/components/auth-buttons";
import { BarMeter } from "@/components/bar-meter";
import { BAR_TARGET } from "@/lib/bars";

// What stands in for the pad before there's an account to save a verse to.
// It looks like the real thing and reads the same, but the first click on it
// opens sign-up rather than a cursor - the one place this app asks a visitor
// to make an account.
export function SignedOutPad() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <BarMeter barCount={0} />
        <span className="text-muted-foreground text-xs font-medium">
          Sign up to write and save your verse
        </span>
      </div>

      <SignUpButton mode="modal">
        <button
          type="button"
          aria-label="Write your verse"
          className="border-input hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-64 w-full cursor-text flex-col items-start rounded-md border bg-transparent px-3 py-2 text-left shadow-xs transition-[color,box-shadow,border-color] outline-none focus-visible:ring-[3px] sm:min-h-80"
        >
          <span className="text-muted-foreground font-mono text-base leading-relaxed md:text-sm">
            Bar one goes here.
          </span>
        </button>
      </SignUpButton>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground font-mono text-sm">
          0 / {BAR_TARGET} bars
        </span>
        <AuthButtons />
      </div>
    </div>
  );
}
