"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getVaultStatus, type VaultStatus } from "@/actions/vault";
import { countBars } from "@/lib/bars";

import {
  deriveWrappingKey,
  importDataKey,
  openUserSealed,
  sealWithUserKey,
  unwrapDataKey,
} from "./client";

/**
 * Where the key lives while somebody is using the app.
 *
 * In memory for the session, and - if they ask to stay unlocked on this
 * device - in IndexedDB as a non-extractable CryptoKey. Non-extractable is
 * the point of storing it that way: script running on the page can ask the
 * browser to decrypt with the key, but cannot read the key out to use
 * somewhere else later. It is a meaningful difference under XSS, and it is
 * the best a browser can offer short of asking for the passphrase every time.
 *
 * Nothing here ever sends a key, a passphrase or a recovery code anywhere.
 * The only things that cross to the server are ciphertext and the wrapped
 * key, which is ciphertext too.
 */

const DB_NAME = "sixteen-vault";
const STORE = "keys";
const RECORD_ID = "data-key";

interface StoredKey {
  id: string;
  userId: string;
  keyId: string;
  key: CryptoKey;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Every one of these is best-effort. A browser in private mode, with storage
// blocked, or simply out of quota must not stop somebody writing - it only
// means they will be asked for the passphrase again next time.
async function rememberKey(record: StoredKey): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  } catch {
    // Nothing to do and nothing to tell anyone: the key is still in memory.
  }
}

