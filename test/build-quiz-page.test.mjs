// The page a person opens, answers, and is told how they did on.
//
// What is worth pinning: a quiz of both forms builds one page that asks both;
// the page talks to nothing and keeps nothing, which is the offering's
// refusal and so is checked here rather than trusted; a question somebody
// wrote with markup in it stays text; a missed question sends the person back
// the three ways a place can be named; and a quiz the page could not mark is
// refused by name.
//
// And, since a caller may hand this job a brand profile: that a profile
// CHANGES the page and that every change is one somebody can point at; that a
// field the profile does not carry leaves this agent's own default standing
// and is said back rather than filled in; that a floor the brand's own colors
// cannot reach is admitted rather than met by quietly picking another color;
// and that what spec.json declares this page reads is what it reads.
// Run: node --test test/build-quiz-page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ACCENT_DEFAULT, BRAND_SCHEMA, DEFAULT_TOKENS, READS, backTo, brandFrom, buildQuizPage, contrast, creditOn, usedRecord, viewOf,
} from "../scripts/build-quiz-page.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const builder = join(here, "..", "scripts", "build-quiz-page.mjs");

const choiceQ = (over = {}) => ({
  id: "q1", concept: "c1", form: "choice",
  asks: "A job has started and the buyer's balance has dropped. What has happened to the money?",
  choices: [
    { id: "a", text: "It has been paid to the seller." },
    { id: "b", text: "It has been set aside and not yet taken." },
    { id: "c", text: "It has been refunded." },
    { id: "d", text: "Nothing; the balance is wrong." },
  ],
  answer: "b",
  because: "A hold reserves the money while the job runs, and the draw happens on delivery.",
  from: "p7", back_to: "p7",
  ...over,
});

const writtenQ = (over = {}) => ({
  id: "q2", concept: "c2", form: "written",
  asks: "In your own words, why does the seller name the job and the platform name the amount?",
  answer_text: "The seller knows what work it is doing; only the platform knows the buyer's terms and balance.",
  from: "p3", back_to: "p3",
  ...over,
});

const quizOf = (questions, over = {}) => ({
  quiz: "v1",
  title: "What the Meridian explainer teaches",
  audience: "somebody new to agent pricing",
  made_from: [{ id: "src1", name: "meridian.vtt", address: "https://agentmesh.ai/draft/meridian.html" }],
  places: [
    { id: "p7", source: "src1", place: { kind: "step", value: 7, label: "step 7", fragment: "s7" } },
    { id: "p3", source: "src1", place: { kind: "heading", value: "Naming the amount", label: "Naming the amount" } },
  ],
  concepts: [
    { id: "c1", phrase: "a hold is not a charge", understood: "Money is set aside when the job starts.", taught_at: "p7" },
    { id: "c2", phrase: "who names what", understood: "The seller names the job and the platform names the amount.", taught_at: "p3" },
  ],
  questions,
  ...over,
});

test("a quiz of one choice question and one written one builds a page that asks both", () => {
  const page = buildQuizPage(quizOf([choiceQ(), writtenQ()]), "meridian-quiz");

  assert.match(page, /^<!DOCTYPE html>/);
  assert.ok(page.includes("<title>What the Meridian explainer teaches</title>"));
  assert.ok(page.includes("This quiz is for somebody new to agent pricing."));

  // The choice question: four real radios in one group, each with its own
  // label, and the sentence saying why the answer is the answer.
  assert.ok(page.includes("A job has started and the buyer&#39;s balance has dropped."), "the choice question is asked");
  assert.equal((page.match(/<input type="radio" id="q1-c\d" name="q1" value="[a-d]">/g) ?? []).length, 4);
  assert.equal((page.match(/<label class="choice" for="q1-c\d">/g) ?? []).length, 4);
  assert.match(page, /<legend>[\s\S]*?<span class="asks">A job has started[\s\S]*?<\/legend>/,
    "the question names its group of radios, so reaching them with a keyboard reads the question and not just its number");
  assert.ok(page.includes("Question 1 of 2"));
  assert.ok(page.includes("a hold is not a charge"), "the question names the concept it tests");
  assert.ok(page.includes("A hold reserves the money while the job runs"), "the because sentence is on the page");
  assert.ok(page.includes("The answer is: It has been set aside and not yet taken."));

  // The written one: a box to write in, the answer to aim for, and no claim
  // anywhere that it was marked.
  assert.ok(page.includes('<textarea id="q2-text" rows="5"></textarea>'));
  assert.ok(page.includes("In your own words, why does the seller name the job"));
  assert.ok(page.includes("The answer to aim for"));
  assert.ok(page.includes("only the platform knows the buyer&#39;s terms and balance."));
  assert.ok(page.includes("Nobody marks this one."));
  assert.ok(page.includes("This was not marked and no score was kept for it."));
  assert.ok(page.includes("The written question is not marked."), "the tally says the written one is not marked");

  // How they did, and never a grade.
  assert.ok(page.includes("How you did"));
  assert.ok(page.includes("Concepts to go back over"));
  assert.ok(!/\bgrade\b|\bpassed\b|\bfailed\b|\bscore of\b/i.test(page), "the page grades nobody");
  assert.ok(!page.includes("\u2014"), "no em dashes in anything a person reads");

  // Right and missed are never color on their own.
  assert.ok(page.includes("&#10003;</span> Right"), "the right verdict carries a glyph and the word");
  assert.ok(page.includes("&#10007;</span> Not this one"), "the missed verdict carries a glyph and the word");
  assert.ok(page.includes("\\u2713 this is the answer") && page.includes("\\u2717 you picked this"), "each marked choice is named in words");
});

