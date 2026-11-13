import csv
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from application.backend.main import app
from application.backend.matching import run_matching
from application.backend.resume import parse_saved_results, restore_results
from application.backend.validation import parse_people


def csv_bytes(header, rows, delimiter=","):
    out = io.StringIO(newline="")
    writer = csv.writer(out, delimiter=delimiter)
    writer.writerow(header)
    writer.writerows(rows)
    return out.getvalue().encode("utf-8-sig")


HEADER = ["status", "big_name", "big_email", "little_name", "little_email", "twin", "locked", "reason"]
SAVED = [
    ["MATCHED", "Big One", "one@x.edu", "Little A", "a@x.edu", "", "", 'Reviewed manually, kept unlocked.\nA "quoted" explanation.'],
    ["UNMATCHED_BIG", "Big Two", "two@x.edu", "", "", "", "", "Left unmatched by reviewer."],
    ["UNMATCHED_LITTLE", "", "", "Little B", "b@x.edu", "", "", "Unmatched manually by reviewer."],
    ["UNMATCHED_LITTLE", "", "", "Little C", "c@x.edu", "", "", "Still reviewing."],
]


@pytest.fixture
def inputs():
    header = ["name", "email"] + [f"rank_{n}" for n in range(1, 11)]
    bigs_raw = csv_bytes(header + ["takes_twins"], [
        ["Big One", "one@x.edu", "Little A", "Little B", "Little C"] + [""] * 7 + ["yes"],
        ["Big Two", "two@x.edu", "Little B", "Little A", "Little C"] + [""] * 7 + ["no"],
    ])
    littles_raw = csv_bytes(header, [[f"Little {name}", f"{name.lower()}@x.edu", "Big One", "Big Two"] + [""] * 8 for name in "ABC"])
    bigs, errors, _ = parse_people(bigs_raw, "big")
    assert not errors
    littles, errors, _ = parse_people(littles_raw, "little")
    assert not errors
    return bigs_raw, littles_raw, bigs, littles


def test_restore_preserves_unlocked_matches_unmatched_people_and_explanations(inputs):
    _, _, bigs, littles = inputs
    rows, errors = parse_saved_results(csv_bytes(HEADER, SAVED), bigs, littles)
    assert not errors
    result = restore_results(bigs, littles, rows)
    assert run_matching(bigs, littles)["summary"]["matched_littles"] == 3
    assert result["summary"]["matched_littles"] == 1
    restored = result["matches"][0]["littles"][0]
    assert restored["email"] == "a@x.edu" and restored["locked"] is False
    assert restored["reason"] == SAVED[0][-1]
    assert result["unmatched_bigs"][0]["reason"] == SAVED[1][-1]
    assert [person["reason"] for person in result["unmatched_littles"]] == [row[-1] for row in SAVED[2:]]


def test_restore_twins_and_lock_flags_with_reordered_export_rows(inputs):
    _, _, bigs, littles = inputs
    saved = [SAVED[0], SAVED[1], ["MATCHED", "Big One", "one@x.edu", "Little B", "b@x.edu", "yes", "yes", "Manual twin."], SAVED[3]]
    rows, errors = parse_saved_results(csv_bytes(HEADER, list(reversed(saved)), delimiter=";"), bigs, littles)
    assert not errors
    result = restore_results(bigs, littles, rows)
    assert result["summary"]["twin_sets"] == 1
    assert [(person["email"], person["locked"], person["is_twin"]) for person in result["matches"][0]["littles"]] == [
        ("a@x.edu", False, False), ("b@x.edu", True, True),
    ]


def test_resume_validation_and_api_recalculation(inputs, monkeypatch):
    bigs_raw, littles_raw, _, _ = inputs
    client = TestClient(app)
    files = {"bigs_file": ("bigs.csv", bigs_raw), "littles_file": ("littles.csv", littles_raw),
             "results_file": ("matches.csv", csv_bytes(HEADER, SAVED))}
    report = client.post("/api/validate", files=files).json()
    assert report["valid"] is True
    assert report["saved_summary"] == {"matched_littles": 1, "locked_matches": 0}
    def reject_write(*args, **kwargs):
        pytest.fail("Restoring a review must not save results on the backend.")
    monkeypatch.setattr(Path, "write_text", reject_write)
    response = client.post("/api/resume", files=files)
    assert response.status_code == 200
    result = response.json()
    assert result["summary"]["matched_littles"] == 1
    assert result["people"]["bigs"]["one@x.edu"]["ranked"][0]["email"] == "a@x.edu"
    # Recalculation is an explicit, separate action after resuming.
    recalculated = client.post("/api/match", files={key: value for key, value in files.items() if key != "results_file"})
    assert recalculated.json()["summary"]["matched_littles"] == 3


