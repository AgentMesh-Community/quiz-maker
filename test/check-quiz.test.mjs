// What the check refuses, and what it lets through.
//
// The fixtures are here rather than under sample/, because the point of most
// of them is one field changed: a clean quiz of three concepts and three
// questions, and a copy of it with one thing wrong. What is worth pinning:
// each of the eight fault names fires on the quiz that carries it and on
// nothing else; a clean quiz yields no faults and a coverage record naming
// every concept with the questions that test it; a quiz with three faults
// reports three rather than the first; a concept left with a reason is not a
// fault and one left in silence is; and the command exits non-zero, prints
// every fault on its own line and still writes the coverage record.
// Run: node --test test/check-quiz.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CHECKED_BY_SCRIPT, ECHO_RUN, checkQuiz, echoRun, FAULTS, faultLines, negations, normalise } from "../scripts/check-quiz.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "check-quiz.mjs");

const reading = () => ({
  reading: "v1",
  sources: [{ id: "src1", kind: "transcript", name: "meridian.vtt", address: "https://agentmesh.ai/draft/meridian.html" }],
  parts: [
    { id: "p1", source: "src1", place: { kind: "time", value: 12, label: "at 0:12", fragment: "t=12" }, text: "Prices are carried in a unit a millionth the size of a dollar." },
    { id: "p3", source: "src1", place: { kind: "time", value: 48, label: "at 0:48", fragment: "t=48" }, text: "The seller names the job. The platform names the amount, because only it knows the terms." },
    { id: "p7", source: "src1", place: { kind: "time", value: 96, label: "at 1:36", fragment: "t=96" }, text: "A hold sets the money aside while the job runs. The draw happens on delivery." },
  ],
});

const quiz = () => ({
  quiz: "v1",
  title: "What the Meridian explainer teaches",
  audience: "somebody new to agent pricing",
  made_from: [{ id: "src1", name: "meridian.vtt", address: "https://agentmesh.ai/draft/meridian.html" }],
  concepts: [
    { id: "c1", phrase: "a hold is not a charge", understood: "Money is set aside when the job starts and only taken when the work is delivered.", taught_at: "p7" },
    { id: "c2", phrase: "who names the amount", understood: "The seller names the job and the platform names the amount.", taught_at: "p3" },
    { id: "c3", phrase: "the micro-unit", understood: "Prices are carried in a unit a millionth the size of a dollar.", taught_at: "p1", left: "testing it would be asking somebody to recall a number" },
  ],
  questions: [
    {
      id: "q1",
      concept: "c1",
      form: "choice",
      asks: "A job has started and the buyer's balance has dropped. What has happened to the money?",
      choices: [
        { id: "a", text: "It has been paid to the seller and the job is closed." },
        { id: "b", text: "It has been set aside and not yet taken." },
        { id: "c", text: "It has been refunded to the buyer already." },
        { id: "d", text: "Nothing happened and the balance shown is wrong." },
      ],
      answer: "b",
      because: "A hold reserves the money while the job runs, and the draw happens on delivery.",
      from: "p7",
      back_to: "p7",
    },
    {
      id: "q2",
      concept: "c2",
      form: "written",
      asks: "In your own words, why does the seller name the job and the platform name the amount?",
      answer_text: "The seller knows what work it is doing; only the platform knows the buyer's terms and balance.",
      from: "p3",
      back_to: "p3",
    },
    {
      id: "q3",
      concept: "c2",
      form: "choice",
      asks: "Who knows what the buyer has agreed to pay?",
      choices: [
        { id: "a", text: "The seller, which is why it names the amount to hold." },
        { id: "b", text: "Whoever opened the job in the console." },
        { id: "c", text: "The platform, and only the platform." },
        { id: "d", text: "Both the seller and the platform, together." },
      ],
      answer: "c",
      because: "Only the platform holds the buyer's terms, so only it can work out the amount.",
      from: "p3",
      back_to: "p7",
    },
  ],
});

