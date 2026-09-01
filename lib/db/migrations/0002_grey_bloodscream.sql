ALTER TABLE "cabinet"."ai_call_log" ALTER COLUMN "analysis_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cabinet"."ai_call_log" ADD COLUMN "situation_session_id" text;