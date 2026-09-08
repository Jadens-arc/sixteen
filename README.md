# Sixteen

A daily writing-prompt app for a rapper. Every morning it serves one
generated prompt for a 16-bar verse - a concept, a scenario to write from,
a rhyme scheme, a pocket (flow/tempo), a handful of constraints, and a word
bank - and gives a pad to write the verse against it, with a bar counter and
autosave. Past prompts and verses live in an archive, alongside a streak of
consecutive days completed.

The prompt is shared by everyone who uses the app (one per calendar day,
Wordle-style); each signed-in user keeps their own verse against it.

## Stack

- Next.js 15 (App Router) and React 19, TypeScript in strict mode
- Tailwind CSS v4 and shadcn/ui (new-york style)
- Neon Postgres via `@neondatabase/serverless`, with Drizzle ORM
- Clerk for authentication
- Vitest, @testing-library/react and jsdom for tests

## The AI provider abstraction

Prompts come from `generateDailyPrompt()` in `src/lib/ai/index.ts`, which
resolves a provider from environment variables, asks it for a prompt,
validates the result against a zod schema, and falls back to a deterministic
offline generator on any failure - a missing key, a timeout, an API error, a
malformed response. The app never shows an empty morning.

```ts
// src/lib/ai/types.ts
export interface PromptProvider {
  readonly id: string;
  readonly model?: string;
  generate(input: { date: string; recentConcepts: string[] }): Promise<GeneratedPrompt>;
}
```

Three providers implement it, in `src/lib/ai/providers/`:

- **offline** - zero network calls. Composes a prompt from curated arrays of
  concepts, scenarios, constraints and word-bank terms using a PRNG seeded by
  the date string, so the same date always produces the same prompt. This is
  the default when no provider is configured, and the guaranteed fallback
  otherwise.
- **anthropic** - calls the Messages API directly with `fetch`.
- **openai** - calls the Chat Completions API directly with `fetch`. Because
  it only needs a base URL and an API key, it also works against any
  OpenAI-compatible endpoint: Ollama, LM Studio, Groq, and so on.

Neither API provider pulls in a vendor SDK - swapping providers, or pointing
at a self-hosted model, is an environment-variable change, not a dependency
change. To add a new provider: implement `PromptProvider` in
`src/lib/ai/providers/`, register its id in `resolveProvider()`
(`src/lib/ai/index.ts`), and add it to the `AI_PROVIDER` values below.

`buildPromptMessages()` in `src/lib/ai/prompt-request.ts` holds the shared
system/user instructions so both API providers ask for the same thing. The
last ~14 concepts are passed in as `recentConcepts` so the model avoids
repeating itself.

## Environment variables

See `.env.example` for the same list with inline comments.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres connection string (pooled). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key. Without it, the app builds and boots in a keyless state: no sign-in, no `<ClerkProvider>`, and pages that need a signed-in user render a setup notice. |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | No | Defaults to `/sign-in`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | No | Defaults to `/sign-up`. |
| `APP_TIMEZONE` | No | IANA timezone used to resolve "today" for the daily prompt. Defaults to `America/New_York`. |
| `AI_PROVIDER` | No | `anthropic`, `openai`, or `offline`. Defaults to `offline`. |
| `AI_API_KEY` | Only for `anthropic`/`openai` | API key for the selected provider. |
| `AI_MODEL` | No | Model id. Each provider has a sane default when unset. |
| `AI_BASE_URL` | No | `openai` provider only. Defaults to `https://api.openai.com/v1`; point it at any OpenAI-compatible server instead. |
| `CRON_SECRET` | Recommended | Bearer token the cron route requires. If unset, the guard is skipped in development but the route rejects every request in production. |

Nothing here is required for `npm run build` to succeed - the app is meant
to deploy to Vercel before any of these are set, then have them added in the
dashboard afterward. `/` and `/archive` are `force-dynamic` so they're never
prerendered at build time, and a missing `DATABASE_URL` (or any other setup
problem) surfaces as an in-app notice at request time instead of a stack
trace.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and the Clerk keys, at least
npm run db:generate          # only after changing src/lib/db/schema.ts
npm run db:migrate           # applies drizzle/ migrations to DATABASE_URL
npm run dev
```

Other scripts:

```bash
npm test          # vitest run - no DATABASE_URL or Clerk keys needed
npm run test:watch
npm run build
npm run lint
```

Schema changes go in `src/lib/db/schema.ts`. Run `npm run db:generate` to
produce a new file under `drizzle/`, review it, then `npm run db:migrate` to
apply it.

## The daily cron

`src/app/api/cron/daily-prompt/route.ts` is a `GET` endpoint that calls
`getOrCreateTodayPrompt()`, which generates and inserts today's prompt if one
doesn't exist yet. It's public in `src/middleware.ts` (Vercel Cron sends no
Clerk session) and guarded instead by an `Authorization: Bearer <CRON_SECRET>`
header check.

`vercel.json` schedules it:

```json
{ "crons": [{ "path": "/api/cron/daily-prompt", "schedule": "0 10 * * *" }] }
```

Vercel cron schedules run in UTC. `0 10 * * *` is 10:00 UTC, which is 6:00 AM
during US Eastern Daylight Time and 5:00 AM during Eastern Standard Time -
close enough for a job whose only purpose is making sure a prompt exists
before the first person opens the app. Hitting the app itself before the cron
fires works too: `getOrCreateTodayPrompt()` generates the prompt on demand
and is race-safe if two requests land at once.

## Deploying to Vercel

1. Import the repository into Vercel. The Next.js app lives at the repo
   root, so no root-directory configuration is needed.
2. Deploy. The build succeeds with no environment variables set.
3. In the project's Vercel dashboard, add the environment variables from the
   table above - at minimum `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, and `CRON_SECRET`.
4. Run `npm run db:migrate` against the production `DATABASE_URL` (from your
   machine, or a one-off script) to create the tables.
5. Redeploy so the new environment variables take effect. Vercel Cron picks
   up the schedule in `vercel.json` automatically.
