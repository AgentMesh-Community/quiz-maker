// Make the quiz: one command, five steps, two calls to a model.
//   needs: node >= 22, network to the text-reasoning service, to the draft
//   host, and to any page address the message names,
//   TEXT_API_KEY (the credential named text-reasoning-key, placed by the host;
//   needed only where the concepts or the questions have to be written),
//   DRAFT_HOST_CREDENTIAL, DRAFT_HOST_BUCKET, DRAFT_HOST_PREFIX, DRAFT_HOST_URL,
//   CEILING_TEXT_REASONING (calls per task, when the owner set one)
//   WORK=<work folder> RECORDS=<records folder> [JOB_DIR=<job folder>, else MESH_JOB_DIR]
//   [SOURCES=<json>] [TRANSCRIPT=|BEAT_SCRIPT=|DOCUMENT=|PAGE=|NOTES=]
//   [AUDIENCE=<text>] [CONCEPTS=<file or the text>] [HOW_MANY=<n>] [NAME=<slug>]
//   [QUIZ_CREDIT=on, to carry the Built by AgentMesh footer on the page]
//   node make-quiz.mjs
//
// WHY THIS FILE EXISTS. The first multi-agent run failed three times in the
// same way: a step with a written procedure was left to a model to improvise.
// It wrote the work, and then instead of filing the delivery it described one:
// out/ was empty, no pieces.json was written, nothing was staged, and the reply
// said a draft had been staged. Naming the concepts and writing the questions
// are the judgment in this job. Everything around them is mechanics, and
// mechanics belong in a program.
//
// It reads only what it is given and never goes looking for a file anywhere
// else. It prints one JSON object with a `reply` field. Exit codes: 0 done;
// 2 usage; 3 the job stops and the reply says why, which the harness sends as
// it stands; 1 failed.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { disk, readSources, sourcesFromEnv } from "./read-source.mjs";
import { FAULTS, checkQuiz, faultLines } from "./check-quiz.mjs";
import { note } from "./went-without.mjs";
import { BRAND_SCHEMA, backTo, brandFrom, buildQuizPage, creditOn, usedRecord } from "./build-quiz-page.mjs";
import { fill, plan as piecesPlan } from "./pieces.mjs";

// The model that makes the two judgments in this job, and the variable a
// deployer names another in. Which model wrote somebody's questions is a
// material fact about the work: it is most of what the questions are worth and
// most of what they cost. Held as a constant inside this file it was stated
// nowhere a caller, a deployer or an AgentDoc could read, and changing it was a
// one-line edit that left no trace. It is a declared setting now, so the
// package says what it uses and the host may say otherwise. See modelOf.
export const MODEL = "gemini-2.5-pro";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// The five steps of this job, in the order they run. Two of them are judgment
// and the other three are this script.
export const STEPS = ["read-the-source", "name-the-concepts", "write-the-questions", "check-the-questions", "stage-the-quiz"];

// What the reply says when the message brought nothing to read.
export const NO_SOURCE = [
  "There is nothing to make a quiz from, so none was made.",
  "This job takes a transcript, a document, a page address a reader can open without signing in, a beat script, or notes.",
  "More than one is fine and they are read together.",
  "Send one of those and I will make the quiz.",
].join(" ");

// The variables the scripts this one runs read for themselves. They are
// cleared before each child so a value meant for one step can never leak into
// another. PAGE is why this list exists: to this job PAGE is a web address
// somebody wants read, and to stage-quiz.mjs it is the html file to place, so
// a PAGE left in the environment would put the person's source address where
// the finished page belongs.
const CHILD_VARS = ["PAGE", "QUIZ", "NAME", "OUT", "STAGED", "CONCEPTS", "READING", "PROFILE",
  "SOURCES", "TRANSCRIPT", "BEAT_SCRIPT", "DOCUMENT", "NOTES", "JOB_DIR", "MESH_JOB_DIR", "MESH_JOB_BAG"];

