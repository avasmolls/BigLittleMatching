"""FastAPI backend. Run:  uvicorn main:app --reload"""
import csv
import io
import json
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from matching import run_matching
from validation import RANK_COUNT, cross_check, parse_people

DATA_DIR = Path(__file__).parent / "data"
LAST_RESULT = DATA_DIR / "last_result.json"   # swap for a database later

app = FastAPI(title="Big/Little Matching")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


async def _load(bigs_file: UploadFile, littles_file: UploadFile):
    bigs, b_err, b_warn = parse_people(await bigs_file.read(), "big")
    littles, l_err, l_warn = parse_people(await littles_file.read(), "little")
    errors, warnings = b_err + l_err, b_warn + l_warn
    if not errors:
        warnings += cross_check(bigs, littles)
    return bigs, littles, errors, warnings


@app.post("/validate")
async def validate(bigs_file: UploadFile = File(...), littles_file: UploadFile = File(...)):
    """Check both CSVs without running the match."""
    bigs, littles, errors, warnings = await _load(bigs_file, littles_file)
    return {"valid": not errors, "errors": errors, "warnings": warnings,
            "counts": {"bigs": len(bigs), "littles": len(littles)}}


@app.post("/match")
async def match(bigs_file: UploadFile = File(...), littles_file: UploadFile = File(...)):
    bigs, littles, errors, warnings = await _load(bigs_file, littles_file)
    if errors:
        raise HTTPException(422, detail={"errors": errors, "warnings": warnings})
    result = run_matching(bigs, littles)
    result["warnings"] = warnings
    DATA_DIR.mkdir(exist_ok=True)
    LAST_RESULT.write_text(json.dumps(result, indent=2))
    return result


@app.get("/results/latest")
def latest():
    if not LAST_RESULT.exists():
        raise HTTPException(404, "No matching has been run yet.")
    return json.loads(LAST_RESULT.read_text())


@app.get("/templates/{role}.csv")
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
