// Every source a person gives becomes parts with a place on each, because a
// question cites a place and a part with no place cannot be cited.
//
// What is worth pinning: cue fragments merge into sentences and carry their
// cue time; a beat script becomes one part a step with the anchor the
// explainer page gives that step, and its words panel travels with the
// reading; a page's headings become parts with the anchors a reader can open;
// an address that is not https is refused, and so is a redirect off https; a
// file whose bytes are not text is refused by name; the notes become one part
// with no fragment; and no local file path reaches the reading.
// Run: node --test test/read-source.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  fetchPage, looksBinary, mergeCues, partsFromBeatScript, partsFromHtml,
  partsFromNotes, partsFromText, partsFromVtt, parseVtt, plainHeading,
  readSources, timeLabel, wordsOfBeatScript,
} from "../scripts/read-source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "read-source.mjs");

const VTT = `WEBVTT

NOTE this line is the file's own bookkeeping and is not a cue

1
00:00:00.000 --> 00:00:03.000
A hold is not a charge.

2
00:00:03.000 --> 00:00:05.000
<v Narrator>Money is set aside

3
00:00:05.000 --> 00:00:07.500
when the job starts,

4
00:00:07.500 --> 00:00:10.000
and it is only taken when the work is delivered.

5
00:00:10.000 --> 00:00:14.000
The seller names the job and the platform names the amount, because only the platform knows the buyer's terms.

6
01:00:05.200 --> 01:00:09.000
An hour in, the same rule still holds for every job on the mesh today.
`;

const SCRIPT = {
  title: "How a hold works",
  accent: "#62C6D8",
  stages: ["The hold", "The draw"],
  words: [
    { id: "hold", stage: 0, name: "A hold", why: "money set aside when the job starts, and not yet taken" },
    { id: "draw", stage: 1, name: "The draw", why: "the moment the money moves, which is the delivery" },
  ],
  steps: [
    { layout: "title", stage: 0, title: "How a hold works", sub: "SET ASIDE, THEN TAKEN", narration: "Money set aside is not money taken." },
    {
      layout: "wall", stage: 0, title: "The hold", heading: "The hold.", words: ["hold"],
      cards: ["Balance", "Hold", "Draw"],
      captions: ["The balance drops before anything is paid."],
      narration: "When a job starts, the buyer's balance drops by the price of the work.",
    },
    { layout: "synopsis", stage: 1, title: "In short", lines: ["A hold is not a charge."], narration: "The draw happens on delivery." },
  ],
};

const HTML = `<!doctype html><html><head><title>What a hold is</title>
<style>body { color: #62C6D8 }</style></head>
<body>
<p>This page explains how money is held while a job runs.</p>
<h1 id="the-hold">The hold</h1>
<p>A hold sets money aside when the job starts.</p>
<script>console.log("never read")</script>
<h2>The draw</h2>
<p>The draw happens on delivery &amp; not before.</p>
</body></html>`;

const MARKDOWN = `---
title: front matter is the file's own bookkeeping
---

# What a hold is

Money is set aside when the job starts.

## The \`draw\`

The draw happens on delivery.
`;

/** A folder with one of each source in it, as a message would leave them. */
function sourceFolder() {
  const dir = mkdtempSync(join(tmpdir(), "quiz-read-"));
  const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p; };
  return {
    dir,
    vtt: write("meridian.vtt", VTT),
    script: write("script.json", JSON.stringify(SCRIPT, null, 2)),
    markdown: write("handbook.md", MARKDOWN),
    page: write("page.html", HTML),
    binary: write("pretend.txt", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x1f, 0x00])),
    drop: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("cue fragments merge into sentences, each placed at the time it was said", async () => {
  const cues = parseVtt(VTT);
  assert.equal(cues.length, 6, "the header and the note are not cues");
  assert.equal(cues[1].text, "Money is set aside", "a voice tag is not part of what was said");

  const parts = partsFromVtt(VTT);
  assert.equal(parts.length, 3, "four cues of one sentence are one part, not four");
  assert.equal(parts[0].text, "A hold is not a charge. Money is set aside when the job starts, and it is only taken when the work is delivered.");
  assert.deepEqual(parts[0].place, { kind: "time", value: 0, label: "at 0:00", fragment: "t=0" });
  assert.deepEqual(parts[1].place, { kind: "time", value: 10, label: "at 0:10", fragment: "t=10" });
  assert.deepEqual(parts[2].place, { kind: "time", value: 3605, label: "at 1:00:05", fragment: "t=3605" });
  assert.equal(timeLabel(83), "at 1:23");

  // A rolling caption repeats its line as the next one arrives; it is said once.
  const rolling = mergeCues([
    { start: 0, end: 2, text: "the same line" },
    { start: 2, end: 4, text: "the same line" },
    { start: 4, end: 6, text: "and then a longer sentence that finishes the thought at last." },
  ]);
  assert.equal(rolling.length, 1);
  assert.equal(rolling[0].text, "the same line and then a longer sentence that finishes the thought at last.");
});