const trim = (text) => String(text ?? "").trim();
export const modelOf = (env = {}) => trim(env.TEXT_MODEL) || MODEL;
const write = (path, text) => writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const many = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const listOf = (xs) => (xs.length < 2 ? String(xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const sentence = (text) => {
  const t = trim(text);
  if (!t) return "";
  return `${t[0].toUpperCase()}${t.slice(1)}${/[.?!]$/.test(t) ? "" : "."}`;
};

/** The first thing a failed child said, for a reply that names the reason
 *  rather than the exit code. */
export const firstLine = (text, fallback = "it gave no reason") => {
  const line = String(text ?? "").split("\n").map((s) => s.trim()).find(Boolean);
  return line ? line.slice(0, 300) : fallback;
};

/** The last thing a child said. stage-quiz.mjs prints the quiz address last,
 *  after a line per object it placed. */
export const lastLine = (text) => {
  const lines = String(text ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
};

/** One of this package's scripts, run as its own program with the variables it
 *  reads. Handed in so a test drives the whole job without a draft host. */
export function runScript({ here, script, env = {} }) {
  const child = { ...process.env };
  for (const k of CHILD_VARS) delete child[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== null && `${v}` !== "") child[k] = String(v);
  const r = spawnSync(process.execPath, [join(here, script)], { env: child, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { code: 1, stdout: r.stdout ?? "", stderr: r.error.message };
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A value that is either a path to a file or the thing itself. The concept
 *  list arrives both ways: attached as the file we delivered, or pasted into
 *  the message with the person's edits in it. */
export function textFrom(value) {
  const v = trim(value);
  if (!v) return "";
  try { if (existsSync(v) && statSync(v).isFile()) return readFileSync(v, "utf8"); } catch { /* it was the text */ }
  return v;
}

/** A slug from a title: lowercase, words joined by hyphens, nothing else. It
 *  has to satisfy the same expression stage-quiz.mjs and build-quiz-page.mjs
 *  both test the name against. */
export const slugOf = (title) => trim(title).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 60).replace(/-+$/, "");

export const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** The quiz's name, which is the name the page and the quiz file are both
 *  staged under, so the page's first line can say where its own questions
 *  live. NAME wins; failing that the quiz's title becomes the slug. Never
 *  chosen freely: two quizzes sharing a name share an address, and the newer
 *  one then asks its questions over the older one's page. */
export function quizName({ env = {}, quiz = null } = {}) {
  const given = trim(env.NAME);
  if (given) {
    if (!SLUG.test(given)) throw new Error(`NAME must be a lowercase slug of letters, numbers and hyphens, and this one is ${given}`);
    return given;
  }
  const from = slugOf(quiz?.title);
  if (!from || !SLUG.test(from)) throw new Error("the quiz has no title to name it after, and NAME is not set");
  return from;
}

// ── the concept list, which is a round trip ─────────────────────────────────
//
// The concept list is delivered as text, and a person may edit it and hand it
// back as the list to write the questions from. So it is written in one strict
// form and read back in that same form, and the two live beside each other
// here because a format that is written in one place and parsed in another
// drifts apart the first time somebody improves one of them.

const CONCEPTS_VERSION = "v1";
const TITLE_LINE = /^title\s*:\s*(.*)$/i;
const AUDIENCE_LINE = /^audience\s*:\s*(.*)$/i;
const UNDERSTOOD_LINE = /^understood\s*:\s*(.*)$/i;
const TAUGHT_LINE = /^taught at\s*:\s*(.*)$/i;
const LEFT_LINE = /^left\s*:\s*(.*)$/i;
const MENTIONED_LINE = /^mentioned and not taught\s*:\s*(.*)$/i;
const HEADING_LINE = /^##\s+(.*)$/;

/** Where a concept is taught, as the line a person reads: the part's label for
 *  them and the part id in brackets for the program. The id is the thing that
 *  matters and the label is only the reader's bearings. */
const taughtLine = (concept) => {
  const id = trim(concept?.taught_at);
  const label = trim(concept?.taught_label);
  return label ? `${label} (${id})` : id;
};

/** The concept list as the text that is delivered, and as the text a person
 *  may edit and hand back. `concepts` is either the list itself or the whole
 *  concept-list object, so the mentioned words travel with it either way. */
export function conceptsToMarkdown(concepts, audience = "") {
  const whole = Array.isArray(concepts) ? { concepts } : (concepts ?? {});
  const list = Array.isArray(concepts) ? concepts : (whole.concepts ?? []);
  const who = trim(audience) || trim(whole.audience);
  const named = trim(whole.title);
  const mentioned = (whole.mentioned ?? []).map(trim).filter(Boolean);
  const out = [];
  if (named) out.push(`Title: ${named}`, "");
  if (who) out.push(`Audience: ${who}`, "");
  for (const c of list) {
    out.push(`## ${trim(c?.phrase)}`);
    out.push(`Understood: ${trim(c?.understood)}`);
    out.push(`Taught at: ${taughtLine(c)}`);
    if (trim(c?.left)) out.push(`Left: ${trim(c.left)}`);
    out.push("");
  }
  if (mentioned.length) out.push(`Mentioned and not taught: ${mentioned.join(", ")}`, "");
  return `${out.join("\n").trimEnd()}\n`;
}

/** The concept list back out of that text. Throws one plain sentence when the
 *  text is not a concept list: a list with no concepts in it, or a concept
 *  nobody can place, because a concept with no part id cannot carry a question
 *  that says where its answer came from, and that is the whole job. */
export function conceptsFromMarkdown(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const out = { concept_list: CONCEPTS_VERSION, title: "", audience: "", concepts: [], mentioned: [] };
  let current = null;
  let field = null;
  const close = () => { if (current) out.concepts.push(current); current = null; field = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { field = null; continue; }
    const heading = HEADING_LINE.exec(line);
    if (heading) { close(); current = { phrase: heading[1].trim(), understood: "", taught_at: "", taught_label: "" }; field = "phrase"; continue; }
    const mentioned = MENTIONED_LINE.exec(line);
    if (mentioned) { close(); out.mentioned = mentioned[1].split(",").map((s) => s.trim()).filter(Boolean); field = "mentioned"; continue; }
    const named = TITLE_LINE.exec(line);
    if (named && !current) { out.title = named[1].trim(); field = "title"; continue; }
    const audience = AUDIENCE_LINE.exec(line);
    if (audience && !current) { out.audience = audience[1].trim(); field = "audience"; continue; }
    if (!current) { field = null; continue; }
    const understood = UNDERSTOOD_LINE.exec(line);
    if (understood) { current.understood = understood[1].trim(); field = "understood"; continue; }
    const taught = TAUGHT_LINE.exec(line);
    if (taught) { Object.assign(current, placeIn(taught[1], current.phrase)); field = "taught"; continue; }
    const left = LEFT_LINE.exec(line);
    if (left) { current.left = left[1].trim(); field = "left"; continue; }
    // A line that is none of those extends the field above it, so a sentence
    // somebody wrapped while editing survives the trip back.
    if (field === "understood") current.understood = `${current.understood} ${line}`.trim();
    else if (field === "left") current.left = `${current.left} ${line}`.trim();
    else if (field === "audience") out.audience = `${out.audience} ${line}`.trim();
    else if (field === "title") out.title = `${out.title} ${line}`.trim();
  }
  close();
  if (!out.concepts.length) {
    throw new Error("that concept list carries no concepts: each one is a line beginning ## with the concept in plain words, then Understood: and Taught at: under it");
  }
  out.concepts = out.concepts.map((c, i) => {
    if (!c.understood) throw new Error(`the concept "${c.phrase}" gives no Understood: line, and that sentence is what a question is written from`);
    const entry = { id: `c${i + 1}`, phrase: c.phrase, understood: c.understood, taught_at: c.taught_at };
    if (c.taught_label) entry.taught_label = c.taught_label;
    if (trim(c.left)) entry.left = trim(c.left);
    return entry;
  });
  return out;
}

/** The part id and the reader's label out of a Taught at: line. It is written
 *  as `What a hold is (p1)`, and a bare `p1` is read too, because somebody
 *  adding a concept by hand writes the id and not the label. */
function placeIn(value, phrase) {
  const said = trim(value);
  const bracketed = /^(.*?)\s*\(([^()]+)\)$/.exec(said);
  if (bracketed) {
    const id = bracketed[2].trim();
    if (id) return { taught_at: id, taught_label: bracketed[1].trim() };
  } else if (said && !/\s/.test(said)) {
    return { taught_at: said, taught_label: "" };
  }
  throw new Error(`the concept "${phrase}" does not name the part of the source it is taught at: write it as "Taught at: the part's heading (p3)", where p3 is the part id`);
}

/** The words panel of a beat script, read as the concept list.
 *
 *  shapes.md says that panel IS the concept list: those are the words the
 *  explainer set out to explain, each with the one line explaining it, and a
 *  second list named beside them would be a second quiz.
 *
 *  The one thing the panel does not carry is where each word is taught, so
 *  that is settled here: the first part of the beat script that says the word,
 *  and failing that the script's first part. shapes.md leaves it open and a
 *  concept with no place cannot carry a question. */
export function conceptsFromWords(words, reading = null) {
  const parts = Array.isArray(reading?.parts) ? reading.parts : [];
  const fromScript = new Set((reading?.sources ?? []).filter((s) => s?.kind === "beat-script").map((s) => s.id));
  const searchable = parts.filter((p) => fromScript.has(p.source));
  const where = searchable.length ? searchable : parts;
  const labels = new Map(parts.map((p) => [p.id, trim(p?.place?.label)]));
  const said = (text, phrase) => ` ${flat(text)} `.includes(` ${flat(phrase)} `);
  return (Array.isArray(words) ? words : []).map((w, i) => {
    const phrase = trim(w?.name) || trim(w?.id) || `the word ${i + 1}`;
    const found = where.find((p) => said(p.text, phrase)) ?? where[0];
    const entry = {
      id: `c${i + 1}`,
      phrase,
      // The line the panel carries, as a sentence. Nothing is added to it and
      // nothing is summarised; a word the panel left unexplained keeps its own
      // phrase rather than being given a sentence it never had.
      understood: sentence(trim(w?.why)) || sentence(phrase),
      taught_at: trim(found?.id),
    };
    const label = labels.get(entry.taught_at);
    if (label) entry.taught_label = label;
    return entry;
  }).filter((c) => c.taught_at);
}

const flat = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The concept list as it will be delivered, laid over what the model wrote in
 *  the quiz. The approved list is the authority for what is tested and in what
 *  order; the only thing the questions step may add is the reason a concept
 *  was left. A concept the model invented is not carried, and a question
 *  naming it comes back as unknown-concept, which is the truth about it. */
export function mergeConcepts(approved, written) {
  const wrote = new Map((Array.isArray(written) ? written : []).map((c) => [trim(c?.id), c]));
  return approved.map((c) => {
    const left = trim(c.left) || trim(wrote.get(c.id)?.left);
    return { id: c.id, phrase: c.phrase, understood: c.understood, taught_at: c.taught_at, ...(left ? { left } : {}) };
  });
}

/** The parts the quiz cites, copied out of the reading with their place and
 *  their source and without their text, in the reading's own order. Only the
 *  ones a question names in from or back_to, never the whole reading.
 *
 *  Written here and never asked of the model. It is a copy, and a model asked
 *  to copy back part of a file it was shown will eventually copy it wrong: a
 *  fragment one letter out is a link to nothing, and nothing would catch it.
 *
 *  It is what lets the quiz stand on its own. The page links every missed
 *  question back to where its concept is taught, and that link needs the place
 *  and the source's address, neither of which a bare part id carries. The
 *  reading lives in the job's records, a folder that belongs to one job and
 *  will not be beside the quiz in a month, so a quiz rebuilt then would lose
 *  every link back in silence. The text is deliberately left behind: a
 *  question cites a place so somebody can go and read it, and carrying the
 *  words would make the quiz a copy of the material rather than a pointer
 *  into it. */
export function placesFor(questions, reading) {
  const cited = new Set();
  for (const q of Array.isArray(questions) ? questions : []) {
    for (const field of ["from", "back_to"]) {
      const id = trim(q?.[field]);
      if (id) cited.add(id);
    }
  }
  return (reading?.parts ?? [])
    .filter((p) => cited.has(p.id))
    .map((p) => ({ id: p.id, source: p.source, place: { ...p.place } }));
}

// ── the context bag ─────────────────────────────────────────────────────────
//
// What a caller hands this job alongside the material: how they want things to
// look, what they have already said, what must never be said. It arrives as a
// list of entries beside the job's pieces, written by the adapter, which has
// already resolved every entry that arrived as an address and recorded what it
// got. This step does no network work of its own and never goes looking for a
// profile anywhere: an agent that fetched one whenever it happened to need it
// could see two different answers inside one job, and nothing afterwards would
// say which one shaped the work.

export const BAG_VERSION = "v1";

/** The bag beside this job, or nothing. MESH_JOB_BAG wins where the host named
 *  it; failing that it is bag.json in the job folder, beside pieces.json. */
export function readBag(jobDir, env = {}) {
  const path = trim(env.MESH_JOB_BAG) || (trim(jobDir) ? join(jobDir, "bag.json") : "");
  if (!path || !existsSync(path)) return null;
  const at = dirname(path);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    // The bag's version, the way a schema's version is part of its URI. A bag
    // written to a later shape is not read as this one: reading it anyway
    // would mean guessing which parts still mean what they used to.
    const version = trim(parsed?.bag);
    if (version && version !== BAG_VERSION) return { at, entries: [], unreadable: true };
    return { at, entries: Array.isArray(parsed?.entries) ? parsed.entries : [] };
  } catch {
    return { at, entries: [], unreadable: true };
  }
}

/** The entry for a shape, FOUND BY ITS SCHEMA AND NEVER BY ITS NAME.
 *
 *  This is the load bearing line of the whole arrangement. A name is for a
 *  person reading the record, and two callers writing the same profile will
 *  name it two different things: an agent that went looking for one called
 *  "brand profile" would find one caller's and miss the other's, and would
 *  find a note called "brand profile" that was nothing of the kind. Matching
 *  on the schema is what makes the URI the declaration rather than decoration
 *  beside a named input. */
export const entryFor = (bag, schema) => (bag?.entries ?? []).find((e) => trim(e?.schema) === trim(schema)) ?? null;

/** The entries that are words: a media type and no shape at all. Most of what
 *  actually matters to a job is this kind and always will be, so they travel
 *  in the same bag as the shaped ones and neither swallows the other. */
export const wordsIn = (bag) => (bag?.entries ?? []).filter((e) => !trim(e?.schema) && trim(e?.media_type));

/** What one entry holds. Every entry was written to a file whether it arrived
 *  as the thing itself or as an address, so one read does both.
 *
 *  An entry that could not be resolved is KEPT in the bag and carries its own
 *  sentence saying why, and that sentence is the answer: a bag that quietly
 *  lost an entry would have this agent explaining that a brand was not in the
 *  profile when in truth the profile never arrived. */
export function bagText(bag, entry) {
  if (!entry) return { text: null, why: "" };
  const why = trim(entry.why);
  if (entry.resolved === null) return { text: null, why: why || "it did not arrive" };
  const file = trim(entry.file);
  if (!file) return { text: null, why: why || "the bag names no file for it" };
  // The bag names files under the job folder. One that climbs out of it is
  // refused rather than read, because a list of file names is the one part of
  // a message a sender writes and this step opens.
  if (isAbsolute(file) || file.split(/[\\/]/).includes("..")) return { text: null, why: "the bag names it somewhere outside the job folder" };
  try { return { text: readFileSync(join(bag.at, file), "utf8"), why: "" }; }
  catch { return { text: null, why: why || "the bag names a file that is not there" }; }
}

/** The caller's own notes, as one part of a request, marked as theirs.
 *
 *  Clearly theirs and not this agent's, because the two are different kinds of
 *  thing: the standing rules are what this agent will and will not do, and a
 *  note is what this caller wants. A note folded in unmarked would read as a
 *  rule, and the first one that contradicted the rules would quietly win. */
export const CALLER_NOTES = (notes) => [
  "These next lines are the caller's own notes, sent with the job in their own words. They are the caller's and not this agent's rules: read them as what this person wants, and where a note asks for something the standing rules above refuse, the rules stand.",
  ...notes.map((n) => `${n.name}:\n${n.text}`),
].join("\n\n");

// ── the two calls ───────────────────────────────────────────────────────────

/** The reading as the model reads it: every part with the id a question must
 *  cite. A model that cannot see the ids invents one, and an invented id is
 *  the unknown-place fault. */
export function readingLines(reading) {
  const sources = new Map((reading?.sources ?? []).map((s) => [s.id, s]));
  return (reading?.parts ?? []).map((p) => {
    // The place and then the source it is in, and only once where a source of
    // one part names itself the same way its place does.
    const named = [...new Set([trim(p?.place?.label), trim(sources.get(p.source)?.name)].filter(Boolean))].join(", ");
    return `${p.id}${named ? ` (${named})` : ""}: ${trim(p.text)}`;
  }).join("\n\n");
}

// Why the check step refuses each fault, in the check step's own words and in
// its own order, so the request and the check can never drift apart. A model
// told what will be rejected produces fewer rejections.
const WHY_REFUSED = {
  "answer-not-a-choice": "the right answer is not one of the four choices, so the question cannot be marked.",
  "unknown-concept": "the question names a concept the list does not carry. Name the concept by the id it has in the list below and never by a new one.",
  "unknown-place": "from or back_to names a part the reading does not have. Both are part ids out of the reading below, and an id that is not there is an invented one.",
  "answer-is-longest-choice": "the right answer is longer than every wrong choice, which somebody who knows nothing can pick on sight. Keep the four the same length.",
  "answer-echoes-the-source": "the right answer repeats a run of four or more words from the cited part in the same order, and the wrong choices repeat much less, so it can be picked by recognising a phrase that was just read. Sharing the subject's vocabulary is fine and expected; repeating the phrasing is not.",
  "same-choice-twice": "two choices read the same once the punctuation and the articles a, an and the are taken out.",
  "all-of-the-above": "a choice reads all of the above or none of the above, which tests whether somebody read the other three.",
  "double-negative": "the question carries two negation words out of not, never, no, none, cannot, can't, don't, doesn't, isn't, aren't, won't, without, neither, nor, so it tests whether somebody can unpick it.",
  "wrong-form": "the shape is wrong: a choice question that does not carry exactly four choices lettered a, b, c and d in that order, or gives no because; a written question carrying choices or giving no answer_text; a question with no id, no asks, no concept, no from or no back_to; two questions or two concepts sharing an id; or a concept with no question and no left saying why it was left.",
};

/** The faults the check step refuses, built from the check step's own closed
 *  set so a fault added there shows up in the request without anybody
 *  remembering to add it. */
export const refusedTable = () => FAULTS.map((name) => `- ${name}: ${WHY_REFUSED[name] ?? "refused by the check step, which names it and says what it found."}`).join("\n");

export const CONCEPTS_INSTRUCTION = ({ audience = "" } = {}) => [
  "Name the concepts this material teaches, for the audience below. Answer with one JSON object holding these five fields and nothing else around it.",
  "title: what this quiz is about, in a few plain words. Not the source's own headline: a person opening this is about to be asked questions, so name the subject rather than announce it.",
  "audience: the one line saying what the person taking this quiz already knows. Leave it as the audience given below when there is one.",
  "concepts: the list, in the order the source teaches them. Leave it as an empty list when you are asking the question instead.",
  "mentioned: the words the source uses and never explains, each as a plain phrase. This is often the most useful thing the list carries, because it tells the person their material leans on a word it never lands, so do not leave one out to make the concepts look complete.",
  "question: the empty string when the audience is settled. When it is not, question holds that one question and nothing else, concepts is empty, and nothing is guessed.",
  "",
  "Each concept is one JSON object with these members:",
  "phrase: the concept in a few plain words, lowercase, the way somebody would say it.",
  "understood: the one sentence a person would have to be able to say to have understood it. Write this sentence first; if it cannot be written from the source, the source did not teach it and it is not a concept.",
  "taught_at: the id of the part of the reading where it is taught, exactly as the parts are lettered below. Name one part and never invent an id.",
  "left: leave this member out, except where the concept cannot be tested without asking somebody to recall a number or a name that does not matter. There it holds the one sentence saying why it was left, and the concept stays in the list.",
  "",
  audience
    ? `The audience is: ${audience}. Write the concepts for that reader and do not ask who the quiz is for.`
    : "The message named no audience. Take one from the source only where the source settles it plainly. Where it does not, ask that one question and name no concepts: the same material tested for somebody in their first week and for somebody who has worked with it for years is two different quizzes, and a quiz averaged across both is useless to either.",
].join("\n");

/** The instruction for the questions on ONE concept.
 *
 *  This used to ask for the whole quiz in one call: seventeen questions, four
 *  choices each, the reason the right answer is right and the concept it
 *  belongs to, all in one answer. Any single fault the check step found sent
 *  the whole thing back, so three bad questions threw away fourteen good ones,
 *  and the rewrite of the fourteen introduced faults of its own. A real run
 *  wrote the questions ten times, cleared six echoes down to three, traded
 *  three echoes for three long answers, and was refused at the end of it.
 *
 *  One concept at a time is the unit that matches how the work is checked:
 *  every fault the checker names is a fault in one question. So a bad question
 *  costs one call to fix and cannot disturb a question that was already right.
 *  Nothing set-level is lost by it, because the set-level decisions were all
 *  made before this step: the concept list settled what is asked about and in
 *  what order, the title and the audience travel with that list, and the rule
 *  for one question or two is a rule about this concept and not about the
 *  quiz. The id and the concept are not asked for and are written here after
 *  the answer comes back, which is two faults the model can no longer make. */
export const CONCEPT_QUESTIONS_INSTRUCTION = ({ audience = "", oneOnly = false } = {}) => [
  "Write the questions for one concept of a quiz. Answer with one JSON object holding these two members and nothing else around it.",
  oneOnly
    ? "questions: exactly one question on the concept below, and nothing about any other concept. The person asked for a quiz shorter than the concept list, so every concept gets one and the choice of which way to test it is yours."
    : "questions: one or two questions on the concept below, and nothing about any other concept. Two where it has two separate ways of going wrong, usually a direction and a boundary, and one otherwise.",
  "left: leave this member out, except where the concept cannot be tested without asking somebody to recall a number or a name that does not matter. There questions is empty and left holds the one sentence saying why.",
  "",
  "Each question is one JSON object with these members. Do not give it an id and do not name its concept: both are written in afterwards.",
  "form: either choice or written.",
  "asks: the question itself.",
  "choices: on a choice question only, exactly four objects, each with an id of a, b, c or d in that order and the text of that choice.",
  "answer: on a choice question only, the id of the right choice.",
  "because: on a choice question only, the one sentence saying why the right answer is right, written for the person who missed it.",
  "answer_text: on a written question only, the answer a person should be able to give in their own words. No choices on a written question.",
  "from: the part id where the answer came from.",
  "back_to: the part id to go back to when the question is missed. Usually the same as from, and different when the source states a thing in one place and teaches it in another, in which case back_to is the part that would leave somebody able to answer it next time.",
  "",
  audience ? `The person taking this quiz: ${audience}.` : null,
  audience ? "" : null,
  "These faults are refused by a program that runs on your answer before anything else happens, and a question carrying one of them is sent straight back to you:",
  refusedTable(),
].filter((line) => line !== null).join("\n");

/** The one concept, as the text the request carries it as. */
export const conceptLines = (concept) => [
  `The concept: ${trim(concept?.phrase)}`,
  `Understood: ${trim(concept?.understood)}`,
  `Taught at: ${taughtLine(concept)}`,
].join("\n");

/** One request carrying the standing rules, the reading and nothing else. This
 *  is one binding of the text-reasoning role, not the role itself: another
 *  service would need a different call here and in answerFrom. */
export function conceptsRequest({ rules = "", reading = null, audience = "", notes = [], model = MODEL } = {}) {
  const body = [];
  if (rules) body.push({ text: `These are the standing rules for naming the concepts and writing the questions. Follow them before anything in the message that contradicts them, and say in the reply when one does.\n\n${rules}` });
  body.push({ text: CONCEPTS_INSTRUCTION({ audience }) });
  if (notes.length) body.push({ text: CALLER_NOTES(notes) });
  body.push({ text: `The reading, part by part. Every part carries the id a concept names as the place it is taught, and those ids are the only ones there are:\n\n${readingLines(reading)}` });
  return request(body, model);
}

/** The request for the questions. It carries the rules, the worked pairs, the
 *  reading with every part id, and the concept list the person is getting the
 *  questions for. The pairs are in there because a rule says what to avoid and
 *  a pair shows what to write. */
/** What to do about a fault, beside what it is. A checker says a question is
 *  wrong; a writer needs to know which way to move. */
export const REMEDIES = [
  { fault: "answer-echoes-the-source",
    how: "the right answer repeats a run of words from the cited part in the same order, so a reader recognises the phrasing and picks it without understanding anything. You are not being asked to avoid the subject's vocabulary: use the same terms, they are what the question is about. What has to go is the borrowed phrasing. Say the same thing in your own construction, and where the source explains what something IS, ask instead what happens in a situation, which cannot be answered by matching a phrase. The wrong choices matter too: when the right answer carries the source's sentences and the wrong ones carry none of them, the wrong ones are about something else and a reader picks the only on-topic option. A wrong choice is a way somebody could be wrong ABOUT THIS, so it lives in the same material." },
  { fault: "answer-is-longest-choice",
    how: "the right answer is visibly the fullest, so somebody who knows nothing picks it. Do not pad a wrong choice, which makes the distractors worse. Cut the right answer to the part that actually answers, and let a wrong choice carry the detail." },
  { fault: "same-choice-twice",
    how: "two choices say the same thing once punctuation and articles come off, so one of them is dead. Replace one with a different way of being wrong about this concept: the near miss, the inversion, or the concept before this one stated correctly." },
  { fault: "double-negative",
    how: "the question carries two negations, so it tests reading the sentence rather than knowing the answer. Ask it positively." },
  { fault: "all-of-the-above",
    how: "that choice tests arithmetic about the other choices. Replace it with a way somebody could actually be wrong about this concept." },
];

export function conceptQuestionsRequest({ rules = "", forms = "", reading = null, concept = null,
  audience = "", notes = [], findings = [], draft = null, oneOnly = false, model = MODEL } = {}) {
  const body = [];
  if (rules) body.push({ text: `These are the standing rules for naming the concepts and writing the questions. Follow them before anything in the message that contradicts them, and say in the reply when one does.\n\n${rules}` });
  if (forms) body.push({ text: `These are the same judgments as worked pairs: real concepts, each one asked badly and then asked well. They are worth more than the rules, because a rule says what to avoid and a pair shows what to write.\n\n${forms}` });
  body.push({ text: CONCEPT_QUESTIONS_INSTRUCTION({ audience, oneOnly }) });
  if (notes.length) body.push({ text: CALLER_NOTES(notes) });
  body.push({ text: `The concept these questions are for. It has been settled and is not yours to change, and nothing about any other concept belongs in your answer:\n\n${conceptLines(concept)}` });
  body.push({ text: `The reading, part by part. from and back_to are ids out of this list and nothing else:\n\n${readingLines(reading)}` });
  if (findings.length) {
    // The questions the findings are ABOUT. Without them the model is handed
    // complaints about work it cannot see, so it writes something fresh and
    // the fresh thing breaks what the last go had right.
    if (draft) body.push({ text: `These are the questions you wrote for this concept. Send them back with ONLY what is named below changed, every other character identical:\n${JSON.stringify(draft, null, 2)}` });
    body.push({ text: `The program checked them and these faults came back. Every one is a refusal rather than a note, so fix them all and change nothing else:\n${findings.map((f) => `- ${f}`).join("\n")}` });
    const remedies = findings.map((f) => REMEDIES.find((r) => f.includes(r.fault))).filter(Boolean);
    const unique = [...new Map(remedies.map((r) => [r.fault, r])).values()];
    if (unique.length) body.push({ text: `How to fix each kind of fault above:\n${unique.map((r) => `- ${r.fault}: ${r.how}`).join("\n")}` });
  }
  return request(body, model);
}

/** There is no response schema on purpose. A choice question carries four
 *  choices and a written one carries none, so no single schema describes a
 *  question, and the check step is the gate instead: it runs before anything
 *  is built and it reports every fault at once. */
function request(parts, model) {
  return {
    url: `${ENDPOINT}/${model}:generateContent`,
    body: { contents: [{ role: "user", parts }], generationConfig: { temperature: 0, responseMimeType: "application/json" } },
  };
}

/** The JSON object in an answer that was asked for one. A model told to answer
 *  with an object often wraps it in a code fence or puts a sentence in front of
 *  it, and that is not the model failing to do the work: the whole quiz is
 *  there, and throwing it away costs the run everything it has already paid
 *  for. The fence comes off and, failing that, the outermost braces are taken.
 *  Anything else is still refused. */
export function jsonIn(text) {
  const t = String(text ?? "").trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  const tries = [t, fenced?.[1]];
  const open = t.indexOf("{"), close = t.lastIndexOf("}");
  if (open >= 0 && close > open) tries.push(t.slice(open, close + 1));
  for (const candidate of tries) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* the next shape */ }
  }
  return null;
}

/** The service's answer as the thing that was asked for and the one question
 *  it asked instead. `wants` is the list the answer has to carry: concepts for
 *  the first call and questions for the second. An answer that put the whole
 *  object one level down is taken from there rather than refused, for the same
 *  reason the code fence is stripped. */
export function answerFrom(body, wants = "concepts") {
  const text = (body?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join("");
  if (!text.trim()) throw new Error("the text-reasoning service answered with no text");
  const parsed = jsonIn(text);
  if (!parsed) throw new Error("the text-reasoning service answered with something that is not JSON");
  const question = trim(parsed.question);
  // An empty list is usually a missing answer, and once it is not: a concept
  // that cannot be tested comes back with no questions and the sentence saying
  // why. That is an answer, and treating it as nothing sent the concept round
  // the retry loop until its goes ran out.
  const carries = (o) => o && typeof o === "object" && !Array.isArray(o) && Array.isArray(o[wants])
    && Boolean(o[wants].length || trim(o.left));
  const answer = [parsed, parsed.quiz, parsed.concept_list, parsed.answer].find(carries) ?? null;
  if (!question && !answer) throw new Error(`the text-reasoning service answered with neither ${wants} nor a question`);
  return { answer: question ? null : answer, question };
}

/** What a refused call is, in one sentence for the person who ordered the
 *  quiz. They cannot fix any of these and should not be handed the service's
 *  own JSON to work it out from, so each one says what happened and who it
 *  belongs to. The full body is logged for whoever can act on it.
 *
 *  A refused key comes back as 400 from this service rather than 401, which
 *  is why the status alone does not decide it. */
export function serviceProblem(status, body = "") {
  const said = String(body ?? "").toLowerCase();
  const keyRefused = said.includes("api key") || said.includes("api_key") || said.includes("unauthenticated");
  if (status === 401 || status === 403 || (status === 400 && keyRefused)) {
    return "the text-reasoning service refused the key this agent was given, which is for whoever runs this agent to put right";
  }
  if (status === 429) return "the text-reasoning service is not taking more calls just now";
  if (status >= 500) return "the text-reasoning service is not answering";
  if (status === 400) return "the text-reasoning service refused the request this agent sent";
  return `the text-reasoning service answered ${status}`;
}

/** Ask for the concepts. One call, because this step is the cheap moment in
 *  the job and a second go at it would be a second opinion rather than a fix:
 *  what comes back goes to the person, and their answer is what the questions
 *  are written from. Every call counts against the ceiling and a call that
 *  would pass it is not made. */
export async function askForConcepts({ request: req, call, ceiling = null, sent = 0 }) {
  const per = `the ceiling of ${ceiling} calls per task`;
  if (ceiling !== null && sent + 1 > ceiling) {
    return { answer: null, question: "", calls: 0, stopped: `${per} was reached before a call could be made`, stoppedBy: "ceiling" };
  }
  try {
    const { answer, question } = answerFrom(await call(req), "concepts");
    return { answer, question, calls: 1, stopped: null, stoppedBy: null };
  } catch (err) {
    // Why a stop carries WHICH KIND it was: the two stops this function can
    // return want opposite advice. A ceiling is the owner's to raise. A
    // service that refused the call is not, and telling somebody to raise a
    // ceiling that was never reached sends them to a setting that is not the
    // problem.
    return { answer: null, question: "", calls: 1, stopped: trim(err?.message) || String(err), stoppedBy: "service" };
  }
}

/** How many calls one concept may have, the first go included, and how many
 *  concepts are in the air at once. Three goes because a fault names the
 *  question, what is wrong with it and what the check found, so a rewrite is
 *  arithmetic rather than invention; a concept that has not cleared in three
 *  is not going to clear in nine, which is what the old whole-quiz loop kept
 *  proving. Four lanes because the concepts are independent of each other and
 *  a quiz should not take seventeen calls of wall clock to write, and not more
 *  than four because the service rate-limits and a burst that gets refused
 *  costs a go. */
export const TRIES_PER_CONCEPT = 3;
export const LANES = 4;

/** Run `work` over `items` with at most `lanes` in the air, keeping the
 *  results in the order the items came in. */
export async function inLanes(items, work, lanes = LANES) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await work(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, items.length)) }, worker));
  return out;
}

