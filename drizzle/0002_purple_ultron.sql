CREATE TABLE "user_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"kdf" text NOT NULL,
	"iterations" integer NOT NULL,
	"salt" text NOT NULL,
	"recovery_salt" text NOT NULL,
	"data_key_id" text NOT NULL,
	"wrapped_by_passphrase" text NOT NULL,
	"wrapped_by_recovery" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
