---
name: stage-the-quiz
description: when the questions have passed the check
---

# Stage the quiz

Part of quiz-maker. when the questions have passed the check

## When to use this

when the questions have passed the check

## What this needs

- quiz (application/json, required)

## What a good result looks like

A self-contained page at an address the person can open, which asks the questions, marks the choice questions as they are answered, shows a written answer beside the answer a person should be able to give, and links every missed question back to where it is taught.

## What it produces

- quiz page (text/html, per task)
- quiz address (url, per task)

## When it comes back empty

If the page cannot be placed, say where it failed and keep the quiz as a file, so the questions are not lost with the staging.

## How to do it

Build one self-contained page from the quiz and place it at the draft host under its own name. The page shows one question at a time, each with its verdict and the reason once it is answered, a way forward and back, and the tally at the end; a quiz whose `view` says all-at-once puts every question on one long page instead. The page marks the choice questions in the browser as they are answered and shows, for each, the sentence saying why the right answer is right and a link back to where the concept is taught. A written question shows the answer a person should be able to give once they have answered it. The page sends nothing anywhere and stores nothing: it is a person checking themselves.

The quiz file is placed beside the page under the same name, so the questions can be replaced without the page being rebuilt.

## Scripts

Run these from this skill's folder; each one says what it needs at the top.

- scripts/build-quiz-page.mjs
- scripts/stage-quiz.mjs
- scripts/pieces.mjs

## References

- references/shapes.md
