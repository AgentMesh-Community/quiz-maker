# Concepts asked badly and asked well

Nine concepts, taken from documents in this repo, each one asked twice. The bad
question in every pair is not broken. It has four choices, one right answer and
a place to cite, and it would pass the check step without a word of complaint.
It is the question that gets written when the source is open and the concept
has not been thought about. The good question tests the same concept and cannot
be answered by anybody who has not understood it.

Read these before writing. They are worth more than the rules in rules.md,
because a rule says what to avoid and a pair shows what to write.

The shape these are stored in is in references/shapes.md. Here they are set out
as they read. Each good question also says what each wrong choice is for, since
that is the part worth copying.

## A hold is not a charge

From the funds hold contract, `docs/funds-hold-contract.md`, under The
principle. For somebody who has deployed an agent and has never priced one.

The concept: money is set aside when the job starts and taken only when the
work is delivered.

Asked badly:

```
A hold is money that has been ____.
a. set aside
b. paid to the seller
c. refunded
d. invoiced
Answer: a. Because: a hold sets money aside.
```

The question contains the sentence its answer came from, minus one word.
Somebody scanning the first paragraph finds it in a second.

Asked well:

```
A job has started and the buyer sees the money they can spend drop by the
price of the job. What has happened to that money?
a. It has been paid to the seller, who now owes the buyer the work.
b. It is set aside, and taken when the work is delivered.
c. It has been returned from a job that was cancelled.
d. Nothing; the figure on the screen is out of date.
Answer: b. Because: a hold reserves the money while the job runs, and the
draw against it happens when the work is delivered.
```

The wrong choices: a is the same money one step later, and it catches somebody
who knows the money moved but not when; c is the same act in the other
direction, for somebody who has holding and releasing merged; d is for somebody
who believes only a charge can move a balance.

What changed: the good question describes something happening and asks what is
true, instead of quoting the source and asking for the missing word.

## The seller names the job, the platform names the amount

From the funds hold contract, the same page, the line that opens The principle
and the paragraph under it. For the same reader.

The concept: a seller asking to hold a buyer's money says which job it is, and
the platform works out how much, so the hold and the charge cannot disagree.

Asked badly:

```
The seller names the job. Who names the amount?
a. The seller
b. The platform
c. The buyer
d. Whoever funded the account
Answer: b. Because: the platform names the amount.
```

The question quotes half of a sentence and asks for the other half. Somebody
who has understood the rule answers no faster than somebody who has not.

Asked well:

```
A seller asks the platform to hold a buyer's money. It sends the buyer, the
SKU and the job id, and leaves the amount out. Why is the amount the
platform's to decide?
a. The price is settled only once the work has been delivered and rated.
b. The hold and the charge are priced from the same agreement.
c. The amount is in micro-units, which the seller does not use.
d. The seller has no sight of the buyer's balance, so it would be guessing.
Answer: b. Because: the platform holds the agreement and prices the charge
from it, so a hold priced anywhere else could disagree with the charge.
```

The wrong choices: a is the concept the source teaches next, that the draw
happens at delivery, which is true and is not the reason; c is a near miss on
the micro-unit sentence a few lines further down; d is the strongest of them,
because it is true and is still not the reason, and it catches somebody who
thinks the rule is about what a seller can see rather than about what a seller
may decide.

Where the answer came from and where to go back to: the answer is in the one
line that opens the section, and the place to go back to is the paragraph under
it. Reading the line again teaches somebody only that they misremembered it.
Reading the paragraph teaches them why it could not run the other way.

What changed: the good question puts the reader at the moment the rule bites
and asks for the reason, and the reason is nowhere in the question's words.

## An accept is not the answer

From the mesh specification, `SPEC.md` section 6.4a. For somebody sending their
first request.

The concept: an accept says the request arrived and passed the checks and a
handler is about to run, and the answer comes later.

Asked badly:

```
What does payload.status say on an accept?
a. accepted
b. working
c. submitted
d. queued
Answer: a. Because: the accept carries payload.status "accepted".
```

This asks for a spelling. Somebody who has never read the section can find it
by searching for the word status, and somebody who understands the accept
completely can miss it by misremembering a string.

Asked well:

```
A caller sends a request and, within a second, a reply comes back saying
accepted. What does the caller now know?
a. The work is finished, and the answer is in that reply.
b. The message arrived and a handler is about to run.
c. The message is held in a mailbox for a session to read later.
d. The recipient has agreed the price and will bill for it.
Answer: b. Because: the accept is sent at admission, before the handler runs,
so it says the request was delivered and nothing about the work.
```

The wrong choices: a is for somebody who reads any reply as the answer; c is
the queued acknowledgement, which is what a mailbox sends instead of an accept,
and it is the nearest true thing that is not this; d is for somebody who has
merged admission with the money gate.

What changed: the bad question tests a spelling, which understanding does not
protect against and a search finds. The good one tests the one thing an accept
means.

## What may follow an accept

The same page, for a different reader: somebody who has written an agent's
inbound path. The pair above tests nothing they do not already have, so they
are asked at the boundary instead.

The concept: a failure of the work may follow an accept, and a refusal to admit
the work may not, because a refusal is itself the first reply.

Asked badly:

```
Which two refusals happen instead of an accept rather than after one?
a. A protection refusal and a budget refusal
b. A protection refusal and a missing offering
c. A budget refusal and a missing offering
d. A missing offering and an invalid input
Answer: a. Because: those are the two the section names.
```

This asks for a pair of names out of a list. Somebody who has the boundary
exactly right and the two names half right gets it wrong, and somebody with the
page open gets it right.

Asked well:

```
An agent has sent an accept for a request. Which of these may still reach the
caller for that same request?
a. A refusal from the inbound checks the message did not pass.
b. A plain failure of the work that was admitted.
c. A budget refusal, because the deadline cannot be met.
d. A second accept, once the handler has restarted.
Answer: b. Because: admission has already happened by the time an accept goes
out, so what follows can only be the outcome of the work.
```

The wrong choices: a and c are the two refusals that happen instead of an
accept, and they catch somebody who reads the accept as a receipt rather than
as a statement that admission passed; d is for somebody who reads it as a
heartbeat that can repeat.

What changed: the question sits on the line this reader could actually be on
the wrong side of, and none of the choices can be matched against a sentence.

## Free work still forms an agreement

From the money plan, `docs/money-plan.md`, the two decisions, and the closing
section of the funds hold contract. For somebody who sets prices on agents.

The concept: free work forms an agreement worth nothing rather than skipping
the agreement, so every run leaves a record, and pricing that work later changes
a number instead of the shape of a run.

Asked badly:

```
What does free work get?
a. A zero-value agreement
b. An exemption from the gate
c. Nothing at all
d. A refund when the run ends
Answer: a. Because: free work gets a zero-value agreement.
```

The phrase is in bold in the source, and three of the choices are not answers
anybody would seriously give.

Asked well, as a written answer:

```
A run costs nothing. In your own words, why does it still form an agreement?
The answer a person should be able to give: so the run leaves the same record
a paid run leaves. Putting a price on that work later is then a change of
number and not a change of shape.
```

What changed: the concept is a reason, and a reason offered as four choices is
recognised rather than produced. The answer is two sentences, about the length
somebody would actually write, and it names the two things that had to be in
it: the record, and what the record buys later.

## A package is not an agent

From the Common Agent Specification, `docs/common-agent-spec-draft.md`, section
12.1. For somebody about to deploy their first agent.

The concept: a package carries no subject, so until it is installed there is
nobody to address.

Asked badly:

```
Which of these is not an agent?
a. A package
b. A bare agent
c. An agent that carries a package
d. An installed agent
Answer: a. Because: a package is not an agent.
```

Three of the four choices have the word agent in them. The question can be
answered by reading the choices and never the source.

Asked well:

```
A package has been published to a depot and its digest checked. Somebody wants
to send it a message. What stops them?
a. Nothing; a published package answers at the name it was published under.
b. It has no subject until an install gives it one.
c. It has not been signed, so its answers would be refused.
d. Its Descriptor is still a draft, so its offerings are not settled.
Answer: b. Because: an install is what gives a package a subject and a handle,
and until then there is nothing to address.
```

The wrong choices: a is for somebody who has taken the depot name for an
address; c merges binding with signing, which happen in the same act, so it is
a near miss rather than an invention; d notices the word draft and takes that
for the obstacle.

What changed: the good question asks what would happen if somebody tried, which
is the thing the distinction is for, and it does not let the choices carry the
answer.

