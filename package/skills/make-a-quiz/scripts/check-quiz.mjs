// Check the questions before anything is staged: every mechanical fault at
// once, and the coverage record beside them.
//   needs: node >= 22; it opens the two files it is given and nothing else
//   QUIZ=records/<job>/quiz.json READING=records/<job>/reading.json OUT=records/<job>/coverage.json node check-quiz.mjs
// Writes coverage.json in the shape references/shapes.md gives: every concept
// with the questions that test it or the reason it was left, every fault, and
// the seven lines saying what was checked. Every fault is printed on its own
// line and a quiz carrying one is not staged, so one rewrite fixes them
// together.
// Exit: 0 nothing wrong; 1 the quiz carries faults; 2 the settings or the
// files are not there.
//
// The fault names are the closed set in shapes.md and nothing else is named.
// Two readings this script settles, because shapes.md leaves them open: a
// required field that is missing (no asks, no concept, no from, no back_to,
// no id) is wrong-form, because the shape itself is wrong; a field that names
// something the reading or the concept list does not carry is unknown-place
// or unknown-concept, because the shape is right and the name is not.
//
// What it cannot do: judge whether two choices mean the same thing. It
// compares text with the punctuation and the articles taken out, so it finds
// the same sentence written twice and never a synonym. Two choices that say
// one thing in two vocabularies are for a reader to catch, and this says so
// rather than implying it looked.
import { readFileSync, writeFileSync } from "node:fs";

// The closed set. A quiz carrying any of these is not staged.
export const FAULTS = [
  "answer-not-a-choice",
  "unknown-concept",
  "unknown-place",
  "answer-is-longest-choice",
  "answer-echoes-the-source",
  "same-choice-twice",
  "all-of-the-above",
  "double-negative",
  "wrong-form",
];

// The seven lines the coverage record carries, word for word from shapes.md.
export const CHECKED_BY_SCRIPT = [
  "every right answer is among that question's choices",
  "every question names a concept the list carries",
  "every place cited exists in the reading",
  "no right answer is a fifth longer than the next longest",
  "no two choices in a question mean the same thing",
  "no choice reads all of the above or none of the above",
  "no question carries two negations",
  "no right answer is built from the source's own words far more than the others are",
];

export const CHOICE_IDS = ["a", "b", "c", "d"];

// How much longer the right answer may be than the next longest before it
// gives the question away. A fifth: a reader sees "that one is fuller than the
// others", not two characters.
export const ANSWER_LENGTH_MARGIN = 1.2;

// The words that carry no subject and so cannot make an answer look like its
// source. Short on purpose: a longer list starts deciding what a question is
// about, and the point here is only to stop "the" and "of" from counting as
// resemblance.
export const EMPTY_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could", "do", "does", "for",
  "from", "had", "has", "have", "how", "in", "into", "is", "it", "its", "may", "must", "not", "of",
  "on", "only", "or", "our", "out", "over", "should", "so", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "to", "up", "was", "were", "what", "when", "which",
  "while", "who", "will", "with", "would", "you", "your",
]);

// An echo is a repeated phrase, and this measures one: the longest run of
// words the right answer and the source say in the same order.
//
// It used to count shared words rather than shared phrasing, as a fraction of
// the right answer built from words the source part uses. That measures what
// the answer is ABOUT, not whether it was lifted. On a technical article every
// honest answer is 50 to 70 percent the source's vocabulary, because the
// vocabulary is the subject; the wrong choices, being wrong, say different
// things and so score lower; and the right answer was refused for being
// correct. A real run with a strong model was refused six times over on the
// same measure, rewrote every one of them, and was refused again. What a
// reader actually recognises is a run of words they have just read, so that is
// what is counted.
//
// Four content words in a row, the empty ones already dropped, so the run is
// four words that carry meaning and not "of the and in". The margin is against
// the nearest wrong choice: when the wrong choices repeat the source about as
// much as the right one does, repetition is how the material is written and
// not a tell. When they repeat none of it and the right answer repeats a
// phrase, the question can be answered by matching.
export const ECHO_RUN = 4;
export const ECHO_MARGIN = 1.4;