test("a beat script is one part a step, and its words panel travels with the reading", async () => {
  const parts = partsFromBeatScript(SCRIPT);
  assert.deepEqual(parts.map((p) => p.place.fragment), ["s1", "s2", "s3"]);
  assert.deepEqual(parts.map((p) => p.place.label), ["step 1", "step 2", "step 3"]);
  assert.deepEqual(parts[0].place, { kind: "step", value: 1, label: "step 1", fragment: "s1" });

  const onStep2 = parts[1].text;
  assert.ok(onStep2.startsWith("When a job starts,"), "the narration leads the part");
  assert.ok(onStep2.includes("Balance"), "what is on the canvas is part of what the step teaches");
  assert.ok(onStep2.includes("The balance drops before anything is paid."));
  assert.ok(!onStep2.includes("wall"), "the layout names a shape and is not words on the canvas");
  assert.equal(onStep2.match(/The hold/g).length, 1, "a title and a heading that are the same sentence are said once");

  assert.deepEqual(wordsOfBeatScript(SCRIPT), SCRIPT.words);
  assert.equal(wordsOfBeatScript({ steps: [] }), null);

  const f = sourceFolder();
  try {
    const reading = await readSources([{ kind: "beat-script", path: f.script }]);
    assert.deepEqual(reading.words, SCRIPT.words, "the words panel is carried through as it was written");
    assert.deepEqual(reading.sources, [{ id: "src1", kind: "beat-script", name: "script.json" }]);
    assert.deepEqual(reading.parts.map((p) => p.id), ["p1", "p2", "p3"]);
    assert.ok(reading.parts.every((p) => p.source === "src1"));
  } finally { f.drop(); }
});