## A written method is not handed to a model

From the same specification, section 12.3, the `how` member. For somebody
writing a package.

The concept: a step whose method is set out move by move is a program, and
giving it to a model to carry out is refused, because nothing checks that the
model followed it.

Asked badly:

```
Which combination of how does a checker refuse?
a. control: model with contract: full
b. control: script with contract: full
c. control: person with contract: ends
d. control: model with contract: goal
Answer: a. Because: that combination is refused.
```

The refused pair is printed in the section, and the question repeats it in the
same four words.

Asked well:

```
A builder writes a step whose method is set out move by move, and gives the
step to a model to carry out. The checker refuses the package. What is wrong?
a. Nothing checks that the model followed the written method.
b. A step a model carries out may not declare what it can spend.
c. A method set out move by move has to be run by a person.
d. A written method has to name the exact command the host runs for it.
Answer: a. Because: either the method is a program, and a program runs it, or
the step promises what comes out and not how.
```

The wrong choices: b is for somebody who has the four words of `how` but has
cost and contract merged; c reads the refusal as being about models rather than
about the method, which is the half-understanding that leads a builder to write
prose and hope; d is the neighbour, the member that names a command, which is
about a step that does have a program to point at.

What changed: the good question describes the mistake being made and asks what
is wrong with it, so the answer cannot be recognised from the words the section
prints.

## The Critic reports and the person asks for the change

From the process in `docs/explainer-chain-handoffs.md` and the Critic's rules
in `fleet-manager/agentbuilder/examples/explainer-critic/rules.md`. For somebody
about to run that process for the first time.

The concept: the Critic writes findings and does nothing else, and asking for a
change is the person's act.

Asked badly:

```
What does the Critic never do?
a. File a change
b. Write findings
c. Read the beat script
d. Play the draft
Answer: a. Because: the Critic reports and never files a change.
```

Three of the four are plainly the Critic's job, so the question answers itself
for anybody who has seen the page.

Asked well:

```
A review comes back with three findings and the person agrees with two of them.
What happens next?
a. The person names the steps to redo and asks for a revision.
b. The Critic sends the two findings on to the Explainer as a revision.
c. The run redoes every step the review named, the third finding with it.
d. The Critic records which findings the person rejected and closes.
Answer: a. Because: the Critic reports and never contacts the Explainer, so
asking for a change is the person's act and their choice of steps.
```

The wrong choices: b is the common wrong belief, that whoever found a fault
files it; c is for somebody who reads a review as an instruction rather than a
report; d has the Critic holding a state that no part of it holds.

What changed: the good question asks what happens next in a situation, so
answering it means knowing who acts. The bad one is answered by striking out
the three things the Critic obviously does.

## A revision redoes only what changed

From the Explainer's rules,
`fleet-manager/agentbuilder/examples/explainer-maker/rules.md`, under Revisions,
with the four sets listed in the Critic's rules. For somebody who has delivered
an explainer and is handling the first revision.

The concept: what is redone follows what changed, and a clip whose narration
did not change is reused.

Asked badly:

```
How many steps does a revision to the words redo?
a. Two
b. Three
c. Four
d. Five
Answer: d. Because: a change to the words redoes five steps.
```

This asks somebody to count a list they can see. Counting is not the concept,
and somebody who knows exactly which steps run can still miscount.

Asked well:

```
A revision changes the layout of one card and leaves every spoken word as it
was. What runs?
a. Write the story again, lay out the scenes, record the narration, check the
   fit, stage the draft.
b. Lay out the scenes, check the fit, stage the draft.
c. Lay out the scenes, stage the draft.
d. Stage the draft.
Answer: b. Because: the page changed, so the fit is checked again, and the
narration stands, so every clip is reused.
```

The wrong choices: a is for somebody who treats every revision as a remake,
which is the expensive mistake this rule exists to stop; c is for somebody who
reads the fit check as belonging to the words; d is the set for a draft that
was only stale.

What changed: the good question names a change and asks what it costs, which is
the decision somebody actually makes. The bad one asks for the length of a
list.

## What the nine have in common

Every good question above puts the reader inside a situation and asks what is
true there. None of them contains the words of its own answer. Every wrong
choice is somebody's honest mistake, named and placed on purpose, and for each
one it is possible to say in a sentence who picks it and why they are wrong.
That is the whole of it.
