import assert from "node:assert/strict";
import test from "node:test";
import { createReviewState, reviewReducer, reviewSignature, resultSnapshot } from "./reviewHistory.js";

const result = {
  matches: [{ big: { email: "big@example.edu" }, littles: [{ email: "little@example.edu", reason: "Mutual first choices." }] }],
  unmatched_bigs: [{ email: "other@example.edu", reason: "No mutual rankings." }],
  unmatched_littles: [],
};
const change = (state, current) => reviewReducer(state, { type: "change", current });
const dirty = state => reviewSignature(state.current) !== state.checkpoint;

test("initial results do not trigger the unexported-edits warning", () => {
  const state = createReviewState(result);
  assert.equal(dirty(state), false);
  assert.equal(state.exported, null);
  assert.equal(state.current.pairs[0].locked, false);
});
test("undo restores an assignment and its auto-lock exactly", () => {
  const initial = createReviewState(result);
  const moved = change(initial, { ...initial.current, pairs: [{ ...initial.current.pairs[0], big: "other@example.edu", locked: true, reason: "Manually assigned." }] });
  assert.equal(dirty(moved), true);
  const undone = reviewReducer(moved, { type: "undo" });
  assert.deepEqual(undone.current, initial.current);
  assert.equal(dirty(undone), false);
  assert.equal(undone.undo, null);
});
test("undo restores unmatched notes as well as the pair", () => {
  const initial = createReviewState(result);
  const unmatched = change(initial, { pairs: [], notes: { ...initial.current.notes, "little@example.edu": "Unmatched manually." } });
  assert.deepEqual(reviewReducer(unmatched, { type: "undo" }).current, initial.current);
});
test("undo applies to the latest change and keeps earlier edits", () => {
  const initial = createReviewState(result);
  const locked = change(initial, { ...initial.current, pairs: initial.current.pairs.map(pair => ({ ...pair, locked: true })) });
  const unmatched = change(locked, { pairs: [], notes: locked.current.notes });
  const undone = reviewReducer(unmatched, { type: "undo" });
  assert.deepEqual(undone.current, locked.current);
  assert.equal(dirty(undone), true);
});
test("export checkpoints edits; later changes and undo track that exported version", () => {
  const initial = createReviewState(result);
  const locked = change(initial, { ...initial.current, pairs: initial.current.pairs.map(pair => ({ ...pair, locked: true })) });
  const exported = reviewReducer(locked, { type: "export" });
  assert.equal(dirty(exported), false);
  assert.equal(exported.exported, reviewSignature(exported.current));
  assert.equal(exported.undo, null);
  const edited = change(exported, initial.current);
  assert.equal(dirty(edited), true);
  assert.equal(dirty(reviewReducer(edited, { type: "undo" })), false);
});
test("recalculation preserves the export checkpoint and invalidates old undo", () => {
  const exported = reviewReducer(createReviewState(result), { type: "export" });
  const updated = { ...result, matches: [], unmatched_littles: [{ email: "little@example.edu", reason: "No match." }] };
  const recalculated = reviewReducer(exported, { type: "recalculate", result: updated });
  assert.deepEqual(recalculated.current, resultSnapshot(updated));
  assert.equal(dirty(recalculated), true);
  assert.equal(recalculated.checkpoint, exported.checkpoint);
  assert.equal(recalculated.undo, null);
});
test("equivalent results do not become dirty because of object or pair order", () => {
  const current = { pairs: [{ big: "b", little: "y", locked: false, reason: "B" }, { big: "a", little: "x", locked: true, reason: "A" }], notes: { b: "B", a: "A" } };
  assert.equal(reviewSignature(current), reviewSignature({ notes: { a: "A", b: "B" }, pairs: [...current.pairs].reverse() }));
});
