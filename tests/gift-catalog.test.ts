import assert from "node:assert/strict";
import test from "node:test";
import { GIFT_CATALOG, selectGiftPrize } from "../server/gifts/catalog";

test("both approved gift catalogs contain eight sectors and total weight 100", () => {
  for (const tariff of ["self", "support"] as const) {
    assert.equal(GIFT_CATALOG[tariff].length, 8);
    assert.equal(GIFT_CATALOG[tariff].reduce((total, prize) => total + prize.weight, 0), 100);
    assert.equal(new Set(GIFT_CATALOG[tariff].map((prize) => prize.code)).size, 8);
  }
});

test("weighted boundaries select exact approved sectors", () => {
  assert.equal(selectGiftPrize("self", 0).code, "self_neuro_photo");
  assert.equal(selectGiftPrize("self", 0.299999).code, "self_neuro_photo");
  assert.equal(selectGiftPrize("self", 0.3).code, "self_marketer_review");
  assert.equal(selectGiftPrize("support", 0.999999).code, "support_month");
});

test("gift selector rejects caller-controlled out-of-range randomness", () => {
  assert.throws(() => selectGiftPrize("self", -0.1), RangeError);
  assert.throws(() => selectGiftPrize("support", 1), RangeError);
});
