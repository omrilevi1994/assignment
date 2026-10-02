CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_note_length_check" CHECK (char_length(btrim("feedback"."note")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_turn_id_idx" ON "feedback" USING btree ("turn_id");