// The quiz is made by a script, not by a harness deciding what to do next.
//
// What is worth pinning: the concept list is a round trip, so the text a
// person is handed comes back as the list the questions are written from, a
// left concept and its reason included, and a concept nobody can place is
// refused in a sentence they can act on; a beat script's own words panel
// becomes the concept list without a call; the questions are asked again with
// the faults named and only the last go's failure stops the job; a call that
// would pass the ceiling is never made; an answer wrapped in a code fence is
// still the answer; the places a quiz carries are the ones its questions cite
// and no others; attachments are matched to inputs by name and extension; and
// a whole job files four pieces and replies with the address.
// Nothing here touches the network or a draft host: the model call and the
// staging step are functions the test hands in.
// Run: node --test test/make-quiz.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesFromEnv } from "../scripts/read-source.mjs";
import { checkQuiz } from "../scripts/check-quiz.mjs";
import { ACCENT_DEFAULT, BRAND_SCHEMA } from "../scripts/build-quiz-page.mjs";
import {
  MODEL, NO_SOURCE, SLUG, STEPS, absences, answerFrom, askForConcepts, askForQuestions, assembleQuestions,
  bagText, conceptQuestionsRequest, conceptsFromMarkdown, conceptsFromWords, conceptsRequest,
  conceptsToMarkdown, entryFor, fromArgv, inLanes, jsonIn, makeQuiz, mergeConcepts, modelOf,
  placesFor, quizName, readBag, replyText, serviceProblem, slugOf, wordsIn,
} from "../scripts/make-quiz.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "scripts");
const sample = (name) => JSON.parse(readFileSync(join(here, "..", "sample", name), "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const clone = (o) => JSON.parse(JSON.stringify(o));
const textOf = (request) => request.body.contents[0].parts.map((p) => p.text).join("\n");

// A folder that goes away afterwards, whatever the test did in it. The work is
// awaited before the folder goes, or a test would be tidying up under itself.
async function folders(fn) {
  const dir = mkdtempSync(join(tmpdir(), "quiz-maker-"));
  try {
    const at = { dir, work: join(dir, "work"), records: join(dir, "records"), job: join(dir, "job") };
    for (const d of [at.work, at.records, at.job]) mkdirSync(d, { recursive: true });
    return await fn(at);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ── the concept list, which is a round trip ─────────────────────────────────

const LIST = {
  audience: "somebody who will build against the hold",
  concepts: [
    { id: "c1", phrase: "a hold is not a charge", understood: "Money is set aside when the job starts and stays the buyer's.", taught_at: "p1", taught_label: "What a hold is" },
    { id: "c2", phrase: "the micro-unit", understood: "Amounts are whole micro-dollars, so nothing rounds.", taught_at: "p4", taught_label: "The amount", left: "testing it would be asking somebody to recall a number" },
  ],
  mentioned: ["the draw", "the sweep"],
};

test("the concept list is written in one form and read back in that same form", () => {
  const text = conceptsToMarkdown(LIST.concepts, LIST.audience);
  assert.equal(text, [
    "Audience: somebody who will build against the hold",
    "",
    "## a hold is not a charge",
    "Understood: Money is set aside when the job starts and stays the buyer's.",
    "Taught at: What a hold is (p1)",
    "",
    "## the micro-unit",
    "Understood: Amounts are whole micro-dollars, so nothing rounds.",
    "Taught at: The amount (p4)",
    "Left: testing it would be asking somebody to recall a number",
    "",
  ].join("\n"));
});

test("a list handed back comes out as the list that was handed over, the left concept and its reason included", () => {
  const text = conceptsToMarkdown(LIST, "");
  const back = conceptsFromMarkdown(text);
  assert.equal(back.audience, LIST.audience);
  assert.deepEqual(back.mentioned, ["the draw", "the sweep"]);
  assert.deepEqual(back.concepts, LIST.concepts);
  // And again, because a format that survives one trip and not two is not a
  // round trip: a person may edit the list we sent them twice.
  assert.equal(conceptsToMarkdown(back), text);
});

test("a person's edits survive the trip back: a concept dropped, a sentence rewrapped, the ids renumbered", () => {
  const edited = [
    "Audience: somebody who has deployed an agent and has never priced one",
    "",
    "## the micro-unit",
    "Understood: Amounts are whole micro-dollars,",
    "so nothing ever rounds away.",
    "Taught at: The amount (p4)",
    "",
    "Mentioned and not taught: the draw",
  ].join("\n");
  const back = conceptsFromMarkdown(edited);
  assert.equal(back.concepts.length, 1);
  assert.equal(back.concepts[0].id, "c1", "the one concept left is the first one");
  assert.equal(back.concepts[0].understood, "Amounts are whole micro-dollars, so nothing ever rounds away.");
  assert.equal(back.concepts[0].taught_at, "p4");
  assert.equal(back.audience, "somebody who has deployed an agent and has never priced one");
});

test("a concept nobody can place is refused, and the sentence says how to place it", () => {
  const text = [
    "## a hold is not a charge",
    "Understood: Money is set aside when the job starts.",
    "Taught at: somewhere near the beginning",
  ].join("\n");
  assert.throws(() => conceptsFromMarkdown(text), (e) => {
    assert.match(e.message, /a hold is not a charge/);
    assert.match(e.message, /Taught at: the part's heading \(p3\)/);
    return true;
  });
  // A bare part id is a concept somebody added by hand, and it places fine.
  const byHand = conceptsFromMarkdown(`${text.split("\n").slice(0, 2).join("\n")}\nTaught at: p3`);
  assert.deepEqual(byHand.concepts[0].taught_at, "p3");
  assert.equal("taught_label" in byHand.concepts[0], false);
});

test("a list with no concepts in it is refused rather than read as an empty quiz", () => {
  assert.throws(() => conceptsFromMarkdown("Audience: everybody\n\nnothing here"), /carries no concepts/);
  assert.throws(() => conceptsFromMarkdown(""), /carries no concepts/);
});

test("a concept with no understood sentence is refused, because that sentence is what a question is written from", () => {
  assert.throws(() => conceptsFromMarkdown("## a hold is not a charge\nTaught at: p1"), /gives no Understood/);
});

// ── the words panel of a beat script is the concept list ────────────────────

const BEAT_READING = {
  reading: "v1",
  sources: [{ id: "src1", kind: "beat-script", name: "meridian.json", address: "https://agentmesh.ai/draft/meridian.html" }],
  words: [
    { id: "hold", stage: 1, name: "A hold", why: "money set aside when the job starts, and not yet taken" },
    { id: "draw", stage: 2, name: "The draw", why: "the moment the held money becomes the seller's" },
  ],
  parts: [
    { id: "p1", source: "src1", place: { kind: "step", value: 1, label: "step 1", fragment: "s1" }, text: "What a price is for." },
    { id: "p2", source: "src1", place: { kind: "step", value: 2, label: "step 2", fragment: "s2" }, text: "A hold is money set aside when the job starts." },
    { id: "p3", source: "src1", place: { kind: "step", value: 3, label: "step 3", fragment: "s3" }, text: "The draw happens when the work is delivered." },
  ],
};

test("a beat script's own words panel becomes the concept list, placed where each word is said", () => {
  const concepts = conceptsFromWords(BEAT_READING.words, BEAT_READING);
  assert.deepEqual(concepts, [
    { id: "c1", phrase: "A hold", understood: "Money set aside when the job starts, and not yet taken.", taught_at: "p2", taught_label: "step 2" },
    { id: "c2", phrase: "The draw", understood: "The moment the held money becomes the seller's.", taught_at: "p3", taught_label: "step 3" },
  ]);
  // And it is a concept list like any other, so it goes out and comes back.
  assert.deepEqual(conceptsFromMarkdown(conceptsToMarkdown(concepts, "a reader of the explainer")).concepts, concepts);
});

test("a word the script never says falls back to the script's first part rather than to no place at all", () => {
  const concepts = conceptsFromWords([{ id: "sweep", name: "The sweep", why: "what clears a hold nobody drew on" }], BEAT_READING);
  assert.equal(concepts.length, 1);
  assert.equal(concepts[0].taught_at, "p1");
});

// ── the questions, and asking again with the faults ─────────────────────────

const READING = sample("reading.json");
const CLEAN = sample("quiz.json");

// One concept, and the questions the sample quiz wrote for it. This is the
// unit now: a concept goes out on its own and its questions come back on their
// own, so a fault in one concept cannot cost another concept its work.
const CONCEPTS = CLEAN.concepts;
const forConcept = (id) => CLEAN.questions
  .filter((q) => q.concept === id)
  .map(({ id: _id, concept: _c, ...rest }) => rest);

// The same questions with one sent back to a part the reading has not got,
// which is the unknown-place fault and the one an invented id produces.
const faultyFor = (id) => {
  const qs = clone(forConcept(id));
  qs[0].back_to = "p99";
  return qs;
};

const answers = (value) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
const gives = (questions, left = "") => answers({ questions, ...(left ? { left } : {}) });

// The real checker, run on one concept the way makeQuiz runs it.
const checkOne = (concept, questions, left = "") => {
  const numbered = (questions ?? []).map((q, i) => ({ ...q, id: `q${i + 1}`, concept: concept.id }));
  const only = {
    id: concept.id, phrase: concept.phrase, understood: concept.understood, taught_at: concept.taught_at,
    ...(numbered.length ? {} : { left: left || concept.left || "" }),
  };
  const partial = {
    quiz: "v1", title: CLEAN.title, audience: CLEAN.audience, made_from: CLEAN.made_from,
    concepts: [only], questions: numbered, places: placesFor(numbered, READING),
  };
  return checkQuiz(partial, READING).faults.map((f) => `${f.question}: ${f.fault}: ${f.says}`);
};

test("the sample questions are clean concept by concept, so the retry tests are testing the real checker", () => {
  for (const c of CONCEPTS) assert.deepEqual(checkOne(c, forConcept(c.id), c.left), [], c.id);
  assert.equal(checkOne(CONCEPTS[0], faultyFor("c1")).length, 1);
});

test("only the concept that failed is asked again, and the ones that passed are never asked twice", async () => {
  const asked = [];
  const result = await askForQuestions({
    concepts: CONCEPTS,
    make: (c) => ({ concept: c.id, go: "first" }),
    again: (c, findings, draft) => ({ concept: c.id, go: "again", findings, draft }),
    call: async (r) => {
      asked.push(`${r.concept}:${r.go}`);
      if (r.concept === "c2" && r.go === "first") return gives(faultyFor("c2"));
      return gives(forConcept(r.concept), CONCEPTS.find((c) => c.id === r.concept)?.left);
    },
    check: checkOne,
  });
  // Five concepts, one of them twice, and nothing else.
  assert.equal(result.calls, 6);
  assert.deepEqual(asked.filter((a) => a.startsWith("c2")), ["c2:first", "c2:again"]);
  for (const id of ["c1", "c3", "c4", "c5"]) {
    assert.deepEqual(asked.filter((a) => a.startsWith(id)), [`${id}:first`], `${id} was asked once`);
  }
  assert.equal(result.retried, true);
  assert.equal(result.stopped, null);
  for (const w of result.written) assert.deepEqual(w.findings, [], w.concept.id);
});

test("the retry is shown the questions the faults are about, and the fault that actually fired", async () => {
  const sent = [];
  await askForQuestions({
    concepts: [CONCEPTS[0]],
    make: () => ({ go: "first" }),
    again: (c, findings, draft) => { sent.push({ c, findings, draft }); return { go: "again" }; },
    call: async (r) => (r.go === "first" ? gives(faultyFor("c1")) : gives(forConcept("c1"))),
    check: checkOne,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].c.id, "c1");
  assert.equal(sent[0].findings.length, 1);
  assert.match(sent[0].findings[0], /unknown-place/);
  assert.match(sent[0].findings[0], /p99/);
  assert.equal(sent[0].draft[0].back_to, "p99");
});

test("three goes at one concept and no more, and what it wrote is still handed back", async () => {
  let calls = 0;
  const result = await askForQuestions({
    concepts: [CONCEPTS[0]],
    make: () => ({}), again: () => ({}),
    call: async () => { calls += 1; return gives(faultyFor("c1")); },
    check: checkOne,
  });
  assert.equal(calls, 3, "one go and two more, never a fourth");
  assert.equal(result.calls, 3);
  assert.equal(result.written[0].goes, 3);
  assert.equal(result.written[0].findings.length, 1);
  assert.ok(result.written[0].questions.length, "the questions it wrote are still there for the reply to name");
});

test("an answer this script cannot read is a finding like any other, not the end of the job", async () => {
  const sent = [];
  const result = await askForQuestions({
    concepts: [CONCEPTS[0]],
    make: () => ({ go: "first" }),
    again: (c, findings) => { sent.push(findings); return { go: "again" }; },
    call: async (r) => (r.go === "first"
      ? { candidates: [{ content: { parts: [{ text: "Here are the questions you asked for." }] } }] }
      : gives(forConcept("c1"))),
    check: checkOne,
  });
  assert.equal(result.calls, 2);
  assert.deepEqual(result.written[0].findings, []);
  assert.match(sent[0][0], /not JSON|neither questions/);
  assert.match(sent[0][0], /one JSON object/);
});

test("a concept the model says cannot be tested comes back with the reason and no questions", async () => {
  const result = await askForQuestions({
    concepts: [CONCEPTS[4]],
    make: () => ({}), again: () => ({}),
    call: async () => gives([], "the source states it in one clause and does not explain it"),
    check: checkOne,
  });
  assert.equal(result.calls, 1);
  assert.deepEqual(result.written[0].questions, []);
  assert.match(result.written[0].left, /one clause/);
  assert.deepEqual(result.written[0].findings, []);
});

test("the budget is shared across the lanes, spent before the call, and never passed", async () => {
  let calls = 0;
  const result = await askForQuestions({
    concepts: CONCEPTS,
    make: () => ({}), again: () => ({}),
    call: async () => { calls += 1; return gives(forConcept("c1")); },
    check: () => [],
    ceiling: 8, sent: 5,
  });
  // Three left of eight, five concepts. Three are written and the rest are not
  // attempted, rather than four lanes each deciding they can afford the last.
  assert.equal(calls, 3);
  assert.equal(result.calls, 3);
  assert.match(result.stopped, /ceiling of 8 calls per task left no room/);

  const none = await askForQuestions({
    concepts: CONCEPTS,
    make: () => ({}), again: () => ({}),
    call: async () => { calls += 1; return gives([]); },
    check: () => [],
    ceiling: 2, sent: 2,
  });
  assert.equal(calls, 3, "no further call at all was made");
  assert.equal(none.calls, 0);
  assert.match(none.stopped, /ceiling of 2 calls per task left no room/);
});

test("the concepts run several at a time and the results keep the list's order", async () => {
  let inFlight = 0;
  let most = 0;
  const order = [];
  const lots = CONCEPTS.concat(CONCEPTS).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  const result = await askForQuestions({
    concepts: lots,
    make: (c) => ({ concept: c.id }), again: () => ({}),
    call: async (r) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((go) => setTimeout(go, r.concept === "c1" ? 25 : 1));
      inFlight -= 1;
      order.push(r.concept);
      return gives([]);
    },
    check: () => [],
    lanes: 4,
  });
  assert.equal(most, 4, "four in the air at once and never a fifth");
  assert.notEqual(order[0], "c1", "the slow one did not hold the rest up");
  assert.deepEqual(result.written.map((w) => w.concept.id), lots.map((c) => c.id));
});

test("lanes never outnumber the concepts, and no concepts is no lanes", async () => {
  assert.deepEqual(await inLanes([1, 2, 3], async (n) => n * 2, 9), [2, 4, 6]);
  assert.deepEqual(await inLanes([], async (n) => n, 4), []);
});

test("the id and the concept are written in afterwards, so nothing a model returns can collide", () => {
  const written = [
    { concept: { id: "c1" }, questions: [{ asks: "one" }, { asks: "two" }] },
    { concept: { id: "c2" }, questions: [] },
    { concept: { id: "c3" }, questions: [{ asks: "three", id: "q1", concept: "c9" }] },
  ];
  assert.deepEqual(assembleQuestions(written), [
    { asks: "one", id: "q1", concept: "c1" },
    { asks: "two", id: "q2", concept: "c1" },
    { asks: "three", id: "q3", concept: "c3" },
  ]);
});

test("the request for one concept carries that concept and no other, and names the model", () => {
  const one = conceptQuestionsRequest({ reading: READING, concept: CONCEPTS[0], audience: CLEAN.audience });
  const said = textOf(one);
  assert.match(said, /a hold is not a charge/);
  assert.equal(said.includes(CONCEPTS[1].phrase), false, "no other concept is in the request");
  assert.match(said, /Do not give it an id and do not name its concept/);
  assert.match(one.url, new RegExp(`/${MODEL}:generateContent$`));

  // A shorter quiz than the concept list means one question each, and the
  // choice of which way to test it stays with the writer.
  assert.match(textOf(conceptQuestionsRequest({ reading: READING, concept: CONCEPTS[0], oneOnly: true })),
    /questions: exactly one question/);
});

test("the model is the one this package names, and the host may name another", () => {
  assert.equal(MODEL, "gemini-2.5-pro");
  assert.equal(modelOf({}), MODEL);
  assert.equal(modelOf({ TEXT_MODEL: "  " }), MODEL);
  assert.equal(modelOf({ TEXT_MODEL: "gemini-2.5-flash" }), "gemini-2.5-flash");
  assert.match(conceptsRequest({ reading: READING, model: modelOf({ TEXT_MODEL: "some-other" }) }).url, /some-other:generateContent$/);
});

test("a call that would pass the ceiling is not made, and the reply says which ceiling", async () => {
  let calls = 0;
  const count = async () => { calls += 1; return answers({ concepts: [] }); };
  const concepts = await askForConcepts({ request: {}, call: count, ceiling: 1, sent: 1 });
  assert.equal(concepts.calls, 0);
  assert.equal(concepts.answer, null);
  assert.match(concepts.stopped, /ceiling of 1 calls per task/);
  assert.equal(calls, 0);
});

test("the answer survives a code fence and a sentence in front of it", () => {
  const object = { concepts: [{ phrase: "a hold is not a charge" }] };
  const body = { candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(object) + "\n```" }] } }] };
  assert.deepEqual(jsonIn("```json\n{\"a\":1}\n```"), { a: 1 });
  assert.deepEqual(jsonIn("Here is the quiz.\n{\"a\":1}"), { a: 1 });
  assert.deepEqual(jsonIn("{\"a\":1}"), { a: 1 });
  assert.equal(jsonIn("no object here"), null);
  assert.equal(jsonIn("[1,2,3]"), null, "a list is not the object that was asked for");
  assert.deepEqual(answerFrom(body, "concepts").answer, object);
  // A model that put the quiz one level down still wrote the whole quiz.
  const wrapped = { candidates: [{ content: { parts: [{ text: JSON.stringify({ quiz: CLEAN }) }] } }] };
  assert.equal(answerFrom(wrapped, "questions").answer.questions.length, CLEAN.questions.length);
  // And a question instead of an answer is an answer of its own.
  const asking = { candidates: [{ content: { parts: [{ text: JSON.stringify({ concepts: [], question: "Who is this for?" }) }] } }] };
  assert.deepEqual(answerFrom(asking, "concepts"), { answer: null, question: "Who is this for?" });
});

