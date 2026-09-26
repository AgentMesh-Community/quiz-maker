// Read every source a person gave into one reading, with a place name on
// every part. Every later question cites a place, and a part with no place
// cannot be cited, so a part that cannot be placed is not written.
//   needs: node >= 22; the network only when a page address is given
//   SOURCES=<json array> OUT=records/<job>/reading.json node read-source.mjs
// SOURCES is a JSON array of { kind, path | address | text, name }, where kind
// is one of transcript, beat-script, document, page, notes. The same sources
// can arrive one to a variable instead, and the two forms can be mixed:
//   TRANSCRIPT=<file> BEAT_SCRIPT=<file> DOCUMENT=<file,file>
//   PAGE=<https address> NOTES=<the text, or a file holding it>
// Writes the reading in the shape references/shapes.md gives, and prints one
// line saying what was read.
// Exit: 0 read; 1 refused, and the one sentence saying why is printed; 2 the
// settings are not right.
//
// No local file path is ever written into the reading. A source carries a
// bare file name, and an address only when it has a real web address, because
// the reading travels to the person and to every step after this one.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const READING = "v1";
export const KINDS = ["transcript", "beat-script", "document", "page", "notes"];
// The text-shaped files a document may be. Anything else is refused by name
// rather than guessed at, because a quiz written from mojibake is worse than
// no quiz.
export const DOCUMENT_EXTENSIONS = [".md", ".txt", ".html", ".vtt", ".json"];
export const PAGE_TIMEOUT_MS = 10_000;
export const PAGE_BYTES = 512 * 1024;

// A part is a sentence or two, never a three-word cue fragment: a cue is
// joined to the ones around it until the words make a sentence and there are
// enough of them to cite, and no part grows past the ceiling.
export const MERGE_FLOOR_WORDS = 12;
export const MERGE_CEILING_WORDS = 60;

/** What this step will not read, in one plain sentence. The caller prints it
 *  as `refused: <sentence>` and stops. `settings` marks the ones that are the
 *  caller's to fix rather than the material's, which is the only thing the
 *  exit code tells apart. */
export class Refusal extends Error {
  constructor(why, { settings = false } = {}) { super(why); this.name = "Refusal"; this.settings = settings; }
}
const refuse = (why) => { throw new Refusal(why); };
const refuseSettings = (why) => { throw new Refusal(why, { settings: true }); };

const trim = (s) => String(s ?? "").trim();
const splitList = (value) => String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const wordCount = (s) => String(s ?? "").split(/\s+/).filter(Boolean).length;

/** A file name with no folders in front of it, whichever kind of separator
 *  the path came with. This is the only name that reaches the reading. */
export const bareName = (path) => trim(path).split(/[\\/]/).pop() || "";

/** One text with its blank lines kept and everything else tidied. */
export const squash = (s) => String(s ?? "")
  .replace(/\r\n?/g, "\n")
  .split("\n").map((line) => line.replace(/[^\S\n]+/g, " ").trim()).join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

// ── text out of markup ──────────────────────────────────────────────────────

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

/** The named and numbered entities a page uses, as the characters they stand
 *  for. An entity nobody listed is left as it was written rather than dropped. */
export function decodeEntities(text) {
  return String(text ?? "").replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const n = /^#[xX]/.test(body) ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const BLOCK_END = /<\/(?:p|div|section|article|li|tr|td|th|h[1-6]|blockquote|pre|figcaption)\s*>|<br\s*\/?>/gi;
const HIDDEN = /<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi;

/** Markup to the words a reader sees. What a page runs or paints with is not
 *  words a question can be written from, so it goes before anything is read. */
export function stripTags(html) {
  return squash(decodeEntities(String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(HIDDEN, " ")
    .replace(BLOCK_END, "\n")
    .replace(/<[^>]*>/g, " ")));
}

// ── a transcript ────────────────────────────────────────────────────────────

/** "00:01:02.345", "01:02.345" or "01:02" to seconds, or null when it is not
 *  a time. Both the WebVTT full stop and the SubRip comma are read. */
export function parseTime(value) {
  const m = trim(value).match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + Number((m[4] ?? "0").padEnd(3, "0")) / 1000;
}

/** A WebVTT file to its cues, each { start, end, text }. The header, notes,
 *  styles and regions are not cues; inline word timing and voice tags are
 *  taken off the words. */
export function parseVtt(text) {
  const src = String(text ?? "").replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  const cues = [];
  for (const block of src.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [from, to] = lines[at].split("-->").map((x) => x.trim().split(/\s+/)[0]);
    const start = parseTime(from);
    if (start === null) continue;
    const end = parseTime(to);
    const body = lines.slice(at + 1).join("\n").replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/g, " ");
    const cueText = stripTags(body);
    if (!cueText) continue;
    cues.push({ start, end: end === null ? start : end, text: cueText });
  }
  return cues;
}