// The negation words, counted and no others. No un- or non- prefixes: a
// script cannot tell "unless" and "nonsense" from a negation, and guessing
// would refuse questions that are fine.
export const NEGATIONS = ["not", "never", "no", "none", "cannot", "can't", "don't", "doesn't", "isn't", "aren't", "won't", "without", "neither", "nor"];
const NEGATION_RE = new RegExp(`\\b(?:${NEGATIONS.join("|")})\\b`, "g");
const CURLY = /[‘’ʼ]/g;

const PLACE_WORDS = { from: "where its answer came from", back_to: "where to go back to" };

/** Text with the case, the punctuation and the articles a, an and the taken
 *  out, and the spaces collapsed. Two choices are the same when this is the
 *  same; it is equality of words, never of meaning. */
/** The text of the part a question cites, or "" when it cites none we have. */
export const partText = (reading, id) => {
  const want = typeof id === "string" ? id.trim() : "";
  if (!want) return "";
  const part = (Array.isArray(reading?.parts) ? reading.parts : []).find((p) => (typeof p?.id === "string" ? p.id.trim() : "") === want);
  return typeof part?.text === "string" ? part.text : "";
};

/** The content words of a string, lowercased, with the empty ones dropped. */
export const contentWords = (text) => String(text ?? "").toLowerCase()
  .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !EMPTY_WORDS.has(w));

/** The longest run of content words a choice and a source part say in the same
 *  order. Zero when they share no run at all.
 *
 *  The concept's own name is not taken out any more, and does not need to be:
 *  a name is one or two words and the floor is four, so saying the subject of
 *  the question cannot on its own be an echo. Repeating four words of the
 *  source in a row is a different thing from naming what the question is
 *  about, and this is the measure that can tell them apart. */
export function echoRun(choice, sourceText) {
  const mine = contentWords(choice);
  const source = contentWords(sourceText);
  if (!mine.length || !source.length) return 0;
  let longest = 0;
  let above = new Array(source.length + 1).fill(0);
  for (let i = 1; i <= mine.length; i += 1) {
    const row = new Array(source.length + 1).fill(0);
    for (let j = 1; j <= source.length; j += 1) {
      if (mine[i - 1] !== source[j - 1]) continue;
      row[j] = above[j - 1] + 1;
      if (row[j] > longest) longest = row[j];
    }
    above = row;
  }
  return longest;
}

