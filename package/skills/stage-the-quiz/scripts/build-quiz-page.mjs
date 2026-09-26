// Build the quiz page from the quiz. One file, and nothing outside it.
//   needs: node >= 22; no dependency, here or on the page
//   QUIZ=<quiz.json> OUT=<page.html> NAME=<slug> [READING=<reading.json>] [PROFILE=<brand-profile.json>]
//   [QUIZ_CREDIT=on, to carry the Built by AgentMesh footer]
//   node build-quiz-page.mjs
//
// READING is the same file the check step reads beside the quiz. It is where
// the parts live, and the parts are what a missed question links back to: the
// quiz carries the part ids and not the parts. Built without it, the page is
// whole and every question still shows its answer, and the missed ones say
// nothing about where to go back to. The build says how many of those there
// were rather than letting it pass unnoticed.
//
// The page is the delivery. A person opens it, answers, and is told how they
// did, in their own browser. It sends nothing anywhere and it keeps nothing.
// That is the offering's refusal rather than a shortcut, so the page carries
// no fetch, no request of any other kind, no form that posts, no storage, no
// analytics, and no script, stylesheet or font from anywhere else. Everything
// it needs is written into it here, which is also why it still works from a
// file on somebody's laptop with no network at all. The page used to say all
// of that to the reader in a panel of its own. It does not any more: it is
// true whether or not the page announces it, the tests here are what keep it
// true, and a panel reassuring somebody about a worry they had not had yet is
// the page talking about itself instead of asking its questions.
//
// One question at a time is how the page is taken, and a quiz that wants every
// question on one long page says so in `view`. Either way a choice is marked
// the moment it is picked and a written answer is never marked; the difference
// is only how much of the quiz is on the screen at once. See viewOf.
//
// The other half of the refusal is that it does not mark the person. A choice
// question has one right answer and is marked. A written question is not: it
// shows the answer to aim for beside what the person wrote and leaves the
// judgement to them, and the page says so in as many words.
//
// A caller may hand the job a brand profile, and where they do, this page is
// built in their colors and their faces rather than in this agent's. What it
// reads out of a profile is the list in READS below, what it did with one is
// what brandFrom hands back, and nothing is ever invented to fill a gap: a
// field a profile does not carry leaves this page's own default standing and
// is said back as not present.
import { readFileSync, writeFileSync } from "node:fs";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
// Every value on this page came from somebody's writing. A question is text,
// never markup, and the one way that stays true is that nothing reaches the
// page without passing through here.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const hexToRgb = (hex) => { const h = hex.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const lighten = ([r, g, b]) => `#${[r, g, b].map((v) => Math.min(255, Math.round(v + (255 - v) * 0.28)).toString(16).padStart(2, "0")).join("")}`;

/** One color moved part of the way towards another. It is how the tones
 *  between a ground and its ink are made: the panels, the rules, and the two
 *  quieter greys. Those are DERIVED and never taken from a profile, because a
 *  brand that has stated two colors has not stated seven, and writing a
 *  seventh into the page as though they had is the one thing a profile must
 *  never make an agent do. */
const mix = (from, to, t) => { const b = hexToRgb(to); return rgbToHex(hexToRgb(from).map((v, i) => v + (b[i] - v) * t)); };

const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const [r, g, b] = hexToRgb(hex).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** How far apart two colors are, the way the contrast rules count it: 1 for
 *  two colors the same, 21 for black on white. AA is 4.5 to 1 and AAA is 7. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const FLOORS = { AA: 4.5, AAA: 7 };
// Rounded DOWN, so a pair that reads as 4.5 to 1 really is 4.5 to 1.
const ratioSaid = (n) => `${(Math.floor(n * 10) / 10).toFixed(1)} to 1`;

// The accent is the one color the quiz chooses. It is never the color that
// says right or missed: those two are fixed in the stylesheet below, and they
// are mint and amber rather than green and red, because the person reading
// this may not be able to tell green from red and red on a dark ground is the
// worst of it. Every state carries a word and a glyph as well, so the color
// is never carrying the meaning on its own.
export const ACCENT_DEFAULT = "#6BA8FF";
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

// ── the page's own palette and faces ────────────────────────────────────────
//
// What stands where a profile says nothing, which is everything when no
// profile came with the job. The names are the brand shape's names and mean
// what that shape means by them: GROUND is the color behind the text and INK
// is the color of the text. The stylesheet used to call the dark background
// its ink, which reads as the opposite of the shape it now takes colors from,
// and a mapping that looks like a bug to every later reader eventually becomes
// one.
export const DEFAULT_TOKENS = {
  ground: "#0A1417",
  panel: "#0F1D22",
  panel2: "#12242A",
  line: "#1C2E33",
  ink: "#E7EFEC",
  dim: "#7C918C",
  faint: "#4A5D5A",
  accent: ACCENT_DEFAULT,
  // Null means this page's own treatment stands, which is what it did before a
  // profile could name any of the three. Null is never a color.
  headColor: null,
  link: null,
  button: null,
  body: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  // Null: the title takes the body face, which is what it has always done, and
  // no rule about it is written into the page at all.
  head: null,
  headWeight: null,
  // Whether the ground and the ink on this page are a brand's pair. It decides
  // one derived thing, the hover shade, and is not a color of its own.
  paired: false,
  neverHueAlone: false,
};

// ── the brand profile ───────────────────────────────────────────────────────
//
// The shape a caller's profile follows, named by its version, and the fields
// of it this page reads. READS is the same list spec.json declares in can_use
// and a test holds the two together, because a declaration that claims more
// than the page does is the exact failure a field list exists to prevent.
export const BRAND_SCHEMA = "https://schemas.agentmesh.ai/brand/v1";
export const READS = [
  "palette.ink",
  "palette.ground",
  "palette.heading",
  "palette.link",
  "palette.button",
  "palette.accent",
  "palette.contrast_floor",
  "palette.never_hue_alone",
  "type.heading.family",
  "type.heading.fallback",
  "type.heading.weight",
  "type.body.family",
  "type.body.fallback",
];

const at = (o, path) => path.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), o);
// Stated, in the profile's sense: false is a statement and null is not. The
// shape says an absent field means NOT STATED and never a default, so the two
// have to stay apart here or a profile's silence would become its answer.
const isStated = (v) => v !== undefined && v !== null;
const colorOf = (v) => { const s = String(v ?? "").trim(); return HEX.test(s) ? s : null; };