const ENDS_SENTENCE = /[.!?]["'’”)\]]*$/;

/** Consecutive cues that are one sentence, as one part. A cue is held open
 *  until the words end a sentence and there are enough of them to be worth
 *  citing; a repeated line, which is how rolling captions are written, is
 *  passed over rather than said twice. */
export function mergeCues(cues) {
  const out = [];
  let open = null;
  let previous = null;
  const close = () => { if (open) out.push(open); open = null; };
  for (const cue of cues ?? []) {
    if (previous !== null && cue.text === previous) continue;
    previous = cue.text;
    if (!open) open = { start: cue.start, end: cue.end, text: cue.text };
    else {
      open.end = Math.max(open.end, cue.end);
      open.text = `${open.text} ${cue.text}`;
    }
    const words = wordCount(open.text);
    if (words >= MERGE_CEILING_WORDS) close();
    else if (words >= MERGE_FLOOR_WORDS && ENDS_SENTENCE.test(open.text)) close();
  }
  close();
  return out;
}

/** The cue time as a person says it: "at 1:23", and "at 1:00:05" past an hour. */
export function timeLabel(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `at ${h}:${pad(m)}:${pad(s)}` : `at ${m}:${pad(s)}`;
}

/** A transcript to parts placed at their cue times. */
export function partsFromVtt(text) {
  return mergeCues(parseVtt(text)).map((cue) => {
    const at = Math.max(0, Math.floor(cue.start));
    return { place: { kind: "time", value: at, label: timeLabel(at), fragment: `t=${at}` }, text: cue.text };
  });
}

// ── a beat script ───────────────────────────────────────────────────────────

/** The beat script as an object, or null when the text is not one. A beat
 *  script is JSON with a steps array; nothing else is read as one. */
export function parseBeatScript(value) {
  let script = value;
  if (typeof value === "string") {
    try { script = JSON.parse(value); } catch { return null; }
  }
  return script && typeof script === "object" && Array.isArray(script.steps) ? script : null;
}

// The members of a step that are not words on the canvas: the layout names a
// shape, the stage is a number, the words are ids into the words panel, and
// the narration is added first so it leads the part.
const NOT_ON_SCREEN = new Set(["layout", "stage", "narration", "words"]);
const sameLine = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every line a step puts on the canvas, in the order the script writes them,
 *  with a line that repeats one already taken said once. A title and a heading
 *  are usually the same sentence with a full stop added, and printing both
 *  would put it in the reading twice. */
export function onScreenText(step) {
  const out = [];
  const seen = new Set();
  const take = (value) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") {
      const line = trim(value);
      if (!line) return;
      const key = sameLine(line);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(line);
      return;
    }
    if (Array.isArray(value)) { for (const v of value) take(v); return; }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) if (!NOT_ON_SCREEN.has(k)) take(v);
    }
  };
  for (const [k, v] of Object.entries(step ?? {})) if (!NOT_ON_SCREEN.has(k)) take(v);
  return out;
}

/** A beat script to one part a step, placed by step number. The part is what
 *  the step says out loud and what it puts on the canvas, which together are
 *  everything that step teaches. */