// ── the places the quiz carries ─────────────────────────────────────────────

test("the quiz carries the places its questions cite, no more and no fewer, each one the reading's own", () => {
  const quiz = clone(CLEAN);
  quiz.questions[1].back_to = "p3";
  const places = placesFor(quiz.questions, READING);
  const cited = new Set(quiz.questions.flatMap((q) => [q.from, q.back_to]));
  assert.deepEqual(places.map((p) => p.id), READING.parts.map((p) => p.id).filter((id) => cited.has(id)));
  assert.deepEqual(new Set(places.map((p) => p.id)), cited);
  for (const place of places) {
    const part = READING.parts.find((p) => p.id === place.id);
    assert.deepEqual(place, { id: part.id, source: part.source, place: part.place });
    assert.equal("text" in place, false, "the source's words stay in the reading");
  }
  assert.deepEqual(placesFor([], READING), []);
});

// ── the name ────────────────────────────────────────────────────────────────

test("a name taken from a title is a name the staging step will accept", () => {
  for (const title of [
    "What the funds hold contract says",
    "  Holds, draws & sweeps: what's what!  ",
    "A quiz about the 24 hour expiry",
    "An extremely long title that goes well past the sixty characters a name is allowed to run to",
  ]) {
    const slug = slugOf(title);
    assert.match(slug, SLUG, `${title} became ${slug}`);
    assert.equal(quizName({ env: {}, quiz: { title } }), slug);
  }
  assert.equal(quizName({ env: { NAME: "meridian-quiz" }, quiz: { title: "anything" } }), "meridian-quiz");
  assert.throws(() => quizName({ env: { NAME: "Meridian Quiz" }, quiz: {} }), /lowercase slug/);
  assert.throws(() => quizName({ env: {}, quiz: { title: "!!!" } }), /no title to name it after/);
});

