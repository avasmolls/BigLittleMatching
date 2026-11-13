import { useEffect, useState } from "react";
import { validate, runMatch } from "../backend/api.js";
import WorkflowSteps from "./WorkflowSteps.jsx";

function DropZone({ label, file, onFile, disabled }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop ${over ? "over" : ""} ${file ? "ok" : ""}`}
      onDragOver={e => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) onFile(e.dataTransfer.files[0]); }}
      aria-disabled={disabled}
    >
      <span className="drop-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {file ? <path d="m5 12 4 4L19 6" /> : <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M4 16v4h16v-4" /></>}
        </svg>
      </span>
      <b className="drop-title">{label}</b>
      <span className="drop-description">Upload {label.toLowerCase()}’ preferences</span>
      <span className="drop-file" aria-live="polite">{file ? file.name : "Drop your CSV here"}</span>
      <small>{file ? "File selected · click to replace" : "or click to browse · CSV or TXT"}</small>
      <input disabled={disabled} className="file-input" type="file" aria-label={`${label} preferences file`} accept=".csv,.txt" onChange={e => onFile(e.target.files[0])} />
    </label>
  );
}

const Issues = ({ kind, title, items }) =>
  items?.length ? (
    <div className={`box ${kind}`}>
      <b>{title} ({items.length})</b>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  ) : null;

export default function UploadPage({ onResult }) {
  const [files, setFiles] = useState({ bigs: null, littles: null });
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const chooseFile = (role, file) => {
    if (!file || busy) return;
    setReport(null);
    setFiles(previous => ({ ...previous, [role]: file }));
  };

  // Validate automatically as soon as both files are chosen.
  useEffect(() => {
    setReport(null);
    if (!files.bigs || !files.littles) return;
    let stale = false;
    validate(files.bigs, files.littles)
      .then(r => !stale && setReport(r))
      .catch(e => !stale && setReport({ valid: false, errors: ["Could not reach the server: " + e.message], warnings: [] }));
    return () => { stale = true; };
  }, [files]);

  const run = async () => {
    if (!report?.valid || busy) return;
    setBusy(true);
    try {
      onResult(await runMatch(files.bigs, files.littles), files);
    } catch (e) {
      setReport({ valid: false, errors: e.errors || [String(e)], warnings: e.warnings || [] });
      setBusy(false);
    }
  };

  return (
    <main>
      <WorkflowSteps currentStep={1} />
      <header className="page-header">
        <h1>Big/Little Matching</h1>
        <p>Start with your chapter’s preferences. We’ll help you find the connections.</p>
      </header>
      <p className="template-help">
        Download a template: <a href="/api/templates/bigs.csv">bigs.csv</a> · <a href="/api/templates/littles.csv">littles.csv</a>.
        Rank people as “First Last”.
      </p>
      <div className="grid2">
        <DropZone label="Bigs" file={files.bigs} disabled={busy} onFile={f => chooseFile("bigs", f)} />
        <DropZone label="Littles" file={files.littles} disabled={busy} onFile={f => chooseFile("littles", f)} />
      </div>
      {files.bigs && files.littles && !report && <p role="status"><span className="spinner" aria-hidden="true" /> Checking files and preparing your previews…</p>}
      {(!files.bigs || !files.littles) && <p className="preview-hint">Select both files to preview participant counts and names before matching.</p>}
      {report && (
        <>
          <Issues kind="err" title="Errors, fix these before running" items={report.errors} />
          <Issues kind="warn" title="Warnings, please review" items={report.warnings} />
          {report.valid && <div className="box good">Files look good: {report.counts.bigs} bigs, {report.counts.littles} littles.</div>}
        </>
      )}
      {report?.preview && report?.counts && <section className="upload-preview" aria-labelledby="preview-heading">
        <h2 id="preview-heading">Check your files</h2>
        <p>Make sure each file is in the right group. Showing the first five parsed participants.</p>
        <div className="preview-grid">
          {[["bigs", "Bigs"], ["littles", "Littles"]].map(([role, label]) => (
            <article className="preview-card" key={role}>
              <div className="preview-heading"><h3>{label}</h3><span className="badge">{report.counts[role]} {report.counts[role] === 1 ? "participant" : "participants"}</span></div>
              <p className="preview-filename">{files[role].name}</p>
              {report.preview[role].length ? <ul className="preview-names">
                {report.preview[role].map((person, index) => <li key={index}><strong>{person.name}</strong><small>{person.email}</small></li>)}
              </ul> : <p>No participants could be previewed. Check the file and any errors above.</p>}
              {report.counts[role] > report.preview[role].length && <p className="preview-more">+ {report.counts[role] - report.preview[role].length} more in this file</p>}
            </article>
          ))}
        </div>
      </section>}
      <button className="primary" disabled={!report?.valid || busy} onClick={run}>
        {busy && <span className="spinner" aria-hidden="true" />} {busy ? "Matching…" : "Run matching"}
      </button>
    </main>
  );
}
