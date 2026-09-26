// Fill a job folder from what was staged: every delivered piece under out/,
// and pieces.json, the list the adapter reads when the reply is sent, one
// entry per piece with the step that made it. The adapter signs the job
// manifest from that list; a reply with no pieces.json carries no job.
//   needs: node >= 22; the staging record stage-quiz.mjs left (with the local path of each staged file) and the concept list
//   [JOB_DIR=<job folder>, else MESH_JOB_DIR from the host] STAGED=staged.json CONCEPTS=concepts.md node pieces.mjs
//   PAGE=<page.html> QUIZ=<quiz.json>: where the staged files are, for a staging record that carries no paths
//
// The offering has four outputs and they all go, or none of them do. A quiz
// handed over without its concept list is a set of questions nobody can check
// against what they were meant to test, and a page handed over without its
// address is a file the person has to open themselves. So a missing piece is
// refused by name and pieces.json is not written: a delivery that is short a
// piece should fail where it can be fixed, not arrive looking whole.
//
// The quiz address is a link entry: its file holds one web address, and a
// reader shows it as an address rather than as a file to download.
//
// Every copied file is checked against the digest in the staging record, so
// what the adapter hands over is what was placed at the address.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

/** Copy a file by its BYTES, never with copyFileSync.
 *
 *  copyFileSync carries the source file's mode to the destination, and a
 *  destination on a mount does not always accept one: a job folder reached
 *  through gcsfuse is served with a fixed file mode and the chmod that
 *  copyFileSync performs is not the mount's to grant. On a host the two are
 *  indistinguishable, which is exactly why this was written the other way and
 *  only came apart the first time a container filed its own pieces.
 *
 *  Reading and writing moves the content and asks for nothing else, which is
 *  all a delivered piece ever needed. */
const copyBytes = (from, to) => writeFileSync(to, readFileSync(from));

export const STEP_OF = {
  "concept list": "name-the-concepts",
  "quiz": "write-the-questions",
  "quiz page": "stage-the-quiz",
  "quiz address": "stage-the-quiz",
};

// What each piece is, in a sentence, carried with it so the next agent reads
// what it was handed instead of inferring it from a file name. Each says the
// thing a reader who was not here would get wrong: which concepts went
// untested and why, and that the page is already live at its address.
const ABOUT = {
  "concept list": "The things the reading actually teaches, named before any question was written, because a question is only worth asking about something the source teaches. A concept marked as left is one nothing could be asked about, with the reason.",
  "quiz": "The questions, as data: one right answer and three wrong ones each, with the passage each was written from. A question refused three times is not here at all, and the concept it belonged to says so.",
  "quiz page": "The quiz as one page that runs on its own, taking the reading's own colours and fonts. One question at a time, with Next and Back, and no network call once it has loaded.",
  "quiz address": "Where the page is served. It is live: anybody with this address can open it.",
};

// The plan: what to list and what to copy, from the staging record and the
// concept list's path. Pure, so it can be checked without a folder; the caller
// does the copying.
export function plan({ staged, conceptsPath, paths = {} }) {
  const piece = (name, path, media_type, produced_from) => ({ name, step: STEP_OF[name], path, media_type, produced_from, about: ABOUT[name] });
  const entries = [];
  const copies = [];

  if (!conceptsPath) throw new Error("the concept list is missing: CONCEPTS names the file the questions were written from");
  const conceptsTo = `out/${basename(conceptsPath)}`;
  copies.push({ from: conceptsPath, to: conceptsTo, what: "the concept list" });
  entries.push(piece("concept list", conceptsTo, "text/markdown", ["source"]));

  if (!staged?.quiz?.object) throw new Error("the quiz is missing: the staging record names no quiz file");
  const quizFrom = staged.quiz.path ?? paths.quiz;
  if (!quizFrom) throw new Error("the staging record carries no path for the quiz and QUIZ is not set");
  const quizTo = `out/${basename(staged.quiz.object)}`;
  copies.push({ from: quizFrom, to: quizTo, sha256: staged.quiz.sha256, what: "the quiz" });
  entries.push(piece("quiz", quizTo, "application/json", ["concept list"]));

  if (!staged?.page?.object) throw new Error("the quiz page is missing: the staging record names no page");
  const pageFrom = staged.page.path ?? paths.page;
  if (!pageFrom) throw new Error("the staging record carries no path for the quiz page and PAGE is not set");
  const pageTo = `out/${basename(staged.page.object)}`;
  copies.push({ from: pageFrom, to: pageTo, sha256: staged.page.sha256, what: "the quiz page" });
  entries.push(piece("quiz page", pageTo, "text/html", ["quiz"]));

  if (!staged?.url) throw new Error("the quiz address is missing: the staging record says nothing was placed where the person can open it");
  entries.push({ ...piece("quiz address", "out/quiz-address.txt", "text/plain", ["quiz page", "quiz"]), kind: "link", text: `${staged.url}\n` });

  return { entries, copies };
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

// Place the files and write the list. Returns the entries as written. Nothing
// is written at all until every copy has been made, so a refused delivery
// leaves no half-filled folder behind it.
export function fill(jobDir, { entries, copies }) {
  for (const c of copies) {
    if (!existsSync(c.from)) throw new Error(`${c.what} is not at ${c.from}`);
    if (c.sha256 && sha(readFileSync(c.from)) !== c.sha256) throw new Error(`${c.what} at ${c.from} is not what was staged: its digest differs from the staging record`);
  }
  for (const c of copies) {
    const dest = join(jobDir, c.to);
    mkdirSync(dirname(dest), { recursive: true });
    copyBytes(c.from, dest);
  }
  const listed = entries.map((e) => {
    if (e.text === undefined) return e;
    const { text, ...rest } = e;
    const dest = join(jobDir, rest.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
    return rest;
  });
  writeFileSync(join(jobDir, "pieces.json"), JSON.stringify(listed, null, 2) + "\n");
  return listed;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const { STAGED, CONCEPTS, PAGE, QUIZ } = process.env;
  // The job folder the host prepared for THIS message. It arrives in the
  // environment so that nothing has to copy a path out of a prompt: an agent
  // that read the path from its instructions and wrote its manifest into a
  // folder of its own once handed over finished work as nothing. An explicit
  // JOB_DIR still wins, for a hand run.
  const JOB_DIR = process.env.JOB_DIR || process.env.MESH_JOB_DIR;
  if (!JOB_DIR || !STAGED) { console.error("refused: JOB_DIR and STAGED are required"); process.exit(2); }
  if (!existsSync(JOB_DIR) || !statSync(JOB_DIR).isDirectory()) { console.error(`refused: the job folder does not exist: ${JOB_DIR}`); process.exit(2); }
  try {
    const staged = JSON.parse(readFileSync(STAGED, "utf8"));
    const listed = fill(JOB_DIR, plan({ staged, conceptsPath: CONCEPTS, paths: { page: PAGE, quiz: QUIZ } }));
    console.log(`${listed.length} pieces listed at ${join(JOB_DIR, "pieces.json")}: ${listed.map((e) => e.path).join(", ")}`);
  } catch (e) {
    console.error(`refused: ${e.message}`);
    process.exit(1);
  }
}
