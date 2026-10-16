/* ORCID progressively enhances the complete static list. No build-time network. */
(async function () {
  "use strict";
  const dataNode = document.getElementById("publication-data");
  const list = document.getElementById("publication-list");
  const status = document.getElementById("orcid-status");
  if (!dataNode || !list || !status || !window.fetch || !window.AbortController) return;

  let snapshot;
  try { snapshot = JSON.parse(dataNode.textContent); } catch (_) { return; }
  const api = "https://pub.orcid.org/v3.0/" + snapshot.orcid;
  const savedByDoi = new Map(snapshot.papers.filter(p => p.doi).map(p => [p.doi.toLowerCase(), p]));
  const controller = new AbortController();
  // One deadline covers the index and all detail requests, preserving the fallback.
  const deadline = setTimeout(() => controller.abort(), 12000);

  function text(value) { return typeof value === "string" ? value : ""; }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }
  function link(className, title, url) {
    const node = element("a", className, title);
    node.href = url;
    return node;
  }
  async function get(path) {
    const response = await fetch(api + path, { headers: { Accept: "application/json" }, signal: controller.signal, credentials: "omit" });
    if (!response.ok) throw new Error("ORCID unavailable");
    return response.json();
  }
  function normalize(work) {
    if (!work || !Number.isInteger(work["put-code"]) || !work.title || !work.title.title || !text(work.title.title.value)) throw new Error("Invalid work");
    const ids = (work["external-ids"] || {})["external-id"] || [];
    const doiRecord = ids.find(id => id["external-id-type"] === "doi" && id["external-id-relationship"] === "self");
    const doi = doiRecord ? text(doiRecord["external-id-value"]).trim() : "";
    // URLs are constructed only from DOI identifiers, never from remote URL fields.
    if (doi && !/^10\.\d{4,9}\/\S+$/i.test(doi)) throw new Error("Invalid DOI");
    const saved = savedByDoi.get(doi.toLowerCase()) || {};
    const date = work["publication-date"] || {};
    const parts = ["year", "month", "day"].map(k => text((date[k] || {}).value));
    const names = ((work.contributors || {}).contributor || []).map(c => text((c["credit-name"] || {}).value)).filter(Boolean);
    const rawTitle = text(work.title.title.value);
    return {
      put_code: work["put-code"], doi,
      title: rawTitle === saved.orcid_title ? saved.title : rawTitle.replace(/\s+/g, " ").replace("g -diffusion", "g-diffusion"),
      authors: names.join(", ") || saved.authors || "",
      journal: text((work["journal-title"] || {}).value),
      year: parts[0] || "年份未标注", date: parts.map(p => (p || "00").padStart(2, "0")).join("-"),
      volume: saved.volume || "", issue: saved.issue || "", pages: saved.pages || "", summary: saved.summary || ""
    };
  }
  function render(paper) {
    const row = element("li", "publication" + (paper.summary ? " is-featured" : ""));
    row.id = "work-" + paper.put_code;
    row.dataset.putCode = String(paper.put_code);
    const content = element("div", "paper-content");
    if (paper.summary) content.append(element("span", "featured-label", "代表作"));
    const citation = element("p", "citation");
    if (paper.authors) citation.append(element("span", "paper-authors", paper.authors + ". "));
    const url = paper.doi ? "https://doi.org/" + paper.doi : snapshot.source;
    citation.append(link("paper-title", paper.title, url), ". ");
    if (paper.journal) citation.append(element("em", "", paper.journal));
    if (paper.volume) citation.append(" ", element("strong", "", paper.volume));
    if (paper.issue) citation.append("(" + paper.issue + ")");
    if (paper.pages) citation.append(", " + paper.pages);
    citation.append(" (" + paper.year + ").");
    content.append(citation);
    content.append(link("doi-link", paper.doi ? "DOI: " + paper.doi + " ↗" : "ORCID 记录 ↗", url));
    if (paper.summary) content.append(element("p", "paper-summary", paper.summary));
    row.append(content);
    return row;
  }

  try {
    const index = await get("/works");
    if (!Array.isArray(index.group)) throw new Error("Invalid index");
    const codes = index.group.map(g => (g["work-summary"] || [])[0]).filter(w => w && w.type === "journal-article").map(w => w["put-code"]);
    if (!codes.length || codes.some(code => !Number.isInteger(code))) throw new Error("Empty or invalid index");
    const works = [];
    // Public API supports up to 100 detailed works in one request.
    for (let start = 0; start < codes.length; start += 100) {
      const batch = codes.slice(start, start + 100);
      const response = await get("/works/" + batch.join(","));
      if (!Array.isArray(response.bulk)) throw new Error("Invalid details");
      const returned = new Set(response.bulk.map(e => e.work && e.work["put-code"]));
      if (returned.size !== batch.length || batch.some(code => !returned.has(code))) throw new Error("Incomplete details");
      response.bulk.forEach(entry => works.push(normalize(entry.work)));
    }
    const seen = new Set();
    const papers = works.filter(p => {
      const key = p.doi.toLowerCase() || String(p.put_code);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.put_code - a.put_code);
    const fragment = document.createDocumentFragment();
    papers.forEach(paper => fragment.append(render(paper)));
    // Commit only after every response has passed validation.
    list.replaceChildren(fragment);
    document.getElementById("paper-total").textContent = String(papers.length);
    status.textContent = "已与 ORCID 同步 · " + papers.length + " 篇论文 · 按发表时间从新到旧排列";
    status.dataset.state = "live";
  } catch (_) {
    controller.abort();
    status.textContent = "当前显示本地论文列表（" + snapshot.updated + "，" + snapshot.papers.length + " 篇）；本次未能连接 ORCID。";
    status.dataset.state = "fallback";
  } finally {
    clearTimeout(deadline);
  }
})();
