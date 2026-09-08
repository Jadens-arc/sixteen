import { sql } from "drizzle-orm";
import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
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

export const verses = pgTable("verses", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  promptId: uuid("prompt_id")
    .notNull()
    .unique()
    .references(() => dailyPrompts.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  barCount: integer("bar_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DailyPrompt = typeof dailyPrompts.$inferSelect;
export type NewDailyPrompt = typeof dailyPrompts.$inferInsert;
export type Verse = typeof verses.$inferSelect;
export type NewVerse = typeof verses.$inferInsert;
