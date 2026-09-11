# Sixteen

A daily writing-prompt app for a rapper. Every morning it serves one
generated prompt for a 16-bar verse - a concept, a scenario to write from,
a rhyme scheme, a pocket (flow/tempo), a handful of constraints, and a word
bank - and gives a pad to write the verse against it, with a bar counter and
autosave. Past prompts and verses live in a searchable archive - any day can
be reopened and rewritten - alongside a streak of consecutive days completed.
A notebook holds loose verses that answer to no prompt at all, for when a
verse shows up on its own schedule.

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

## The streak

`getStreak()` counts back from today (or from yesterday, if today's verse
isn't finished yet) over the dates of completed daily verses, and stops at
the first gap. Loose notebook verses never reach it - the query joins through
`prompt_id`.

The number alone says nothing about whether four days is a lot, so
`src/lib/streak.ts` sorts it into six named tiers - Spark, Ember, Blaze,
Inferno, Wildfire, Blue flame - at 1, 3, 7, 14, 30 and 100 days, each with
its own flame and colour. The colours run the way a real flame gets hotter:
red, orange, amber, yellow, white, then blue, so the palette is a scale
rather than six arbitrary colours.

`StreakFlame` puts that at the top of the home page for a signed-in writer,
above the day's prompt: the flame, the streak, its tier and how many days are
left to the next one. Clicking it opens the full ladder with the current tier
marked. It's a native `<details>`, so the component stays a server component,
the legend is in the page whether it's open or closed, and no JavaScript is
needed to open it. `StreakBadge` is the same tier in one line, next to the
archive's heading.

The tiers are the single source of both: adding one is an entry in
`STREAK_TIERS`, and `streakTier()` takes the last tier whose floor the streak
has cleared, so only the floors matter - the printed ranges follow from them.

## The notebook

`/notebook` is the same pad with nothing in front of it: no prompt, no
16-bar target, no streak - somewhere to put bars that arrived on their own.
It has its own search box over the same machinery as the archive's.

Loose verses are `verses` rows with a null `prompt_id`, not a table of their
own, so one kind of thing is stored one way. Two properties make that work:

- Postgres compares unique keys as `NULLS DISTINCT`, so
  `unique (prompt_id, user_id)` still allows one verse per person per prompt
  while letting a person keep as many loose verses as they like.
- Every query that reaches the daily verses joins through `prompt_id`, so a
  null can never appear in the archive, the streak, or a day's pad. Every
  notebook query pairs `is null (prompt_id)` with the reader's own user id,
  so a daily verse can't be edited or deleted through the notebook either.

A blank page writes nothing. `/notebook/new` holds no row at all; the first
autosave creates one and swaps the URL for the verse's own, so opening the
notebook and thinking better of it leaves nothing behind. Verses are named in
the list by their opening bar rather than by a title - being asked to name a
jotting is being asked to stop writing - and a verse emptied of its text keeps
its place in the list, under a stand-in name, so it stays reachable to delete.

Deleting is the one destructive thing in the app, so it asks first, and
`deleteVerseNote()` scopes the delete to the signed-in user rather than
trusting the id it was handed.

## Environment variables

See `.env.example` for the same list with inline comments.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres connection string (pooled). |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical origin, e.g. `https://sixteen.rap`. Used for canonical tags, the sitemap, `robots.txt`, Open Graph URLs and JSON-LD `@id`s. Falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then `http://localhost:3000`. Set it once a custom domain is attached, or every canonical points at the `*.vercel.app` hostname. |
| `NEXT_PUBLIC_TWITTER_HANDLE` | No | `@handle` for Twitter/X card attribution. Omitted from the tags when unset. |
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
`/sign-in`, `/sign-up`, `/api/cron`, and the crawler routes in
`src/lib/crawler-routes.ts` (`/robots.txt`, `/sitemap.xml`, `/llms.txt`, the
generated share images). Everything else - the archive and the whole notebook
included - needs one. `/` is public so a visitor can read
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

`/`, `/archive`, `/archive/<date>` and every `/notebook` route are
`force-dynamic` so they're never prerendered at build time, and a missing `DATABASE_URL` (or any other setup problem) surfaces as an
in-app notice at request time instead of a stack trace.

## SEO and AEO

The public surface is one page - `/` - and it changes every morning. Everything
below is built around that single fact: make the one page rank, and make the
prompt on it something an answer engine can quote.

**Where the copy lives.** `src/lib/site.ts` holds the description, the
keywords, the three how-it-works steps and the FAQ. The home page renders them,
`src/lib/structured-data.ts` emits them as JSON-LD, and `/llms.txt` writes them
out as prose. Editing the array is the whole edit - the three can't drift.

**On the page.** `src/app/page.tsx` builds its `<title>` and description from
today's actual concept (`generateMetadata()` and the component share one
database read via React's `cache()`), so the page has a reason to be recrawled
daily and a reason to be clicked. There is exactly one `<h1>`, naming what a
searcher types rather than the brand; the day's concept is the `<h2>` in the
prompt card. Under the pad sit the how-it-works steps and an FAQ, each answer
written so its first sentence stands alone - that sentence is all a featured
snippet or an AI summary usually takes.

**Structured data.** `Organization`, `WebSite` and a `WebApplication` marked
free on every page; `HowTo`, `FAQPage` and a dated `CreativeWork` for today's
prompt on the home page.

**Crawl control.** `src/app/robots.ts` allows `/` and disallows the routes that
need a session; `src/app/sitemap.ts` lists `/` alone, with today's date as
`lastModified` (it revalidates hourly, or the date would freeze at deploy
time). The private routes also carry `noindex, follow` from
`privatePageMetadata()` in `src/lib/metadata.ts` - both are needed, because a
`Disallow`ed page can still be indexed from an external link precisely because
the crawler never fetches it to read the tag.

**Streamed metadata.** Every page here is dynamic, and Next streams a dynamic
page's metadata *after* `</head>`. Browsers and Googlebot hoist it; most AI
crawlers and link unfurlers parse raw HTML and would see a page with no title.
`htmlLimitedBots` in `next.config.ts` names those agents - the default list
plus GPTBot, ClaudeBot, PerplexityBot and friends - so Next does a blocking
render and puts the metadata back in `<head>` for them.

**Careful with `src/middleware.ts`.** Its matcher only skips paths ending in a
handful of static extensions, and `.txt`, `.xml` and the extensionless
generated image routes are not among them. Anything a crawler fetches has to be
in `src/lib/crawler-routes.ts` or Clerk redirects it to the sign-in page -
which, for `/robots.txt`, means no organic traffic at all. `test/seo-routes.test.ts`
guards that.

**Analytics.** `@vercel/analytics` is mounted in the root layout. It reports in
the Vercel dashboard once Web Analytics is enabled for the project.

**Not done here.** The biggest remaining lever is more indexable pages. Every
past prompt is already public information - the same prompt goes to everyone -
but `/archive/<date>` shows a person's own verse and so is behind sign-in.
A public, indexable page per past prompt would turn one URL into hundreds
without exposing anyone's writing. That is a product decision, not a metadata
one, so it is left alone.

## A note on Clerk keys and domains

Use Clerk **development** keys (`pk_test_` / `sk_test_`) while the app is on a
`*.vercel.app` hostname. A Clerk production instance serves its Frontend API
and Account Portal from `clerk.<your-domain>` and `accounts.<your-domain>`,
which need CNAME records on a domain you control - and nobody can add DNS
records under `vercel.app`. Production keys there fail at sign-in with a
redirect to an `accounts.<...>.vercel.app` host that does not resolve.

Switch to production keys once a custom domain is attached to the project and
verified in the Clerk dashboard.

## Theming Clerk

Clerk's cards, user menu and modals come from its own stylesheet, so nothing
in `globals.css` reaches them - by default they render as a bright white card
in the middle of a dark page. `src/lib/clerk-appearance.ts` mirrors the app's
tokens into Clerk's `appearance` config, and `ClerkProvider` in
`src/app/layout.tsx` applies it to every Clerk surface at once, the sign-in
modals included.

Clerk's colour parser takes hex and rgb but not oklch, so each value in that
file is the sRGB equivalent of a token in `globals.css`, converted by hand and
commented with the token it came from. Changing a colour in `globals.css`
means converting it and changing it there too.

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