// ── the requests ────────────────────────────────────────────────────────────

test("a request carries the rules, the worked pairs, the one concept and every part id", () => {
  const rules = "These are the standing rules.";
  const forms = "Asked badly, then asked well.";
  const questions = textOf(conceptQuestionsRequest({ rules, forms, reading: READING, concept: LIST.concepts[0], audience: LIST.audience }));
  assert.ok(questions.includes(rules) && questions.includes(forms));
  for (const part of READING.parts) assert.ok(questions.includes(`${part.id} (`), `${part.id} is not in the request`);
  assert.ok(questions.includes("The concept: a hold is not a charge"), "the concept goes in as the person approved it");
  // Every fault the checker refuses is named, because a model told what will
  // be rejected produces fewer rejections.
  for (const fault of ["answer-not-a-choice", "unknown-concept", "unknown-place", "answer-is-longest-choice",
    "answer-echoes-the-source", "same-choice-twice", "all-of-the-above", "double-negative", "wrong-form"]) {
    assert.ok(questions.includes(fault), `${fault} is not named in the request`);
  }

  const concepts = textOf(conceptsRequest({ rules, reading: READING, audience: "" }));
  assert.ok(concepts.includes(rules));
  assert.ok(concepts.includes("ask that one question and name no concepts"), "with no audience it asks rather than guesses");
  assert.ok(textOf(conceptsRequest({ reading: READING, audience: "a new hire" })).includes("The audience is: a new hire"));
  assert.ok(concepts.includes("title:"), "the title is settled with the concept list");
});

