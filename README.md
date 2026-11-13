# Big/Little Matching

A CSV-based tool for matching bigs and littles, reviewing the results, making manual adjustments, and exporting a review you can continue later.

The app combines a React frontend with a FastAPI backend. Run both together on your computer through one local address, or deploy the same app as a web service.

**Workflow:** Upload files → Review matches → Export.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [First-time setup](#first-time-setup)
- [Running the app again](#running-the-app-again)
- [Preparing your CSV files](#preparing-your-csv-files)
- [Starting a new review](#starting-a-new-review)
- [How matching works](#how-matching-works)
- [Reviewing and adjusting results](#reviewing-and-adjusting-results)
- [Exporting and continuing later](#exporting-and-continuing-later)
- [Data handling](#data-handling)
- [Frontend development](#frontend-development)
- [Tests](#tests)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Deploying on Render](#deploying-on-render)
- [Updating the project](#updating-the-project)
- [Troubleshooting](#troubleshooting)

## Features

- Upload separate bigs and littles preference files, with up to ten ranked choices per person.
- Validate required columns, emails, duplicate participants, and rankings before matching.
- Preview filenames, participant counts, and the first five parsed participants in each file.
- Generate matches from mutual preferences, with deterministic tie-breaking and optional twins.
- Review matched and unmatched people, preference ranks, and explanations.
- Search by name and filter for unmatched people, twin matches, or locked matches.
- Move, assign, unmatch, lock, and unlock pairs, with Undo for the most recent change.
- Recalculate unlocked matches while preserving locked pairs.
- Export the complete review to CSV and restore it later with the original preference files.
- Use responsive layouts, keyboard-accessible controls, and expandable explanations on touchscreens.

## Requirements

Install these tools before setting up the project:

| Tool | Purpose |
| --- | --- |
| Python | Runs FastAPI, CSV validation, and matching. The local project has been tested with Python 3.12.5. |
| Node.js and npm | Install frontend dependencies and build React with Vite. The local project has been tested with Node.js 24.22.0. |
| Git | Clones the repository and pulls updates. |
| A modern browser | Displays the application, file selectors, and review dialogs. |

Python dependencies are listed in [requirements.txt](application/backend/requirements.txt). Frontend dependencies and npm scripts are in [package.json](application/backend/package.json), with exact npm dependency resolutions recorded in the adjacent lockfile.

The Python requirements use minimum versions rather than a fully pinned environment. A fresh installation can resolve different package versions from an existing installation.

## First-time setup

Run commands from the repository root: the folder containing this README and the `application` directory.

### macOS or Linux

```sh
git clone https://github.com/avasmolls/BigLittleMatching.git
cd BigLittleMatching
python3 -m venv venv
venv/bin/python -m pip install -r application/backend/requirements.txt
npm --prefix application/backend ci
npm --prefix application/backend run build
venv/bin/python -m uvicorn application.backend.main:app --reload
```

### Windows PowerShell

```powershell
git clone https://github.com/avasmolls/BigLittleMatching.git
cd BigLittleMatching
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r application/backend/requirements.txt
npm --prefix application/backend ci
npm --prefix application/backend run build
.\venv\Scripts\python.exe -m uvicorn application.backend.main:app --reload
```

These commands call the virtual environment's Python directly, so you do not need to activate it.

If you already have the repository, skip cloning and change into your existing project folder instead.

Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** after the server starts. Keep the terminal open while using the app. Press **Ctrl+C** to stop it.

The frontend build creates `application/backend/static/index.html` and its JavaScript/CSS assets. This generated folder is ignored by Git, so every fresh checkout needs a frontend build.

## Running the app again

Once dependencies are installed and the frontend has been built:

```sh
venv/bin/python -m uvicorn application.backend.main:app --reload
```

On Windows, replace `venv/bin/python` with `.\venv\Scripts\python.exe`.

Rebuild after changing or pulling frontend code:

```sh
npm --prefix application/backend run build
```

Python's `--reload` restarts the backend when Python files change. It does not rebuild the frontend.

A local `127.0.0.1` link works only on the computer running the server. To use the app locally on another computer, set up a separate copy there. For one public link, see [Deploying on Render](#deploying-on-render).

## Preparing your CSV files

Start the app and download **bigs.csv** and **littles.csv** from the upload screen. Fill the templates in a spreadsheet editor, then export them as CSV.

### Required columns

| Column | Bigs file | Littles file | Meaning |
| --- | --- | --- | --- |
| `name` | Required | Required | Participant's full name. |
| `email` | Required | Required | Participant's email address; also used to identify people when restoring a review. |
| `rank_1` through `rank_10` | All ten column headers required | All ten column headers required | Names from the opposite group, in preference order. Individual cells may be blank. |
| `takes_twins` | Required | Omit | Whether the big is willing to take two littles. Use `yes` or `no`. |

Keep all ten ranking columns even when a person submits fewer than ten choices. Put the strongest choice in `rank_1` and leave unused trailing cells blank.

The parser also recognizes these header aliases:

- `full_name` for `name`.
- `email_address` for `email`.
- `twins` or `twin` for `takes_twins`.
- `rank1`, `choice_1`, `choice1`, or `1` for `rank_1`, and the corresponding forms through rank ten.

Headers are case-insensitive; spaces and hyphens are normalized to underscores.

### File support

- Accepted extensions: `.csv` and `.txt` containing CSV-style data.
- Maximum size: **2 MiB per file**.
- Delimiters: comma, semicolon, or tab, detected from the header.
- Encodings: UTF-8, including a byte-order mark, with Windows-1252 and Latin-1 fallbacks.
- `.xlsx` files must be exported as CSV first.
- Fully blank rows and empty trailing unnamed spreadsheet-export columns are ignored.

### Names and participant identity

Preference cells contain **names**, not email addresses. Use the same spelling and full-name format as the opposite group's participant list.

Automatic matching converts names to a key using the first initial plus the final word of the name, lowercased with accents, punctuation, and spaces removed. For example:

| Name | Match key |
| --- | --- |
| `Ann Lee` | `alee` |
| `Bea Lee` | `blee` |
| `José Núñez` | `jnunez` |
| `Smith, Katie` | `ksmith` |

`Ann Lee` and `Amy Lee` both produce `alee`, so they cannot appear together in the same input file. The current system does not disambiguate people with the same first initial and last name. Middle names do not resolve that collision. Use accurate, distinct records rather than inventing different names to bypass validation.

Email addresses must be unique within each file, ignoring case. Names drive preference matching; emails connect saved results to the uploaded participants.

### Validation errors and warnings

**Errors block matching.** Examples include missing columns, invalid or duplicate emails, duplicate match keys, self-rankings, repeated ranked names, and invalid `takes_twins` values.

**Warnings allow matching.** Examples include ranked names not found in the other file, no submitted rankings, a twins column in the littles file, or a ranking filled after a blank cell. Gaps are compacted, so later choices move up to fill them.

Review warnings before continuing: they can explain why someone remains unmatched.

## Starting a new review

1. Choose **Start new matches** on the upload screen.
2. Upload the bigs CSV and littles CSV.
3. Wait for validation and inspect the participant previews to check that the files are in the correct groups.
4. Correct blocking errors in the source files, export corrected CSVs, and upload them again.
5. Review warnings, then select **Run matching**.
6. Review the results and export when ready.

The three-step guide highlights your current stage. After an export begins, the Export step is highlighted. Editing the results returns the guide to Review matches.

## How matching works

The automatic algorithm is deterministic and greedy: it processes preferred candidate pairs in order and keeps assignments as it goes. It does **not** guarantee a globally optimal solution, the maximum possible number of matches, or a formal stable matching.

### Candidate pairs and priorities

An automatic candidate exists only when both people rank each other.

For each mutual pair, let `br` be the big's ranking of the little and `lr` be the little's ranking of the big. Candidates are sorted by:

1. Lowest `br + lr` rank sum.
2. Lowest `max(br, lr)`, preferring more balanced rankings at the same sum.
3. The little's ranking of the big.
4. The big's ranking of the little.
5. Normalized big and little name keys for a deterministic final ordering.

For example, a `#2 / #2` pair sorts before a `#1 / #3` pair because both have a sum of four but `2 / 2` is more balanced. A `#2 / #1` pair sorts before a `#1 / #2` pair because the little ranks the big first.

### Assignment passes

1. **Place reviewer-locked pairs first.** These remain in place during recalculation.
2. **Assign singles.** Walk the candidate order, assigning a pair when the big has no little and the little has no big.
3. **Assign twins.** Walk the candidate order again. A big may receive a second little when she accepts twins, currently has exactly one little, the second little is still unmatched, and that little is in the big's top five choices.

A little receives at most one big. Automatic matching does not create triplets. The top-five twin rule applies to the **second little added by the automatic algorithm**.

### Manual decisions

The review interface lets a reviewer override mutual-preference and automatic top-five restrictions. Manual assignments still enforce the big's capacity: one little normally, or two when she accepts twins. A manual assignment automatically locks the resulting pair.

These overrides are deliberate review decisions. Inspect the displayed preference ranks and explanations before accepting them.

## Reviewing and adjusting results

### Summary, search, and filters

Summary cards show matched littles, unmatched littles, and unmatched bigs.

Search accepts either a big's or a little's name and ignores capitalization and accents. Filters show all results, unmatched people, twin matches, or locked matches. A big and her littles stay grouped: a locked-matches filter can therefore also display an unlocked sibling in the same twin card.

**Summary totals and CSV exports always include the complete review**, regardless of search or filters.

### Explanations and preferences

- Hover or keyboard-focus a name for its tooltip.
- Open **Why this match?** or **Why unmatched?** for an explanation that stays open and works on touchscreens.
- Match cards show both people's preference ranks. `not ranked` indicates that the participant did not rank the other person.
- Open **View preferences** on an unmatched card to inspect its ranked list and the availability of those people.

### Editing assignments

- Use a matched little's **Move…** menu to move her to another big with space, or choose **Unmatch**.
- Use an unmatched little's **Assign to big…** control to assign her.
- Use an unmatched big's **Assign a little…** control to choose an unmatched little.
- Select **Lock match** to preserve a pair during recalculation, or **Locked** to unlock it.

A confirmation appears after each change. Use **Undo** in that confirmation or **Undo last change** in the toolbar to reverse the most recent assignment, unmatch, or lock change. Undo restores one change; it is not a full revision history. Exporting or successfully recalculating clears the available undo.

### Recalculating

**Recalculate unlocked matches** sends the original preference files and the currently locked pairs to the backend. Locked pairs are retained; the remaining assignments are calculated again.

An unlocked existing pair is not guaranteed to survive. Someone manually left unmatched can be matched again. Lock every pair you want preserved before recalculating.

Editing controls are disabled while recalculation runs. Search and filters remain selected afterward.

### Leaving a review

If your current results differ from the initial review or your most recent export, **New upload** opens a confirmation with options to keep reviewing, export and start new, or discard and start new.

The app also requests a browser warning before leaving a page with unexported edits. Browser behavior varies, so always export before closing or refreshing. Initial generated or restored results are not considered new edits merely because you opened them.

## Exporting and continuing later

### Export a review

Select **Export CSV**. The browser starts downloading `big_little_matches.csv`, containing every matched pair and every unmatched participant.

| Export column | Meaning |
| --- | --- |
| `status` | `MATCHED`, `UNMATCHED_BIG`, or `UNMATCHED_LITTLE`. |
| `big_name`, `big_email` | Big's identity; blank for an unmatched little. |
| `little_name`, `little_email` | Little's identity; blank for an unmatched big. |
| `twin` | `yes` on the second little in a twin pair; blank otherwise. |
| `locked` | `yes` when a matched pair is locked; blank otherwise. |
| `reason` | The explanation shown for that match or unmatched participant. |

CSV cells are quoted and escaped. Values beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe to reduce spreadsheet formula interpretation; the resume parser reverses this protection.

Keep the exported results **and both original preference CSVs** together. The results export contains assignments and reasons, but not everyone's complete preference lists.

### Continue a saved review

1. Choose **Continue where you left off** on the upload screen.
2. Upload the original bigs CSV and original littles CSV.
3. Upload the complete results CSV previously downloaded using **Export CSV**.
4. Check the validation report and restored-match/lock counts.
5. Select **Continue reviewing matches**.

The app restores assignments, unlocked and locked states, unmatched people, and explanations. It does **not** recalculate or automatically fill unmatched slots. Manual pairs without mutual rankings are preserved.

Restore validation checks that:

- The required export columns and recognized statuses are present.
- Every participant from the preference files is represented, including unmatched people.
- Emails correspond to the uploaded groups; saved-email comparison ignores case.
- Each little appears once and unmatched bigs are not duplicated.
- A big is not listed as both matched and unmatched.
- Assignments fit the big's capacity and twin markers are consistent.
- Unmatched rows are not marked as locked or twins.

Use the original files, with unchanged emails and preferences. Identity checks cannot detect every change to preference contents; changed preferences would affect displayed ranks and future recalculations even when email validation passes.

Do not remove unmatched rows, trim the export to filtered results, or upload a preference template as the saved-results file. Search text, filters, open explanations, and Undo history are not stored in the export.

## Data handling

The backend processes uploaded files and returns results without saving matching results to a file or database. There is no latest-results retrieval endpoint. The browser holds the active review in memory; closing or refreshing the page loses that in-memory state.

Export is the supported way to save a review. Resume requires the exported CSV plus both original preference files.

When running locally, uploads go to the backend on your computer. When using a hosted deployment, uploads go to that hosted backend. The app has no accounts, login system, or persistent per-user sessions. Keep personal participant files and old local data out of Git; removing an endpoint does not delete any legacy files already on disk.

## Frontend development

Use two terminals, both at the repository root.

**Terminal 1: FastAPI**

```sh
venv/bin/python -m uvicorn application.backend.main:app --reload
```

**Terminal 2: Vite**

```sh
npm --prefix application/backend run dev
```

Open the URL Vite prints, normally **[http://localhost:5173](http://localhost:5173)**. Vite provides frontend updates and proxies `/api/*` requests to FastAPI on port 8000, removing the `/api` prefix before forwarding.

The source HTML belongs at `application/frontend/index.html`. Do not copy it into the backend's static folder: it refers to source JSX that Vite must transform.

The npm manifest and Vite configuration currently live under `application/backend`, while React source files live under `application/frontend`. Keep the `--prefix application/backend` option when running npm from the repository root. The Vite configuration resolves React dependencies relative to that manifest/configuration location, including when no root-level `node_modules` folder exists.

When finished, run `npm --prefix application/backend run build` to update the version served by FastAPI on port 8000.

## Tests

Build the frontend before running the backend suite: some API tests check the generated page and its assets.

```sh
npm --prefix application/backend run build
venv/bin/python -m pytest application/backend -q
node --test application/frontend/resultFilters.test.js application/frontend/reviewHistory.test.js
```

Use the Windows Python path shown in setup when running these commands in PowerShell.

The suites cover CSV validation, name keys, matching priorities and twins, API behavior, static assets, saved-review restoration and rejection cases, filtering, Undo, and export checkpoints. Backend tests also check that matching and resuming do not write result files.

These are automated logic/API checks, not a browser end-to-end suite. After changing UI behavior, also check uploads, manual moves, lock/unlock, Undo, explanations, filters, export, and resume in a browser, including a narrow/mobile layout.

## Project structure

```text
BigLittleMatching/
├── README.md
├── application/
│   ├── backend/
│   │   ├── main.py                  # FastAPI routes, upload checks, static serving
│   │   ├── validation.py            # Preference-file parsing and validation
│   │   ├── matching.py              # Matching algorithm and result metadata
│   │   ├── resume.py                # Saved-results validation and restoration
│   │   ├── test_matching.py         # Matching, validation, and API tests
│   │   ├── test_resume.py           # Saved-review tests
│   │   ├── requirements.txt
│   │   ├── api.js                   # Frontend HTTP client
│   │   ├── exportCsv.js             # Browser CSV download helper
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── vite.config.js
│   │   └── static/                  # Generated build; ignored by Git
│   └── frontend/
│       ├── index.html
│       ├── main.jsx                 # React entry point
│       ├── App.jsx                  # Upload/results view coordination
│       ├── UploadPage.jsx           # Upload modes, validation, and previews
│       ├── ResultsPage.jsx          # Review, editing, explanations, export
│       ├── WorkflowSteps.jsx
│       ├── resultFilters.js
│       ├── resultFilters.test.js
│       ├── reviewHistory.js
│       ├── reviewHistory.test.js
│       └── styles.css
└── venv/                            # Local Python environment; ignored by Git
```

Dependency folders named `node_modules` are ignored by Git. A normal prefixed npm installation places frontend dependencies under `application/backend/node_modules`.

## API reference

Open **[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)** while FastAPI is running for interactive API documentation.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Serve the built frontend. |
| `GET` | `/assets/...` | Serve generated JavaScript and CSS. |
| `POST` | `/api/validate` | Validate preference files and optionally a saved-results export; return counts and previews. |
| `POST` | `/api/match` | Generate matches, optionally preserving locked pairs. |
| `POST` | `/api/resume` | Restore a validated saved export without recalculating assignments. |
| `GET` | `/api/templates/bigs.csv` | Download the bigs template. |
| `GET` | `/api/templates/littles.csv` | Download the littles template. |

The API routes also support their unprefixed equivalents, such as `/validate`, `/match`, and `/resume`. `/results/latest` and `/api/results/latest` are intentionally absent.

### Multipart request fields

| Field | Used by | Description |
| --- | --- | --- |
| `bigs_file` | Validate, match, resume | Required bigs preference file. |
| `littles_file` | Validate, match, resume | Required littles preference file. |
| `results_file` | Resume; optionally validate | Complete previously exported results CSV. Required for resume. |
| `locked` | Match | Optional JSON array of email pairs, supplied as a form string. Defaults to `[]`. |

Example locked-pair value:

```json
[{"big": "ann@example.edu", "little": "bea@example.edu"}]
```

Example resume request from a POSIX shell, replacing filenames with your own:

```sh
curl -X POST http://127.0.0.1:8000/api/resume \
  -F 'bigs_file=@bigs.csv' \
  -F 'littles_file=@littles.csv' \
  -F 'results_file=@big_little_matches.csv'
```

Validation reports include `valid`, `errors`, `warnings`, `counts`, `preview`, and `saved_summary`. Matching and resume responses include `people`, `matches`, `unmatched_bigs`, `unmatched_littles`, `summary`, and `warnings`. Invalid uploads to match/resume return HTTP 422 with error details. Validation reports ordinary file-validation failures with `valid: false` in its response.

The match endpoint expects well-formed locked-pair objects from the review interface; it is not a general authentication or authorization boundary.

## Deploying on Render

A hosted instance serves both React and FastAPI from one URL. Connect this repository through Render's GitHub integration, create a **Web Service**, and use:

| Setting | Value |
| --- | --- |
| Runtime | Python 3 |
| Branch | The branch you intend to publish, normally `main`. |
| Root directory | Leave blank so commands run at the repository root. |
| Build command | The command below. |
| Start command | The command below. |

Build command:

```sh
pip install -r application/backend/requirements.txt && npm --prefix application/backend ci && npm --prefix application/backend run build
```

Start command:

```sh
uvicorn application.backend.main:app --host 0.0.0.0 --port $PORT
```

Use the public URL Render assigns after a successful deployment. Keep the npm build in the deployment command: generated static assets are not committed to Git.

With **Auto-Deploy → On Commit** enabled for the connected branch, pushing or merging changes to that branch triggers a rebuild and deployment. A local commit without a push does not update the service. Check the deploy logs and deployed commit if a change is missing. Services created using only a public repository URL, without a connected Git provider, require manual deployment.

See Render's [FastAPI deployment guide](https://render.com/docs/deploy-fastapi) and [deployment settings](https://render.com/docs/deploys) for provider-specific setup and manual deployments.

A hosted deployment changes where participant uploads are processed. Review access requirements before sharing a hosted instance; the project does not include login or user accounts.

## Updating the project

From an existing checkout with no conflicting local changes:

```sh
git pull
venv/bin/python -m pip install -r application/backend/requirements.txt
npm --prefix application/backend ci
npm --prefix application/backend run build
```

Restart the backend afterward. Use the Windows Python path on Windows.

To publish your own code changes:

```sh
git status
git add <specific-files-you-changed>
git diff --cached --stat
git commit -m "Describe the change"
git push
```

Replace the angle-bracket placeholder with actual file paths. Review staged files before committing. Do not include participant CSVs, old matching data, `.DS_Store`, virtual environments, dependency folders, or generated static assets.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Page fails because `backend/static/index.html` is missing | Run `npm --prefix application/backend ci`, then `npm --prefix application/backend run build`. |
| Frontend changes do not appear on port 8000 | Rebuild the frontend, then refresh. Use Vite's development URL while actively editing. |
| `react/jsx-runtime` cannot be resolved during a build | Install dependencies with the prefixed npm command and ensure the current `vite.config.js` with React aliases is present. Do not externalize React merely to silence the error. |
| `No module named fastapi` or `pytest` | Install requirements using the virtual environment's Python and use that same Python to start the app or run tests. |
| `No module named application` | Run from the repository root and use `application.backend.main:app` as the Uvicorn import path. |
| The frontend cannot reach the backend | Start FastAPI. Vite's proxy expects it on `127.0.0.1:8000`. |
| Port 8000 is already in use | Stop the existing server with Ctrl+C, or use `--port 8001` and open that port. If using Vite, update its proxy target to match. |
| A file is rejected as not CSV | Export the spreadsheet as `.csv`; renaming an `.xlsx` extension does not convert its contents. |
| Missing ranking-column errors | Keep every header from `rank_1` through `rank_10`, even when choices are blank. |
| Duplicate match-key errors | Check for people sharing the same first initial and last name. The current name-key scheme cannot distinguish them within a file. |
| Someone stays unmatched | Inspect warnings, mutual rankings, other assignments, and the automatic top-five restriction for the second twin. Open their explanation and preference list. |
| Resume reports unknown or missing participants | Use both original preference CSVs and the complete original results export, including unmatched rows. Keep email addresses unchanged. |
| Resume reports twin or capacity conflicts | Check the bigs file is the original version and that the saved export has not been manually altered. |
| A manual choice changed after recalculation | Only locked pairs are preserved. Manual assignments start locked, but can be unlocked by the reviewer. |
| Results disappeared after refreshing | Active results are held in browser memory. Restore from your exported results CSV and both original input files. |
| GitHub changes are not visible on Render | Confirm the pushed branch, Auto-Deploy setting, successful build, and live commit in Render. |
