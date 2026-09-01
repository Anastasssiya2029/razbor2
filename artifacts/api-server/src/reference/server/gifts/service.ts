import { analysisGiftsTable as analysisGifts, analysisResultsTable as analysisResults, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { secureRandomFraction, selectGiftPrize, type GiftTariff } from "./catalog";

export type StoredGift = {
  tariff: GiftTariff;
  prizeCode: string;
  prizeName: string;
  selectedAt: string;
};

function giftFromRow(row: typeof analysisGifts.$inferSelect): StoredGift {
  return {
    tariff: row.tariff,
    prizeCode: row.giftId,
    prizeName: row.giftLabel,
    selectedAt: row.drawnAt.toISOString(),
  };
}

// A client can draw one gift per tariff ("self" and "support" are
// independent), so an analysis result can have up to two gift rows.
export async function getAnalysisGifts(analysisRunId: string): Promise<StoredGift[]> {
  const rows = await db.select({ gift: analysisGifts }).from(analysisResults)
    .innerJoin(analysisGifts, eq(analysisGifts.analysisResultId, analysisResults.id))
    .where(eq(analysisResults.analysisRunId, analysisRunId));
  return rows.map((row) => giftFromRow(row.gift));
}

export async function drawAnalysisGift(input: { analysisRunId: string; tariff: GiftTariff; actorUserId: string }): Promise<{ gift: StoredGift; idempotentReplay: boolean }> {
  const existing = (await getAnalysisGifts(input.analysisRunId)).find((gift) => gift.tariff === input.tariff);
  if (existing) return { gift: existing, idempotentReplay: true };
  const selected = selectGiftPrize(input.tariff, secureRandomFraction());
  const resultRows = await db.select({ id: analysisResults.id }).from(analysisResults)
    .where(eq(analysisResults.analysisRunId, input.analysisRunId)).limit(1);
  const result = resultRows[0];
  if (!result) throw new Error("ANALYSIS_RESULT_NOT_FOUND");
  const inserted = await db.insert(analysisGifts).values({
    analysisResultId: result.id, ownerUserId: input.actorUserId,
    tariff: input.tariff, giftId: selected.code, giftLabel: selected.shortName,
  }).onConflictDoNothing({ target: [analysisGifts.analysisResultId, analysisGifts.tariff] }).returning();
  if (inserted[0]) return { gift: giftFromRow(inserted[0]), idempotentReplay: false };
  const concurrent = (await getAnalysisGifts(input.analysisRunId)).find((gift) => gift.tariff === input.tariff);
  if (!concurrent) throw new Error("GIFT_PERSISTENCE_CONFLICT");
  return { gift: concurrent, idempotentReplay: true };
}