test("the approved list is the authority for what is tested, and the questions step may only add a reason", () => {
  const merged = mergeConcepts(LIST.concepts, [
    { id: "c1", phrase: "something else entirely", understood: "no", taught_at: "p9" },
    { id: "c9", phrase: "a concept nobody approved", understood: "no", taught_at: "p9" },
  ]);
  assert.deepEqual(merged.map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(merged[0], { id: "c1", phrase: "a hold is not a charge", understood: LIST.concepts[0].understood, taught_at: "p1" });
  assert.equal(merged[1].left, LIST.concepts[1].left);
  const added = mergeConcepts([{ id: "c1", phrase: "p", understood: "u", taught_at: "p1" }], [{ id: "c1", left: "it would be asking for a number" }]);
  assert.equal(added[0].left, "it would be asking for a number");
});

// ── the attachments a declared command is handed ────────────────────────────

test("attachments are matched to inputs by name and extension, and two documents arrive as two sources", async () => {
  await folders((at) => {
    const file = (name, body) => { const p = join(at.work, name); writeFileSync(p, body); return p; };
    const beats = file("meridian.json", JSON.stringify({ title: "Meridian", steps: [{ layout: "title", narration: "one" }] }));
    const vtt = file("meridian.vtt", "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nA hold is not a charge.\n");
    const one = file("funds-hold-contract.md", "# What a hold is\n\nMoney set aside.\n");
    const two = file("the-notes.txt", "Focus on the boundaries.\n");
    const message = file("message.txt", "Make this one for new hires.\n");

    const env = fromArgv([
      "--job", at.job, "--records", at.records, "--work", at.work,
      "--text-file", message,
      "--file", `${vtt}::text/vtt`, "--file", `${beats}::application/json`,
      "--file", `${one}::text/markdown`, "--file", `${two}::text/plain`,
    ]);
    assert.equal(env.JOB_DIR, at.job);
    assert.equal(env.RECORDS, at.records);
    assert.equal(env.WORK, at.work);
    assert.equal(env.TRANSCRIPT, vtt);
    assert.equal(env.BEAT_SCRIPT, beats, "a beat script is not filed as a document, or its words panel is thrown away");
    assert.equal(env.DOCUMENT, `${one},${two}`);
    assert.equal(env.NOTES, undefined, "the message text is an instruction when the material came attached");
    assert.equal(env.MESSAGE_FILE, message);

    // And read-source reads that environment back as the five sources it names.
    assert.deepEqual(sourcesFromEnv(env).map((s) => s.kind), ["transcript", "beat-script", "document", "document"]);

    // The concept list this agent delivered, edited and sent back.
    const concepts = file("concepts.md", conceptsToMarkdown(LIST));
    const second = fromArgv(["--file", `${concepts}::text/markdown`, "--file", `${one}::text/markdown`]);
    assert.equal(second.CONCEPTS, concepts);
    assert.equal(second.DOCUMENT, one, "the concept list is not read as material to write questions from");

    // Nothing attached at all: the person's own words are the notes.
    const alone = fromArgv(["--text-file", message]);
    assert.equal(alone.NOTES, message);
  });
});

// ── the whole job ───────────────────────────────────────────────────────────

// One concept tested and one left, written against the notes, which read as a
// single part called p1.
const APPROVED = conceptsToMarkdown({
  title: "What the hold notes teach",
  audience: "somebody who has deployed an agent and has never priced one",
  concepts: [
    { id: "c1", phrase: "a hold is not a charge", understood: "Money is set aside when the job starts and stays the buyer's until the work is delivered.", taught_at: "p1", taught_label: "the notes" },
    { id: "c2", phrase: "the expiry", understood: "A hold does not sit on the money forever.", taught_at: "p1", taught_label: "the notes", left: "testing it would be asking somebody to recall a number" },
  ],
  mentioned: ["the sweep"],
});

// What the model sends back for one concept: the questions and nothing else.
// The id and the concept are not in it, because this job writes both.
const WRITTEN = {
  questions: [{
    form: "choice",
    asks: "A job has started and the buyer can see less money available than they had this morning. Whose money is the difference?",
    choices: [
      { id: "a", text: "The seller's, from the moment the job began." },
      { id: "b", text: "The buyer's." },
      { id: "c", text: "The platform's, until the job is over." },
      { id: "d", text: "Nobody's, until somebody cancels it." },
    ],
    answer: "b",
    because: "A hold reserves money without moving it, and the draw on delivery is what changes whose it is.",
    from: "p1", back_to: "p1",
  }],
};

// The staging step, as a function: it places nothing, writes the record
// stage-quiz.mjs writes, and prints the address last.
const stager = (at, url = "https://drafts.example.test/draft/what-the-hold-notes-teach.html") => (({ env }) => {
  const record = {
    name: env.NAME, at: "2026-09-12T00:00:00Z", url,
    page: { object: `draft/${env.NAME}.html`, sha256: sha(readFileSync(env.PAGE)), path: env.PAGE },
    quiz: { object: `draft/${env.NAME}.json`, sha256: sha(readFileSync(env.QUIZ)), path: env.QUIZ },
  };
  writeFileSync(env.STAGED, `${JSON.stringify(record, null, 2)}\n`);
  return { code: 0, stdout: `staged draft/${env.NAME}.html (100 bytes)\nstaged draft/${env.NAME}.json (50 bytes)\n${url}\n`, stderr: "" };
});

test("a whole job: an approved list, one call for the questions, four pieces filed and an address in the reply", async () => {
  await folders(async (at) => {
    const requests = [];
    const out = await makeQuiz({
      env: {
        WORK: at.work, RECORDS: at.records, JOB_DIR: at.job,
        NOTES: "A hold sets money aside when a job starts. It is not a charge, and the money stays the buyer's until the work is delivered. A hold that nobody draws on is released.",
        CONCEPTS: APPROVED,
      },
      here: scripts,
      call: async (r) => { requests.push(r); return answers(WRITTEN); },
      run: stager(at),
    });

    assert.equal(out.code, 0, out.reply);
    assert.equal(out.ok, true);
    assert.equal(out.calls, 1, "the list was approved, so the concepts were not named again");
    assert.equal(out.name, "what-the-hold-notes-teach");
    assert.equal(out.url, "https://drafts.example.test/draft/what-the-hold-notes-teach.html");

    // The records of the job, all of them, whatever else happened.
    for (const file of ["reading.json", "concepts.json", "concepts.md", "quiz.json", "coverage.json", "calls.json", "staged.json", join("source", "given.json")]) {
      assert.ok(existsSync(join(at.records, file)), `${file} was not written`);
    }
    const quiz = JSON.parse(readFileSync(join(at.records, "quiz.json"), "utf8"));
    assert.equal(quiz.audience, "somebody who has deployed an agent and has never priced one", "the audience came off the approved list");
    assert.deepEqual(quiz.concepts.map((c) => c.phrase), ["a hold is not a charge", "the expiry"]);
    assert.equal(quiz.concepts[1].left, "testing it would be asking somebody to recall a number");
    assert.deepEqual(quiz.places, [{ id: "p1", source: "src1", place: { kind: "note", label: "the notes" } }]);
    assert.deepEqual(quiz.made_from, [{ id: "src1", name: "the notes" }]);
    const coverage = JSON.parse(readFileSync(join(at.records, "coverage.json"), "utf8"));
    assert.deepEqual(coverage.concepts.map((c) => c.questions), [["q1"], []]);

    // The delivery, which is the thing the person receives.
    const listed = JSON.parse(readFileSync(join(at.job, "pieces.json"), "utf8"));
    assert.deepEqual(listed.map((e) => e.name), ["concept list", "quiz", "quiz page", "quiz address"]);
    assert.deepEqual(out.listed, ["concept list", "quiz", "quiz page", "quiz address"]);
    assert.equal(readFileSync(join(at.job, "out", "quiz-address.txt"), "utf8").trim(), out.url);
    assert.ok(readFileSync(join(at.job, "out", "what-the-hold-notes-teach.html"), "utf8").includes("Whose money is the difference?"));

    // The reply says what was made, what was left and where it is.
    assert.match(out.reply, /1 question on 2 concepts/);
    assert.match(out.reply, /the expiry, because testing it would be asking somebody to recall a number/);
    assert.match(out.reply, /came with the request/);
    assert.match(out.reply, /the sweep/);
    assert.match(out.reply, new RegExp(out.url.replace(/[.\\/]/g, "\\$&")));
    assert.equal(out.reply.includes("—"), false);

    // One call, for the one concept the person did not leave: the rules, the
    // worked pairs and that concept as it was approved.
    assert.equal(requests.length, 1, "the left concept was not sent to be written");
    const asked = textOf(requests[0]);
    assert.ok(asked.includes("The concept: a hold is not a charge"));
    assert.equal(asked.includes("the expiry"), false, "a concept the person left is not asked about");
    assert.ok(asked.includes("Test understanding, not wording"), "rules.md travelled with the request");
    assert.ok(asked.includes("Asked badly"), "the worked pairs travelled with the request");
    assert.ok(asked.includes("p1 (the notes)"));
  });
});

test("nothing to read is a stop that says what this job takes, and no call is made", async () => {
  await folders(async (at) => {
    let calls = 0;
    const out = await makeQuiz({
      env: { WORK: at.work, RECORDS: at.records, JOB_DIR: at.job },
      here: scripts, call: async () => { calls += 1; }, run: () => ({ code: 0, stdout: "", stderr: "" }),
    });
    assert.equal(out.code, 3);
    assert.equal(out.reply, NO_SOURCE);
    assert.equal(calls, 0);
    assert.equal(existsSync(join(at.job, "pieces.json")), false, "a stop files no pieces");
  });
});

test("when every question written is refused, nothing is staged and the reply lists every fault", async () => {
  await folders(async (at) => {
    const wrong = clone(WRITTEN);
    wrong.questions[0].back_to = "p9";
    let staged = 0;
    const out = await makeQuiz({
      env: {
        WORK: at.work, RECORDS: at.records, JOB_DIR: at.job,
        NOTES: "A hold sets money aside when a job starts. It is not a charge.",
        CONCEPTS: APPROVED,
      },
      here: scripts,
      call: async () => answers(wrong),
      run: () => { staged += 1; return { code: 0, stdout: "", stderr: "" }; },
    });
    assert.equal(out.code, 3);
    assert.equal(staged, 0, "nothing was staged");
    assert.equal(out.calls, 3, "the one concept had three goes and no more");
    assert.match(out.reply, /q1: unknown-place/);
    assert.match(out.reply, /Every question written for this material was refused/);
    assert.ok(existsSync(join(at.records, "coverage.json")), "the coverage record is written whether or not anything is wrong");
    assert.equal(existsSync(join(at.job, "pieces.json")), false);
  });
});

test("one question that cannot pass the check is dropped and the rest are delivered, and the reply says so", async () => {
  await folders(async (at) => {
    // Two questions for the one concept. The second cites a part that is not
    // in the reading and cannot be argued out of it, so it has its three goes
    // and then goes.
    const two = clone(WRITTEN);
    two.questions.push({ ...clone(WRITTEN.questions[0]), asks: "And where does the money go on delivery?", back_to: "p9" });
    let staged = 0;
    const out = await makeQuiz({
      env: {
        WORK: at.work, RECORDS: at.records, JOB_DIR: at.job,
        NOTES: "A hold sets money aside when a job starts. It is not a charge.",
        CONCEPTS: APPROVED,
      },
      here: scripts,
      call: async () => answers(two),
      run: (r) => { staged += 1; return stager(at)(r); },
    });

    assert.equal(out.code, 0, out.reply);
    assert.equal(staged, 1, "the quiz that survived was staged");
    const quiz = JSON.parse(readFileSync(join(at.records, "quiz.json"), "utf8"));
    assert.equal(quiz.questions.length, 1, "the refused question is not in the delivery");
    assert.deepEqual(quiz.questions.map((q) => q.id), ["q1"], "what is left is numbered from one");
    assert.equal(quiz.places.some((p) => p.id === "p9"), false, "and the place it cited went with it");
    assert.match(out.reply, /1 question was written three times, still could not pass the check/);
    assert.match(out.reply, /unknown-place/);
    assert.match(out.reply, new RegExp(out.url.replace(/[.\\/]/g, "\\$&")));
  });
});

test("the page that could not be placed is a stop that keeps the questions and names the reason", async () => {
  await folders(async (at) => {
    const out = await makeQuiz({
      env: {
        WORK: at.work, RECORDS: at.records, JOB_DIR: at.job,
        NOTES: "A hold sets money aside when a job starts. It is not a charge.",
        CONCEPTS: APPROVED,
      },
      here: scripts,
      call: async () => answers(WRITTEN),
      run: () => ({ code: 1, stdout: "", stderr: "refused: the draft host would not take the credential: 403\n" }),
    });
    assert.equal(out.code, 3);
    assert.match(out.reply, /the draft host would not take the credential/);
    assert.match(out.reply, /The questions are kept as a file/);
    assert.ok(existsSync(join(at.records, "quiz.json")));
  });
});

test("a source that settles no audience goes back as that one question, with no questions written", async () => {
  await folders(async (at) => {
    const calls = [];
    const out = await makeQuiz({
      env: { WORK: at.work, RECORDS: at.records, JOB_DIR: at.job, NOTES: "Some notes about holds." },
      here: scripts,
      call: async (r) => { calls.push(r); return { candidates: [{ content: { parts: [{ text: JSON.stringify({ concepts: [], question: "Who is taking this quiz, and what do they already know?" }) }] } }] }; },
      run: () => ({ code: 0, stdout: "", stderr: "" }),
    });
    assert.equal(out.code, 3);
    assert.equal(out.reply, "Who is taking this quiz, and what do they already know?");
    assert.equal(calls.length, 1, "it asked once and wrote nothing");
    assert.equal(readFileSync(join(at.records, "question.txt"), "utf8").trim(), out.reply);
  });
});

test("the reply never names an address the job does not have", () => {
  const said = replyText({ url: "", quiz: { title: "a quiz", questions: [], concepts: [] }, listed: [] });
  assert.match(said, /Nothing was placed where a person can open it/);
  assert.equal(said.includes("http"), false);
  const back = replyText({ url: "https://x.test/q.html", quiz: { title: "a quiz", questions: [{ form: "choice" }, { form: "written" }], concepts: [{}] }, nowhere: 1 });
  assert.match(back, /1 of the 2 questions name no place to go back to/);
  assert.match(back, /1 of them answered in the person's own words/);
});

test("every step of this job is one of the five the offering names", () => {
  assert.deepEqual(STEPS, ["read-the-source", "name-the-concepts", "write-the-questions", "check-the-questions", "stage-the-quiz"]);
});

// A refused call is told to the person in one sentence, and the service's own
// words go to the log. What a service says when it refuses is written for
// whoever holds the account: it is JSON, it names the provider, and on a bad
// key it is a page of it. The person who ordered a quiz cannot act on any of
// that, and a reply carrying it reads as the agent breaking rather than a
// setting being wrong. Run: node --test test/make-quiz.test.mjs
test("a refused call reaches the person as one sentence naming who can fix it", () => {
  const googleBadKey = JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } });
  // This service answers a refused key with 400 and not 401, so the status
  // alone cannot decide it and the body has to be read.
  for (const [status, body] of [[400, googleBadKey], [401, ""], [403, ""]]) {
    const said = serviceProblem(status, body);
    assert.match(said, /refused the key/);
    assert.match(said, /whoever runs this agent/);
  }
  assert.match(serviceProblem(429, ""), /not taking more calls/);
  assert.match(serviceProblem(503, ""), /not answering/);
  // A 400 that is not about a key is the request, not the credential.
  assert.match(serviceProblem(400, '{"error":{"message":"invalid contents"}}'), /refused the request/);
  for (const [status, body] of [[400, googleBadKey], [401, ""], [429, ""], [503, ""]]) {
    const said = serviceProblem(status, body);
    assert.ok(!said.includes("{"), `the service's JSON reached the person: ${said}`);
    assert.ok(!/—/.test(said), "an em dash reached the person");
  }
});

