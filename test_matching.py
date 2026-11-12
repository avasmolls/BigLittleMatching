import io
from fastapi.testclient import TestClient

from main import app
from matching import run_matching
from validation import name_key, parse_people


def people(role, rows):
    """rows: (name, [ranked names], takes_twins)"""
    header = "name,email," + ",".join(f"rank_{i}" for i in range(1, 11)) + (",takes_twins" if role == "big" else "")
    lines = [header]
    for name, ranks, twins in rows:
        cells = (ranks + [""] * 10)[:10]
        last = name.replace(" ", "").lower()
        line = f"{name},{last}@x.edu," + ",".join(cells)
        lines.append(line + (f",{'yes' if twins else 'no'}" if role == "big" else ""))
    out, errors, _ = parse_people("\n".join(lines).encode(), role)
    assert not errors, errors
    return out


def test_name_key():
    assert name_key("  Katie  O'Neil-Smith ") == "koneilsmith"
    assert name_key("José Ñuñez") == "jnunez"
    assert name_key("(Mary) Beth Smith") == "msmith"
    assert name_key("Smith") == "smith"


def test_same_last_name_different_initial_ok():
    out = people("big", [("Ann Lee", [], False), ("Bea Lee", [], False)])
    assert [p.key for p in out] == ["alee", "blee"]


def test_tier_order_and_mutual_only():
    bigs = people("big", [("B One", ["Lit A", "Lit B"], False), ("B Two", ["Lit A", "Lit B"], False)])
    lits = people("little", [("Lit A", ["B Two", "B One"], False), ("Lit B", ["B Two"], False)])
    r = run_matching(bigs, lits)
    pairs = {m["big"]["name"]: m["littles"][0]["name"] for m in r["matches"]}
    # B Two/Lit A is 1/1 so it goes first; B One then gets Lit B? She did not rank B One -> unmatched
    assert pairs == {"B Two": "Lit A"}
    assert r["unmatched_littles"][0]["name"] == "Lit B"
    assert r["unmatched_bigs"][0]["name"] == "B One"


def test_tiebreak_little_ranking_of_big():
    # Both littles are the big's... two littles want the same big; same tier (1/2 vs 2/1)
    bigs = people("big", [("Big Z", ["Lit A", "Lit B"], False)])
    lits = people("little", [("Lit A", ["Big Z"], False), ("Lit B", ["Other Q", "Big Z"], False)])
    # Lit A: br=1, lr=1 (tier 2) beats Lit B: br=2, lr=2
    r = run_matching(bigs, lits)
    assert r["matches"][0]["littles"][0]["name"] == "Lit A"


def test_tiebreak_same_sum_prefers_little_rank():
    bigs = people("big", [("Big Z", ["Lit A", "Lit B"], False)])
    # Lit A: br1/lr2 (sum 3, max 2). Lit B: br2/lr1 (sum 3, max 2) -> little ranking Big #1 wins
    lits = people("little", [("Lit A", ["Q Q", "Big Z"], False), ("Lit B", ["Big Z"], False)])
    r = run_matching(bigs, lits)
    assert r["matches"][0]["littles"][0]["name"] == "Lit B"
    assert "Tied at this tier" in r["matches"][0]["littles"][0]["reason"]


def test_twins_top5_only():
    ranks = ["Lit A", "Lit B", "Lit C", "Lit D", "Lit E", "Lit F", "Lit G"]
    bigs = people("big", [("Big Z", ranks, True)])
    lits = people("little", [(f"Lit {c}", ["Big Z"], False) for c in "ABCDEFG"])
    r = run_matching(bigs, lits)
    m = r["matches"][0]
    assert [l["name"] for l in m["littles"]] == ["Lit A", "Lit B"] and m["is_twin_match"]
    assert len(r["unmatched_littles"]) == 5  # no triplets


def test_twin_not_allowed_outside_top5():
    bigs = people("big", [("Big Z", ["Aa Aone", "Aa Atwo", "Aa Athree", "Aa Afour", "Aa Afive", "Lit F"], True)])
    lits = people("little", [("Lit F", ["Big Z"], False), ("Aa Aone", ["Big Z"], False)])
    r = run_matching(bigs, lits)
    assert len(r["matches"][0]["littles"]) == 1
    assert "twin slot not allowed" in r["unmatched_littles"][0]["reason"]


def test_validation_errors():
    csv_bytes = b"name,email,rank_1\nAnn Lee,bad-email,Bo Kim\n"
    _, errors, _ = parse_people(csv_bytes, "little")
    assert any("missing rank columns" in e for e in errors)
    header = "name,email," + ",".join(f"rank_{i}" for i in range(1, 11)) + ",takes_twins\n"
    dup = header + "Ann Lee,a@x.edu,,,,,,,,,,,maybe\nAmy Lee,a@x.edu,,,,,,,,,,,no\n"
    _, errors, _ = parse_people(dup.encode(), "big")
    text = " ".join(errors)
    assert "takes_twins must be" in text and "duplicate email" in text and "match key" in text


def test_api_end_to_end(tmp_path):
    client = TestClient(app)
    h = "name,email," + ",".join(f"rank_{i}" for i in range(1, 11))
    bigs = (h + ",takes_twins\nBig Z,z@x.edu,Lit A,,,,,,,,,,no\n").encode()
    lits = (h + "\nLit A,a@x.edu,Big Z,,,,,,,,,\n").encode()
    files = {"bigs_file": ("b.csv", io.BytesIO(bigs)), "littles_file": ("l.csv", io.BytesIO(lits))}
    res = client.post("/match", files=files)
    assert res.status_code == 200 and res.json()["summary"]["matched_littles"] == 1
    assert client.get("/results/latest").status_code == 200
    assert client.get("/templates/bigs.csv").text.strip().endswith("takes_twins")
