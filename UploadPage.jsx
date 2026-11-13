import { useEffect, useState } from "react";
import { validate, runMatch } from "./api.js";

function DropZone({ label, file, onFile }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop ${over ? "over" : ""} ${file ? "ok" : ""}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}
    >
      <b>{label}</b>
      <small>{file ? file.name : "Drop a CSV here or click to browse"}</small>
      <input type="file" accept=".csv,.txt" hidden onChange={e => onFile(e.target.files[0])} />
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
      <h1>Big/Little Matching</h1>
      <p>
        Download a template: <a href="/api/templates/bigs.csv">bigs.csv</a> · <a href="/api/templates/littles.csv">littles.csv</a>.
        Rank people as “First Last”.
      </p>
      <div className="grid2">
        <DropZone label="Bigs CSV" file={files.bigs} onFile={f => f && setFiles(s => ({ ...s, bigs: f }))} />
        <DropZone label="Littles CSV" file={files.littles} onFile={f => f && setFiles(s => ({ ...s, littles: f }))} />
      </div>
      {files.bigs && files.littles && !report && <p>Checking files…</p>}
      {report && (
        <>
          <Issues kind="err" title="Errors, fix these before running" items={report.errors} />
          <Issues kind="warn" title="Warnings, please review" items={report.warnings} />
          {report.valid && <div className="box good">Files look good: {report.counts.bigs} bigs, {report.counts.littles} littles.</div>}
        </>
      )}
      <button className="primary" disabled={!report?.valid || busy} onClick={run}>
        {busy ? "Matching…" : "Run matching"}
      </button>
    </main>
  );
}
