CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" text PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	"status" text NOT NULL,
	"stages" jsonb NOT NULL,
	"verify_report" jsonb,
	"total_cost_usd" double precision NOT NULL,
	"total_latency_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traces_status_check" CHECK ("traces"."status" in ('ok', 'degraded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turns_conversation_position_unique" UNIQUE("conversation_id","position"),
	CONSTRAINT "turns_role_check" CHECK ("turns"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traces_turn_id_idx" ON "traces" USING btree ("turn_id");