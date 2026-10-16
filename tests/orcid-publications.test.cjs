const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/js/orcid-publications.js"), "utf8");
const snapshot = JSON.parse(fs.readFileSync(path.join(root, "_data/publications.json"), "utf8"));

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.text = ""; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(c => typeof c === "string" ? c : c.textContent).join(""); }
  append(...children) { for (const c of children) this.children.push(...(c.tag === "fragment" ? c.children : [c])); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
}
function work(paper) {
  return { "put-code": paper.put_code, type: "journal-article", title: {title: {value: paper.orcid_title || paper.title}},
    "journal-title": {value: paper.journal}, "publication-date": {year: {value: paper.year}, month: {value: "10"}, day: {value: "13"}},
    "external-ids": {"external-id": [{"external-id-type": "doi", "external-id-value": paper.doi, "external-id-relationship": "self"}]},
    contributors: {contributor: [{"credit-name": {value: "Example Author"}}]} };
}
function fixture(works) {
  return [{group: works.map(w => ({"work-summary": [w]}))}, {bulk: works.map(w => ({work: w}))}];
}
async function run(responses, timeout = false) {
  const nodes = Object.fromEntries(["publication-data", "publication-list", "orcid-status", "paper-total"].map(id => [id, new Element("div")]));
  nodes["publication-data"].textContent = JSON.stringify(snapshot);
  nodes["publication-list"].append("original static list");
  const calls = [];
  const context = {document: {getElementById: id => nodes[id], createElement: tag => new Element(tag), createDocumentFragment: () => new Element("fragment")},
    window: {fetch: true, AbortController}, AbortController,
    setTimeout: fn => { if (timeout) queueMicrotask(fn); return 1; }, clearTimeout() {},
    async fetch(url, options) {
      calls.push(url);
      assert.equal(options.credentials, "omit");
      if (timeout) return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout"))));
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return {ok: response !== undefined, json: async () => response};
    }
  };
  await vm.runInNewContext(source, context);
  return {nodes, calls};
}
const selected = snapshot.papers.filter(p => p.summary);

test("new papers appear first and five representative summaries remain DOI-bound", async () => {
  const newcomer = work({put_code: 999999999, doi: "10.1234/new-work", title: "New paper", journal: "Example Journal", year: "2027"});
  const works = [newcomer, ...selected.map(work)];
  const {nodes, calls} = await run(fixture(works));
  const rows = nodes["publication-list"].children;
  assert.equal(calls.length, 2);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].id, "work-999999999");
  assert.equal(rows.filter(r => r.className.includes("is-featured")).length, 5);
  assert.equal(nodes["paper-total"].textContent, "6");
  assert.equal(nodes["orcid-status"].dataset.state, "live");
});

test("network failure preserves the entire original static list", async () => {
  const {nodes} = await run([new Error("offline")]);
  assert.equal(nodes["publication-list"].textContent, "original static list");
  assert.equal(nodes["orcid-status"].dataset.state, "fallback");
});

test("a failed detail request does not partially replace the list", async () => {
  const responses = fixture(selected.map(work));
  responses[1] = new Error("details unavailable");
  const {nodes} = await run(responses);
  assert.equal(nodes["publication-list"].textContent, "original static list");
});

test("timeout aborts and preserves static content", async () => {
  const {nodes} = await run([], true);
  assert.equal(nodes["publication-list"].textContent, "original static list");
  assert.equal(nodes["orcid-status"].dataset.state, "fallback");
});

test("empty or incomplete ORCID responses preserve static content", async () => {
  for (const responses of [[{group: []}], [fixture(selected.map(work))[0], {bulk: []}]]) {
    const {nodes} = await run(responses);
    assert.equal(nodes["publication-list"].textContent, "original static list");
    assert.equal(nodes["orcid-status"].dataset.state, "fallback");
  }
});

test("remote titles remain literal text and remote URLs are ignored", async () => {
  const malicious = work({put_code: 999999998, doi: "10.1234/safe", title: '<img src=x onerror="alert(1)">', journal: "Journal", year: "2027"});
  malicious.url = {value: "javascript:alert(1)"};
  const {nodes} = await run(fixture([malicious]));
  const row = nodes["publication-list"].children[0];
  const citation = row.children[0].children[0];
  const title = citation.children.find(n => n.className === "paper-title");
  assert.equal(title.tag, "a");
  assert.equal(title.textContent, malicious.title.title.value);
  assert.equal(title.href, "https://doi.org/10.1234/safe");
});
