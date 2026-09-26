# The three shapes the steps hand each other

Every step reads what the one before it wrote. These are the files that
travel. A step that writes one of these writes it whole, in this shape, and a
step that reads one may assume nothing else.

Place ids are the spine. A question cites where its answer came from and where
to go back to, and both are part ids from the reading. That is what makes a
missed question useful: it sends somebody to step seven rather than back to
the beginning.

## reading.json, written by read-the-source

```json
{
  "reading": "v1",
  "sources": [
    {
      "id": "src1",
      "kind": "transcript",
      "name": "meridian.vtt",
      "address": "https://agentmesh.ai/draft/meridian.html"
    }
  ],
  "parts": [
    {
      "id": "p7",
      "source": "src1",
      "place": {
        "kind": "step",
        "value": 7,
        "label": "step 7",
        "fragment": "s7"
      },
      "text": "The plain words of this part, as the source gave them."
    }
  ]
}
```

`sources[].kind` is one of `transcript`, `beat-script`, `document`, `page`,
`notes`. `address` is present only when the source has a web address a reader
could open; a local file path is never carried, here or anywhere else.

`place.kind` is one of `time`, `step`, `heading`, `page`, `note`.

- `time` for a transcript cue. `value` is the start in whole seconds,
  `label` reads `at 1:23`, `fragment` is `t=83`.
- `step` for a beat script. `value` is the step number counting from one,
  `label` reads `step 7`, `fragment` is `s7`, which is the id the explainer
  page gives that step (`build-page.mjs`, `renderStep`).
- `heading` for a document or a fetched page. `value` is the heading text,
  `label` is the same, `fragment` is the heading's anchor when the source has
  one and absent when it does not.
- `page` for a document with numbered pages. `value` is the number, `label`
  reads `page 4`.
- `note` for what the person typed. There is one part, `label` reads
  `the notes`, and there is no fragment.

`fragment` is optional everywhere. A part with an address and a fragment can
be linked to; a part with an address and no fragment links to the page; a part
with neither is cited by its label and not linked.

### `words`, when one of the sources is a beat script

```json
{
  "words": [
    {
      "id": "hold",
      "stage": 1,
      "name": "A hold",
      "why": "money set aside when the job starts, and not yet taken"
    }
  ]
}
```

A beat script carries its own words panel: the words that explainer set out
to explain, each with the one line explaining it. When one of the sources is
a beat script, that panel is carried into the reading whole, as it was
written, as a top-level `words` beside `sources` and `parts`. Nothing is
added to it and nothing is summarised, because `name-the-concepts` reads it
as the concept list and a second list beside it would be a second quiz.

`words` is optional. It is absent when no source is a beat script, never an
empty list. When more than one beat script is read, the panels follow one
another in the order the sources were given.

## quiz.json, written by write-the-questions

```json
{
  "quiz": "v1",
  "title": "What the Meridian explainer teaches",
  "audience": "somebody new to agent pricing",
  "made_from": [
    { "id": "src1", "name": "meridian.vtt", "address": "https://agentmesh.ai/draft/meridian.html" }
  ],
  "concepts": [
    {
      "id": "c1",
      "phrase": "a hold is not a charge",
      "understood": "Money is set aside when the job starts and only taken when the work is delivered.",
      "taught_at": "p7"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "concept": "c1",
      "form": "choice",
      "asks": "A job has started and the buyer's balance has dropped. What has happened to the money?",
      "choices": [
        { "id": "a", "text": "It has been paid to the seller." },
        { "id": "b", "text": "It has been set aside and not yet taken." },
        { "id": "c", "text": "It has been refunded." },
        { "id": "d", "text": "Nothing; the balance is wrong." }
      ],
      "answer": "b",
      "because": "A hold reserves the money while the job runs, and the draw happens on delivery.",
      "from": "p7",
      "back_to": "p7"
    },
    {
      "id": "q2",
      "concept": "c2",
      "form": "written",
      "asks": "In your own words, why does the seller name the job and the platform name the amount?",
      "answer_text": "The seller knows what work it is doing; only the platform knows the buyer's terms and balance.",
      "from": "p3",
      "back_to": "p3"
    }
  ]
}
```