/** Ask for the questions, one concept at a time, and check each answer on its
 *  own before anything else is asked.
 *
 *  The unit is the concept because the unit of a fault is the question. Every
 *  fault the check step names is a fault in one question, so sending back the
 *  whole quiz asked a model to rewrite fourteen questions nobody had
 *  complained about, and the rewrite is where the next go's faults came from.
 *  Here a bad question costs one call, a good one is never touched again, and
 *  the concepts that have already cleared are not at risk from the ones that
 *  have not.
 *
 *  The call budget is shared across the lanes and spent before the call is
 *  made, so a ceiling is never passed by two lanes both deciding they could
 *  afford the last one. When the budget runs out, the concepts that have been
 *  written are kept: the caller has a partial quiz and a reason, which is a
 *  better answer than nothing and is also what the record needs.
 *
 *  `make` and `again` build the requests, `call` sends one, and `check` takes
 *  the concept and the questions written for it and hands back the findings as
 *  lines. All four are passed in, so a test drives this whole loop with no
 *  network and the real checker. */
export async function askForQuestions({ concepts = [], make, again, call, check,
  ceiling = null, sent = 0, tries = TRIES_PER_CONCEPT, lanes = LANES } = {}) {
  let calls = 0;
  let stopped = null;
  const per = `the ceiling of ${ceiling} calls per task`;
  // Taken before the call, never after: two lanes must not both read the same
  // remaining budget and both spend it.
  const take = () => {
    if (ceiling !== null && sent + calls + 1 > ceiling) return false;
    calls += 1;
    return true;
  };

  const forOne = async (concept) => {
    let questions = null;
    let left = "";
    let findings = [];
    let goes = 0;
    for (let go = 0; go < tries; go += 1) {
      if (!take()) {
        stopped = stopped ?? `${per} left no room to write every concept`;
        break;
      }
      goes += 1;
      let answer = null;
      try {
        answer = answerFrom(await call(go === 0 ? make(concept) : again(concept, findings, questions)), "questions").answer;
      } catch (err) {
        findings = [`${trim(err?.message) || err}; answer with one JSON object holding questions, and nothing else around it`];
        continue;
      }
      questions = Array.isArray(answer?.questions) ? answer.questions : [];
      left = trim(answer?.left);
      findings = check(concept, questions, left);
      if (!findings.length) break;
    }
    return { concept, questions, left, findings, goes };
  };

  const written = await inLanes(concepts, forOne, lanes);
  return { written, calls, stopped, retried: written.some((w) => w.goes > 1) };
}