// The two stops this step can take want opposite advice, so it says which kind
// it was. Telling somebody to raise a ceiling that was never reached sends
// them to a setting that is not the problem.
test("a stop says whether it was the ceiling or the service", async () => {
  const refused = await askForConcepts({
    request: {}, ceiling: null, sent: 0,
    call: async () => { throw new Error("the text-reasoning service is not answering"); },
  });
  assert.equal(refused.stoppedBy, "service");
  assert.equal(refused.calls, 1);

  const capped = await askForConcepts({
    request: {}, ceiling: 2, sent: 2,
    call: async () => { throw new Error("this call should never be made"); },
  });
  assert.equal(capped.stoppedBy, "ceiling");
  assert.equal(capped.calls, 0, "a call past the ceiling was made anyway");

  const fine = await askForConcepts({
    request: {}, ceiling: 5, sent: 0,
    call: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      audience: "somebody new to holds",
      concepts: [{ phrase: "a hold is not a charge", understood: "Money is set aside and not taken.", taught_at: "p1" }],
    }) }] } }] }),
  });
  assert.equal(fine.stoppedBy, null);
  assert.equal(fine.stopped, null);
});

// ── the context bag ─────────────────────────────────────────────────────────
//
// What a caller hands the job alongside the material. What is worth pinning:
// an entry is found by its SCHEMA and never by its name, which is the line the
// whole arrangement rests on; shaped context and words sit in one bag without
// either swallowing the other; a job with no bag is the job this agent did
// before there was one; and an entry that never arrived is said back rather
// than explained away as a thin profile.