test("headings become parts with the anchors a reader can open", async () => {
  const parts = partsFromHtml(HTML);
  assert.deepEqual(parts.map((p) => p.place.label), ["What a hold is", "The hold", "The draw"]);
  assert.equal(parts[0].text, "This page explains how money is held while a job runs.", "what comes before the first heading is placed by the page's title");
  assert.equal(parts[1].place.fragment, "the-hold");
  assert.equal(parts[2].place.fragment, undefined, "a heading with no anchor is cited by its label");
  assert.equal(parts[2].text, "The draw happens on delivery & not before.");
  for (const part of parts) {
    assert.ok(!/#62C6D8|never read/.test(part.text), "what a page paints with or runs is not words a question is written from");
  }

  // A fetched page carries the address it settled on; a local html file never does.
  const page = { address: "https://example.test/hold.html", title: "What a hold is", html: HTML };
  const reading = await readSources([{ kind: "page", address: "https://example.test/hold.html" }], { page: async () => page });
  assert.deepEqual(reading.sources, [{ id: "src1", kind: "page", name: "What a hold is", address: "https://example.test/hold.html" }]);
  assert.equal(reading.parts.length, 3);

  // Markdown splits the same way, and a text file carries no anchors of its own.
  const fromText = partsFromText(MARKDOWN);
  assert.deepEqual(fromText.map((p) => [p.place.kind, p.place.label, p.place.fragment]), [
    ["heading", "What a hold is", undefined],
    ["heading", "The draw", undefined],
  ], "front matter is not a part, and a code span in a heading is not words a person reads");
  assert.equal(fromText[0].text, "Money is set aside when the job starts.");
  assert.deepEqual(partsFromText("Just a line with no heading over it.")[0].place, { kind: "page", value: 1, label: "page 1" });

  // A place label is printed beside a question, so the markup comes off it and
  // the characters that are not markup stay on.
  assert.equal(plainHeading("`mesh.funds.hold`"), "mesh.funds.hold");
  assert.equal(plainHeading("**The principle**"), "The principle");
  assert.equal(plainHeading("Read [the contract](https://agentmesh.ai/x)"), "Read the contract");
  assert.equal(plainHeading("mesh.feed.*.* and hold_id"), "mesh.feed.*.* and hold_id");
});

test("an address that is not https is refused, and so is a redirect off https", async () => {
  await assert.rejects(readSources([{ kind: "page", address: "http://example.test/hold.html" }]), /is not https/);
  await assert.rejects(fetchPage("file:///etc/passwd"), /file address, which is never opened/);
  await assert.rejects(fetchPage("data:text/html,<h1>hi</h1>"), /data address, which is never opened/);
  await assert.rejects(fetchPage("https://user:secret@example.test/x"), /carries a sign-in/);
  await assert.rejects(fetchPage("not a web address at all"), /is not a web address/);

  const landedOnHttp = {
    ok: true, status: 200, url: "http://example.test/hold.html",
    arrayBuffer: async () => new TextEncoder().encode(HTML).buffer,
  };
  await assert.rejects(fetchPage("https://example.test/hold.html", { fetchFn: async () => landedOnHttp }), /redirected to http:\/\/example\.test\/hold\.html, which is not https/);

  const signIn = { ok: false, status: 403, url: "https://example.test/hold.html", arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(fetchPage("https://example.test/hold.html", { fetchFn: async () => signIn }), /asks for a sign-in/);

  const huge = {
    ok: true, status: 200, url: "https://example.test/hold.html",
    arrayBuffer: async () => new TextEncoder().encode("x".repeat(2000)).buffer,
  };
  await assert.rejects(fetchPage("https://example.test/hold.html", { fetchFn: async () => huge, limit: 1024 }), /larger than the 1 kilobytes/);

  const ok = {
    ok: true, status: 200, url: "https://example.test/hold.html",
    arrayBuffer: async () => new TextEncoder().encode(HTML).buffer,
  };
  const page = await fetchPage("https://example.test/hold.html", { fetchFn: async () => ok });
  assert.equal(page.title, "What a hold is");
  assert.equal(page.address, "https://example.test/hold.html");
});

test("a file whose bytes are not text is refused by name, and so is one this step does not read", async () => {
  const f = sourceFolder();
  try {
    assert.ok(looksBinary(Buffer.from([0x00, 0x01, 0x02])));
    assert.ok(!looksBinary(Buffer.from("plain words\nin a file\n", "utf8")));

    await assert.rejects(readSources([{ kind: "document", path: f.binary }]),
      /the document pretend\.txt could not be read: its bytes are not text/);
    await assert.rejects(readSources([{ kind: "document", path: join(f.dir, "handbook.pdf") }]),
      /the document handbook\.pdf could not be read: this step reads/);
    await assert.rejects(readSources([{ kind: "document", path: join(f.dir, "missing.md") }]),
      /the document missing\.md could not be read: there is no file by that name/);
    await assert.rejects(readSources([]), /nothing arrived that can be read/);
    await assert.rejects(readSources([{ kind: "video", path: f.vtt }]), /is not a kind of source this step reads/);
  } finally { f.drop(); }
});

test("the notes become one part, cited by a label and linked to nothing", async () => {
  const parts = partsFromNotes("  The buyer asked about holds twice.\n\n  Test that, not the wording.  ");
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].place, { kind: "note", label: "the notes" }, "there is one note, and it has no fragment");
  assert.equal(parts[0].text, "The buyer asked about holds twice.\n\nTest that, not the wording.");
  assert.deepEqual(partsFromNotes("   "), []);

  const reading = await readSources([{ kind: "notes", text: "Only the notes arrived." }]);
  assert.deepEqual(reading.sources, [{ id: "src1", kind: "notes", name: "the notes" }]);
  assert.equal(reading.words, undefined, "no beat script, no words panel");
  assert.deepEqual(reading.parts, [{ id: "p1", source: "src1", place: { kind: "note", label: "the notes" }, text: "Only the notes arrived." }]);
});

