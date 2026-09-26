---
name: check-the-questions
description: when the questions are written and before anything is staged
---

# Check the questions

Part of quiz-maker. when the questions are written and before anything is staged

## When to use this

when the questions are written and before anything is staged

## What this needs

- quiz (application/json, required)
- concept list (text, required)

## What a good result looks like

Every mechanical fault found and named at once: a right answer that is not among the choices, a question on a concept the list does not carry, a place to go back to that does not exist, a right answer that is the longest choice, two choices that mean the same thing, a choice reading all of the above, and stacked negation.

## What it produces

- coverage (application/json, per task)

## When it comes back empty

When nothing is wrong, say so in one line. Never stage a quiz that was not checked.

## How to do it

Check the quiz by program and write the coverage record: every concept from the list, and for each the questions that test it or the reason it was left. The faults below are refusals rather than findings, and a quiz carrying one is not staged: a right answer that is not among the choices, a question naming a concept the list does not carry, a place to go back to that the source does not have, a right answer that is the longest choice, two choices that mean the same thing, a choice reading all of the above or none of the above, and a question carrying two negations. Report every fault at once rather than the first, so a rewrite fixes them together.

## Scripts

Run these from this skill's folder; each one says what it needs at the top.

- scripts/check-quiz.mjs

## References

- references/shapes.md
