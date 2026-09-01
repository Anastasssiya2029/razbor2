import { text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { cabinetSchema, giftTariffEnum } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisResultsTable } from "./analysis-results";
import { appUsersTable } from "./app-users";

// A gamified prize draw offered once a client's analysis is ready. A client
// can draw once per tariff ("self" / "support"), so up to two rows can exist
// per analysis result -- one per tariff -- but re-drawing the same tariff is
// not allowed.
export const analysisGiftsTable = cabinetSchema.table(
  "analysis_gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisResultId: uuid("analysis_result_id")
      .notNull()
      .references(() => analysisResultsTable.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => appUsersTable.id),
    tariff: giftTariffEnum("tariff").notNull(),
    giftId: text("gift_id").notNull(),
    giftLabel: text("gift_label").notNull(),
    drawnAt: timestamp("drawn_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.analysisResultId, table.tariff)],
);

export const insertAnalysisGiftSchema = createInsertSchema(analysisGiftsTable).omit({
  id: true,
  drawnAt: true,
});
export type InsertAnalysisGift = z.infer<typeof insertAnalysisGiftSchema>;
export type AnalysisGift = typeof analysisGiftsTable.$inferSelect;