const names = (faults) => faults.map((f) => f.fault);
const check = (edit = () => {}) => { const q = quiz(); edit(q); return checkQuiz(q, reading()); };
const only = (edit) => { const { faults } = check(edit); assert.equal(faults.length, 1, faultLines(faults).join("\n")); return faults[0]; };

test("a clean quiz carries no faults, and the coverage names every concept", () => {
  const { faults, coverage } = checkQuiz(quiz(), reading());
  assert.deepEqual(faults, []);
  assert.equal(coverage.coverage, "v1");
  assert.deepEqual(coverage.concepts, [
    { id: "c1", phrase: "a hold is not a charge", questions: ["q1"] },
    { id: "c2", phrase: "who names the amount", questions: ["q2", "q3"] },
    { id: "c3", phrase: "the micro-unit", questions: [], left: "testing it would be asking somebody to recall a number" },
  ]);
  assert.deepEqual(coverage.faults, []);
  assert.deepEqual(coverage.checked_by_script, CHECKED_BY_SCRIPT);
  assert.equal(CHECKED_BY_SCRIPT.length, 8);
  assert.equal(FAULTS.length, 9);
});

test("a right answer that is not one of the choices", () => {
  const f = only((q) => { q.questions[0].answer = "e"; });
  assert.equal(f.fault, "answer-not-a-choice");
  assert.equal(f.question, "q1");
  assert.match(f.says, /the right answer is e and the choices are a, b, c and d/);
  // A written question is not asked for choices it does not have.
  assert.deepEqual(check((q) => { q.questions[1].answer = "b"; }).faults, []);
});

