CREATE TYPE "cabinet"."gift_tariff" AS ENUM('self', 'support');--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_gifts" DROP CONSTRAINT "analysis_gifts_analysis_result_id_unique";--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_gifts" ADD COLUMN "tariff" "cabinet"."gift_tariff";--> statement-breakpoint
UPDATE "cabinet"."analysis_gifts" SET "tariff" = CASE WHEN "gift_id" LIKE 'support_%' THEN 'support' ELSE 'self' END::"cabinet"."gift_tariff" WHERE "tariff" IS NULL;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_gifts" ALTER COLUMN "tariff" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_gifts" ADD CONSTRAINT "analysis_gifts_analysis_result_id_tariff_unique" UNIQUE("analysis_result_id","tariff");
