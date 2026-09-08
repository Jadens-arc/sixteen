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

export const db = new Proxy({} as NeonHttpDatabase<Schema>, {
  get(_target, prop, receiver) {
    if (!instance) {
      instance = createClient();
    }
    return Reflect.get(instance, prop, receiver);
  },
});