test("a question on a concept the quiz's own list does not carry", () => {
  const f = only((q) => { q.questions[2].concept = "c9"; });
  assert.equal(f.fault, "unknown-concept");
  assert.equal(f.question, "q3");
  assert.match(f.says, /tests c9 and the quiz's concept list does not carry it/);
});

test("a place the reading does not have, from and back_to in the one line", () => {
  const f = only((q) => { q.questions[0].back_to = "p9"; });
  assert.equal(f.fault, "unknown-place");
  assert.equal(f.says, "back_to names p9, and the reading has no such part");
  const both = only((q) => { q.questions[0].from = "p8"; q.questions[0].back_to = "p9"; });
  assert.equal(both.says, "from names p8 and back_to names p9, and the reading has no such part");
  // The reading settles what exists, not the quiz: a part the reading drops goes with it.
  const gone = checkQuiz(quiz(), { reading: "v1", parts: reading().parts.filter((p) => p.id !== "p7") });
  assert.deepEqual(names(gone.faults), ["unknown-place", "unknown-place"]);
});

test("a right answer visibly fuller than the rest, and not one two characters longer", () => {
  // Long, and deliberately NOT made of the source's words, or it would trip
  // the echo rule too and this test would stop being about length.
  const f = only((q) => { q.questions[0].choices[1].text = "Somebody at the bank has placed a temporary block on that portion of the account balance."; });
  assert.equal(f.fault, "answer-is-longest-choice");
  assert.equal(f.question, "q1");
  assert.match(f.says, /^the right answer is 89 characters and the next longest is 53, which is a fifth shorter or more$/);
  // A hair longer is not the giveaway either. The first real run was sent back
  // three times over 59 against 57 and 54 against 49, differences no test taker
  // can see, and the only fix available to a writer is padding a wrong choice,
  // which makes the distractors worse.
  const hair = check((q) => { q.questions[0].choices[1].text = "x".repeat(55); });
  assert.equal(hair.faults.length, 0, "55 against 53 is not a giveaway");
  const clear = check((q) => { q.questions[0].choices[1].text = "x".repeat(65); });
  assert.deepEqual(names(clear.faults), ["answer-is-longest-choice"], "65 against 53 is a fifth longer");
  // Equal longest is not the giveaway either.
  const tied = check((q) => { q.questions[0].choices[1].text = "It has been paid to the seller and the job is open."; });
  assert.equal(tied.faults.length, 0, faultLines(tied.faults).join("\n"));
});

test("two choices that read the same once punctuation and articles are taken out", () => {
  assert.equal(normalise("The money, a hold and an amount!"), "money hold and amount");
  assert.equal(normalise("It has been set aside, and not yet taken!"), normalise("It has been set aside and not yet taken."));
  assert.notEqual(normalise("the money is held"), normalise("the money is kept"));
  const f = only((q) => { q.questions[0].choices[2].text = "It has been set aside, and not yet taken!"; });
  assert.equal(f.fault, "same-choice-twice");
  assert.equal(f.says, 'choices b and c read the same with the punctuation and the articles taken out, "it has been set aside and not yet taken"');
  // Three the same are one fault naming all three, not a fault per pair.
  const three = only((q) => {
    q.questions[0].choices[2].text = "It has been set aside and not yet taken";
    q.questions[0].choices[3].text = "It has been set aside, and not yet taken.";
  });
  assert.match(three.says, /^choices b, c and d read the same/);
});

test("a choice reading all of the above or none of the above, in any casing", () => {
  const f = only((q) => { q.questions[2].choices[3].text = "All of the above."; });
  assert.equal(f.fault, "all-of-the-above");
  assert.match(f.says, /^choice d reads "All of the above\."/);
  assert.equal(only((q) => { q.questions[2].choices[3].text = "NONE OF THE ABOVE"; }).fault, "all-of-the-above");
  assert.equal(only((q) => { q.questions[2].choices[3].text = "none of the above!"; }).fault, "all-of-the-above");
  // A choice that says something about what is above is a real choice.
  assert.deepEqual(check((q) => { q.questions[2].choices[3].text = "Both of the two above, and nobody else."; }).faults, []);
});

test("a question carrying two negations", () => {
  assert.deepEqual(negations("A hold is not a charge."), ["not"]);
  assert.deepEqual(negations("Which of these is not something that cannot happen to a hold?"), ["not", "cannot"]);
  assert.deepEqual(negations("None of it is no longer held."), ["none", "no"]);
  assert.deepEqual(negations("The seller doesn't know the terms and won't be told."), ["doesn't", "won't"]);
  assert.deepEqual(negations("Nothing is normal about a nonsense unless."), [], "no prefixes are counted, so unless and nonsense are left alone");
  const f = only((q) => { q.questions[0].asks = "Which of these is not something that cannot happen to a hold?"; });
  assert.equal(f.fault, "double-negative");
  assert.match(f.says, /^the question carries 2 negations, "not" and "cannot"/);
  // One negation is how a plain question is often asked, and is left alone.
  assert.deepEqual(check((q) => { q.questions[0].asks = "What has not yet happened to the money?"; }).faults, []);
});

test("the shapes that are wrong: choices, ids, because, answer_text, duplicates and a question that asks nothing", () => {
  const three = only((q) => { q.questions[0].choices.pop(); });
  assert.equal(three.fault, "wrong-form");
  assert.match(three.says, /carries 3 choices and a choice question carries four/);
  assert.match(only((q) => { q.questions[0].choices[3].id = "e"; }).says, /lettered a, b, c and e and a choice question letters them a, b, c, d in that order/);
  assert.match(only((q) => { q.questions[1].choices = quiz().questions[0].choices; }).says, /written question carries choices/);
  assert.match(only((q) => { delete q.questions[0].because; }).says, /does not say why the right answer is right/);
  assert.match(only((q) => { delete q.questions[1].answer_text; }).says, /does not give the answer a person should be able to write/);
  assert.match(only((q) => { q.questions[2].id = "q1"; }).says, /a second question is also called q1/);
  assert.match(only((q) => { delete q.questions[0].asks; }).says, /asks nothing/);
  assert.match(only((q) => { q.questions[0].form = "essay"; }).says, /form is "essay", and a question is either a choice question or a written one/);
  assert.match(only((q) => { delete q.questions[0].from; }).says, /does not say where its answer came from/);
  // A concept id carried twice takes the second concept's questions with it.
  const dupe = check((q) => { q.concepts[1].id = "c1"; });
  assert.match(dupe.faults.find((f) => f.fault === "wrong-form").says, /a second concept is also called c1/);
  assert.deepEqual(names(dupe.faults), ["wrong-form", "unknown-concept", "unknown-concept"]);
  assert.ok(dupe.faults.every((f) => f.fault !== "answer-not-a-choice"));
});

test("three faults are reported as three, not as the first", () => {
  const { faults, coverage } = check((q) => {
    q.questions[0].answer = "e";
    q.questions[1].concept = "c9";
    q.questions[2].back_to = "p9";
  });
  assert.deepEqual(names(faults), ["answer-not-a-choice", "unknown-concept", "unknown-place"]);
  assert.deepEqual(faults.map((f) => f.question), ["q1", "q2", "q3"]);
  assert.deepEqual(coverage.faults, faults);
  assert.deepEqual(faultLines(faults).map((l) => l.split(":")[0]), ["q1", "q2", "q3"]);
});

test("a concept left with a reason is not a fault, and one left in silence is", () => {
  const kept = checkQuiz(quiz(), reading()).coverage.concepts[2];
  assert.deepEqual(kept.questions, []);
  assert.equal(kept.left, "testing it would be asking somebody to recall a number");
  const silent = check((q) => { delete q.concepts[2].left; });
  assert.deepEqual(names(silent.faults), ["wrong-form"]);
  assert.equal(silent.faults[0].concept, "c3");
  assert.equal(silent.faults[0].question, undefined);
  assert.match(silent.faults[0].says, /no questions and no reason saying it was left/);
  assert.equal(silent.coverage.concepts[2].left, "no reason given");
  // A blank reason is a silence with a field around it.
  assert.deepEqual(names(check((q) => { q.concepts[2].left = "   "; }).faults), ["wrong-form"]);
});

test("every fault name can fire, and nothing a person reads carries an em dash", () => {
  const { faults, coverage } = check((q) => {
    q.questions[0].answer = "e";
    q.questions[0].asks = "Which of these is not something that cannot happen to a hold?";
    q.questions[0].choices[2].text = "It has been set aside, and not yet taken!";
    q.questions[0].choices[3].text = "All of the above.";
    q.questions[1].concept = "c9";
    q.questions[2].back_to = "p9";
    // Longest AND built entirely out of the words of the part it cites, which
    // is the giveaway a matcher lives on: read p3, recognise the phrasing,
    // pick it. It goes on q3 rather than q1 because q1's answer is broken
    // above, and a question with no right answer has nothing to measure.
    q.questions[2].choices[0].text = "The seller, which is why it opens the work.";
    q.questions[2].choices[2].text = "The platform names the amount, because only the platform knows the terms.";
    delete q.questions[2].because;
    delete q.concepts[2].left;
  });
  assert.deepEqual(new Set(names(faults)), new Set(FAULTS));
  const read = [...faults.map((f) => f.says), ...faultLines(faults), ...coverage.checked_by_script, readFileSync(script, "utf8")];
  for (const s of read) assert.ok(!s.includes("\u2014"), `an em dash in: ${s.slice(0, 80)}`);
});

test("the command writes the coverage, and refuses a quiz that carries a fault", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiz-maker-"));
  const at = (f) => join(dir, f);
  writeFileSync(at("reading.json"), JSON.stringify(reading()));
  writeFileSync(at("quiz.json"), JSON.stringify(quiz()));
  const run = (env) => spawnSync(process.execPath, [script], { env: { ...process.env, ...env }, encoding: "utf8" });
  const settings = { QUIZ: at("quiz.json"), READING: at("reading.json"), OUT: at("coverage.json") };

  const clean = run(settings);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /^nothing wrong with the questions; 3 concepts, 2 tested by 3 questions, 1 left; coverage written to /);
  assert.deepEqual(JSON.parse(readFileSync(at("coverage.json"), "utf8")), checkQuiz(quiz(), reading()).coverage);

  const bad = quiz();
  bad.questions[0].answer = "e";
  bad.questions[2].back_to = "p9";
  writeFileSync(at("quiz.json"), JSON.stringify(bad));
  const refused = run(settings);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /^q1: answer-not-a-choice: the right answer is e and the choices are a, b, c and d$/m);
  assert.match(refused.stdout, /^q3: unknown-place: back_to names p9, and the reading has no such part$/m);
  assert.match(refused.stderr, /^refused: 2 faults in the quiz, so it is not staged/m);
  // The coverage is the record of the check, so it is written either way.
  assert.equal(JSON.parse(readFileSync(at("coverage.json"), "utf8")).faults.length, 2);

  const missing = run({ QUIZ: "", READING: at("reading.json"), OUT: at("coverage.json") });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^refused: QUIZ, READING and OUT are all required/);
  const gone = run({ ...settings, QUIZ: at("nothing.json") });
  assert.equal(gone.status, 2);
  assert.match(gone.stderr, /^refused: the quiz could not be read/);
  writeFileSync(at("empty.json"), JSON.stringify({ reading: "v1", parts: [] }));
  const empty = run({ ...settings, READING: at("empty.json") });
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /^refused: the reading carries no parts/);
});