export function partsFromBeatScript(value) {
  const script = parseBeatScript(value);
  if (!script) return [];
  return script.steps.map((step, i) => {
    const n = i + 1;
    const text = squash([trim(step?.narration), ...onScreenText(step)].filter(Boolean).join("\n"));
    return { place: { kind: "step", value: n, label: `step ${n}`, fragment: `s${n}` }, text };
  }).filter((part) => part.text);
}

/** The words panel of a beat script, as it was written, or null when it has
 *  none. It is carried into the reading whole because the concept step reads
 *  it as the concept list, and a summary of it would be a second list. */
export function wordsOfBeatScript(value) {
  const script = parseBeatScript(value);
  return Array.isArray(script?.words) && script.words.length ? script.words : null;
}

// ── a page or an html document ──────────────────────────────────────────────

const HEADING = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi;

/** The anchor a heading carries, from its own id or from an anchor inside it,
 *  or an empty string when it has none. A part with no anchor is cited by its
 *  label and links to the page. */
function anchorOf(attributes, inner) {
  const own = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i.exec(attributes ?? "");
  if (own) return trim(own[1] ?? own[2] ?? own[3]);
  const nested = /(?:^|\s)(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i.exec(inner ?? "");
  return nested ? trim(nested[1] ?? nested[2] ?? nested[3]) : "";
}

/** Read the page's own title out of its markup, trimmed to a length a place
 *  name can carry. */
export function titleOfHtml(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? ""));
  return squash(decodeEntities(m?.[1] ?? "")).slice(0, 80);
}

/** An html page to parts split on its first three levels of heading. What
 *  comes before the first heading is placed by the page's title when it has
 *  one, and on page one when it does not, because text with no place is text
 *  no question can cite. */
