"""Refresh the static ORCID fallback; no third-party Python packages required.

Run from any directory: python scripts/sync_orcid.py [--enrich]
--enrich also retrieves citation metadata from Crossref using ORCID's DOIs.
The Jekyll build never runs this script or requires network access.
"""
import argparse
from datetime import datetime
import html
import json
from pathlib import Path
import re
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORCID = "0000-0001-7987-2685"
API = f"https://pub.orcid.org/v3.0/{ORCID}"
OUTPUT = ROOT / "_data/publications.json"


def fetch_json(url):
    for attempt in range(3):
        try:
            request = Request(url, headers={"Accept": "application/json"})
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise


def clean_text(value):
    value = html.unescape(re.sub(r"<[^>]+>", "", value or ""))
    return re.sub(r"\s+", " ", value).strip().replace("g -diffusion", "g-diffusion").replace("β -stable", "β-stable")


def normalize(work, previous=None, crossref=None):
    previous = previous or {}
    crossref = crossref or {}
    date = work.get("publication-date") or {}
    parts = [(date.get(key) or {}).get("value", "") for key in ("year", "month", "day")]
    doi = next((item["external-id-value"] for item in work.get("external-ids", {}).get("external-id", []) if item["external-id-type"] == "doi"), "")
    if previous.get("doi", "").lower() != doi.lower():
        previous = {}
    raw_title = work["title"]["title"]["value"]
    title = clean_text(raw_title)
    if crossref.get("title"):
        title = clean_text(crossref["title"][0])
    elif previous.get("orcid_title") == raw_title:
        title = previous.get("title", title)
    names = [clean_text((item.get("credit-name") or {}).get("value")) for item in (work.get("contributors") or {}).get("contributor", [])]
    names = [name for name in names if name]
    if not names and crossref.get("author"):
        names = [clean_text(" ".join([a.get("given", ""), a.get("family", "")])) for a in crossref["author"]]
    return {
        "put_code": work["put-code"],
        "doi": doi,
        "title": title,
        "orcid_title": raw_title,
        "authors": ", ".join(names) or previous.get("authors", ""),
        "journal": clean_text((work.get("journal-title") or {}).get("value")),
        "date": "-".join((part or "00").zfill(2) for part in parts),
        "year": parts[0] or "年份未标注",
        "volume": str(crossref.get("volume", previous.get("volume", ""))),
        "issue": str(crossref.get("issue", previous.get("issue", ""))),
        "pages": str(crossref.get("page") or crossref.get("article-number") or previous.get("pages", "")),
        "summary": previous.get("summary", ""),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enrich", action="store_true")
    args = parser.parse_args()
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"papers": []}
    previous = {p["doi"].lower(): p for p in existing["papers"] if p.get("doi")}
    groups = fetch_json(f"{API}/works")["group"]
    codes = [str(g["work-summary"][0]["put-code"]) for g in groups if g["work-summary"][0]["type"] == "journal-article"]
    if not codes:
        raise ValueError("No papers returned; existing fallback retained.")
    papers, seen = [], set()
    for start in range(0, len(codes), 100):
        batch = codes[start:start + 100]
        entries = fetch_json(f"{API}/works/{','.join(batch)}")["bulk"]
        if {str((e.get("work") or {}).get("put-code")) for e in entries} != set(batch):
            raise ValueError("Incomplete ORCID response; existing fallback retained.")
        for entry in entries:
            work = entry["work"]
            doi = next((e["external-id-value"] for e in work["external-ids"]["external-id"] if e["external-id-type"] == "doi"), "")
            key = doi.lower() or str(work["put-code"])
            if key in seen:
                continue
            seen.add(key)
            enrichment = {}
            if args.enrich and doi:
                enrichment = fetch_json(f"https://api.crossref.org/works/{quote(doi, safe='')}")["message"]
            papers.append(normalize(work, previous.get(key), enrichment))
    papers.sort(key=lambda p: (p["date"], p["put_code"]), reverse=True)
    result = {"orcid": ORCID, "source": f"https://orcid.org/{ORCID}", "updated": datetime.now().strftime("%Y-%m-%d"), "papers": papers}
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Updated {len(papers)} papers in {OUTPUT}")


if __name__ == "__main__":
    main()