/** The quiz again without the questions the check refused, renumbered, and
 *  with a sentence on any concept that is left with none.
 *
 *  A fault is a property of one question. Refusing to deliver twelve good
 *  questions because the thirteenth can be guessed is the same whole-batch
 *  thinking that made the old retry loop rewrite fourteen questions nobody had
 *  complained about. A question that has had its three goes and still carries a
 *  fault is dropped instead, and nothing about that is quiet: the reply says
 *  it, the coverage record shows the concept with one question instead of two
 *  or with none at all, and the reason travels with it.
 *
 *  Only faults that name a question this quiz has are dropped on. A fault about
 *  the quiz rather than a question cannot be fixed by removing anything, so it
 *  stands and stops the job the way it always did. */
/** What this quiz went without and was delivered anyway.
 *
 *  Two absences, and both change what the quiz is worth. A concept nothing
 *  could be asked about is material this quiz does not test, so somebody who
 *  passes it has not been tested on that. A question refused three times and
 *  dropped is the same hole arriving by a different route.
 *
 *  Both are already in the reply, in better words. This puts them where an
 *  agent downstream can read them without parsing prose. */
export function absences({ dropped = [], coverage = null } = {}) {
  const out = [];
  const left = (coverage?.concepts ?? []).filter((c) => !c.questions.length);
  if (left.length) {
    out.push({
      wanted: `a question on ${left.length === 1 ? "one concept" : `${left.length} concepts`}`,
      why: left.map((c) => `${trim(c.phrase)}, because ${trim(c.left)}`).join("; "),
      did: "delivered the quiz without them, so passing it is no evidence on that material",
    });
  }
  if (dropped.length) {
    out.push({
      wanted: `${dropped.length === 1 ? "one question" : `${dropped.length} questions`} the check kept refusing`,
      why: [...new Set(dropped.map((d) => trim(d.fault)))].join("; "),
      did: "wrote each of them three times, dropped them rather than deliver a faulty question, and renumbered the rest",
    });
  }
  return out;
}

