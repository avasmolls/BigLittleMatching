"""FastAPI backend. Run:  uvicorn main:app --reload   then open http://127.0.0.1:8000"""
import csv
import io
import json
from pathlib import Path

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from application.backend.matching import run_matching
from application.backend.validation import RANK_COUNT, cross_check, parse_people

BASE = Path(__file__).parent
DATA_DIR = BASE / "data"
LAST_RESULT = DATA_DIR / "last_result.json"   # swap for a database later
MAX_BYTES = 2 * 1024 * 1024

app = FastAPI(title="Big/Little Matching")
api = APIRouter()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/assets", StaticFiles(directory=BASE / "static" / "assets", check_dir=False), name="assets")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(BASE / "static" / "index.html")


async def _read_upload(f: UploadFile, label: str):
    """Basic file checks. Returns (bytes, error)."""
    if not (f.filename or "").lower().endswith((".csv", ".txt")):
        return None, f"{label} file '{f.filename}' is not a .csv file (export from Excel/Sheets as CSV)."
    raw = await f.read()
    if len(raw) > MAX_BYTES:
        return None, f"{label} file is larger than {MAX_BYTES // 1024 // 1024} MB."
    return raw, None


def _preview(people, n=5):
    return [{"name": p.name, "email": p.email, "ranked": len(p.prefs), "takes_twins": p.takes_twins}
            for p in people[:n]]


async def _load(bigs_file: UploadFile, littles_file: UploadFile):
    b_raw, b_bad = await _read_upload(bigs_file, "Bigs")
    l_raw, l_bad = await _read_upload(littles_file, "Littles")
    if b_bad or l_bad:
        return [], [], [e for e in (b_bad, l_bad) if e], []
    bigs, b_err, b_warn = parse_people(b_raw, "big")
    littles, l_err, l_warn = parse_people(l_raw, "little")
    errors, warnings = b_err + l_err, b_warn + l_warn
    if not errors:
        warnings += cross_check(bigs, littles)
    return bigs, littles, errors, warnings


@api.post("/validate")
async def validate(bigs_file: UploadFile = File(...), littles_file: UploadFile = File(...)):
    """Check both CSVs without running the match."""
    bigs, littles, errors, warnings = await _load(bigs_file, littles_file)
    return {"valid": not errors, "errors": errors, "warnings": warnings,
            "counts": {"bigs": len(bigs), "littles": len(littles)},
            "preview": {"bigs": _preview(bigs), "littles": _preview(littles)}}


@api.post("/match")
async def match(bigs_file: UploadFile = File(...), littles_file: UploadFile = File(...),
                locked: str = Form("[]")):
    bigs, littles, errors, warnings = await _load(bigs_file, littles_file)
    try:
        locked_pairs = json.loads(locked)
    except ValueError:
        raise HTTPException(422, detail={"errors": ["'locked' must be valid JSON."], "warnings": []})
    if errors:
        raise HTTPException(422, detail={"errors": errors, "warnings": warnings})
    result = run_matching(bigs, littles, locked_pairs)
    result["warnings"] = warnings
    DATA_DIR.mkdir(exist_ok=True)
    LAST_RESULT.write_text(json.dumps(result, indent=2))
    return result


@api.get("/results/latest")
def latest():
    if not LAST_RESULT.exists():
        raise HTTPException(404, "No matching has been run yet.")
    return json.loads(LAST_RESULT.read_text())


@api.get("/templates/{role}.csv")
def template(role: str):
    if role not in ("bigs", "littles"):
        raise HTTPException(404, "Use 'bigs' or 'littles'.")
    header = ["name", "email"] + [f"rank_{i}" for i in range(1, RANK_COUNT + 1)]
    if role == "bigs":
        header.append("takes_twins")
    buf = io.StringIO()
    csv.writer(buf).writerow(header)
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={role}_template.csv"})


app.include_router(api)
app.include_router(api, prefix="/api")
