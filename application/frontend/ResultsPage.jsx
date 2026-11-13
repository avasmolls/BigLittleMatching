import { useEffect, useId, useState } from "react";
import { downloadCSV } from "../backend/exportCsv.js";
import { filterResults } from "./resultFilters.js";
import WorkflowSteps from "./WorkflowSteps.jsx";

// CSS-only tooltip: shows on hover and keyboard focus.
const Tip = ({ text, children }) => {
  const id = useId();
  return (
    <span className="tip" tabIndex={0} aria-describedby={id}>
      {children}
      <span className="tipbox" id={id} role="tooltip">{text}</span>
    </span>
  );
};

const PersonIdentity = ({ name, role, reason }) => {
  const parts = name.trim().split(/\s+/);
  const initials = [parts[0], ...(parts.length > 1 ? [parts[parts.length - 1]] : [])]
    .map(part => Array.from(part)[0] || "").join("").toUpperCase();
  return (
    <div className={`person-identity person-${role.toLowerCase()}`}>
      <span className="avatar" aria-hidden="true">{initials}</span>
      <div className="person-copy">
        <span className="person-role">{role}</span>
        <Tip text={reason}><strong className="person-name">{name}</strong></Tip>
      </div>
    </div>
  );
};

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState(null);
  const [hasExported, setHasExported] = useState(false);

  useEffect(() => { setS(init(result)); setHasExported(false); }, [result]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const confirm = text => setNotice({ text });

  const rank = (role, owner, target) => 1 + people[role][owner].ranked.findIndex(r => r.email === target); // 0 = not ranked
  const rk = n => (n ? `#${n}` : "not ranked");
  const littlesOf = b => pairs.filter(p => p.big === b);
  const pairOf = l => pairs.find(p => p.little === l);
  const bigEmails = Object.keys(people.bigs), littleEmails = Object.keys(people.littles);
  const matchedBigs = bigEmails.filter(b => littlesOf(b).length);
  const unBigs = bigEmails.filter(b => !littlesOf(b).length);
  const unLittles = littleEmails.filter(l => !pairOf(l));
  const hasRoom = b => littlesOf(b).length === 0 || (littlesOf(b).length === 1 && people.bigs[b].takes_twins);
  const { visibleBigs, visibleUnBigs, visibleUnLittles } = filterResults({ people, pairs, query, filter });
  const visibleCount = visibleBigs.length + visibleUnBigs.length + visibleUnLittles.length;
  const lockedCount = pairs.filter(p => p.locked).length;

  const assign = (l, b) => {
    if (busy) return;
    setMsg("");
    const rest = pairs.filter(p => p.little !== l);
    if (!b) {
      setS({ pairs: rest, notes: { ...notes, [l]: "Unmatched manually by reviewer." } });
      setHasExported(false);
      confirm(`${people.littles[l].name} is now unmatched.`);
      return;
    }
    const n = rest.filter(p => p.big === b).length;
    if (n >= 2 || (n === 1 && !people.bigs[b].takes_twins)) return setMsg(`${people.bigs[b].name} cannot take another little.`);
    const reason = `Manually assigned by reviewer. ${people.bigs[b].name} ranked ${people.littles[l].name}: ${rk(rank("bigs", b, l))}; ` +
      `${people.littles[l].name} ranked ${people.bigs[b].name}: ${rk(rank("littles", l, b))}.`;
    setS({ notes, pairs: [...rest, { big: b, little: l, locked: true, reason }] }); // manual moves are auto-locked
    setHasExported(false);
    confirm(`${people.littles[l].name} ${pairOf(l) ? "moved" : "assigned"} to ${people.bigs[b].name}. Match locked.`);
  };
  const toggleLock = l => {
    if (busy) return;
    setMsg("");
    const wasLocked = pairOf(l).locked;
    setS({ notes, pairs: pairs.map(p => (p.little === l ? { ...p, locked: !p.locked } : p)) });
    setHasExported(false);
    confirm(`Match for ${people.littles[l].name} ${wasLocked ? "unlocked" : "locked"}.`);
  };

  const rerun = async () => {
    if (busy) return;
    setBusy(true); setMsg(""); setNotice(null);
    try {
      await onRerun(pairs.filter(p => p.locked).map(({ big, little }) => ({ big, little })));
      confirm("Unlocked matches recalculated. Locked matches were kept.");
    }
    catch (e) { setMsg((e.errors || [String(e)]).join(" ")); }
    finally { setBusy(false); }
  };

  const exportCsv = () => {
    downloadCSV([
    ["status", "big_name", "big_email", "little_name", "little_email", "twin", "locked", "reason"],
    ...pairs.map(p => ["MATCHED", people.bigs[p.big].name, p.big, people.littles[p.little].name, p.little,
      littlesOf(p.big).indexOf(p) > 0 ? "yes" : "", p.locked ? "yes" : "", p.reason]),
    ...unBigs.map(b => ["UNMATCHED_BIG", people.bigs[b].name, b, "", "", "", "", notes[b] || ""]),
    ...unLittles.map(l => ["UNMATCHED_LITTLE", "", "", people.littles[l].name, l, "", "", notes[l] || ""]),
    ]);
    setHasExported(true);
    confirm("CSV download started. Your export includes all results.");
  };

  // Dropdown: move/assign a little. `current` is her big's email if matched.
  const LittleSelect = ({ little, current }) => (
    <select disabled={busy} aria-label={`${current ? "Move" : "Assign"} ${people.littles[little].name}`} value="" onChange={e => assign(little, e.target.value === "__none" ? null : e.target.value)}>
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

  const renderUnmatched = (id, role) => (
    <div className="card unmatched-card" key={id}>
      <PersonIdentity name={people[role][id].name} role={role === "bigs" ? "Big" : "Little"} reason={notes[id] || "Unmatched"} />
      <div className="assignment-controls">
        {role === "littles"
          ? <LittleSelect little={id} />
          : (
            <select disabled={busy} aria-label={`Assign a little to ${people.bigs[id].name}`} value="" onChange={e => e.target.value && assign(e.target.value, id)}>
              <option value="">Assign a little…</option>
              {unLittles.map(l => <option key={l} value={l}>{people.littles[l].name} (she ranked big {rk(rank("littles", l, id))}, big ranked her {rk(rank("bigs", id, l))})</option>)}
            </select>
          )}
      </div>
      <details className="preferences">
        <summary>View preferences <span className="preference-count">({people[role][id].ranked.length})</span></summary>
        {people[role][id].ranked.length ? (
          <ol className="ranked">
            {people[role][id].ranked.map((r, i) => <li key={i}><b>{r.name}</b> <small>{status(role, id, r)}</small></li>)}
          </ol>
        ) : <p className="empty-preferences">No rankings submitted</p>}
      </details>
    </div>
  );

  const s = result.summary;
  return (
    <main className="wide">
      <WorkflowSteps currentStep={hasExported ? 3 : 2} />
      <header className="page-header">
        <h1>Review your matches</h1>
        <p>Make any adjustments, lock the matches you want to keep, then export your results.</p>
      </header>
      <div className="bar results-toolbar">
        <button className="new-upload" onClick={onBack} disabled={busy}>← New upload</button>
        <div className="recalculate-action">
          <button onClick={rerun} disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Recalculating…" : "Recalculate unlocked matches"}</button>
          <small>{lockedCount} locked {lockedCount === 1 ? "match stays" : "matches stay"} in place</small>
        </div>
        <button className="primary export-action" onClick={exportCsv} disabled={busy}>Export CSV <span aria-hidden="true">↓</span></button>
      </div>
      <div className="feedback-status" role="status" aria-live="polite" aria-atomic="true">
        {busy ? <div className="box loading-feedback"><span className="spinner" aria-hidden="true" />Recalculating unlocked matches. Your locked matches will be kept.</div> : notice && <div className="box good confirmation">{notice.text}</div>}
      </div>
      <dl className="summary-cards" aria-label="Matching summary">
        <div className="summary-card summary-matched">
          <dt>Matched littles</dt>
          <dd>{pairs.length}<span>of {s.littles} littles</span></dd>
        </div>
        <div className="summary-card">
          <dt>Unmatched littles</dt>
          <dd>{unLittles.length}<span>without a match</span></dd>
        </div>
        <div className="summary-card">
          <dt>Unmatched bigs</dt>
          <dd>{unBigs.length}<span>without a match</span></dd>
        </div>
      </dl>
      <p className="results-hint">Hover or focus a name to see why they were matched or left unmatched.</p>
      {msg && <div className="box err" role="alert">{msg}</div>}
      {result.warnings?.length > 0 && <details className="box warn"><summary>{result.warnings.length} upload warnings</summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}

      <section className="results-search" aria-label="Search and filter results">
        <label className="search-label" htmlFor="results-search">Search by name</label>
        <div className="search-input-row">
          <input id="results-search" type="search" placeholder="Find a big or little…" value={query} onChange={e => setQuery(e.target.value)} />
          {(query || filter !== "all") && <button onClick={() => { setQuery(""); setFilter("all"); }}>Clear search & filters</button>}
        </div>
        <div className="filter-options" role="group" aria-label="Filter results">
          {[["all", "All results"], ["unmatched", "Unmatched people"], ["twins", "Twin matches"], ["locked", "Locked matches"]].map(([value, label]) => (
            <button key={value} className={`filter-button ${filter === value ? "active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <p className="filter-description" role="status">Showing {visibleCount} {visibleCount === 1 ? "card" : "cards"}. Matches stay grouped. Summary totals and CSV include all results.</p>
      </section>
      <div aria-busy={busy}>
      {visibleBigs.length > 0 && <>
      <h2>Matches ({visibleBigs.length})</h2>
      <div className="cards">
        {visibleBigs.map(b => (
          <div className="card match-card" key={b}>
            <div className="match-header">
              <PersonIdentity name={people.bigs[b].name} role="Big" reason={littlesOf(b).map(p => p.reason).join("\n\n")} />
              {littlesOf(b).length === 2 && <span className="badge">Twins</span>}
            </div>
            {littlesOf(b).map(p => (
              <div className="match-little" key={p.little}>
                <PersonIdentity name={people.littles[p.little].name} role="Little" reason={p.reason} />
                <div className="assignment-controls">
                  <button disabled={busy} className={`lock-control ${p.locked ? "is-locked" : ""}`} aria-pressed={p.locked} aria-label={`${p.locked ? "Unlock" : "Lock"} match for ${people.littles[p.little].name}`} title={p.locked ? "Locked: recalculating won't change this match" : "Lock this match to keep it when recalculating"} onClick={() => toggleLock(p.little)}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="10" width="14" height="11" rx="2" />
                      <path d={p.locked ? "M8 10V6a4 4 0 0 1 8 0v4" : "M8 10V6a4 4 0 0 1 8 0"} />
                    </svg>
                    {p.locked ? "Locked" : "Lock match"}
                  </button>
                  <LittleSelect little={p.little} current={b} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      </>}
      {visibleUnBigs.length > 0 && <>
        <h2>Unmatched bigs ({visibleUnBigs.length})</h2>
        <div className="cards">{visibleUnBigs.map(b => renderUnmatched(b, "bigs"))}</div>
      </>}
      {visibleUnLittles.length > 0 && <>
        <h2>Unmatched littles ({visibleUnLittles.length})</h2>
        <div className="cards">{visibleUnLittles.map(l => renderUnmatched(l, "littles"))}</div>
      </>}
      {visibleCount === 0 && <div className="empty-results"><h2>No results to show</h2><p>{query || filter !== "all" ? "Try a different name or clear your filters." : "There are no people in these results."}</p></div>}
      </div>
    </main>
  );
}
