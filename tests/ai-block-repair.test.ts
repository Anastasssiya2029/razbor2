import assert from "node:assert/strict";
import test from "node:test";
import {
  applyValidatedBlockRepair,
  BlockRepairError,
  selectTopLevelRepairBlocks,
} from "../server/ai/block-repair";
import { sha256 } from "../server/stage4/hash";

type Draft = {
  opening: { summary: string };
  routeCards: Array<{ id: string }>;
  immutableDecision: string;
};

function validateDraft(candidate: unknown): Draft {
  const value = candidate as Draft;
  if (value.immutableDecision !== "keep" || value.opening.summary.length < 5) {
    throw new Error("invalid draft");
  }
  return value;
}

test("block repair replaces only an allow-listed block and leaves the base immutable", async () => {
  const base: Draft = {
    opening: { summary: "old text" },
    routeCards: [{ id: "card-1" }],
    immutableDecision: "keep",
  };
  const baseBefore = structuredClone(base);
  const repaired = await applyValidatedBlockRepair({
    base,
    envelope: {
      baseHash: await sha256(base),
      replacements: { opening: { summary: "new text" } },
    },
    allowedBlocks: ["opening", "routeCards"],
    validate: validateDraft,
  });

  assert.equal(repaired.opening.summary, "new text");
  assert.deepEqual(repaired.routeCards, base.routeCards);
  assert.deepEqual(base, baseBefore);
});

test("block repair rejects a stale base hash", async () => {
  const base: Draft = {
    opening: { summary: "old text" },
    routeCards: [],
    immutableDecision: "keep",
  };
  await assert.rejects(
    () => applyValidatedBlockRepair({
      base,
      envelope: { baseHash: "stale", replacements: { opening: { summary: "new text" } } },
      allowedBlocks: ["opening"],
      validate: validateDraft,
    }),
    (error: unknown) => error instanceof BlockRepairError && error.code === "BLOCK_REPAIR_STALE_BASE",
  );
});

test("block repair rejects forbidden blocks before merge", async () => {
  const base: Draft = {
    opening: { summary: "old text" },
    routeCards: [],
    immutableDecision: "keep",
  };
  const baseHash = await sha256(base);
  await assert.rejects(
    () => applyValidatedBlockRepair({
      base,
      envelope: {
        baseHash,
        replacements: { immutableDecision: "change" },
      },
      allowedBlocks: ["opening"],
      validate: validateDraft,
    }),
    (error: unknown) =>
      error instanceof BlockRepairError && error.code === "BLOCK_REPAIR_FORBIDDEN_BLOCK",
  );
});

test("block repair is atomic when full validation rejects the candidate", async () => {
  const base: Draft = {
    opening: { summary: "old text" },
    routeCards: [],
    immutableDecision: "keep",
  };
  const baseHash = await sha256(base);
  await assert.rejects(
    () => applyValidatedBlockRepair({
      base,
      envelope: {
        baseHash,
        replacements: { opening: { summary: "bad" } },
      },
      allowedBlocks: ["opening"],
      validate: validateDraft,
    }),
    (error: unknown) =>
      error instanceof BlockRepairError && error.code === "BLOCK_REPAIR_VALIDATION_FAILED",
  );
  assert.equal(base.opening.summary, "old text");
});

test("repair block selection is bounded and rejects broad repairs", () => {
  const allowed = ["opening", "growthPoint", "routeCards", "finalFocus"];
  assert.deepEqual(
    selectTopLevelRepairBlocks(["/opening/summary", "/opening/headline", "/routeCards/0/why_now"], allowed),
    ["opening", "routeCards"],
  );
  assert.deepEqual(
    selectTopLevelRepairBlocks(["/opening/summary", "/growthPoint/title", "/routeCards/0", "/finalFocus/text"], allowed),
    [],
  );
});