A `choice` question has exactly four choices with ids `a` to `d`, and `answer`
is one of those ids. A `written` question has `answer_text` and no choices.
`from` and `back_to` are part ids from the reading and are usually the same;
they differ when the answer is stated in one place and taught in another.

`concepts[].id` is `c1` upward and `questions[].id` is `q1` upward, both in
the order they were written.

### `view`, how much of the quiz is on the screen at once

```json
{
  "view": "all-at-once"
}
```

`view` is `one-at-a-time` or `all-at-once`, and it is optional. Absent means
`one-at-a-time`, which is how a quiz is taken: one question, the verdict and
the reason once it is answered, a way forward and back, and the tally at the
end. `all-at-once` puts every question on one long page, which is what
somebody wants when they are reading the whole quiz before answering any of
it, or looking back over it afterwards.

Either way the marking is the same. A choice is marked the moment it is
picked, a written answer is never marked, and the page keeps nothing and sends
nothing anywhere. The view is how much is shown, and nothing else.

A third word is refused rather than read as the default, so a quiz asking for
something the page does not do hears about it.

### `places`, the parts the quiz cites

```json
{
  "places": [
    {
      "id": "p7",
      "source": "src1",
      "place": { "kind": "step", "value": 7, "label": "step 7", "fragment": "s7" }
    }
  ]
}
```

Every part id a question names in `from` or `back_to`, copied from the reading
with its place and its source and without its text. Only the ones cited, not
the whole reading.

It is here so the quiz stands on its own. The page a person takes is built
from the quiz and links every missed question back to where its concept is
taught, and the link needs the place and the source's address, neither of
which a part id carries. The reading has both, and the reading lives in the
job's records, which is a folder that belongs to one job and will not be
beside the quiz later. A quiz staged today and rebuilt in a month would lose
every link back, silently, and a link that quietly stopped working is worse
than one that was never offered.

The text is deliberately left behind. A question cites a place so somebody can
go and read it; carrying the source's words inside the quiz would make the
quiz a copy of the material rather than a pointer into it.

## coverage.json, written by check-the-questions

```json
{
  "coverage": "v1",
  "concepts": [
    { "id": "c1", "phrase": "a hold is not a charge", "questions": ["q1"] },
    { "id": "c4", "phrase": "the micro-unit", "questions": [], "left": "testing it would be asking somebody to recall a number" }
  ],
  "faults": [
    { "question": "q3", "fault": "answer-is-longest-choice", "says": "the right answer is 74 characters and the next longest is 31" }
  ],
  "checked_by_script": [
    "every right answer is among that question's choices",
    "every question names a concept the list carries",
    "every place cited exists in the reading",
    "no right answer is a fifth longer than the next longest",
    "no two choices in a question mean the same thing",
    "no choice reads all of the above or none of the above",
    "no question carries two negations
    no right answer is built from the source's own words far more than the others are"
  ]
}
```

The fault names are a closed set, and each one is a refusal rather than a
finding. A quiz carrying any of them is not staged:

- `answer-not-a-choice`
- `unknown-concept`
- `unknown-place`
- `answer-is-longest-choice` (a fifth longer than the next, not one character longer)
- `answer-echoes-the-source` (the right answer repeats a run of four or more
  words from the cited part in the same order, and much more of one than the
  wrong choices do, so it can be picked by recognising the phrasing. Sharing the
  subject's vocabulary is expected and is not this fault)
- `same-choice-twice`
- `all-of-the-above`
- `double-negative`
- `wrong-form` (not four choices, ids not `a` to `d`, a written question with
  choices, a missing `because` on a choice question)

Every fault is reported at once rather than the first, so a rewrite fixes them
together.

A concept with no questions is not a fault. It is a `left` entry carrying the
reason, because some concepts cannot be tested without asking somebody to
recall a number or a name that does not matter, and saying so is more useful
than a question that does.
