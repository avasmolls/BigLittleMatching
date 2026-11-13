import { useEffect, useId, useReducer, useRef, useState } from "react";
import { downloadCSV } from "../backend/exportCsv.js";
import { filterResults } from "./resultFilters.js";
import WorkflowSteps from "./WorkflowSteps.jsx";
import { createReviewState, reviewReducer, reviewSignature } from "./reviewHistory.js";

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

export default function ResultsPage({ result, onBack, onRerun }) {
  const { people } = result;
  const [review, dispatch] = useReducer(reviewReducer, result, createReviewState);
  const { pairs, notes } = review.current;
  const signature = reviewSignature(review.current);
  const hasUnexportedChanges = signature !== review.checkpoint;
  const hasExported = signature === review.exported;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState(null);
  const discardDialog = useRef(null);
  const lastResult = useRef(result);

  useEffect(() => {
    if (lastResult.current !== result) {
      dispatch({ type: "recalculate", result });
      lastResult.current = result;
    }
  }, [result]);
  useEffect(() => {
    if (!hasUnexportedChanges) return;
    const warnOnLeave = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnOnLeave);
    return () => window.removeEventListener("beforeunload", warnOnLeave);
  }, [hasUnexportedChanges]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.undo ? 10000 : 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const confirm = (text, undo = false) => setNotice({ text, undo });
  const undoChange = () => {
    if (busy || !review.undo) return;
    dispatch({ type: "undo" });
    setMsg("");
    confirm("Last match change undone.");
  };
  const startNewUpload = () => {
    if (hasUnexportedChanges) discardDialog.current.showModal();
    else onBack();
  };

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
      dispatch({ type: "change", current: { pairs: rest, notes: { ...notes, [l]: "Unmatched manually by reviewer." } } });
      confirm(`${people.littles[l].name} is now unmatched.`, true);
      return;
    }
    const n = rest.filter(p => p.big === b).length;
    if (n >= 2 || (n === 1 && !people.bigs[b].takes_twins)) return setMsg(`${people.bigs[b].name} cannot take another little.`);
    const reason = `Manually assigned by reviewer. ${people.bigs[b].name} ranked ${people.littles[l].name}: ${rk(rank("bigs", b, l))}; ` +
      `${people.littles[l].name} ranked ${people.bigs[b].name}: ${rk(rank("littles", l, b))}.`;
    dispatch({ type: "change", current: { notes, pairs: [...rest, { big: b, little: l, locked: true, reason }] } }); // manual moves are auto-locked
    confirm(`${people.littles[l].name} ${pairOf(l) ? "moved" : "assigned"} to ${people.bigs[b].name}. Match locked.`, true);
  };
  const toggleLock = l => {
    if (busy) return;
    setMsg("");
    const wasLocked = pairOf(l).locked;
    dispatch({ type: "change", current: { notes, pairs: pairs.map(p => (p.little === l ? { ...p, locked: !p.locked } : p)) } });
    confirm(`Match for ${people.littles[l].name} ${wasLocked ? "unlocked" : "locked"}.`, true);
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
    dispatch({ type: "export" });
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
      <details className="match-explanation">
        <summary>Why unmatched?</summary>
        <p>{notes[id] || "No match is currently assigned."}</p>
      </details>
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
        <button className="new-upload" onClick={startNewUpload} disabled={busy}>← New upload</button>
        {review.undo && <button className="undo-action" disabled={busy} onClick={undoChange}>Undo last change</button>}
        <div className="recalculate-action">
          <button onClick={rerun} disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Recalculating…" : "Recalculate unlocked matches"}</button>
          <small>{lockedCount} locked {lockedCount === 1 ? "match stays" : "matches stay"} in place</small>
        </div>
        <button className="primary export-action" onClick={exportCsv} disabled={busy}>Export CSV <span aria-hidden="true">↓</span></button>
      </div>
      <div className="feedback-status" role="status" aria-live="polite" aria-atomic="true">
        {busy ? <div className="box loading-feedback"><span className="spinner" aria-hidden="true" />Recalculating unlocked matches. Your locked matches will be kept.</div> : notice && <div className="box good confirmation"><span>{notice.text}</span>{notice.undo && review.undo && <button onClick={undoChange}>Undo</button>}</div>}
      </div>
      {hasUnexportedChanges && <p className="unexported-hint">You have changes that haven’t been exported yet.</p>}
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
      <p className="results-hint">Hover a name or open an explanation to see the reasoning.</p>
      {bigEmails.length + littleEmails.length > 0 && !unBigs.length && !unLittles.length && <div className="box good completion-banner"><strong>Everyone is matched!</strong><span>Review your pairs, then export when you’re ready.</span></div>}
      {littleEmails.length > 0 && !unLittles.length && unBigs.length > 0 && <div className="box good completion-banner"><strong>Every little has a match!</strong><span>{unBigs.length} {unBigs.length === 1 ? "big is" : "bigs are"} still available.</span></div>}
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
                <p className="preference-ranks">Big’s choice {rk(rank("bigs", b, p.little))} <span aria-hidden="true">·</span> Little’s choice {rk(rank("littles", p.little, b))}</p>
                <details className="match-explanation">
                  <summary>Why this match?</summary>
                  <p>{p.reason}</p>
                </details>
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
      {visibleCount === 0 && <div className="empty-results">
        <h2>{query.trim() ? "No names found" : filter === "twins" ? "No twin matches yet" : filter === "locked" ? "No locked matches yet" : filter === "unmatched" && bigEmails.length + littleEmails.length > 0 ? "Everyone is matched!" : "No results to show"}</h2>
        <p>{query.trim() ? "Try another name or clear your search and filters." : filter === "twins" ? "Twin matches appear when a big is matched with two littles. A big must be willing to take twins." : filter === "locked" ? "Use “Lock match” on a pair to keep it in place when recalculating." : filter === "unmatched" && bigEmails.length + littleEmails.length > 0 ? "There are no unmatched people to review. You can return to all results or export your pairs." : "There are no people in these results."}</p>
      </div>}
      </div>
      <dialog ref={discardDialog} className="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-description">
        <h2 id="discard-title">Start a new upload?</h2>
        <p id="discard-description">Your match changes haven’t been exported. Starting a new upload will clear these results.</p>
        <div className="dialog-actions">
          <button autoFocus onClick={() => discardDialog.current.close()}>Keep reviewing</button>
          <button onClick={() => { exportCsv(); discardDialog.current.close(); onBack(); }}>Export CSV & start new</button>
          <button className="discard-action" onClick={onBack}>Discard & start new</button>
        </div>
      </dialog>
    </main>
  );
}