export function withoutRefused(quiz, faults, reading) {
  const refused = new Map();
  for (const f of faults ?? []) {
    const at = trim(f?.question);
    if (at && (quiz.questions ?? []).some((q) => trim(q.id) === at)) refused.set(at, f);
  }
  if (!refused.size) return { quiz, dropped: [] };
  const dropped = (quiz.questions ?? []).filter((q) => refused.has(trim(q.id)))
    .map((q) => ({ concept: trim(q.concept), fault: refused.get(trim(q.id)).fault, says: refused.get(trim(q.id)).says }));
  const kept = (quiz.questions ?? []).filter((q) => !refused.has(trim(q.id)))
    .map((q, i) => ({ ...q, id: `q${i + 1}` }));
  const tested = new Set(kept.map((q) => trim(q.concept)));
  const concepts = (quiz.concepts ?? []).map((c) => {
    if (tested.has(trim(c.id)) || trim(c.left)) return c;
    const why = dropped.filter((d) => d.concept === trim(c.id)).map((d) => d.fault);
    return why.length
      ? { ...c, left: `every question written for it was refused by the check, the last time for ${listOf([...new Set(why)])}` }
      : c;
  });
  return { quiz: { ...quiz, concepts, questions: kept, places: placesFor(kept, reading) }, dropped };
}

/** The questions of every concept, in concept order, each given its id and the
 *  concept it belongs to. Neither is asked of the model: an id it invents can
 *  collide with another concept's and a concept it names can be one that is
 *  not on the list, and both were faults the check step used to catch after
 *  the fact. Written here, neither can happen. */
export function assembleQuestions(written) {
  const questions = [];
  for (const one of written) {
    for (const q of (one.questions ?? [])) {
      questions.push({ ...q, id: `q${questions.length + 1}`, concept: one.concept.id });
    }
  }
  return questions;
}

const reference = (here, named, tries) => {
  for (const p of (trim(named) ? [trim(named)] : tries.map((t) => join(here, "..", ...t)))) {
    if (existsSync(p)) return readFileSync(p, "utf8").trim();
  }
  return "";
};
export const rulesText = (here, env = {}) => reference(here, env.RULES, [["references", "rules.md"], ["rules.md"]]);
export const formsText = (here, env = {}) => reference(here, env.FORMS, [["references", "question-forms.md"], ["question-forms.md"]]);

// ── the reply ───────────────────────────────────────────────────────────────

/** The reply the harness sends. It says what was made, what was left out of it
 *  and why, and where it is, and it never names an address it does not have:
 *  the run this script was written for replied that a draft had been staged
 *  when nothing had been uploaded at all. */
