#!/usr/bin/env python3
"""Extract the Appendix-1 worked example from the archive.org OCR of
Alexander's Notes on the Synthesis of Form (1964) into
ensembles/village.ensemble.json + ensembles/village.decomposition.json.

Source: https://archive.org/download/AlexanderChristopherNotesOnTheSynthesisOfForm/Alexander_Christopher_Notes_on_the_Synthesis_of_Form_djvu.txt

The book's link table is unsigned (|v| = 1); Alexander notes the
decomposition is independent of link signs (App. 1). Links are emitted as
the symmetric union of the printed table — interaction is definitionally
symmetric — and pairs asserted in only one direction are listed in
notes.asymmetric for review against the scan.
"""
import json
import re
import sys
import urllib.request

URL = "https://archive.org/download/AlexanderChristopherNotesOnTheSynthesisOfForm/Alexander_Christopher_Notes_on_the_Synthesis_of_Form_djvu.txt"

# OCR artifacts corrected by hand against the scan.
FIXES = {
    24: "Place for village events - dancing, plays, singing, wrestling",
    26: "Sentimental system: wish not to destroy old way of life; love of present habits governing bathing, food, etc",
    28: "Proper boundaries of ownership and maintenance responsibility",
    56: "Sheltered accommodation for cattle (sleeping, milking, feeding)",
    61: "Sufficient fluid employment for laborers temporarily (seasonally) out of work",
    65: "Diversification of villages' economic base - not all occupations agricultural",
    97: "Minimize transportation costs for bulk produce (grain, potatoes, etc.)",
    124: "Prevent spread of human disease by carriers, infection, contagion",
    132: "Need to develop projects which benefit from government subsidies",
    135: "Spread of official information about taxes, elections, etc",
    140: "Develop rural community spirit: destroy selfishness, isolationism",
    141: "Prevent migration of young people and harijans to cities",
}

# Alexander's published decomposition (App. 1) — the oracle.
DECOMPOSITION = {
    "A1": [7, 53, 57, 59, 60, 72, 125, 126, 128],
    "A2": [31, 34, 36, 52, 54, 80, 94, 106, 136],
    "A3": [37, 38, 50, 55, 77, 91, 103],
    "B1": [39, 40, 41, 44, 51, 118, 127, 131, 138],
    "B2": [30, 35, 46, 47, 61, 97, 98],
    "B3": [18, 19, 22, 28, 33, 42, 43, 49, 69, 74, 107, 110],
    "B4": [32, 45, 48, 70, 71, 73, 75, 104, 105, 108, 109],
    "C1": [8, 10, 11, 14, 15, 58, 63, 64, 65, 66, 93, 95, 96, 99, 100, 112, 121, 130, 132, 133, 134, 139, 141],
    "C2": [5, 6, 20, 21, 24, 84, 89, 102, 111, 115, 116, 117, 120, 129, 135, 137, 140],
    "D1": [26, 29, 56, 67, 76, 85, 87, 90, 92, 122, 123, 124],
    "D2": [1, 9, 12, 13, 25, 27, 62, 68, 81, 86, 113, 114],
    "D3": [2, 3, 4, 16, 17, 23, 78, 79, 82, 83, 88, 101, 119],
}
MAJOR = {"A": ["A1", "A2", "A3"], "B": ["B1", "B2", "B3", "B4"], "C": ["C1", "C2"], "D": ["D1", "D2", "D3"]}


def fetch():
    return urllib.request.urlopen(URL, timeout=60).read().decode("utf-8")


def parse(txt):
    apx = txt[txt.find("APPENDIX  I  /  A  WORKED  EXAMPLE"):txt.find("APPENDIX  2  /  MATHEMATICAL")]

    items = {}
    cur = None
    for ln in apx[: apx.find("1  interacts  with")].split("\n"):
        s = ln.rstrip()
        m = re.match(r"^\s*(\d{1,3})\.\s+(.*)", s)
        if m and 1 <= int(m.group(1)) <= 141:
            cur = int(m.group(1))
            items[cur] = m.group(2).strip()
            continue
        if cur is not None and s.strip():
            t = s.strip()
            if re.match(r"^\d{1,3}$", t):
                continue
            if re.match(r"^[A-Z][A-Za-z ,]+$", t) and len(t) < 40:
                cur = None
                continue
            items[cur] += " " + t
    items = {k: re.sub(r"\s+", " ", v).strip(" .") for k, v in items.items()}
    items.update(FIXES)
    assert len(items) == 141, len(items)

    lt = apx[apx.find("1  interacts  with"):]
    lt = lt[: lt.find("Each  link  or  absence")]
    flat = re.sub(r"\s+", " ", lt)
    flat = re.sub(r"\bwith\*", "with", flat)
    flat = re.sub(r"\b(\d{1,2})\s+(\d)\s+interacts", lambda m: m.group(1) + m.group(2) + " interacts", flat)
    flat = re.sub(r"\b(\d)\s+(\d)\s+(\d)\s+interacts", lambda m: m.group(1) + m.group(2) + m.group(3) + " interacts", flat)

    per = {}
    links = set()
    for src, rest in re.findall(r"(\d+)\s+interacts\s+with\s+([^.]*)\.", flat):
        src = int(src)
        per[src] = [n for n in (int(x) for x in re.findall(r"\d+", rest)) if 1 <= n <= 141]
        for n in per[src]:
            links.add((min(src, n), max(src, n)))
    assert len(per) == 141, sorted(set(range(1, 142)) - set(per))

    asymmetric = sorted(
        [{"a": a, "b": b, "direction": f"{a}->{b}"}
         for a in per for b in per[a] if a not in per.get(b, [])],
        key=lambda r: (r["a"], r["b"]),
    )
    return items, sorted(links), asymmetric


def main():
    items, links, asymmetric = parse(fetch())

    ensemble = {
        "contract": "pattern.ensemble.v1",
        "name": "village",
        "context": "An agricultural village of six hundred people, reorganized to fit present and future conditions developing in rural India. (Alexander, Notes on the Synthesis of Form, Appendix 1, after 'The Determination of Components for an Indian Village', 1963.)",
        "misfits": [{"id": f"m{i}", "text": items[i]} for i in range(1, 142)],
        "links": [{"a": f"m{a}", "b": f"m{b}", "sign": "u"} for a, b in links],
        "notes": {
            "source": "archive.org OCR of the 1973 seventh printing; link table is unsigned (|v|=1) in the original",
            "symmetry": "links emitted as the symmetric union of the printed table",
            "asymmetric": asymmetric,
            "oracle": "ensembles/village.decomposition.json — Alexander's own published decomposition",
        },
    }

    decomposition = {
        "contract": "pattern.decomposition.v1",
        "ensemble": "village",
        "source": "Alexander's published decomposition, App. 1",
        "tree": {"M": ["A", "B", "C", "D"], **{k: v for k, v in MAJOR.items()}},
        "subsets": {k: [f"m{n}" for n in v] for k, v in DECOMPOSITION.items()},
    }

    json.dump(ensemble, open("ensembles/village.ensemble.json", "w"), indent=2)
    json.dump(decomposition, open("ensembles/village.decomposition.json", "w"), indent=2)
    print(f"misfits={len(ensemble['misfits'])} links={len(ensemble['links'])} asymmetric={len(asymmetric)}")


if __name__ == "__main__":
    sys.exit(main())