const MERIDIAN = {
  brand_profile: "v1",
  name: "Meridian Analytics",
  owner: "meridian.example.com",
  palette: {
    ink: "#101317", ground: "#FFFFFF", heading: "#1C3C3C", link: "#0B5FD0", button: "#1C3C3C",
    primary: "#1F6FEB",
    accent: "#E9C46A", contrast_floor: "AAA", never_hue_alone: true,
  },
  type: {
    heading: { family: "Space Grotesk", fallback: "system-ui, sans-serif", weight: 700 },
    body: { family: "IBM Plex Sans", fallback: "system-ui, sans-serif" },
    mono: null,
  },
};

// A bag as the adapter writes one: bag.json beside the pieces, and every entry
// in a file of its own under bag/ whether it arrived as the thing itself or as
// an address, so a step reads one thing one way.
function layBag(jobDir, entries) {
  mkdirSync(join(jobDir, "bag"), { recursive: true });
  const written = entries.map((e, i) => {
    const named = { name: e.name, ...(e.schema ? { schema: e.schema } : {}), media_type: e.media_type ?? "application/json" };
    if (e.why) return { ...named, from: "ref", resolved: null, why: e.why };
    const file = `bag/${i + 1}-${slugOf(e.name)}.${e.schema ? "json" : "txt"}`;
    writeFileSync(join(jobDir, file), typeof e.value === "string" ? e.value : `${JSON.stringify(e.value, null, 2)}\n`);
    return { ...named, from: e.from ?? "value", file };
  });
  writeFileSync(join(jobDir, "bag.json"), `${JSON.stringify({ bag: "v1", at: "2026-09-13T00:00:00Z", entries: written }, null, 2)}\n`);
}

