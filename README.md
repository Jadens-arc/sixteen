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

- **The bodies never reach the browser.** Postgres cannot search a verse it
  cannot read - see [Encryption at rest](#encryption-at-rest) - so the matching
  and the excerpting happen on the server, in `matchesQuery()` and
  `excerptAround()` (`src/lib/search.ts`). A search reads the rows, keeps the
  bodies, and sends on a 180-character excerpt of each hit; 60 rows of
  `MAX_VERSE_LENGTH` bodies would be megabytes on a page that renders two lines
  of one. An account with a [passphrase](#the-passphrase-optional-per-person) is
  the exception - nothing there is searchable server-side, so those rows travel
  and the same two functions run in the browser instead.
- **Wildcards are literal.** A substring search in JavaScript has none, so
  `50%` finds the bar with `50%` in it without anything having to arrange
  that. This used to take a `likePattern()` helper escaping `%`, `_` and `\`
  for the `ILIKE`.

The verse body is joined on the user id before it is read, so a search can
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

## Encryption at rest

Verse bodies are encrypted in the database - the daily ones and the loose
notebook ones alike. `src/lib/verse-crypto.ts` holds the format;
`src/lib/db/queries.ts` is its only caller, encrypting on every write and
decrypting on every read, so nothing above that module - no action, no page,
no pad - ever handles anything but writing.

A stored body looks like this:

```
sixteen.v1.<key id>.<iv>.<ciphertext + tag>
```

AES-256-GCM, a fresh 96-bit IV per write, and the user id as additional
authenticated data - so a ciphertext moved from one row to another fails to
authenticate rather than opening in somebody else's notebook. The key comes
from `VERSE_ENCRYPTION_KEY` and lives only in the environment. A database
dump without it is a table of timestamps and bar counts.

### Nothing already written is lost

Three properties, and all three exist for that one reason.

- **A verse from before this reads as what it is.** A body with no envelope
  prefix is plaintext and is returned untouched, so every verse already in the
  database keeps opening - no migration, no schema change, no backfill
  required. The format is in the value, not in the column, which is also why
  turning encryption on is an environment variable rather than a deploy
  someone has to sequence.
- **A body that cannot be decrypted throws.** It never degrades to a
  placeholder. A placeholder would reach the pad, and the pad autosaves: the
  row would be overwritten with the stand-in and the verse really would be
  gone. Instead the read fails, the page shows the setup notice, and the
  ciphertext sits on disk untouched. The error names the key id the body was
  written with, so the fix is a lookup rather than a guess.
- **Rotation keeps the old key readable.** Every envelope names the key that
  wrote it. Set the new key as `VERSE_ENCRYPTION_KEY` and the old one as
  `VERSE_ENCRYPTION_KEY_PREVIOUS`: verses written under either open, and new
  writes use the new key.

With no key configured the app stores plaintext exactly as it did before -
the same reason nothing else here is required for the app to boot. Setting a
key encrypts new writes immediately, and existing rows encrypt themselves the
next time they are saved. To do the rest in one pass:

```bash
VERSE_ENCRYPTION_KEY=... DATABASE_URL=... npm run db:encrypt-verses
```

`scripts/encrypt-verses.ts` walks the table by id, skips what is already
encrypted (so it is safe to re-run and safe to interrupt), and reads every row
back before committing it, so a wrong key stops the run rather than rewriting
a notebook into noise. Each update matches on the body it read as well as on
the id, so a verse someone saved in the app mid-run keeps what they typed
instead of being overwritten with the copy the scan started from. And it
leaves `updated_at` alone - re-encrypting a verse is not editing it, and the
notebook is ordered by that column.

This is deliberately not wired into `vercel-build` the way migrations are. A
migration has to run or the code ships against a schema that doesn't match it;
this is a one-time pass over existing rows that is correct to never run at all.

### What is not encrypted

`bar_count`, the timestamps, and the daily prompts. The bar count is a number
the meter, the archive and the streak read without opening a verse - a length,
not the writing. The prompts are identical for everyone and already public on
the home page. A body's length also shows through in its ciphertext's length,
as it does in any scheme shaped like this one.

## The passphrase (optional, per person)

Everything above protects a verse from a stolen database. It does not protect
it from the application, which holds the key so that pages can render and
searches can run - so it cannot honestly say *only you can read this*. The
setting on `/settings` can.

Turning it on generates a data key in the browser, seals every verse with it,
and hands the server nothing but ciphertext and a copy of that key wrapped
under a passphrase the server never receives. `src/lib/crypto/client.ts` is
that half; `src/lib/crypto/envelope.ts` is the format both halves share, so a
verse sealed in a browser and a verse sealed on the server are the same kind of
value with a different version in it:

```
sixteen.v1.<key id>.<iv>.<ciphertext>   sealed with VERSE_ENCRYPTION_KEY
sixteen.v2.<key id>.<iv>.<ciphertext>   sealed with the writer's own key
```

Per-user and optional, not global: an account with no passphrase keeps
server-side search and server-rendered pads exactly as before. That is also why
this could ship without the searchable-encryption index a global version would
have needed.

### The passphrase never encrypts a verse

It derives a wrapping key (PBKDF2-SHA256, 600k iterations) which encrypts a
random data key, and the data key is what seals verses. Two things follow, and
both matter more than the indirection costs:

- Changing the passphrase rewraps one small value instead of re-encrypting
  every verse - and every verse already sealed stays readable, because the data
  key itself never changed.
- The same data key is wrapped a second time under a **recovery code**, which
  is the only way back in that does not depend on memory.

The enable flow shows that code and **makes you type it back before anything is
sealed**. That step is not politeness. A code shown once and clicked past is a
code nobody has, and the day it matters is the day the passphrase is forgotten -
by which point nobody, including whoever runs this app, can do anything at all.

### Mixed accounts are normal, not an error state

Conversion runs one verse at a time, each its own write, with no transaction
across them. Close the laptop halfway and the account holds some `v2` verses and
some `v1` ones - which every read path already handles, because the format is in
the value. Reopening the page picks up where it stopped.

That property is what makes the whole feature safe to ship, and it is worth not
breaking. It is also why `user_keys.state` exists: while the state is
`unsealing` the server accepts readable bodies again, and the key record is
deleted only once `countVersesSealed()` returns zero. Deleting it early would
strand verses behind a wrapped key that no longer exists - the one mistake here
that cannot be undone.

### What the server refuses

`resolveBodyInput()` in `src/lib/vault-policy.ts` decides what a save is allowed
to be, and it refuses in both directions:

- An account with no passphrase may not send a sealed body. Storing one would
  create a verse no key could ever open.
- An account with a passphrase may not send a readable one. That is a client bug
  that looks exactly like a working save, and it would leak the writing the
  passphrase was turned on to protect.

An account midway through unsealing is the one exception, and it is the state
that exists precisely to be it.

### What it costs

Honest list:

- **Search moves into the browser.** The server sends every sealed row for a
  search and the browser filters them, because it is the only side that can.
  Fast for a notebook of a few hundred verses; a corpus in the thousands would
  want the searchable-index design instead.
- **The sixteen-bar gate becomes advisory.** `completeVerse()` cannot count bars
  it cannot read, so it trusts the count the browser stored alongside the verse.
- **Verse bodies stop server-rendering** for that account. `<SealedBody>` opens
  them client-side and shows the unlock prompt when the key is missing.
- **XSS matters more.** The key is held as a non-extractable `CryptoKey`, in
  memory and (for "stay unlocked on this device") in IndexedDB, so script on the
  page could use it but not copy it out. That is the best a browser offers short
  of asking for the passphrase on every load.

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
| `VERSE_ENCRYPTION_KEY` | Recommended | 32-byte key that verse bodies are encrypted with at rest: base64 (`openssl rand -base64 32`) or 64 hex characters. Unset means verses are stored as plain text, as they were before this existed. A verse encrypted under a key that is lost cannot be read by anyone. See [Encryption at rest](#encryption-at-rest). |
| `VERSE_ENCRYPTION_KEY_PREVIOUS` | No | The previous key, while rotating. Decrypt-only: verses it wrote keep opening, new writes use `VERSE_ENCRYPTION_KEY`. |

The passphrase setting needs no environment variable at all - its keys are
made in the browser and stored wrapped, in `user_keys`.

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
generated share images). Everything else - the archive, the whole notebook and
`/settings` included - needs one. `/` is public so a visitor can read
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

`/`, `/archive`, `/archive/<date>`, `/settings` and every `/notebook` route are
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
apply it locally. Deploys apply it themselves - see below.

## Migrations on deploy

`vercel-build` runs `scripts/migrate-on-deploy.mjs` before `next build`, and
Vercel prefers that script over `build`. So every deploy applies whatever is
pending in `drizzle/` before the code that needs it starts serving.

This is not a convenience. A migration applied by hand is a migration someone
has to notice is needed, on the one deploy out of twenty that carries a new
file in `drizzle/`; miss it and the app ships against a schema that doesn't
match it. Nothing fails at build time, nothing fails on the pages that don't
touch the new column, and the breakage surfaces as a feature that just doesn't
work for whoever tries it first.

Two things follow from where the script runs:

- A build with no `DATABASE_URL` skips migrating rather than failing, because
  the first deploy below is a bare import with no environment variables and
  that build is meant to succeed.
- A build whose `DATABASE_URL` is set migrates that database, preview builds
  included. If preview deployments ever get a database of their own, they
  will migrate that one; while they share production's, a preview build
  migrates production.

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
   redeploy in step 4.
3. In the project's Vercel dashboard, add the environment variables from the
   table above - at minimum `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, and `CRON_SECRET`.
4. Redeploy. With `DATABASE_URL` now set, the build creates the tables on its
   way past - the first deploy in step 2 had nothing to migrate. Every later
   deploy applies any new migration the same way, so this is the only time
   the step needs thinking about.

Vercel Cron picks up the schedule in `vercel.json` automatically, and runs
against production deployments only - preview deployments rely on the
on-demand generation in `getOrCreateTodayPrompt()` instead.
