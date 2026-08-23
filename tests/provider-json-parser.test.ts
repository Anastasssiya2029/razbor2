import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseProviderJson } from "../server/ai/provider-json";

test("all AI modules use the same provider JSON parser", () => {
  for (const runner of ["p01", "p02", "p03", "p04"]) {
    const source = readFileSync(`server/${runner}/runner.ts`, "utf8");
    assert.match(source, /parseProviderJson\(response\.text\)/u, `${runner} must use the shared parser`);
  }
});

test("bare JSON remains accepted", () => {
  assert.deepEqual(parseProviderJson('  {"status":"ok"}\n'), { status: "ok" });
  assert.deepEqual(parseProviderJson("[1,2,3]"), [1, 2, 3]);
});

test("one complete Markdown JSON fence is accepted", () => {
  assert.deepEqual(parseProviderJson('```json\n{"status":"ok"}\n```'), { status: "ok" });
  assert.deepEqual(parseProviderJson('```\r\n{"status":"ok"}\r\n```'), { status: "ok" });
});

test("prose, multiple fences and malformed fenced content remain rejected", () => {
  assert.throws(() => parseProviderJson('Ответ:\n```json\n{"status":"ok"}\n```'));
  assert.throws(() => parseProviderJson('```json\n{}\n```\n```json\n{}\n```'));
  assert.throws(() => parseProviderJson('```json\n{"status":\n```'));
});