async function recallKey(): Promise<StoredKey | null> {
  try {
    const database = await openDatabase();
    const record = await new Promise<StoredKey | undefined>((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(RECORD_ID);
      request.onsuccess = () => resolve(request.result as StoredKey | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return record ?? null;
  } catch {
    return null;
  }
}

async function forgetKey(): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(RECORD_ID);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  } catch {
    // As above.
  }
}

export type VaultPhase =
  /** Still asking the server whether this account has a passphrase. */
  | "loading"
  /** No passphrase. Verses are sealed server-side, and everything works as before. */
  | "off"
  /** A passphrase is set and this browser does not hold the key. */
  | "locked"
  /** A passphrase is set and this browser can read and write verses. */
  | "unlocked";

export interface SavePayload {
  body: string;
  barCount?: number;
}

interface VaultApi {
  phase: VaultPhase;
  status: VaultStatus | null;
  /** True while the account is being converted back to server-readable verses. */
  unsealing: boolean;
  unlock: (secret: string, options?: { recovery?: boolean; remember?: boolean }) => Promise<void>;
  lock: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Adopts a key this browser just generated, without a round trip to unlock. */
  adoptKey: (raw: Uint8Array, keyId: string, remember: boolean) => Promise<void>;
  /** Turns writing into what should be stored, in whichever mode the account is in. */
  toSaved: (body: string) => Promise<SavePayload>;
  /** Turns a stored body into writing. Plaintext passes through untouched. */
  toWriting: (stored: string) => Promise<string>;
  /**
   * Seal and open with the held key, whatever the account's recorded state
   * says. The conversions in the settings page need these: while sealing an
   * account for the first time, the key is in hand a moment before the server
   * has been told about it, and toSaved() would still be writing plaintext.
   */
  sealNow: (body: string) => Promise<string>;
  openNow: (stored: string) => Promise<string>;
}

const VaultContext = createContext<VaultApi | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [phase, setPhase] = useState<VaultPhase>("loading");

  // The key is held in a ref, not in state: it must not be a render
  // dependency, and it must never end up serialized into anything.
  const key = useRef<{ key: CryptoKey; keyId: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      setPhase("off");
      return;
    }

    let next: VaultStatus;
    try {
      next = await getVaultStatus();
    } catch {
      // A setup problem, not a locked notebook. The pages have their own
      // notice for it; treating it as "off" here would invite plaintext
      // writes into an account that may well be locked, so stay loading.
      setPhase("loading");
      return;
    }

    setStatus(next);

    if (!next.locked) {
      key.current = null;
      setPhase("off");
      return;
    }

    // A held key is only this account's key if the record still names it.
    // Enabling adopts the key a moment before the server is told about it, so
    // a failure in between can leave a key here that the account never
    // recorded - and sealing verses with it would put them beyond the reach of
    // the passphrase that is supposed to open them.
    if (key.current) {
      if (key.current.keyId === next.dataKeyId) {
        setPhase("unlocked");
        return;
      }
      key.current = null;
      await forgetKey();
    }

    const remembered = await recallKey();
    if (remembered && remembered.userId === userId && remembered.keyId === next.dataKeyId) {
      key.current = { key: remembered.key, keyId: remembered.keyId };
      setPhase("unlocked");
      return;
    }

    // A remembered key for a different account, or for a data key this
    // account has replaced, is not a key - drop it rather than failing every
    // verse with it.
    if (remembered) await forgetKey();
    setPhase("locked");
  }, [userId]);

  useEffect(() => {
    if (isLoaded) void refresh();
  }, [isLoaded, refresh]);

  const unlock = useCallback(
    async (secret: string, options?: { recovery?: boolean; remember?: boolean }) => {
      if (!userId) throw new Error("Sign in first.");

      const current = status ?? (await getVaultStatus());
      if (!current.locked || !current.salt || !current.recoverySalt) {
        throw new Error("This account does not have a passphrase set.");
      }

      const recovery = options?.recovery ?? false;
      const wrapping = await deriveWrappingKey(
        secret,
        recovery ? current.recoverySalt : current.salt,
        current.iterations ?? undefined,
      );

      const raw = await unwrapDataKey(
        recovery ? current.wrappedByRecovery! : current.wrappedByPassphrase!,
        wrapping,
        userId,
      );

      const imported = await importDataKey(raw);
      key.current = { key: imported, keyId: current.dataKeyId! };
      raw.fill(0);

      if (options?.remember ?? true) {
        await rememberKey({
          id: RECORD_ID,
          userId,
          keyId: current.dataKeyId!,
          key: imported,
        });
      }

      setStatus(current);
      setPhase("unlocked");
    },
    [status, userId],
  );

  const adoptKey = useCallback(
    async (raw: Uint8Array, keyId: string, remember: boolean) => {
      if (!userId) throw new Error("Sign in first.");

      const imported = await importDataKey(raw);
      key.current = { key: imported, keyId };
      if (remember) {
        await rememberKey({ id: RECORD_ID, userId, keyId, key: imported });
      }
      setPhase("unlocked");
    },
    [userId],
  );

  const lock = useCallback(async () => {
    key.current = null;
    await forgetKey();
    setPhase(status?.locked ? "locked" : "off");
  }, [status]);

  const toSaved = useCallback(
    async (body: string): Promise<SavePayload> => {
      // Unsealing accounts write in the clear on purpose: that is the whole
      // direction of travel, and the server allows it only in that state.
      if (!status?.locked || status.state === "unsealing") return { body };

      const held = key.current;
      if (!held || !userId) {
        throw new Error("Your notebook is locked. Unlock it to keep writing.");
      }

      return {
        body: await sealWithUserKey(body, held.key, held.keyId, userId),
        // Counted here because it is the last place the writing exists as
        // writing. The server stores the number and never sees the bars.
        barCount: countBars(body),
      };
    },
    [status, userId],
  );

  const toWriting = useCallback(
    async (stored: string): Promise<string> => {
      const held = key.current;
      if (!held || !userId) return stored;
      return openUserSealed(stored, held.key, userId);
    },
    [userId],
  );

  const held = useCallback((): { key: CryptoKey; keyId: string } & { userId: string } => {
    if (!key.current || !userId) {
      throw new Error("Your notebook is locked. Unlock it to continue.");
    }
    return { ...key.current, userId };
  }, [userId]);

  const sealNow = useCallback(
    async (body: string) => {
      const { key: cryptoKey, keyId, userId: owner } = held();
      return sealWithUserKey(body, cryptoKey, keyId, owner);
    },
    [held],
  );

  const openNow = useCallback(
    async (stored: string) => {
      const { key: cryptoKey, userId: owner } = held();
      return openUserSealed(stored, cryptoKey, owner);
    },
    [held],
  );

  const api = useMemo<VaultApi>(
    () => ({
      phase,
      status,
      unsealing: status?.state === "unsealing",
      unlock,
      lock,
      refresh,
      adoptKey,
      toSaved,
      toWriting,
      sealNow,
      openNow,
    }),
    [phase, status, unlock, lock, refresh, adoptKey, toSaved, toWriting, sealNow, openNow],
  );

  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultApi {
  const api = useContext(VaultContext);
  if (!api) throw new Error("useVault() needs a <VaultProvider> above it.");
  return api;
}

/**
 * The vault for an app with no Clerk keys configured, where there is nobody to
 * hold a key for. It reports "off" and passes bodies through untouched, which
 * matches what the rest of a keyless deployment does: render a setup notice and
 * store nothing.
 *
 * A separate provider rather than a fallback inside useVault(), because a
 * missing provider should stay an error. Defaulting to "off" on absence is how
 * a locked account would quietly start writing its verses in the clear.
 */
export function VaultOffProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo<VaultApi>(
    () => ({
      phase: "off",
      status: null,
      unsealing: false,
      unlock: async () => {
        throw new Error("Authentication is not configured.");
      },
      lock: async () => {},
      refresh: async () => {},
      adoptKey: async () => {
        throw new Error("Authentication is not configured.");
      },
      toSaved: async (body: string) => ({ body }),
      toWriting: async (stored: string) => stored,
      sealNow: async () => {
        throw new Error("Authentication is not configured.");
      },
      openNow: async () => {
        throw new Error("Authentication is not configured.");
      },
    }),
    [],
  );

  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>;
}
