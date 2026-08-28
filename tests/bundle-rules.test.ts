import assert from "node:assert/strict";
import test from "node:test";
import { BUNDLE_RULES, findBundleRule } from "../server/7k/config/bundle-rules.v1";

test("bundle registry contains 21 unique exact rules", () => {
  assert.equal(BUNDLE_RULES.length, 21);
  assert.equal(new Set(BUNDLE_RULES.map((rule) => rule.id)).size, BUNDLE_RULES.length);
  assert.equal(
    new Set(BUNDLE_RULES.map((rule) => [
      [...rule.keyElements].sort().join(","),
      [...rule.supportingElements].sort().join(","),
    ].join("|"))).size,
    BUNDLE_RULES.length,
  );
});

test("latest approved blog and team wording is preserved verbatim", () => {
  assert.equal(
    BUNDLE_RULES.find((rule) => rule.id === "BR-10")?.checklistTask,
    "Привлекать в блог целевых подписчиков: своих людей, которым подходит ваш продукт.",
  );
  assert.equal(
    BUNDLE_RULES.find((rule) => rule.id === "BR-12")?.checklistTask,
    "Внедрить в блог продающие посты, которые звучат на языке потребностей клиента.",
  );
  assert.equal(
    BUNDLE_RULES.find((rule) => rule.id === "BR-15")?.checklistTask,
    "Передать команде и AI повторяющиеся задачи маркетинга и обработки обращений, а своё время направить на улучшение продаж.",
  );
});

test("bundle lookup is strict but independent of element order", () => {
  assert.equal(
    findBundleRule(
      ["sales_technology", "product_method"],
      ["audience", "authenticity"],
    )?.id,
    "BR-01",
  );
  assert.equal(findBundleRule(["funnel", "blog"], ["audience"])?.id, "BR-10");
  assert.equal(findBundleRule(["funnel", "blog"], ["audience", "authenticity"]), null);
});