test("the page talks to nothing and keeps nothing", () => {
  const page = buildQuizPage(quizOf([choiceQ(), writtenQ()]), "meridian-quiz");

  for (const way of ["fetch(", "XMLHttpRequest", "sendBeacon", "navigator.send", "WebSocket", "EventSource",
    "localStorage", "sessionStorage", "indexedDB", "document.cookie", "importScripts", "@import", "dataLayer", "gtag"]) {
    assert.ok(!page.includes(way), `the page uses ${way}`);
  }
  for (const tag of ["<link", "<img", "<iframe", "<object", "<embed", "<video", "<audio", "<source", "<track", "<base", "<form"]) {
    assert.ok(!page.toLowerCase().includes(tag), `the page carries a ${tag}> element, which can ask another host for something`);
  }
  assert.ok(!/\bsrc\s*=/i.test(page), "nothing on the page has a src");
  assert.ok(!/url\(/i.test(page), "the stylesheet asks for nothing from anywhere");
  assert.ok(!/fonts\.(googleapis|gstatic)|@font-face/i.test(page), "the page loads no font");

  // One script, written into the page, with nothing to load.
  const scripts = page.match(/<script\b[^>]*>/g) ?? [];
  assert.deepEqual(scripts, ["<script>"], "there is one script and it comes from nowhere");

  // Every address on the page belongs to a link a person clicks, and there
  // are no other kinds of address at all.
  const hrefs = [...page.matchAll(/<(\w+)\b[^>]*\shref="([^"]*)"/g)];
  assert.ok(hrefs.length > 0, "the missed questions do link back");
  for (const [, tag, href] of hrefs) {
    assert.equal(tag, "a", `only a link carries an href, and a <${tag}> has one`);
    assert.match(href, /^https?:\/\//, `an href that is not a web address: ${href}`);
  }
  // And it says none of it. The page used to carry a panel promising the
  // reader that nothing they typed would leave it, which is the page raising a
  // worry in order to answer it. What makes the promise true is this test and
  // the ones around it, not a sentence on the page.
  for (const said of ["Nothing you type here leaves this page", "nobody is told how you did", "Answer honestly"]) {
    assert.ok(!page.includes(said), `the page explains itself to the reader: ${said}`);
  }
});

test("a question somebody wrote with markup in it stays text", () => {
  const nasty = '<script>alert("gotcha")</script> & <b>bold</b>';
  const page = buildQuizPage(quizOf([
    choiceQ({ asks: nasty, choices: [
      { id: "a", text: `it runs ${nasty}` },
      { id: "b", text: "it is shown as words" },
      { id: "c", text: "nothing" },
      { id: "d", text: "the page breaks" },
    ], answer: "b", because: `because ${nasty} is text` }),
    writtenQ({ answer_text: nasty }),
  ], { title: nasty, audience: nasty }), "meridian-quiz");

  assert.ok(!page.includes("<script>alert"), "a question became markup");
  assert.ok(!page.includes("<b>bold</b>"), "a question became markup");
  assert.ok(page.includes("&lt;script&gt;alert(&quot;gotcha&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;"));
  assert.deepEqual(page.match(/<script\b[^>]*>/g), ["<script>"], "the page still carries exactly its own one script");
  assert.equal((page.match(/<\/script>/g) ?? []).length, 1);
});

test("a missed question sends the person back the three ways a place can be named", () => {
  // An address and a fragment: straight to the place in the source.
  const deep = quizOf([choiceQ({ back_to: "p7" })]);
  assert.deepEqual(backTo(deep, deep.questions[0]), { label: "step 7", href: "https://agentmesh.ai/draft/meridian.html#s7" });
  assert.ok(buildQuizPage(deep, "quiz").includes('<p class="back">Go back over this at <a href="https://agentmesh.ai/draft/meridian.html#s7">step 7</a>.</p>'));

  // An address and no fragment: the source itself.
  const whole = quizOf([choiceQ({ back_to: "p3" })]);
  assert.deepEqual(backTo(whole, whole.questions[0]), { label: "Naming the amount", href: "https://agentmesh.ai/draft/meridian.html" });
  assert.ok(buildQuizPage(whole, "quiz").includes('<p class="back">Go back over this at <a href="https://agentmesh.ai/draft/meridian.html">Naming the amount</a>.</p>'));

  // No address: the place is named and there is nowhere to send anybody.
  const notes = quizOf([choiceQ({ back_to: "p1" })], {
    made_from: [{ id: "src2", name: "the notes" }],
    places: [{ id: "p1", source: "src2", place: { kind: "note", label: "the notes" } }],
  });
  assert.deepEqual(backTo(notes, notes.questions[0]), { label: "the notes", href: null });
  const page = buildQuizPage(notes, "quiz");
  assert.ok(page.includes('<p class="back">Go back over this at the notes.</p>'));
  assert.ok(!page.includes("<a href"), "a place with no address was linked anyway");

  // A place the quiz does not carry invents nothing.
  const nowhere = quizOf([choiceQ({ back_to: "p9" })]);
  assert.equal(backTo(nowhere, nowhere.questions[0]), null);
  assert.ok(!buildQuizPage(nowhere, "quiz").includes('class="back"'));

  // A written question names where the concept is taught rather than telling
  // somebody they got it wrong, because nothing marked it.
  assert.ok(buildQuizPage(quizOf([writtenQ()]), "quiz")
    .includes('<p class="back">Where this is taught: <a href="https://agentmesh.ai/draft/meridian.html">Naming the amount</a>.</p>'));

  // An address that is not a web address never becomes a link.
  const bad = quizOf([choiceQ({ back_to: "p7" })], {
    made_from: [{ id: "src1", name: "meridian.vtt", address: "javascript:alert(1)" }],
  });
  assert.throws(() => buildQuizPage(bad, "quiz"), /is not a web address/);
});

test("the places come from the reading, which is where they are written", () => {
  // A quiz in the shape write-the-questions writes carries the part ids and
  // not the parts, so the reading is what turns a missed question into a
  // place to go back to. This is the same file check-quiz.mjs reads beside
  // the quiz.
  const quiz = quizOf([choiceQ({ back_to: "p4" }), writtenQ({ back_to: "p5" })], { places: undefined, made_from: [{ id: "src1", name: "meridian.vtt" }] });
  delete quiz.places;
  const reading = {
    reading: "v1",
    sources: [{ id: "src1", kind: "transcript", name: "meridian.vtt", address: "https://agentmesh.ai/draft/meridian.html" }],
    parts: [
      { id: "p4", source: "src1", place: { kind: "time", value: 83, label: "at 1:23", fragment: "t=83" }, text: "the words of the part" },
      { id: "p5", source: "src1", place: { kind: "heading", value: "Naming the amount", label: "Naming the amount" }, text: "more words" },
    ],
  };

  assert.equal(backTo(quiz, quiz.questions[0]), null, "without the reading there is no place, and none is invented");
  assert.deepEqual(backTo(quiz, quiz.questions[0], reading), { label: "at 1:23", href: "https://agentmesh.ai/draft/meridian.html#t=83" });

  const page = buildQuizPage(quiz, "meridian-quiz", reading);
  assert.ok(page.includes('<p class="back">Go back over this at <a href="https://agentmesh.ai/draft/meridian.html#t=83">at 1:23</a>.</p>'));
  assert.ok(page.includes('<p class="back">Where this is taught: <a href="https://agentmesh.ai/draft/meridian.html">Naming the amount</a>.</p>'));
  assert.ok(!buildQuizPage(quiz, "meridian-quiz").includes('class="back"'), "built without the reading, the page still asks every question and claims no place");
});

test("the sample the other steps wrote builds a page", () => {
  const quiz = JSON.parse(readFileSync(join(here, "..", "sample", "quiz.json"), "utf8"));
  const reading = JSON.parse(readFileSync(join(here, "..", "sample", "reading.json"), "utf8"));
  const page = buildQuizPage(quiz, "funds-hold-quiz", reading);
  const choice = quiz.questions.filter((q) => q.form === "choice").length;
  assert.equal((page.match(/data-form="choice"/g) ?? []).length, choice);
  assert.equal((page.match(/data-form="written"/g) ?? []).length, quiz.questions.length - choice);
  // The sample's source is a document with no web address, so every place is
  // named and none is linked. That is the third shape, in the real file.
  assert.equal((page.match(/<p class="back">/g) ?? []).length, choice * 2 + (quiz.questions.length - choice),
    "every question names its place, and a missed choice names it again in the summary");
  assert.ok(!page.includes("<a href"), "a document with no address was linked anyway");
});

// ── one question at a time, which is how a quiz is taken ────────────────────

test("a quiz that says nothing about it is shown one question at a time", () => {
  const page = buildQuizPage(quizOf([choiceQ(), writtenQ()]), "meridian-quiz");
  assert.equal(viewOf({}), "one-at-a-time", "the quiz that says nothing gets the progression");
  assert.ok(page.includes('<main data-view="one-at-a-time">'), "the page does not say how it shows its questions");

  // The way forward and back, and nothing else to press.
  assert.match(page, /<nav class="nav" id="nav" aria-label="Moving through the questions" hidden>/);
  assert.ok(page.includes('<button type="button" id="back" hidden>Back</button>'), "a person cannot go back");
  assert.ok(page.includes('<button type="button" id="next" class="next">Next question</button>'));
  assert.ok(page.includes("See how you did"), "the last question's way on does not say where it goes");

  // Every question is in the page and none of them is hidden in the markup,
  // so a browser with scripting turned off shows the whole quiz rather than
  // one question and no way to reach the rest. The hiding is the script's.
  assert.equal((page.match(/<li class="q" id="q\d" data-question/g) ?? []).length, 2);
  assert.ok(!/<li class="q"[^>]*\bhidden\b/.test(page), "a question was hidden in the markup, so scripting off hides the quiz");
  assert.ok(!/<section class="summary"[^>]*\bhidden\b/.test(page));
  assert.ok(page.includes("The questions are all readable as they are."), "the promise made to a browser with no scripting");
  assert.ok(page.includes('nav.hidden = false'), "the buttons only appear once the script that works them has taken over");

  // Where a person is, which is the line each question already carries, and
  // the tally waiting at the end of the progression rather than under it.
  assert.ok(page.includes("Question 1 of 2") && page.includes("Question 2 of 2"));
  assert.match(page, /const steps = nav \? \[\.\.\.questions, document\.getElementById\("summary"\)\]/,
    "how you did is the step the progression arrives at");

  // Every step can take focus, and moving puts focus on the step it moved to.
  // A progression that hides the question the person was standing in and
  // leaves focus on the body is a page a keyboard cannot get back into.
  assert.equal((page.match(/<li class="q"[^>]*tabindex="-1"/g) ?? []).length, 2);
  assert.match(page, /<section class="summary"[^>]*tabindex="-1"/);
  assert.ok(page.includes("steps[at].focus({ preventScroll: true });"), "moving leaves focus nowhere");
});

test("a quiz that asks for all of them on one page gets that, and the page is otherwise the same page", () => {
  const long = buildQuizPage(quizOf([choiceQ(), writtenQ()], { view: "all-at-once" }), "meridian-quiz");
  assert.equal(viewOf({ view: "all-at-once" }), "all-at-once");
  assert.ok(long.includes('<main data-view="all-at-once">'));
  assert.ok(!long.includes("<nav"), "a page with every question on it carries a way to step through it");
  assert.ok(!long.includes('id="next"') && !long.includes('id="back"'), "there are buttons on it with nothing to do");
  assert.equal((long.match(/<li class="q" id="q\d" data-question/g) ?? []).length, 2, "the questions are the same questions");
  assert.ok(long.includes("How you did"), "the tally is on the page either way");

  // The difference between the two is the way forward and back and the word
  // that names the view. The questions, the marking and the tally are one
  // page built one way.
  const stepping = buildQuizPage(quizOf([choiceQ(), writtenQ()]), "meridian-quiz");
  const stripped = stepping
    .replace(/ {2}<nav class="nav"[\s\S]*?<\/nav>\n/, "")
    .replace('<main data-view="one-at-a-time">', '<main data-view="all-at-once">');
  assert.equal(stripped, long, "showing a quiz one question at a time changed something that is not the way through it");

  // A third word is refused by name rather than read as the default, so a
  // quiz asking for something this page does not do hears about it.
  assert.throws(() => buildQuizPage(quizOf([choiceQ()], { view: "one at a time" }), "quiz"),
    /the quiz asks to be shown one at a time, and the two ways a quiz is shown are one-at-a-time and all-at-once/);
  assert.throws(() => viewOf({ view: "grid" }), /one-at-a-time and all-at-once/);
});

// ── the footer, which is the host's decision and not the quiz's ─────────────

test("the Built by AgentMesh footer is off unless the host has said otherwise", () => {
  // Off is what a page gets when nobody said anything, because the page
  // belongs to whoever asked for the quiz.
  assert.equal(creditOn({}), false);
  assert.equal(creditOn({ QUIZ_CREDIT: "" }), false);
  assert.equal(creditOn({ QUIZ_CREDIT: "   " }), false);
  for (const said of ["off", "OFF", "no", "false", "0", "none"]) assert.equal(creditOn({ QUIZ_CREDIT: said }), false, `${said} left the credit on`);
  // And a value nobody recognises leaves it ON: a host that typed the variable
  // at all meant the credit to be there, and a typo must never quietly strip
  // a credit off a page.
  for (const said of ["on", "ON", "yes", "1", "yes please"]) assert.equal(creditOn({ QUIZ_CREDIT: said }), true, `${said} took the credit off`);

  const bare = buildQuizPage(quizOf([choiceQ(), writtenQ()]), "meridian-quiz");
  assert.ok(!bare.includes("Built by"), "the footer was carried by a page nobody asked to carry it");
  assert.ok(!bare.includes('href="https://agentmesh.ai"'), "this agent named itself on a page that did not ask for it");

  const credited = buildQuizPage(quizOf([choiceQ(), writtenQ()]), "meridian-quiz", undefined, null, { credit: true });
  assert.ok(credited.includes('<footer class="credit">\n  <p>Built by <a href="https://agentmesh.ai">AgentMesh</a>.</p>\n</footer>'));
  assert.equal(bare, credited.replace(/\n<footer class="credit">[\s\S]*?<\/footer>\n/, ""), "the credit changed something other than the footer");

  // The footer asks nothing of anybody. It is words and one link a person can
  // follow, which is the whole of what it is allowed to be.
  for (const tag of ["<link", "<img", "<iframe", "<object", "<embed", "<video", "<audio", "<source", "<track", "<base", "<form"]) {
    assert.ok(!credited.toLowerCase().includes(tag), `the footer carries a ${tag}> element`);
  }
  assert.ok(!/\bsrc\s*=/i.test(credited) && !/url\(/i.test(credited), "the footer asks another host for something");
  assert.deepEqual(credited.match(/<script\b[^>]*>/g), ["<script>"]);
  for (const [, tag, href] of credited.matchAll(/<(\w+)\b[^>]*\shref="([^"]*)"/g)) {
    assert.equal(tag, "a");
    assert.match(href, /^https?:\/\//);
  }
  assert.ok(!credited.includes("—"), "no em dashes in anything a person reads");
});

test("a quiz the page could not mark is refused, and the refusal names the question", () => {
  assert.throws(() => buildQuizPage(quizOf([choiceQ({ answer: "z" })]), "quiz"), /question 1 names an answer that is not one of its choices/);
  assert.throws(() => buildQuizPage(quizOf([choiceQ({ choices: choiceQ().choices.slice(0, 3) })]), "quiz"), /question 1 is a choice question with 3 choices/);
  assert.throws(() => buildQuizPage(quizOf([choiceQ({ because: "  " })]), "quiz"), /question 1 does not say why its answer is the right one/);
  assert.throws(() => buildQuizPage(quizOf([choiceQ(), writtenQ({ answer_text: "" })]), "quiz"), /question 2 is a written question with no answer to aim for/, "a question is named by where it sits in the quiz");
  assert.throws(() => buildQuizPage(quizOf([writtenQ({ answer_text: "" })]), "quiz"), /question 1 is a written question with no answer to aim for/);
  assert.throws(() => buildQuizPage(quizOf([{ id: "q1", form: "essay", asks: "why" }]), "quiz"), /neither a choice question nor a written one: it calls itself essay/);
  assert.throws(() => buildQuizPage(quizOf([]), "quiz"), /carries no questions/);
  assert.throws(() => buildQuizPage(quizOf([choiceQ()]), "Meridian Quiz"), /must be a lowercase slug/);
  assert.throws(() => buildQuizPage(quizOf([choiceQ()], { accent: "blue" }), "quiz"), /six digit hex color/);
});

test("from the shell, it builds the page and refuses out loud", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiz-page-"));
  try {
    const quizPath = join(dir, "quiz.json");
    const out = join(dir, "page.html");
    writeFileSync(quizPath, JSON.stringify(quizOf([choiceQ(), writtenQ()]), null, 2));
    const env = { ...process.env, QUIZ: quizPath, OUT: out, NAME: "meridian-quiz" };
    const r = spawnSync(process.execPath, [builder], { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /2 questions, 1 of them marked in the browser, 1 written and not marked, shown one question at a time/);
    assert.ok(!r.stdout.includes("footer"), "the credit is off and the line says nothing about it");
    assert.ok(readFileSync(out, "utf8").includes("<title>What the Meridian explainer teaches</title>"));
    assert.ok(!readFileSync(out, "utf8").includes("Built by"));

    // The footer is the host's variable, the same shape the explainer's credit
    // follows, and the line says when it went on.
    const credited = spawnSync(process.execPath, [builder], { env: { ...env, QUIZ_CREDIT: "on" }, encoding: "utf8" });
    assert.equal(credited.status, 0, credited.stderr);
    assert.match(credited.stdout, /with the Built by AgentMesh footer/);
    assert.ok(readFileSync(out, "utf8").includes('Built by <a href="https://agentmesh.ai">AgentMesh</a>.'));

    writeFileSync(quizPath, JSON.stringify(quizOf([choiceQ({ answer: "z" })]), null, 2));
    const bad = spawnSync(process.execPath, [builder], { env, encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^refused: question 1 names an answer that is not one of its choices/);

    const missing = spawnSync(process.execPath, [builder], { env: { ...process.env, QUIZ: quizPath }, encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /^refused: QUIZ, OUT and NAME are required/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the brand profile a caller handed the job ───────────────────────────────
//
// One filled profile, the same one the shape is worked through with, because a
// profile that states everything is the one where a page that honors nothing
// and a page that honors all of it look different.

const MERIDIAN = () => ({
  brand_profile: "v1",
  name: "Meridian Analytics",
  owner: "meridian.example.com",
  updated: "2026-09-12",
  palette: {
    ink: "#101317", ground: "#FFFFFF", heading: "#1C3C3C", link: "#0B5FD0", button: "#1C3C3C",
    primary: "#1F6FEB", on_primary: "#FFFFFF",
    accent: "#E9C46A", contrast_floor: "AAA", never_hue_alone: true,
  },
  type: {
    heading: { family: "Space Grotesk", fallback: "system-ui, sans-serif", weight: 700 },
    body: { family: "IBM Plex Sans", fallback: "system-ui, sans-serif", weight: 400 },
    mono: null,
  },
  logo: { mark: { href: "https://meridian.example.com/brand/mark.svg" }, never: ["recolor the mark"] },
  voice: { narration: "en-GB, low, unhurried" },
  words: { never_say: ["cutting edge"], sentences: "short" },
  legal: { credit: "Made with Meridian" },
});

const valueAt = (o, path) => path.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), o);
// Everything outside the stylesheet, so two pages can be compared on the part
// a profile has no business touching.
const outsideTheStyles = (page) => page.replace(/<style>[\s\S]*?<\/style>/, "<style/>");

test("the same quiz with a profile and without it is two different pages, and every difference is the brand's", () => {
  const quiz = quizOf([choiceQ(), writtenQ()]);
  const plain = buildQuizPage(quiz, "meridian-quiz");
  const brand = brandFrom(MERIDIAN());
  const branded = buildQuizPage(quiz, "meridian-quiz", undefined, brand);

  assert.notEqual(plain, branded, "a profile that changes nothing is a profile nobody can check");

  // Every field the record calls applied is a difference on the page somebody
  // can point at, and one that is not there without the profile.
  const shows = {
    "palette.ground": "--ground:#FFFFFF",
    "palette.ink": "--ink:#101317",
    "palette.accent": "--accent:#E9C46A",
    "type.body.family": '--body:"IBM Plex Sans"',
    "type.body.fallback": '--body:"IBM Plex Sans", system-ui, sans-serif',
    "type.heading.family": 'h1{ font-family:"Space Grotesk"',
    "type.heading.fallback": '"Space Grotesk", system-ui, sans-serif',
    "type.heading.weight": "font-weight:700",
  };
  for (const [field, said] of Object.entries(shows)) {
    assert.ok(brand.applied.includes(field), `${field} is not in the record of what was applied`);
    assert.ok(branded.includes(said), `${field} never reached the page: ${said}`);
    assert.ok(!plain.includes(said), `${said} was on the page with no profile at all`);
  }
  assert.deepEqual(brand.applied, [
    "palette.ink", "palette.ground", "palette.heading", "palette.link", "palette.button",
    "palette.accent", "palette.never_hue_alone",
    "type.heading.family", "type.heading.fallback", "type.heading.weight",
    "type.body.family", "type.body.fallback",
  ]);

  // The panels, the rules and the two quieter greys moved with the pair, and
  // none of them is a color the profile ever stated.
  for (const derived of ["--panel:", "--line:", "--dim:"]) {
    const said = (page) => page.split("\n").find((l) => l.includes(derived));
    assert.notEqual(said(plain), said(branded), `${derived} did not move with the ground and the ink`);
  }
  assert.ok(!branded.includes("#1F6FEB"), "the primary is not a field this page reads, and it went nowhere");

  // And the two are otherwise the same page: the questions, the words a person
  // reads and the behaviour are untouched.
  assert.equal(outsideTheStyles(plain), outsideTheStyles(branded), "the profile changed something that is not the stylesheet");
});

test("a floor the brand's own colors do not reach is admitted, and no color is quietly changed to meet it", () => {
  const brand = brandFrom(MERIDIAN());
  assert.ok(!brand.applied.includes("palette.contrast_floor"));
  assert.equal(brand.not_applied.length, 1, "there is one honest thing to say and it is said once");
  const [only] = brand.not_applied;
  assert.equal(only.field, "palette.contrast_floor");
  assert.match(only.why, /asks for AAA, which is 7 to 1/);
  assert.match(only.why, /the accent on the ground reaches 1\.6 to 1/);
  assert.match(only.why, /picking a different one would be a brand decision/);
  assert.ok(!/—/.test(only.why), "an em dash reached something a person reads");

  // The accent it could not vouch for is on the page all the same, exactly as
  // the profile wrote it. Admitting the floor and substituting a color are two
  // different answers and only one of them is honest.
  assert.equal(brand.tokens.accent, "#E9C46A");
  assert.ok(buildQuizPage(quizOf([choiceQ()]), "q", undefined, brand).includes("--accent:#E9C46A"));

  // A floor the page does reach is applied, and there is nothing to admit.
  const darker = MERIDIAN();
  darker.palette.accent = "#6A4A05";
  assert.ok(contrast("#6A4A05", "#FFFFFF") >= 7);
  const met = brandFrom(darker);
  assert.ok(met.applied.includes("palette.contrast_floor"));
  assert.deepEqual(met.not_applied, []);

  // A floor asked of this agent's own colors is checked against those, since
  // the page as built is what a floor is about.
  const bare = brandFrom({ brand_profile: "v1", palette: { contrast_floor: "AAA" } });
  assert.deepEqual(bare.applied, ["palette.contrast_floor"]);
  assert.deepEqual(bare.not_applied, []);
});

test("the ground and the ink are one pair, and a profile that states one of them colors nothing", () => {
  const half = MERIDIAN();
  delete half.palette.ink;
  const brand = brandFrom(half);

  assert.equal(brand.tokens.ground, DEFAULT_TOKENS.ground, "a ground with no ink beside it was taken anyway");
  assert.equal(brand.tokens.ink, DEFAULT_TOKENS.ink);
  assert.ok(!brand.applied.includes("palette.ground"));
  assert.ok(brand.not_present.includes("palette.ink"), "the profile's own silence is said back");
  const said = brand.not_applied.find((n) => n.field === "palette.ground");
  assert.match(said.why, /one pair/);
  assert.match(said.why, /states no ink/);
  assert.ok(buildQuizPage(quizOf([choiceQ()]), "q", undefined, brand).includes(`--ground:${DEFAULT_TOKENS.ground}`));
});

test("a profile's silence is said back rather than filled in", () => {
  const thin = { brand_profile: "v1", name: "Thin", palette: { accent: "#1F6FEB" } };
  const brand = brandFrom(thin);
  assert.deepEqual(brand.applied, ["palette.accent"]);
  assert.deepEqual(brand.not_applied, []);
  assert.deepEqual(brand.not_present, READS.filter((p) => p !== "palette.accent"));
  // Nothing was invented to stand in for what it did not say.
  assert.equal(brand.tokens.body, DEFAULT_TOKENS.body);
  assert.equal(brand.tokens.head, null);
  assert.equal(brand.tokens.ground, DEFAULT_TOKENS.ground);
  assert.equal(brandFrom(null).not_present.length, READS.length);
  assert.deepEqual(usedRecord(brandFrom(thin)), {
    used: "v1", schema: BRAND_SCHEMA, applied: ["palette.accent"],
    not_present: READS.filter((p) => p !== "palette.accent"), not_applied: [], not_read: [],
  });
});

test("a value that is not the thing it says it is goes in the record, never on the page", () => {
  const wrong = MERIDIAN();
  wrong.palette.accent = "rebeccapurple";
  wrong.palette.contrast_floor = "AAAA";
  wrong.type.heading.weight = 9000;
  wrong.type.heading.family = "x; } body { background:url(https://evil.test/p.png) } h1 {";
  wrong.type.body.fallback = "system-ui; } @import url(https://evil.test/x.css); p {";
  const brand = brandFrom(wrong);
  const why = Object.fromEntries(brand.not_applied.map((n) => [n.field, n.why]));

  assert.match(why["palette.accent"], /not a six digit hex color/);
  assert.match(why["palette.contrast_floor"], /allows AA or AAA/);
  assert.match(why["type.heading.weight"], /whole number from 1 to 1000/);
  assert.match(why["type.heading.family"], /letters, digits, spaces, hyphens and underscores/);
  assert.match(why["type.heading.fallback"], /the heading family this fallback completes could not be used/,
    "a fallback whose family was refused is told apart from one the profile never gave a family");
  assert.match(why["type.body.fallback"], /the rest of the stack as CSS would write it/);
  assert.match(brandFrom({ brand_profile: "v1", type: { body: { fallback: "system-ui, sans-serif" } } })
    .not_applied.find((n) => n.field === "type.body.fallback").why, /names no body family to begin one/);
  // A bad value is not the profile's silence, and is never reported as it.
  for (const field of Object.keys(why)) assert.ok(!brand.not_present.includes(field), `${field} was called absent when it was there and wrong`);

  const page = buildQuizPage(quizOf([choiceQ()]), "q", undefined, brand);
  assert.ok(!page.includes("evil.test"), "a caller wrote CSS into a font name and it reached the page");
  assert.ok(!/url\(/i.test(page), "the stylesheet asks for something from somewhere");
  assert.ok(!/@import/i.test(page));
  assert.equal(page.includes("--accent:#E9C46A"), false);
  assert.ok(page.includes(`--accent:${ACCENT_DEFAULT}`), "this agent's own accent stands where the profile's could not be read");
  // The body family was fine and only its fallback was not, so the family
  // stands on this agent's own stack rather than being thrown out with it.
  assert.ok(page.includes('--body:"IBM Plex Sans", system-ui'));
});

test("meaning is never carried by color alone, whatever a profile says about it", () => {
  const both = ["&#10003;</span> Right", "&#10007;</span> Not this one"];
  for (const page of [
    buildQuizPage(quizOf([choiceQ()]), "q"),
    buildQuizPage(quizOf([choiceQ()]), "q", undefined, brandFrom(MERIDIAN())),
  ]) for (const said of both) assert.ok(page.includes(said), `a verdict lost its word or its glyph: ${said}`);

  assert.ok(brandFrom(MERIDIAN()).applied.includes("palette.never_hue_alone"));

  // A profile saying false does not loosen it, and the record says so rather
  // than claiming the field was honored.
  const loose = MERIDIAN();
  loose.palette.never_hue_alone = false;
  const brand = brandFrom(loose);
  assert.ok(!brand.applied.includes("palette.never_hue_alone"));
  assert.match(brand.not_applied.find((n) => n.field === "palette.never_hue_alone").why, /word and a glyph/);
  for (const said of both) assert.ok(buildQuizPage(quizOf([choiceQ()]), "q", undefined, brand).includes(said));
});

test("a quiz that names its own accent keeps it, and the profile's is said back rather than lost", () => {
  const quiz = quizOf([choiceQ()], { accent: "#123456" });
  const brand = brandFrom(MERIDIAN(), { quizAccent: quiz.accent });
  assert.ok(!brand.applied.includes("palette.accent"));
  assert.match(brand.not_applied.find((n) => n.field === "palette.accent").why, /names an accent of its own/);
  assert.ok(buildQuizPage(quiz, "q", undefined, brand).includes("--accent:#123456"));
  // And the floor is then checked against the accent the page actually
  // carries rather than the one that was offered: this quiz's own accent
  // reaches AAA on the brand's ground where the profile's own did not.
  assert.ok(contrast("#123456", "#FFFFFF") >= 7);
  assert.ok(brand.applied.includes("palette.contrast_floor"));
  assert.deepEqual(brand.not_applied.map((n) => n.field), ["palette.accent"]);
});

test("what spec.json declares this page reads is what it reads, field for field", () => {
  const spec = JSON.parse(readFileSync(join(here, "..", "spec.json"), "utf8"));
  const declared = (spec.can_use ?? []).find((c) => c.schema === BRAND_SCHEMA);
  assert.ok(declared, "the package declares no brand profile at all");
  assert.equal(declared.required, false, "a profile is context and never a condition of doing the work");
  assert.deepEqual(declared.reads, READS,
    "a declaration that claims more fields than the page reads is the exact failure a field list exists to prevent");
  // Every declared field is a real one: a path with a typo in it would sit in
  // not_present forever and nobody would ever know it was never read.
  for (const path of READS) assert.notEqual(valueAt(MERIDIAN(), path), undefined, `${path} is not a field of this shape`);
  assert.ok(!/—/.test(declared.does), "an em dash reached something a buyer reads");
});
