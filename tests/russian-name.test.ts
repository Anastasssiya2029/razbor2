import assert from "node:assert/strict";
import test from "node:test";
import { declineRussianNameGenitive } from "../lib/russian-name";

test("declines common feminine names for the individual-plan heading", () => {
  assert.equal(declineRussianNameGenitive("Алина"), "Алины");
  assert.equal(declineRussianNameGenitive("Анна"), "Анны");
  assert.equal(declineRussianNameGenitive("Мария"), "Марии");
  assert.equal(declineRussianNameGenitive("Ольга"), "Ольги");
  assert.equal(declineRussianNameGenitive("Наталья"), "Натальи");
});

test("declines masculine, compound and full names conservatively", () => {
  assert.equal(declineRussianNameGenitive("Андрей"), "Андрея");
  assert.equal(declineRussianNameGenitive("Александр"), "Александра");
  assert.equal(declineRussianNameGenitive("Анна Иванова"), "Анны Ивановой");
  assert.equal(declineRussianNameGenitive("Анна-Мария"), "Анны-Марии");
  assert.equal(declineRussianNameGenitive("Николь"), "Николи");
});

test("keeps empty and indeclinable values fail-safe", () => {
  assert.equal(declineRussianNameGenitive(""), "клиента");
  assert.equal(declineRussianNameGenitive("Мишель"), "Мишели");
});
