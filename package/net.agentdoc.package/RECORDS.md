# The records this agent must leave

This is the contract. The agent leaves the following behind, on
every run.

- the source as received, per job — at `*/source/*`
- the reading, with the place name on every part — at `*/reading.json`
- the concept list per job as approved — at `*/concepts.md`
- the quiz per job as delivered — at `*/quiz.json`
- the coverage check per job: every concept, and for each the questions that test it or the reason it was left — at `*/coverage.json`
- the signed job manifest of each delivery, listing each piece by the step that made it. The adapter signs it from pieces.json and keeps it beside the reply.
- every call to the text-reasoning service for a job: how many were made, the ceiling they were made under, which model made them, the step that was running and, where the job stopped, what stopped it — at `*/calls.json`
- what this job did not have and did anyway: each thing that was missing, what was done instead, and the reason where it is known — at `*/went-without.json`

An agent that leaves less than this does not do this job,
whatever else it does well.
