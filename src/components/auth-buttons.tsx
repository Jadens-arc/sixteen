"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

// The pair a signed-out visitor sees wherever a signed-in one would see their
// avatar. Modal mode keeps them on the page they're reading - the point of
// letting them read it signed out in the first place.
export function AuthButtons({ size = "sm" }: { size?: "sm" | "default" }) {
  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal">
        <Button variant="ghost" size={size}>
          Sign in
        </Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button size={size}>Sign up</Button>
      </SignUpButton>
    </div>
  );
}
