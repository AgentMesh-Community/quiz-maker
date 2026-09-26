---
name: name-the-concepts
description: when the source has been read and nobody has yet said what the quiz is about, or when a person wants the concepts settled before paying for questions
---

# Name the concepts

Part of quiz-maker. when the source has been read and nobody has yet said what the quiz is about, or when a person wants the concepts settled before paying for questions

## When to use this

when the source has been read and nobody has yet said what the quiz is about, or when a person wants the concepts settled before paying for questions

## What this needs

- reading (application/json, required)
- audience (text, optional)
- notes (text, optional)

## What a good result looks like

A short list of the concepts this material teaches this audience, each one a plain phrase, each with the one sentence a person would have to be able to say to have understood it, and each naming where in the source it is taught.

## What it produces

- concept list (text, per task)

## When it comes back empty

If the source settles no audience, reply with that one question and name no concepts. If the material teaches nothing testable, say so plainly rather than inventing concepts to fill a list.

## How to do it

Write the concepts this material teaches the stated audience, in the order the source teaches them. Each one is a plain phrase, the one sentence somebody would have to be able to say to have understood it, and the place in the reading where it is taught. A concept the source mentions but does not explain is not a concept: list it under a closing line saying it was mentioned and not taught, so the person can decide whether the source is the problem.

A beat script carries its own words panel, and when one is the source those words are the concept list unless the person says otherwise. Do not name a second set beside them.

This list goes to the person before any question is written.

The list also carries the title of the quiz and the audience it is written for, because the list is already the statement of what the quiz is about and both should be settled with the person at the same moment the concepts are.

## References

- references/rules.md
- references/shapes.md
