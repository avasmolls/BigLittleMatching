"""Validate exported results and restore a review without running new matches."""
import csv
import io
from collections import Counter

from application.backend.matching import run_matching
from application.backend.validation import _decode, _norm_header

EXPORT_COLUMNS = {"status", "big_name", "big_email", "little_name", "little_email", "twin", "locked", "reason"}
BOOLEAN_VALUES = {"": False, "no": False, "false": False, "0": False, "yes": True, "true": True, "1": True}


def _export_text(value):
    """Reverse the formula protection added by our CSV exporter."""
    if len(value) > 1 and value[0] == "'" and value[1] in "=+-@":
        return value[1:]
    return value


def parse_saved_results(raw, bigs, littles):
    text = _decode(raw)
    if not text.strip():
        return [], ["Saved results file is empty."]
    delimiter = max(",;\t", key=text.splitlines()[0].count)
    rows, errors = [], []
    big_by_email = {p.email.lower(): p for p in bigs}
    little_by_email = {p.email.lower(): p for p in littles}
    seen_littles, unmatched_bigs, matched_bigs = set(), set(), Counter()
    twin_flags = Counter()
    try:
        reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
        headers = [_norm_header(c) for c in reader.fieldnames or []]
        if not EXPORT_COLUMNS.issubset(headers) or len(headers) != len(set(headers)):
            return [], ["Saved results file must be a CSV downloaded with Export CSV, including status, email, twin, locked, and reason columns."]
        reader.fieldnames = headers
        for rowno, row in enumerate(reader, 2):
            where = f"Saved results file, row {rowno}"
            if None in row or any(value is None for value in row.values()):
                errors.append(f"{where}: incorrect number of columns.")
                continue
            if not any(value.strip() for value in row.values()):
                continue
            status = row["status"].strip().upper()
            big_email = _export_text(row["big_email"].strip()).lower()
            little_email = _export_text(row["little_email"].strip()).lower()
            locked = row["locked"].strip().lower()
            twin = row["twin"].strip().lower()
            if status not in {"MATCHED", "UNMATCHED_BIG", "UNMATCHED_LITTLE"}:
                errors.append(f"{where}: unknown status '{status}'.")
                continue
            if locked not in BOOLEAN_VALUES or twin not in BOOLEAN_VALUES:
                errors.append(f"{where}: locked and twin must be yes/no or blank.")
                continue
            needs_big = status in {"MATCHED", "UNMATCHED_BIG"}
            needs_little = status in {"MATCHED", "UNMATCHED_LITTLE"}
            if ((needs_big and big_email not in big_by_email)
                    or (needs_little and little_email not in little_by_email)):
                errors.append(f"{where}: participant email not found in the uploaded bigs/littles files. Use the original files for this export.")
                continue
            if (not needs_big and big_email) or (not needs_little and little_email):
                errors.append(f"{where}: emails do not match the row's status.")
                continue
            if status != "MATCHED" and (BOOLEAN_VALUES[locked] or BOOLEAN_VALUES[twin]):
                errors.append(f"{where}: unmatched rows cannot be locked or marked as twins.")
                continue
            if needs_little:
                if little_email in seen_littles:
                    errors.append(f"{where}: little '{little_email}' appears more than once.")
                seen_littles.add(little_email)
            if status == "UNMATCHED_BIG":
                if big_email in unmatched_bigs:
                    errors.append(f"{where}: unmatched big '{big_email}' appears more than once.")
                unmatched_bigs.add(big_email)
            if status == "MATCHED":
                matched_bigs[big_email] += 1
                twin_flags[big_email] += BOOLEAN_VALUES[twin]
            rows.append({"status": status, "big": big_by_email[big_email].email if needs_big else "",
                         "little": little_by_email[little_email].email if needs_little else "",
                         "locked": BOOLEAN_VALUES[locked], "twin": BOOLEAN_VALUES[twin],
                         "reason": _export_text(row["reason"])})
    except (csv.Error, ValueError) as exc:
        return [], [f"Saved results file could not be read ({exc})."]

    for email, count in matched_bigs.items():
        if email in unmatched_bigs:
            errors.append(f"Saved results: big '{email}' is listed as both matched and unmatched.")
        if count > (2 if big_by_email[email].takes_twins else 1):
            errors.append(f"Saved results: big '{email}' has more littles than she can take.")
        if twin_flags[email] != count - 1:
            errors.append(f"Saved results: twin markers for '{email}' do not match her assignments.")
    if set(big_by_email) != set(matched_bigs) | unmatched_bigs or set(little_by_email) != seen_littles:
        errors.append("Saved results must include every participant from the bigs and littles files, including unmatched people. Use the complete original export.")
    return rows, errors


def restore_results(bigs, littles, rows):
    saved = sorted((row for row in rows if row["status"] == "MATCHED"), key=lambda row: row["twin"])
    result = run_matching(bigs, littles, saved=saved)
    notes = {row["big"] or row["little"]: row["reason"] for row in rows if row["status"] != "MATCHED"}
    for person in result["unmatched_bigs"] + result["unmatched_littles"]:
        person["reason"] = notes[person["email"]]
    return result
