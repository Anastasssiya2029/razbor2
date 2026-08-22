import { getDb } from "@/db";
import { analysisGifts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { secureRandomFraction, selectGiftPrize, type GiftTariff } from "./catalog";

export type StoredGift = {
  tariff: GiftTariff;
  prizeCode: string;
  prizeName: string;
  selectedAt: string;
};

function giftFromRow(row: typeof analysisGifts.$inferSelect): StoredGift {
  return { tariff: row.tariff as GiftTariff, prizeCode: row.prizeCode, prizeName: row.prizeName, selectedAt: row.selectedAt };
}

export async function getAnalysisGift(analysisRunId: string): Promise<StoredGift | null> {
  const db = await getDb();
  const rows = await db.select().from(analysisGifts).where(eq(analysisGifts.analysisRunId, analysisRunId)).limit(1);
  return rows[0] ? giftFromRow(rows[0]) : null;
}

export async function drawAnalysisGift(input: { analysisRunId: string; tariff: GiftTariff; actorUserId: string }): Promise<{ gift: StoredGift; idempotentReplay: boolean }> {
  const existing = await getAnalysisGift(input.analysisRunId);
  if (existing) return { gift: existing, idempotentReplay: true };
  const selected = selectGiftPrize(input.tariff, secureRandomFraction());
  const db = await getDb();
  const inserted = await db.insert(analysisGifts).values({
    id: crypto.randomUUID(), analysisRunId: input.analysisRunId, tariff: input.tariff,
    prizeCode: selected.code, prizeName: selected.shortName, selectedByUserId: input.actorUserId,
  }).onConflictDoNothing({ target: analysisGifts.analysisRunId }).returning();
  if (inserted[0]) return { gift: giftFromRow(inserted[0]), idempotentReplay: false };
  const concurrent = await getAnalysisGift(input.analysisRunId);
  if (!concurrent) throw new Error("GIFT_PERSISTENCE_CONFLICT");
  return { gift: concurrent, idempotentReplay: true };
}