export function replyText({ url = "", quiz = null, coverage = null, conceptsFrom = "", mentioned = [], howMany = "", retried = false, nowhere = 0, listed = [], trouble = [], brand = null, notes = 0, bagSaid = [], dropped = [] } = {}) {
  const lines = [];
  const concepts = quiz?.concepts ?? [];
  const questions = quiz?.questions ?? [];
  const written = questions.filter((q) => q.form === "written").length;
  const title = trim(quiz?.title);
  lines.push(`${title ? `The quiz is ${title}: ` : "The quiz asks "}${many(questions.length, "question")} on ${many(concepts.length, "concept")}${written ? `, ${written} of them answered in the person's own words` : ""}.`);
  if (trim(quiz?.audience)) lines.push(`It is written for ${trim(quiz.audience)}.`);
  if (conceptsFrom === "the request") lines.push("The concept list came with the request, so it was used as it stands and no concepts were named again.");
  else if (conceptsFrom === "the words panel") lines.push("The source is a beat script and it carries its own words panel, so the explainer's own words were used as the concept list and none were named beside them.");
  const left = (coverage?.concepts ?? []).filter((c) => !c.questions.length);
  if (left.length) {
    lines.push(`${left.length === 1 ? "One concept carries no question" : `${many(left.length, "concept")} carry no question`}: ${left.map((c) => `${c.phrase}, because ${c.left}`).join("; ")}.`);
  }
  if (mentioned.length) lines.push(`The source mentions and never explains ${listOf(mentioned)}, and the list says so at the end, because that is a finding about the material rather than something to test.`);
  if (trim(howMany) && questions.length !== Number(howMany)) {
    lines.push(`You asked for ${many(Number(howMany), "question")} and the material teaches ${many(concepts.length, "concept")}, so there are ${questions.length}: the number follows the concept list, because padding to a target writes questions about wording.`);
  }
  if (retried) lines.push("Some of the questions were written more than once: the first go carried faults the check refuses, so they were named and that concept was written again on its own.");
  // Never quietly. A question that was written three times and still refused is
  // dropped rather than delivered, and a delivery that is short of a question
  // has to say which one and why, or the coverage record is the only place it
  // shows and nobody reads a record they were not told to look at.
  if (dropped.length) {
    lines.push(`${many(dropped.length, "question")} ${dropped.length === 1 ? "was" : "were"} written three times, still could not pass the check and ${dropped.length === 1 ? "is" : "are"} not in the quiz: ${listOf([...new Set(dropped.map((d) => d.fault))])}. The rest stand, and the coverage record shows which concepts are short because of it.`);
  }
  // A quiz where questions cannot send anybody back is one the person should
  // know about: half of what a missed question is worth is the way back to
  // where the concept is taught.
  if (nowhere) {
    lines.push(`${nowhere} of the ${many(questions.length, "question")} name no place to go back to, so those show their answer and say nothing about where the concept is taught.`);
  }
  // What the brand profile that came with the job did to the page, in the
  // three counts the record carries. The last of them is the one somebody
  // would be tempted to leave out, so it is the one that is spelled out.
  if (brand) {
    const { applied = [], not_present: absent = [], not_applied: kept = [] } = brand;
    lines.push(`The brand profile that came with the job set ${many(applied.length, "field")} of the page, ${absent.length} of the fields this agent reads were not in it, and ${many(kept.length, "field")} ${kept.length === 1 ? "was" : "were"} read and not applied.`);
    for (const k of kept) lines.push(`${k.field} was not applied, because ${k.why}.`);
    lines.push("What was used, what was missing, what was read and not applied, and what your profile states that this agent does not read, are all filed with the job as used.json.");
  }
  if (notes) lines.push(`${many(notes, "note")} came with the job and ${notes === 1 ? "was" : "were"} carried into the writing as your own words, kept apart from this agent's own rules.`);
  // What the bag could not give this job. Said, and never counted as the job
  // failing: a profile that did not arrive is the sender's to fix and the quiz
  // was made either way.
  for (const s of bagSaid) lines.push(sentence(s));
  for (const t of trouble) lines.push(sentence(t));
  if (listed.length) lines.push(`${many(listed.length, "piece")} are under the job folder: ${listOf(listed)}.`);
  if (url) lines.push(`Take it, or say what to change, at ${url}`);
  else lines.push("Nothing was placed where a person can open it, so there is no address to give you. Say the word and I will stage it again.");
  return lines.join(" ");
}

// ── the job ─────────────────────────────────────────────────────────────────

/** Make the quiz: read the source, name the concepts or take the list that
 *  arrived, write the questions, check them, stage the page and file the
 *  delivery. Every step runs here, in order. Returns what the CLI prints.
 *  `call`, `run` and `io` are handed in so a test runs the whole of this
 *  without a network, a draft host or a disk it did not make itself. */
export async function makeQuiz({ env, here, call, run = runScript, io = disk }) {
  const { WORK, RECORDS } = env;
  const JOB_DIR = env.JOB_DIR || env.MESH_JOB_DIR;
  mkdirSync(WORK, { recursive: true });
  mkdirSync(RECORDS, { recursive: true });

  const ceiling = trim(env.CEILING_TEXT_REASONING) ? Number(env.CEILING_TEXT_REASONING) : null;
  if (ceiling !== null && !(ceiling > 0)) throw new Error(`CEILING_TEXT_REASONING is not a number: ${env.CEILING_TEXT_REASONING}`);
  const model = modelOf(env);
  const spend = {
    unit: "calls", calls: 0, ceiling, model,
    per: ceiling === null ? null : (trim(env.CEILING_TEXT_REASONING_PER) || "task"),
    step: null, question: false, faults: [], stopped: null, at: null,
  };
  const spendPath = join(RECORDS, "calls.json");
  const saveSpend = () => { spend.at = new Date().toISOString(); json(spendPath, spend); };
  const stop = (reply, extra = {}) => ({ ok: false, code: 3, reply, url: null, pieces: null, listed: [], calls: spend.calls, ceiling, ...extra });

  // The two numbers the person may set, checked before anything is spent. A
  // typo in either is theirs to fix, so it is a stop with a plain sentence
  // rather than an exit code and silence.
  const howMany = trim(env.HOW_MANY);
  if (howMany && !(Number.isInteger(Number(howMany)) && Number(howMany) > 0)) {
    return stop(`You asked for "${howMany}" questions and I could not read that as a whole number, so nothing was written. Say how many as a number, or leave it out and the number will follow the concept list.`);
  }
  if (trim(env.NAME) && !SLUG.test(trim(env.NAME))) {
    return stop(`The name "${trim(env.NAME)}" cannot be the quiz's address: an address is lowercase letters, numbers and hyphens, starting with a letter or a number. Send one in that shape, or leave it out and the quiz will be named after its title.`);
  }

  // ── the context bag ──────────────────────────────────────────────────────
  //
  // Read before anything is asked of a model, because the caller's own notes
  // travel with both requests, and before the page is built, because the brand
  // profile is what colors it. A job with no bag reads nothing here and goes
  // on exactly as it did before there was one.
  const bag = readBag(JOB_DIR, env);
  const bagSaid = [];
  if (bag?.unreadable) bagSaid.push("a context bag came with the job and could not be read, so nothing in it was used");
  let profile = null;
  const brandEntry = entryFor(bag, BRAND_SCHEMA);
  if (brandEntry) {
    const { text, why } = bagText(bag, brandEntry);
    if (text === null) bagSaid.push(`a brand profile came with the job and did not arrive, so the page is in this agent's own colors: ${why}`);
    else {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) profile = parsed;
        else bagSaid.push("a brand profile came with the job and is not a profile, so the page is in this agent's own colors");
      } catch {
        bagSaid.push("a brand profile came with the job and could not be read as JSON, so the page is in this agent's own colors");
      }
    }
  }
  const notes = [];
  const unread = [];
  for (const entry of wordsIn(bag)) {
    const named = trim(entry.name) || "a note";
    const { text } = bagText(bag, entry);
    // Words, and only words. Something else with a media type on it is not a
    // note this step can read into a request, and saying so is better than a
    // page of bytes reaching a model as though somebody had written them.
    if (text === null || !/^text\//i.test(trim(entry.media_type))) { unread.push(named); continue; }
    if (trim(text)) notes.push({ name: named, text: text.trim() });
  }
  if (unread.length) bagSaid.push(`${many(unread.length, "thing")} in the bag could not be read as words and ${unread.length === 1 ? "was" : "were"} left out: ${listOf(unread)}`);

  // ── read the source ──────────────────────────────────────────────────────
  //
  // Everything the message brought, read into one reading with a place on
  // every part. The place is what every question cites, so a job with nothing
  // to read stops here rather than writing a quiz from the message text.
  let given;
  try { given = sourcesFromEnv(env) } catch (e) { return stop(sentence(trim(e?.message) || "the sources could not be read")); }
  if (!given.length) return stop(NO_SOURCE);
  // What arrived, as it arrived, before anything is made of it.
  jsonAt(join(RECORDS, "source", "given.json"), given.map(asReceived));
  let reading;
  try { reading = await readSources(given, io); }
  catch (e) {
    return stop(`${sentence(trim(e?.message) || "the source could not be read")} Nothing was made from it, so send it again in a form I can open and I will make the quiz.`);
  }
  json(join(RECORDS, "reading.json"), reading);

  // ── name the concepts ────────────────────────────────────────────────────
  //
  // The first of the two judgments, and the one that is skipped twice over. A
  // list that arrives approved is used as it stands: a person who approved a
  // list must get that list back rather than a fresh attempt at it. And a beat
  // script carries its own words panel, which shapes.md says IS the concept
  // list, so a second list named beside it would be a second quiz.
  const audienceGiven = trim(env.AUDIENCE);
  const listGiven = textFrom(env.CONCEPTS);
  let list = null;
  let conceptsFrom = null;
  if (listGiven) {
    try { list = conceptsFromMarkdown(listGiven); } catch (e) { return stop(`${sentence(e.message)} Send the list again in that shape and the questions will be written from it.`); }
    conceptsFrom = "the request";
  } else if (Array.isArray(reading.words) && reading.words.length) {
    const concepts = conceptsFromWords(reading.words, reading);
    if (concepts.length) { list = { concept_list: CONCEPTS_VERSION, title: "", audience: audienceGiven, concepts, mentioned: [] }; conceptsFrom = "the words panel"; }
  }

  if (!list) {
    spend.step = "name-the-concepts";
    const asked = await askForConcepts({
      request: conceptsRequest({ rules: rulesText(here, env), reading, audience: audienceGiven, notes, model }),
      call, ceiling, sent: spend.calls,
    });
    spend.calls += asked.calls;
    if (asked.stopped) {
      spend.stopped = asked.stopped;
      saveSpend();
      const advice = asked.stoppedBy === "ceiling"
        ? "Raise the ceiling or start a new task."
        : "Nothing was read and nothing was written, so asking again costs nothing.";
      return stop(`The concepts were not named, and this is the step that stopped: name-the-concepts. ${sentence(asked.stopped)} ${advice}`);
    }
    if (asked.question) {
      spend.question = true;
      saveSpend();
      write(join(RECORDS, "question.txt"), asked.question);
      return stop(asked.question, { question: asked.question });
    }
    list = {
      concept_list: CONCEPTS_VERSION,
      title: trim(asked.answer.title),
      audience: audienceGiven || trim(asked.answer.audience),
      concepts: (asked.answer.concepts ?? []).map(oneConcept(reading)),
      mentioned: (asked.answer.mentioned ?? []).map(trim).filter(Boolean),
    };
    conceptsFrom = "this run";
  }
  if (audienceGiven) list.audience = audienceGiven;
  list.concepts = list.concepts.filter((c) => trim(c.phrase) && trim(c.taught_at));
  if (!list.concepts.length) {
    saveSpend();
    const named = list.mentioned?.length ? ` It uses ${listOf(list.mentioned)} and explains none of them.` : "";
    return stop(`There is nothing in this material a quiz could test, so none was written.${named} Send something that teaches what you want somebody to have understood and I will make the quiz.`);
  }
  // The audience decides every question, and a quiz averaged across two
  // audiences is useless to both, so a job that has not settled one asks
  // instead of guessing. It is one question and it costs nothing.
  if (!trim(list.audience)) {
    saveSpend();
    const question = "Who is this quiz for, and what do they already know? The same material tested for somebody in their first week and for somebody who has worked with it for years is two different quizzes, so I have written none until you say. A line like \"somebody who has deployed an agent and has never priced one\" is enough.";
    write(join(RECORDS, "question.txt"), question);
    return stop(question, { question });
  }
  json(join(RECORDS, "concepts.json"), list);
  const conceptsPath = join(RECORDS, "concepts.md");
  write(conceptsPath, conceptsToMarkdown(list));

  // ── write the questions ──────────────────────────────────────────────────
  spend.step = "write-the-questions";
  const madeFrom = (reading.sources ?? []).map((s) => ({ id: s.id, name: s.name, ...(s.address ? { address: s.address } : {}) }));
  const oneOnly = Boolean(howMany) && Number(howMany) > 0 && Number(howMany) <= list.concepts.length;
  const common = { rules: rulesText(here, env), forms: formsText(here, env), reading,
    audience: list.audience, notes, oneOnly, model };

  // One concept's questions checked on their own, by the same checker that
  // gates the delivery. The partial quiz carries only this concept, so a
  // concept still being written elsewhere cannot show up here as a concept
  // with no question, and the ids are local and temporary: the real ones are
  // written once at assembly.
  const checkOne = (concept, questions, left) => {
    const numbered = (questions ?? []).map((q, i) => ({ ...q, id: `q${i + 1}`, concept: concept.id }));
    const only = { id: concept.id, phrase: concept.phrase, understood: concept.understood,
      taught_at: concept.taught_at, ...(numbered.length ? {} : { left: trim(left) || trim(concept.left) }) };
    const partial = { quiz: "v1", title: trim(list.title), audience: list.audience, made_from: madeFrom,
      concepts: [only], questions: numbered, places: placesFor(numbered, reading) };
    return faultLines(checkQuiz(partial, reading).faults);
  };

  // A concept the person already left is not sent to be written. The approved
  // list is the authority, and asking a model for questions on a concept the
  // person has said should not be tested spends a call to be told what the
  // list already says.
  const toWrite = list.concepts.filter((c) => !trim(c.left));
  let asked;
  try {
    asked = await askForQuestions({
      concepts: toWrite,
      make: (concept) => conceptQuestionsRequest({ ...common, concept }),
      again: (concept, findings, draft) => conceptQuestionsRequest({ ...common, concept, findings, draft }),
      call, check: checkOne, ceiling, sent: spend.calls,
    });
  } catch (e) {
    spend.stopped = trim(e?.message);
    saveSpend();
    return stop(`The questions were not written, and this is the step that stopped: write-the-questions. ${sentence(e.message)} The concept list is in the records, so asking again does not start from nothing.`);
  }
  spend.calls += asked.calls;
  if (asked.stopped) spend.stopped = asked.stopped;

  // The quiz as it will be delivered. The concept list is the person's and the
  // sources are the reading's, so neither can drift in the writing, and the
  // title comes with the list because that list is already the statement of
  // what the quiz is about.
  const questions = assembleQuestions(asked.written);
  const quiz = {
    quiz: "v1",
    title: trim(list.title) || `What ${listOf(madeFrom.map((s) => s.name))} teaches`,
    audience: list.audience,
    made_from: madeFrom,
    concepts: mergeConcepts(list.concepts, asked.written.map((w) => ({ id: w.concept.id, left: w.left }))),
    questions,
    // Written from the reading, never asked of the model. See placesFor.
    places: placesFor(questions, reading),
  };
  if (!questions.length) {
    spend.stopped = asked.stopped ?? "no concept came back with a question";
    saveSpend();
    return stop(`The questions were not written, and this is the step that stopped: write-the-questions. ${sentence(spend.stopped)} The concept list is in the records, so asking again does not start from nothing.`);
  }
  json(join(RECORDS, "quiz.json"), quiz);

  // ── check the questions ──────────────────────────────────────────────────
  //
  // The coverage record is written whether or not anything is wrong, because
  // it is the record of the check: every concept, and for each the questions
  // that test it or the reason it was left.
  // Written once with everything in it, then again without the questions the
  // check refused. The second check is the one that gates the delivery, and it
  // runs on exactly what would be staged.
  const first = checkQuiz(quiz, reading).faults;
  const { quiz: delivered, dropped } = withoutRefused(quiz, first, reading);
  if (dropped.length) json(join(RECORDS, "quiz.json"), delivered);
  const { faults, coverage } = checkQuiz(delivered, reading);
  json(join(RECORDS, "coverage.json"), coverage);
  // What the quiz went without, on the record as well as in the reply. The
  // reply already says this and says it better; the record is what lets an
  // agent downstream, or anyone reading the job later, learn the same thing
  // without a person parsing prose.
  for (const a of absences({ dropped, coverage })) note(RECORDS, a);
  if (!delivered.questions.length) {
    spend.faults = first;
    spend.stopped = "every question written was refused by the check step";
    saveSpend();
    return stop(`Every question written for this material was refused by the check, so there is nothing to stage and no address: ${faultLines(first).join("; ")}. The quiz and the coverage record are in the records, and the concept list is settled, so this starts from the questions and not from the beginning.`, { faults: first });
  }
  if (faults.length) {
    spend.faults = faults;
    spend.stopped = "the quiz still carries faults the check step refuses";
    saveSpend();
    const over = asked.written.filter((w) => w.goes > 1).length;
    const goes = over
      ? `${many(over, "concept")} had its questions written more than once, ${many(asked.calls, "call")} in all, and`
      : `The questions were written in ${many(asked.calls, "call")} and`;
    return stop(`${goes} they still carry ${many(faults.length, "fault")} the check refuses, so nothing was staged and there is no address: ${faultLines(faults).join("; ")}. The quiz and the coverage record are in the records, and the concept list is settled, so this starts from the questions and not from the beginning.`, { faults });
  }
  saveSpend();

  // ── stage the quiz ───────────────────────────────────────────────────────
  let name;
  try { name = quizName({ env, quiz: delivered }); } catch (e) { return stop(`${sentence(e.message)} Send a name and I will stage it.`); }
  const pagePath = join(WORK, `${name}.html`);
  const quizPath = join(WORK, `${name}.json`);
  json(quizPath, delivered);
  // The profile read once, here, and the page built from what that reading
  // gave. One reading, so what the record calls applied is what the page took:
  // a record built from a second reading of the same profile could name a
  // field the page never used, and nobody looking at either would know.
  const brand = profile ? brandFrom(profile, { quizAccent: delivered.accent }) : null;
  try {
    // The reading goes in because it is where the places live: without it a
    // missed question shows its answer and says nothing about where the
    // concept is taught, which is half of what this quiz is for.
    // Whether the page carries this agent's own footer is the host's
    // decision and not the quiz's, so it comes from the variable and never
    // from anything a caller sent. Off unless the host says otherwise.
    writeFileSync(pagePath, buildQuizPage(delivered, name, reading, brand, { credit: creditOn(env) }));
  } catch (e) {
    return stop(`The page was not built, and this is the step that stopped: stage-the-quiz. ${sentence(e.message)} The quiz itself is written and is in the records, so the questions are not lost.`);
  }
  // The answer for the profile, filed with the job as a record rather than
  // delivered as a piece: it is evidence about how the work was done and not
  // one of the four things this offering hands over. It goes in as soon as the
  // page is built, so a delivery that fails later still says what the profile
  // changed.
  if (brand && JOB_DIR) {
    try { json(join(JOB_DIR, "used.json"), usedRecord(brand)); }
    catch { bagSaid.push("what the brand profile changed could not be filed with the job, though the page was built from it"); }
  }
  const stagedPath = join(RECORDS, "staged.json");
  const stager = run({ here, script: "stage-quiz.mjs", env: { PAGE: pagePath, QUIZ: quizPath, NAME: name, STAGED: stagedPath } });
  const staged = (() => { try { return JSON.parse(readFileSync(stagedPath, "utf8")); } catch { return null; } })();
  // The address is the last thing the stager printed, and the staging record
  // is where the digests pieces.mjs checks against live.
  const printed = lastLine(stager.stdout);
  const url = /^https?:\/\//i.test(printed) ? printed : trim(staged?.url);
  if (stager.code !== 0 || !url || !staged) {
    const why = firstLine(stager.stderr || stager.stdout, "the draft host did not take it");
    return stop(`The quiz is written and checked, and the page was not placed where you can open it, so there is no address: ${why}. The questions are kept as a file and nothing about them has to be written again; say the word and I will stage it.`);
  }

  // ── file the delivery ────────────────────────────────────────────────────
  //
  // Always, and last. This is the step the run before this script was written
  // improvised: it replied that a draft was staged while out/ was empty and no
  // pieces.json existed, so the job carried nothing at all. All four pieces go
  // or none of them do, and pieces.mjs refuses a short delivery by name.
  const trouble = [];
  let listed = [];
  if (!JOB_DIR) trouble.push("there is no job folder, so the pieces could not be filed and the reply carries no job");
  else {
    try {
      listed = fill(JOB_DIR, piecesPlan({ staged, conceptsPath, paths: { page: pagePath, quiz: quizPath } })).map((e) => e.name);
    } catch (e) {
      trouble.push(`the pieces could not be filed: ${firstLine(e.message)}`);
    }
  }

  // How many questions the page could give no way back from. Counted the way
  // the page counts it, off the built page's own rule, so the reply and the
  // page can never say different things.
  const nowhere = (quiz.questions ?? []).filter((q) => !backTo(quiz, q, reading)).length;
  const ok = Boolean(url) && !trouble.length && listed.length > 0;
  return {
    ok, code: ok ? 0 : 3, name, url,
    reply: replyText({ url, quiz: delivered, coverage, conceptsFrom, dropped, mentioned: list.mentioned ?? [], howMany, retried: asked.retried, nowhere, listed, trouble, brand, notes: notes.length, bagSaid }),
    pieces: JOB_DIR && listed.length ? join(JOB_DIR, "pieces.json") : null,
    used: brand && JOB_DIR ? usedRecord(brand) : null,
    listed, calls: spend.calls, ceiling,
  };
}

