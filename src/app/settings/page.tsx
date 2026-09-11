import { VaultSettings } from "@/components/vault-settings";
import { privatePageMetadata } from "@/lib/metadata";

// Nothing on this page is rendered from the database - the settings component
// asks for the account's state itself - but it is still a per-person page and
// must never be prerendered into a shared build output.
export const dynamic = "force-dynamic";

export const metadata = privatePageMetadata("Settings");

export default function SettingsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <h1 className="font-mono text-lg font-semibold">Settings</h1>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Privacy</h2>
        <p className="text-muted-foreground text-sm">
          Every verse here is encrypted in the database whether or not you do
          anything on this page. What a passphrase changes is who holds the key.
        </p>
      </div>

      <VaultSettings />
    </main>
  );
}
