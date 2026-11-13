import assert from "node:assert/strict";
import test from "node:test";
import { filterResults } from "./resultFilters.js";

const people = {
  bigs: { a: { name: "Ann Lee" }, b: { name: "Bea Kim" }, c: { name: "Cara Wu" } },
  littles: { x: { name: "Zoë Jones" }, y: { name: "Yara Day" }, z: { name: "Zara Hill" }, u: { name: "Una Bell" } },
};
const pairs = [
  { big: "a", little: "x", locked: true },
  { big: "a", little: "y", locked: false },
  { big: "b", little: "z", locked: false },
];
const select = (filter = "all", query = "", currentPairs = pairs) => filterResults({ people, pairs: currentPairs, query, filter });

test("all results include grouped matches and unmatched people", () => {
  assert.deepEqual(select(), { visibleBigs: ["a", "b"], visibleUnBigs: ["c"], visibleUnLittles: ["u"] });
});
test("name search ignores case, whitespace and accents, keeping a little's big visible", () => {
  assert.deepEqual(select("all", " ZOE "), { visibleBigs: ["a"], visibleUnBigs: [], visibleUnLittles: [] });
  assert.deepEqual(select("all", "KIM").visibleBigs, ["b"]);
});
test("unmatched filter combines with name search", () => {
  assert.deepEqual(select("unmatched", "una"), { visibleBigs: [], visibleUnBigs: [], visibleUnLittles: ["u"] });
});
test("twin and locked filters keep whole cards and exclude unmatched people", () => {
  const expected = { visibleBigs: ["a"], visibleUnBigs: [], visibleUnLittles: [] };
  assert.deepEqual(select("twins"), expected);
  assert.deepEqual(select("locked", "yara"), expected);
  assert.deepEqual(select("locked", "zara").visibleBigs, []);
});
test("filters reflect lock changes and manual assignments", () => {
  assert.deepEqual(select("locked", "", pairs.map(pair => ({ ...pair, locked: false }))).visibleBigs, []);
  const moved = [...pairs.filter(pair => pair.little !== "y"), { big: "c", little: "y", locked: true }];
  assert.deepEqual(select("twins", "", moved).visibleBigs, []);
  assert.deepEqual(select("locked", "yara", moved).visibleBigs, ["c"]);
});
test("no matching names returns empty lists without changing the input", () => {
  const before = JSON.stringify({ people, pairs });
  assert.deepEqual(select("all", "missing"), { visibleBigs: [], visibleUnBigs: [], visibleUnLittles: [] });
  assert.equal(JSON.stringify({ people, pairs }), before);
});