/** A concept as the model gave it, with the reader's label for its part filled
 *  in from the reading so the delivered list reads as a person's list and not
 *  as a row of ids. */
const oneConcept = (reading) => {
  const labels = new Map((reading?.parts ?? []).map((p) => [p.id, trim(p?.place?.label)]));
  return (c, i) => {
    const id = trim(c?.taught_at);
    const label = labels.get(id);
    return {
      id: `c${i + 1}`, phrase: trim(c?.phrase), understood: trim(c?.understood), taught_at: id,
      ...(label ? { taught_label: label } : {}),
      ...(trim(c?.left) ? { left: trim(c.left) } : {}),
    };
  };
};

/** A source as it arrived, for the record of what was sent. The text a person
 *  typed is kept whole, and a local path is kept as the bare file name: a path
 *  off this host means nothing to anybody reading the record later. */
const asReceived = (s) => ({
  kind: trim(s?.kind),
  ...(trim(s?.name) ? { name: trim(s.name) } : {}),
  ...(trim(s?.path) ? { file: trim(s.path).split(/[\\/]/).pop() } : {}),
  ...(trim(s?.address) ? { address: trim(s.address) } : {}),
  ...(trim(s?.text) ? { text: s.text } : {}),
});

/** The arguments a DECLARED command is handed, as the environment this script
 *  already reads. A package may name the command the host runs for a job, and
 *  the host then runs it with no model woken at all. That is the whole point:
 *  a model asked to run one command has answered "I will now run the script"
 *  instead, with nothing done. A command the host runs cannot decline to run
 *  it.
 *
 *  A declared command receives arguments and never an environment, so the two
 *  shapes are bridged here rather than inside the work.
 *
 *  Which attachment is which is decided by its name and its extension and
 *  stated plainly, because hunting for input files by trial and error is the
 *  fault this package was built to stop. A .vtt is the transcript. A .json is
 *  the beat script when its name says so or when it reads as one, because a
 *  beat script carries the words panel that becomes the concept list and
 *  filing it as a document would throw that panel away. A .md, .txt or .html
 *  is a document, and several of them are read together. A .md or .txt whose
 *  name says concepts is the concept list the person approved, because that is
 *  the piece this agent delivered and the one they edit and send back. The
 *  message text is the notes only when no attachment carried the material,
 *  since "make this one for new hires" is an instruction and not a source. */