export function partsFromHtml(html, { title } = {}) {
  const cleaned = String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(HIDDEN, " ");
  const pageTitle = trim(title) || titleOfHtml(cleaned);
  const body = cleaned.replace(/<head\b[\s\S]*?<\/head\s*>/gi, " ");
  const heads = [...body.matchAll(HEADING)];
  const parts = [];
  const lead = stripTags(body.slice(0, heads.length ? heads[0].index : body.length));
  if (lead) {
    parts.push(pageTitle
      ? { place: { kind: "heading", value: pageTitle, label: pageTitle }, text: lead }
      : { place: { kind: "page", value: 1, label: "page 1" }, text: lead });
  }
  heads.forEach((head, i) => {
    const heading = stripTags(head[3]);
    if (!heading) return;
    const from = head.index + head[0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const text = stripTags(body.slice(from, to));
    if (!text) return;
    const place = { kind: "heading", value: heading, label: heading };
    const anchor = anchorOf(head[2], head[3]);
    if (anchor) place.fragment = anchor;
    parts.push({ place, text });
  });
  return parts;
}

// ── a text or markdown document ─────────────────────────────────────────────

const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT = /^(?:={3,}|-{3,})\s*$/;

/** A markdown heading as the words a person reads, since the label is printed
 *  beside a question and back-ticks are not words. Only the markers that are
 *  always markup come off: a link reads as its words, a code span reads as
 *  what is inside it, and a pair of stars comes off. A lone star or underscore
 *  is left alone, because a subject like `mesh.feed.*.*` and a name like
 *  `hold_id` are the heading, not emphasis around it. */
export const plainHeading = (text) => squash(String(text ?? "")
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/`+([^`]*)`+/g, "$1"));

/** A markdown or plain text file to parts split on its headings. A text file
 *  carries no anchors of its own, so a heading here has a label and no
 *  fragment; what comes before the first heading is placed on page one. */
export function partsFromText(text) {
  let src = String(text ?? "").replace(/\r\n?/g, "\n");
  // Front matter is the file's own bookkeeping and teaches nobody anything.
  const front = /^---\n[\s\S]*?\n---\n/.exec(src);
  if (front) src = src.slice(front[0].length);
  const lines = src.split("\n");
  const parts = [];
  let heading = null;
  let buffer = [];
  let fenced = false;
  const flush = () => {
    const body = squash(buffer.join("\n"));
    buffer = [];
    if (!body) return;
    parts.push(heading
      ? { place: { kind: "heading", value: heading, label: heading }, text: body }
      : { place: { kind: "page", value: 1, label: "page 1" }, text: body });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; buffer.push(line); continue; }
    if (fenced) { buffer.push(line); continue; }
    const atx = ATX.exec(line);
    if (atx) { flush(); heading = plainHeading(atx[2]); continue; }
    if (trim(line) && SETEXT.test(lines[i + 1] ?? "")) { flush(); heading = plainHeading(line); i += 1; continue; }
    buffer.push(line);
  }
  flush();
  return parts;
}

/** What the person typed, as one part. There is one note and it has no
 *  fragment, so it is cited by its label. */
export function partsFromNotes(text) {
  const body = squash(text);
  return body ? [{ place: { kind: "note", label: "the notes" }, text: body }] : [];
}

// ── reading a file ──────────────────────────────────────────────────────────

/** Whether these bytes are something other than text. A file with a zero byte
 *  in it, or with control bytes through it, is not read: a quiz written from
 *  the inside of a picture would be a quiz about nothing. */
export function looksBinary(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes ?? ""), "utf8");
  const look = buf.subarray(0, 8192);
  if (!look.length) return false;
  if (look.includes(0)) return true;
  let odd = 0;
  for (const b of look) if (b < 9 || (b > 13 && b < 32) || b === 127) odd++;
  return odd / look.length > 0.1;
}

// Why a file did not open, without the path the runtime puts in its message.
const whyNoFile = (e) => {
  const code = trim(e?.code);
  if (code === "ENOENT") return "there is no file by that name";
  if (code === "EISDIR") return "it is a folder and not a file";
  if (code === "EACCES" || code === "EPERM") return "it could not be opened";
  return code || "it could not be opened";
};

/** One file as text, or a refusal naming the file and what could not be read. */
function fileText(path, label, io) {
  let bytes;
  try { bytes = io.bytes(path); }
  catch (e) { refuse(`the ${label} ${bareName(path)} could not be read: ${whyNoFile(e)}`); }
  if (looksBinary(bytes)) {
    refuse(`the ${label} ${bareName(path)} could not be read: its bytes are not text, and this step reads ${DOCUMENT_EXTENSIONS.join(", ")}`);
  }
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes ?? "");
  if (text.includes("\ufffd")) {
    refuse(`the ${label} ${bareName(path)} could not be read: its bytes are not text this step can decode`);
  }
  return text;
}

// ── fetching a page ─────────────────────────────────────────────────────────

const whyNoAnswer = (e, ms) => {
  const why = trim(e?.message) || "it did not answer";
  if (/abort|timeout|timed out/i.test(why)) return `it did not answer within ${Math.round(ms / 1000)} seconds`;
  const code = trim(e?.cause?.code);
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "there is no web address by that name";
  if (code === "ECONNREFUSED") return "the server refused the connection";
  return code ? `the connection failed: ${code}` : "the connection failed";
};

/** The body, or null when it passes the ceiling. Read a piece at a time where
 *  the runtime allows it, so a page that never ends is dropped rather than
 *  held. */
async function bodyWithin(res, limit) {
  const reader = res?.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > limit ? null : buf;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { try { await reader.cancel(); } catch { /* the page is already refused */ } return null; }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch one page and hand back its markup, the address it settled on and its
 * title. Only https is opened, a redirect off https is refused, and a file or
 * data address is never followed. `fetchFn` is handed in so a test drives the
 * whole of this without a network.
 */
export async function fetchPage(address, { fetchFn = fetch, timeoutMs = PAGE_TIMEOUT_MS, limit = PAGE_BYTES } = {}) {
  const given = trim(address);
  let url;
  try { url = new URL(given); }
  catch { refuse(`the page address ${given || "that was given"} is not a web address`); }
  if (url.protocol === "file:" || url.protocol === "data:") {
    refuse(`the page address is a ${url.protocol.replace(":", "")} address, which is never opened; a page address must be https`);
  }
  if (url.protocol !== "https:") refuse(`the page address ${url.href} is not https, and only https addresses are fetched`);
  if (url.username || url.password) refuse(`the page address for ${url.host} carries a sign-in, and a credential is never accepted`);

  let res;
  try {
    res = await fetchFn(url.href, {
      redirect: "follow",
      headers: { accept: "text/html,text/plain", "user-agent": "AgentMesh quiz-maker (reads a page a person gave)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    refuse(`the page at ${url.href} could not be read: ${whyNoAnswer(e, timeoutMs)}`);
  }

  const landed = trim(res?.url) || url.href;
  let settled;
  try { settled = new URL(landed); }
  catch { refuse(`the page at ${url.href} answered from ${landed}, which is not a web address`); }
  if (settled.protocol !== "https:") {
    refuse(`the page at ${url.href} redirected to ${settled.href}, which is not https, so nothing was read`);
  }
  if (res.status === 401 || res.status === 403) {
    refuse(`the page at ${settled.href} asks for a sign-in, and this step never signs in`);
  }
  if (!res.ok) refuse(`the page at ${settled.href} answered ${res.status}`);

  const bytes = await bodyWithin(res, limit);
  if (bytes === null) {
    refuse(`the page at ${settled.href} is larger than the ${Math.round(limit / 1024)} kilobytes this step will read`);
  }
  const html = bytes.toString("utf8");
  return { address: settled.href, title: titleOfHtml(html), html };
}

// Reading a file and fetching a page. The caller hands these in, so a test
// drives the whole of this without a disk or a network, and so the only file
// this script opens is one it was given.
export const disk = {
  bytes: (path) => readFileSync(path),
  page: (address) => fetchPage(address),
};

// ── the whole reading ───────────────────────────────────────────────────────

const NAMES = {
  transcript: "transcript", "beat-script": "beat script",
  document: "document", page: "page address", notes: "notes",
};

/** What one source contributes: its name, its address when it has one, its
 *  parts, and the words panel when it is a beat script. */
async function readOne(source, io) {
  const kind = trim(source?.kind).toLowerCase();
  const label = NAMES[kind];

  if (kind === "notes") {
    const parts = partsFromNotes(source?.text);
    if (!parts.length) refuse("the notes arrived empty, so there was nothing in them to read");
    return { name: trim(source?.name) || "the notes", parts };
  }

  if (kind === "page") {
    const page = await io.page(trim(source?.address ?? source?.path ?? source?.text));
    const parts = partsFromHtml(page.html, { title: page.title });
    if (!parts.length) refuse(`the page at ${page.address} has no readable text on it`);
    const name = bareName(source?.name) || page.title || new URL(page.address).hostname;
    return { name, address: page.address, parts };
  }

  const path = trim(source?.path ?? source?.address);
  if (!path) refuse(`a ${label} was given with no file to read`);
  const name = bareName(source?.name) || bareName(path);
  const extension = (name.match(/\.[a-z0-9]+$/i) ?? [""])[0].toLowerCase();

  let parts = [];
  let words = null;
  if (kind === "transcript") {
    parts = partsFromVtt(fileText(path, label, io));
    if (!parts.length) refuse(`the transcript ${name} could not be read: it has no cues in it`);
  } else if (kind === "beat-script") {
    const text = fileText(path, label, io);
    parts = partsFromBeatScript(text);
    if (!parts.length) refuse(`the beat script ${name} could not be read: it has no steps in it`);
    words = wordsOfBeatScript(text);
  } else {
    if (!DOCUMENT_EXTENSIONS.includes(extension)) {
      refuse(`the document ${name} could not be read: this step reads ${DOCUMENT_EXTENSIONS.join(", ")} and ${extension || "a file with no extension"} is not one of them`);
    }
    const text = fileText(path, label, io);
    if (extension === ".vtt") parts = partsFromVtt(text);
    else if (extension === ".html") parts = partsFromHtml(text);
    else if (extension === ".json") {
      parts = partsFromBeatScript(text);
      if (!parts.length) refuse(`the document ${name} could not be read: it is JSON and it is not a beat script, so there are no steps in it to place`);
      words = wordsOfBeatScript(text);
    } else parts = partsFromText(text);
    if (!parts.length) refuse(`the document ${name} could not be read: there is no text in it`);
  }

  const out = { name, parts };
  if (words) out.words = words;
  const address = trim(source?.address);
  if (address) {
    if (!/^https:\/\//i.test(address)) refuse(`the address given with the ${label} ${name} is not https, so it was not carried`);
    out.address = address;
  }
  return out;
}

/**
 * Every source into one reading, in the shape references/shapes.md gives: the
 * sources as they are named, the words panel when a beat script brought one,
 * and the parts in the order they were read, each with the place a question
 * will cite. Throws a Refusal with the reason when a source cannot be read.
 */
export async function readSources(given, io = disk) {
  const list = Array.isArray(given) ? given : [];
  if (!list.length) {
    refuse(`nothing arrived that can be read: no ${KINDS.map((k) => NAMES[k]).join(", no ")}`);
  }
  const sources = [];
  const parts = [];
  let words = null;
  for (const source of list) {
    const kind = trim(source?.kind).toLowerCase();
    if (!KINDS.includes(kind)) {
      refuse(`"${kind || "a source with no kind"}" is not a kind of source this step reads; it reads ${KINDS.join(", ")}`);
    }
    const id = `src${sources.length + 1}`;
    const read = await readOne(source, io);
    const entry = { id, kind, name: read.name };
    if (read.address) entry.address = read.address;
    sources.push(entry);
    for (const part of read.parts) {
      parts.push({ id: `p${parts.length + 1}`, source: id, place: part.place, text: part.text });
    }
    if (read.words) words = [...(words ?? []), ...read.words];
  }
  if (!parts.length) {
    refuse(`nothing could be read from ${sources.map((s) => s.name).join(", ")}: there is no text in what arrived`);
  }
  return { reading: READING, sources, ...(words ? { words } : {}), parts };
}

/** The sources named in the environment, from SOURCES and from the one to a
 *  variable form, in that order. Both may be given and they are read together. */
export function sourcesFromEnv(env = process.env) {
  const out = [];
  const json = trim(env.SOURCES);
  if (json) {
    let parsed;
    try { parsed = JSON.parse(json); }
    catch { refuseSettings("SOURCES is not JSON; it is a JSON array of sources, one object each"); }
    if (!Array.isArray(parsed)) refuseSettings("SOURCES is a JSON array of sources, one object each");
    out.push(...parsed);
  }
  for (const [name, kind] of [["TRANSCRIPT", "transcript"], ["BEAT_SCRIPT", "beat-script"], ["DOCUMENT", "document"]]) {
    for (const path of splitList(env[name])) out.push({ kind, path });
  }
  for (const address of splitList(env.PAGE)) out.push({ kind: "page", address });
  const notes = trim(env.NOTES);
  if (notes) {
    let text = notes;
    // The notes arrive as the words themselves, or as a file holding them.
    try { if (existsSync(notes) && statSync(notes).isFile()) text = readFileSync(notes, "utf8"); }
    catch { /* it was the words, not a file */ }
    out.push({ kind: "notes", text, name: "the notes" });
  }
  return out;
}

/** The one line the step prints when it has read everything. */
export function summarise(reading) {
  const many = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const counted = reading.sources.map((s) => `${s.name} (${reading.parts.filter((p) => p.source === s.id).length})`);
  const carried = reading.words ? `; carried ${many(reading.words.length, "word")} from the words panel` : "";
  return `read ${many(reading.sources.length, "source")} into ${many(reading.parts.length, "part")}: ${counted.join(", ")}${carried}`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const out = trim(process.env.OUT) || "reading.json";
  try {
    const reading = await readSources(sourcesFromEnv(process.env));
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, JSON.stringify(reading, null, 2) + "\n");
    console.log(summarise(reading));
  } catch (e) {
    if (e instanceof Refusal) { console.error(`refused: ${e.message}`); process.exit(e.settings ? 2 : 1); }
    console.error(`the reading failed: ${trim(e?.message) || e}`);
    process.exit(1);
  }
}
