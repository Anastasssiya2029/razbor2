import assert from "node:assert/strict";
import test from "node:test";

import { systemScoreTone } from "../lib/business-analysis";

test("business-model brick colors depend on score, not element identity", () => {
  assert.equal(systemScoreTone(0), "low");
  assert.equal(systemScoreTone(3), "low");
  assert.equal(systemScoreTone(4), "medium");
  assert.equal(systemScoreTone(6), "medium");
  assert.equal(systemScoreTone(7), "high");
  assert.equal(systemScoreTone(10), "high");
});