export function fromArgv(argv = []) {
  const out = {};
  const files = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => argv[i + 1] ?? "";
    if (a === "--job") { out.JOB_DIR = val(); i += 1; }
    else if (a === "--records") { out.RECORDS = val(); i += 1; }
    else if (a === "--work") { out.WORK = val(); i += 1; }
    else if (a === "--text-file") { out.MESSAGE_FILE = val(); i += 1; }
    else if (a === "--file") { files.push(String(val()).split("::")[0]); i += 1; }
  }
  const base = (f) => String(f).toLowerCase().split(/[\\/]/).pop() ?? "";
  const ext = (f) => (base(f).match(/\.[a-z0-9]+$/) ?? [""])[0];
  const taken = new Set();
  const take = (f) => { taken.add(f); return f; };
  const rest = () => files.filter((f) => !taken.has(f));

  const concepts = rest().find((f) => [".md", ".txt"].includes(ext(f)) && /concept/.test(base(f)));
  if (concepts) out.CONCEPTS = take(concepts);

  const transcripts = rest().filter((f) => ext(f) === ".vtt");
  if (transcripts.length) out.TRANSCRIPT = transcripts.map(take).join(",");

  const scripts = rest().filter((f) => ext(f) === ".json" && (/script|beat|words/.test(base(f)) || readsAsBeatScript(f)));
  if (scripts.length) out.BEAT_SCRIPT = scripts.map(take).join(",");

  // A .json that is neither is left with the documents rather than dropped:
  // read-source refuses it by name, and a silently ignored attachment is the
  // one thing a person cannot debug from the reply.
  const documents = rest().filter((f) => [".md", ".txt", ".html", ".json"].includes(ext(f)));
  if (documents.length) out.DOCUMENT = documents.map(take).join(",");

  if (out.MESSAGE_FILE && !taken.size) out.NOTES = out.MESSAGE_FILE;
  return out;
}

/** Whether a file reads as a beat script: a JSON object with steps in it. The
 *  name is the first test and this is the second, because an attachment called
 *  meridian.json is a beat script just as often as one called script.json. */
function readsAsBeatScript(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.steps));
  } catch { return false; }
}

// json() with a folder to make first, for the one record that lives in a
// folder of its own.
function jsonAt(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  // Arguments first where they were given, then the environment. A declared
  // command carries the job in its arguments; a person running this by hand
  // carries it in the environment; both must work.
  const fromArgs = fromArgv(process.argv.slice(2));
  const ENV = { ...process.env, ...fromArgs };
  const { WORK, RECORDS, TEXT_API_KEY, CONCEPTS } = ENV;
  const JOB_DIR = ENV.JOB_DIR || ENV.MESH_JOB_DIR;
  if (!WORK || !RECORDS || !JOB_DIR) { console.error("WORK, RECORDS and JOB_DIR are required"); process.exit(2); }
  if (!existsSync(JOB_DIR) || !statSync(JOB_DIR).isDirectory()) { console.error(`the job folder does not exist: ${JOB_DIR}`); process.exit(2); }
  // The key is needed at both judgments, and the questions are always one of
  // them, so a missing key stops the job before it reads anything. A concept
  // list that arrived approved does not change that: the questions still have
  // to be written.
  if (!TEXT_API_KEY) {
    console.error(`TEXT_API_KEY is not set: the key for the text-reasoning service, which the host places${CONCEPTS ? "; the concept list came approved, and the questions are still written by the service" : ""}`);
    process.exit(2);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const out = await makeQuiz({
      env: { ...ENV, JOB_DIR }, here,
      call: async (req) => {
        const res = await fetch(req.url, {
          method: "POST",
          headers: { "x-goog-api-key": TEXT_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
        });
        if (!res.ok) {
          // The body goes to the log and never into the reply. What a service
          // says when it refuses is written for whoever holds the account: it
          // is JSON, it names the provider, and on a bad key it is a page of
          // it. The person who ordered a quiz reads the reply, so the reply
          // gets one sentence about what happened and who can fix it.
          const body = await res.text().catch(() => "");
          console.error(`text-reasoning service ${res.status}: ${body.slice(0, 1000)}`);
          throw new Error(serviceProblem(res.status, body));
        }
        return res.json();
      },
    });
    const { code, ...rest } = out;
    console.log(JSON.stringify(rest, null, 2));
    // The code is SET and the process is left to end on its own, rather than
    // process.exit() here. Calling exit immediately after the last fetch tears
    // the process down while the connection to the text-reasoning service is
    // still closing, and node aborts on the way out: a libuv assertion, exit
    // 127, and the JSON we just printed followed by a crash. The reply was
    // right and the exit code said something else entirely, which is the
    // worst shape a failure can take because the host believes the code.
    process.exitCode = code;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
