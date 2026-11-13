"""Pure matching logic. No FastAPI or file I/O in here so it is easy to test."""
from dataclasses import dataclass

TWIN_MAX_RANK = 5  # a little may only be a twin if she is in the big's top 5


@dataclass
class Pair:
    big: object
    little: object
    br: int  # rank the big gave the little
    lr: int  # rank the little gave the big
    locked: bool = False

    @property
    def tier(self):
        return self.br + self.lr

    def sort_key(self):
        # 1) lowest rank sum   2) more balanced first (2/2 before 1/3)
        # 3) tie-break: little's ranking of the big   4) big's ranking   5) names (stable)
        return (self.tier, max(self.br, self.lr), self.lr, self.br, self.big.key, self.little.key)

    @property
    def same_level(self):
        return (self.tier, max(self.br, self.lr))


def _p(person):
    return {"name": person.name, "email": person.email}


def run_matching(bigs, littles, locked=None):
    little_by_key = {l.key: l for l in littles}

    # Rule 2: only mutual rankings are candidate pairs.
    pairs = []
    for b in bigs:
        for br, lk in enumerate(b.prefs, 1):
            l = little_by_key.get(lk)
            if l and b.key in l.prefs:
                pairs.append(Pair(b, l, br, l.prefs.index(b.key) + 1))
    pairs.sort(key=Pair.sort_key)

    big_littles = {}   # big key -> [(Pair, is_twin)]
    little_big = {}    # little key -> Pair

    def assign(p, is_twin):
        big_littles.setdefault(p.big.key, []).append((p, is_twin))
        little_big[p.little.key] = p

    # Reviewer-locked pairs are placed first and never changed by the algorithm.
    big_by_email = {b.email.lower(): b for b in bigs}
    little_by_email = {l.email.lower(): l for l in littles}
    for item in locked or []:
        b = big_by_email.get(str(item.get("big", "")).lower())
        l = little_by_email.get(str(item.get("little", "")).lower())
        if not b or not l or l.key in little_big or len(big_littles.get(b.key, [])) >= 2:
            continue
        br = b.prefs.index(l.key) + 1 if l.key in b.prefs else 0
        lr = l.prefs.index(b.key) + 1 if b.key in l.prefs else 0
        assign(Pair(b, l, br, lr, True), len(big_littles.get(b.key, [])) == 1)

    # Pass 1: one-to-one matches, best tier first.
    for p in pairs:
        if p.big.key not in big_littles and p.little.key not in little_big:
            assign(p, False)

    # Pass 2: twins. Only after all singles; little must be in the big's top 5.
    for p in pairs:
        if (p.big.takes_twins and len(big_littles.get(p.big.key, [])) == 1
                and p.little.key not in little_big and p.br <= TWIN_MAX_RANK):
            assign(p, True)

    def reason(p, is_twin):
        if p.locked:
            rk = lambda n: f"#{n}" if n else "not ranked"
            return (f"Locked by reviewer. {p.big.name} ranked {p.little.name}: {rk(p.br)}; "
                    f"{p.little.name} ranked {p.big.name}: {rk(p.lr)}.")
        base = (f"{p.big.name} ranked {p.little.name} #{p.br}; "
                f"{p.little.name} ranked {p.big.name} #{p.lr}.")
        if is_twin:
            return (f"Twin match: mutual #{p.br} / #{p.lr}. {base} {p.little.name} is in {p.big.name}'s "
                    f"top {TWIN_MAX_RANK}; assigned after all single matches.")
        text = f"Mutual #{p.br} / #{p.lr} (rank sum {p.tier}). {base}"
        rivals = [q for q in pairs if q is not p and q.same_level == p.same_level
                  and (q.big is p.big or q.little is p.little)]
        if rivals:
            names = ", ".join(sorted({f"{q.big.name} / {q.little.name}" for q in rivals}))
            text += (f" Tied at this tier with: {names}. "
                     f"Resolved by the little's ranking of the big.")
        return text

    matches = []
    for b in bigs:
        entries = big_littles.get(b.key)
        if not entries:
            continue
        matches.append({
            "big": _p(b),
            "takes_twins": b.takes_twins,
            "is_twin_match": len(entries) == 2,
            "littles": [{**_p(p.little), "is_twin": tw, "locked": p.locked, "tier": p.tier if p.br and p.lr else None,
                         "big_rank_of_little": p.br, "little_rank_of_big": p.lr,
                         "reason": reason(p, tw)} for p, tw in entries],
        })
    matches.sort(key=lambda m: min(l["tier"] or 0 for l in m["littles"]))

    def unmatched_info(person, role):
        mine = [p for p in pairs if (p.big if role == "big" else p.little) is person]
        if not person.prefs:
            why = "Submitted no rankings."
        elif not mine:
            why = "None of the people she ranked ranked her back."
        else:
            parts = []
            for p in mine:
                other = p.little if role == "big" else p.big
                if role == "big":
                    taken = little_big.get(p.little.key)
                    held = f"matched to {taken.big.name}" if taken else "unmatched"
                else:
                    taken = big_littles.get(p.big.key)
                    held = (f"matched to {', '.join(x.little.name for x, _ in taken)}"
                            if taken else "unmatched")
                note = f"{other.name} (#{p.br} / #{p.lr}, {held}"
                if role == "little" and p.big.takes_twins and p.br > TWIN_MAX_RANK:
                    note += f"; twin slot not allowed, she is #{p.br} on the big's list"
                parts.append(note + ")")
            why = "Mutual rankings existed but were taken: " + "; ".join(parts) + "."
        return {**_p(person), "reason": why,
                "ranked": person.pref_names,
                "mutual_with": [(p.little if role == "big" else p.big).name for p in mine]}

    unmatched_bigs = [unmatched_info(b, "big") for b in bigs if b.key not in big_littles]
    unmatched_littles = [unmatched_info(l, "little") for l in littles if l.key not in little_big]

    top3 = sum(1 for p in little_big.values() if p.lr and p.lr <= 3)
    tier_counts = {}
    for p in (q for q in little_big.values() if q.br and q.lr):
        label = f"{min(p.br, p.lr)}-{max(p.br, p.lr)}"
        tier_counts[label] = tier_counts.get(label, 0) + 1

    big_by_key = {b.key: b for b in bigs}

    def person_info(person, other_by_key):
        return {"name": person.name, "takes_twins": person.takes_twins,
                "ranked": [{"name": n, "email": other_by_key[k].email if k in other_by_key else None}
                           for k, n in zip(person.prefs, person.pref_names)]}

    people = {"bigs": {b.email: person_info(b, little_by_key) for b in bigs},
              "littles": {l.email: person_info(l, big_by_key) for l in littles}}

    return {
        "people": people,
        "matches": matches,
        "unmatched_bigs": unmatched_bigs,
        "unmatched_littles": unmatched_littles,
        "summary": {
            "bigs": len(bigs), "littles": len(littles),
            "matched_littles": len(little_big),
            "twin_sets": sum(1 for m in matches if m["is_twin_match"]),
            "unmatched_bigs": len(unmatched_bigs),
            "unmatched_littles": len(unmatched_littles),
            "littles_with_top3_big": top3,
            "pair_counts_by_tier": dict(sorted(tier_counts.items())),
        },
    }