// ── the echo: a repeated phrase, not a shared vocabulary ────────────────────
//
// This rule had no test at all, which is how it got to refuse six questions in
// a row on a real article and still look like it was working.

const echoQuiz = (right, wrong) => {
  const q = quiz();
  q.questions = [{
    id: "q1", concept: "c1", form: "choice",
    asks: "A job has started and the buyer's balance has dropped. What has happened to the money?",
    choices: [
      { id: "a", text: right },
      ...wrong.map((text, i) => ({ id: "bcd"[i], text })),
    ],
    answer: "a",
    because: "A hold reserves the money while the job runs.",
    from: "p7", back_to: "p7",
  }];
  q.concepts = [q.concepts[0]];
  return q;
};

test("a right answer lifted word for word from the part is refused", () => {
  // p7 says: "A hold sets the money aside while the job runs."
  const faults = checkQuiz(echoQuiz(
    "A hold sets the money aside while the job runs.",
    ["The seller is paid the moment that the job begins.", "The buyer has asked the platform for a refund.", "The balance the buyer can see is a mistake."],
  ), reading()).faults;
  assert.deepEqual(faults.map((f) => f.fault), ["answer-echoes-the-source"]);
  assert.match(faults[0].says, /repeats \d+ words of p7 in a row/);
});

