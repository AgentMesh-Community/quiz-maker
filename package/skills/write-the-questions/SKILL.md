---
name: write-the-questions
description: when the concept list is settled and questions are wanted
---

# Write the questions

Part of quiz-maker. when the concept list is settled and questions are wanted

## When to use this

when the concept list is settled and questions are wanted

## What this needs

- concept list (text, required)
- reading (application/json, required)
- how many questions (identifier, optional)

## What a good result looks like

One or two questions per concept, each naming the concept it tests, the place in the source the answer came from, and the place to go back to when it is missed. Each question is either a choice of four with one right answer and one sentence saying why it is right, or a written answer with the answer a person should be able to give.

## What it produces

- quiz (application/json, per task)

## When it comes back empty

If a concept cannot be tested without asking somebody to recall a number or a name that does not matter, skip it and say in the coverage record that it was left and why.

## How to do it

Write one or two questions per concept. Each question carries the concept it tests, the place in the source the answer came from, the place to go back to when it is missed, and either four choices with one right answer and one sentence saying why, or the answer a person should be able to write.

Test understanding, not wording. A question whose answer can be found by matching words with the source tests reading. A wrong choice is a way somebody could actually be wrong about the concept, which is why the wrong choices are written from the concept's own sentence rather than made up.

The number of questions follows the concept list, not a target. When the person asked for a number and the concepts do not fill it, write the questions the concepts carry and say how many that was.

The questions are written one concept at a time, one call for each, with several concepts in the air at once. Every fault the check step names is a fault in one question, so a question that is refused is written again on its own and a question that passed is never touched again. A concept gets three goes and no more.

## References

- references/rules.md
- references/question-forms.md
- references/shapes.md
