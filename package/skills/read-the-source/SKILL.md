---
name: read-the-source
description: when the material has arrived and nothing has been read from it yet
---

# Read the source

Part of quiz-maker. when the material has arrived and nothing has been read from it yet

## When to use this

when the material has arrived and nothing has been read from it yet

## What this needs

- transcript (text/vtt, optional)
- document (document, optional)
- page address (url, optional)
- beat script (text, optional)
- notes (text, optional)

## What a good result looks like

One plain reading of everything given, with a place name on every part of it: a cue time for a transcript, a step number for a beat script, a heading or page for a document, a heading for a page address.

## What it produces

- reading (application/json, per task)

## When it comes back empty

If nothing was given that can be read, say what arrived and stop. Never write a quiz from the message text alone.

## How to do it

Read every source given into one reading, an array of parts, each with its text and its place: a cue time for a transcript, a step number for a beat script, a heading or page number for a document, a heading for a fetched page. The place is what every later question cites, so a part with no place is not written. A page address must open without a sign-in, and a credential pasted into a message is refused.

## Scripts

Run these from this skill's folder; each one says what it needs at the top.

- scripts/read-source.mjs
- scripts/package.json

## References

- references/shapes.md