test("a right answer that says the same thing in its own words is not an echo, however much vocabulary it shares", () => {
  // Every content word here is in p7. None of them run on in the same order,
  // and that is the difference between being about the source and repeating it.
  const faults = checkQuiz(echoQuiz(
    "The job runs first, and the money is only drawn on delivery.",
    ["The seller is paid in full the moment that job begins.", "The buyer has asked the platform for a refund already.", "The balance the buyer can see is simply a mistake here."],
  ), reading()).faults;
  assert.deepEqual(faults.map((f) => f.fault), []);
});

test("when every choice repeats the source about equally, repetition is how the material reads and not a tell", () => {
  const faults = checkQuiz(echoQuiz(
    "A hold sets the money aside while the job runs.",
    [
      "A hold sets the money aside while the job waits.",
      "A hold sets the money aside while the job is priced.",
      "A hold sets the money aside while the job is cancelled.",
    ],
  ), reading()).faults;
  assert.equal(faults.filter((f) => f.fault === "answer-echoes-the-source").length, 0);
});

test("naming what the question is about is never an echo on its own", () => {
  const faults = checkQuiz(echoQuiz(
    "The money is the buyer's.",
    ["The money is the seller's.", "The money is the platform's.", "The money is nobody's."],
  ), reading()).faults;
  assert.equal(faults.filter((f) => f.fault === "answer-echoes-the-source").length, 0);
});

test("the run is counted on content words, so the empty ones cannot pad it out", () => {
  assert.equal(echoRun("the money is set aside", "money is set aside"), 3);
  assert.equal(echoRun("", "money is set aside"), 0);
  assert.equal(echoRun("money is set aside", ""), 0);
  // Four in a row is the floor, and the words in between it counts are the
  // ones that carry meaning.
  assert.ok(echoRun("a hold sets the money aside while the job runs", reading().parts[2].text) >= ECHO_RUN);
});
