CREATE TABLE "daily_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_date" date NOT NULL,
	"concept" text NOT NULL,
	"scenario" text NOT NULL,
	"rhyme_scheme" text NOT NULL,
	"pocket" text NOT NULL,
	"constraints" text[] NOT NULL,
	"word_bank" text[] NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_prompts_prompt_date_unique" UNIQUE("prompt_date")
);
--> statement-breakpoint
CREATE TABLE "verses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"bar_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verses_prompt_id_unique" UNIQUE("prompt_id")
);
--> statement-breakpoint
ALTER TABLE "verses" ADD CONSTRAINT "verses_prompt_id_daily_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."daily_prompts"("id") ON DELETE cascade ON UPDATE no action;