export function normalise(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(CURLY, "")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ABOVE = new Set([normalise("all of the above"), normalise("none of the above")]);

/** The negation words in a text, as it says them and in the order it says
 *  them. Two or more in one question is the fault. */
export function negations(text) {
  const said = String(text ?? "").toLowerCase().replace(CURLY, "'");
  return [...said.matchAll(NEGATION_RE)].map((m) => m[0]);
}

const list = (xs) => (xs.length < 2 ? String(xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const plain = (v) => (typeof v === "string" ? v.trim() : "");
const quoted = (xs) => list(xs.map((x) => `"${x}"`));
const labelled = (id, i, word) => id || `${word} ${i + 1}`;

/** Every fault in a quiz, and the coverage record that goes beside it.
 *  Pure: it reads no file and writes none. The reading is there for the
 *  places a question cites; a reading with no parts would leave every place
 *  unknown, which is why the command refuses one before it gets here. */
export function checkQuiz(quiz, reading) {
  const faults = [];
  const add = (where, fault, says) => faults.push({ ...where, fault, says });
  const concepts = Array.isArray(quiz?.concepts) ? quiz.concepts : [];
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const places = new Set((Array.isArray(reading?.parts) ? reading.parts : []).map((p) => plain(p?.id)).filter(Boolean));

  // The concept list first. An id carried twice means a question naming it
  // cannot say which concept it tests.
  const conceptIds = new Set();
  concepts.forEach((c, i) => {
    const id = labelled(plain(c?.id), i, "concept");
    if (!plain(c?.id)) add({ concept: id }, "wrong-form", "the concept has no id, and every question cites its concept by id");
    else if (conceptIds.has(id)) add({ concept: id }, "wrong-form", `a second concept is also called ${id}, so a question naming it cannot say which one it tests`);
    conceptIds.add(id);
  });

  // Then every question, with all of its faults rather than its first.
  const questionIds = new Set();
  questions.forEach((q, i) => {
    const id = labelled(plain(q?.id), i, "question");
    const at = { question: id };
    if (!plain(q?.id)) add(at, "wrong-form", "the question has no id, and the coverage record names its questions by id");
    else if (questionIds.has(id)) add(at, "wrong-form", `a second question is also called ${id}`);
    questionIds.add(id);

    const asks = plain(q?.asks);
    if (!asks) add(at, "wrong-form", "the question asks nothing");

    const concept = plain(q?.concept);
    if (!concept) add(at, "wrong-form", "the question names no concept, so nothing says what it tests");
    else if (!conceptIds.has(concept)) add(at, "unknown-concept", `the question tests ${concept} and the quiz's concept list does not carry it`);

    const missing = [];
    const unknown = [];
    for (const field of ["from", "back_to"]) {
      const place = plain(q?.[field]);
      if (!place) missing.push(field);
      else if (!places.has(place)) unknown.push(`${field} names ${place}`);
    }
    if (missing.length) add(at, "wrong-form", `the question does not say ${list(missing.map((f) => PLACE_WORDS[f]))}`);
    if (unknown.length) add(at, "unknown-place", `${list(unknown)}, and the reading has no such part`);

    const form = plain(q?.form);
    const choices = Array.isArray(q?.choices) ? q.choices : null;
    if (form === "choice") checkChoice(q, at, choices, add, reading, concepts);
    else if (form === "written") {
      if (choices && choices.length) add(at, "wrong-form", "the written question carries choices, and a written question is answered in the person's own words");
      if (!plain(q?.answer_text)) add(at, "wrong-form", "the written question does not give the answer a person should be able to write");
    } else {
      add(at, "wrong-form", form
        ? `the question's form is "${form}", and a question is either a choice question or a written one`
        : "the question does not say whether it is a choice question or a written one");
    }

    const said = negations(asks);
    if (said.length >= 2) add(at, "double-negative", `the question carries ${count(said.length, "negation")}, ${quoted(said)}, and a question negated twice over tests whether somebody can unpick it`);
  });

  // The coverage: every concept, and for each the questions that test it or
  // the reason it was left. A concept left with a reason is not a fault; a
  // concept dropped in silence is, because the two are different things.
  const entries = concepts.map((c, i) => {
    const id = labelled(plain(c?.id), i, "concept");
    const tests = questions.map((q, k) => (plain(q?.concept) === id ? labelled(plain(q?.id), k, "question") : null)).filter(Boolean);
    const entry = { id, phrase: plain(c?.phrase), questions: tests };
    if (!tests.length) {
      const left = plain(c?.left);
      entry.left = left || "no reason given";
      if (!left) add({ concept: id }, "wrong-form", "the concept has no questions and no reason saying it was left, and a concept dropped in silence is not the same as one left on purpose");
    }
    return entry;
  });

  return { faults, coverage: { coverage: "v1", concepts: entries, faults, checked_by_script: CHECKED_BY_SCRIPT } };
}

// The checks a choice question carries and a written one does not.
function checkChoice(q, at, choices, add, reading, concepts) {
  if (!choices) { add(at, "wrong-form", "the choice question carries no choices"); return; }
  const ids = choices.map((c) => plain(c?.id));
  const texts = choices.map((c) => plain(c?.text));
  if (choices.length !== 4) add(at, "wrong-form", `the choice question carries ${count(choices.length, "choice")} and a choice question carries four`);
  const wanted = CHOICE_IDS.slice(0, choices.length);
  if (ids.join(",") !== wanted.join(",")) add(at, "wrong-form", `the choices are lettered ${list(ids.map((c) => c || "nothing"))} and a choice question letters them a, b, c, d in that order`);

  if (!plain(q?.because)) add(at, "wrong-form", "the choice question does not say why the right answer is right");

  const answer = plain(q?.answer);
  const right = ids.indexOf(answer);
  if (!answer) add(at, "wrong-form", "the choice question does not say which choice is right");
  else if (right < 0) add(at, "answer-not-a-choice", `the right answer is ${answer} and the choices are ${list(ids.filter(Boolean)) || "lettered nothing"}`);

  // The longest choice is the giveaway: somebody who knows nothing picks it
  // and is right more often than chance.
  //
  // By a MARGIN, not by a character. The first real run wrote thirteen
  // questions and was sent back three times over answers that were 59 against
  // 57 and 54 against 49, differences no test taker can see and none of them
  // the thing this rule exists to catch. Strict inequality also has no fix a
  // writer can aim at: the right answer has to stay right, so the only move is
  // to pad a wrong choice, and being told to do that on every question makes
  // the distractors worse. What gives a question away is an answer that is
  // VISIBLY the fullest, so the fault is a fifth longer than the next.
  if (right >= 0 && texts.length > 1) {
    const longest = Math.max(...texts.filter((_, k) => k !== right).map((t) => t.length));
    if (texts[right].length > longest * ANSWER_LENGTH_MARGIN) {
      add(at, "answer-is-longest-choice", `the right answer is ${count(texts[right].length, "character")} and the next longest is ${longest}, which is a fifth shorter or more`);
    }
  }

  // The right answer that is most made of the source's own words. This is the
  // giveaway the rules file spends its first section on, and until now nothing
  // checked it: a reader with the article open picks the option that sounds
  // familiar and is right, having understood nothing.
  //
  // It is checkable because the question says where its answer came from. Take
  // the part it cites, and measure how much of each choice is built from that
  // part's words. A right answer SHOULD be true of the source, so overlap on
  // its own proves nothing; the fault is being DISTINCTIVELY the most
  // source-like, which is what a matcher is actually picking up on.
  //
  // Found on the first real run: thirteen questions on a vendor's article,
  // every right answer a near quotation of the paragraph above it, and every
  // mechanical check passing.
  if (right >= 0 && texts.length > 1) {
    const part = partText(reading, q?.from);
    if (part) {
      // The concept this question tests, as the quiz itself words it: its
      const runs = texts.map((x) => echoRun(x, part));
      const mine = runs[right];
      const next = Math.max(...runs.filter((_, k) => k !== right), 0);
      if (mine >= ECHO_RUN && mine > next * ECHO_MARGIN) {
        add(at, "answer-echoes-the-source", `the right answer repeats ${mine} words of ${plain(q?.from)} in a row and the nearest wrong choice repeats ${next}, so it can be picked by recognising the phrasing without understanding it`);
      }
    }
  }

  // The same sentence written twice. Equality of words, never of meaning.
  const groups = new Map();
  texts.forEach((t, k) => {
    const key = normalise(t);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(labelled(ids[k], k, "choice"));
  });
  for (const [key, which] of groups) {
    if (which.length > 1) add(at, "same-choice-twice", `choices ${list(which)} read the same with the punctuation and the articles taken out, "${key}"`);
  }

  texts.forEach((t, k) => {
    if (ABOVE.has(normalise(t))) add(at, "all-of-the-above", `choice ${labelled(ids[k], k, "choice")} reads "${t}", which tests whether somebody read the other three`);
  });
}

/** One line per fault, as the command prints it. */
export function faultLines(faults) {
  return faults.map((f) => `${f.question ?? f.concept ?? "the quiz"}: ${f.fault}: ${f.says}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const { QUIZ, READING, OUT } = process.env;
  if (!QUIZ || !READING || !OUT) {
    console.error("refused: QUIZ, READING and OUT are all required, as QUIZ=records/<job>/quiz.json READING=records/<job>/reading.json OUT=records/<job>/coverage.json node check-quiz.mjs");
    process.exit(2);
  }
  const open = (path, what) => {
    try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) { console.error(`refused: the ${what} could not be read: ${e.message}`); process.exit(2); }
  };
  const quiz = open(QUIZ, "quiz");
  const reading = open(READING, "reading");
  if (!Array.isArray(reading?.parts) || !reading.parts.length) {
    console.error("refused: the reading carries no parts, so no question's place can be checked");
    process.exit(2);
  }
  const { faults, coverage } = checkQuiz(quiz, reading);
  writeFileSync(OUT, JSON.stringify(coverage, null, 2) + "\n");
  const tested = coverage.concepts.filter((c) => c.questions.length).length;
  const left = coverage.concepts.length - tested;
  const asked = Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
  const summary = `${count(coverage.concepts.length, "concept")}, ${tested} tested by ${count(asked, "question")}, ${left} left; coverage written to ${OUT}`;
  if (faults.length) {
    for (const line of faultLines(faults)) console.log(line);
    console.log(summary);
    console.error(`refused: ${count(faults.length, "fault")} in the quiz, so it is not staged; every one is listed above and one rewrite fixes them together`);
    process.exit(1);
  }
  console.log(`nothing wrong with the questions; ${summary}`);
}
