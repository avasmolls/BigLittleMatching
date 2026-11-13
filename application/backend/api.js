const form = (bigs, littles, locked) => {
  const f = new FormData();
  f.append("bigs_file", bigs);
  f.append("littles_file", littles);
  if (locked) f.append("locked", JSON.stringify(locked));
  return f;
};

export async function validate(bigs, littles) {
  const r = await fetch("/api/validate", { method: "POST", body: form(bigs, littles) });
  return r.json();
}

// Throws {errors, warnings} when the server rejects the files.
export async function runMatch(bigs, littles, locked) {
  const r = await fetch("/api/match", { method: "POST", body: form(bigs, littles, locked) });
  const d = await r.json();
  if (!r.ok) throw d.detail && d.detail.errors ? d.detail : { errors: [String(d.detail || "Server error")], warnings: [] };
  if (!d.people) throw { errors: ["The backend is out of date (no 'people' in the response). Restart uvicorn using the latest matching.py and main.py."], warnings: [] };
  return d;
}