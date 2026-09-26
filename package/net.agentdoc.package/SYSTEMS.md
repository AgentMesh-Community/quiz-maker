# The systems this agent needs

Named by what the work needs rather than by product. The access level
is the most this work needs; a deployment that grants more is granting
more than the job requires.

| System | Kind | Access | What the access is for |
|---|---|---|---|
| text-reasoning | service | trigger | to name the concepts the material teaches and write the questions that test them, which are the two judgments in this job; credential `text-reasoning-key`, spends per calls, the caller's material is sent to it |
| source-host | service | read | to open a page address the person gave and read its text; the address must open without a sign-in, and a credential pasted into a message is refused |
| draft-host | service | write | to place the quiz page and the quiz file where the person can open them; credential `draft-host-writer` |

Whoever deploys this agent binds these systems to their own,
and places any named credential. Nothing here names a product.
