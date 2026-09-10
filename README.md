# Sixteen

A daily writing-prompt app for a rapper. Every morning it serves one
generated prompt for a 16-bar verse - a concept, a scenario to write from,
a rhyme scheme, a pocket (flow/tempo), a handful of constraints, and a word
bank - and gives a pad to write the verse against it, with a bar counter and
autosave. Past prompts and verses live in a searchable archive - any day can
be reopened and rewritten - alongside a streak of consecutive days completed.

The prompt is shared by everyone who uses the app (one per calendar day,
Wordle-style); each signed-in user keeps their own verse against it.

The home page reads without an account: anyone can see the day's prompt, and
the ask to sign up comes when they click the pad to start writing. Everything
that belongs to a person - the verse, the archive, the streak - still needs a
session.

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

## The archive

`/archive` lists the last 60 daily prompts newest first, each with the state
of your verse against it (not started, a bar count, or done) and the opening
lines of what you wrote. Every row links to `/archive/<date>` - the same
prompt card and the same pad the day itself had, loaded with your verse.

Nothing is frozen. A completed verse opens read-only with an **Edit** button;
reopening it makes the pad editable and autosave takes over as usual. Because
`upsertVerse()` only ever writes `completed_at` on the call that completes a
verse, editing one months later cannot un-complete it or cost a streak.

### Search

The search box on `/archive` filters the list by concept, scenario, and the
text of your own verses, case-insensitively. The query lives in the URL
(`/archive?q=pawn+shop`), so a search is back-button-able and linkable; the
input debounces and calls `router.replace()`, and the form still works as a
plain `GET` with JavaScript off.

Two details are worth knowing:

- **The bodies never come down.** `listArchive()` asks Postgres for a
  180-character window around the first hit rather than the verse itself,
  since 60 rows of `MAX_VERSE_LENGTH` bodies would be megabytes on a page
  that renders two lines of one. With no query, the same expression returns
  the top of each verse as a preview.
- **Wildcards are literal.** `likePattern()` in `src/lib/search.ts` escapes
  `%`, `_` and `\` before building the `ILIKE` pattern, so searching for
  `50%` finds the bar with `50%` in it instead of every row.

The verse body is joined on the user id before it is matched, so a search can
only ever hit your own writing.

## Environment variables

See `.env.example` for the same list with inline comments.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres connection string (pooled). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key. Without it, the app builds and boots in a keyless state: no sign-in and no `<ClerkProvider>`. In production every route except `/`, `/sign-in`, `/sign-up` and `/api/cron` then returns `503`; outside production those pages render a setup notice instead. |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | No | Not needed. `<ClerkProvider>` sets `signInUrl="/sign-in"` in `src/app/layout.tsx`; set this only to move the page elsewhere. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | No | Not needed, as above for `/sign-up`. |
| `APP_TIMEZONE` | No | IANA timezone used to resolve "today" for the daily prompt. Defaults to `America/New_York`. |
| `AI_PROVIDER` | No | `anthropic`, `openai`, or `offline`. Defaults to `offline`. |
| `AI_API_KEY` | Only for `anthropic`/`openai` | API key for the selected provider. |
| `AI_MODEL` | No | Model id. Each provider has a sane default when unset. |
| `AI_BASE_URL` | No | `openai` provider only. Defaults to `https://api.openai.com/v1`; point it at any OpenAI-compatible server instead. |
| `CRON_SECRET` | Recommended | Bearer token the cron route requires. If unset, the guard is skipped in development but the route rejects every request in production. |

Nothing here is required for `npm run build` to succeed - the app is meant
to deploy to Vercel before any of these are set, then have them added in the
dashboard afterward.

The keyless state is a bootstrap convenience, not a mode to run in. Clerk's
middleware throws on every request when no publishable key is present, so
`src/middleware.ts` steps aside entirely until one is configured, which
leaves every route unauthenticated. **In production that state is refused
rather than served**: with no publishable key, `src/middleware.ts` returns
`503` for every route except `/`, `/sign-in`, `/sign-up` and `/api/cron`, so a key
that was never added - or one later removed from the dashboard - cannot
quietly turn the whole app public. Outside production the keyless state stays
browsable, and nothing can read or write a verse in it either way
(`getUserId()` throws when `clerkMiddleware()` hasn't run, and the page
renders a setup notice).

`/` is exempt from that `503` because it is a public route, but it serves
nothing in the keyless state either: `getUserId()` throws before the prompt
loads, so the page renders the same setup notice. The exemption changes what
a misconfigured deploy shows on the home page - a notice instead of a plain
`503` - not what it will hand out.

## What is public

`src/middleware.ts` lists the routes that don't require a session: `/`,
`/sign-in`, `/sign-up` and `/api/cron`. `/` is public so a visitor can read
the day's prompt before deciding to sign up - `src/app/page.tsx` calls
`getUserId()` rather than `requireUserId()` and swaps the pad for
`<SignedOutPad />`, which opens Clerk's sign-up modal on the first click.

A server action posts back to the page it was called from, so the actions in
`src/actions/verse.ts` are not covered by the middleware on `/` either. They
each call `requireUserId()` themselves - that check, not the route matcher, is
what keeps one person's verse out of another's hands, and it is why the
middleware's list can widen without widening what a signed-out caller can do.

`/api/cron` deliberately stays reachable while unconfigured: it carries no
Clerk session by design and is guarded by `CRON_SECRET` instead, so the daily
prompt job keeps running through a Clerk misconfiguration.

`/`, `/archive` and `/archive/<date>` are `force-dynamic` so they're never
prerendered at build time, and a missing `DATABASE_URL` (or any other setup problem) surfaces as an
in-app notice at request time instead of a stack trace.

## A note on Clerk keys and domains

Use Clerk **development** keys (`pk_test_` / `sk_test_`) while the app is on a
`*.vercel.app` hostname. A Clerk production instance serves its Frontend API
and Account Portal from `clerk.<your-domain>` and `accounts.<your-domain>`,
which need CNAME records on a domain you control - and nobody can add DNS
records under `vercel.app`. Production keys there fail at sign-in with a
redirect to an `accounts.<...>.vercel.app` host that does not resolve.

Switch to production keys once a custom domain is attached to the project and
verified in the Clerk dashboard.

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
2. Deploy. The build succeeds with no environment variables set, though the
   deployed app returns `503` on every protected route until step 3 and the
   redeploy in step 5.
3. In the project's Vercel dashboard, add the environment variables from the
   table above - at minimum `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, and `CRON_SECRET`.
4. Run `npm run db:migrate` against the production `DATABASE_URL` (from your
   machine, or a one-off script) to create the tables.
5. Redeploy so the new environment variables take effect. Vercel Cron picks
   up the schedule in `vercel.json` automatically, and runs against
   production deployments only - preview deployments rely on the on-demand
   generation in `getOrCreateTodayPrompt()` instead.
