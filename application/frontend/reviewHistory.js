export const reviewSignature = current => JSON.stringify({
  pairs: current.pairs.map(({ big, little, locked, reason }) => ({ big, little, locked, reason }))
    .sort((a, b) => a.big.localeCompare(b.big) || a.little.localeCompare(b.little)),
  notes: Object.entries(current.notes).sort(([a], [b]) => a.localeCompare(b)),
});

export function resultSnapshot(result) {
  return {
    pairs: result.matches.flatMap(match => match.littles.map(little => ({
      big: match.big.email, little: little.email, locked: !!little.locked, reason: little.reason,
    }))),
    notes: Object.fromEntries([...result.unmatched_bigs, ...result.unmatched_littles].map(person => [person.email, person.reason])),
  };
}

export function createReviewState(result) {
  const current = resultSnapshot(result);
  return { current, checkpoint: reviewSignature(current), exported: null, undo: null };
}

export function reviewReducer(state, action) {
  switch (action.type) {
    case "change":
      return { ...state, current: action.current, undo: state.current };
    case "undo":
      return state.undo ? { ...state, current: state.undo, undo: null } : state;
    case "export":
      return { ...state, checkpoint: reviewSignature(state.current), exported: reviewSignature(state.current), undo: null };
    case "recalculate":
      return { ...state, current: resultSnapshot(action.result), undo: null };
    default:
      return state;
  }
}
