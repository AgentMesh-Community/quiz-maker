// Stage the quiz where a person can open it: the page and, beside it under the
// same name, the quiz the page was built from, each with a short cache life so
// a re-stage shows within a minute and nothing needs invalidating.
//   needs: node >= 22, network to the draft host,
//   DRAFT_HOST_CREDENTIAL (the credential named draft-host-writer: a service-account key, as JSON),
//   DRAFT_HOST_BUCKET, DRAFT_HOST_PREFIX, DRAFT_HOST_URL (settings the host places)
//   PAGE=<page.html> QUIZ=<quiz.json> NAME=<slug> [STAGED=<record path>] node stage-quiz.mjs
// Prints the quiz address last. Leaves the manifest of what was staged, with
// the hash of the page and the quiz and the local path each was read from, at
// STAGED (default staged.json in the cwd); pieces.mjs reads it to fill a job folder.
//
// The quiz file goes up beside the page, not because the page reads it (the
// page reads nothing: it sends nothing anywhere and asks for nothing) but so
// that the questions and the page that asks them stay together. Somebody who
// wants different questions edits the file that sits beside the page and
// builds again, without going back to the job folder it came out of.
//
// Writes under the draft prefix and nowhere else: putting the quiz in front of
// anybody is the person's decision, not this step's.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, createSign } from "node:crypto";
import { resolve } from "node:path";

const refuse = (sentence, code = 2) => { console.error(`refused: ${sentence}`); process.exit(code); };

const { DRAFT_HOST_CREDENTIAL, DRAFT_HOST_BUCKET, DRAFT_HOST_URL, PAGE, QUIZ, NAME } = process.env;
const PREFIX = process.env.DRAFT_HOST_PREFIX || "draft/";
if (!DRAFT_HOST_CREDENTIAL || !DRAFT_HOST_BUCKET || !DRAFT_HOST_URL || !PAGE || !QUIZ || !NAME) {
  refuse("PAGE, QUIZ, NAME, DRAFT_HOST_CREDENTIAL, DRAFT_HOST_BUCKET and DRAFT_HOST_URL are all required");
}
if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(NAME)) refuse(`NAME must be a lowercase slug, and this one is ${NAME}`);
if (!PREFIX.endsWith("/") || PREFIX.startsWith("/") || PREFIX.includes("..")) refuse(`DRAFT_HOST_PREFIX must be a folder like draft/, and this one is ${PREFIX}`);

let key;
try { key = JSON.parse(DRAFT_HOST_CREDENTIAL); } catch { refuse("DRAFT_HOST_CREDENTIAL is not a service-account key"); }
if (!key.client_email || !key.private_key) refuse("DRAFT_HOST_CREDENTIAL has no client_email or no private_key in it");

// One short-lived access token from the placed key, scoped to object writes.
const b64u = (b) => Buffer.from(b).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claims = b64u(JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/devstorage.read_write",
  aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 }));
const signer = createSign("RSA-SHA256");
signer.update(`${header}.${claims}`);
const assertion = `${header}.${claims}.${b64u(signer.sign(key.private_key))}`;
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
});
if (!tokenRes.ok) refuse(`the draft host would not take the credential: ${tokenRes.status} ${(await tokenRes.text()).slice(0, 200)}`, 1);
const { access_token } = await tokenRes.json();

async function put(objectName, bytes, contentType) {
  const boundary = `quiz-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: objectName, contentType, cacheControl: "public, max-age=60" });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(DRAFT_HOST_BUCKET)}/o?uploadType=multipart`, {
    method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) refuse(`${objectName} was not placed: ${res.status} ${(await res.text()).slice(0, 300)}`, 1);
  console.log(`staged ${objectName} (${bytes.length} bytes)`);
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

const staged = { name: NAME, at: new Date().toISOString(), url: `${DRAFT_HOST_URL}${NAME}.html`, page: null, quiz: null };
const page = readFileSync(PAGE);
await put(`${PREFIX}${NAME}.html`, page, "text/html; charset=utf-8");
staged.page = { object: `${PREFIX}${NAME}.html`, sha256: sha(page), path: resolve(PAGE) };
// The quiz takes the page's name, not its own local one: the page says in its
// first line that its questions live at <name>.json beside it, and the two
// names have to be the same name for that to be true.
const quiz = readFileSync(QUIZ);
await put(`${PREFIX}${NAME}.json`, quiz, "application/json; charset=utf-8");
staged.quiz = { object: `${PREFIX}${NAME}.json`, sha256: sha(quiz), path: resolve(QUIZ) };

writeFileSync(process.env.STAGED || "staged.json", JSON.stringify(staged, null, 2) + "\n");
console.log(staged.url);