test("no local file path reaches the reading, whatever was given", async () => {
  const f = sourceFolder();
  try {
    const reading = await readSources([
      { kind: "transcript", path: f.vtt, address: "https://agentmesh.ai/draft/meridian.html" },
      { kind: "beat-script", path: f.script },
      { kind: "document", path: f.markdown },
      { kind: "document", path: f.page },
      { kind: "notes", text: "Test whether they understood the hold." },
    ]);
    const written = JSON.stringify(reading, null, 2);
    assert.ok(!written.includes(f.dir), "the folder the sources came from is in the reading");
    assert.ok(!written.includes(f.dir.replace(/\\/g, "\\\\")), "the folder the sources came from is in the reading");
    assert.ok(!written.includes(tmpdir()), "a local path is in the reading");
    for (const source of reading.sources) {
      assert.ok(!/[\\/]/.test(source.name), `${source.name} is a path and not a bare name`);
      assert.ok(!source.address || source.address.startsWith("https://"), "an address is carried only when it is a real web address");
    }
    assert.deepEqual(reading.sources.map((s) => [s.id, s.kind, s.name, s.address]), [
      ["src1", "transcript", "meridian.vtt", "https://agentmesh.ai/draft/meridian.html"],
      ["src2", "beat-script", "script.json", undefined],
      ["src3", "document", "handbook.md", undefined],
      ["src4", "document", "page.html", undefined],
      ["src5", "notes", "the notes", undefined],
    ]);
    assert.equal(reading.reading, "v1");
    assert.deepEqual(reading.words, SCRIPT.words);
    assert.deepEqual(reading.parts.map((p) => p.id), reading.parts.map((_, i) => `p${i + 1}`), "part ids run from one across the whole reading");
    for (const part of reading.parts) {
      assert.ok(part.place && part.place.kind && part.place.label, "a part with no place is not written");
      assert.ok(part.text.trim(), "a part with no words is not written");
      assert.ok(reading.sources.some((s) => s.id === part.source));
    }
    assert.deepEqual([...new Set(reading.parts.map((p) => p.place.kind))], ["time", "step", "heading", "note"]);

    // An address that is not https is not carried beside a file either.
    await assert.rejects(readSources([{ kind: "transcript", path: f.vtt, address: "http://agentmesh.ai/draft/meridian.html" }]), /is not https/);
  } finally { f.drop(); }
});

test("run from the shell, it writes the reading the next step reads", () => {
  const f = sourceFolder();
  try {
    const out = join(f.dir, "records", "job-1", "reading.json");
    const sources = JSON.stringify([{ kind: "transcript", path: f.vtt }, { kind: "beat-script", path: f.script }]);
    const r = spawnSync(process.execPath, [script], { env: { ...process.env, SOURCES: sources, OUT: out }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /read 2 sources into 6 parts: meridian\.vtt \(3\), script\.json \(3\); carried 2 words from the words panel/);
    const reading = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(reading.parts.length, 6);
    assert.deepEqual(reading.words, SCRIPT.words);

    // The one to a variable form reads the same sources.
    const byName = spawnSync(process.execPath, [script], {
      env: { ...process.env, SOURCES: "", TRANSCRIPT: f.vtt, DOCUMENT: f.markdown, NOTES: "Ask them what a hold is.", OUT: out },
      encoding: "utf8",
    });
    assert.equal(byName.status, 0, byName.stderr);
    assert.match(byName.stdout, /read 3 sources into 6 parts: meridian\.vtt \(3\), handbook\.md \(2\), the notes \(1\)$/m);

    // A refusal says one plain sentence and stops.
    const refused = spawnSync(process.execPath, [script], {
      env: { ...process.env, SOURCES: "", PAGE: "http://example.test/hold.html", OUT: out },
      encoding: "utf8",
    });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /^refused: the page address http:\/\/example\.test\/hold\.html is not https/);
    assert.ok(!refused.stderr.includes("—"), "a refusal a person reads carries no em dash");

    const nothing = spawnSync(process.execPath, [script], { env: { ...process.env, SOURCES: "", OUT: out }, encoding: "utf8" });
    assert.equal(nothing.status, 1);
    assert.match(nothing.stderr, /^refused: nothing arrived that can be read/);

    // The settings being wrong is the caller's to fix, and it is told apart.
    const badSettings = spawnSync(process.execPath, [script], { env: { ...process.env, SOURCES: "not json at all", OUT: out }, encoding: "utf8" });
    assert.equal(badSettings.status, 2);
    assert.match(badSettings.stderr, /^refused: SOURCES is not JSON/);
  } finally { f.drop(); }
});
