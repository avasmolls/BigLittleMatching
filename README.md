# Big/Little Matching

The React source page lives in `application/frontend/index.html`. Vite builds it
and its JavaScript/CSS into `application/backend/static/`, which FastAPI serves.
Do not move or copy the source HTML into the static directory.

From the repository root, build the frontend and start the backend:

```sh
npm --prefix application/backend install
npm --prefix application/backend run build
venv/bin/python -m uvicorn application.backend.main:app --reload
```

Open http://127.0.0.1:8000. Rebuild after frontend changes. Generated static files
are ignored by Git, so build them after cloning and before running backend tests.

Each person runs the app on their own computer. Matching results are returned to
the browser without being saved by the backend. Export a CSV to keep your results
before closing or refreshing the page.

To resume later, choose **Continue where you left off** on the upload screen.
Upload the original bigs CSV, original littles CSV, and the complete CSV saved
with **Export CSV**. The app restores assignments, unmatched people, lock states,
and explanations without recalculating. The files are checked for missing or
unknown participants, duplicate assignments, and capacity conflicts. Recalculate
unlocked matches only when you want the matching algorithm to run again.

For frontend development, run `npm --prefix application/backend run dev` in a
second terminal and open the URL Vite prints. Vite forwards `/api` requests to
FastAPI on port 8000. FastAPI also serves `/api` routes for the built frontend;
the original unprefixed endpoints remain available.

Run backend tests from the repository root:

```sh
venv/bin/python -m pytest application/backend/test_matching.py -q
```
