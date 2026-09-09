import { cloneElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { openSignIn, openSignUp } = vi.hoisted(() => ({
  openSignIn: vi.fn(),
  openSignUp: vi.fn(),
}));

// Stands in for Clerk's buttons, which clone their single child and hang the
// open-modal handler off it. Same shape, so a click here lands where a click
// on the real thing would.
type Wrapped = { children: ReactElement<{ onClick?: () => void }> };

vi.mock("@clerk/nextjs", () => ({
  SignInButton: ({ children }: Wrapped) =>
    cloneElement(children, { onClick: openSignIn }),
  SignUpButton: ({ children }: Wrapped) =>
    cloneElement(children, { onClick: openSignUp }),
}));

const { SignedOutPad } = await import("@/components/signed-out-pad");

describe("SignedOutPad", () => {
  it("shows an empty pad", () => {
    render(<SignedOutPad />);

    expect(screen.getByText("0 / 16 bars")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("bar-segment").every((s) => s.dataset.filled === "false"),
    ).toBe(true);
  });

  it("opens sign-up when the pad itself is clicked", async () => {
    const user = userEvent.setup();
    render(<SignedOutPad />);

    await user.click(screen.getByRole("button", { name: /write your verse/i }));

    expect(openSignUp).toHaveBeenCalled();
    expect(openSignIn).not.toHaveBeenCalled();
  });

  it("offers both sign in and sign up", async () => {
    const user = userEvent.setup();
    render(<SignedOutPad />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(openSignIn).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(openSignUp).toHaveBeenCalled();
  });
});
