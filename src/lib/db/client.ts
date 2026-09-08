import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

type Schema = typeof schema;

let instance: NeonHttpDatabase<Schema> | undefined;

function createClient(): NeonHttpDatabase<Schema> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your environment (see .env.example) before accessing the database.",
    );
  }
  return drizzle(neon(url), { schema });
}

// Importing this module must not read the environment, so the real client is
// built on first property access. Methods are bound to that client rather than
// to the proxy, so drizzle's internals never see a stand-in for `this`.
export const db = new Proxy({} as NeonHttpDatabase<Schema>, {
  get(_target, prop) {
    instance ??= createClient();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
