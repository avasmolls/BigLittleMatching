const form = (bigs, littles, locked, results) => {
  const f = new FormData();
  f.append("bigs_file", bigs);
  f.append("littles_file", littles);
  if (locked) f.append("locked", JSON.stringify(locked));
  if (results) f.append("results_file", results);
  return f;
};

export async function validate(bigs, littles, results) {
  const r = await fetch("/api/validate", { method: "POST", body: form(bigs, littles, undefined, results) });
  return r.json();
}

// Throws {errors, warnings} when the server rejects the files.
export async function runMatch(bigs, littles, locked) {
  return requestResults("/api/match", form(bigs, littles, locked));
}

export async function resumeReview(bigs, littles, results) {
  return requestResults("/api/resume", form(bigs, littles, undefined, results));
}

async function requestResults(path, body) {
  const r = await fetch(path, { method: "POST", body });
  const d = await r.json();
  if (!r.ok) throw d.detail && d.detail.errors ? d.detail : { errors: [String(d.detail || "Server error")], warnings: [] };
  if (!d.people) throw { errors: ["The backend is out of date (no 'people' in the response). Restart uvicorn using the latest matching.py and main.py."], warnings: [] };
  return d;
}
