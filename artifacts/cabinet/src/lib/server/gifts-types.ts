import type { GiftTariff } from "./gifts/catalog";

export type StoredGift = {
  tariff: GiftTariff;
  prizeCode: string;
  prizeName: string;
  selectedAt: string;
};