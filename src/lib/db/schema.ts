import { isNull, sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const dailyPrompts = pgTable("daily_prompts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  promptDate: date("prompt_date", { mode: "string" }).notNull().unique(),
  concept: text("concept").notNull(),
  scenario: text("scenario").notNull(),
  rhymeScheme: text("rhyme_scheme").notNull(),
  pocket: text("pocket").notNull(),
  constraints: text("constraints").array().notNull(),
  wordBank: text("word_bank").array().notNull(),
  source: text("source").notNull(),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Two kinds of row live here, told apart by prompt_id. A verse written
// against a daily prompt carries its id; a loose verse jotted in the notebook
// carries null, and belongs to nothing but its author.
export const verses = pgTable(
  "verses",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    promptId: uuid("prompt_id").references(() => dailyPrompts.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").notNull(),
    body: text("body").notNull().default(""),
    barCount: integer("bar_count").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Still one verse per person per prompt. Notebook rows slip past this
    // rather than colliding with each other: Postgres compares unique keys as
    // NULLS DISTINCT, so (null, user) is never equal to another (null, user).
    unique("verses_prompt_id_user_id_unique").on(table.promptId, table.userId),
    index("verses_user_id_created_at_idx").on(table.userId, table.createdAt),
    // What the notebook list reads: one person's loose verses, most recently
    // touched first.
    index("verses_notebook_idx")
      .on(table.userId, table.updatedAt.desc())
      .where(isNull(table.promptId)),
  ],
);

export type DailyPrompt = typeof dailyPrompts.$inferSelect;
export type NewDailyPrompt = typeof dailyPrompts.$inferInsert;
export type Verse = typeof verses.$inferSelect;
export type NewVerse = typeof verses.$inferInsert;