// A face family and the rest of its stack, as they may be written into the
// page. Both come from a caller, both land inside a stylesheet, and a value
// carrying a brace or a semicolon would be writing CSS rather than naming a
// font. Anything outside these is refused by name and reported, never trimmed
// into something that looks safe.
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;
const STACK = /^[A-Za-z0-9 ,_'"-]{1,200}$/;
const familyOf = (v) => { const s = String(v ?? "").replace(/["']/g, "").trim(); return FAMILY.test(s) ? s : null; };
const stackOf = (v) => { const s = String(v ?? "").trim(); return STACK.test(s) ? s : null; };

/**
 * A brand profile as this page's tokens, and the record of what was done with
 * it. One call, and the page is built from the tokens it returns, so what the
 * record calls applied is what the builder actually used rather than what the
 * agent declared it could use.
 *
 * Three lists come back. `applied` is the fields that changed this page.
 * `not_present` is the declared fields the profile does not carry, which is
 * the profile's own silence said back so an owner learns theirs is thin.
 * `not_applied` is a field read and not honored, each with the reason, and it
 * is the only one of the three anybody would be tempted to leave out: without
 * it an agent that quietly ignored your typeface and an agent whose profile
 * never carried one look identical from outside.
 */
export function brandFrom(profile, { quizAccent = "" } = {}) {
  const tokens = { ...DEFAULT_TOKENS };
  const applied = [];
  let notRead = [];
  const notApplied = [];
  const carried = new Set();
  const note = (field, why) => notApplied.push({ field, why });
  const order = (xs) => READS.filter((p) => xs.includes(p));
  const done = () => ({
    schema: BRAND_SCHEMA,
    tokens,
    applied: order(applied),
    not_present: READS.filter((p) => !carried.has(p)),
    not_applied: notApplied.slice().sort((a, b) => READS.indexOf(a.field) - READS.indexOf(b.field)),
    not_read: notRead,
  });
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return done();

  // Every read goes through here, so a field the profile carries is counted as
  // carried whether or not this page could use the value in it. A bad value is
  // not the profile's silence and must not be reported as it.
  const read = (path) => { const v = at(profile, path); if (isStated(v)) carried.add(path); return isStated(v) ? v : undefined; };
  // Everything the profile states that this page never asks for. Bookkeeping
  // about the profile and not about the page, so the leaves that describe the
  // document itself are left out of it.
  const ABOUT_THE_DOCUMENT = ["brand_profile", "name", "owner", "updated", "adopted"];
  notRead = leavesOf(profile)
    .filter((path) => !READS.includes(path))
    .filter((path) => !ABOUT_THE_DOCUMENT.includes(path.split(".")[0]) && path.split(".")[0] !== "evidence")
    .sort();
  const notAHex = (path, v) => note(path, `${String(v).slice(0, 40)} is not a six digit hex color like #1F6FEB, so it was left out`);

  // ── the ground and the ink, which are one pair ────────────────────────────
  //
  // Both, or neither. The panels, the rules and the two quieter greys on this
  // page are mixed from the ground and the ink together, so a profile that
  // states one of them has not stated enough to color the page: taking it on
  // its own would put this agent's own text color on a ground the brand chose,
  // and that pairing is a color decision the brand never made.
  const saidGround = read("palette.ground");
  const saidInk = read("palette.ink");
  const ground = colorOf(saidGround);
  const ink = colorOf(saidInk);
  if (saidGround !== undefined && !ground) notAHex("palette.ground", saidGround);
  if (saidInk !== undefined && !ink) notAHex("palette.ink", saidInk);
  if (ground && ink) {
    tokens.ground = ground;
    tokens.ink = ink;
    tokens.panel = mix(ground, ink, 0.05);
    tokens.panel2 = mix(ground, ink, 0.09);
    tokens.line = mix(ground, ink, 0.18);
    tokens.dim = mix(ink, ground, 0.38);
    tokens.faint = mix(ink, ground, 0.58);
    tokens.paired = true;
    applied.push("palette.ground", "palette.ink");
  } else if (ground || ink) {
    const only = ground ? "palette.ground" : "palette.ink";
    const missing = ground ? "ink" : "ground";
    note(only, `the ground and the ink on this page are one pair and the profile states no ${missing}, so neither was used; this agent's own text color on a ground somebody else chose is a pairing the brand never made`);
  }

  // ── the accent ────────────────────────────────────────────────────────────
  const saidAccent = read("palette.accent");
  const accent = colorOf(saidAccent);
  if (saidAccent !== undefined && !accent) notAHex("palette.accent", saidAccent);
  else if (accent && String(quizAccent ?? "").trim()) note("palette.accent", "this quiz names an accent of its own, which is the more particular of the two, so the profile's accent was left out");
  else if (accent) { tokens.accent = accent; applied.push("palette.accent"); }

  // ── the places whose color IS their meaning ───────────────────────────────
  //
  // The heading, the link and the button are not assignments somebody makes,
  // they are the color of a thing, so a profile that states them has stated
  // exactly what this page needs and no judgment stands in between. They
  // matter more than they look: run against a real brand with only a ground
  // and an ink, the page came out indistinguishable from this agent's own
  // default, because the ground and the ink are the two colors a dark page
  // shares with every other dark page. What a brand is recognised by is the
  // color of its headings and its buttons.
  for (const [path, token] of [["palette.heading", "headColor"], ["palette.link", "link"], ["palette.button", "button"]]) {
    const said = read(path);
    const value = colorOf(said);
    if (said !== undefined && !value) notAHex(path, said);
    else if (value) { tokens[token] = value; applied.push(path); }
  }

  // ── the floor the brand requires ──────────────────────────────────────────
  //
  // Checked against the page as it will be built, which is the profile's
  // colors where it gave them and this page's own where it did not. The mint
  // and the amber that mark right and missed are this agent's colors and not
  // the profile's, so they are not counted here.
  const saidFloor = read("palette.contrast_floor");
  if (saidFloor !== undefined) {
    const floor = String(saidFloor).trim().toUpperCase();
    const want = FLOORS[floor];
    if (!want) note("palette.contrast_floor", `the floor is written as ${String(saidFloor).slice(0, 20)} and this shape allows AA or AAA, so nothing was checked against it`);
    else {
      const shown = colorOf(quizAccent) ?? tokens.accent;
      const pairs = [["the text on the ground", tokens.ink, tokens.ground], ["the accent on the ground", shown, tokens.ground]];
      const short = pairs.filter(([, a, b]) => contrast(a, b) < want);
      if (!short.length) applied.push("palette.contrast_floor");
      else {
        note("palette.contrast_floor", `the profile asks for ${floor}, which is ${want} to 1, and ${joinNames(short.map(([what, a, b]) => `${what} reaches ${ratioSaid(contrast(a, b))}`))}; the colors were used as the profile gives them rather than adjusted, because picking a different one would be a brand decision the profile did not make`);
      }
    }
  }

  // ── meaning never carried by color alone ──────────────────────────────────
  const saidHue = read("palette.never_hue_alone");
  if (saidHue === true) { tokens.neverHueAlone = true; applied.push("palette.never_hue_alone"); }
  else if (saidHue === false) note("palette.never_hue_alone", "this page pairs every state with a word and a glyph whether or not a profile asks for it, so a false here loosened nothing");
  else if (saidHue !== undefined) note("palette.never_hue_alone", "never_hue_alone is true or false, and this profile gives neither, so nothing was taken from it");

  // ── the two faces ─────────────────────────────────────────────────────────
  const face = (which, fallbackStack) => {
    const saidFamily = read(`type.${which}.family`);
    const saidRest = read(`type.${which}.fallback`);
    const family = familyOf(saidFamily);
    const rest = stackOf(saidRest);
    if (saidFamily !== undefined && !family) {
      note(`type.${which}.family`, "a family is a name in letters, digits, spaces, hyphens and underscores, and this one carries something else, so the face was left out");
    }
    if (saidRest !== undefined && !rest) {
      note(`type.${which}.fallback`, "a fallback is the rest of the stack as CSS would write it, and this one carries something else, so it was left out");
    }
    if (!family) {
      // A fallback with no family in front of it changes nothing, and the two
      // reasons for that are different things to tell an owner: one profile
      // never named a face, the other named one this page could not use.
      if (rest) {
        note(`type.${which}.fallback`, saidFamily === undefined
          ? `a fallback is the rest of a stack and the profile names no ${which} family to begin one, so nothing was changed`
          : `the ${which} family this fallback completes could not be used, so the fallback was left out with it`);
      }
      return null;
    }
    applied.push(`type.${which}.family`);
    if (rest) applied.push(`type.${which}.fallback`);
    return `"${family}", ${rest ?? fallbackStack}`;
  };

  const head = face("heading", DEFAULT_TOKENS.body);
  if (head) tokens.head = head;
  const saidWeight = read("type.heading.weight");
  if (saidWeight !== undefined) {
    const weight = Number(saidWeight);
    if (Number.isInteger(weight) && weight >= 1 && weight <= 1000) { tokens.headWeight = weight; applied.push("type.heading.weight"); }
    else note("type.heading.weight", `a weight is a whole number from 1 to 1000, and this profile gives ${String(saidWeight).slice(0, 20)}, so the title keeps the browser's own bold`);
  }
  const body = face("body", DEFAULT_TOKENS.body);
  if (body) tokens.body = body;

  return done();
}

/** The answer this agent files with the job: what it did with the profile it
 *  was handed, in the shape the context bag settles. Evidence and not a
 *  declaration, which is why it travels with the job and never on the
 *  descriptor. */
export const usedRecord = (brand) => ({
  used: "v1",
  schema: brand?.schema ?? BRAND_SCHEMA,
  applied: brand?.applied ?? [],
  not_present: brand?.not_present ?? [],
  not_applied: brand?.not_applied ?? [],
  not_read: brand?.not_read ?? [],
});

/** Every leaf a profile actually carries, as dotted paths, so the fields this
 *  page does not read can be named rather than vanish.
 *
 *  Three lists were not enough. LangChain's profile carried palette.button and
 *  this page did not read it, so the field appeared in none of them: not
 *  applied, not absent, not refused, just gone, and the owner had no way to
 *  learn that a color they state is one this agent ignores. That is the same
 *  service the other three lists perform and it was missing. */
export function leavesOf(value, path = "", out = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    if (path) out.push(path);
    return out;
  }
  for (const [k, v] of Object.entries(value)) leavesOf(v, path ? `${path}.${k}` : k, out);
  return out;
}

/** What to write on a button whose color the brand chose. The brand stated the
 *  button and not what sits on it, so this picks whichever of the page's own
 *  ground and ink can be read against it. Arithmetic, not a brand decision,
 *  which is why it is not a field and not in `applied`. */
export const onOf = (button, t) =>
  (contrast(button, t.ink) >= contrast(button, t.ground) ? t.ink : t.ground);

/** The accent this page is built in. The quiz's own wins where it has one,
 *  then the profile's, then this agent's. */
const accentOf = (quiz, brand) => {
  const own = String(quiz?.accent ?? "").trim();
  if (!own) return brand?.tokens?.accent ?? ACCENT_DEFAULT;
  if (!HEX.test(own)) throw new Error(`the accent must be a six digit hex color like ${ACCENT_DEFAULT}, and this quiz gives ${own}`);
  return own;
};

/** How the page shows its questions, from the quiz.
 *
 *  One at a time is what a quiz that says nothing gets, and it is the shape of
 *  taking a quiz: one question, the verdict on it once it is answered, and a
 *  way forward and back. A quiz may ask for `all-at-once` instead, which puts
 *  every question on one long page, and that is what somebody reading the
 *  whole quiz before answering any of it wants.
 *
 *  A third word is refused by name rather than quietly read as the default: a
 *  quiz asking for something this page does not do should hear about it. */
export const VIEWS = ["one-at-a-time", "all-at-once"];
export function viewOf(quiz) {
  const said = String(quiz?.view ?? "").trim();
  if (!said) return "one-at-a-time";
  if (!VIEWS.includes(said)) throw new Error(`the quiz asks to be shown ${said}, and the two ways a quiz is shown are ${joinNames(VIEWS)}`);
  return said;
}

/** Whether this page carries the Built by AgentMesh footer, from the named
 *  variable the host places.
 *
 *  Default OFF. The page belongs to whoever asked for the quiz, and the name
 *  of the agent that built it goes on it only where a host has said so.
 *
 *  A value nobody recognises leaves the footer ON, which is the rule the
 *  explainer's credit follows and it is here for the same reason: a host that
 *  typed the variable at all meant the credit to be on the page, and a typo
 *  must never quietly strip a credit. So only the absent variable and the
 *  words that plainly mean no leave it off. */
export function creditOn(env = {}) {
  const said = String(env.QUIZ_CREDIT ?? "").trim().toLowerCase();
  if (!said) return false;
  return !["off", "no", "false", "0", "none"].includes(said);
}

/** An address a reader could open, or nothing.
 *
 *  Only http and https become a link. An address of any other scheme is a
 *  fault in the reading rather than a place to go back to, and turning one
 *  into an href on a page a stranger opens is how a quiz would become a way
 *  to run somebody else's code. It is refused here, loudly, rather than
 *  quietly dropped: a source carrying an address like that is worth hearing
 *  about. */
function webAddress(address, what) {
  const a = String(address ?? "").trim();
  if (!a) return null;
  if (!/^https?:\/\//i.test(a)) throw new Error(`${what} gives an address that is not a web address, and the page will not carry one: ${a}`);
  return a;
}

const indexBy = (rows, key = "id") => {
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) if (row && row[key] != null) index.set(String(row[key]), row);
  return index;
};

/** Where a missed question sends somebody back to.
 *
 *  The question cites a part id. The part carries the place name, its
 *  fragment when the source has an anchor for it, and, through its source,
 *  the address. Three things can come back, and each is a different sentence
 *  on the page:
 *
 *    an address and a fragment: a link straight to the place in the source
 *    an address and no fragment: a link to the source
 *    no address: the place name in plain text, because there is nowhere to go
 *
 *  The parts themselves live in the reading, which is why this takes it: the
 *  quiz carries the part ids and not the parts, so a page built from the quiz
 *  alone knows a question was missed and not where to send anybody. The
 *  reading is the file the check step already reads beside the quiz. A quiz
 *  that does carry its own `places`, or a `back_to` written out in full,
 *  wins over the reading, so a quiz that travelled without its reading can
 *  still be built.
 *
 *  A part nothing carries gives nothing at all, and the question then shows
 *  its answer with no line about going back. Nothing is invented: a page that
 *  sent somebody to an address the quiz never named would be worse than one
 *  that stays quiet about it. */
export function backTo(quiz, question, reading) {
  const raw = question?.back_to;
  const id = String(raw ?? "");
  const part = raw && typeof raw === "object"
    ? raw
    : indexBy(quiz?.places).get(id) ?? indexBy(reading?.parts).get(id);
  if (!part) return null;
  const place = part.place ?? part;
  const label = String(place.label ?? "").trim();
  if (!label) return null;
  const from = String(part.source ?? "");
  const named = indexBy(quiz?.made_from).get(from)?.address ?? indexBy(reading?.sources).get(from)?.address;
  const address = webAddress(part.address ?? named, `the place called ${label}`);
  if (!address) return { label, href: null };
  const fragment = String(place.fragment ?? "").trim();
  return { label, href: fragment ? `${address}#${fragment}` : address };
}

const backSentence = (lead, back, indent) => {
  if (!back) return "";
  const place = back.href ? `<a href="${esc(back.href)}">${esc(back.label)}</a>` : esc(back.label);
  return `\n${indent}<p class="back">${lead} ${place}.</p>`;
};

const joinNames = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The faults that would leave a question unanswerable or unmarkable.
 *
 *  The check step names the faults that make a quiz a bad quiz and refuses
 *  them there. This is the shorter list that makes a quiz an unbuildable one:
 *  a right answer the page cannot find among the choices has no marking to
 *  do, and a written question with no answer to aim for has nothing to show.
 *  Every one of them names the question by its place in the quiz, because a
 *  person fixing it is reading the file, not the ids. */
function checkQuestion(q, where) {
  if (!String(q?.asks ?? "").trim()) throw new Error(`${where} asks nothing`);
  if (q.form === "choice") {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    if (choices.length !== 4) throw new Error(`${where} is a choice question with ${choices.length} choices, and a choice question has four`);
    const ids = choices.map((c) => String(c?.id ?? ""));
    if (ids.some((id) => !id) || new Set(ids).size !== 4) throw new Error(`${where} has choices that do not each carry their own id`);
    if (choices.some((c) => !String(c?.text ?? "").trim())) throw new Error(`${where} carries a choice with no words in it`);
    if (!ids.includes(String(q.answer ?? ""))) throw new Error(`${where} names an answer that is not one of its choices, so the page could not mark it`);
    if (!String(q.because ?? "").trim()) throw new Error(`${where} does not say why its answer is the right one`);
  } else if (q.form === "written") {
    if (!String(q.answer_text ?? "").trim()) throw new Error(`${where} is a written question with no answer to aim for`);
  } else {
    throw new Error(`${where} is neither a choice question nor a written one: ${q?.form ? `it calls itself ${q.form}` : "it names no form"}`);
  }
}

function renderChoice(quiz, reading, q, id, number, count, phrase) {
  const right = q.choices.find((c) => String(c.id) === String(q.answer));
  const choices = q.choices.map((c, i) => `        <label class="choice" for="${id}-c${i + 1}">
          <input type="radio" id="${id}-c${i + 1}" name="${id}" value="${esc(c.id)}">
          <span class="choice-text">${esc(c.text)}</span>
          <span class="flag"></span>
        </label>`).join("\n");
  // The question itself goes in the legend, not beside it. A legend is the
  // name of the group of radios, so a person who reaches the choices with a
  // keyboard and hears only "question 1 of 8" before the first choice has
  // been given the number and not the question.
  return `    <li class="q" id="${id}" data-question data-form="choice" data-answer="${esc(q.answer)}" tabindex="-1">
      <fieldset>
        <legend>
          <span class="qno">Question ${number} of ${count}</span>${phrase ? `<span class="concept">${esc(phrase)}</span>` : ""}
          <span class="asks">${esc(q.asks)}</span>
        </legend>
        <div class="choices">
${choices}
        </div>
      </fieldset>
      <div class="verdict verdict-right" role="status" hidden>
        <p class="badge good"><span class="glyph" aria-hidden="true">&#10003;</span> Right</p>
        <p class="because">${esc(q.because)}</p>
      </div>
      <div class="verdict verdict-missed" role="status" hidden>
        <p class="badge miss"><span class="glyph" aria-hidden="true">&#10007;</span> Not this one</p>
        <p class="answer-is">The answer is: ${esc(right.text)}</p>
        <p class="because">${esc(q.because)}</p>${backSentence("Go back over this at", backTo(quiz, q, reading), "        ")}
      </div>
    </li>`;
}

function renderWritten(quiz, reading, q, id, number, count, phrase) {
  return `    <li class="q" id="${id}" data-question data-form="written" tabindex="-1">
      <p class="qno">Question ${number} of ${count}${phrase ? `<span class="concept">${esc(phrase)}</span>` : ""}</p>
      <label class="asks" for="${id}-text">${esc(q.asks)}</label>
      <textarea id="${id}-text" rows="5"></textarea>
      <p class="unmarked">Nobody marks this one. Write your answer, then show the answer to aim for and compare the two.</p>
      <button type="button" class="reveal">Show the answer</button>
      <div class="verdict verdict-written" role="status" hidden>
        <div class="pair">
          <div class="side"><h3>What you wrote</h3><p class="wrote"></p></div>
          <div class="side"><h3>The answer to aim for</h3><p>${esc(q.answer_text)}</p></div>
        </div>
        <p class="unmarked">This was not marked and no score was kept for it. Read the two side by side and decide for yourself whether you had it.</p>${backSentence("Where this is taught:", backTo(quiz, q, reading), "        ")}
      </div>
    </li>`;
}

// The revisit line for one missed choice question: the concept it tested and
// the place to go back to, written here and hidden, so the summary never has
// to build markup in the browser out of somebody's words.
function renderRevisit(quiz, reading, q, id, number, phrase) {
  const back = backTo(quiz, q, reading);
  const said = phrase ? esc(phrase) : `what question ${number} asked`;
  return `        <li data-for="${id}" hidden><span class="phrase">${said}</span>${backSentence("Go back over this at", back, "          ")}</li>`;
}

/** The hover shade, which is derived and never stated. On this page's own dark
 *  ground it is the accent lifted towards white, which is what it has always
 *  been. On a brand's ground it moves towards that brand's ink instead, so a
 *  light ground does not get a hover nobody can see. */
const hoverOf = (t) => (t.paired ? mix(t.accent, t.ink, 0.28) : lighten(hexToRgb(t.accent)));

const styles = (t) => `  :root{
    --ground:${t.ground}; --panel:${t.panel}; --panel-2:${t.panel2}; --line:${t.line};
    --ink:${t.ink}; --dim:${t.dim}; --faint:${t.faint};
    --verify:#43D6A6; --signal:#F2A93B;
    --accent:${t.accent}; --accent-hover:${hoverOf(t)}; --accent-rgb:${hexToRgb(t.accent).join(",")};
    --head-color:${t.headColor ?? "var(--ink)"}; --link:${t.link ?? "var(--accent)"};
    --button:${t.button ?? "var(--panel-2)"}; --on-button:${t.button ? onOf(t.button, t) : "var(--ink)"};
    --body:${t.body};
    --wire:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  }
  *{ box-sizing:border-box; }
  html{ -webkit-text-size-adjust:100%; }
  body{ margin:0; background:var(--ground); color:var(--ink); font-family:var(--body);
    font-size:16px; line-height:1.55; -webkit-font-smoothing:antialiased; }
  .sheet{ max-width:780px; margin:0 auto; padding:40px 24px 72px; }
  a{ color:var(--accent); }
  a:hover{ color:var(--accent-hover); }
  a:focus-visible, button:focus-visible, textarea:focus-visible, input:focus-visible{
    outline:2px solid var(--accent); outline-offset:3px; border-radius:4px; }

  .top{ border-bottom:1px solid var(--line); padding-bottom:26px; margin-bottom:30px; }
  .kicker{ font-family:var(--wire); font-size:.7rem; letter-spacing:.18em; color:var(--accent);
    margin:0 0 10px; text-transform:uppercase; }
  h1{ font-size:1.85rem; line-height:1.25; margin:0 0 12px; color:var(--head-color); }
  .audience{ margin:0; color:var(--dim); }
  h2{ font-family:var(--wire); font-size:.72rem; font-weight:600; letter-spacing:.16em;
    text-transform:uppercase; color:var(--dim); margin:0 0 18px; }
  h3{ font-family:var(--wire); font-size:.7rem; font-weight:600; letter-spacing:.14em;
    text-transform:uppercase; color:var(--dim); margin:0 0 6px; }

  .questions{ list-style:none; margin:0 0 44px; padding:0; }
  /* One question at a time: the way forward and back carries the space under
     the question, so the list itself needs none. */
  main[data-view="one-at-a-time"] .questions{ margin-bottom:0; }
  .q{ border:1px solid var(--line); border-radius:12px; background:var(--panel);
    padding:22px 22px 24px; margin:0 0 18px; }
  /* One question at a time: everything but the question being answered is
     hidden by the script, never by this stylesheet, so a browser with
     scripting turned off shows the whole quiz rather than one question and no
     way to reach the rest. */
  .q[hidden], .summary[hidden], h2[hidden]{ display:none; }
  .q:focus-visible, .summary:focus-visible{ outline:2px solid var(--accent); outline-offset:4px; }
  .q fieldset{ border:0; margin:0; padding:0; min-width:0; }
  .q legend{ padding:0; display:block; width:100%; }
  .qno{ font-family:var(--wire); font-size:.7rem; letter-spacing:.12em; color:var(--faint);
    text-transform:uppercase; display:block; }
  .concept{ display:block; font-family:var(--wire); font-size:.72rem; letter-spacing:.04em;
    text-transform:none; color:var(--accent); margin-top:4px; }
  p.qno{ margin:0; }
  .asks{ display:block; font-size:1.06rem; line-height:1.5; margin:12px 0 16px; color:var(--ink); }

  .choices{ display:grid; gap:10px; }
  .choice{ display:grid; grid-template-columns:auto 1fr; gap:3px 12px; align-items:start;
    padding:13px 15px; background:var(--panel-2); border:1px solid var(--line);
    border-left:3px solid var(--line); border-radius:8px; cursor:pointer; }
  .choice:hover{ border-color:var(--dim); }
  .choice input{ margin:4px 0 0; width:16px; height:16px; accent-color:var(--accent); }
  .choice-text{ font-size:.98rem; }
  .flag{ grid-column:2; font-family:var(--wire); font-size:.74rem; letter-spacing:.04em; color:var(--dim); }
  .flag:empty{ display:none; }
  .choice.is-answer{ border-color:rgba(67,214,166,.45); border-left-color:var(--verify);
    background:rgba(67,214,166,.08); }
  .choice.is-answer .flag{ color:var(--verify); }
  .choice.is-pick:not(.is-answer){ border-color:rgba(242,169,59,.45); border-left-color:var(--signal);
    background:rgba(242,169,59,.08); }
  .choice.is-pick:not(.is-answer) .flag{ color:var(--signal); }
  .q[data-answered] .choice{ cursor:default; }

  textarea{ width:100%; min-height:120px; resize:vertical; font-family:var(--body); font-size:.98rem;
    line-height:1.5; color:var(--ink); background:var(--panel-2); border:1px solid var(--line);
    border-radius:8px; padding:12px 14px; }
  textarea[readonly]{ color:var(--dim); }
  .unmarked{ font-size:.86rem; color:var(--dim); margin:10px 0 14px; }
  button{ font-family:var(--wire); font-size:.82rem; font-weight:600; cursor:pointer;
    border-radius:8px; padding:9px 18px; border:1px solid var(--line);
    background:var(--button); color:var(--on-button); }
  button:hover{ border-color:var(--dim); }
  button:disabled{ opacity:.4; cursor:default; }

  .verdict{ margin-top:18px; padding:16px 18px; background:var(--panel-2);
    border:1px solid var(--line); border-radius:8px; }
  .verdict[hidden]{ display:none; }
  .verdict-right{ border-left:3px solid var(--verify); }
  .verdict-missed{ border-left:3px solid var(--signal); }
  .verdict-written{ border-left:3px solid var(--accent); }
  .badge{ display:inline-flex; align-items:center; gap:8px; font-family:var(--wire);
    font-size:.75rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase;
    border-radius:999px; padding:5px 13px; margin:0 0 12px; }
  .badge .glyph{ font-size:.9rem; }
  .badge.good{ color:var(--verify); background:rgba(67,214,166,.12); border:1px solid rgba(67,214,166,.45); }
  .badge.miss{ color:var(--signal); background:rgba(242,169,59,.12); border:1px solid rgba(242,169,59,.45); }
  .answer-is{ margin:0 0 8px; font-weight:600; }
  .because{ margin:0; color:var(--ink); font-size:.95rem; }
  .back{ margin:12px 0 0; font-size:.9rem; color:var(--dim); }
  .back a{ color:var(--link); }
  .pair{ display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:14px; }
  .side p{ margin:0; font-size:.95rem; white-space:pre-wrap; }
  .side .wrote.blank{ color:var(--dim); font-style:italic; }

  .nav{ display:flex; align-items:center; gap:12px; margin:24px 0 44px; }
  .nav[hidden]{ display:none; }
  .nav .next{ margin-left:auto; }

  .summary{ border:1px solid var(--line); border-radius:12px; background:var(--panel); padding:22px; }
  .summary #tally{ margin:0; font-size:1.02rem; }
  .revisit{ margin-top:20px; }
  .revisit[hidden]{ display:none; }
  .revisit ul{ list-style:none; margin:0; padding:0; display:grid; gap:12px; }
  .revisit li{ padding-left:16px; border-left:2px solid var(--signal); }
  .revisit li[hidden]{ display:none; }
  .revisit .phrase{ font-weight:600; }
  .revisit .back{ margin-top:4px; }
  .again{ margin:22px 0 0; }
  .again .note{ font-size:.84rem; color:var(--dim); margin:10px 0 0; }
  .colophon{ margin:34px 0 0; padding-top:20px; border-top:1px solid var(--line);
    font-size:.85rem; color:var(--faint); }
  .colophon p{ margin:0 0 6px; }
  .credit{ margin:34px 0 0; padding-top:20px; border-top:1px solid var(--line);
    font-size:.85rem; color:var(--dim); }
  .credit p{ margin:0; }
  .credit a{ color:var(--link); }
  noscript p{ margin:0 0 24px; padding:14px 16px; background:var(--panel);
    border:1px solid var(--line); border-left:3px solid var(--signal); border-radius:8px; }

  @media (max-width: 640px){
    .sheet{ padding:28px 16px 56px; }
    h1{ font-size:1.5rem; }
    .q{ padding:18px 16px 20px; }
    .pair{ grid-template-columns:1fr; gap:16px; }
  }
  @media (prefers-reduced-motion: reduce){ *{ transition:none !important; animation:none !important; } }${headRule(t)}`;

// The title's own face, written only where a profile named one. With no
// profile there is no rule at all and the title takes the body face, which is
// what it has always done, so a page built without a bag is the page this
// agent built before there was one.
const headRule = (t) => {
  if (!t.head && !t.headWeight) return "";
  const said = [t.head ? `font-family:${t.head};` : "", t.headWeight ? ` font-weight:${t.headWeight};` : ""].join("").trim();
  return `\n\n  h1{ ${said} }`;
};

// The behaviour, and all of it: show one question at a time where the quiz
// asks for that, mark a choice the moment it is picked, show the answer to aim
// for when the person says they are done, keep the tally, and clear the lot
// when they want another go. It reads what it needs from the page and writes
// back only through textContent and hidden, so no word anybody wrote is ever
// parsed as markup on the way in or out.
//
// THE PROGRESSION. The steps are the questions and then how you did, so the
// tally is where the progression arrives rather than something sitting below
// it the whole way. Nothing is hidden by the stylesheet and everything is
// hidden here, which is what keeps the promise made to a browser with
// scripting turned off: no script, no hiding, and the whole quiz is readable.
// The two buttons are the same bargain in reverse. They are written into the
// page hidden and unhidden here, because a button that does nothing is worse
// than no button at all.
//
// WHERE THE FOCUS GOES, which a progression makes easy to get wrong in three
// places and only one of them is the obvious one.
//
//   Moving. The step moved to takes the focus, so a keyboard is standing in
//   the question it is now looking at, and tabbing from there reaches the
//   choices. The question and the summary both carry tabindex="-1" for it.
//
//   Answering. A radio disabled while it holds the focus KEEPS the focus and
//   stops answering the Tab key: Chromium leaves it there and the page is a
//   trap. So the picked choice is left open and only the other three are
//   closed. Nothing can be answered twice either way, because there is no
//   second choice left to pick and the handler has already marked it.
//
//   Showing a written answer. That button closes itself, and a button closed
//   while it holds the focus drops it: the focus lands on nothing and the
//   keyboard starts again wherever the browser decides. The question takes it
//   instead.
const behaviour = `(() => {
  "use strict";
  const questions = [...document.querySelectorAll("[data-question]")];
  const choiceQs = questions.filter((q) => q.dataset.form === "choice");
  const writtenCount = questions.length - choiceQs.length;
  const tally = document.getElementById("tally");
  const revisit = document.getElementById("revisit");
  const revisitLines = [...document.querySelectorAll("#revisit-list [data-for]")];
  const answered = new Set();
  const missed = new Set();
  const lineFor = (id) => revisitLines.find((li) => li.dataset.for === id);

  // One question at a time: the steps are the questions and then how you did.
  // There is no nav on a page that shows every question at once, so this is
  // also how the script tells the two apart.
  const nav = document.getElementById("nav");
  const back = document.getElementById("back");
  const next = document.getElementById("next");
  const heading = document.getElementById("questions-heading");
  const steps = nav ? [...questions, document.getElementById("summary")] : [];
  let at = 0;

  function show(n, move) {
    at = Math.max(0, Math.min(steps.length - 1, n));
    for (let i = 0; i < steps.length; i++) steps[i].hidden = i !== at;
    back.hidden = at === 0;
    next.hidden = at === steps.length - 1;
    // The heading goes when the questions do, so how you did is not sitting
    // under a heading for a list with nothing in it.
    heading.hidden = at === steps.length - 1;
    next.textContent = at === steps.length - 2 ? "See how you did" : "Next question";
    if (!move) return;
    steps[at].scrollIntoView({ block: "start" });
    steps[at].focus({ preventScroll: true });
  }

  if (nav) {
    back.addEventListener("click", () => show(at - 1, true));
    next.addEventListener("click", () => show(at + 1, true));
    show(0, false);
    nav.hidden = false;
  }

  function updateTally() {
    const done = answered.size;
    const right = done - missed.size;
    const said = [];
    if (!choiceQs.length) said.push("There are no choice questions here, so there is nothing to tally.");
    else if (!done) said.push("Answer a question and the tally appears here.");
    else if (done < choiceQs.length) said.push(done + " of " + choiceQs.length + " choice questions answered so far, and " + right + " of those are right.");
    else said.push("You answered all " + choiceQs.length + " choice questions and got " + right + " of them right.");
    if (writtenCount === 1) said.push("The written question is not marked.");
    else if (writtenCount > 1) said.push("The " + writtenCount + " written questions are not marked.");
    tally.textContent = said.join(" ");
    revisit.hidden = !revisitLines.some((li) => !li.hidden);
  }

  for (const q of choiceQs) {
    const inputs = [...q.querySelectorAll("input[type=radio]")];
    for (const input of inputs) {
      input.addEventListener("change", () => {
        if (q.dataset.answered) return;
        q.dataset.answered = "yes";
        const correct = input.value === q.dataset.answer;
        for (const other of inputs) {
          const label = other.closest(".choice");
          const isAnswer = other.value === q.dataset.answer;
          const isPick = other === input;
          label.classList.toggle("is-answer", isAnswer);
          label.classList.toggle("is-pick", isPick);
          const flag = label.querySelector(".flag");
          if (isAnswer && isPick) flag.textContent = "\\u2713 you picked this, and it is the answer";
          else if (isAnswer) flag.textContent = "\\u2713 this is the answer";
          else if (isPick) flag.textContent = "\\u2717 you picked this";
          else flag.textContent = "";
          // The picked one stays open so a keyboard is not left standing on a
          // dead control. See WHERE THE FOCUS GOES in build-quiz-page.mjs.
          other.disabled = !isPick;
        }
        q.querySelector(correct ? ".verdict-right" : ".verdict-missed").hidden = false;
        answered.add(q.id);
        if (!correct) {
          missed.add(q.id);
          const line = lineFor(q.id);
          if (line) line.hidden = false;
        }
        updateTally();
      });
    }
  }

  for (const q of questions.filter((x) => x.dataset.form === "written")) {
    const button = q.querySelector(".reveal");
    const box = q.querySelector("textarea");
    const wrote = q.querySelector(".wrote");
    button.addEventListener("click", () => {
      const written = box.value.trim();
      wrote.textContent = written || "You left this one blank.";
      wrote.classList.toggle("blank", !written);
      box.readOnly = true;
      // Closing this button would drop the focus, so the question takes it.
      const held = document.activeElement === button;
      button.disabled = true;
      q.querySelector(".verdict-written").hidden = false;
      if (held) q.focus();
    });
  }

  document.getElementById("again").addEventListener("click", () => {
    for (const q of questions) {
      delete q.dataset.answered;
      for (const verdict of q.querySelectorAll(".verdict")) verdict.hidden = true;
      for (const input of q.querySelectorAll("input[type=radio]")) { input.checked = false; input.disabled = false; }
      for (const label of q.querySelectorAll(".choice")) {
        label.classList.remove("is-answer", "is-pick");
        label.querySelector(".flag").textContent = "";
      }
      const box = q.querySelector("textarea");
      if (box) { box.value = ""; box.readOnly = false; }
      const button = q.querySelector(".reveal");
      if (button) button.disabled = false;
    }
    answered.clear();
    missed.clear();
    for (const line of revisitLines) line.hidden = true;
    updateTally();
    if (nav) show(0, true);
    else questions[0].scrollIntoView({ block: "start" });
  });

  updateTally();
})();`;

/**
 * The page, whole, from the quiz and the name it will be staged under.
 *
 * The name is the same slug the staging step uses, so the page can say where
 * its own questions live: the quiz file sits beside it under that name, and
 * whoever wants different questions edits that file and builds again rather
 * than hunting for the job folder it came out of.
 *
 * The reading is optional and only ever adds: it is where the places a missed
 * question links back to are written. See backTo.
 *
 * The brand is what brandFrom made of the profile that came with the job, or
 * nothing. It is handed in already read rather than read here, so the page and
 * the record of what the profile changed come out of one reading of it: a
 * record built from a second reading could say a field was applied that the
 * page never took.
 */
export function buildQuizPage(quiz, name, reading, brand = null, { credit = false } = {}) {
  if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) throw new Error("the quiz is not a quiz: it should be the object write-the-questions wrote");
  if (!SLUG.test(String(name ?? ""))) throw new Error(`the name must be a lowercase slug, the same one the staging step uses, and this one is ${name}`);
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  if (!questions.length) throw new Error("the quiz carries no questions, and a page with nothing to answer is not a quiz");
  questions.forEach((q, i) => checkQuestion(q, `question ${i + 1}`));

  const view = viewOf(quiz);
  const tokens = { ...(brand?.tokens ?? DEFAULT_TOKENS), accent: accentOf(quiz, brand) };
  const concepts = indexBy(quiz.concepts);
  const phraseFor = (q) => String(concepts.get(String(q?.concept ?? ""))?.phrase ?? "").trim();
  const count = questions.length;
  const idFor = (i) => `q${i + 1}`;

  const body = questions.map((q, i) => (q.form === "choice"
    ? renderChoice(quiz, reading, q, idFor(i), i + 1, count, phraseFor(q))
    : renderWritten(quiz, reading, q, idFor(i), i + 1, count, phraseFor(q)))).join("\n");
  const revisits = questions.map((q, i) => (q.form === "choice" ? renderRevisit(quiz, reading, q, idFor(i), i + 1, phraseFor(q)) : "")).filter(Boolean).join("\n");

  // The way forward and back, written only where the quiz is shown one
  // question at a time, and hidden until the script that works them takes
  // over. Two buttons that do nothing are worse than no buttons at all, which
  // is what a browser with scripting turned off would otherwise be handed.
  const nav = view === "one-at-a-time"
    ? `
  <nav class="nav" id="nav" aria-label="Moving through the questions" hidden>
    <button type="button" id="back" hidden>Back</button>
    <button type="button" id="next" class="next">Next question</button>
  </nav>`
    : "";

  const title = String(quiz.title ?? "").trim() || `The quiz called ${name}`;
  const audience = String(quiz.audience ?? "").trim();
  const sources = (Array.isArray(quiz.made_from) ? quiz.made_from : []).map((s) => {
    const named = String(s?.name ?? "").trim() || String(s?.id ?? "").trim();
    if (!named) return "";
    const address = webAddress(s?.address, `the source called ${named}`);
    return address ? `<a href="${esc(address)}">${esc(named)}</a>` : esc(named);
  }).filter(Boolean);

  const page = `<!DOCTYPE html>
<!-- The questions on this page came from ${esc(name)}.json, which sits beside it. To change them, change that file and build the page again. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="${esc(quiz.robots ?? "noindex")}">
<style>
${styles(tokens)}
</style>
</head>
<body>
<div class="sheet">

<header class="top">
  <p class="kicker">A quiz</p>
  <h1>${esc(title)}</h1>
${audience ? `  <p class="audience">This quiz is for ${esc(audience)}.</p>\n` : ""}</header>

<noscript>
  <p>Your browser has scripting turned off, so nothing here will be marked and no answers will appear. The questions are all readable as they are.</p>
</noscript>

<main data-view="${view}">
  <h2 id="questions-heading">The questions</h2>
  <ol class="questions">
${body}
  </ol>

  <section class="summary" id="summary" aria-labelledby="summary-heading" tabindex="-1">
    <h2 id="summary-heading">How you did</h2>
    <p id="tally" role="status" aria-live="polite">Answer a question and the tally appears here.</p>
    <div class="revisit" id="revisit" hidden>
      <h3>Concepts to go back over</h3>
      <ul id="revisit-list">
${revisits}
      </ul>
    </div>
    <p class="again">
      <button type="button" id="again">Start again</button>
    </p>
    <p class="note">Starting again clears your answers on this page. There was nothing kept to clear anywhere else.</p>
  </section>
${nav}
${sources.length ? `  <div class="colophon">\n    <p>Written from ${joinNames(sources)}.</p>\n  </div>\n` : ""}</main>
${credit ? `\n<footer class="credit">\n  <p>Built by <a href="https://agentmesh.ai">AgentMesh</a>.</p>\n</footer>\n` : ""}
</div>
<script>
${behaviour}
</script>
</body>
</html>
`;

  // A profile that requires meaning never to be carried by color alone is
  // checked against the page rather than taken on trust. Every verdict here
  // already carries a word and a glyph beside its color, which is what makes
  // the answer honest for a brand that asks for it, and this is what keeps it
  // true the day somebody simplifies the markup.
  if (tokens.neverHueAlone && questions.some((q) => q.form === "choice")) {
    for (const said of ["&#10003;</span> Right", "&#10007;</span> Not this one"]) {
      if (!page.includes(said)) throw new Error("the profile says meaning must never be carried by color alone, and a verdict on this page carries no word and no glyph beside its color");
    }
  }
  return page;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const { QUIZ, OUT, NAME, READING, PROFILE } = process.env;
  if (!QUIZ || !OUT || !NAME) { console.error("refused: QUIZ, OUT and NAME are required, and NAME is the slug the page will be staged under"); process.exit(2); }
  try {
    const quiz = JSON.parse(readFileSync(QUIZ, "utf8"));
    const reading = READING ? JSON.parse(readFileSync(READING, "utf8")) : undefined;
    const brand = PROFILE ? brandFrom(JSON.parse(readFileSync(PROFILE, "utf8")), { quizAccent: quiz.accent }) : null;
    const credit = creditOn(process.env);
    const page = buildQuizPage(quiz, NAME, reading, brand, { credit });
    writeFileSync(OUT, page);
    const choice = quiz.questions.filter((q) => q.form === "choice").length;
    const nowhere = quiz.questions.filter((q) => !backTo(quiz, q, reading)).length;
    const shown = viewOf(quiz) === "all-at-once" ? "all of them on one page" : "one question at a time";
    console.log(`built ${OUT}: ${quiz.questions.length} questions, ${choice} of them marked in the browser, ${quiz.questions.length - choice} written and not marked, shown ${shown}${credit ? ", with the Built by AgentMesh footer" : ""}`);
    if (nowhere) console.log(`${nowhere} of them name no place to go back to, so those questions show their answer and say nothing about where it is taught${READING ? "" : "; the reading is where the places live, and READING was not set"}`);
    if (brand) {
      const kept = brand.not_applied.length;
      console.log(`the brand profile set ${brand.applied.length} of this page's fields, ${brand.not_present.length} of the fields this page reads were not in it, and ${kept} ${kept === 1 ? "was" : "were"} read and not applied`);
      for (const n of brand.not_applied) console.log(`not applied, ${n.field}: ${n.why}`);
    }
  } catch (e) {
    console.error(`refused: ${e.message}`);
    process.exit(1);
  }
}