// The same job as the whole-job test above, so a run with a bag and a run
// without one are the same run apart from the bag.
const aJobWith = (at, over = {}) => ({
  WORK: at.work, RECORDS: at.records, JOB_DIR: at.job,
  NOTES: "A hold sets money aside when a job starts. It is not a charge, and the money stays the buyer's until the work is delivered. A hold that nobody draws on is released.",
  CONCEPTS: APPROVED,
  ...over,
});

test("a bag entry is found by its schema and never by its name", () => {
  const bag = {
    at: "nowhere",
    entries: [
      { name: "the house style", schema: BRAND_SCHEMA, media_type: "application/json", from: "value", file: "bag/1-the-house-style.json" },
      { name: "brand profile", schema: "https://schemas.example.test/palette/v3", from: "value", file: "bag/2-brand-profile.json" },
      { name: "brand profile", media_type: "text/plain", from: "value", file: "bag/3-brand-profile.txt" },
    ],
  };
  const found = entryFor(bag, BRAND_SCHEMA);
  assert.equal(found?.name, "the house style", "an entry named something else entirely carries the shape it names, and is the one");
  assert.equal(found.file, "bag/1-the-house-style.json");
  for (const decoy of bag.entries.slice(1)) {
    assert.notEqual(entryFor(bag, BRAND_SCHEMA), decoy, "an entry CALLED brand profile was taken for one");
  }
  // The version is part of the shape's name, so another version is another
  // shape and this agent has not declared it.
  assert.equal(entryFor(bag, "https://schemas.agentmesh.ai/brand/v2"), null);

  // And words are the entries with no shape at all, whatever they are called.
  assert.deepEqual(wordsIn(bag).map((e) => e.file), ["bag/3-brand-profile.txt"]);
});

test("the bag is the one the host named, and failing that the one beside the job's pieces", async () => {
  await folders((at) => {
    assert.equal(readBag(at.job, {}), null, "a job with no bag reads nothing");
    layBag(at.job, [{ name: "house notes", media_type: "text/plain", value: "Keep it short." }]);
    assert.equal(readBag(at.job, {}).entries.length, 1);

    const elsewhere = join(at.dir, "named");
    mkdirSync(elsewhere, { recursive: true });
    layBag(elsewhere, [
      { name: "house notes", media_type: "text/plain", value: "The one the host named." },
      { name: "the house style", schema: BRAND_SCHEMA, value: MERIDIAN },
    ]);
    const named = readBag(at.job, { MESH_JOB_BAG: join(elsewhere, "bag.json") });
    assert.equal(named.entries.length, 2);
    assert.equal(bagText(named, wordsIn(named)[0]).text.trim(), "The one the host named.");

    // A file named outside the job folder is refused rather than read: the
    // list of file names is the one part of a message a sender writes and this
    // step opens.
    const climbing = { at: at.job, entries: [{ name: "notes", media_type: "text/plain", from: "value", file: "../../secrets.txt" }] };
    assert.equal(bagText(climbing, climbing.entries[0]).text, null);
    assert.match(bagText(climbing, climbing.entries[0]).why, /outside the job folder/);

    // A bag that is not JSON at all loses nothing quietly, and neither does
    // one written to a later shape than this agent reads.
    writeFileSync(join(at.job, "bag.json"), "{ not json");
    assert.equal(readBag(at.job, {}).unreadable, true);
    writeFileSync(join(at.job, "bag.json"), JSON.stringify({ bag: "v2", entries: [{ name: "notes", media_type: "text/plain", from: "value", file: "bag/1-notes.txt" }] }));
    assert.equal(readBag(at.job, {}).unreadable, true, "a later bag was read as though it were this one");
    assert.deepEqual(readBag(at.job, {}).entries, []);
  });
});

