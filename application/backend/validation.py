"""CSV parsing + validation. Turns uploaded CSV bytes into Person objects."""
import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field
from typing import cast

import pandas as pd

RANK_COUNT = 10
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TRUE_VALUES = {"yes", "y", "true", "1", "twins"}
FALSE_VALUES = {"no", "n", "false", "0", ""}


@dataclass
class Person:
    name: str
    email: str
    key: str                                       # normalized last name (the match key)
    prefs: list = field(default_factory=list)      # ordered keys, index 0 = rank 1
    pref_names: list = field(default_factory=list) # names exactly as typed
    takes_twins: bool = False


def _clean(text) -> str:
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", text.lower())


def name_key(name) -> str:
    """First initial + last name, lowercase, accents/special characters/whitespace removed.
    'Katie O'Neil-Smith' -> 'koneilsmith'. The last word is the last name and the
    first word supplies the initial. 'Smith, Katie' also works. A one-word entry has no initial, so it
    becomes just a last name (and will not match anyone)."""
    name = str(name).strip()
    if "," in name:  # "Smith, Katie" -> "Katie Smith"
        last_part, first_part = name.split(",", 1)
        name = f"{first_part} {last_part}"
    parts = name.split()
    if not parts:
        return ""
    last = _clean(parts[-1])
    if len(parts) == 1:
        return last
    first = _clean(parts[0])
    return (first[:1] + last) if last else ""


def _norm_header(col) -> str:
    return re.sub(r"[\s\-]+", "_", str(col).strip().lower())


def _find_columns(columns):
    """Return (name_col, email_col, twins_col, {rank_number: col})."""
    ranks, name_col, email_col, twins_col = {}, None, None, None
    for c in columns:
        m = re.fullmatch(r"(?:rank_?|choice_?)?(\d+)", c)
        if m and 1 <= int(m.group(1)) <= RANK_COUNT:
            ranks.setdefault(int(m.group(1)), c)
        elif c in ("name", "full_name") and not name_col:
            name_col = c
        elif c in ("email", "email_address") and not email_col:
            email_col = c
        elif c in ("takes_twins", "twins", "twin") and not twins_col:
            twins_col = c
    return name_col, email_col, twins_col, ranks


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252"):  # cp1252 = older Excel "CSV" exports
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def _read_table(raw: bytes):
    """Decode, sniff the delimiter (comma, semicolon or tab) and load as all-text. -> (df, error)"""
    text = _decode(raw).replace("\xa0", " ")
    if not text.strip():
        return None, "file is empty."
    header = text.splitlines()[0]
    delim = max(",;\t", key=header.count)
    try:
        df = pd.read_csv(io.StringIO(text), sep=delim, dtype=str, keep_default_na=False)
    except Exception as exc:  # ragged rows, unclosed quotes...
        return None, f"could not read CSV ({exc})"
    # drop empty trailing columns that spreadsheet exports add
    junk = [c for c in df.columns if str(c).startswith("Unnamed") and (df[c].str.strip() == "").all()]
    return df.drop(columns=junk), None


def parse_people(raw: bytes, role: str):
    """Parse one CSV. Returns (people, errors, warnings). role is 'big' or 'little'."""
    label = f"{role.capitalize()}s file"
    errors, warnings, people = [], [], []

    df, err = _read_table(raw)
    if df is None:
        return [], [f"{label}: {err}"], []

    df.columns = [_norm_header(c) for c in df.columns]
    df = df.apply(lambda s: s.str.strip())
    df = df[(df != "").any(axis=1)]  # drop fully blank rows (index kept for row numbers)

    name_col, email_col, twins_col, rank_cols = _find_columns(df.columns)
    if not name_col:
        errors.append(f"{label}: missing 'name' column.")
    if not email_col:
        errors.append(f"{label}: missing 'email' column.")
    missing = [f"rank_{n}" for n in range(1, RANK_COUNT + 1) if n not in rank_cols]
    if missing:
        errors.append(f"{label}: missing rank columns: {', '.join(missing)}.")
    if role == "big" and not twins_col:
        errors.append(f"{label}: missing 'takes_twins' column. Is this the littles file?")
    if role == "little" and twins_col:
        warnings.append(f"{label}: has a 'takes_twins' column (ignored). Is this the bigs file?")
    if errors or name_col is None or email_col is None:
        return [], errors, warnings
    if df.empty:
        return [], [f"{label}: no data rows found."], warnings

    seen_keys, seen_emails = {}, {}
    for idx, row in df.iterrows():
        # read_csv creates an integer RangeIndex, preserved when blank rows are dropped.
        rowno = cast(int, idx) + 2  # header is row 1
        where = f"{label}, row {rowno}"
        name, email = row[name_col], row[email_col]
        key = name_key(name)

        if not name or not key:
            errors.append(f"{where}: name is missing or has no usable first/last name.")
            continue
        if not EMAIL_RE.match(email):
            errors.append(f"{where} ({name}): invalid or missing email '{email}'.")
        if email.lower() in seen_emails:
            errors.append(f"{where} ({name}): duplicate email, also used by row {seen_emails[email.lower()]}.")
        seen_emails.setdefault(email.lower(), rowno)
        if key in seen_keys:
            errors.append(f"{where} ({name}): match key '{key}' (first initial + last name) is already used "
                          f"by row {seen_keys[key]}. Each must be unique within a file.")
        seen_keys.setdefault(key, rowno)

        takes_twins = False
        if role == "big" and twins_col is not None:
            val = row[twins_col].lower()
            if val in TRUE_VALUES:
                takes_twins = True
            elif val not in FALSE_VALUES:
                errors.append(f"{where} ({name}): takes_twins must be yes/no, got '{row[twins_col]}'.")

        prefs, pref_names, gap = [], [], False
        for n in range(1, RANK_COUNT + 1):
            val = row[rank_cols[n]]
            if not val:
                gap = True
                continue
            if gap:
                warnings.append(f"{where} ({name}): rank_{n} is filled after a blank rank; "
                                f"ranks were compacted so positions may shift.")
                gap = False
            k = name_key(val)
            if not k:
                warnings.append(f"{where} ({name}): rank_{n} '{val}' has no usable name, skipped.")
            elif k == key:
                errors.append(f"{where} ({name}): ranked herself at rank_{n}.")
            elif k in prefs:
                errors.append(f"{where} ({name}): '{val}' appears more than once in her rankings.")
            else:
                prefs.append(k)
                pref_names.append(val)
        if not prefs:
            warnings.append(f"{where} ({name}): no rankings submitted; she can only end up unmatched.")

        people.append(Person(name, email, key, prefs, pref_names, takes_twins))

    return people, errors, warnings


def cross_check(bigs, littles):
    """Warn about ranked names that don't exist in the other file (likely typos)."""
    warnings = []
    for group, other, other_label in ((bigs, littles, "littles"), (littles, bigs, "bigs")):
        known = {p.key for p in other}
        for p in group:
            for k, raw in zip(p.prefs, p.pref_names):
                if k not in known:
                    warnings.append(f"{p.name} ranked '{raw}', who was not found in the {other_label} file.")
    return warnings
