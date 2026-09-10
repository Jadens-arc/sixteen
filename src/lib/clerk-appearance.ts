import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/*
 * Clerk renders its cards, menus and modals from its own stylesheet, so
 * nothing in globals.css reaches them - left alone they show up as a bright
 * white card in the middle of a dark page. This carries the app's tokens
 * across: the same near-black ground, the one amber accent, Geist, and the
 * same radius.
 *
 * Clerk's colour parser takes hex and rgb, not oklch, so each token below is
 * the sRGB equivalent of its counterpart in globals.css. They have to be
 * converted by hand, so a token that changes there has to change here too.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "#f7a224", // --primary, the VU-meter amber
    colorPrimaryForeground: "#130c05", // --primary-foreground
    // --card rather than --background: a Clerk card sits on the page the way
    // a <Card> does, one shade up from the ground behind it.
    colorBackground: "#121212",
    colorForeground: "#eeeeee", // --foreground
    colorMuted: "#1b1b1b", // --muted
    colorMutedForeground: "#8f8f8f", // --muted-foreground
    colorInput: "#1b1b1b",
    colorInputForeground: "#eeeeee",
    // Everything Clerk tints itself - hovers, dividers, disabled states -
    // comes off this. Dark themes shade up from white.
    colorNeutral: "white",
    colorBorder: "rgba(255, 255, 255, 0.12)", // --border
    // Clerk renders the ring and the backdrop at its own opacity, so both are
    // the solid colour: --ring's amber, and --background for the backdrop.
    colorRing: "#f7a224",
    colorModalBackdrop: "#090909",
    colorShadow: "#000000",
    colorDanger: "#ea3c3f", // --destructive
    fontFamily: "var(--font-geist-sans)",
    fontFamilyButtons: "var(--font-geist-sans)",
    fontSize: "0.875rem", // text-sm, what the rest of the app reads at
    borderRadius: "0.5rem", // --radius
  },
  elements: {
    // The app labels a field the way it labels anything else - small, mono,
    // uppercase (see the word bank and the hard-mode meta in prompt-card).
    // Tailwind's utilities sit in a cascade layer and Clerk's styles do not,
    // so these only land as important.
    formFieldLabel: "font-mono! text-xs! tracking-wide! uppercase!",
    dividerText: "font-mono! text-xs! tracking-wide! uppercase!",
  },
};