@pytest.mark.parametrize("kind, expected", [
    ("duplicate", "appears more than once"),
    ("unknown", "email not found"),
    ("missing", "every participant"),
    ("status", "unknown status"),
    ("lock", "locked and twin"),
    ("capacity", "more littles"),
    ("conflict", "both matched and unmatched"),
    ("twin", "twin markers"),
    ("unmatched_lock", "unmatched rows cannot"),
])
def test_invalid_exports_are_rejected(inputs, kind, expected):
    _, _, bigs, littles = inputs
    saved = [row[:] for row in SAVED]
    if kind == "duplicate":
        saved.append(saved[0][:])
    elif kind == "unknown":
        saved[0][4] = "different@x.edu"
    elif kind == "missing":
        saved.pop()
    elif kind == "status":
        saved[0][0] = "OTHER"
    elif kind == "lock":
        saved[0][6] = "maybe"
    elif kind == "capacity":
        saved = [["UNMATCHED_BIG", "Big One", "one@x.edu", "", "", "", "", "No match."],
                 ["MATCHED", "Big Two", "two@x.edu", "Little A", "a@x.edu", "", "", ""],
                 ["MATCHED", "Big Two", "two@x.edu", "Little B", "b@x.edu", "yes", "", ""], SAVED[3]]
    elif kind == "conflict":
        saved.append(["UNMATCHED_BIG", "Big One", "one@x.edu", "", "", "", "", ""])
    elif kind == "twin":
        saved[0][5] = "yes"
    elif kind == "unmatched_lock":
        saved[1][6] = "yes"
    _, errors = parse_saved_results(csv_bytes(HEADER, saved), bigs, littles)
    assert expected in " ".join(errors)


def test_unknown_export_blocks_resume_and_validation(inputs):
    bigs_raw, littles_raw, _, _ = inputs
    files = {"bigs_file": ("b.csv", bigs_raw), "littles_file": ("l.csv", littles_raw),
             "results_file": ("wrong.csv", b"name,email\nA,a@x.edu\n")}
    client = TestClient(app)
    assert client.post("/api/validate", files=files).json()["valid"] is False
    response = client.post("/api/resume", files=files)
    assert response.status_code == 422
    assert "Export CSV" in response.json()["detail"]["errors"][0]


def test_empty_and_malformed_exports(inputs):
    _, _, bigs, littles = inputs
    for raw in [b"", b'"unterminated', csv_bytes(HEADER, [SAVED[0] + ["extra"]])]:
        _, errors = parse_saved_results(raw, bigs, littles)
        assert errors


def test_saved_emails_are_case_insensitive_and_formula_protection_is_decoded(inputs):
    _, _, bigs, littles = inputs
    saved = [row[:] for row in SAVED]
    saved[0][2] = "ONE@X.EDU"
    saved[0][-1] = "'=A preserved explanation"
    rows, errors = parse_saved_results(csv_bytes(HEADER, saved), bigs, littles)
    assert not errors
    assert restore_results(bigs, littles, rows)["matches"][0]["littles"][0]["reason"] == "=A preserved explanation"


def test_all_unmatched_export_does_not_trigger_fresh_matching(inputs):
    _, _, bigs, littles = inputs
    saved = [["UNMATCHED_BIG", "Big One", "one@x.edu", "", "", "", "", "Review pending."],
             ["UNMATCHED_LITTLE", "", "", "Little A", "a@x.edu", "", "", "Review pending."], *SAVED[1:]]
    rows, errors = parse_saved_results(csv_bytes(HEADER, saved), bigs, littles)
    assert not errors
    result = restore_results(bigs, littles, rows)
    assert result["matches"] == []
    assert result["summary"]["unmatched_bigs"] == 2
    assert result["summary"]["unmatched_littles"] == 3


def test_restore_manual_nonmutual_pair_without_changing_it(inputs):
    _, _, bigs, littles = inputs
    bigs[0].prefs = []
    bigs[0].pref_names = []
    saved = [row[:] for row in SAVED]
    saved[0][6] = "yes"
    rows, errors = parse_saved_results(csv_bytes(HEADER, saved), bigs, littles)
    assert not errors
    result = restore_results(bigs, littles, rows)
    restored = result["matches"][0]["littles"][0]
    assert restored["email"] == "a@x.edu"
    assert restored["locked"] is True
    assert restored["big_rank_of_little"] == 0
