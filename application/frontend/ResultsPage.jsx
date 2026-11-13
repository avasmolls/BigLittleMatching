import { useState } from "react";
import { downloadCSV } from "../backend/exportCsv.js";

// CSS-only tooltip: shows on hover and keyboard focus.
const Tip = ({ text, children }) => (
  <span className="tip" tabIndex={0}>
    {children}
    <span className="tipbox" role="tooltip">{text}</span>
  </span>
);

const init = result => ({
  pairs: result.matches.flatMap(m =>
    m.littles.map(l => ({ big: m.big.email, little: l.email, locked: !!l.locked, reason: l.reason }))),
  notes: Object.fromEntries([...result.unmatched_bigs, ...result.unmatched_littles].map(u => [u.email, u.reason])),
});

export default function ResultsPage({ result, onBack, onRerun }) {
  const { people } = result;
  const [{ pairs, notes }, setS] = useState(() => init(result));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const rank = (role, owner, target) => 1 + people[role][owner].ranked.findIndex(r => r.email === target); // 0 = not ranked
  const rk = n => (n ? `#${n}` : "not ranked");
  const littlesOf = b => pairs.filter(p => p.big === b);
  const pairOf = l => pairs.find(p => p.little === l);
  const bigEmails = Object.keys(people.bigs), littleEmails = Object.keys(people.littles);
  const matchedBigs = bigEmails.filter(b => littlesOf(b).length);
  const unBigs = bigEmails.filter(b => !littlesOf(b).length);
  const unLittles = littleEmails.filter(l => !pairOf(l));
  const hasRoom = b => littlesOf(b).length === 0 || (littlesOf(b).length === 1 && people.bigs[b].takes_twins);

  const assign = (l, b) => {
    setMsg("");
    const rest = pairs.filter(p => p.little !== l);
    if (!b) return setS({ pairs: rest, notes: { ...notes, [l]: "Unmatched manually by reviewer." } });
    const n = rest.filter(p => p.big === b).length;
    if (n >= 2 || (n === 1 && !people.bigs[b].takes_twins)) return setMsg(`${people.bigs[b].name} cannot take another little.`);
    const reason = `Manually assigned by reviewer. ${people.bigs[b].name} ranked ${people.littles[l].name}: ${rk(rank("bigs", b, l))}; ` +
      `${people.littles[l].name} ranked ${people.bigs[b].name}: ${rk(rank("littles", l, b))}.`;
    setS({ notes, pairs: [...rest, { big: b, little: l, locked: true, reason }] }); // manual moves are auto-locked
  };
  const toggleLock = l => setS({ notes, pairs: pairs.map(p => (p.little === l ? { ...p, locked: !p.locked } : p)) });

  const rerun = async () => {
    setBusy(true); setMsg("");
    try { await onRerun(pairs.filter(p => p.locked).map(({ big, little }) => ({ big, little }))); }
    catch (e) { setMsg((e.errors || [String(e)]).join(" ")); setBusy(false); }
  };

  const exportCsv = () => downloadCSV([
    ["status", "big_name", "big_email", "little_name", "little_email", "twin", "locked", "reason"],
    ...pairs.map(p => ["MATCHED", people.bigs[p.big].name, p.big, people.littles[p.little].name, p.little,
      littlesOf(p.big).indexOf(p) > 0 ? "yes" : "", p.locked ? "yes" : "", p.reason]),
    ...unBigs.map(b => ["UNMATCHED_BIG", people.bigs[b].name, b, "", "", "", "", notes[b] || ""]),
    ...unLittles.map(l => ["UNMATCHED_LITTLE", "", "", people.littles[l].name, l, "", "", notes[l] || ""]),
  ]);

  // Dropdown: move/assign a little. `current` is her big's email if matched.
  const LittleSelect = ({ little, current }) => (
    <select value="" onChange={e => assign(little, e.target.value === "__none" ? null : e.target.value)}>
      <option value="">{current ? "Move…" : "Assign to big…"}</option>
      {current && <option value="__none">Unmatch</option>}
      {bigEmails.filter(b => b !== current && hasRoom(b)).map(b => (
        <option key={b} value={b}>{people.bigs[b].name} (she ranked big {rk(rank("littles", little, b))}, big ranked her {rk(rank("bigs", b, little))})</option>
      ))}
    </select>
  );

  const status = (role, u, r) => {
    if (!r.email) return "not found in the other file";
    const back = rank(role === "bigs" ? "littles" : "bigs", r.email, u);
    const taken = role === "littles"
      ? littlesOf(r.email).map(p => people.littles[p.little].name)
      : pairOf(r.email) ? [people.bigs[pairOf(r.email).big].name] : [];
    return `${back ? `ranked you ${rk(back)}` : "did not rank you"} · ${taken.length ? "matched with " + taken.join(" & ") : "available"}`;
  };

  const Unmatched = ({ id, role }) => (
    <div className="card">
      <div className="line">
        <Tip text={notes[id] || "Unmatched"}><b>{people[role][id].name}</b></Tip>
        {role === "littles"
          ? <LittleSelect little={id} />
          : (
            <select value="" onChange={e => e.target.value && assign(e.target.value, id)}>
              <option value="">Assign a little…</option>
              {unLittles.map(l => <option key={l} value={l}>{people.littles[l].name} (she ranked big {rk(rank("littles", l, id))}, big ranked her {rk(rank("bigs", id, l))})</option>)}
            </select>
          )}
      </div>
      <ol className="ranked">
        {people[role][id].ranked.map((r, i) => <li key={i}><b>{r.name}</b> <small>{status(role, id, r)}</small></li>)}
        {!people[role][id].ranked.length && <li><small>No rankings submitted</small></li>}
      </ol>
    </div>
  );

  const s = result.summary;
  return (
    <main className="wide">
      <h1>Results</h1>
      <div className="bar">
        <button onClick={onBack}>← New upload</button>
        <button onClick={rerun} disabled={busy}>{busy ? "Re-running…" : `Re-run (keeps ${pairs.filter(p => p.locked).length} locked)`}</button>
        <button className="primary" onClick={exportCsv}>Export CSV</button>
      </div>
      <p>{pairs.length} of {s.littles} littles matched · {unBigs.length} bigs and {unLittles.length} littles unmatched. Hover a name to see why.</p>
      {msg && <div className="box err">{msg}</div>}
      {result.warnings?.length > 0 && <details className="box warn"><summary>{result.warnings.length} upload warnings</summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}

      <h2>Matches ({matchedBigs.length})</h2>
      <div className="cards">
        {matchedBigs.map(b => (
          <div className="card" key={b}>
            <div className="line"><Tip text={littlesOf(b).map(p => p.reason).join("\n\n")}><b>{people.bigs[b].name}</b></Tip>
              {littlesOf(b).length === 2 && <span className="badge">twins</span>}</div>
            {littlesOf(b).map((p, i) => (
              <div className="line" key={p.little}>
                <span>↔ <Tip text={p.reason}>{people.littles[p.little].name}</Tip></span>
                <span>
                  <button className="icon" title={p.locked ? "Locked: re-run won't change this" : "Lock this match"} onClick={() => toggleLock(p.little)}>{p.locked ? "🔒" : "🔓"}</button>
                  <LittleSelect little={p.little} current={b} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2>Unmatched bigs ({unBigs.length})</h2>
      <div className="cards">{unBigs.map(b => <Unmatched key={b} id={b} role="bigs" />)}</div>
      <h2>Unmatched littles ({unLittles.length})</h2>
      <div className="cards">{unLittles.map(l => <Unmatched key={l} id={l} role="littles" />)}</div>
    </main>
  );
}
