---
name: make-a-quiz
description: when somebody has material they want understood and wants to find out whether a person who read or watched it took it in
---

# Make a quiz

Part of quiz-maker. when somebody has material they want understood and wants to find out whether a person who read or watched it took it in

## When to use this

when somebody has material they want understood and wants to find out whether a person who read or watched it took it in

## What this needs

- transcript (text/vtt, optional)
- document (document, optional)
- page address (url, optional)
- beat script (text, optional)
- notes (text, optional)
- audience (text, optional)
- how many questions (identifier, optional)
- concept list (text, optional)

## What a good result looks like

A quiz at an address the person can open and take, every question naming the concept it tests, the place in the source the answer came from, and the place to go back to when it is missed; and beside it the concept list the questions were written from.

## What it produces

- concept list (text, per task)
- quiz (application/json, per task)
- quiz page (text/html, per task)
- quiz address (url, per task)

## When it comes back empty

If the source settles no audience, send back that one question and write nothing. If the source is too thin to test, say which concepts it carries and let the person decide whether that is a quiz worth having.

## How to do it

Run `WORK=<work folder> RECORDS=<records folder> JOB_DIR=<job folder> [SOURCES=<json>] [AUDIENCE=<text>] [CONCEPTS=<file or the text>] [HOW_MANY=<n>] [NAME=<slug>] node scripts/make-quiz.mjs`. It runs the five steps in order, calls a model at the two points that are judgment, and prints one JSON object with a reply field. Do not improvise any step it covers: the first multi-agent run failed three times by leaving a written procedure to a model, and everything after the questions are written is mechanics.

A context bag that came with the message is read from the job folder, and nothing has to be passed for it: a brand profile in the bag colors the page and sets its faces, and any entry that is words rather than a shape is carried into both model requests as the caller's own notes, marked as theirs. The bag is found by the schema each entry names and never by what the entry is called. What the profile changed is filed with the job as used.json, and the reply says the three counts. A message with no bag makes the quiz exactly as it always did.

At least one source is required: a transcript, a document, a page address, a beat script, or notes. More than one is fine and they are read together. The audience decides what the questions are, because the same material tested for a new hire and for an expert is two different quizzes. When no audience is given and the source does not settle one, reply with that one question and write nothing.

Naming the concepts is the cheap moment to say the quiz is about the wrong things, so it is also offered on its own. Given a concept list, this job uses it as it stands and names none: a person who has approved a list must get that list back rather than a fresh attempt at it. Given none, it names them and carries on, and the list is delivered as its own piece either way so the person can see what was tested and ask for that step again.

Every message arrives with a line `job folder: <absolute path>` naming a folder for that message's job. The concept list, the quiz, the page and the address are the pieces, written under that folder's out/ and listed in pieces.json by scripts/pieces.mjs. The source as received, the reading and the coverage check are records under records/<job>/ and never go in pieces.json. A reply sent without pieces.json carries no job, so the script writes it before replying.

## Scripts

Run these from this skill's folder; each one says what it needs at the top.

- scripts/make-quiz.mjs
- scripts/went-without.mjs
- scripts/read-source.mjs
- scripts/check-quiz.mjs
- scripts/build-quiz-page.mjs
- scripts/stage-quiz.mjs
- scripts/pieces.mjs
- scripts/package.json

## References

- references/rules.md
- references/shapes.md
- references/question-forms.md
