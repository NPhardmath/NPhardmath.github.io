"""Check the generated four-page site and local links: python scripts/verify_site.py."""
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_site"
PAGES = ["index.html", "research/index.html", "publications/index.html", "team/index.html", "404.html"]


class Page(HTMLParser):
    def __init__(self, content):
        super().__init__(convert_charrefs=True)
        self.ids, self.links, self.tags, self.summaries = set(), [], [], 0
        self.feed(content)

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        self.tags.append(tag)
        if "id" in attributes:
            assert attributes["id"] not in self.ids, f"Duplicate id: {attributes['id']}"
            self.ids.add(attributes["id"])
        if "href" in attributes:
            self.links.append(attributes["href"])
        if "src" in attributes:
            self.links.append(attributes["src"])
        if tag == "img":
            assert attributes.get("alt"), "An illustration has no alt text"
        if "paper-summary" in attributes.get("class", "").split():
            self.summaries += 1


def main():
    parsed = {}
    for file in PAGES:
        content = (SITE / file).read_text(encoding="utf-8")
        assert 'lang="zh-CN"' in content, f"Wrong language: {file}"
        assert "{{" not in content and "{%" not in content, f"Unrendered Liquid: {file}"
        assert "Your Name" not in content and "Academic Pages is a ready" not in content
        page = Page(content)
        assert page.tags.count("h1") == 1, f"Expected one page title in {file}"
        parsed[file] = page
    checked = 0
    for file, page in parsed.items():
        for target in page.links:
            url = urlsplit(target)
            if url.scheme or url.netloc:
                continue
            relative = unquote(url.path).lstrip("/") if url.path.startswith("/") else str(Path(file).parent / unquote(url.path))
            destination = SITE / relative if url.path else SITE / file
            if destination.is_dir():
                destination /= "index.html"
            assert destination.is_file(), f"Missing target in {file}: {target}"
            if url.fragment and destination.suffix == ".html":
                key = destination.relative_to(SITE).as_posix()
                target_page = parsed.get(key) or Page(destination.read_text(encoding="utf-8"))
                assert unquote(url.fragment) in target_page.ids, f"Missing anchor in {file}: {target}"
            checked += 1
    snapshot = json.loads((ROOT / "_data/publications.json").read_text(encoding="utf-8"))
    pubs = parsed["publications/index.html"]
    assert len([i for i in pubs.ids if i.startswith("work-")]) == len(snapshot["papers"])
    assert pubs.summaries == 5
    assert not (SITE / "AGENTS.md").exists() and not (SITE / "local").exists()
    assert not (SITE / "cv/index.html").exists()
    print(f"Verified {len(PAGES)} pages, {checked} local links, {len(snapshot['papers'])} papers and five representative summaries.")


if __name__ == "__main__":
    main()