test("a whole job with a bag: the profile colors the page, the notes reach the writing, and used.json says what was done", async () => {
  await folders(async (at) => {
    layBag(at.job, [
      { name: "the house style", schema: BRAND_SCHEMA, value: MERIDIAN, from: "ref" },
      { name: "house notes", media_type: "text/plain", value: "The client dislikes the word cheap. Do not mention the acquisition.\n" },
    ]);
    const requests = [];
    const out = await makeQuiz({
      env: aJobWith(at), here: scripts,
      call: async (r) => { requests.push(r); return answers(WRITTEN); },
      run: stager(at),
    });
    assert.equal(out.code, 0, out.reply);

    // The page is the caller's, and it is the same quiz either way.
    const page = readFileSync(join(at.job, "out", "what-the-hold-notes-teach.html"), "utf8");
    assert.ok(page.includes("--ground:#FFFFFF") && page.includes("--ink:#101317"));
    assert.ok(page.includes("--accent:#E9C46A"));
    assert.ok(page.includes('h1{ font-family:"Space Grotesk", system-ui, sans-serif; font-weight:700; }'));
    assert.ok(page.includes('--body:"IBM Plex Sans", system-ui, sans-serif'));
    assert.ok(page.includes("Whose money is the difference?"), "the questions are the questions");

    // The answer for the profile, filed with the job in the shape the bag
    // settles. Four lists: what changed the page, what the profile did not
    // carry, what was read and not honored with the reason, and what the
    // profile states that this agent never asks for.
    const used = JSON.parse(readFileSync(join(at.job, "used.json"), "utf8"));
    assert.deepEqual(Object.keys(used), ["used", "schema", "applied", "not_present", "not_applied", "not_read"]);
    assert.equal(used.used, "v1");
    assert.equal(used.schema, BRAND_SCHEMA);
    assert.deepEqual(used.applied, [
      "palette.ink", "palette.ground", "palette.heading", "palette.link", "palette.button",
      "palette.accent", "palette.never_hue_alone",
      "type.heading.family", "type.heading.fallback", "type.heading.weight", "type.body.family", "type.body.fallback",
    ]);
    // The profile states a primary, an on_primary, a mark and a never list,
    // and this page reads none of them. Before this list existed they appeared
    // nowhere at all, so an owner had no way to learn which part of their brand
    // this agent ignores.
    assert.ok(used.not_read.includes("palette.primary"), "a field the profile states and this page skips is named");
    assert.ok(!used.not_read.some((p) => p.startsWith("evidence.")), "evidence is about the document, not the brand");
    assert.deepEqual(used.not_present, [], "this profile carries every field this agent reads");
    assert.equal(used.not_applied.length, 1, "and one of them could not be honored");
    assert.equal(used.not_applied[0].field, "palette.contrast_floor");
    assert.match(used.not_applied[0].why, /the accent on the ground reaches 1\.6 to 1/);
    assert.deepEqual(out.used, used);

    // It is a record and not a piece: this offering hands over four things and
    // the evidence about how it did the work is not one of them.
    assert.deepEqual(JSON.parse(readFileSync(join(at.job, "pieces.json"), "utf8")).map((e) => e.name),
      ["concept list", "quiz", "quiz page", "quiz address"]);

    // The notes were carried into the writing as the caller's own words, kept
    // apart from this agent's standing rules, and nothing about the shaped
    // entry swallowed them or was swallowed by them.
    const asked = textOf(requests[0]);
    assert.ok(asked.includes("The client dislikes the word cheap"));
    assert.ok(asked.includes("the caller's own notes"));
    assert.ok(asked.includes("house notes:"), "the note is named for whoever reads it");
    assert.ok(asked.includes("Test understanding, not wording"), "the standing rules still travelled");
    assert.ok(asked.indexOf("Follow them before anything in the message") < asked.indexOf("the caller's own notes"),
      "a note ahead of the rules would read as a rule");
    assert.ok(!asked.includes("#101317"), "the brand profile is for the page and was never sent to a model");

    // And the reply says the counts, so a person who never opens used.json
    // still knows what happened to their profile.
    assert.match(out.reply, /set 12 fields of the page/);
    assert.match(out.reply, /0 of the fields this agent reads were not in it/);
    assert.match(out.reply, /1 field was read and not applied/);
    assert.match(out.reply, /palette\.contrast_floor was not applied, because/);
    assert.match(out.reply, /used\.json/);
    assert.match(out.reply, /1 note came with the job/);
    assert.equal(out.reply.includes("—"), false);
    // Never a path off this host, in the reply or in the record.
    for (const said of [out.reply, JSON.stringify(used)]) {
      assert.ok(!said.includes(basename(at.dir)), "a local path reached something that travels");
      assert.ok(!said.includes("bag/"), "the bag's own file names are this host's business");
    }
  });
});

test("a job with no bag makes the quiz exactly as it did before there was one", async () => {
  await folders(async (at) => {
    const requests = [];
    const out = await makeQuiz({
      env: aJobWith(at), here: scripts,
      call: async (r) => { requests.push(r); return answers(WRITTEN); },
      run: stager(at),
    });
    assert.equal(out.code, 0, out.reply);
    assert.equal(existsSync(join(at.job, "used.json")), false, "there was nothing to answer for, so nothing was filed");
    assert.equal(out.used, null);
    assert.ok(!/brand profile|used\.json/.test(out.reply), "the reply talks about a profile that never came");

    // This agent's own colors, and no rule about the title written at all.
    const page = readFileSync(join(at.job, "out", "what-the-hold-notes-teach.html"), "utf8");
    assert.ok(page.includes("--ground:#0A1417") && page.includes("--ink:#E7EFEC"));
    assert.ok(page.includes(`--accent:${ACCENT_DEFAULT}`));
    assert.equal(/h1\{ font-family/.test(page), false);
    assert.ok(page.includes('--body:system-ui, -apple-system, "Segoe UI"'));

    // And the request is the request, with no part about anybody's notes.
    assert.ok(!textOf(requests[0]).includes("the caller's own notes"));
  });
});

test("a profile that did not arrive is said back, never explained away as a thin profile", async () => {
  await folders(async (at) => {
    layBag(at.job, [
      { name: "brand profile", schema: BRAND_SCHEMA, why: "only https is fetched for a bag entry, and this one is http. Publish it over https, or send the thing itself as a value." },
      { name: "a scan of the guide", media_type: "application/pdf", value: "%PDF-1.7 not words" },
    ]);
    const out = await makeQuiz({
      env: aJobWith(at), here: scripts,
      call: async () => answers(WRITTEN),
      run: stager(at),
    });
    assert.equal(out.code, 0, out.reply);
    assert.match(out.reply, /A brand profile came with the job and did not arrive/);
    assert.match(out.reply, /only https is fetched/);
    assert.match(out.reply, /1 thing in the bag could not be read as words/);
    assert.match(out.reply, /a scan of the guide/);
    assert.equal(existsSync(join(at.job, "used.json")), false, "nothing was used, so there is nothing to answer for");
    assert.ok(readFileSync(join(at.job, "out", "what-the-hold-notes-teach.html"), "utf8").includes("--ground:#0A1417"),
      "the page is in this agent's own colors and says so rather than pretending the brand was thin");
  });
});

// ── what the quiz went without ─────────────────────────────────────────────

test("a concept nothing could be asked about is reported as material this quiz does not test", () => {
  const coverage = { concepts: [
    { id: "c1", phrase: "a hold is not a charge", questions: ["q1"] },
    { id: "c2", phrase: "settlement timing", questions: [], left: "the reading states it and never explains it" },
  ] };
  const [only] = absences({ coverage });
  assert.match(only.wanted, /^a question on one concept$/);
  assert.match(only.why, /settlement timing, because the reading states it/);
  // The thing a reader would otherwise assume: that passing the quiz is
  // evidence across the whole reading.
  assert.match(only.did, /passing it is no evidence on that material/);
});

test("questions refused three times and dropped are the same hole by another route", () => {
  const dropped = [{ id: "q3", fault: "echo" }, { id: "q5", fault: "echo" }, { id: "q7", fault: "two right answers" }];
  const [only] = absences({ dropped });
  assert.equal(only.wanted, "3 questions the check kept refusing");
  assert.match(only.why, /echo; two right answers/);
  assert.match(only.did, /dropped them rather than deliver a faulty question/);
  assert.equal([...new Set(dropped.map((d) => d.fault))].length, 2, "the reasons are named once each, not once per question");
});

test("a quiz that tested everything it named goes without nothing", () => {
  const coverage = { concepts: [{ id: "c1", phrase: "a hold is not a charge", questions: ["q1"] }] };
  assert.deepEqual(absences({ coverage, dropped: [] }), []);
  assert.deepEqual(absences({}), []);
});
