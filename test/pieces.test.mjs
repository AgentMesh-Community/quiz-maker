// The job folder lists what was delivered, by the step that made it.
//
// What is worth pinning: a staged quiz becomes a job folder with the concept
// list, the quiz, the page and the address under out/, listed in pieces.json
// in the offering's order with the step that made each and the address marked
// as a link; a delivery short of any one of the four is refused by name and
// writes no pieces.json at all; and a file that is not what was staged is
// refused by its digest. Run: node --test test/pieces.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { fill, plan, STEP_OF } from "../scripts/pieces.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "pieces.mjs");
const sha = (b) => createHash("sha256").update(b).digest("hex");

// A work folder as stage-quiz.mjs leaves it: the page, the quiz beside it
// under the same name, the concept list the questions were written from, and
// the staging record naming each with its digest and path.
function stagedWork() {
  const dir = mkdtempSync(join(tmpdir(), "quiz-pieces-"));
  const work = join(dir, "work");
  const job = join(dir, "job");
  mkdirSync(work, { recursive: true });
  mkdirSync(job, { recursive: true });
  const files = {
    page: [join(work, "page.html"), "<!DOCTYPE html>the quiz page"],
    quiz: [join(work, "quiz.json"), '{"quiz":"v1","questions":[]}\n'],
    concepts: [join(work, "concepts.md"), "# The concepts\n\n- a hold is not a charge\n"],
  };
  for (const [p, body] of Object.values(files)) writeFileSync(p, body);
  const staged = {
    name: "meridian-quiz", at: "2026-09-12T00:00:00Z", url: "https://example.test/draft/meridian-quiz.html",
    page: { object: "draft/meridian-quiz.html", sha256: sha(files.page[1]), path: files.page[0] },
    quiz: { object: "draft/meridian-quiz.json", sha256: sha(files.quiz[1]), path: files.quiz[0] },
  };
  writeFileSync(join(work, "staged.json"), JSON.stringify(staged, null, 2) + "\n");
  return { dir, work, job, staged, files, drop: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a delivery lists all four pieces by the step that made it, and places each under out/", () => {
  const w = stagedWork();
  try {
    const listed = fill(w.job, plan({ staged: w.staged, conceptsPath: w.files.concepts[0] }));
    assert.deepEqual(listed.map((e) => [e.name, e.step, e.path]), [
      ["concept list", "name-the-concepts", "out/concepts.md"],
      ["quiz", "write-the-questions", "out/meridian-quiz.json"],
      ["quiz page", "stage-the-quiz", "out/meridian-quiz.html"],
      ["quiz address", "stage-the-quiz", "out/quiz-address.txt"],
    ]);
    for (const e of listed) {
      assert.deepEqual(Object.keys(e), ["name", "step", "path", "media_type", "produced_from", "about", ...(e.name === "quiz address" ? ["kind"] : [])]);
      assert.ok(existsSync(join(w.job, e.path)), `${e.path} was not placed`);
      // The sentence travels with the piece and is what the next agent reads.
      assert.ok(e.about && e.about.trim().length > 20, `${e.name} carries no sentence saying what it is`);
    }
    assert.deepEqual(listed.map((e) => e.media_type), ["text/markdown", "application/json", "text/html", "text/plain"]);
    assert.deepEqual(listed.map((e) => e.produced_from), [["source"], ["concept list"], ["quiz"], ["quiz page", "quiz"]]);
    assert.equal(listed[3].kind, "link", "the quiz address is a link: its file holds one web address");
    assert.ok(listed.slice(0, 3).every((e) => e.kind === undefined), "only the quiz address is a link");
    assert.equal(readFileSync(join(w.job, "out", "quiz-address.txt"), "utf8"), "https://example.test/draft/meridian-quiz.html\n");
    assert.equal(readFileSync(join(w.job, "out", "meridian-quiz.html"), "utf8"), "<!DOCTYPE html>the quiz page");
    assert.equal(readFileSync(join(w.job, "out", "concepts.md"), "utf8"), "# The concepts\n\n- a hold is not a charge\n");
    assert.deepEqual(JSON.parse(readFileSync(join(w.job, "pieces.json"), "utf8")), listed);
    assert.equal(Object.keys(STEP_OF).length, 4);
  } finally { w.drop(); }
});

test("a delivery short of any one of the four is refused by name, and nothing is listed", () => {
  const w = stagedWork();
  try {
    const whole = { staged: w.staged, conceptsPath: w.files.concepts[0] };
    assert.throws(() => plan({ ...whole, conceptsPath: undefined }), /the concept list is missing/);
    assert.throws(() => plan({ ...whole, staged: { ...w.staged, quiz: null } }), /the quiz is missing/);
    assert.throws(() => plan({ ...whole, staged: { ...w.staged, page: null } }), /the quiz page is missing/);
    assert.throws(() => plan({ ...whole, staged: { ...w.staged, url: null } }), /the quiz address is missing/);
    assert.throws(() => plan({ ...whole, staged: {} }), /the quiz is missing/);

    // A record that names a staged file but says nowhere it can be read from.
    assert.throws(() => plan({ ...whole, staged: { ...w.staged, quiz: { object: "draft/meridian-quiz.json" } } }), /carries no path for the quiz/);
    assert.equal(plan({ ...whole, staged: { ...w.staged, page: { object: "draft/meridian-quiz.html" } }, paths: { page: w.files.page[0] } }).copies.length, 3);

    // Refused before anything is placed: the folder is left as it was found.
    assert.throws(() => fill(w.job, plan({ ...whole, conceptsPath: join(w.work, "no-concepts.md") })), /the concept list is not at /);
    assert.ok(!existsSync(join(w.job, "pieces.json")), "pieces.json was written for a refused delivery");
    assert.ok(!existsSync(join(w.job, "out")), "a piece was placed for a refused delivery");
  } finally { w.drop(); }
});

test("a file that is not what was staged is refused by its digest", () => {
  const w = stagedWork();
  try {
    writeFileSync(w.files.page[0], "<!DOCTYPE html>edited after staging");
    assert.throws(() => fill(w.job, plan({ staged: w.staged, conceptsPath: w.files.concepts[0] })), /the quiz page .* is not what was staged/);
    assert.ok(!existsSync(join(w.job, "pieces.json")), "pieces.json was written for a refused delivery");
  } finally { w.drop(); }
});

test("run from the shell, it fills the job folder the adapter reads", () => {
  const w = stagedWork();
  try {
    const env = { ...process.env, JOB_DIR: w.job, STAGED: join(w.work, "staged.json"), CONCEPTS: w.files.concepts[0] };
    const r = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /4 pieces listed .*pieces\.json: out\/concepts\.md, out\/meridian-quiz\.json, out\/meridian-quiz\.html, out\/quiz-address\.txt/);
    assert.equal(JSON.parse(readFileSync(join(w.job, "pieces.json"), "utf8")).length, 4);

    const short = spawnSync(process.execPath, [script], { env: { ...env, CONCEPTS: "" }, encoding: "utf8" });
    assert.equal(short.status, 1);
    assert.match(short.stderr, /^refused: the concept list is missing/);

    const missing = spawnSync(process.execPath, [script], { env: { ...env, JOB_DIR: join(w.dir, "no-such-folder") }, encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /^refused: the job folder does not exist/);

    const nothing = spawnSync(process.execPath, [script], { env: { ...process.env, JOB_DIR: w.job }, encoding: "utf8" });
    assert.equal(nothing.status, 2);
    assert.match(nothing.stderr, /^refused: JOB_DIR and STAGED are required/);
  } finally { w.drop(); }
});
