import { execFileSync } from "node:child_process";

/**
 * Applies any pending drizzle/ migrations, then lets the build proceed.
 *
 * Wired into `vercel-build` because the alternative - remembering to run
 * `npm run db:migrate` by hand on the deploys that happen to carry a new
 * migration - is the kind of step that gets skipped. When it is skipped the
 * code ships against a schema that doesn't match it, and the failure lands on
 * whoever uses the feature rather than on the deploy.
 *
 * A missing DATABASE_URL is not an error here. The README's first deploy is a
 * bare import with no environment variables set, and that build is supposed to
 * succeed; there is simply no database to migrate yet.
 */
if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set - skipping migrations.");
  process.exit(0);
}

console.log("Applying pending migrations to DATABASE_URL...");
execFileSync("node_modules/.bin/drizzle-kit", ["migrate"], { stdio: "inherit" });
